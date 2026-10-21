# Testing

## Automated (backend, `npm test`)
61 tests. Unit: CA1/CA2 averaging, ECA 70 to 10, WCA with configurable maximum, theory 100 and internal 30, PCA, sessional weights, missing and invalid marks, rounding, grading, credit points, SGPA, CGPA, missing credits, division by zero, repeated subjects. API with a real PostgreSQL: login, inactive accounts, role permissions, unassigned faculty, student isolation, duplicate marks, CSV preview and import, submit, approve, publish, lock, correction with reason and version history, audit entries, grading validation, scheme versions, report filters, CSV, Excel and PDF export, grade card totals against the database, grade card has no raw marks or signature words (JSON and PDF text), grade card is one A4 page, internal marksheet contents, CORS, health, database failure mapping.

## Manual checklist
- [ ] Log in as student, faculty and admin. Wrong password shows a generic error.
- [ ] Student cannot open admin pages (redirected) and API returns 403.
- [ ] Faculty opens an assigned subject, types 26 in a 25 mark box (red), save is disabled.
- [ ] Faculty pastes a CSV with a bad roll number, preview shows the error, import is disabled.
- [ ] Faculty cannot submit with missing marks, then submits when complete.
- [ ] Admin approves, publishes (confirmation shown), locks. Faculty can no longer edit.
- [ ] Admin reopens a locked result with a reason. Student still sees the old grade until republish.
- [ ] Student grade card: grades, points, credits, SGPA and CGPA only, no signature, no raw marks.
- [ ] Student internal marksheet shows CA1, CA2, CA, ECA (out of 70 and converted to 10), WCA, internal total, and no end-semester row.
- [ ] Print preview of both documents hides navigation and buttons.
- [ ] Download PDFs, compare totals with the screen.
- [ ] Reports: apply each filter, export CSV, Excel, PDF.
- [ ] Refresh the browser and restart the API, data persists.
- [ ] Stop PostgreSQL, the app shows a friendly error rather than a crash.

## Browser walkthrough already done
Chromium was driven against the running API: student, faculty and admin dashboards, marks grid, CSV import, submit, approve, publish, student grade card download and print view, with no browser console errors.
