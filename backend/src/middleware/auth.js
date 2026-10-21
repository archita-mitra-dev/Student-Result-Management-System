const jwt = require('jsonwebtoken');
const config = require('../config');
const { query } = require('../db/pool');
const { HttpError, forbidden } = require('../utils/http');

async function authenticate(req, res, next) {
  try {
    const h = req.headers.authorization || '';
    const token = h.startsWith('Bearer ') ? h.slice(7) : null;
    if (!token) throw new HttpError(401, 'Please log in');
    let payload;
    try { payload = jwt.verify(token, config.jwtSecret); } catch { throw new HttpError(401, 'Session expired, please log in again'); }
    const { rows } = await query('SELECT id, login_id, role, full_name, email, is_active, must_change_pw FROM users WHERE id=$1', [payload.sub]);
    const u = rows[0];
    if (!u || !u.is_active) throw new HttpError(401, 'Account is inactive or unauthorized');
    req.user = u;
    next();
  } catch (e) { next(e); }
}

// Backend enforced role check. Hiding a button in the UI is never relied on.
const requireRole = (...roles) => (req, res, next) => {
  if (!req.user || !roles.includes(req.user.role)) return next(forbidden());
  next();
};

module.exports = { authenticate, requireRole };
