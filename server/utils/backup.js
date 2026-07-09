const fs = require('fs');
const path = require('path');
const { DB_PATH } = require('../db');

const BACKUP_DIR = path.join(__dirname, '..', '..', 'backups');
const BACKUP_INTERVAL_MIN = parseInt(process.env.BACKUP_INTERVAL || '60', 10);
const BACKUP_MAX_FILES = parseInt(process.env.BACKUP_MAX_FILES || '168', 10);

function ensureBackupDir() {
  if (!fs.existsSync(BACKUP_DIR)) {
    fs.mkdirSync(BACKUP_DIR, { recursive: true });
  }
}

function formatTimestamp(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  const h = String(date.getHours()).padStart(2, '0');
  const min = String(date.getMinutes()).padStart(2, '0');
  const s = String(date.getSeconds()).padStart(2, '0');
  return `${y}${m}${d}_${h}${min}${s}`;
}

function cleanOldBackups() {
  try {
    const files = fs.readdirSync(BACKUP_DIR)
      .filter(f => f.startsWith('data_') && f.endsWith('.db'))
      .map(f => ({
        name: f,
        time: fs.statSync(path.join(BACKUP_DIR, f)).mtimeMs,
      }))
      .sort((a, b) => b.time - a.time);

    if (files.length > BACKUP_MAX_FILES) {
      const toDelete = files.slice(BACKUP_MAX_FILES);
      for (const f of toDelete) {
        fs.unlinkSync(path.join(BACKUP_DIR, f.name));
        console.log(`[Backup] Removed old backup: ${f.name}`);
      }
    }
  } catch (_) {}
}

function createBackup() {
  if (!fs.existsSync(DB_PATH)) {
    console.warn('[Backup] Database file not found, skipping backup');
    return false;
  }

  ensureBackupDir();

  const timestamp = formatTimestamp(new Date());
  const backupFile = path.join(BACKUP_DIR, `data_${timestamp}.db`);

  try {
    fs.copyFileSync(DB_PATH, backupFile);
    console.log(`[Backup] Created: ${backupFile}`);
    cleanOldBackups();
    return true;
  } catch (err) {
    console.error(`[Backup] Failed: ${err.message}`);
    return false;
  }
}

function startAutoBackup() {
  if (BACKUP_INTERVAL_MIN <= 0) {
    console.log('[Backup] Auto-backup is disabled (BACKUP_INTERVAL <= 0)');
    return;
  }

  console.log(`[Backup] Auto-backup enabled: every ${BACKUP_INTERVAL_MIN} min, max ${BACKUP_MAX_FILES} files`);

  createBackup();

  setInterval(() => {
    createBackup();
  }, BACKUP_INTERVAL_MIN * 60 * 1000);
}

module.exports = { createBackup, startAutoBackup };
