// Test helpers. Uses a separate database so development data is never touched.
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL || 'postgres://srms:srms_dev@localhost:5432/srms_test';
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-secret';
process.env.LOGIN_RATE_LIMIT = '1000';
process.env.FRONTEND_URL = 'http://localhost:5173';

const fs = require('fs');
const path = require('path');
const http = require('http');
const { pool } = require('../src/db/pool');
const { createApp } = require('../src/app');

async function resetDb() {
  await pool.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
  const dir = path.join(__dirname, '..', '..', 'database', 'migrations');
  for (const f of fs.readdirSync(dir).filter((x) => x.endsWith('.sql')).sort()) await pool.query(fs.readFileSync(path.join(dir, f), 'utf8'));
}

async function startServer() {
  const app = createApp();
  const server = http.createServer(app);
  await new Promise((r) => server.listen(0, r));
  const base = `http://127.0.0.1:${server.address().port}`;
  const call = async (method, url, { token, body, raw } = {}) => {
    const res = await fetch(base + url, {
      method,
      headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (raw) return res;
    let json = null;
    try { json = await res.json(); } catch (_) { /* no body */ }
    return { status: res.status, body: json };
  };
  const login = async (id, password) => (await call('POST', '/api/auth/login', { body: { login_id: id, password } })).body.token;
  return { base, call, login, close: () => new Promise((r) => server.close(r)) };
}

module.exports = { resetDb, startServer, pool };
