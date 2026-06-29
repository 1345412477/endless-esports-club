const { getDb } = require('../db');

function round2(v) {
  return Math.round((Number(v) + Number.EPSILON) * 100) / 100;
}

function getWorkerTotalSalary(db, workerName) {
  const row = db.prepare(`
    SELECT COALESCE(SUM(CAST(o.price / (SELECT COUNT(*) FROM order_workers WHERE order_id = o.id) - ow.deduction_amount AS REAL)), 0) as total
    FROM order_workers ow
    JOIN orders o ON ow.order_id = o.id
    WHERE ow.worker_name = ? AND o.status = '已结单'
  `).get(workerName);
  return round2(row.total);
}

function getWorkerSettledTotal(db, workerName) {
  const row = db.prepare(
    "SELECT COALESCE(SUM(settled_amount), 0) as total FROM settlements WHERE person_name = ? AND person_type = 'worker' AND reversed = 0"
  ).get(workerName);
  return round2(row.total);
}

function recalculateWorkerDeposit(db, workerName) {
  const worker = db.prepare('SELECT deposit, deposit_target FROM config_workers WHERE name = ?').get(workerName);
  if (!worker) return { deposit: 0, deposit_target: 0, added: 0 };

  const target = round2(worker.deposit_target || 0);
  const currentDeposit = round2(worker.deposit || 0);
  if (target <= 0) {
    if (currentDeposit !== 0) {
      db.prepare('UPDATE config_workers SET deposit = 0 WHERE name = ?').run(workerName);
    }
    return { deposit: 0, deposit_target: 0, added: 0 };
  }

  const totalSalary = getWorkerTotalSalary(db, workerName);
  const settledTotal = getWorkerSettledTotal(db, workerName);

  const maxDepositCanHold = round2(Math.max(0, totalSalary - settledTotal));

  let newDeposit = currentDeposit;
  if (newDeposit > maxDepositCanHold) {
    newDeposit = maxDepositCanHold;
  }
  if (newDeposit > target) {
    newDeposit = target;
  }

  if (newDeposit < target) {
    const available = round2(Math.max(0, totalSalary - settledTotal - newDeposit));
    const needed = round2(target - newDeposit);
    const toAdd = round2(Math.min(available, needed));
    newDeposit = round2(newDeposit + toAdd);
  }

  if (round2(newDeposit) !== round2(worker.deposit || 0)) {
    db.prepare('UPDATE config_workers SET deposit = ? WHERE name = ?').run(newDeposit, workerName);
  }

  return { deposit: newDeposit, deposit_target: target, added: round2(newDeposit - currentDeposit) };
}

function recalculateWorkersDeposit(db, workerNames) {
  const results = {};
  for (const name of workerNames) {
    results[name] = recalculateWorkerDeposit(db, name);
  }
  return results;
}

function canOrderStatusChange(db, orderId) {
  const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(orderId);
  if (!order) return { ok: false, message: '单据不存在' };
  if (order.status !== '已结单') return { ok: true };

  const workers = db.prepare(
    'SELECT worker_name, deduction_amount FROM order_workers WHERE order_id = ?'
  ).all(orderId);

  const workerCount = workers.length;
  for (const w of workers) {
    const orderWorkerSalary = round2(order.price / workerCount - w.deduction_amount);
    const totalSalary = getWorkerTotalSalary(db, w.worker_name);
    const settledTotal = getWorkerSettledTotal(db, w.worker_name);
    const newTotal = round2(totalSalary - orderWorkerSalary);
    if (settledTotal > newTotal + 0.01) {
      return {
        ok: false,
        message: `员工【${w.worker_name}】已结算金额(¥${settledTotal.toFixed(2)})超过回退后累计工资(¥${newTotal.toFixed(2)})，请先撤销对应结算记录后再操作`,
      };
    }
  }

  const csTotalRow = db.prepare(
    "SELECT COALESCE(SUM(cs_commission_amount), 0) as total FROM orders WHERE cs_name = ? AND status = '已结单' AND id != ?"
  ).get(order.cs_name, orderId);
  const csSettledRow = db.prepare(
    "SELECT COALESCE(SUM(settled_amount), 0) as total FROM settlements WHERE person_name = ? AND person_type = 'cs' AND reversed = 0"
  ).get(order.cs_name);
  const newCsTotal = round2(csTotalRow.total);
  const csSettled = round2(csSettledRow.total);
  if (csSettled > newCsTotal + 0.01) {
    return {
      ok: false,
      message: `客服【${order.cs_name}】已结算金额(¥${csSettled.toFixed(2)})超过回退后累计提成(¥${newCsTotal.toFixed(2)})，请先撤销对应结算记录后再操作`,
    };
  }

  return { ok: true };
}

module.exports = {
  round2,
  getWorkerTotalSalary,
  getWorkerSettledTotal,
  recalculateWorkerDeposit,
  recalculateWorkersDeposit,
  canOrderStatusChange,
};
