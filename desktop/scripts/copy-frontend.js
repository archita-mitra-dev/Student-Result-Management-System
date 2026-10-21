// Copies the desktop build of the frontend into desktop/app so electron-builder can package it.
const fs = require('fs');
const path = require('path');
const src = path.join(__dirname, '..', '..', 'frontend', 'dist');
const dst = path.join(__dirname, '..', 'app');
fs.rmSync(dst, { recursive: true, force: true });
fs.cpSync(src, dst, { recursive: true });
console.log('Copied', src, 'to', dst);
