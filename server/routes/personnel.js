const express = require('express');
const { getDb } = require('../db');

const router = express.Router();

router.get('/workers/list', (req, res) => {
  const db = getDb();
  const workers = db.prepare(`
    SELECT cw.id, cw.name, cw.default_deduction_rate, cw.rating, cw.status, cw.deposit, cw.deposit_target,
      COALESCE((
        SELECT SUM(CAST(o.price / (SELECT COUNT(*) FROM order_workers WHERE order_id = o.id) - ow.deduction_amount AS REAL))
        FROM order_workers ow
        JOIN orders o ON ow.order_id = o.id
        WHERE ow.worker_name = cw.name AND o.status = '已结单'
      ), 0) as total_salary,
      COALESCE((SELECT SUM(s.settled_amount) FROM settlements s WHERE s.person_name = cw.name AND s.person_type = 'worker' AND s.reversed = 0), 0) as settled_total
    FROM config_workers cw
    ORDER BY cw.name
  `).all();

  for (const w of workers) {
    const depositAmt = w.deposit != null ? w.deposit : 0;
    w.unsettled = Math.max(0, w.total_salary - w.settled_total - depositAmt);
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
