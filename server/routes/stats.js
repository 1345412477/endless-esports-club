const express = require('express');
const { getDb } = require('../db');
const { requireRole } = require('../middleware/auth');

const router = express.Router();

function getDateRange(dimension, dateStr) {
  const d = dateStr ? new Date(dateStr) : new Date();
  let start, end, prevStart, prevEnd, label;

  if (dimension === 'day') {
    const y = d.getFullYear();
    const m = d.getMonth();
    const day = d.getDate();
    start = new Date(y, m, day, 0, 0, 0);
    end = new Date(y, m, day, 23, 59, 59, 999);
    prevStart = new Date(y, m, day - 1, 0, 0, 0);
    prevEnd = new Date(y, m, day - 1, 23, 59, 59, 999);
    label = `${y}-${String(m + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  } else if (dimension === 'week') {
    const dayOfWeek = d.getDay() || 7;
    const monday = new Date(d);
    monday.setDate(d.getDate() - dayOfWeek + 1);
    monday.setHours(0, 0, 0, 0);
    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);
    sunday.setHours(23, 59, 59, 999);
    const prevMonday = new Date(monday);
    prevMonday.setDate(monday.getDate() - 7);
    const prevSunday = new Date(sunday);
    prevSunday.setDate(sunday.getDate() - 7);
    start = monday;
    end = sunday;
    prevStart = prevMonday;
    prevEnd = prevSunday;
    label = `${monday.getFullYear()}年第${getWeekNumber(monday)}周`;
  } else if (dimension === 'month') {
    const y = d.getFullYear();
    const m = d.getMonth();
    start = new Date(y, m, 1, 0, 0, 0);
    end = new Date(y, m + 1, 0, 23, 59, 59, 999);
    prevStart = new Date(y, m - 1, 1, 0, 0, 0);
    prevEnd = new Date(y, m, 0, 23, 59, 59, 999);
    label = `${y}年${m + 1}月`;
  } else if (dimension === 'year') {
    const y = d.getFullYear();
    start = new Date(y, 0, 1, 0, 0, 0);
    end = new Date(y, 11, 31, 23, 59, 59, 999);
    prevStart = new Date(y - 1, 0, 1, 0, 0, 0);
    prevEnd = new Date(y - 1, 11, 31, 23, 59, 59, 999);
    label = `${y}年`;
  }

  return { start, end, prevStart, prevEnd, label };
}

function getWeekNumber(date) {
  const firstDay = new Date(date.getFullYear(), 0, 1);
  const pastDays = (date - firstDay) / 86400000;
  return Math.ceil((pastDays + firstDay.getDay() + 1) / 7);
}

function fmtDate(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  const h = String(d.getHours()).padStart(2, '0');
  const min = String(d.getMinutes()).padStart(2, '0');
  const s = String(d.getSeconds()).padStart(2, '0');
  return `${y}-${m}-${day} ${h}:${min}:${s}`;
}

function round2(v) {
  return Math.round((Number(v) + Number.EPSILON) * 100) / 100;
}

function calcSummary(db, start, end) {
  const startStr = fmtDate(start);
  const endStr = fmtDate(end);
  const row = db.prepare(`
    SELECT
      COALESCE(SUM(price), 0) as total_amount,
      COUNT(*) as total_orders,
      SUM(CASE WHEN status = '已结单' THEN 1 ELSE 0 END) as completed_orders,
      SUM(CASE WHEN status = '退单' THEN 1 ELSE 0 END) as refund_orders
    FROM orders
    WHERE created_at >= ? AND created_at <= ?
  `).get(startStr, endStr);

  return {
    total_amount: round2(row.total_amount || 0),
    total_orders: row.total_orders || 0,
    completed_orders: row.completed_orders || 0,
    refund_orders: row.refund_orders || 0,
  };
}

function calcCsRanking(db, start, end) {
  const startStr = fmtDate(start);
  const endStr = fmtDate(end);
  return db.prepare(`
    SELECT cs_name as name,
      SUM(price) as amount,
      COUNT(*) as order_count
    FROM orders
    WHERE created_at >= ? AND created_at <= ? AND status = '已结单'
    GROUP BY cs_name
    ORDER BY amount DESC
    LIMIT 5
  `).all(startStr, endStr).map(r => ({
    name: r.name,
    amount: round2(r.amount || 0),
    order_count: r.order_count || 0,
  }));
}

function calcWorkerRanking(db, start, end) {
  const startStr = fmtDate(start);
  const endStr = fmtDate(end);
  return db.prepare(`
    SELECT ow.worker_name as name,
      COUNT(*) as order_count,
      COALESCE(SUM(CAST(o.price / (SELECT COUNT(*) FROM order_workers WHERE order_id = o.id) - ow.deduction_amount AS REAL)), 0) as salary
    FROM order_workers ow
    JOIN orders o ON ow.order_id = o.id
    WHERE o.created_at >= ? AND o.created_at <= ? AND o.status = '已结单'
    GROUP BY ow.worker_name
    ORDER BY order_count DESC, salary DESC
    LIMIT 5
  `).all(startStr, endStr).map(r => ({
    name: r.name,
    order_count: r.order_count || 0,
    salary: round2(r.salary || 0),
  }));
}

function calcTypeDistribution(db, start, end) {
  const startStr = fmtDate(start);
  const endStr = fmtDate(end);
  const rows = db.prepare(`
    SELECT order_type as type,
      COUNT(*) as count,
      SUM(price) as amount
    FROM orders
    WHERE created_at >= ? AND created_at <= ?
    GROUP BY order_type
    ORDER BY amount DESC
  `).all(startStr, endStr).map(r => ({
    type: r.type,
    count: r.count || 0,
    amount: round2(r.amount || 0),
  }));

  const total = rows.reduce((s, r) => s + r.amount, 0);
  rows.forEach(r => {
    r.percent = total > 0 ? round2((r.amount / total) * 100) : 0;
  });
  return rows;
}

function calcHourlyDistribution(db, start, end) {
  const startStr = fmtDate(start);
  const endStr = fmtDate(end);
  const rows = db.prepare(`
    SELECT CAST(strftime('%H', created_at) AS INTEGER) as hour,
      COUNT(*) as count
    FROM orders
    WHERE created_at >= ? AND created_at <= ?
    GROUP BY hour
    ORDER BY hour
  `).all(startStr, endStr);

  const hourly = Array.from({ length: 24 }, (_, i) => ({ hour: i, count: 0 }));
  rows.forEach(r => {
    if (r.hour >= 0 && r.hour < 24) {
      hourly[r.hour].count = r.count || 0;
    }
  });
  return hourly;
}

function calcChange(curr, prev) {
  if (!prev || prev === 0) return null;
  return round2(((curr - prev) / prev) * 100);
}

router.get('/dashboard', requireRole('admin'), (req, res) => {
  const { dimension = 'day', date } = req.query;
  const db = getDb();

  const range = getDateRange(dimension, date);
  const { start, end, prevStart, prevEnd, label } = range;

  const summary = calcSummary(db, start, end);
  const prevSummary = calcSummary(db, prevStart, prevEnd);

  const cs_ranking = calcCsRanking(db, start, end);
  const worker_ranking = calcWorkerRanking(db, start, end);
  const type_distribution = calcTypeDistribution(db, start, end);
  const hourly_distribution = calcHourlyDistribution(db, start, end);

  const changes = {
    total_amount: calcChange(summary.total_amount, prevSummary.total_amount),
    total_orders: calcChange(summary.total_orders, prevSummary.total_orders),
    completed_orders: calcChange(summary.completed_orders, prevSummary.completed_orders),
    refund_orders: calcChange(summary.refund_orders, prevSummary.refund_orders),
  };

  res.json({
    code: 0,
    data: {
      label,
      dimension,
      summary,
      prev_summary: prevSummary,
      changes,
      cs_ranking,
      worker_ranking,
      type_distribution,
      hourly_distribution,
    },
    message: 'ok',
  });
});

router.get('/settlement-stats', requireRole('admin'), (req, res) => {
  const db = getDb();

  const workers = db.prepare('SELECT name, deposit, deposit_target, manual_unsettled, manual_deposit_base FROM config_workers').all();
  const csList = db.prepare('SELECT name FROM config_cs').all();

  let workerUnsettled = 0;
  let totalDeposit = 0;

  for (const w of workers) {
    totalDeposit += round2(w.deposit || 0);

    const salRow = db.prepare(`
      SELECT COALESCE(SUM(CAST(o.price / (SELECT COUNT(*) FROM order_workers WHERE order_id = o.id) - ow.deduction_amount AS REAL)), 0) as total
      FROM order_workers ow
      JOIN orders o ON ow.order_id = o.id
      WHERE ow.worker_name = ? AND o.status = '已结单'
    `).get(w.name);
    const totalSalary = round2(salRow.total || 0);

    const setRow = db.prepare(
      "SELECT COALESCE(SUM(settled_amount), 0) as total FROM settlements WHERE person_name = ? AND person_type = 'worker' AND reversed = 0"
    ).get(w.name);
    const settled = round2(setRow.total || 0);

    const deposit = round2(w.deposit || 0);
    const manualUnsettled = round2(w.manual_unsettled || 0);
    const depositBase = round2(w.manual_deposit_base || 0);
    const depositFromOrders = Math.max(0, deposit - depositBase);
    workerUnsettled += round2(Math.max(0, totalSalary + manualUnsettled - settled - depositFromOrders));
  }

  let csUnsettled = 0;
  for (const c of csList) {
    const commRow = db.prepare(
      "SELECT COALESCE(SUM(cs_commission_amount), 0) as total FROM orders WHERE cs_name = ? AND status = '已结单'"
    ).get(c.name);
    const totalComm = round2(commRow.total || 0);

    const setRow = db.prepare(
      "SELECT COALESCE(SUM(settled_amount), 0) as total FROM settlements WHERE person_name = ? AND person_type = 'cs' AND reversed = 0"
    ).get(c.name);
    const settled = round2(setRow.total || 0);

    csUnsettled += round2(Math.max(0, totalComm - settled));
  }

  const now = new Date();
  const monthStart = fmtDate(new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0));
  const monthEnd = fmtDate(new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999));

  const monthSettledRow = db.prepare(
    "SELECT COALESCE(SUM(settled_amount), 0) as total FROM settlements WHERE settled_at >= ? AND settled_at <= ? AND person_type IN ('worker', 'cs') AND reversed = 0"
  ).get(monthStart, monthEnd);
  const monthSettled = round2(monthSettledRow.total || 0);

  res.json({
    code: 0,
    data: {
      worker_unsettled: round2(workerUnsettled),
      cs_unsettled: round2(csUnsettled),
      total_deposit: round2(totalDeposit),
      month_settled: monthSettled,
    },
    message: 'ok',
  });
});

router.get('/recent-orders', requireRole('admin'), (req, res) => {
  const db = getDb();
  const limit = Math.min(parseInt(req.query.limit) || 20, 50);

  const orders = db.prepare(`
    SELECT id, customer_name, order_type, cs_name, price, status, created_at
    FROM orders
    ORDER BY created_at DESC
    LIMIT ?
  `).all(limit);

  for (const o of orders) {
    const workers = db.prepare('SELECT worker_name FROM order_workers WHERE order_id = ?').all(o.id);
    o.workers = workers.map(w => w.worker_name);
    o.price = round2(o.price || 0);
  }

  res.json({ code: 0, data: orders, message: 'ok' });
});

router.get('/trend', requireRole('admin'), (req, res) => {
  const db = getDb();
  const days = Math.min(parseInt(req.query.days) || 7, 30);

  const result = [];
  const now = new Date();
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    const dateStr = `${y}-${m}-${day}`;
    const label = `${m}-${day}`;

    const row = db.prepare(`
      SELECT
        COUNT(*) as order_count,
        COALESCE(SUM(price), 0) as total_amount,
        SUM(CASE WHEN status = '已结单' THEN 1 ELSE 0 END) as completed_count
      FROM orders
      WHERE date(created_at) = date(?)
    `).get(dateStr);

    result.push({
      date: dateStr,
      label,
      order_count: row.order_count || 0,
      total_amount: round2(row.total_amount || 0),
      completed_count: row.completed_count || 0,
    });
  }

  res.json({ code: 0, data: result, message: 'ok' });
});

module.exports = router;
