import React from 'react';
import { n2, trim } from './ui.jsx';

const STATUS = { pass: 'PASS', fail: 'FAIL', incomplete: 'INCOMPLETE' };

// Formal grade card. Grades and credit information only. No raw marks, no signature, no seal.
export function GradeCardDoc({ gc }) {
  const rows = [
    [`SGPA (Semester ${gc.semester_no})`, gc.sgpa === null ? 'Not available' : n2(gc.sgpa)],
    ['CGPA', gc.cgpa === null ? 'Not available' : n2(gc.cgpa)],
  ];
  if (gc.show_ygpa) rows.push(['YGPA', 'Awaiting configuration']);
  if (gc.percentage !== null && gc.percentage !== undefined) rows.push(['Percentage (configured policy)', n2(gc.percentage)]);
  rows.push(['Result', STATUS[gc.result_status] || '-']);
  if (gc.mar_enabled) rows.push(['MAR (Mandatory Additional Requirement)', 'Awaiting configuration']);
  rows.push(['Academic Year', gc.academic_year], ['College / Institution', gc.institution]);
  return (
    <article className="doc" aria-label="Grade card">
      <h1>{gc.university}</h1>
      {gc.university_former_name && <div className="sub">({gc.university_former_name})</div>}
      <div className="title">GRADE CARD</div>
      <div className="examline">{gc.exam_name} | Academic Year {gc.academic_year} | Semester {gc.semester_no}{gc.exam_session ? ` | Session ${gc.exam_session}` : ''}</div>
      <div className="info">
        <div><b>Name :</b> {gc.student.name}</div><div><b>Roll No. :</b> {gc.student.roll_no}</div>
        <div><b>Registration No. :</b> {gc.student.registration_no}</div><div><b>Course :</b> {gc.student.course || '-'}</div>
        <div><b>Department :</b> {gc.student.department || '-'}</div><div><b>Semester :</b> {gc.semester_no}</div>
      </div>
      <table>
        <thead><tr><th>Subject Code</th><th>Subjects Offered</th><th className="ctr">Letter Grade</th><th className="ctr">Points</th><th className="ctr">Credit</th><th className="ctr">Credit Points</th></tr></thead>
        <tbody>
          {gc.subjects.map((s) => (
            <tr key={s.code}><td>{s.code}</td><td>{s.name}</td><td className="ctr">{s.letter_grade}</td><td className="ctr">{trim(s.grade_point)}</td><td className="ctr">{n2(s.credits, 1)}</td><td className="ctr">{n2(s.credit_points, 1)}</td></tr>
          ))}
        </tbody>
        <tfoot><tr><td></td><td><b>Total</b></td><td></td><td></td><td className="ctr"><b>{n2(gc.total_credits)}</b></td><td className="ctr"><b>{n2(gc.total_credit_points)}</b></td></tr></tfoot>
      </table>
      <div className="summary">{rows.map(([k, v]) => <div key={k}><b>{k}</b><span>{v}</span></div>)}</div>
      {gc.pending_subjects > 0 && <p className="fine">{gc.pending_subjects} subject(s) of this semester are not yet published. SGPA and CGPA are shown once all results are published.</p>}
      <p className="fine">Generated from the published results held in the application{gc.published_on ? ` (published ${new Date(gc.published_on).toISOString().slice(0, 10)})` : ''}. Application reference: {gc.reference}. This is an unsigned academic result report and is not an officially certified document.</p>
    </article>
  );
}

// Internal assessment marksheet: internal components only.
export function InternalMarksheetDoc({ ms }) {
  return (
    <article className="doc" aria-label="Internal assessment marksheet">
      <h1>{ms.university}</h1>
      <div className="title">INTERNAL ASSESSMENT MARKSHEET</div>
      <div className="examline">Academic Year {ms.academic_year} | Semester {ms.semester_no}</div>
      <div className="info">
        <div><b>Name :</b> {ms.student.name}</div><div><b>Roll No. :</b> {ms.student.roll_no}</div>
        <div><b>Registration No. :</b> {ms.student.registration_no}</div><div><b>Course :</b> {ms.student.course || '-'}</div>
        <div><b>Department :</b> {ms.student.department || '-'}</div><div><b>Institution :</b> {ms.institution}</div>
      </div>
      {ms.subjects.map((s) => (
        <div key={s.code} style={{ breakInside: 'avoid' }}>
          <div className="subjhead">{s.code}  {s.name} ({s.type})</div>
          <table>
            <thead><tr><th>Component</th><th className="ctr">Marks Obtained</th><th className="ctr">Maximum</th><th className="ctr">Converted</th><th className="ctr">Out of</th></tr></thead>
            <tbody>
              {s.rows.map((r) => (
                <tr key={r.code}>
                  <td>{r.label}</td><td className="ctr">{trim(r.raw)}</td><td className="ctr">{trim(r.raw_max)}</td>
                  <td className="ctr">{r.contribution === undefined || r.contribution === null ? '' : n2(r.contribution)}</td>
                  <td className="ctr">{r.contribution_max === undefined || r.contribution_max === null ? '' : trim(r.contribution_max)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot><tr><td colSpan={3}><b>Internal total</b></td><td className="ctr"><b>{n2(s.internal_marks)}</b></td><td className="ctr"><b>{trim(s.internal_max)}</b></td></tr></tfoot>
          </table>
        </div>
      ))}
      <p className="fine">This sheet lists internal assessment components only. Converted marks follow the assessment scheme recorded with the published result. Application reference: {ms.reference}. This is an unsigned report and is not an officially certified document.</p>
    </article>
  );
}

// Detailed marks report in the app, with raw marks, conversions and the final result.
export function DetailedMarks({ d }) {
  return (
    <div>
      {d.subjects.map((s) => (
        <section key={s.code} className="panel">
          <h3>{s.code} {s.name} <span className="muted small">({s.type}, scheme version {s.scheme_version})</span></h3>
          <div className="tablewrap">
            <table>
              <thead><tr><th>Component</th><th className="num">Raw marks</th><th className="num">Raw maximum</th><th className="num">Converted</th><th className="num">Out of</th></tr></thead>
              <tbody>
                {s.rows.map((r) => (
                  <tr key={r.code}>
                    <td>{r.label}{r.kind === 'external' ? <span className="muted small"> (end semester)</span> : null}</td>
                    <td className="num">{trim(r.raw)}</td><td className="num">{trim(r.raw_max)}</td>
                    <td className="num">{r.contribution === undefined || r.contribution === null ? '' : n2(r.contribution)}</td>
                    <td className="num">{r.contribution_max === undefined || r.contribution_max === null ? '' : trim(r.contribution_max)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr><td>Internal total</td><td></td><td></td><td className="num">{n2(s.internal_marks)}</td><td className="num">{trim(s.internal_max)}</td></tr>
                <tr><td>Final marks (rounded to {s.rounding_decimals} decimals)</td><td></td><td></td><td className="num">{n2(s.final_marks)}</td><td className="num">{trim(s.final_max)}</td></tr>
              </tfoot>
            </table>
          </div>
          <p className="small muted" style={{ marginTop: '.5rem' }}>Grade {s.letter_grade}, grade point {trim(s.grade_point)}, credits {trim(s.credits)}. Raw marks and converted contributions are kept separately. The converted column is what counts toward the final marks.</p>
        </section>
      ))}
    </div>
  );
}
