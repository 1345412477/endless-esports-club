const express = require('express');
const { getDb } = require('../db');
const { success } = require('../utils/response');
const { calcDepositFromOrders, calcUnsettled } = require('../utils/deposit');

const router = express.Router();

router.get('/workers/list', (req, res) => {
  const db = getDb();
  const workers = db.prepare(`
    SELECT cw.id, cw.name, cw.default_deduction_rate, cw.rating, cw.status, cw.deposit, cw.deposit_target, cw.manual_unsettled, cw.manual_deposit_base,
      COALESCE((SELECT SUM(s.settled_amount) FROM settlements s WHERE s.person_name = cw.name AND s.person_type = 'worker' AND s.reversed = 0), 0) as settled_total,
      COALESCE((SELECT SUM(CAST(o.price / (SELECT COUNT(*) FROM order_workers WHERE order_id = o.id) - ow.deduction_amount AS REAL)) FROM order_workers ow JOIN orders o ON ow.order_id = o.id WHERE ow.worker_name = cw.name AND o.status = '已结单'), 0) as order_salary
    FROM config_workers cw
    ORDER BY cw.name
  `).all();

  for (const w of workers) {
    const settled = w.settled_total || 0;
    const orderSalary = w.order_salary || 0;
    const manualUnsettled = w.manual_unsettled || 0;
    const deposit = w.deposit || 0;
    const depositBase = w.manual_deposit_base || 0;
    const depositFromOrders = calcDepositFromOrders(deposit, depositBase);
    w.unsettled = calcUnsettled(orderSalary, manualUnsettled, settled, depositFromOrders);
    w.total_salary = settled + w.unsettled + deposit;
  }
  success(res, workers);
});

router.get('/cs/list', (req, res) => {
  const db = getDb();
  const csList = db.prepare(`
    SELECT cc.id, cc.name, cc.active,
      COALESCE((SELECT SUM(cs_commission_amount) FROM orders WHERE cs_name = cc.name AND status = '已结单'), 0) as total_salary,
      COALESCE((SELECT SUM(s.settled_amount) FROM settlements s WHERE s.person_name = cc.name AND s.person_type = 'cs' AND s.reversed = 0), 0) as settled_total
    FROM config_cs cc
    ORDER BY cc.name
  `).all();

  for (const c of csList) {
    c.unsettled = c.total_salary - c.settled_total;
  }
  success(res, csList);
});

module.exports = router;
