const express = require('express');
const cors = require('cors');
const path = require('path');
const rateLimit = require('express-rate-limit');
const { loadDb, setDb, saveDb } = require('./db');
const { authMiddleware } = require('./middleware/auth');
const { startAutoBackup } = require('./utils/backup');

async function main() {
  const db = await loadDb();
  setDb(db);

  const { seed } = require('./seed');
  seed();

  const app = express();
  const PORT = process.env.PORT || 3000;

  app.use(cors());
  app.use(express.json());

  // 登录接口频率限制：15分钟内最多5次
  const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 5,
    handler: (req, res) => {
      res.status(429).json({ code: 1, data: null, message: '登录尝试过于频繁，请稍后再试' });
    },
    standardHeaders: true,
    legacyHeaders: false,
  });

  // 通用API频率限制：每分钟100次
  const apiLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 100,
    handler: (req, res) => {
      res.status(429).json({ code: 1, data: null, message: '请求过于频繁，请稍后再试' });
    },
    standardHeaders: true,
    legacyHeaders: false,
  });

  // 写操作后自动保存数据库
  app.use((req, res, next) => {
    res.on('finish', () => {
      if (['POST', 'PUT', 'DELETE', 'PATCH'].includes(req.method)) {
        saveDb();
      }
    });
    next();
  });

  // 定时保存（兜底）
  setInterval(() => {
    try { saveDb(); } catch (_) {}
  }, 30000);

  // 路由
  app.use('/api/auth/login', loginLimiter);
  app.use('/api', apiLimiter);

  app.use('/api/auth', require('./routes/auth'));
  app.use('/api/orders', authMiddleware, require('./routes/orders'));
  app.use('/api/query', require('./routes/workers'));
  app.use('/api', require('./routes/personnel'));
  app.use('/api/config', authMiddleware, require('./routes/config'));
  app.use('/api/settlement', authMiddleware, require('./routes/settlement'));
  app.use('/api/stats', authMiddleware, require('./routes/stats'));
  app.use('/api/logs', authMiddleware, require('./routes/logs'));

  // 静态文件（禁用缓存，确保前端更新立即生效）
  const clientDist = path.join(__dirname, '..', 'client', 'dist');
  app.use(express.static(clientDist, {
    setHeaders: (res) => {
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');
    },
  }));
  app.get('*', (req, res) => {
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.sendFile(path.join(clientDist, 'index.html'));
  });

  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    startAutoBackup();
  });
}

main().catch(err => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
