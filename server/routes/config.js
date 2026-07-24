const express = require('express');
const { getDb } = require('../db');
const { requireRole } = require('../middleware/auth');
const { logAction } = require('../utils/logger');
const { recalculateWorkerDeposit } = require('../utils/deposit');
const { success, badRequest, notFound } = require('../utils/response');

const router = express.Router();

router.get('/cs', requireRole('cs', 'admin', 'manager'), (req, res) => {
  const db = getDb();
  let list;
  if (req.user.role === 'cs') {
    list = db.prepare('SELECT id, name, commission_rate, active FROM config_cs WHERE name = ?').all(req.user.csName);
  } else {
    list = db.prepare('SELECT id, name, commission_rate, active, username, CASE WHEN password IS NOT NULL AND password != ? THEN 1 ELSE 0 END as has_password FROM config_cs ORDER BY name').all('');
  }
  success(res, list);
});

router.post('/cs', requireRole('admin'), (req, res) => {
  const { name, commission_rate, username, password } = req.body;
  if (!name || !name.trim()) {
    return badRequest(res, '姓名不能为空');
  }
  const rate = commission_rate !== undefined ? parseFloat(commission_rate) : 0.02;
  if (isNaN(rate) || rate < 0 || rate > 1) {
    return badRequest(res, '提成比例必须在0-1之间');
  }
  const loginUsername = username ? String(username).trim() : '';
  const loginPassword = password ? String(password) : '';
  if (loginUsername && !loginPassword) {
    return badRequest(res, '设置登录账号时必须同时设置密码');
  }
  if (loginPassword && !loginUsername) {
    return badRequest(res, '设置密码时必须同时设置登录账号');
  }
  const db = getDb();
  const existInCs = db.prepare('SELECT id FROM config_cs WHERE name = ?').get(name.trim());
  if (existInCs) {
    return badRequest(res, '该姓名已存在');
  }
  const existInWorker = db.prepare('SELECT id FROM config_workers WHERE name = ?').get(name.trim());
  if (existInWorker) {
    return badRequest(res, '该姓名已存在');
  }
  if (loginUsername) {
    const dupUsername = db.prepare('SELECT id FROM config_cs WHERE username = ?').get(loginUsername);
    if (dupUsername) {
      return badRequest(res, '该登录账号已被使用');
    }
  }
  const result = db.prepare('INSERT INTO config_cs (name, commission_rate, username, password) VALUES (?, ?, ?, ?)').run(
    name.trim(), rate, loginUsername, loginPassword
  );
  const logParts = [`客服：${name.trim()}`, `提成比例：${(rate * 100).toFixed(1)}%`];
  if (loginUsername) logParts.push(`登录账号：${loginUsername}`);
  logAction('新增客服', '人员配置', logParts.join('，'), req.user.username);
  success(res, { id: result.lastInsertRowid });
});

router.delete('/cs/:id', requireRole('admin'), (req, res) => {
  const db = getDb();
  const row = db.prepare('SELECT * FROM config_cs WHERE id = ?').get(req.params.id);
  if (!row) {
    return notFound(res, '客服不存在');
  }
  db.prepare('DELETE FROM config_cs WHERE id = ?').run(req.params.id);
  logAction('删除客服', '人员配置', `客服：${row.name}，提成比例：${(row.commission_rate * 100).toFixed(1)}%`, req.user.username);
  success(res, null);
});

router.put('/cs/:id/rate', requireRole('admin'), (req, res) => {
  const { commission_rate } = req.body;
  const rate = parseFloat(commission_rate);
  if (isNaN(rate) || rate < 0 || rate > 1) {
    return badRequest(res, '提成比例必须在0-1之间');
  }
  const db = getDb();
  const row = db.prepare('SELECT * FROM config_cs WHERE id = ?').get(req.params.id);
  if (!row) {
    return notFound(res, '客服不存在');
  }
  db.prepare('UPDATE config_cs SET commission_rate = ? WHERE id = ?').run(rate, req.params.id);
  logAction('修改客服提成', '人员配置', `客服：${row.name}，提成比例：${(row.commission_rate * 100).toFixed(1)}% → ${(rate * 100).toFixed(1)}%`, req.user.username);
  success(res, null);
});

router.put('/cs/:id/toggle', requireRole('admin'), (req, res) => {
  const { active } = req.body;
  const db = getDb();
  const row = db.prepare('SELECT * FROM config_cs WHERE id = ?').get(req.params.id);
  if (!row) {
    return notFound(res, '客服不存在');
  }
  const newActive = active ? 1 : 0;
  db.prepare('UPDATE config_cs SET active = ? WHERE id = ?').run(newActive, req.params.id);
  logAction(newActive ? '启用客服' : '禁用客服', '人员配置', `客服：${row.name} → ${newActive ? '启用' : '禁用'}`, req.user.username);
  success(res, null);
});

router.put('/cs/:id/password', requireRole('admin'), (req, res) => {
  const { username, password } = req.body;
  const db = getDb();
  const row = db.prepare('SELECT * FROM config_cs WHERE id = ?').get(req.params.id);
  if (!row) {
    return notFound(res, '客服不存在');
  }
  const newUsername = username !== undefined ? String(username).trim() : (row.username || '');
  const newPassword = password !== undefined ? String(password) : (row.password || '');
  if (newUsername && !newPassword) {
    return badRequest(res, '设置登录账号时必须同时设置密码');
  }
  if (newPassword && !newUsername) {
    return badRequest(res, '设置密码时必须同时设置登录账号');
  }
  if (newUsername) {
    const dupUsername = db.prepare('SELECT id FROM config_cs WHERE username = ? AND id != ?').get(newUsername, req.params.id);
    if (dupUsername) {
      return badRequest(res, '该登录账号已被使用');
    }
  }
  db.prepare('UPDATE config_cs SET username = ?, password = ? WHERE id = ?').run(newUsername, newPassword, req.params.id);
  const logParts = [`客服：${row.name}`];
  if (newUsername) logParts.push(`登录账号：${newUsername}`);
  if (newPassword) logParts.push('密码已重置');
  logAction('重置客服账号', '人员配置', logParts.join('，'), req.user.username);
  success(res, null);
});

router.put('/cs/:id', requireRole('admin'), (req, res) => {
  const { name, commission_rate } = req.body;
  const db = getDb();
  const row = db.prepare('SELECT * FROM config_cs WHERE id = ?').get(req.params.id);
  if (!row) {
    return notFound(res, '客服不存在');
  }
  const updates = [];
  const params = [];
  const logChanges = [];
  if (name !== undefined) {
    const trimmed = String(name).trim();
    if (!trimmed) {
      return badRequest(res, '姓名不能为空');
    }
    const dupCs = db.prepare('SELECT id FROM config_cs WHERE name = ? AND id != ?').get(trimmed, req.params.id);
    if (dupCs) {
      return badRequest(res, '该姓名已存在');
    }
    const dupWorker = db.prepare('SELECT id FROM config_workers WHERE name = ?').get(trimmed);
    if (dupWorker) {
      return badRequest(res, '该姓名已存在');
    }
    updates.push('name = ?');
    params.push(trimmed);
    logChanges.push(`姓名改为"${trimmed}"`);
  }
  if (commission_rate !== undefined) {
    const rate = parseFloat(commission_rate);
    if (isNaN(rate) || rate < 0 || rate > 1) {
      return badRequest(res, '提成比例必须在0-1之间');
    }
    updates.push('commission_rate = ?');
    params.push(rate);
    logChanges.push(`提成比改为${(rate * 100).toFixed(1)}%`);
  }
  if (updates.length === 0) {
    return badRequest(res, '没有要更新的字段');
  }
  params.push(req.params.id);
  db.prepare('UPDATE config_cs SET ' + updates.join(', ') + ' WHERE id = ?').run(...params);
  logAction('编辑客服', '人员配置', `客服：${row.name}，${logChanges.join('，')}`, req.user.username);
  success(res, null);
});

router.get('/workers', requireRole('cs', 'admin', 'manager'), (req, res) => {
  const db = getDb();
  const list = db.prepare('SELECT id, name, default_deduction_rate, rating, status, deposit, deposit_target FROM config_workers ORDER BY name').all();
  success(res, list);
});

router.post('/workers', requireRole('admin', 'manager'), (req, res) => {
  const { name, default_deduction_rate, rating, status, deposit, deposit_target } = req.body;
  if (!name || !name.trim()) {
    return badRequest(res, '姓名不能为空');
  }
  const rate = default_deduction_rate !== undefined ? default_deduction_rate : 0.20;
  if (rate < 0 || rate > 1) {
    return badRequest(res, '被抽成比例必须在0-1之间');
  }
  const depositAmt = 0;
  const depositTarget = deposit_target !== undefined ? parseFloat(deposit_target) : 0;
  if (isNaN(depositTarget) || depositTarget < 0) {
    return badRequest(res, '押金目标不能为负数');
  }
  const workerRating = rating !== undefined ? String(rating) : '';
  const workerStatus = status !== undefined ? String(status) : '在店';
  const db = getDb();
  const existInWorker = db.prepare('SELECT id FROM config_workers WHERE name = ?').get(name.trim());
  if (existInWorker) {
    return badRequest(res, '该姓名已存在');
  }
  const existInCs = db.prepare('SELECT id FROM config_cs WHERE name = ?').get(name.trim());
  if (existInCs) {
    return badRequest(res, '该姓名已存在');
  }
  const result = db.prepare('INSERT INTO config_workers (name, default_deduction_rate, rating, status, deposit, deposit_target) VALUES (?, ?, ?, ?, ?, ?)').run(name.trim(), rate, workerRating, workerStatus, depositAmt, depositTarget);
  logAction('新增员工', '人员配置', `员工：${name.trim()}，抽成比例：${(rate * 100).toFixed(1)}%，评级：${workerRating}，状态：${workerStatus}，押金目标：¥${depositTarget}`, req.user.username);
  success(res, { id: result.lastInsertRowid });
});

router.put('/workers/:id/rate', requireRole('admin'), (req, res) => {
  const { deduction_rate } = req.body;
  if (deduction_rate === undefined || deduction_rate < 0 || deduction_rate > 1) {
    return badRequest(res, '被抽成比例必须在0-1之间');
  }
  const db = getDb();
  const row = db.prepare('SELECT * FROM config_workers WHERE id = ?').get(req.params.id);
  if (!row) {
    return notFound(res, '员工不存在');
  }
  db.prepare('UPDATE config_workers SET default_deduction_rate = ? WHERE id = ?').run(deduction_rate, req.params.id);
  logAction('修改员工抽成', '人员配置', `员工：${row.name}，抽成比例：${(row.default_deduction_rate * 100).toFixed(1)}% → ${(deduction_rate * 100).toFixed(1)}%`, req.user.username);
  success(res, null);
});

router.put('/workers/:id/rating', requireRole('admin'), (req, res) => {
  const { rating } = req.body;
  if (rating === undefined) {
    return badRequest(res, '评级不能为空');
  }
  const db = getDb();
  const row = db.prepare('SELECT * FROM config_workers WHERE id = ?').get(req.params.id);
  if (!row) {
    return notFound(res, '员工不存在');
  }
  db.prepare('UPDATE config_workers SET rating = ? WHERE id = ?').run(String(rating), req.params.id);
  logAction('修改员工评级', '人员配置', `员工：${row.name}，评级：${row.rating || '无'} → ${rating}`, req.user.username);
  success(res, null);
});

router.put('/workers/:id/status', requireRole('admin'), (req, res) => {
  const { status } = req.body;
  const validStatus = ['在店', '退店', '开除'];
  if (!validStatus.includes(status)) {
    return badRequest(res, '状态必须是在店/退店/开除');
  }
  const db = getDb();
  const row = db.prepare('SELECT * FROM config_workers WHERE id = ?').get(req.params.id);
  if (!row) {
    return notFound(res, '员工不存在');
  }
  db.prepare('UPDATE config_workers SET status = ? WHERE id = ?').run(status, req.params.id);
  logAction('修改员工状态', '人员配置', `员工：${row.name}，状态：${row.status} → ${status}`, req.user.username);
  success(res, null);
});

router.put('/workers/:id', requireRole('admin'), (req, res) => {
  const { name, default_deduction_rate, rating, status, deposit, deposit_target } = req.body;
  const db = getDb();
  const row = db.prepare('SELECT * FROM config_workers WHERE id = ?').get(req.params.id);
  if (!row) {
    return notFound(res, '员工不存在');
  }
  const updates = [];
  const params = [];
  const logChanges = [];
  if (name !== undefined) {
    const trimmed = String(name).trim();
    if (!trimmed) {
      return badRequest(res, '姓名不能为空');
    }
    const dupWorker = db.prepare('SELECT id FROM config_workers WHERE name = ? AND id != ?').get(trimmed, req.params.id);
    if (dupWorker) {
      return badRequest(res, '该姓名已存在');
    }
    const dupCs = db.prepare('SELECT id FROM config_cs WHERE name = ?').get(trimmed);
    if (dupCs) {
      return badRequest(res, '该姓名已存在');
    }
    updates.push('name = ?');
    params.push(trimmed);
    logChanges.push(`姓名改为"${trimmed}"`);
  }
  if (default_deduction_rate !== undefined) {
    const rate = parseFloat(default_deduction_rate);
    if (isNaN(rate) || rate < 0 || rate > 1) {
      return badRequest(res, '被抽成比例必须在0-1之间');
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
      return badRequest(res, '状态必须是在店/退店/开除');
    }
    updates.push('status = ?');
    params.push(status);
    logChanges.push(`状态改为"${status}"`);
  }
  if (deposit_target !== undefined) {
    const target = parseFloat(deposit_target);
    if (isNaN(target) || target < 0) {
      return badRequest(res, '押金目标不能为负数');
    }
    updates.push('deposit_target = ?');
    params.push(target);
    logChanges.push(`押金目标改为¥${target}`);
  }
  if (deposit !== undefined) {
    const depositAmt = parseFloat(deposit);
    if (isNaN(depositAmt) || depositAmt < 0) {
      return badRequest(res, '押金不能为负数');
    }
    updates.push('deposit = ?');
    params.push(depositAmt);
    logChanges.push(`押金改为¥${depositAmt}`);
  }
  if (updates.length === 0) {
    return badRequest(res, '没有要更新的字段');
  }
  params.push(req.params.id);
  db.prepare('UPDATE config_workers SET ' + updates.join(', ') + ' WHERE id = ?').run(...params);
  if (deposit_target !== undefined) {
    const nameToRecalc = name !== undefined ? String(name).trim() : row.name;
    recalculateWorkerDeposit(db, nameToRecalc);
  }
  logAction('编辑员工', '人员配置', `员工：${row.name}，${logChanges.join('，')}`, req.user.username);
  success(res, null);
});

router.delete('/workers/:id', requireRole('admin'), (req, res) => {
  const db = getDb();
  const row = db.prepare('SELECT * FROM config_workers WHERE id = ?').get(req.params.id);
  if (!row) {
    return notFound(res, '员工不存在');
  }
  db.prepare('DELETE FROM config_workers WHERE id = ?').run(req.params.id);
  logAction('删除员工', '人员配置', `员工：${row.name}，评级：${row.rating || '无'}，状态：${row.status}`, req.user.username);
  success(res, null);
});

router.get('/order-types', requireRole('cs', 'admin', 'manager'), (req, res) => {
  const db = getDb();
  const list = db.prepare('SELECT id, name, active FROM config_order_types ORDER BY name').all();
  success(res, list);
});

router.post('/order-types', requireRole('admin'), (req, res) => {
  const { name } = req.body;
  if (!name || !name.trim()) {
    return badRequest(res, '业务类型名称不能为空');
  }
  const db = getDb();
  const exist = db.prepare('SELECT id FROM config_order_types WHERE name = ?').get(name.trim());
  if (exist) {
    return badRequest(res, '该业务类型已存在');
  }
  const result = db.prepare('INSERT INTO config_order_types (name) VALUES (?)').run(name.trim());
  logAction('新增业务类型', '人员配置', `业务类型：${name.trim()}`, req.user.username);
  success(res, { id: result.lastInsertRowid });
});

router.delete('/order-types/:id', requireRole('admin'), (req, res) => {
  const db = getDb();
  const row = db.prepare('SELECT * FROM config_order_types WHERE id = ?').get(req.params.id);
  if (!row) {
    return notFound(res, '业务类型不存在');
  }
  db.prepare('DELETE FROM config_order_types WHERE id = ?').run(req.params.id);
  logAction('删除业务类型', '人员配置', `业务类型：${row.name}`, req.user.username);
  success(res, null);
});

// 店长管理接口
router.get('/managers', requireRole('admin'), (req, res) => {
  const db = getDb();
  const list = db.prepare('SELECT id, name, username, active, created_at FROM config_managers ORDER BY name').all();
  success(res, list);
});

router.post('/managers', requireRole('admin'), async (req, res) => {
  const { name, username, password } = req.body;
  if (!name || !name.trim()) {
    return badRequest(res, '姓名不能为空');
  }
  if (!username || !username.trim()) {
    return badRequest(res, '登录账号不能为空');
  }
  if (!password || !password.trim()) {
    return badRequest(res, '密码不能为空');
  }
  const db = getDb();
  const existName = db.prepare('SELECT id FROM config_managers WHERE name = ?').get(name.trim());
  if (existName) {
    return badRequest(res, '该姓名已存在');
  }
  const dupUsername = db.prepare('SELECT id FROM config_managers WHERE username = ?').get(username.trim());
  if (dupUsername) {
    return badRequest(res, '该登录账号已被使用');
  }
  const bcrypt = require('bcryptjs');
  const hashedPassword = await bcrypt.hash(password.trim(), 10);
  const result = db.prepare('INSERT INTO config_managers (name, username, password) VALUES (?, ?, ?)').run(
    name.trim(), username.trim(), hashedPassword
  );
  logAction('新增店长', '人员配置', `店长：${name.trim()}，登录账号：${username.trim()}`, req.user.username);
  success(res, { id: result.lastInsertRowid });
});

router.put('/managers/:id', requireRole('admin'), async (req, res) => {
  const { name, username, password, active } = req.body;
  const db = getDb();
  const row = db.prepare('SELECT * FROM config_managers WHERE id = ?').get(req.params.id);
  if (!row) {
    return notFound(res, '店长不存在');
  }
  const updates = [];
  const params = [];
  const logChanges = [];
  if (name !== undefined) {
    const trimmed = String(name).trim();
    if (!trimmed) {
      return badRequest(res, '姓名不能为空');
    }
    const dup = db.prepare('SELECT id FROM config_managers WHERE name = ? AND id != ?').get(trimmed, req.params.id);
    if (dup) {
      return badRequest(res, '该姓名已存在');
    }
    updates.push('name = ?');
    params.push(trimmed);
    logChanges.push(`姓名改为"${trimmed}"`);
  }
  if (username !== undefined) {
    const trimmed = String(username).trim();
    if (!trimmed) {
      return badRequest(res, '登录账号不能为空');
    }
    const dup = db.prepare('SELECT id FROM config_managers WHERE username = ? AND id != ?').get(trimmed, req.params.id);
    if (dup) {
      return badRequest(res, '该登录账号已被使用');
    }
    updates.push('username = ?');
    params.push(trimmed);
    logChanges.push(`登录账号改为"${trimmed}"`);
  }
  if (password !== undefined) {
    if (!password.trim()) {
      return badRequest(res, '密码不能为空');
    }
    const bcrypt = require('bcryptjs');
    const hashedPassword = await bcrypt.hash(password.trim(), 10);
    updates.push('password = ?');
    params.push(hashedPassword);
    logChanges.push('密码已重置');
  }
  if (active !== undefined) {
    updates.push('active = ?');
    params.push(active ? 1 : 0);
    logChanges.push(active ? '启用' : '禁用');
  }
  if (updates.length === 0) {
    return badRequest(res, '没有要更新的字段');
  }
  params.push(req.params.id);
  db.prepare('UPDATE config_managers SET ' + updates.join(', ') + ' WHERE id = ?').run(...params);
  logAction('编辑店长', '人员配置', `店长：${row.name}，${logChanges.join('，')}`, req.user.username);
  success(res, null);
});

router.delete('/managers/:id', requireRole('admin'), (req, res) => {
  const db = getDb();
  const row = db.prepare('SELECT * FROM config_managers WHERE id = ?').get(req.params.id);
  if (!row) {
    return notFound(res, '店长不存在');
  }
  db.prepare('DELETE FROM config_managers WHERE id = ?').run(req.params.id);
  logAction('删除店长', '人员配置', `店长：${row.name}，登录账号：${row.username}`, req.user.username);
  success(res, null);
});

module.exports = router;
