const express = require('express');
const { getDb } = require('../db');
const { requireRole } = require('../middleware/auth');

const router = express.Router();

router.get('/', requireRole('admin'), (req, res) => {
  const db = getDb();
  const { module, action, operator, start_date, end_date, page = 1, size = 20 } = req.query;
  const offset = (Number(page) - 1) * Number(size);
  const limit = Number(size);

  let where = [];
  let params = [];

  if (module) {
    where.push('module = ?');
    params.push(module);
  }
  if (action) {
    where.push('action LIKE ?');
    params.push(`%${action}%`);
  }
  if (operator) {
    where.push('operator LIKE ?');
    params.push(`%${operator}%`);
  }
  if (start_date) {
    where.push("date(created_at) >= date(?)");
    params.push(start_date);
  }
  if (end_date) {
    where.push("date(created_at) <= date(?)");
    params.push(end_date);
  }

  const whereClause = where.length > 0 ? 'WHERE ' + where.join(' AND ') : '';

  const countRow = db.prepare(`SELECT COUNT(*) as total FROM operation_logs ${whereClause}`).get(...params);
  const logs = db.prepare(
    `SELECT * FROM operation_logs ${whereClause} ORDER BY created_at DESC LIMIT ? OFFSET ?`
  ).all(...params, limit, offset);

  res.json({
    code: 0,
    data: { list: logs, total: countRow.total, page: Number(page), size: Number(size) },
    message: 'ok',
  });
});

function csvEscape(v) {
  if (v === null || v === undefined) return '';
  const s = String(v);
  if (s.includes(',') || s.includes('"') || s.includes('\n') || s.includes('\r')) {
    return '"' + s.replace(/"/g, '""') + '"';
  }
  return s;
}

router.get('/export', requireRole('admin'), (req, res) => {
  const db = getDb();
  const { module, action, operator, start_date, end_date } = req.query;

  let where = [];
  let params = [];

  if (module) {
    where.push('module = ?');
    params.push(module);
  }
  if (action) {
    where.push('action LIKE ?');
    params.push(`%${action}%`);
  }
  if (operator) {
    where.push('operator LIKE ?');
    params.push(`%${operator}%`);
  }
  if (start_date) {
    where.push("date(created_at) >= date(?)");
    params.push(start_date);
  }
  if (end_date) {
    where.push("date(created_at) <= date(?)");
    params.push(end_date);
  }

  const whereClause = where.length > 0 ? 'WHERE ' + where.join(' AND ') : '';
  const logs = db.prepare(
    `SELECT * FROM operation_logs ${whereClause} ORDER BY created_at DESC`
  ).all(...params);

  const BOM = '\uFEFF';
  const header = ['时间', '模块', '操作', '详情', '操作人'];
  const rows = logs.map(l => [
    l.created_at || '',
    l.module || '',
    l.action || '',
    l.detail || '',
    l.operator || '',
  ]);

  const csv = BOM + [header, ...rows].map(r => r.map(csvEscape).join(',')).join('\r\n');

  const now = new Date();
  const ts = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}_${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}`;

  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="operation_logs_${ts}.csv"`);
  res.send(csv);
});

module.exports = router;
