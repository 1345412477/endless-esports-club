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
  const data = db.sqlDb.export();
  fs.writeFileSync(DB_PATH, Buffer.from(data));
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

    this._migrate();
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
      self.sqlDb.run('BEGIN');
      try {
        const result = fn(...args);
        self.sqlDb.run('COMMIT');
        saveDb();
        return result;
      } catch (e) {
        self.sqlDb.run('ROLLBACK');
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
