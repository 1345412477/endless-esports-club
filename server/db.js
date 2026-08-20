const initSqlJs = require('sql.js');
const fs = require('fs');
const path = require('path');

const DB_PATH = path.join(__dirname, '..', 'data.db');

let db = null;
let SQL = null;

function rowToObject(stmt) {
  const cols = stmt.getColumnNames();
  const vals = stmt.get();
  const obj = {};
  cols.forEach((col, i) => {
    obj[col] = vals[i];
  });
  return obj;
}

function saveDb() {
  if (!db || !db.sqlDb) return;
  try {
    const data = db.sqlDb.export();
    fs.writeFileSync(DB_PATH, Buffer.from(data));
  } catch (err) {
    console.error('[DB] Failed to save database:', err.message);
  }
}

class StmtWrapper {
  constructor(sqlDb, sqlStr) {
    this.sqlDb = sqlDb;
    this.sqlStr = sqlStr;
  }

  run(...params) {
    this.sqlDb.run(this.sqlStr, params);
    const rowsModified = this.sqlDb.getRowsModified();
    let lastId = 0;
    let stmt;
    try {
      stmt = this.sqlDb.prepare('SELECT last_insert_rowid()');
      stmt.step();
      lastId = stmt.get()[0];
    } finally {
      if (stmt) stmt.free();
    }
    return { changes: rowsModified, lastInsertRowid: lastId };
  }

  get(...params) {
    let stmt;
    try {
      stmt = this.sqlDb.prepare(this.sqlStr);
      if (params.length > 0) stmt.bind(params);
      if (stmt.step()) {
        return rowToObject(stmt);
      }
      return undefined;
    } finally {
      if (stmt) stmt.free();
    }
  }

  all(...params) {
    const results = [];
    let stmt;
    try {
      stmt = this.sqlDb.prepare(this.sqlStr);
      if (params.length > 0) stmt.bind(params);
      while (stmt.step()) {
        results.push(rowToObject(stmt));
      }
      return results;
    } finally {
      if (stmt) stmt.free();
    }
  }
}

class DbWrapper {
  constructor(sqlDb) {
    this.sqlDb = sqlDb;
  }

  _initTables() {
    this.sqlDb.run(`
      CREATE TABLE IF NOT EXISTS config_managers (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT UNIQUE NOT NULL,
        username TEXT UNIQUE NOT NULL,
        password TEXT NOT NULL,
        active INTEGER DEFAULT 1,
        created_at TEXT DEFAULT (datetime('now','localtime'))
      )
    `);
    this.sqlDb.run(`
      CREATE TABLE IF NOT EXISTS config_cs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT UNIQUE NOT NULL,
        commission_rate REAL DEFAULT 0.02,
        active INTEGER DEFAULT 1
      )
    `);
    this.sqlDb.run(`
      CREATE TABLE IF NOT EXISTS config_workers (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT UNIQUE NOT NULL,
        default_deduction_rate REAL DEFAULT 0.20,
        rating TEXT DEFAULT '',
        status TEXT DEFAULT '在店',
        deposit REAL DEFAULT 0
      )
    `);
    this.sqlDb.run(`
      CREATE TABLE IF NOT EXISTS config_order_types (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT UNIQUE NOT NULL,
        active INTEGER DEFAULT 1
      )
    `);
    this.sqlDb.run(`
      CREATE TABLE IF NOT EXISTS orders (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        serial_no TEXT DEFAULT '',
        cs_name TEXT NOT NULL,
        order_type TEXT NOT NULL,
        customer_name TEXT DEFAULT '',
        remark TEXT DEFAULT '',
        price REAL NOT NULL,
        status TEXT NOT NULL DEFAULT '接单中',
        cs_commission_rate REAL DEFAULT 0.02,
        cs_commission_amount REAL NOT NULL,
        referrer_name TEXT DEFAULT '',
        referrer_type TEXT DEFAULT '',
        referrer_rate REAL DEFAULT 0,
        referrer_amount REAL DEFAULT 0,
        created_at TEXT DEFAULT (datetime('now','localtime')),
        updated_at TEXT DEFAULT (datetime('now','localtime'))
      )
    `);
    this.sqlDb.run(`
      CREATE TABLE IF NOT EXISTS order_serial_seq (
        date_key TEXT PRIMARY KEY,
        next_seq INTEGER DEFAULT 1
      )
    `);
    this.sqlDb.run(`
      CREATE TABLE IF NOT EXISTS order_workers (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        order_id INTEGER NOT NULL,
        worker_name TEXT NOT NULL,
        deduction_rate REAL NOT NULL,
        deduction_amount REAL NOT NULL,
        FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE
      )
    `);
    this.sqlDb.run(`
      CREATE TABLE IF NOT EXISTS settlements (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        person_name TEXT NOT NULL,
        person_type TEXT NOT NULL,
        settled_amount REAL NOT NULL,
        settled_by TEXT NOT NULL,
        remark TEXT DEFAULT '',
        reversed INTEGER DEFAULT 0,
        reversed_at TEXT DEFAULT '',
        settled_at TEXT DEFAULT (datetime('now','localtime'))
      )
    `);
    this.sqlDb.run(`
      CREATE TABLE IF NOT EXISTS operation_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        action TEXT NOT NULL,
        module TEXT NOT NULL,
        detail TEXT DEFAULT '',
        operator TEXT NOT NULL,
        created_at TEXT DEFAULT (datetime('now','localtime'))
      )
    `);

    this._createIndexes();
    this._migrate();
  }

  _createIndexes() {
    // 订单表索引
    this.sqlDb.run('CREATE INDEX IF NOT EXISTS idx_orders_cs_name ON orders(cs_name)');
    this.sqlDb.run('CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status)');
    this.sqlDb.run('CREATE INDEX IF NOT EXISTS idx_orders_created_at ON orders(created_at)');

    // 订单员工关联表索引
    this.sqlDb.run('CREATE INDEX IF NOT EXISTS idx_order_workers_order_id ON order_workers(order_id)');
    this.sqlDb.run('CREATE INDEX IF NOT EXISTS idx_order_workers_worker_name ON order_workers(worker_name)');

    // 结算表索引
    this.sqlDb.run('CREATE INDEX IF NOT EXISTS idx_settlements_person ON settlements(person_name, person_type)');
    this.sqlDb.run('CREATE INDEX IF NOT EXISTS idx_settlements_reversed ON settlements(reversed)');

    // 操作日志表索引
    this.sqlDb.run('CREATE INDEX IF NOT EXISTS idx_operation_logs_created_at ON operation_logs(created_at)');
    this.sqlDb.run('CREATE INDEX IF NOT EXISTS idx_operation_logs_module ON operation_logs(module)');
  }

  _migrate() {
    try {
      this.sqlDb.run("ALTER TABLE config_cs ADD COLUMN commission_rate REAL DEFAULT 0.02");
    } catch (_) {}
    try {
      this.sqlDb.run("ALTER TABLE config_workers ADD COLUMN rating TEXT DEFAULT ''");
    } catch (_) {}
    try {
      this.sqlDb.run("ALTER TABLE config_workers ADD COLUMN status TEXT DEFAULT '在店'");
    } catch (_) {}
    try {
      this.sqlDb.run("ALTER TABLE config_workers ADD COLUMN deposit REAL DEFAULT 0");
    } catch (_) {}
    try {
      this.sqlDb.run("ALTER TABLE config_workers ADD COLUMN deposit_target REAL DEFAULT 0");
    } catch (_) {}
    try {
      this.sqlDb.run("ALTER TABLE settlements ADD COLUMN remark TEXT DEFAULT ''");
    } catch (_) {}
    try {
      this.sqlDb.run("ALTER TABLE settlements ADD COLUMN reversed INTEGER DEFAULT 0");
    } catch (_) {}
    try {
      this.sqlDb.run("ALTER TABLE settlements ADD COLUMN reversed_at TEXT DEFAULT ''");
    } catch (_) {}
    try {
      this.sqlDb.run("ALTER TABLE config_cs ADD COLUMN username TEXT DEFAULT ''");
    } catch (_) {}
    try {
      this.sqlDb.run("ALTER TABLE config_cs ADD COLUMN password TEXT DEFAULT ''");
    } catch (_) {}
    try {
      this.sqlDb.run("ALTER TABLE config_workers ADD COLUMN manual_adjustment REAL DEFAULT 0");
    } catch (_) {}
    try {
      this.sqlDb.run("ALTER TABLE config_workers ADD COLUMN manual_unsettled REAL DEFAULT 0");
    } catch (_) {}
    try {
      this.sqlDb.run("ALTER TABLE config_workers ADD COLUMN manual_deposit_base REAL DEFAULT 0");
    } catch (_) {}
    try {
      this.sqlDb.run("ALTER TABLE orders ADD COLUMN serial_no TEXT DEFAULT ''");
    } catch (_) {}
    try {
      this.sqlDb.run(`
        CREATE TABLE IF NOT EXISTS order_serial_seq (
          date_key TEXT PRIMARY KEY,
          next_seq INTEGER DEFAULT 1
        )
      `);
    } catch (_) {}
    try {
      this.sqlDb.run("ALTER TABLE orders ADD COLUMN referrer_name TEXT DEFAULT ''");
    } catch (_) {}
    try {
      this.sqlDb.run("ALTER TABLE orders ADD COLUMN referrer_type TEXT DEFAULT ''");
    } catch (_) {}
    try {
      this.sqlDb.run("ALTER TABLE orders ADD COLUMN referrer_rate REAL DEFAULT 0");
    } catch (_) {}
    try {
      this.sqlDb.run("ALTER TABLE orders ADD COLUMN referrer_amount REAL DEFAULT 0");
    } catch (_) {}

    // 修正历史版本冻结的押金基线（一次性）
    this._correctFrozenDepositBase();
  }

  // 修正历史冻结的押金基线（一次性迁移，用 schema_migrations 表保证只执行一次）
  // 背景：老版本每次启动都会执行 "manual_deposit_base = deposit WHERE manual_deposit_base = 0 AND deposit > 0"，
  // 把订单自动填充的押金误固化为手工基线，导致待结算工资虚高、结算多付。
  // 修正方式：按操作日志回放每位员工最后一次手工押金操作（改押金/编辑押金/押金退还），
  // 重建正确基线；从未手工设置过押金的员工基线归零（其押金全部来自订单自动填充）。
  _correctFrozenDepositBase() {
    this.sqlDb.run(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        name TEXT PRIMARY KEY,
        applied_at TEXT DEFAULT (datetime('now','localtime'))
      )
    `);
    const guard = this.prepare("SELECT COUNT(*) as cnt FROM schema_migrations WHERE name = ?").get('fix_frozen_deposit_base_20260820');
    if (guard && guard.cnt > 0) return;

    try {
      // 操作日志不随员工改名联动，先建立 历史名 → 新名 的改名链
      const successor = {};
      const renameRows = this.prepare(
        "SELECT detail FROM operation_logs WHERE action = '编辑员工' AND detail LIKE '%姓名改为%' ORDER BY created_at"
      ).all();
      for (const row of renameRows) {
        const m = String(row.detail || '').match(/^员工：(.*?)，.*姓名改为"(.*?)"/);
        if (m && m[1] !== m[2]) successor[m[1]] = m[2];
      }
      const resolveName = (name) => {
        let cur = name;
        let hops = 0;
        while (successor[cur] !== undefined && hops++ < 100) cur = successor[cur];
        return cur;
      };

      // 按时间顺序回放押金相关日志，重建每位员工（映射到当前姓名）的手工押金基线
      const bases = {};
      const logs = this.prepare(
        "SELECT action, detail FROM operation_logs WHERE action IN ('修改押金', '押金全额退还', '编辑员工') ORDER BY created_at"
      ).all();
      for (const log of logs) {
        const text = String(log.detail || '');
        if (log.action === '修改押金') {
          const m = text.match(/^员工：(.*?)，原押金：¥[\d.]+，新押金：¥([\d.]+)$/);
          if (m) bases[resolveName(m[1])] = parseFloat(m[2]);
        } else if (log.action === '押金全额退还') {
          const m = text.match(/^员工：(.*?)，退还押金/);
          if (m) bases[resolveName(m[1])] = 0;
        } else {
          const nameMatch = text.match(/^员工：(.*?)，/);
          const depositMatch = text.match(/押金改为¥([\d.]+)/);
          if (nameMatch && depositMatch) bases[resolveName(nameMatch[1])] = parseFloat(depositMatch[1]);
        }
      }

      // 应用修正后的基线
      let fixedCount = 0;
      const workers = this.prepare('SELECT name, manual_deposit_base FROM config_workers').all();
      for (const worker of workers) {
        const correctBase = Number(bases[worker.name] !== undefined ? bases[worker.name] : 0);
        const currentBase = Number(worker.manual_deposit_base || 0);
        if (Math.abs(correctBase - currentBase) > 0.001) {
          this.prepare('UPDATE config_workers SET manual_deposit_base = ? WHERE name = ?').run(correctBase, worker.name);
          fixedCount++;
          console.log(`[Migration] 员工【${worker.name}】押金基线修正：¥${currentBase.toFixed(2)} → ¥${correctBase.toFixed(2)}`);
        }
      }

      this.sqlDb.run("INSERT INTO schema_migrations (name) VALUES ('fix_frozen_deposit_base_20260820')");
      console.log(`[Migration] 押金基线修正完成，共修正 ${fixedCount} 名员工（在店员工押金余额随后自动重算）`);
    } catch (err) {
      console.error('[Migration] 押金基线修正失败，将在下次启动重试：', err.message);
    }
  }

  prepare(sql) {
    return new StmtWrapper(this.sqlDb, sql);
  }

  exec(sql) {
    this.sqlDb.run(sql);
  }

  transaction(fn) {
    const self = this;
    return (...args) => {
      // 检查是否已在事务中（嵌套事务支持）
      const inTransaction = self._inTransaction;
      if (!inTransaction) {
        self.sqlDb.run('BEGIN');
        self._inTransaction = true;
      }
      try {
        const result = fn(...args);
        if (!inTransaction) {
          self.sqlDb.run('COMMIT');
          self._inTransaction = false;
          saveDb();
        }
        return result;
      } catch (e) {
        if (!inTransaction) {
          self.sqlDb.run('ROLLBACK');
          self._inTransaction = false;
        }
        throw e;
      }
    };
  }

  pragma(key) {
    this.sqlDb.run(`PRAGMA ${key}`);
  }
}

function loadDb() {
  return initSqlJs().then(sql => {
    SQL = sql;
    let sqlDb;
    if (fs.existsSync(DB_PATH)) {
      const buffer = fs.readFileSync(DB_PATH);
      sqlDb = new SQL.Database(buffer);
    } else {
      sqlDb = new SQL.Database();
    }
    db = new DbWrapper(sqlDb);
    db._initTables();
    saveDb();
    return db;
  });
}

function getDb() {
  return db;
}

function setDb(dbInstance) {
  db = dbInstance;
}

module.exports = { loadDb, getDb, setDb, saveDb, DB_PATH };
