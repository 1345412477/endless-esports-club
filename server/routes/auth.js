const express = require('express');
const { DEFAULT_USERS, createToken, verifyPassword } = require('../middleware/auth');
const { getDb } = require('../db');
const { success, badRequest } = require('../utils/response');

const router = express.Router();

router.post('/login', async (req, res) => {
  const { username, password, role } = req.body;
  if (!username || !password || !role) {
    return badRequest(res, '用户名、密码和角色不能为空');
  }

  if (role === 'admin') {
    const user = DEFAULT_USERS[username];
    if (!user || user.password !== password || user.role !== role) {
      return badRequest(res, '用户名或密码错误');
    }
    const token = createToken(username, role, { csName: null });
    return success(res, { token, username, role, displayName: username });
  }

  if (role === 'cs') {
    const db = getDb();
    const csRow = db.prepare(
      'SELECT name, username, password, active FROM config_cs WHERE username = ? AND username IS NOT NULL AND username != ?'
    ).get(username, '');
    if (!csRow) {
      return badRequest(res, '用户名或密码错误');
    }
    const passwordValid = await verifyPassword(password, csRow.password);
    if (!passwordValid) {
      return badRequest(res, '用户名或密码错误');
    }
    if (!csRow.active) {
      return badRequest(res, '该账号已被禁用，请联系管理员');
    }
    const token = createToken(username, role, { csName: csRow.name });
    return success(res, { token, username, role, displayName: csRow.name });
  }

  if (role === 'manager') {
    const db = getDb();
    const managerRow = db.prepare(
      'SELECT name, username, password, active FROM config_managers WHERE username = ?'
    ).get(username);
    if (!managerRow) {
      return badRequest(res, '用户名或密码错误');
    }
    const passwordValid = await verifyPassword(password, managerRow.password);
    if (!passwordValid) {
      return badRequest(res, '用户名或密码错误');
    }
    if (!managerRow.active) {
      return badRequest(res, '该账号已被禁用，请联系管理员');
    }
    const token = createToken(username, role, { managerName: managerRow.name });
    return success(res, { token, username, role, displayName: managerRow.name });
  }

  return badRequest(res, '角色无效');
});

router.get('/verify', (req, res) => {
  const displayName = req.user.csName || req.user.managerName || req.user.username;
  success(res, { username: req.user.username, role: req.user.role, displayName });
});

module.exports = router;
