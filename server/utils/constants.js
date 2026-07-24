// 系统常量定义

// 金额相关
const ROUND_TOLERANCE = 0.01; // 金额比较容差
const PERCENTAGE_DIVISOR = 100; // 百分比除数

// 默认比率
const DEFAULT_CS_COMMISSION_RATE = 0.02; // 客服默认提成比例 2%
const DEFAULT_WORKER_DEDUCTION_RATE = 0.20; // 员工默认抽成比例 20%

// 状态
const ORDER_STATUSES = ['接单中', '已结单', '存单', '退单'];
const WORKER_STATUSES = ['在店', '退店', '开除'];
const WORKER_ACTIVE_STATUS = '在店';
const ORDER_SETTLED_STATUS = '已结单';

// 人员类型
const PERSON_TYPE_WORKER = 'worker';
const PERSON_TYPE_CS = 'cs';
const PERSON_TYPE_DEPOSIT_REFUND = 'deposit_refund';

// 分页
const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 50;

// 评级
const WORKER_RATINGS = ['娱乐', '技术', '大师', '宗师', '明星'];

// JWT
const JWT_EXPIRES_IN = '24h';

module.exports = {
  ROUND_TOLERANCE,
  PERCENTAGE_DIVISOR,
  DEFAULT_CS_COMMISSION_RATE,
  DEFAULT_WORKER_DEDUCTION_RATE,
  ORDER_STATUSES,
  WORKER_STATUSES,
  WORKER_ACTIVE_STATUS,
  ORDER_SETTLED_STATUS,
  PERSON_TYPE_WORKER,
  PERSON_TYPE_CS,
  PERSON_TYPE_DEPOSIT_REFUND,
  DEFAULT_PAGE_SIZE,
  MAX_PAGE_SIZE,
  WORKER_RATINGS,
  JWT_EXPIRES_IN,
};
