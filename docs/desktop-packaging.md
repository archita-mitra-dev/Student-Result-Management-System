# Windows executables (prepared, not built)

The web app and the desktop app use the same API and the same hosted database. Packaging does not include or copy the database. No database credentials, JWT secret or privileged key is placed in the frontend or Electron app.

## Desktop app (Electron)
The frontend reads its API address from `window.SRMS_CONFIG.apiUrl` (set by `desktop/preload.js` from `SRMS_API_URL` or `config.json`), then `VITE_API_URL`. The desktop build uses hash routing (`frontend/.env.desktop`) because it loads from disk. Set `ALLOW_DESKTOP_ORIGIN=true` on the API so requests from the desktop page (origin `null`) pass CORS. This is safe here because auth uses bearer tokens, not cookies.

Build on Windows:
```
cd desktop
npm install
# edit config.json: apiUrl = your Render URL
npm run dist          # builds the frontend (desktop mode) then a portable .exe in desktop/release
```
Use `npm start` to test without packaging.

## Backend executable (optional, only if a separate .exe is required)
```
cd backend
npm ci
npm run build:exe     # @yao-pkg/pkg, output ../desktop/backend-bin/srms-api.exe
```
The exe still needs `DATABASE_URL` and `JWT_SECRET` supplied as environment variables or a `.env` next to it, and it connects to the hosted PostgreSQL. It is the same Express server, not a second copy of the logic. PDF fonts and migrations are listed as pkg assets. This path has not been tested, so build it and open a grade card PDF before relying on it.
