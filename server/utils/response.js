// 统一响应工具函数

/**
 * 成功响应
 * @param {object} res - Express response 对象
 * @param {any} data - 响应数据
 * @param {string} message - 响应消息
 */
function success(res, data = null, message = 'ok') {
  return res.json({ code: 0, data, message });
}

/**
 * 错误响应
 * @param {object} res - Express response 对象
 * @param {string} message - 错误消息
 * @param {number} statusCode - HTTP 状态码
 */
function error(res, message, statusCode = 400) {
  return res.status(statusCode).json({ code: 1, data: null, message });
}

/**
 * 参数验证错误
 * @param {object} res - Express response 对象
 * @param {string} message - 错误消息
 */
function badRequest(res, message) {
  return error(res, message, 400);
}

/**
 * 未找到错误
 * @param {object} res - Express response 对象
 * @param {string} message - 错误消息
 */
function notFound(res, message) {
  return error(res, message, 404);
}

/**
 * 未授权错误
 * @param {object} res - Express response 对象
 * @param {string} message - 错误消息
 */
function unauthorized(res, message) {
  return error(res, message, 401);
}

/**
 * 无权限错误
 * @param {object} res - Express response 对象
 * @param {string} message - 错误消息
 */
function forbidden(res, message) {
  return error(res, message, 403);
}

module.exports = {
  success,
  error,
  badRequest,
  notFound,
  unauthorized,
  forbidden,
};
