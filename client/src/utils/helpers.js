// 通用工具函数

import { STATUS_STYLES, DEFAULT_STATUS_STYLE } from './constants';

/**
 * 格式化日期时间字符串
 * @param {string} d - ISO 格式日期字符串
 * @returns {string} 格式化后的日期时间 'YYYY-MM-DD HH:mm'
 */
export function formatDate(d) {
  if (!d) return '-';
  return d.slice(0, 16).replace('T', ' ');
}

/**
 * 格式化金额数值
 * @param {number|string} v - 金额值
 * @returns {string} 格式化后的金额字符串，保留两位小数
 */
export function formatMoney(v) {
  if (v == null) return '0';
  return Number(v).toFixed(2);
}

/**
 * 获取订单状态的样式对象
 * @param {string} status - 订单状态
 * @returns {object} 样式对象
 */
export function getStatusStyle(status) {
  return STATUS_STYLES[status] || DEFAULT_STATUS_STYLE;
}
