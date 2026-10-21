const { HttpError } = require('../utils/http');

function notFoundHandler(req, res) {
  res.status(404).json({ error: 'Route not found' });
}

// Maps database errors to safe messages. Internal details are logged, never returned.
function errorHandler(err, req, res, next) { // eslint-disable-line no-unused-vars
  if (err instanceof HttpError) {
    return res.status(err.status).json({ error: err.message, details: err.details });
  }
  if (err && err.type === 'entity.parse.failed') return res.status(400).json({ error: 'Invalid JSON body' });
  if (err && err.type === 'entity.too.large') return res.status(413).json({ error: 'Request is too large' });
  const code = err && err.code;
  if (code === '23505') return res.status(409).json({ error: 'A record with these details already exists' });
  if (code === '23503') return res.status(409).json({ error: 'This record is linked to other data and cannot be changed this way' });
  if (code === '23514' || code === '22P02' || code === '22003') return res.status(400).json({ error: 'Invalid value supplied' });
  if (code && (String(code).startsWith('08') || code === '57P01' || code === '53300') ||
      ['ECONNREFUSED', 'ENOTFOUND', 'ETIMEDOUT', 'ECONNRESET'].includes(code) ||
      /timeout|terminated|Connection/i.test(err && err.message || '')) {
    console.error('Database unavailable:', err.message);
    return res.status(503).json({ error: 'The database is temporarily unavailable. Please try again shortly.' });
  }
  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'Something went wrong on the server' });
}

module.exports = { notFoundHandler, errorHandler };
