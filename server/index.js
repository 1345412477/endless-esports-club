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
  app.use('/api', apiLimiter);

  app.use('/api/auth', require('./routes/auth'));
  app.use('/api/orders', authMiddleware, require('./routes/orders'));
  app.use('/api/query', require('./routes/workers'));
  app.use('/api', require('./routes/personnel'));
  app.use('/api/config', authMiddleware, require('./routes/config'));
  app.use('/api/settlement', authMiddleware, require('./routes/settlement'));
  app.use('/api/stats', authMiddleware, require('./routes/stats'));
  app.use('/api/logs', authMiddleware, require('./routes/logs'));

  // 未匹配的 API 返回 JSON 404，避免落到前端 index.html
  app.use('/api', (req, res) => {
    res.status(404).json({ code: 1, data: null, message: '接口不存在' });
  });

  // 静态文件（禁用缓存，确保前端更新立即生效）
  const clientDist = path.join(__dirname, '..', 'client', 'dist');
  app.use(express.static(clientDist, {
    setHeaders: (res, filePath) => {
      const normalized = filePath.replace(/\\/g, '/');
      if (normalized.endsWith('/index.html')) {
        // HTML 入口不缓存，保证每次拿到最新版本
        res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
        res.setHeader('Pragma', 'no-cache');
        res.setHeader('Expires', '0');
      } else if (normalized.includes('/assets/')) {
        // 带哈希的构建产物可以永久缓存
        res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
      } else {
        // 封面视频/海报等静态资源缓存 1 天
        res.setHeader('Cache-Control', 'public, max-age=86400');
      }
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
