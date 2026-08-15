const express = require('express');
const { getDb } = require('../db');
const { success } = require('../utils/response');
const { calcDepositFromOrders, calcUnsettled, round2, getWorkerReferrerCommission, getCsReferrerCommission } = require('../utils/deposit');
const { WORKER_ACTIVE_STATUS } = require('../utils/constants');

const router = express.Router();

router.get('/workers/list', (req, res) => {
  const db = getDb();
  const workers = db.prepare(`
    SELECT cw.id, cw.name, cw.default_deduction_rate, cw.rating, cw.status, cw.deposit, cw.deposit_target, cw.manual_unsettled, cw.manual_deposit_base,
      COALESCE((SELECT SUM(s.settled_amount) FROM settlements s WHERE s.person_name = cw.name AND s.person_type = 'worker' AND s.reversed = 0), 0) as settled_total,
      COALESCE((SELECT SUM(CAST(o.price / (SELECT COUNT(*) FROM order_workers WHERE order_id = o.id) - ow.deduction_amount AS REAL)) FROM order_workers ow JOIN orders o ON ow.order_id = o.id WHERE ow.worker_name = cw.name AND o.status = '已结单'), 0) as order_salary
    FROM config_workers cw
    WHERE cw.status = ?
    ORDER BY cw.name
  `).all(WORKER_ACTIVE_STATUS);

  for (const w of workers) {
    const settled = w.settled_total || 0;
    const orderSalary = w.order_salary || 0;
    const referrerCommission = getWorkerReferrerCommission(db, w.name);
    const manualUnsettled = w.manual_unsettled || 0;
    const deposit = w.deposit || 0;
    const depositBase = w.manual_deposit_base || 0;
    const depositFromOrders = calcDepositFromOrders(deposit, depositBase);
    const totalOrderSalary = round2(orderSalary + referrerCommission);
    const unsettled = calcUnsettled(totalOrderSalary, manualUnsettled, settled, depositFromOrders);
    
    // 累计推荐提成（历史总额）
    w.total_referrer_commission = referrerCommission;
    // 待结算推荐提成：接单工资优先结算后，剩余的未结算才是推荐提成
    // 接单工资+手动部分的可结算额 = max(0, orderSalary + manualUnsettled - depositFromOrders)
    const orderSalaryAvailable = round2(Math.max(0, orderSalary + manualUnsettled - depositFromOrders));
    const settledFromOrder = round2(Math.min(settled, orderSalaryAvailable));
    w.unsettled_referrer = round2(Math.max(0, referrerCommission - Math.max(0, settled - settledFromOrder)));
    w.unsettled = unsettled;
    w.total_salary = settled + unsettled + deposit;
  }
  success(res, workers);
});

router.get('/cs/list', (req, res) => {
  const db = getDb();
  const csList = db.prepare(`
    SELECT cc.id, cc.name, cc.active,
      COALESCE((SELECT SUM(cs_commission_amount) FROM orders WHERE cs_name = cc.name AND status = '已结单'), 0) as base_commission,
      COALESCE((SELECT SUM(s.settled_amount) FROM settlements s WHERE s.person_name = cc.name AND s.person_type = 'cs' AND s.reversed = 0), 0) as settled_total
    FROM config_cs cc
    ORDER BY cc.name
  `).all();

  for (const c of csList) {
    const baseCommission = c.base_commission || 0;
    const referrerCommission = getCsReferrerCommission(db, c.name);
    const settled = c.settled_total || 0;
    // 累计推荐提成
    c.total_referrer_commission = referrerCommission;
    // 待结算推荐提成：接单提成优先结算
    const settledFromBase = round2(Math.min(settled, baseCommission));
    c.unsettled_referrer = round2(Math.max(0, referrerCommission - Math.max(0, settled - settledFromBase)));
    c.total_salary = round2(baseCommission + referrerCommission);
    c.unsettled = round2(Math.max(0, c.total_salary - settled));
  }
  success(res, csList);
});

module.exports = router;
