const config = require('./config');
const { createApp } = require('./app');
const { pool } = require('./db/pool');

const app = createApp();
const server = app.listen(config.port, () => console.log(`SRMS API listening on port ${config.port}`));

function shutdown() {
  server.close(() => pool.end().then(() => process.exit(0)));
  setTimeout(() => process.exit(1), 10000).unref();
}
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
