# Requirements summary, traceability and open questions

## Summary
SRMS lets students view published results, faculty enter marks for assigned subjects, and administrators approve, publish and lock results and produce reports. Sources: the SRS (ten functional modules), the SPMP (single member project, V-model, web based prototype), the MAKAUT assessment architecture image and the grade card reference image. Where the master prompt updates a rule (ECA out of 70, no raw marks and no signature on the grade card, sessional flexibility) the prompt wins.

## Traceability (SRS module to implementation)
| SRS module | Implemented in | Status |
|---|---|---|
| 3.2.1 User authentication | `controllers/auth.js`, `Public.jsx`. Inactive accounts denied. Detailed SRS error wording behind a flag | Done |
| 3.2.2 Student profile | `services/student.js#profile`, `Student.jsx`. Missing fields are listed instead of failing | Done |
| 3.2.3 View result | `Results`, `GradeCard`, `DetailedMarksPage`, `History`. "Result Not Available" when nothing is published | Done |
| 3.2.4 Enter marks | `services/marks.js`, `MarksEntry`. "Unauthorized Subject" for unassigned faculty. Range checks, drafts, CSV, submit | Done |
| 3.2.5 Calculate result | `services/calc.js`, `services/results.js#transition(approve)` | Done |
| 3.2.6 SGPA and CGPA | `calc.computeSgpa`, `computeCgpa`, `regenerateStudentSemesterResults` | Done |
| 3.2.7 Publish result | Workflow submit, approve, publish, lock, reopen with audit | Done |
| 3.2.8 Generate marksheet | Grade card (HTML, print, PDF) and internal marksheet (HTML, print, PDF), plus detailed marks PDF | Done |
| 3.2.9 Manage students | `Admin.jsx` Students. Delete deactivates students that have records | Done |
| 3.2.10 Generate reports | `Reports.jsx`, `services/reports.js`, 11 report types, CSV, Excel, PDF | Done |

## Unresolved institutional policies (all configurable, none invented)
1. Official grading bands, grade points and pass rule. Placeholder bands are seeded and flagged.
2. Whether failed subjects count in SGPA and CGPA (default yes, setting `include_failed_in_sgpa`).
3. CGPA to percentage conversion (none until `cgpa_to_percentage_factor` is set).
4. YGPA rules and MAR. Lines appear on the grade card only when enabled, and show "Awaiting configuration".
5. Subject credits. Set per offering. Missing credits block approval.
6. Treatment of absent students and withheld results (not modelled, a blank mark blocks approval).
7. Supplementary examination workflow. Repeat attempts are supported through enrollment `attempt_no` and "latest attempt counts" in CGPA, but there is no separate supplementary exam module.
8. Official university name, former name, examination name and session. Edit in Settings.
9. Terms of Service and Privacy Policy text. Placeholders to be completed by the institution.

## Known limits
Frontend has no automated component tests (verified by browser walkthrough, see testing doc). Vercel and Render deployment and the Windows executables have not been performed.
