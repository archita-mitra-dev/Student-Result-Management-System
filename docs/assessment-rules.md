# Assessment rules implemented

Raw marks and converted contributions are stored and shown separately. Calculations keep full precision. Rounding is applied once, to the final subject marks, using the configured number of decimals (default 2, half up).

## Theory (100 marks)

| Component | Raw maximum | Contribution |
|---|---:|---:|
| CA1, CA2 | 25 each | combined 10 |
| ECA | 70 | 10 |
| WCA | set per subject by teacher or administrator | 10 |
| Theory end-semester | 70 | 70 |

```
CA  = ((CA1 + CA2) / 2 / 25) x 10
ECA = (ECA / 70) x 10
WCA = (WCA / WCA maximum) x 10
Final theory = CA + ECA + WCA + End-sem        (maximum 100)
Internal total = CA + ECA + WCA                (maximum 30)
```
ECA and the end-semester examination are separate components. ECA is never treated as the final exam and its raw 70 is never added to the total.

## Practical (100 marks)

```
PCA = (PCA1 + PCA2) / 2          PCA1, PCA2 out of 40
Final practical = PCA + Practical end-sem (out of 60)      (maximum 100)
Internal total = PCA                                        (maximum 40)
```

## Sessional (100 marks)

Teachers define components per subject (assignment, presentation, attendance, project, lab, viva, other). Each has a raw maximum and a weight. Weights must add up to 100 before results can be finalized.
```
contribution = (score / raw maximum) x weight
Final sessional = sum of contributions                     (maximum 100)
```

## Validation

Negative marks, marks above the maximum, non-numbers and duplicate entries are rejected, and nothing from that request is saved. Missing marks block submission and approval, so no misleading final result is produced.

## Grades, SGPA, CGPA

```
Credit points = credit x grade point
SGPA = sum(credit x grade point) / sum(credit)          eligible subjects of one semester
CGPA = sum(credit x grade point) / sum(credit)          over all eligible semesters, not an average of SGPAs
```
Repeated subjects count once, using the latest attempt. Subjects with no credits are excluded and flagged. Zero total credits gives "not available" rather than a number. A semester with any unpublished subject is shown as Incomplete with no SGPA or CGPA.

## Versions and locking

Every approved result stores the assessment scheme version and grading scheme used. Status flow: draft, submitted, approved, published, locked. Marks can change only in draft. Correcting a published or locked result needs an administrator reason, creates a new result version, and keeps the previously published version visible to students until the new one is published. All changes are in the audit log with actor, time, old value, new value and reason.
