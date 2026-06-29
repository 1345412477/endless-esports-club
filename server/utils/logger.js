const { getDb } = require('../db');

function logAction(action, module, detail, operator) {
  try {
    const db = getDb();
    db.prepare(
      'INSERT INTO operation_logs (action, module, detail, operator) VALUES (?, ?, ?, ?)'
    ).run(action, module, detail || '', operator || 'system');
  } catch (err) {
    console.error('Failed to log action:', err);
  }
}

module.exports = { logAction };
