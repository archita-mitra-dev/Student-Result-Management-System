// The API address is configuration, never hard coded. The desktop app can override it
// at runtime through window.SRMS_CONFIG (set by the Electron preload script).
const fromWindow = typeof window !== 'undefined' && window.SRMS_CONFIG && window.SRMS_CONFIG.apiUrl;
export const API_URL = String(fromWindow || import.meta.env.VITE_API_URL || 'http://localhost:4000').replace(/\/$/, '');
export const USE_HASH_ROUTER = import.meta.env.VITE_ROUTER === 'hash';
