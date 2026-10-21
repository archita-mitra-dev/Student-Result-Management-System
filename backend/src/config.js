require('dotenv').config();

const isProd = process.env.NODE_ENV === 'production';

function required(name) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required environment variable ${name}`);
  return v;
}

module.exports = {
  isProd,
  port: parseInt(process.env.PORT || '4000', 10),
  databaseUrl: process.env.DATABASE_URL || (isProd ? required('DATABASE_URL') : 'postgres://srms:srms_dev@localhost:5432/srms'),
  jwtSecret: process.env.JWT_SECRET || (isProd ? required('JWT_SECRET') : 'dev-only-secret-change-me'),
  jwtExpires: process.env.JWT_EXPIRES || '8h',
  frontendUrls: (process.env.FRONTEND_URL || 'http://localhost:5173').split(',').map((s) => s.trim()).filter(Boolean),
  allowNullOrigin: process.env.ALLOW_DESKTOP_ORIGIN === 'true', // Electron file:// origin
  setupToken: process.env.SETUP_TOKEN || '',
  dbSsl: process.env.DATABASE_SSL === 'true' || /sslmode=require/.test(process.env.DATABASE_URL || ''),
};
