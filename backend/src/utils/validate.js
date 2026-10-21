const { bad } = require('./http');

function str(v, name, { min = 1, max = 200, optional = false } = {}) {
  if ((v === undefined || v === null || v === '') && optional) return null;
  if (typeof v !== 'string') throw bad(`${name} is required`);
  const s = v.trim();
  if (s.length < min) throw bad(`${name} is required`);
  if (s.length > max) throw bad(`${name} is too long`);
  return s;
}

function num(v, name, { min = -Infinity, max = Infinity, optional = false } = {}) {
  if ((v === undefined || v === null || v === '') && optional) return null;
  const n = Number(v);
  if (!Number.isFinite(n)) throw bad(`${name} must be a number`);
  if (n < min) throw bad(`${name} must be at least ${min}`);
  if (n > max) throw bad(`${name} must be at most ${max}`);
  return n;
}

function oneOf(v, name, list, { optional = false } = {}) {
  if ((v === undefined || v === null || v === '') && optional) return null;
  if (!list.includes(v)) throw bad(`${name} must be one of: ${list.join(', ')}`);
  return v;
}

function password(v) {
  if (typeof v !== 'string' || v.length < 8) throw bad('Password must be at least 8 characters');
  if (v.length > 128) throw bad('Password is too long');
  return v;
}

module.exports = { str, num, oneOf, password };
