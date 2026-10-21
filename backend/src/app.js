const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const config = require('./config');
const { query } = require('./db/pool');
const routes = require('./routes');
const { notFoundHandler, errorHandler } = require('./middleware/errors');

function createApp() {
  const app = express();
  app.set('trust proxy', 1); // Render sits behind a proxy
  app.disable('x-powered-by');
  app.use(helmet());
  app.use(cors({
    origin(origin, cb) {
      if (!origin) return cb(null, true); // curl, health checks, server to server
      if (config.frontendUrls.includes(origin)) return cb(null, true);
      if (origin === 'null' && config.allowNullOrigin) return cb(null, true);
      return cb(null, false);
    },
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    exposedHeaders: ['Content-Disposition'],
    maxAge: 600,
  }));
  app.use(express.json({ limit: '3mb' }));
  app.use(rateLimit({ windowMs: 60 * 1000, limit: 600, standardHeaders: true, legacyHeaders: false }));

  app.get('/health', (req, res) => res.json({ status: 'ok' }));
  app.get('/health/db', async (req, res) => {
    try { await query('SELECT 1'); res.json({ status: 'ok', database: 'connected' }); }
    catch (e) { res.status(503).json({ status: 'degraded', database: 'unavailable' }); }
  });
  app.use('/api', routes);
  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
module.exports = { createApp };
