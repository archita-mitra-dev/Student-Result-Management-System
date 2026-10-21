# API reference

Base URL is your Render service. All `/api` routes except login and setup need `Authorization: Bearer <token>`. Errors are `{ "error": "message", "details": [...] }`.

| Method and path | Role | Purpose |
|---|---|---|
| GET `/health`, `/health/db` | public | Liveness, database check |
| POST `/api/auth/login` | public | `{login_id, password}` returns token |
| GET `/api/auth/setup-status`, POST `/api/auth/setup` | public | One-time first administrator, needs `SETUP_TOKEN` |
| GET `/api/auth/me`, POST `/api/auth/change-password` | any | Session |
| GET `/api/lookup/:name` | staff | departments, courses, batches, academic-years, subjects |
| GET `/api/student/dashboard`, `profile`, `semesters` | student | Own data only |
| GET `/api/student/grade-card`, `grade-card.pdf` | student | Query `academic_year_id`, `semester_no` |
| GET `/api/student/internal-marksheet`, `.pdf` | student | Internal components only |
| GET `/api/student/marks`, `marks.pdf` | student | Detailed raw and converted marks |
| GET `/api/offerings/mine` | staff | Assigned offerings (faculty) |
| GET `/api/offerings/:id/grid` | assigned faculty, admin | Marks grid with totals and missing counts |
| PUT `/api/offerings/:id/marks` | assigned faculty, admin | `{entries:[{student_id, component_code, raw_score}], reason}` draft only, all or nothing |
| POST `/api/offerings/:id/import` | assigned faculty, admin | `{csv, commit}` preview then import |
| POST `/api/offerings/:id/submit` | assigned faculty, admin | Draft to submitted, blocked if marks missing |
| PUT `/api/offerings/:id/wca-max` | assigned faculty, admin | WCA raw maximum |
| POST, PUT, DELETE `/api/offerings/:id/components[/:cid]` | assigned faculty, admin | Sessional components |
| GET `/api/offerings/:id/history` | assigned faculty, admin | Mark change history |
| GET `/api/faculty/dashboard` | faculty | Dashboard data |
| GET `/api/reports`, `/api/reports/:type` | staff | Query filters plus `format=json,csv,xlsx,pdf`, `page`, `limit` |
| `/api/admin/students`, `/faculty` | admin | CRUD, password reset at `/api/admin/users/:id/reset-password` |
| `/api/admin/ref/:name` | admin | Create, update, delete reference data |
| `/api/admin/offerings` and `/:id/faculty`, `/:id/enroll` | admin | Offerings, assignment, enrollment |
| GET `/api/admin/offerings/:id/validate` | admin | Dry run of approval checks |
| POST `/api/admin/offerings/:id/{approve,publish,lock,reopen}` | admin | Workflow, `reopen` needs `reason` |
| GET, PUT `/api/admin/grading`; GET, POST `/api/admin/schemes`; GET, PUT `/api/admin/settings` | admin | Configuration |
| GET `/api/admin/audit`, `/api/admin/stats` | admin | Audit log, dashboard |
| GET `/api/admin/students/:id/{grade-card,internal-marksheet}[.pdf]` | admin | Documents for support |

Report types: semester-results, sgpa-cgpa, grade-cards, subject-marks, practical-sessional, internal-assessment, student-assessment, missing-marks, pass-fail, department-performance, assessment-completion.
