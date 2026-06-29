const express = require('express');
const { getDb } = require('../db');
const { requireRole } = require('../middleware/auth');
const { logAction } = require('../utils/logger');
const { recalculateWorkerDeposit } = require('../utils/deposit');

const router = express.Router();

router.get('/cs', requireRole('cs', 'admin'), (req, res) => {
  const db = getDb();
  let list;
  if (req.user.role === 'cs') {
    list = db.prepare('SELECT id, name, commission_rate, active FROM config_cs WHERE name = ?').all(req.user.csName);
  } else {
    list = db.prepare('SELECT id, name, commission_rate, active, username, CASE WHEN password IS NOT NULL AND password != ? THEN 1 ELSE 0 END as has_password FROM config_cs ORDER BY name').all('');
  }
  res.json({ code: 0, data: list, message: 'ok' });
});

router.post('/cs', requireRole('admin'), (req, res) => {
  const { name, commission_rate, username, password } = req.body;
  if (!name || !name.trim()) {
    return res.status(400).json({ code: 1, data: null, message: '姓名不能为空' });
  }
  const rate = commission_rate !== undefined ? parseFloat(commission_rate) : 0.02;
  if (isNaN(rate) || rate < 0 || rate > 1) {
    return res.status(400).json({ code: 1, data: null, message: '提成比例必须在0-1之间' });
  }
  const loginUsername = username ? String(username).trim() : '';
  const loginPassword = password ? String(password) : '';
  if (loginUsername && !loginPassword) {
    return res.status(400).json({ code: 1, data: null, message: '设置登录账号时必须同时设置密码' });
  }
  if (loginPassword && !loginUsername) {
    return res.status(400).json({ code: 1, data: null, message: '设置密码时必须同时设置登录账号' });
  }
  const db = getDb();
  const existInCs = db.prepare('SELECT id FROM config_cs WHERE name = ?').get(name.trim());
  if (existInCs) {
    return res.status(400).json({ code: 1, data: null, message: '该姓名已存在' });
  }
  const existInWorker = db.prepare('SELECT id FROM config_workers WHERE name = ?').get(name.trim());
  if (existInWorker) {
    return res.status(400).json({ code: 1, data: null, message: '该姓名已存在' });
  }
  if (loginUsername) {
    const dupUsername = db.prepare('SELECT id FROM config_cs WHERE username = ?').get(loginUsername);
    if (dupUsername) {
      return res.status(400).json({ code: 1, data: null, message: '该登录账号已被使用' });
    }
  }
  const result = db.prepare('INSERT INTO config_cs (name, commission_rate, username, password) VALUES (?, ?, ?, ?)').run(
    name.trim(), rate, loginUsername, loginPassword
  );
  const logParts = [`客服：${name.trim()}`, `提成比例：${(rate * 100).toFixed(1)}%`];
  if (loginUsername) logParts.push(`登录账号：${loginUsername}`);
  logAction('新增客服', '人员配置', logParts.join('，'), req.user.username);
  res.json({ code: 0, data: { id: result.lastInsertRowid }, message: 'ok' });
});

router.delete('/cs/:id', requireRole('admin'), (req, res) => {
  const db = getDb();
  const row = db.prepare('SELECT * FROM config_cs WHERE id = ?').get(req.params.id);
  if (!row) {
    return res.status(404).json({ code: 1, data: null, message: '客服不存在' });
  }
  db.prepare('DELETE FROM config_cs WHERE id = ?').run(req.params.id);
  logAction('删除客服', '人员配置', `客服：${row.name}，提成比例：${(row.commission_rate * 100).toFixed(1)}%`, req.user.username);
  res.json({ code: 0, data: null, message: 'ok' });
});

router.put('/cs/:id/rate', requireRole('admin'), (req, res) => {
  const { commission_rate } = req.body;
  const rate = parseFloat(commission_rate);
  if (isNaN(rate) || rate < 0 || rate > 1) {
    return res.status(400).json({ code: 1, data: null, message: '提成比例必须在0-1之间' });
  }
  const db = getDb();
  const row = db.prepare('SELECT * FROM config_cs WHERE id = ?').get(req.params.id);
  if (!row) {
    return res.status(404).json({ code: 1, data: null, message: '客服不存在' });
  }
  db.prepare('UPDATE config_cs SET commission_rate = ? WHERE id = ?').run(rate, req.params.id);
  logAction('修改客服提成', '人员配置', `客服：${row.name}，提成比例：${(row.commission_rate * 100).toFixed(1)}% → ${(rate * 100).toFixed(1)}%`, req.user.username);
  res.json({ code: 0, data: null, message: 'ok' });
});

router.put('/cs/:id/toggle', requireRole('admin'), (req, res) => {
  const { active } = req.body;
  const db = getDb();
  const row = db.prepare('SELECT * FROM config_cs WHERE id = ?').get(req.params.id);
  if (!row) {
    return res.status(404).json({ code: 1, data: null, message: '客服不存在' });
  }
  const newActive = active ? 1 : 0;
  db.prepare('UPDATE config_cs SET active = ? WHERE id = ?').run(newActive, req.params.id);
  logAction(newActive ? '启用客服' : '禁用客服', '人员配置', `客服：${row.name} → ${newActive ? '启用' : '禁用'}`, req.user.username);
  res.json({ code: 0, data: null, message: 'ok' });
});

router.put('/cs/:id/password', requireRole('admin'), (req, res) => {
  const { username, password } = req.body;
  const db = getDb();
  const row = db.prepare('SELECT * FROM config_cs WHERE id = ?').get(req.params.id);
  if (!row) {
    return res.status(404).json({ code: 1, data: null, message: '客服不存在' });
  }
  const newUsername = username !== undefined ? String(username).trim() : (row.username || '');
  const newPassword = password !== undefined ? String(password) : (row.password || '');
  if (newUsername && !newPassword) {
    return res.status(400).json({ code: 1, data: null, message: '设置登录账号时必须同时设置密码' });
  }
  if (newPassword && !newUsername) {
    return res.status(400).json({ code: 1, data: null, message: '设置密码时必须同时设置登录账号' });
  }
  if (newUsername) {
    const dupUsername = db.prepare('SELECT id FROM config_cs WHERE username = ? AND id != ?').get(newUsername, req.params.id);
    if (dupUsername) {
      return res.status(400).json({ code: 1, data: null, message: '该登录账号已被使用' });
    }
  }
  db.prepare('UPDATE config_cs SET username = ?, password = ? WHERE id = ?').run(newUsername, newPassword, req.params.id);
  const logParts = [`客服：${row.name}`];
  if (newUsername) logParts.push(`登录账号：${newUsername}`);
  if (newPassword) logParts.push('密码已重置');
  logAction('重置客服账号', '人员配置', logParts.join('，'), req.user.username);
  res.json({ code: 0, data: null, message: 'ok' });
});

router.put('/cs/:id', requireRole('admin'), (req, res) => {
  const { name, commission_rate } = req.body;
  const db = getDb();
  const row = db.prepare('SELECT * FROM config_cs WHERE id = ?').get(req.params.id);
  if (!row) {
    return res.status(404).json({ code: 1, data: null, message: '客服不存在' });
  }
  const updates = [];
  const params = [];
  const logChanges = [];
  if (name !== undefined) {
    const trimmed = String(name).trim();
    if (!trimmed) {
      return res.status(400).json({ code: 1, data: null, message: '姓名不能为空' });
    }
    const dupCs = db.prepare('SELECT id FROM config_cs WHERE name = ? AND id != ?').get(trimmed, req.params.id);
    if (dupCs) {
      return res.status(400).json({ code: 1, data: null, message: '该姓名已存在' });
    }
    const dupWorker = db.prepare('SELECT id FROM config_workers WHERE name = ?').get(trimmed);
    if (dupWorker) {
      return res.status(400).json({ code: 1, data: null, message: '该姓名已存在' });
    }
    updates.push('name = ?');
    params.push(trimmed);
    logChanges.push(`姓名改为"${trimmed}"`);
  }
  if (commission_rate !== undefined) {
    const rate = parseFloat(commission_rate);
    if (isNaN(rate) || rate < 0 || rate > 1) {
      return res.status(400).json({ code: 1, data: null, message: '提成比例必须在0-1之间' });
    }
    updates.push('commission_rate = ?');
    params.push(rate);
    logChanges.push(`提成比改为${(rate * 100).toFixed(1)}%`);
  }
  if (updates.length === 0) {
    return res.status(400).json({ code: 1, data: null, message: '没有要更新的字段' });
  }
  params.push(req.params.id);
  db.prepare('UPDATE config_cs SET ' + updates.join(', ') + ' WHERE id = ?').run(...params);
  logAction('编辑客服', '人员配置', `客服：${row.name}，${logChanges.join('，')}`, req.user.username);
  res.json({ code: 0, data: null, message: 'ok' });
});

router.get('/workers', requireRole('cs', 'admin'), (req, res) => {
  const db = getDb();
  const list = db.prepare('SELECT id, name, default_deduction_rate, rating, status, deposit, deposit_target FROM config_workers ORDER BY name').all();
  res.json({ code: 0, data: list, message: 'ok' });
});

router.post('/workers', requireRole('admin'), (req, res) => {
  const { name, default_deduction_rate, rating, status, deposit, deposit_target } = req.body;
  if (!name || !name.trim()) {
    return res.status(400).json({ code: 1, data: null, message: '姓名不能为空' });
  }
  const rate = default_deduction_rate !== undefined ? default_deduction_rate : 0.20;
  if (rate < 0 || rate > 1) {
    return res.status(400).json({ code: 1, data: null, message: '被抽成比例必须在0-1之间' });
  }
  const depositAmt = 0;
  const depositTarget = deposit_target !== undefined ? parseFloat(deposit_target) : 0;
  if (isNaN(depositTarget) || depositTarget < 0) {
    return res.status(400).json({ code: 1, data: null, message: '押金目标不能为负数' });
  }
  const workerRating = rating !== undefined ? String(rating) : '';
  const workerStatus = status !== undefined ? String(status) : '在店';
  const db = getDb();
  const existInWorker = db.prepare('SELECT id FROM config_workers WHERE name = ?').get(name.trim());
  if (existInWorker) {
    return res.status(400).json({ code: 1, data: null, message: '该姓名已存在' });
  }
  const existInCs = db.prepare('SELECT id FROM config_cs WHERE name = ?').get(name.trim());
  if (existInCs) {
    return res.status(400).json({ code: 1, data: null, message: '该姓名已存在' });
  }
  const result = db.prepare('INSERT INTO config_workers (name, default_deduction_rate, rating, status, deposit, deposit_target) VALUES (?, ?, ?, ?, ?, ?)').run(name.trim(), rate, workerRating, workerStatus, depositAmt, depositTarget);
  logAction('新增员工', '人员配置', `员工：${name.trim()}，抽成比例：${(rate * 100).toFixed(1)}%，评级：${workerRating}，状态：${workerStatus}，押金目标：¥${depositTarget}`, req.user.username);
  res.json({ code: 0, data: { id: result.lastInsertRowid }, message: 'ok' });
});

router.put('/workers/:id/rate', requireRole('admin'), (req, res) => {
  const { deduction_rate } = req.body;
  if (deduction_rate === undefined || deduction_rate < 0 || deduction_rate > 1) {
    return res.status(400).json({ code: 1, data: null, message: '被抽成比例必须在0-1之间' });
  }
  const db = getDb();
  const row = db.prepare('SELECT * FROM config_workers WHERE id = ?').get(req.params.id);
  if (!row) {
    return res.status(404).json({ code: 1, data: null, message: '员工不存在' });
  }
  db.prepare('UPDATE config_workers SET default_deduction_rate = ? WHERE id = ?').run(deduction_rate, req.params.id);
  logAction('修改员工抽成', '人员配置', `员工：${row.name}，抽成比例：${(row.default_deduction_rate * 100).toFixed(1)}% → ${(deduction_rate * 100).toFixed(1)}%`, req.user.username);
  res.json({ code: 0, data: null, message: 'ok' });
});

router.put('/workers/:id/rating', requireRole('admin'), (req, res) => {
  const { rating } = req.body;
  if (rating === undefined) {
    return res.status(400).json({ code: 1, data: null, message: '评级不能为空' });
  }
  const db = getDb();
  const row = db.prepare('SELECT * FROM config_workers WHERE id = ?').get(req.params.id);
  if (!row) {
    return res.status(404).json({ code: 1, data: null, message: '员工不存在' });
  }
  db.prepare('UPDATE config_workers SET rating = ? WHERE id = ?').run(String(rating), req.params.id);
  logAction('修改员工评级', '人员配置', `员工：${row.name}，评级：${row.rating || '无'} → ${rating}`, req.user.username);
  res.json({ code: 0, data: null, message: 'ok' });
});

router.put('/workers/:id/status', requireRole('admin'), (req, res) => {
  const { status } = req.body;
  const validStatus = ['在店', '退店', '开除'];
  if (!validStatus.includes(status)) {
    return res.status(400).json({ code: 1, data: null, message: '状态必须是在店/退店/开除' });
  }
  const db = getDb();
  const row = db.prepare('SELECT * FROM config_workers WHERE id = ?').get(req.params.id);
  if (!row) {
    return res.status(404).json({ code: 1, data: null, message: '员工不存在' });
  }
  db.prepare('UPDATE config_workers SET status = ? WHERE id = ?').run(status, req.params.id);
  logAction('修改员工状态', '人员配置', `员工：${row.name}，状态：${row.status} → ${status}`, req.user.username);
  res.json({ code: 0, data: null, message: 'ok' });
});

router.put('/workers/:id', requireRole('admin'), (req, res) => {
  const { name, default_deduction_rate, rating, status, deposit, deposit_target } = req.body;
  const db = getDb();
  const row = db.prepare('SELECT * FROM config_workers WHERE id = ?').get(req.params.id);
  if (!row) {
    return res.status(404).json({ code: 1, data: null, message: '员工不存在' });
  }
  const updates = [];
  const params = [];
  const logChanges = [];
  if (name !== undefined) {
    const trimmed = String(name).trim();
    if (!trimmed) {
      return res.status(400).json({ code: 1, data: null, message: '姓名不能为空' });
    }
    const dupWorker = db.prepare('SELECT id FROM config_workers WHERE name = ? AND id != ?').get(trimmed, req.params.id);
    if (dupWorker) {
      return res.status(400).json({ code: 1, data: null, message: '该姓名已存在' });
    }
    const dupCs = db.prepare('SELECT id FROM config_cs WHERE name = ?').get(trimmed);
    if (dupCs) {
      return res.status(400).json({ code: 1, data: null, message: '该姓名已存在' });
    }
    updates.push('name = ?');
    params.push(trimmed);
    logChanges.push(`姓名改为"${trimmed}"`);
  }
  if (default_deduction_rate !== undefined) {
    const rate = parseFloat(default_deduction_rate);
    if (isNaN(rate) || rate < 0 || rate > 1) {
      return res.status(400).json({ code: 1, data: null, message: '被抽成比例必须在0-1之间' });
    }
    updates.push('default_deduction_rate = ?');
    params.push(rate);
    logChanges.push(`抽成比改为${(rate * 100).toFixed(0)}%`);
  }
  if (rating !== undefined) {
    updates.push('rating = ?');
    params.push(String(rating));
    logChanges.push(`评级改为"${rating || '无'}"`);
  }
  if (status !== undefined) {
    const validStatus = ['在店', '退店', '开除'];
    if (!validStatus.includes(status)) {
      return res.status(400).json({ code: 1, data: null, message: '状态必须是在店/退店/开除' });
    }
    updates.push('status = ?');
    params.push(status);
    logChanges.push(`状态改为"${status}"`);
  }
  if (deposit_target !== undefined) {
    const target = parseFloat(deposit_target);
    if (isNaN(target) || target < 0) {
      return res.status(400).json({ code: 1, data: null, message: '押金目标不能为负数' });
    }
    updates.push('deposit_target = ?');
    params.push(target);
    logChanges.push(`押金目标改为¥${target}`);
  }
  if (deposit !== undefined) {
    const depositAmt = parseFloat(deposit);
    if (isNaN(depositAmt) || depositAmt < 0) {
      return res.status(400).json({ code: 1, data: null, message: '押金不能为负数' });
    }
    updates.push('deposit = ?');
    params.push(depositAmt);
    logChanges.push(`押金改为¥${depositAmt}`);
  }
  if (updates.length === 0) {
    return res.status(400).json({ code: 1, data: null, message: '没有要更新的字段' });
  }
  params.push(req.params.id);
  db.prepare('UPDATE config_workers SET ' + updates.join(', ') + ' WHERE id = ?').run(...params);
  if (deposit_target !== undefined) {
    const nameToRecalc = name !== undefined ? String(name).trim() : row.name;
    recalculateWorkerDeposit(db, nameToRecalc);
  }
  logAction('编辑员工', '人员配置', `员工：${row.name}，${logChanges.join('，')}`, req.user.username);
  res.json({ code: 0, data: null, message: 'ok' });
});

router.delete('/workers/:id', requireRole('admin'), (req, res) => {
  const db = getDb();
  const row = db.prepare('SELECT * FROM config_workers WHERE id = ?').get(req.params.id);
  if (!row) {
    return res.status(404).json({ code: 1, data: null, message: '员工不存在' });
  }
  db.prepare('DELETE FROM config_workers WHERE id = ?').run(req.params.id);
  logAction('删除员工', '人员配置', `员工：${row.name}，评级：${row.rating || '无'}，状态：${row.status}`, req.user.username);
  res.json({ code: 0, data: null, message: 'ok' });
});

router.get('/order-types', requireRole('cs', 'admin'), (req, res) => {
  const db = getDb();
  const list = db.prepare('SELECT id, name, active FROM config_order_types ORDER BY name').all();
  res.json({ code: 0, data: list, message: 'ok' });
});

router.post('/order-types', requireRole('admin'), (req, res) => {
  const { name } = req.body;
  if (!name || !name.trim()) {
    return res.status(400).json({ code: 1, data: null, message: '业务类型名称不能为空' });
  }
  const db = getDb();
  const exist = db.prepare('SELECT id FROM config_order_types WHERE name = ?').get(name.trim());
  if (exist) {
    return res.status(400).json({ code: 1, data: null, message: '该业务类型已存在' });
  }
  const result = db.prepare('INSERT INTO config_order_types (name) VALUES (?)').run(name.trim());
  logAction('新增业务类型', '人员配置', `业务类型：${name.trim()}`, req.user.username);
  res.json({ code: 0, data: { id: result.lastInsertRowid }, message: 'ok' });
});

router.delete('/order-types/:id', requireRole('admin'), (req, res) => {
  const db = getDb();
  const row = db.prepare('SELECT * FROM config_order_types WHERE id = ?').get(req.params.id);
  if (!row) {
    return res.status(404).json({ code: 1, data: null, message: '业务类型不存在' });
  }
  db.prepare('DELETE FROM config_order_types WHERE id = ?').run(req.params.id);
  logAction('删除业务类型', '人员配置', `业务类型：${row.name}`, req.user.username);
  res.json({ code: 0, data: null, message: 'ok' });
});

module.exports = router;
