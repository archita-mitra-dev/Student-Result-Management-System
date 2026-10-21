// Gives the web app its API address. No secrets are placed here. The database
// connection string and the JWT secret exist only on the server.
const { contextBridge } = require('electron');
const fs = require('fs');
const path = require('path');

let apiUrl = process.env.SRMS_API_URL || '';
if (!apiUrl) {
  try {
    const candidates = [path.join(process.env.PORTABLE_EXECUTABLE_DIR || '', 'config.json'), path.join(__dirname, 'config.json')];
    for (const f of candidates) { if (f && fs.existsSync(f)) { apiUrl = JSON.parse(fs.readFileSync(f, 'utf8')).apiUrl; break; } }
  } catch (_) { /* fall back to the build time default */ }
}
contextBridge.exposeInMainWorld('SRMS_CONFIG', { apiUrl });
