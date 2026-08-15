const express = require('express');
const { getDb } = require('../db');
const { success, badRequest } = require('../utils/response');
const { calcDepositFromOrders, calcUnsettled, round2, getWorkerReferrerCommission, getCsReferrerCommission } = require('../utils/deposit');

const router = express.Router();

router.get('/worker', (req, res) => {
  const { name, page = 1, size = 20, month, search, sort } = req.query;
  if (!name) {
    return badRequest(res, '请输入姓名');
  }

  const db = getDb();
  const offset = (Number(page) - 1) * Number(size);
  const limit = Number(size);

  const worker = db.prepare('SELECT * FROM config_workers WHERE name = ? AND status = ?').get(name, '在店');
  if (!worker) {
    return success(res, { type: null, message: '未找到该人员信息' });
  }

  const sortMap = {
    date_desc: 'created_at DESC',
    date_asc: 'created_at ASC',
    price_desc: 'price DESC',
    price_asc: 'price ASC',
    salary_desc: 'salary DESC',
    salary_asc: 'salary ASC',
  };
  const orderBy = sortMap[sort] || sortMap.date_desc;

  const extraWhere = [];
  const extraParams = [];
  if (month) {
    extraWhere.push("strftime('%Y-%m', created_at) = ?");
    extraParams.push(month);
  }
  if (search) {
    extraWhere.push('(customer_name LIKE ? OR order_type LIKE ? OR cs_name LIKE ?)');
    const like = `%${search}%`;
    extraParams.push(like, like, like);
  }
  const extraClause = extraWhere.length > 0 ? ' AND ' + extraWhere.join(' AND ') : '';

  const workerOrdersSql = `
    SELECT o.id, o.order_type, o.customer_name, o.price, o.cs_name,
           o.created_at, o.serial_no,
           CAST(o.price / (SELECT COUNT(*) FROM order_workers WHERE order_id = o.id) - ow.deduction_amount AS REAL) as salary,
           0 as is_referrer,
           '' as referrer_note
    FROM order_workers ow
    JOIN orders o ON ow.order_id = o.id
    WHERE ow.worker_name = ? AND o.status = '已结单'
  `;

  const referrerOrdersSql = `
    SELECT o.id, o.order_type, o.customer_name, o.price, o.cs_name,
           o.created_at, o.serial_no,
           o.referrer_amount as salary,
           1 as is_referrer,
           '推荐提成' as referrer_note
    FROM orders o
    WHERE o.referrer_name = ? AND o.referrer_type = 'worker' AND o.status = '已结单'
  `;

  const countWorkerRow = db.prepare(`SELECT COUNT(*) as cnt FROM (${workerOrdersSql})`).get(name);
  const countReferrerRow = db.prepare(`SELECT COUNT(*) as cnt FROM (${referrerOrdersSql})`).get(name);
  const totalCount = (countWorkerRow.cnt || 0) + (countReferrerRow.cnt || 0);

  const monthsSet = new Set();
  const workerMonths = db.prepare(`
    SELECT DISTINCT strftime('%Y-%m', o.created_at) as m FROM order_workers ow
    JOIN orders o ON ow.order_id = o.id WHERE ow.worker_name = ? AND o.status = '已结单'
  `).all(name);
  workerMonths.forEach(r => monthsSet.add(r.m));
  const referrerMonths = db.prepare(`
    SELECT DISTINCT strftime('%Y-%m', created_at) as m FROM orders
    WHERE referrer_name = ? AND referrer_type = 'worker' AND status = '已结单'
  `).all(name);
  referrerMonths.forEach(r => monthsSet.add(r.m));
  const months = Array.from(monthsSet).sort().reverse();

  const allOrdersUnion = `
    SELECT * FROM (${workerOrdersSql})
    UNION ALL
    SELECT * FROM (${referrerOrdersSql})
  `;

  const orders = db.prepare(`
    SELECT * FROM (${allOrdersUnion})
    WHERE 1=1${extraClause}
    ORDER BY ${orderBy}
    LIMIT ? OFFSET ?
  `).all(name, name, ...extraParams, limit, offset);

  const filteredAgg = db.prepare(`
    SELECT COUNT(*) as count, COALESCE(SUM(salary), 0) as salary
    FROM (${allOrdersUnion})
    WHERE 1=1${extraClause}
  `).get(name, name, ...extraParams);

  const orderSalaryRow = db.prepare(`
    SELECT COALESCE(SUM(CAST(o.price / (SELECT COUNT(*) FROM order_workers WHERE order_id = o.id) - ow.deduction_amount AS REAL)), 0) as total
    FROM order_workers ow JOIN orders o ON ow.order_id = o.id
    WHERE ow.worker_name = ? AND o.status = '已结单'
  `).get(name);
  const workerOrderSalary = round2(orderSalaryRow.total);
  const referrerCommission = getWorkerReferrerCommission(db, name);
  const totalOrderSalary = round2(workerOrderSalary + referrerCommission);

  const settledRow = db.prepare(
    "SELECT COALESCE(SUM(settled_amount), 0) as total FROM settlements WHERE person_name = ? AND person_type = 'worker' AND reversed = 0"
  ).get(name);
  const settledTotal = round2(settledRow.total);

  const monthWorkerRow = db.prepare(`
    SELECT COUNT(*) as cnt, COALESCE(SUM(CAST(o.price / (SELECT COUNT(*) FROM order_workers WHERE order_id = o.id) - ow.deduction_amount AS REAL)), 0) as salary
    FROM order_workers ow JOIN orders o ON ow.order_id = o.id
    WHERE ow.worker_name = ? AND o.status = '已结单'
      AND strftime('%Y-%m', o.created_at) = strftime('%Y-%m', 'now', 'localtime')
  `).get(name);
  const monthReferrerRow = db.prepare(`
    SELECT COALESCE(SUM(referrer_amount), 0) as commission FROM orders
    WHERE referrer_name = ? AND referrer_type = 'worker' AND status = '已结单'
      AND strftime('%Y-%m', created_at) = strftime('%Y-%m', 'now', 'localtime')
  `).get(name);
  const monthCount = (monthWorkerRow.cnt || 0);
  const monthSalary = round2((monthWorkerRow.salary || 0) + (monthReferrerRow.commission || 0));

  const settlements = db.prepare(
    "SELECT id, settled_amount, settled_by, remark, reversed, settled_at FROM settlements WHERE person_name = ? AND person_type = ? AND reversed = 0 ORDER BY settled_at DESC"
  ).all(name, 'worker');

  const deposit = worker.deposit || 0;
  const depositTarget = worker.deposit_target || 0;
  const manualUnsettled = worker.manual_unsettled || 0;
  const depositBase = worker.manual_deposit_base || 0;
  const depositFromOrders = calcDepositFromOrders(deposit, depositBase);

  success(res, {
    type: 'worker',
    worker: { name, default_deduction_rate: worker.default_deduction_rate, rating: worker.rating, status: worker.status, deposit: deposit, deposit_target: depositTarget },
    summary: {
      completed_count: totalCount,
      unsettled: calcUnsettled(totalOrderSalary, manualUnsettled, settledTotal, depositFromOrders),
      total_salary: Math.max(0, totalOrderSalary + manualUnsettled - depositFromOrders) + deposit,
      settled_total: settledTotal,
      deposit: deposit,
      deposit_target: depositTarget,
      month_count: monthCount,
      month_salary: monthSalary,
      referrer_commission: referrerCommission,
    },
    filtered_summary: {
      count: filteredAgg.count || 0,
      salary: round2(filteredAgg.salary || 0),
    },
    months,
    orders,
    settlements,
    total: totalCount,
    page: Number(page),
    size: Number(size),
  });
});

router.get('/cs', (req, res) => {
  const { name, page = 1, size = 20, month, search, sort } = req.query;
  if (!name) {
    return badRequest(res, '请输入姓名');
  }

  const db = getDb();
  const offset = (Number(page) - 1) * Number(size);
  const limit = Number(size);

  const cs = db.prepare('SELECT * FROM config_cs WHERE name = ? AND active = 1').get(name);
  if (!cs) {
    return success(res, { type: null, message: '未找到该人员信息' });
  }

  const sortMap = {
    date_desc: 'created_at DESC',
    date_asc: 'created_at ASC',
    price_desc: 'price DESC',
    price_asc: 'price ASC',
    salary_desc: 'salary DESC',
    salary_asc: 'salary ASC',
  };
  const orderBy = sortMap[sort] || sortMap.date_desc;

  const extraWhere = [];
  const extraParams = [];
  if (month) {
    extraWhere.push("strftime('%Y-%m', created_at) = ?");
    extraParams.push(month);
  }
  if (search) {
    extraWhere.push('(customer_name LIKE ? OR order_type LIKE ?)');
    const like = `%${search}%`;
    extraParams.push(like, like);
  }
  const extraClause = extraWhere.length > 0 ? ' AND ' + extraWhere.join(' AND ') : '';

  const csOrdersSql = `
    SELECT id, order_type, customer_name, price, cs_name,
           created_at, serial_no,
           cs_commission_amount as salary,
           0 as is_referrer,
           '' as referrer_note
    FROM orders
    WHERE cs_name = ? AND status = '已结单'
  `;

  const csReferrerOrdersSql = `
    SELECT id, order_type, customer_name, price, cs_name,
           created_at, serial_no,
           referrer_amount as salary,
           1 as is_referrer,
           '推荐提成' as referrer_note
    FROM orders
    WHERE referrer_name = ? AND referrer_type = 'cs' AND status = '已结单'
  `;

  const countCsRow = db.prepare(`SELECT COUNT(*) as cnt FROM (${csOrdersSql})`).get(name);
  const countRefRow = db.prepare(`SELECT COUNT(*) as cnt FROM (${csReferrerOrdersSql})`).get(name);
  const totalCount = (countCsRow.cnt || 0) + (countRefRow.cnt || 0);

  const monthsSet = new Set();
  const csMonths = db.prepare(`
    SELECT DISTINCT strftime('%Y-%m', created_at) as m FROM orders WHERE cs_name = ? AND status = '已结单'
  `).all(name);
  csMonths.forEach(r => monthsSet.add(r.m));
  const refMonths = db.prepare(`
    SELECT DISTINCT strftime('%Y-%m', created_at) as m FROM orders WHERE referrer_name = ? AND referrer_type = 'cs' AND status = '已结单'
  `).all(name);
  refMonths.forEach(r => monthsSet.add(r.m));
  const months = Array.from(monthsSet).sort().reverse();

  const allOrdersUnion = `
    SELECT * FROM (${csOrdersSql})
    UNION ALL
    SELECT * FROM (${csReferrerOrdersSql})
  `;

  const orders = db.prepare(`
    SELECT * FROM (${allOrdersUnion})
    WHERE 1=1${extraClause}
    ORDER BY ${orderBy}
    LIMIT ? OFFSET ?
  `).all(name, name, ...extraParams, limit, offset);

  const filteredAgg = db.prepare(`
    SELECT COUNT(*) as count, COALESCE(SUM(salary), 0) as salary
    FROM (${allOrdersUnion})
    WHERE 1=1${extraClause}
  `).get(name, name, ...extraParams);

  const csBaseRow = db.prepare(
    "SELECT COUNT(*) as cnt, COALESCE(SUM(cs_commission_amount), 0) as total FROM orders WHERE cs_name = ? AND status = '已结单'"
  ).get(name);
  const referrerCommission = getCsReferrerCommission(db, name);
  const totalSalary = round2((csBaseRow.total || 0) + referrerCommission);
  const orderCount = (csBaseRow.cnt || 0) + (countRefRow.cnt || 0);

  const settledRow = db.prepare(
    "SELECT COALESCE(SUM(s.settled_amount), 0) as total FROM settlements s WHERE s.person_name = ? AND s.person_type = 'cs' AND s.reversed = 0"
  ).get(name);
  const settledTotal = round2(settledRow.total);

  const monthCsRow = db.prepare(`
    SELECT COALESCE(SUM(cs_commission_amount), 0) as salary FROM orders
    WHERE cs_name = ? AND status = '已结单'
      AND strftime('%Y-%m', created_at) = strftime('%Y-%m', 'now', 'localtime')
  `).get(name);
  const monthRefRow = db.prepare(`
    SELECT COALESCE(SUM(referrer_amount), 0) as commission FROM orders
    WHERE referrer_name = ? AND referrer_type = 'cs' AND status = '已结单'
      AND strftime('%Y-%m', created_at) = strftime('%Y-%m', 'now', 'localtime')
  `).get(name);
  const monthSalary = round2((monthCsRow.salary || 0) + (monthRefRow.commission || 0));

  const settlements = db.prepare(
    "SELECT id, settled_amount, settled_by, remark, reversed, settled_at FROM settlements WHERE person_name = ? AND person_type = ? AND reversed = 0 ORDER BY settled_at DESC"
  ).all(name, 'cs');

  success(res, {
    type: 'cs',
    cs: { name },
    summary: {
      order_count: orderCount,
      total_salary: totalSalary,
      settled_total: settledTotal,
      unsettled: round2(Math.max(0, totalSalary - settledTotal)),
      month_salary: monthSalary,
      referrer_commission: referrerCommission,
    },
    filtered_summary: {
      count: filteredAgg.count || 0,
      salary: round2(filteredAgg.salary || 0),
    },
    months,
    orders,
    settlements,
    total: totalCount,
    page: Number(page),
    size: Number(size),
  });
});

module.exports = router;
