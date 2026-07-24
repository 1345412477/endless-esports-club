const express = require('express');
const { getDb } = require('../db');
const { success, badRequest } = require('../utils/response');
const { calcDepositFromOrders, calcUnsettled } = require('../utils/deposit');

const router = express.Router();

router.get('/worker', (req, res) => {
  const { name, page = 1, size = 20 } = req.query;
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

  const countRow = db.prepare(`
    SELECT COUNT(*) as total FROM order_workers ow
    JOIN orders o ON ow.order_id = o.id
    WHERE ow.worker_name = ? AND o.status = '已结单'
  `).get(name);

  const orders = db.prepare(`
    SELECT o.id, o.order_type, o.customer_name, o.price, o.cs_name,
           o.created_at, o.cs_commission_rate, o.cs_commission_amount,
           ow.deduction_rate, ow.deduction_amount,
           CAST(o.price / (SELECT COUNT(*) FROM order_workers WHERE order_id = o.id) - ow.deduction_amount AS REAL) as salary
    FROM order_workers ow
    JOIN orders o ON ow.order_id = o.id
    WHERE ow.worker_name = ? AND o.status = '已结单'
    ORDER BY o.created_at DESC
    LIMIT ? OFFSET ?
  `).all(name, limit, offset);

  const agg = db.prepare(`
    SELECT
      COUNT(*) as completed_count,
      COALESCE(SUM(CAST(o.price / (SELECT COUNT(*) FROM order_workers WHERE order_id = o.id) - ow.deduction_amount AS REAL)), 0) as total_salary,
      COALESCE((SELECT SUM(s.settled_amount) FROM settlements s WHERE s.person_name = ? AND s.person_type = 'worker' AND s.reversed = 0), 0) as settled_total
    FROM order_workers ow
    JOIN orders o ON ow.order_id = o.id
    WHERE ow.worker_name = ? AND o.status = '已结单'
  `).get(name, name);

  const aggMonth = db.prepare(`
    SELECT COUNT(*) as month_count
    FROM order_workers ow
    JOIN orders o ON ow.order_id = o.id
    WHERE ow.worker_name = ? AND o.status = '已结单'
      AND strftime('%Y-%m', o.created_at) = strftime('%Y-%m', 'now', 'localtime')
  `).get(name);

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
      completed_count: agg.completed_count,
      unsettled: calcUnsettled(agg.total_salary, manualUnsettled, agg.settled_total, depositFromOrders),
      total_salary: Math.max(0, agg.total_salary + manualUnsettled - depositFromOrders) + deposit,
      settled_total: agg.settled_total,
      deposit: deposit,
      deposit_target: depositTarget,
      month_count: aggMonth.month_count,
    },
    orders,
    settlements,
    total: countRow.total,
    page: Number(page),
    size: Number(size),
  });
});

router.get('/cs', (req, res) => {
  const { name, page = 1, size = 20 } = req.query;
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

  const countRow = db.prepare(
    "SELECT COUNT(*) as total FROM orders WHERE cs_name = ? AND status = '已结单'"
  ).get(name);

  const orders = db.prepare(`
    SELECT id, order_type, customer_name, price, cs_commission_rate, cs_commission_amount, created_at
    FROM orders
    WHERE cs_name = ? AND status = '已结单'
    ORDER BY created_at DESC
    LIMIT ? OFFSET ?
  `).all(name, limit, offset);

  const agg = db.prepare(`
    SELECT
      COUNT(*) as order_count,
      COALESCE(SUM(cs_commission_amount), 0) as total_salary,
      COALESCE((SELECT SUM(s.settled_amount) FROM settlements s WHERE s.person_name = ? AND s.person_type = 'cs' AND s.reversed = 0), 0) as settled_total
    FROM orders
    WHERE cs_name = ? AND status = '已结单'
  `).get(name, name);

  const aggMonth = db.prepare(`
    SELECT COALESCE(SUM(cs_commission_amount), 0) as month_salary
    FROM orders
    WHERE cs_name = ? AND status = '已结单'
      AND strftime('%Y-%m', created_at) = strftime('%Y-%m', 'now', 'localtime')
  `).get(name);

  const settlements = db.prepare(
    "SELECT id, settled_amount, settled_by, remark, reversed, settled_at FROM settlements WHERE person_name = ? AND person_type = ? AND reversed = 0 ORDER BY settled_at DESC"
  ).all(name, 'cs');

  success(res, {
    type: 'cs',
    cs: { name },
    summary: {
      order_count: agg.order_count,
      total_salary: agg.total_salary,
      settled_total: agg.settled_total,
      unsettled: agg.total_salary - agg.settled_total,
      month_salary: aggMonth.month_salary,
    },
    orders,
    settlements,
    total: countRow.total,
    page: Number(page),
    size: Number(size),
  });
});

module.exports = router;
