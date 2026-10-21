# Student Result Management System (SRMS)

A database-backed result management system following the MAKAUT assessment architecture: theory, practical and sessional assessment, configurable grading, SGPA and CGPA, a publish and lock workflow with an audit trail, a grade card, and a separate **internal assessment marksheet**.

```
React + Vite (Vercel)  ->  Express API (Render)  ->  Hosted PostgreSQL (Neon)
```

| Folder | Contents |
|---|---|
| `frontend/` | React, Vite, plain CSS. Role based screens for students, faculty and administrators |
| `backend/` | Express REST API, calculation engine, PDF generation, tests |
| `database/` | Versioned SQL migrations. The seed script is `backend/scripts/seed.js` (fictional data only) |
| `desktop/` | Electron shell and packaging notes for the future Windows build |
| `docs/` | Requirements, assessment rules, architecture, API, deployment, testing |
| `render.yaml` | Render blueprint for the API |

## Run on a fresh machine

Requirements: Node.js 20 or newer, PostgreSQL 14 or newer (local) or a Neon connection string.

```bash
# 1. Database (local example)
createdb srms
cd backend
cp .env.example .env          # edit DATABASE_URL, JWT_SECRET
npm install
npm run migrate               # creates all tables from scratch

# 2. First administrator (choose one)
ADMIN_LOGIN=registrar ADMIN_NAME="Registrar" ADMIN_PASSWORD='a-long-password' npm run create-admin
#    or, for a demo with FICTIONAL data (prints a random password once):
npm run seed

# 3. API
npm start                     # http://localhost:4000, check /health and /health/db

# 4. Frontend (new terminal)
cd frontend
cp .env.example .env          # VITE_API_URL=http://localhost:4000
npm install
npm run dev                   # http://localhost:5173
```

There are no default credentials. The seed script (development only) uses `SEED_PASSWORD` if set, otherwise prints a random password. It refuses to run when `NODE_ENV=production`.

## Tests

```bash
cd backend && npm test
```

Needs a local PostgreSQL and a database named `srms_test` for the role in `TEST_DATABASE_URL` (default `postgres://srms:srms_dev@localhost:5432/srms_test`). The test run wipes that database. 61 tests cover calculations, permissions, student isolation, publication and locking, corrections, CSV import, reports and PDFs. See `docs/testing.md` for the manual checklist.

## Features by role

- **Student**: profile, semester results, grade card (view, print, PDF), **internal marksheet (view, print, PDF)**, detailed marks with raw and converted values, SGPA trend and history.
- **Faculty**: assigned subjects, marks grid with keyboard navigation, CSV import with validation preview, drafts and submission, sessional component editor, WCA maximum, change history, reports for own subjects.
- **Administrator**: students, faculty, departments, courses, batches, academic years, subjects, offerings, faculty assignment, enrollment, grading bands, assessment scheme versions, settings, approve, publish, lock and reopen with reasons, audit log, reports with CSV, Excel and PDF export, student documents.

## The two student documents

| | Grade card | Internal marksheet |
|---|---|---|
| Shows | Grade, points, credit, credit points, SGPA, CGPA, result | Internal components, raw marks, maximum, converted marks, internal total |
| Raw marks | Never | Internal components only |
| End-semester marks | Never | Never |
| Signature, seal, stamp | None | None |

Both are unsigned application reports and say so on the page.

## What is configurable and still awaiting your institution

The grading bands (O to F), the pass rule, the SGPA treatment of failed subjects, percentage conversion, YGPA and MAR are **not invented**. Placeholder bands are included so the system runs, flagged on the admin dashboard until confirmed in *Grading and credits*. See `docs/requirements.md` for the full list.

## Documentation

`docs/requirements.md`, `docs/assessment-rules.md`, `docs/architecture.md`, `docs/api.md`, `docs/deployment.md`, `docs/testing.md`, `docs/desktop-packaging.md`.
