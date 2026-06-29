const jwt = require('jsonwebtoken');
const { getDb } = require('../db');

const JWT_SECRET = process.env.JWT_SECRET || 'cs-worker-system-secret-key-2026';
const EXPIRES_IN = process.env.JWT_EXPIRES_IN || '24h';

const DEFAULT_USERS = {
  admin: { password: process.env.ADMIN_PASSWORD || 'admin123', role: 'admin' },
};

function createToken(username, role, extra = {}) {
  return jwt.sign({ username, role, ...extra }, JWT_SECRET, { expiresIn: EXPIRES_IN });
}

function authMiddleware(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ code: 1, data: null, message: '未登录' });
  }
  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch (err) {
    return res.status(401).json({ code: 1, data: null, message: 'Token 已过期，请重新登录' });
  }
}

function requireRole(...roles) {
  return (req, res, next) => {
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ code: 1, data: null, message: '无权限' });
    }
    next();
  };
}

module.exports = { JWT_SECRET, DEFAULT_USERS, createToken, authMiddleware, requireRole };
