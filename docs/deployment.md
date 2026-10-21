# Deployment: Vercel + Render + Neon

Nothing here has been run against live accounts yet. Follow in order and check each step.

## 1. Database (Neon)
1. Create a Neon project (free plan: 1 GB, compute suspends after 5 idle minutes).
2. Copy the connection string (it contains `sslmode=require`). Keep it secret.
3. Backups: the free plan keeps a short history window only. Before real use run `pg_dump "$DATABASE_URL" -Fc -f srms-$(date +%F).dump` regularly and store it off the provider. Restore with `pg_restore`.

## 2. API (Render)
1. New Web Service from the repository, or use `render.yaml`. Leave Root Directory empty.
2. Build `cd backend && npm ci --omit=dev`. Start `cd backend && npm run migrate && npm start`. Health check path `/health`.
3. Environment: `NODE_ENV=production`, `DATABASE_URL`, `JWT_SECRET` (long random), `FRONTEND_URL` (your Vercel URL, comma separate extra origins), `SETUP_TOKEN` (temporary).
4. After first deploy open `https://<frontend>/setup`, create the first administrator, then delete `SETUP_TOKEN` and redeploy. Alternatively run `create-admin` from a Render shell.
5. Free Render services sleep after 15 minutes and wake in about a minute.

## 3. Frontend (Vercel)
1. Import the repository, set Root Directory `frontend`, framework Vite.
2. Environment variable `VITE_API_URL=https://<your-render-service>.onrender.com`.
3. `vercel.json` already rewrites all paths to `index.html` for client side routes.
4. Put the final Vercel URL into Render `FRONTEND_URL`.

## 4. Verify
`/health/db` returns connected. Log in as the administrator, set institution names in Settings, confirm grading bands in Grading and credits, create departments, subjects and offerings.

## Production checklist
No seed data in production (the script refuses). Rotate `JWT_SECRET` if exposed. Replace placeholder grading bands. Complete Terms and Privacy pages.
