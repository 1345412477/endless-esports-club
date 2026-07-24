// 客户端系统常量定义

// 订单状态
export const ORDER_STATUSES = ['接单中', '已结单', '存单', '退单'];

// 员工状态
export const WORKER_STATUSES = ['在店', '退店', '开除'];

// 员工评级
export const WORKER_RATINGS = ['娱乐', '技术', '大师', '宗师', '明星'];

// 分页
export const DEFAULT_PAGE_SIZE = 5;

// 状态样式映射
export const STATUS_STYLES = {
  '接单中': { background: 'rgba(6,182,212,0.12)', color: '#0891b2', border: '1px solid rgba(6,182,212,0.4)' },
  '已结单': { background: 'rgba(34,197,94,0.12)', color: '#16a34a', border: '1px solid rgba(34,197,94,0.4)' },
  '存单': { background: 'rgba(245,158,11,0.12)', color: '#d97706', border: '1px solid rgba(245,158,11,0.4)' },
  '退单': { background: 'rgba(239,68,68,0.12)', color: '#dc2626', border: '1px solid rgba(239,68,68,0.4)' },
};

export const DEFAULT_STATUS_STYLE = { background: 'var(--bg)', color: 'var(--ink)', border: '1px solid var(--rule)' };
