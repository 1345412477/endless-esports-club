const express = require('express');
const { getDb } = require('../db');

const router = express.Router();

router.get('/workers/list', (req, res) => {
  const db = getDb();
  const workers = db.prepare(`
    SELECT cw.id, cw.name, cw.default_deduction_rate, cw.rating, cw.status, cw.deposit, cw.deposit_target, cw.manual_unsettled,
      COALESCE((SELECT SUM(s.settled_amount) FROM settlements s WHERE s.person_name = cw.name AND s.person_type = 'worker' AND s.reversed = 0), 0) as settled_total
    FROM config_workers cw
    ORDER BY cw.name
  `).all();

  for (const w of workers) {
    const settled = w.settled_total || 0;
    const unsettled = w.manual_unsettled || 0;
    const deposit = w.deposit || 0;
    // 累计工资 = 已结算 + 未结算 + 押金
    w.total_salary = settled + unsettled + deposit;
    w.unsettled = unsettled;
  }
  res.json({ code: 0, data: workers, message: 'ok' });
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
  res.json({ code: 0, data: csList, message: 'ok' });
});

module.exports = router;
