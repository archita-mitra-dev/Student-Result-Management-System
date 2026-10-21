# Architecture and design decisions

```
Browser or Electron  ->  HTTPS  ->  Express API (Render)  ->  PostgreSQL (Neon)
 React/Vite (Vercel)       JWT bearer token        pg, parameterized SQL
```
The frontend and API are on different origins. Authentication uses a bearer token in the `Authorization` header (no cookies), and CORS allows only the origins in `FRONTEND_URL`. The database string exists only in the backend environment.

## Backend layers
`routes/` wiring and role guards, `controllers/` HTTP handling, `services/` business rules (`calc.js` is pure and unit tested), `db/pool.js` connection pool and transactions, `middleware/` auth and error mapping, `utils/` validation, CSV, audit.

## Database provider
Neon PostgreSQL is recommended. Free plan, checked on neon.com/pricing: 1 GB per project, 100 CU-hours, compute suspends after 5 minutes idle, connection pooling included, 6 hour history window. Render's free PostgreSQL was rejected because it expires 30 days after creation, has no backups and a 1 GB limit (render.com/docs/free). The Render free web service sleeps after 15 minutes idle and takes about a minute to wake, so the first request after idle is slow. Expect the same cold start for Neon after 5 idle minutes.

## Schema (docs: database/migrations)
People: `users`, `student_profiles`, `faculty_profiles`. Structure: `departments`, `courses`, `batches`, `academic_years`, `semesters` (semester number lives on offerings), `subjects`. Teaching: `subject_offerings` (credits, scheme, WCA maximum, workflow status, result version), `faculty_subject_assignments`, `student_enrollments`. Assessment: `assessment_schemes` (versioned), `assessment_components`, `student_assessment_marks` (unique per component and student), `mark_history`. Results: `grading_schemes`, `grading_bands`, `subject_results`, `semester_results`, `result_publications`. Control: `audit_logs`, `system_settings`.

Decisions: credits sit on the offering so they can differ per year. `subject_results.breakdown` is a JSON snapshot of raw marks and contributions at approval time, so a published result cannot drift if schemes change later. Final marks, grade and credit points are stored once, at approval, from the same code path; semester results are regenerated only from published versions. Students are never deleted once they have enrollments, they are deactivated.

## Security
bcrypt password hashes, JWT with expiry, account status re-checked on every request, role checks on the server, student routes read the id from the session only, parameterized SQL, helmet headers, rate limits on login and writes, CSV export neutralizes spreadsheet formulas, safe error messages (database errors become a generic 503 or 500), audit log inside the same transaction as the change.
The SRS asks for separate "Invalid User ID" and "Incorrect Password" messages. That reveals which IDs exist, so the default is one generic message. Set `SRS_DETAILED_LOGIN_ERRORS=true` to follow the SRS wording exactly.
