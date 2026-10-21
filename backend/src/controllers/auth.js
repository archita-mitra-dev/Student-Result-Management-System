const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const config = require('../config');
const { query, tx } = require('../db/pool');
const { HttpError, bad } = require('../utils/http');
const { str, password } = require('../utils/validate');
const { audit } = require('../utils/audit');

const DETAILED = process.env.SRS_DETAILED_LOGIN_ERRORS === 'true';
// A hash used to keep response timing similar when the user does not exist.
const DUMMY_HASH = bcrypt.hashSync('not-a-real-password', 10);

function sign(u) {
  return jwt.sign({ sub: u.id, role: u.role }, config.jwtSecret, { expiresIn: config.jwtExpires });
}
const publicUser = (u) => ({ id: u.id, login_id: u.login_id, role: u.role, full_name: u.full_name, email: u.email, must_change_pw: u.must_change_pw });

async function login(req, res) {
  const login_id = str(req.body.login_id, 'User ID', { max: 60 });
  const pw = typeof req.body.password === 'string' ? req.body.password : '';
  if (!pw) throw bad('Password is required');
  const u = (await query('SELECT * FROM users WHERE lower(login_id)=lower($1)', [login_id])).rows[0];
  if (!u) {
    await bcrypt.compare(pw, DUMMY_HASH);
    throw new HttpError(401, DETAILED ? 'Invalid User ID' : 'Invalid User ID or password');
  }
  const ok = await bcrypt.compare(pw, u.password_hash);
  if (!ok) throw new HttpError(401, DETAILED ? 'Incorrect Password' : 'Invalid User ID or password');
  if (!u.is_active) throw new HttpError(403, 'Access denied. This account is inactive or unauthorized.');
  res.json({ token: sign(u), user: publicUser(u) });
}

async function me(req, res) { res.json({ user: publicUser(req.user) }); }

async function changePassword(req, res) {
  const { current_password: cur, new_password: next } = req.body;
  password(next);
  const u = (await query('SELECT * FROM users WHERE id=$1', [req.user.id])).rows[0];
  if (!(await bcrypt.compare(String(cur || ''), u.password_hash))) throw new HttpError(401, 'Current password is incorrect');
  if (cur === next) throw bad('Choose a password different from the current one');
  const hash = await bcrypt.hash(next, 10);
  await tx(async (c) => {
    await c.query('UPDATE users SET password_hash=$2, must_change_pw=FALSE, updated_at=now() WHERE id=$1', [u.id, hash]);
    await audit(c, req.user, 'user.change_password', 'user', u.id);
  });
  res.json({ changed: true });
}

// One-time administrator setup. Works only while no administrator exists and a SETUP_TOKEN is configured.
async function setupStatus(req, res) {
  const n = (await query(`SELECT COUNT(*)::int AS n FROM users WHERE role='admin'`)).rows[0].n;
  res.json({ needs_setup: n === 0 && !!config.setupToken });
}
async function setupAdmin(req, res) {
  const n = (await query(`SELECT COUNT(*)::int AS n FROM users WHERE role='admin'`)).rows[0].n;
  if (n > 0 || !config.setupToken) throw new HttpError(403, 'Setup is not available');
  const a = Buffer.from(String(req.body.token || ''));
  const b = Buffer.from(config.setupToken);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) throw new HttpError(403, 'Invalid setup token');
  const login_id = str(req.body.login_id, 'Login ID', { max: 40 });
  const full_name = str(req.body.full_name, 'Name');
  const hash = await bcrypt.hash(password(req.body.password), 10);
  await tx(async (c) => {
    const r = await c.query(`INSERT INTO users (login_id, password_hash, role, full_name) VALUES ($1,$2,'admin',$3) RETURNING id`, [login_id, hash, full_name]);
    await audit(c, { id: r.rows[0].id, full_name, login_id }, 'admin.setup', 'user', r.rows[0].id);
  });
  res.status(201).json({ created: true });
}

module.exports = { login, me, changePassword, setupStatus, setupAdmin };
