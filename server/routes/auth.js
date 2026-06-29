const express = require('express');
const { DEFAULT_USERS, createToken } = require('../middleware/auth');
const { getDb } = require('../db');

const router = express.Router();

router.post('/login', (req, res) => {
  const { username, password, role } = req.body;
  if (!username || !password || !role) {
    return res.status(400).json({ code: 1, data: null, message: '用户名、密码和角色不能为空' });
  }

  if (role === 'admin') {
    const user = DEFAULT_USERS[username];
    if (!user || user.password !== password || user.role !== role) {
      return res.status(400).json({ code: 1, data: null, message: '用户名或密码错误' });
    }
    const token = createToken(username, role, { csName: null });
    return res.json({ code: 0, data: { token, username, role, displayName: username }, message: 'ok' });
  }

  if (role === 'cs') {
    const db = getDb();
    const csRow = db.prepare(
      'SELECT name, username, password, active FROM config_cs WHERE username = ? AND username IS NOT NULL AND username != ?'
    ).get(username, '');
    if (!csRow || csRow.password !== password) {
      return res.status(400).json({ code: 1, data: null, message: '用户名或密码错误' });
    }
    if (!csRow.active) {
      return res.status(400).json({ code: 1, data: null, message: '该账号已被禁用，请联系管理员' });
    }
    const token = createToken(username, role, { csName: csRow.name });
    return res.json({ code: 0, data: { token, username, role, displayName: csRow.name }, message: 'ok' });
  }

  return res.status(400).json({ code: 1, data: null, message: '角色无效' });
});

router.get('/verify', (req, res) => {
  res.json({ code: 0, data: { username: req.user.username, role: req.user.role, displayName: req.user.csName || req.user.username }, message: 'ok' });
});

module.exports = router;
