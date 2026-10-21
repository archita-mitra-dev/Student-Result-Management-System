class HttpError extends Error {
  constructor(status, message, details) {
    super(message);
    this.status = status;
    this.details = details;
  }
}
const bad = (msg, details) => new HttpError(400, msg, details);
const forbidden = (msg = 'You do not have permission to do this') => new HttpError(403, msg);
const notFound = (msg = 'Not found') => new HttpError(404, msg);
const conflict = (msg, details) => new HttpError(409, msg, details);

const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

function toInt(v, name = 'id') {
  const n = Number(v);
  if (!Number.isInteger(n) || n <= 0) throw bad(`Invalid ${name}`);
  return n;
}

function pagination(q, defMax = 50, hardMax = 200) {
  const limit = Math.min(Math.max(parseInt(q.limit || defMax, 10) || defMax, 1), hardMax);
  const page = Math.max(parseInt(q.page || '1', 10) || 1, 1);
  return { limit, offset: (page - 1) * limit, page };
}

module.exports = { HttpError, bad, forbidden, notFound, conflict, wrap, toInt, pagination };
