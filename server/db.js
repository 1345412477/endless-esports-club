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
      this.sqlDb.run("UPDATE config_workers SET manual_deposit_base = deposit WHERE manual_deposit_base = 0 AND deposit > 0");
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
