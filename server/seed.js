const { getDb } = require('./db');

function seed() {
  const db = getDb();

  const csCount = db.prepare('SELECT COUNT(*) as cnt FROM config_cs').get();
  if (csCount.cnt === 0) {
    db.prepare("INSERT INTO config_cs (name) VALUES ('客服小王')").run();
    db.prepare("INSERT INTO config_cs (name) VALUES ('客服小李')").run();
  }

  const workerCount = db.prepare('SELECT COUNT(*) as cnt FROM config_workers').get();
  if (workerCount.cnt === 0) {
    db.prepare("INSERT INTO config_workers (name, default_deduction_rate) VALUES ('员工A', 0.20)").run();
    db.prepare("INSERT INTO config_workers (name, default_deduction_rate) VALUES ('员工B', 0.20)").run();
    db.prepare("INSERT INTO config_workers (name, default_deduction_rate) VALUES ('员工C', 0.20)").run();
  }

  const typesCount = db.prepare('SELECT COUNT(*) as cnt FROM config_order_types').get();
  if (typesCount.cnt === 0) {
    db.prepare("INSERT INTO config_order_types (name) VALUES ('代练')").run();
    db.prepare("INSERT INTO config_order_types (name) VALUES ('陪玩')").run();
    db.prepare("INSERT INTO config_order_types (name) VALUES ('教学')").run();
    db.prepare("INSERT INTO config_order_types (name) VALUES ('上分')").run();
  }

  const existing = csCount.cnt > 0 || workerCount.cnt > 0;
  if (!existing) {
    console.log('数据库已初始化种子数据');
  } else {
    console.log('数据库已存在，跳过种子数据');
  }
}

module.exports = { seed };
