// Creates the first administrator. Usage:
//   ADMIN_LOGIN=registrar ADMIN_NAME="Registrar" ADMIN_PASSWORD='a-long-password' npm run create-admin
const bcrypt = require('bcryptjs');
const { pool } = require('../src/db/pool');

async function main() {
  const login = process.env.ADMIN_LOGIN;
  const name = process.env.ADMIN_NAME || login;
  const pw = process.env.ADMIN_PASSWORD;
  if (!login || !pw) throw new Error('Set ADMIN_LOGIN and ADMIN_PASSWORD (at least 10 characters)');
  if (pw.length < 10) throw new Error('ADMIN_PASSWORD must be at least 10 characters');
  const hash = await bcrypt.hash(pw, 10);
  const r = await pool.query(`INSERT INTO users (login_id, password_hash, role, full_name) VALUES ($1,$2,'admin',$3) ON CONFLICT (login_id) DO NOTHING RETURNING id`, [login, hash, name]);
  console.log(r.rows[0] ? `Administrator "${login}" created.` : `A user with login "${login}" already exists. Nothing changed.`);
  await pool.end();
}
main().catch((e) => { console.error(e.message); process.exit(1); });
