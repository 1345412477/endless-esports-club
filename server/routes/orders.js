const express = require('express');
const { getDb } = require('../db');
const { requireRole } = require('../middleware/auth');
const { logAction } = require('../utils/logger');
const { recalculateWorkersDeposit, canOrderStatusChange } = require('../utils/deposit');
const { ORDER_STATUSES, ORDER_SETTLED_STATUS, WORKER_ACTIVE_STATUS, DEFAULT_CS_COMMISSION_RATE } = require('../utils/constants');
const { success, badRequest, notFound, forbidden } = require('../utils/response');

const router = express.Router();

const VALID_STATUSES = ORDER_STATUSES;

function generateSerialNo(db) {
  const today = new Date();
  const year = today.getFullYear();
  const month = today.getMonth() + 1; // no padding
  const day = String(today.getDate()).padStart(2, '0');
  const dateKey = `${year}${month}${day}`;
  const prefix = `WJ${dateKey}`;

  const seqRow = db.prepare('SELECT next_seq FROM order_serial_seq WHERE date_key = ?').get(dateKey);
  const seq = seqRow ? seqRow.next_seq : 1;

  db.prepare('INSERT OR REPLACE INTO order_serial_seq (date_key, next_seq) VALUES (?, ?)').run(dateKey, seq + 1);

  return `${prefix}${String(seq).padStart(4, '0')}`;
}

function orderTag(order) {
  const parts = [`订单#${order.id}`];
  if (order.serial_no) parts.push(`流水号：${order.serial_no}`);
  if (order.order_type) parts.push(`类型：${order.order_type}`);
  if (order.customer_name) parts.push(`客户：${order.customer_name}`);
  return parts.join('，');
}

router.post('/', requireRole('cs', 'admin'), (req, res) => {
  let { cs_name, order_type, customer_name, remark, price, workers } = req.body;

  if (req.user.role === 'cs') {
    cs_name = req.user.csName;
  }

  if (!cs_name) {
    return badRequest(res, '请选择客服');
  }
  if (!order_type || !price || !workers || !Array.isArray(workers)) {
    return badRequest(res, '缺少必填字段');
  }
  if (workers.length < 1 || workers.length > 2) {
    return badRequest(res, '关联员工数量为1-2人');
  }
  if (price <= 0) {
    return badRequest(res, '单子价格必须大于0');
  }

  const workerNames = workers.map(w => w.name);
  if (new Set(workerNames).size !== workerNames.length) {
    return badRequest(res, '员工不能重复');
  }

  const db = getDb();

  const csRow = db.prepare(
    'SELECT id, commission_rate FROM config_cs WHERE name = ? AND active = 1'
  ).get(cs_name);
  if (!csRow) {
    return badRequest(res, '客服不存在或已禁用');
  }
  const csCommissionRate = csRow.commission_rate != null ? csRow.commission_rate : DEFAULT_CS_COMMISSION_RATE;

  for (const w of workers) {
    const ex = db.prepare(
      'SELECT default_deduction_rate FROM config_workers WHERE name = ? AND status = ?'
    ).get(w.name, WORKER_ACTIVE_STATUS);
    if (!ex) {
      return badRequest(res, `员工 ${w.name} 不存在或已禁用`);
    }
    w._deduction_rate = w.deduction_rate !== undefined ? w.deduction_rate : ex.default_deduction_rate;
    if (w._deduction_rate < 0 || w._deduction_rate > 1) {
      return badRequest(res, '被抽成比例必须在0-1之间');
    }
  }

  const csCommissionAmount = price * csCommissionRate;
  const workerCount = workers.length;

  const insertOrder = db.prepare(`
    INSERT INTO orders (serial_no, cs_name, order_type, customer_name, remark, price, status, cs_commission_rate, cs_commission_amount)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const insertWorker = db.prepare(`
    INSERT INTO order_workers (order_id, worker_name, deduction_rate, deduction_amount)
    VALUES (?, ?, ?, ?)
  `);

  const txn = db.transaction(() => {
    const serialNo = generateSerialNo(db);
    const result = insertOrder.run(serialNo, cs_name, order_type, customer_name || '', remark || '', price, '接单中', csCommissionRate, csCommissionAmount);
    const orderId = result.lastInsertRowid;

    for (const w of workers) {
      const deductionAmount = (price / workerCount) * w._deduction_rate;
      insertWorker.run(orderId, w.name, w._deduction_rate, deductionAmount);
    }
    return { orderId, serialNo };
  });

  const { orderId, serialNo } = txn();
  const customerPart = customer_name ? `，客户：${customer_name}` : '';
  logAction('创建订单', '订单管理', `订单#${orderId}，流水号：${serialNo}，客服：${cs_name}，类型：${order_type}${customerPart}，金额：¥${price}，员工：${workers.map(w => w.name).join('、')}`, req.user.username);
  success(res, { id: orderId, serial_no: serialNo });
});

router.get('/', requireRole('cs', 'admin', 'manager'), (req, res) => {
  const db = getDb();
  const { status, cs_name, date, date_from, date_to, page = 1, size = 20 } = req.query;
  const offset = (Number(page) - 1) * Number(size);
  const limit = Number(size);

  let where = [];
  let params = [];

  if (cs_name) {
    where.push('o.cs_name = ?');
    params.push(cs_name);
  }

  if (status) {
    where.push('o.status = ?');
    params.push(status);
  }
  if (date) {
    where.push("date(o.created_at) = date(?)");
    params.push(date);
  }
  if (date_from) {
    where.push("date(o.created_at) >= date(?)");
    params.push(date_from);
  }
  if (date_to) {
    where.push("date(o.created_at) <= date(?)");
    params.push(date_to);
  }

  const whereClause = where.length > 0 ? 'WHERE ' + where.join(' AND ') : '';

  const countRow = db.prepare(`SELECT COUNT(*) as total FROM orders o ${whereClause}`).get(...params);
  const orders = db.prepare(
    `SELECT o.* FROM orders o ${whereClause} ORDER BY o.created_at DESC LIMIT ? OFFSET ?`
  ).all(...params, limit, offset);

  for (const order of orders) {
    order.workers = db.prepare(
      'SELECT worker_name, deduction_rate, deduction_amount FROM order_workers WHERE order_id = ?'
    ).all(order.id);
  }

  success(res, { list: orders, total: countRow.total, page: Number(page), size: Number(size) });
});

router.put('/:id/status', requireRole('cs', 'admin'), (req, res) => {
  const { id } = req.params;
  const { status } = req.body;
  if (!VALID_STATUSES.includes(status)) {
    return badRequest(res, '无效的状态值');
  }
  const db = getDb();
  const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(id);
  if (!order) {
    return notFound(res, '单据不存在');
  }

  if (order.status === ORDER_SETTLED_STATUS && status !== ORDER_SETTLED_STATUS) {
    const check = canOrderStatusChange(db, id);
    if (!check.ok) {
      return badRequest(res, check.message);
    }
  }

  const txn = db.transaction(() => {
    db.prepare("UPDATE orders SET status = ?, updated_at = datetime('now','localtime') WHERE id = ?").run(status, id);

    if (status === ORDER_SETTLED_STATUS || (order.status === ORDER_SETTLED_STATUS && status !== ORDER_SETTLED_STATUS)) {
      const workers = db.prepare('SELECT worker_name FROM order_workers WHERE order_id = ?').all(id);
      recalculateWorkersDeposit(db, workers.map(w => w.worker_name));
    }
  });

  try {
    txn();
    logAction('订单状态变更', '订单管理', `${orderTag(order)}，状态：${order.status} → ${status}`, req.user.username);
    success(res, null);
  } catch (e) {
    badRequest(res, e.message);
  }
});

router.put('/:id', requireRole('cs', 'admin'), (req, res) => {
  const { id } = req.params;
  const { order_type, customer_name, remark, price, workers } = req.body;
  const db = getDb();
  const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(id);
  if (!order) {
    return notFound(res, '单据不存在');
  }

  if (req.user.role === 'admin' && order.status === ORDER_SETTLED_STATUS) {
    return badRequest(res, '管理员无法编辑已结单订单');
  }

  const oldWorkers = db.prepare('SELECT worker_name, deduction_rate, deduction_amount FROM order_workers WHERE order_id = ?').all(id);
  const logChanges = [];

  if (order_type !== undefined && String(order_type) !== (order.order_type || '')) {
    logChanges.push(`类型："${order.order_type || ''}" → "${order_type || ''}"`);
  }
  if (customer_name !== undefined && String(customer_name) !== (order.customer_name || '')) {
    logChanges.push(`客户名："${order.customer_name || ''}" → "${customer_name || ''}"`);
  }
  if (remark !== undefined && String(remark) !== (order.remark || '')) {
    const oldR = order.remark || '';
    const newR = remark || '';
    logChanges.push(`备注："${oldR}" → "${newR}"`);
  }
  if (price !== undefined && Number(price) !== Number(order.price)) {
    logChanges.push(`金额：¥${order.price} → ¥${price}`);
  }

  let newWorkerList = null;
  let workersChanged = false;
  if (workers && Array.isArray(workers) && workers.length >= 1 && workers.length <= 2) {
    const oldNames = oldWorkers.map(w => w.worker_name).sort().join('、');
    const newNames = workers.map(w => w.name).sort().join('、');
    if (oldNames !== newNames) {
      logChanges.push(`员工：${oldNames || '无'} → ${newNames}`);
      workersChanged = true;
    }
    const oldRates = oldWorkers.map(w => `${w.worker_name}:${(w.deduction_rate * 100).toFixed(0)}%`).sort().join('、');
    newWorkerList = [];
    for (const w of workers) {
      const oldW = oldWorkers.find(ow => ow.worker_name === w.name);
      let rate;
      if (w.deduction_rate !== undefined) {
        rate = w.deduction_rate;
      } else if (oldW) {
        rate = oldW.deduction_rate;
      } else {
        const defaultRate = db.prepare(
          'SELECT default_deduction_rate FROM config_workers WHERE name = ? AND status = ?'
        ).get(w.name, WORKER_ACTIVE_STATUS);
        if (!defaultRate) {
          throw new Error(`员工 ${w.name} 不存在或已禁用`);
        }
        rate = defaultRate.default_deduction_rate;
      }
      if (rate < 0 || rate > 1) {
        throw new Error('被抽成比例必须在0-1之间');
      }
      newWorkerList.push({ name: w.name, rate });
    }
    const newRates = newWorkerList.map(w => `${w.name}:${(w.rate * 100).toFixed(0)}%`).sort().join('、');
    if (oldRates !== newRates && oldNames === newNames) {
      logChanges.push(`抽成：${oldRates} → ${newRates}`);
      workersChanged = true;
    }
  }

  const priceChanged = price !== undefined && Number(price) !== Number(order.price);
  const wasSettled = order.status === ORDER_SETTLED_STATUS;
  const needRecalc = wasSettled && (priceChanged || workersChanged);

  if (needRecalc) {
    const affectedWorkers = new Set([...oldWorkers.map(w => w.worker_name), ...(newWorkerList ? newWorkerList.map(w => w.name) : [])]);
    const check = canOrderStatusChange(db, id);
    if (!check.ok) {
      return badRequest(res, '无法编辑已结单：' + check.message);
    }
  }

  const txn = db.transaction(() => {
    const updates = [];
    const updateParams = [];
    if (order_type !== undefined) {
      updates.push('order_type = ?');
      updateParams.push(order_type);
    }
    if (customer_name !== undefined) {
      updates.push('customer_name = ?');
      updateParams.push(customer_name);
    }
    if (remark !== undefined) {
      updates.push('remark = ?');
      updateParams.push(remark);
    }
    if (price !== undefined) {
      if (price <= 0) {
        throw new Error('单子价格必须大于0');
      }
      updates.push('price = ?');
      updateParams.push(price);
      const csAmount = price * order.cs_commission_rate;
      updates.push('cs_commission_amount = ?');
      updateParams.push(csAmount);
    }
    updates.push("updated_at = datetime('now','localtime')");
    updateParams.push(id);
    db.prepare(`UPDATE orders SET ${updates.join(', ')} WHERE id = ?`).run(...updateParams);

    if (newWorkerList && workersChanged) {
      db.prepare('DELETE FROM order_workers WHERE order_id = ?').run(id);
      const insertWorker = db.prepare(
        'INSERT INTO order_workers (order_id, worker_name, deduction_rate, deduction_amount) VALUES (?, ?, ?, ?)'
      );
      const finalPrice = price !== undefined ? price : order.price;
      for (const w of newWorkerList) {
        const deductionAmount = (finalPrice / newWorkerList.length) * w.rate;
        insertWorker.run(id, w.name, w.rate, deductionAmount);
      }
    }

    if (needRecalc) {
      const affectedWorkers = new Set([...oldWorkers.map(w => w.worker_name)]);
      if (newWorkerList) newWorkerList.forEach(w => affectedWorkers.add(w.name));
      recalculateWorkersDeposit(db, [...affectedWorkers]);
    }
  });

  try {
    txn();
    const detail = logChanges.length > 0
      ? `${orderTag(order)}，${logChanges.join('，')}`
      : `${orderTag(order)}，无实际变更`;
    logAction('编辑订单', '订单管理', detail, req.user.username);
    success(res, null);
  } catch (e) {
    badRequest(res, e.message);
  }
});

router.delete('/:id', requireRole('cs', 'admin'), (req, res) => {
  const { id } = req.params;
  const db = getDb();
  const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(id);
  if (!order) {
    return notFound(res, '单据不存在');
  }

  if (req.user.role === 'admin' && order.status === ORDER_SETTLED_STATUS) {
    return badRequest(res, '管理员无法删除已结单订单');
  }

  const workers = db.prepare('SELECT worker_name FROM order_workers WHERE order_id = ?').all(id);
  const wasSettled = order.status === ORDER_SETTLED_STATUS;

  if (wasSettled && req.user.role === 'cs') {
    const check = canOrderStatusChange(db, id);
    if (!check.ok) {
      return badRequest(res, '无法删除已结单：' + check.message);
    }
  }

  const txn = db.transaction(() => {
    db.prepare('DELETE FROM order_workers WHERE order_id = ?').run(id);
    db.prepare('DELETE FROM orders WHERE id = ?').run(id);
    if (wasSettled) {
      recalculateWorkersDeposit(db, workers.map(w => w.worker_name));
    }
  });

  try {
    txn();
    logAction('删除订单', '订单管理', `${orderTag(order)}，状态：${order.status}，金额：¥${order.price}`, req.user.username);
    success(res, null);
  } catch (e) {
    badRequest(res, e.message);
  }
});

module.exports = router;
