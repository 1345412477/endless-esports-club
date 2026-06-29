const express = require('express');
const cors = require('cors');
const path = require('path');
const { loadDb, setDb, saveDb } = require('./db');
const { authMiddleware } = require('./middleware/auth');

async function main() {
  const db = await loadDb();
  setDb(db);

  const { seed } = require('./seed');
  seed();

  const app = express();
  const PORT = process.env.PORT || 3000;

  app.use(cors());
  app.use(express.json());

  app.use((req, res, next) => {
    res.on('finish', () => {
      if (['POST', 'PUT', 'DELETE', 'PATCH'].includes(req.method)) {
        saveDb();
      }
    });
    next();
  });

  setInterval(() => {
    try { saveDb(); } catch (_) {}
  }, 30000);

  app.use('/api/auth', require('./routes/auth'));

  app.use('/api/orders', authMiddleware, require('./routes/orders'));

  app.use('/api/query', require('./routes/workers'));

  app.use('/api', require('./routes/personnel'));

  app.use('/api/config', authMiddleware, require('./routes/config'));

  app.use('/api/settlement', authMiddleware, require('./routes/settlement'));

  app.use('/api/stats', authMiddleware, require('./routes/stats'));

  app.use('/api/logs', authMiddleware, require('./routes/logs'));

  const clientDist = path.join(__dirname, '..', 'client', 'dist');
  app.use(express.static(clientDist));
  app.get('*', (req, res) => {
    res.sendFile(path.join(clientDist, 'index.html'));
  });

  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

main().catch(err => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
