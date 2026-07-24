const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { getDb } = require('../db');
const { JWT_EXPIRES_IN } = require('../utils/constants');
const { unauthorized, forbidden } = require('../utils/response');

const JWT_SECRET = process.env.JWT_SECRET || 'cs-worker-system-secret-key-2026';

const DEFAULT_USERS = {
  admin: { password: process.env.ADMIN_PASSWORD || 'admin123', role: 'admin' },
};

function createToken(username, role, extra = {}) {
  return jwt.sign({ username, role, ...extra }, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
}

function authMiddleware(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return unauthorized(res, '未登录');
  }
  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch (err) {
    return unauthorized(res, 'Token 已过期，请重新登录');
  }
}

function requireRole(...roles) {
  return (req, res, next) => {
    if (!roles.includes(req.user.role)) {
      return forbidden(res, '无权限');
    }
    next();
  };
}

/** 对明文密码进行哈希 */
async function hashPassword(password) {
  return bcrypt.hash(password, 10);
}

/** 校验密码（兼容明文旧数据和 bcrypt 哈希） */
async function verifyPassword(input, stored) {
  if (!stored) return false;
  // 旧数据为明文，直接比较
  if (!stored.startsWith('$2a$') && !stored.startsWith('$2b$')) {
    return input === stored;
  }
  return bcrypt.compare(input, stored);
}

/** 判断存储的密码是否已加密 */
function isPasswordHashed(stored) {
  return stored && (stored.startsWith('$2a$') || stored.startsWith('$2b$'));
}

module.exports = { JWT_SECRET, DEFAULT_USERS, createToken, authMiddleware, requireRole, hashPassword, verifyPassword, isPasswordHashed };
