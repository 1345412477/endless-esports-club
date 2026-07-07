const express = require('express');
const { getDb } = require('../db');
const { requireRole } = require('../middleware/auth');
const { logAction } = require('../utils/logger');
const { recalculateWorkerDeposit, getWorkerSettledTotal, getWorkerTotalSalary, round2 } = require('../utils/deposit');

const router = express.Router();

router.post('/', requireRole('admin'), (req, res) => {
  const { person_name, person_type, settled_amount } = req.body;
  if (!person_name || !person_type || settled_amount === undefined) {
    return res.status(400).json({ code: 1, data: null, message: '缺少必填字段' });
  }
  if (!['worker', 'cs'].includes(person_type)) {
    return res.status(400).json({ code: 1, data: null, message: '人员类型无效' });
  }
  const settledAmt = round2(settled_amount);
  if (settledAmt <= 0) {
    return res.status(400).json({ code: 1, data: null, message: '结算金额必须大于0' });
  }

  const db = getDb();

  let totalSalary;
  let currentDeposit = 0;
  if (person_type === 'worker') {
    const worker = db.prepare('SELECT deposit FROM config_workers WHERE name = ?').get(person_name);
    currentDeposit = worker ? round2(worker.deposit || 0) : 0;
    totalSalary = getWorkerTotalSalary(db, person_name);
  } else {
    const row = db.prepare(
      "SELECT COALESCE(SUM(cs_commission_amount), 0) as total FROM orders WHERE cs_name = ? AND status = '已结单'"
    ).get(person_name);
    totalSalary = round2(row.total);
  }

  const settledRow = db.prepare(
    'SELECT COALESCE(SUM(settled_amount), 0) as total FROM settlements WHERE person_name = ? AND person_type = ? AND reversed = 0'
  ).get(person_name, person_type);
  const settledTotal = round2(settledRow.total);

  const unsettled = round2(totalSalary - settledTotal - currentDeposit);
  if (settledAmt > unsettled + 0.01) {
    return res.status(400).json({ code: 1, data: null, message: `结算金额超出待结算余额，当前可结算：¥${unsettled.toFixed(2)}元（已扣除押金¥${currentDeposit.toFixed(2)}）` });
  }

  const txn = db.transaction(() => {
    db.prepare(
      'INSERT INTO settlements (person_name, person_type, settled_amount, settled_by) VALUES (?, ?, ?, ?)'
    ).run(person_name, person_type, settledAmt, req.user.username);

    if (person_type === 'worker') {
      recalculateWorkerDeposit(db, person_name);
    }
  });

  try {
    txn();
    const newSettledTotal = round2(settledTotal + settledAmt);
    const workerAfter = person_type === 'worker' ? db.prepare('SELECT deposit FROM config_workers WHERE name = ?').get(person_name) : null;
    const newDeposit = workerAfter ? round2(workerAfter.deposit || 0) : 0;
    const newUnsettled = round2(totalSalary - newSettledTotal - newDeposit);

    const typeLabel = person_type === 'worker' ? '员工' : '客服';
    logAction('工资结算', '工资结算', `${typeLabel}：${person_name}，结算金额：¥${settledAmt.toFixed(2)}${person_type === 'worker' ? `，当前押金：¥${newDeposit.toFixed(2)}` : ''}`, req.user.username);

    res.json({
      code: 0,
      data: { settled_amount: settledAmt, settled_total: newSettledTotal, unsettled: newUnsettled, deposit: newDeposit },
      message: 'ok',
    });
  } catch (e) {
    res.status(400).json({ code: 1, data: null, message: e.message });
  }
});

router.post('/deposit', requireRole('admin'), (req, res) => {
  const { worker_name } = req.body;
  if (!worker_name) {
    return res.status(400).json({ code: 1, data: null, message: '缺少必填字段' });
  }

  const db = getDb();

  const worker = db.prepare('SELECT * FROM config_workers WHERE name = ?').get(worker_name);
  if (!worker) {
    return res.status(400).json({ code: 1, data: null, message: '员工不存在' });
  }

  const currentDeposit = round2(worker.deposit || 0);
  if (currentDeposit <= 0) {
    return res.status(400).json({ code: 1, data: null, message: '该员工暂无押金可退' });
  }

  const txn = db.transaction(() => {
    db.prepare('UPDATE config_workers SET deposit = 0 WHERE name = ?').run(worker_name);
    db.prepare(
      'INSERT INTO settlements (person_name, person_type, settled_amount, settled_by, remark) VALUES (?, ?, ?, ?, ?)'
    ).run(worker_name, 'deposit_refund', currentDeposit, req.user.username, '押金全额退还（转入待结算）');
  });

  try {
    txn();
    logAction('押金全额退还', '工资结算', `员工：${worker_name}，退还押金：¥${currentDeposit.toFixed(2)}（转入待结算工资）`, req.user.username);

    res.json({
      code: 0,
      data: { deposit: 0, refunded_amount: currentDeposit },
      message: 'ok',
    });
  } catch (e) {
    res.status(400).json({ code: 1, data: null, message: e.message });
  }
});

router.post('/reverse/:id', requireRole('admin'), (req, res) => {
  const { id } = req.params;
  const db = getDb();

  const record = db.prepare('SELECT * FROM settlements WHERE id = ?').get(id);
  if (!record) {
    return res.status(404).json({ code: 1, data: null, message: '结算记录不存在' });
  }
  if (record.reversed === 1) {
    return res.status(400).json({ code: 1, data: null, message: '该记录已被撤销' });
  }
  if (record.person_type === 'deposit_refund') {
    return res.status(400).json({ code: 1, data: null, message: '押金退还记录不可撤销，请直接重新结算押金' });
  }

  const txn = db.transaction(() => {
    db.prepare(
      "UPDATE settlements SET reversed = 1, reversed_at = datetime('now','localtime') WHERE id = ?"
    ).run(id);

    if (record.person_type === 'worker') {
      recalculateWorkerDeposit(db, record.person_name);
    }
  });

  try {
    txn();
    const typeLabel = record.person_type === 'worker' ? '员工' : '客服';
    logAction('撤销结算', '工资结算', `${typeLabel}：${record.person_name}，撤销金额：¥${record.settled_amount}，原结算时间：${record.settled_at}`, req.user.username);

    res.json({ code: 0, data: null, message: 'ok' });
  } catch (e) {
    res.status(400).json({ code: 1, data: null, message: e.message });
  }
});

router.get('/history', requireRole('admin'), (req, res) => {
  const { person_name, person_type } = req.query;
  if (!person_name || !person_type) {
    return res.status(400).json({ code: 1, data: null, message: '缺少查询参数' });
  }
  const db = getDb();
  let records;
  if (person_type === 'worker') {
    records = db.prepare(
      "SELECT id, person_type, settled_amount, settled_by, remark, reversed, reversed_at, settled_at FROM settlements WHERE person_name = ? AND person_type IN ('worker', 'deposit_refund') ORDER BY settled_at DESC"
    ).all(person_name);
  } else {
    records = db.prepare(
      'SELECT id, person_type, settled_amount, settled_by, remark, reversed, reversed_at, settled_at FROM settlements WHERE person_name = ? AND person_type = ? ORDER BY settled_at DESC'
    ).all(person_name, person_type);
  }
  res.json({ code: 0, data: records, message: 'ok' });
});

// 直接修改结算记录金额（用于数据录入）
router.put('/record/:id', requireRole('admin'), (req, res) => {
  const { id } = req.params;
  const { settled_amount } = req.body;
  
  if (settled_amount === undefined || settled_amount === null) {
    return res.status(400).json({ code: 1, data: null, message: '缺少结算金额' });
  }
  
  const settledAmt = round2(settled_amount);
  if (settledAmt < 0) {
    return res.status(400).json({ code: 1, data: null, message: '结算金额不能为负数' });
  }
  
  const db = getDb();
  const record = db.prepare('SELECT * FROM settlements WHERE id = ?').get(id);
  
  if (!record) {
    return res.status(404).json({ code: 1, data: null, message: '结算记录不存在' });
  }
  
  if (record.reversed === 1) {
    return res.status(400).json({ code: 1, data: null, message: '已撤销的记录无法修改' });
  }
  
  if (record.person_type === 'deposit_refund') {
    return res.status(400).json({ code: 1, data: null, message: '押金退还记录不可修改' });
  }
  
  const oldAmount = record.settled_amount;
  
  const txn = db.transaction(() => {
    db.prepare('UPDATE settlements SET settled_amount = ? WHERE id = ?').run(settledAmt, id);
    
    if (record.person_type === 'worker') {
      recalculateWorkerDeposit(db, record.person_name);
    }
  });
  
  try {
    txn();
    const typeLabel = record.person_type === 'worker' ? '员工' : '客服';
    logAction('修改结算记录', '工资结算', `${typeLabel}：${record.person_name}，原金额：¥${oldAmount.toFixed(2)}，新金额：¥${settledAmt.toFixed(2)}`, req.user.username);
    
    res.json({ code: 0, data: null, message: 'ok' });
  } catch (e) {
    res.status(400).json({ code: 1, data: null, message: e.message });
  }
});

// 直接设置员工/客服的已结算总额（数据录入用）
// 编辑已结算时，创建结算记录，未结算和累计工资自动更新
router.put('/adjust-settled', requireRole('admin'), (req, res) => {
  const { person_name, person_type, target_settled } = req.body;
  if (!person_name || !person_type || target_settled === undefined) {
    return res.status(400).json({ code: 1, data: null, message: '缺少必填字段' });
  }
  const targetSettled = round2(target_settled);
  if (targetSettled < 0) {
    return res.status(400).json({ code: 1, data: null, message: '已结算金额不能为负数' });
  }

  const db = getDb();
  const currentSettled = getWorkerSettledTotal(db, person_name);
  const diff = round2(targetSettled - currentSettled);

  if (diff === 0) {
    return res.json({ code: 0, data: null, message: 'ok' });
  }

  db.transaction(() => {
    if (diff > 0) {
      db.prepare(
        'INSERT INTO settlements (person_name, person_type, settled_amount, settled_by, remark) VALUES (?, ?, ?, ?, ?)'
      ).run(person_name, person_type, diff, req.user.username, '数据录入调整');
    } else {
      db.prepare(
        'INSERT INTO settlements (person_name, person_type, settled_amount, settled_by, remark) VALUES (?, ?, ?, ?, ?)'
      ).run(person_name, person_type, diff, req.user.username, '数据录入调整（减少）');
    }

    if (person_type === 'worker') {
      recalculateWorkerDeposit(db, person_name);
    }
  })();

  const typeLabel = person_type === 'worker' ? '员工' : '客服';
  logAction('修改已结算', '工资结算', `${typeLabel}：${person_name}，目标已结算：¥${targetSettled.toFixed(2)}`, req.user.username);
  res.json({ code: 0, data: null, message: 'ok' });
});

// 直接修改员工未结算金额（数据录入用）
// 未结算独立存储在 manual_unsettled 字段
router.put('/worker-unsettled', requireRole('admin'), (req, res) => {
  const { worker_name, unsettled } = req.body;
  if (!worker_name || unsettled === undefined) {
    return res.status(400).json({ code: 1, data: null, message: '缺少必填字段' });
  }
  const unsettledAmt = round2(unsettled);
  if (unsettledAmt < 0) {
    return res.status(400).json({ code: 1, data: null, message: '未结算金额不能为负数' });
  }

  const db = getDb();
  const worker = db.prepare('SELECT deposit, manual_unsettled FROM config_workers WHERE name = ?').get(worker_name);
  if (!worker) {
    return res.status(404).json({ code: 1, data: null, message: '员工不存在' });
  }

  db.transaction(() => {
    db.prepare('UPDATE config_workers SET manual_unsettled = ? WHERE name = ?').run(unsettledAmt, worker_name);
  })();

  logAction('修改未结算', '工资结算', `员工：${worker_name}，目标未结算：¥${unsettledAmt.toFixed(2)}`, req.user.username);
  res.json({ code: 0, data: null, message: 'ok' });
});

// 直接修改员工押金（数据录入用）
// 编辑押金时，未结算和累计工资自动更新
router.put('/worker-deposit', requireRole('admin'), (req, res) => {
  const { worker_name, deposit } = req.body;
  if (!worker_name || deposit === undefined) {
    return res.status(400).json({ code: 1, data: null, message: '缺少必填字段' });
  }
  const depositAmt = round2(deposit);
  if (depositAmt < 0) {
    return res.status(400).json({ code: 1, data: null, message: '押金不能为负数' });
  }

  const db = getDb();
  const worker = db.prepare('SELECT deposit FROM config_workers WHERE name = ?').get(worker_name);
  if (!worker) {
    return res.status(404).json({ code: 1, data: null, message: '员工不存在' });
  }

  const oldDeposit = round2(worker.deposit || 0);

  db.transaction(() => {
    db.prepare('UPDATE config_workers SET deposit = ? WHERE name = ?').run(depositAmt, worker_name);
  })();

  logAction('修改押金', '工资结算', `员工：${worker_name}，原押金：¥${oldDeposit.toFixed(2)}，新押金：¥${depositAmt.toFixed(2)}`, req.user.username);
  res.json({ code: 0, data: null, message: 'ok' });
});

module.exports = router;
