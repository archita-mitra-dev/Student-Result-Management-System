import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { api, download, qs } from '../api';
import { ErrorBox, Loading, PageHead, Status, useAsync, n2, trim } from '../components/ui.jsx';
import SemesterPicker, { parseSem } from '../components/SemesterPicker.jsx';
import { GradeCardDoc, InternalMarksheetDoc, DetailedMarks } from '../components/Docs.jsx';
import TrendChart from '../components/TrendChart.jsx';

export function StudentDashboard() {
  const { loading, data, error } = useAsync(() => api.get('/api/student/dashboard'), []);
  if (loading) return <Loading />;
  if (error) return <ErrorBox error={error} />;
  const { profile: p, semesters, cgpa, latest } = data;
  return (
    <>
      <PageHead title={`Welcome, ${p.full_name}`} sub={`${p.course || 'Course not set'}, ${p.department || 'department not set'}. Currently in semester ${p.current_semester}.`} />
      <div className="figures">
        <div className="figure"><div className="n">{cgpa === null ? '-' : n2(cgpa)}</div><div className="l">CGPA</div></div>
        <div className="figure"><div className="n">{latest && latest.sgpa !== null ? n2(latest.sgpa) : '-'}</div><div className="l">Latest SGPA{latest ? ` (semester ${latest.semester_no})` : ''}</div></div>
        <div className="figure"><div className="n">{semesters.length}</div><div className="l">Semesters with published results</div></div>
        <div className="figure"><div className="n">{p.current_semester}</div><div className="l">Current semester</div></div>
      </div>
      <div className="cols">
        <section className="panel">
          <h2>SGPA trend</h2>
          <TrendChart points={semesters.map((s) => ({ label: `S${s.semester_no}`, value: s.sgpa }))} />
        </section>
        <section className="panel">
          <h2>Recent grade cards</h2>
          {semesters.length === 0 ? <p className="muted">No results have been published yet.</p> : (
            <div className="tablewrap"><table>
              <thead><tr><th>Year</th><th>Sem</th><th className="num">SGPA</th><th>Result</th></tr></thead>
              <tbody>{[...semesters].reverse().slice(0, 5).map((s) => (
                <tr key={`${s.academic_year_id}:${s.semester_no}`}><td>{s.academic_year}</td><td>{s.semester_no}</td><td className="num">{n2(s.sgpa)}</td><td><Status value={s.result_status} /></td></tr>
              ))}</tbody>
            </table></div>
          )}
          <p style={{ marginTop: '.8rem' }}><Link to="/grade-card">Open grade card</Link> · <Link to="/internal-marksheet">Internal marksheet</Link> · <Link to="/detailed-marks">Detailed internal marks</Link></p>
        </section>
      </div>
    </>
  );
}

export function StudentProfile() {
  const { loading, data, error } = useAsync(() => api.get('/api/student/profile'), []);
  if (loading) return <Loading />;
  if (error) return <ErrorBox error={error} />;
  const rows = [['Name', data.full_name], ['User ID', data.login_id], ['Roll number', data.roll_no], ['Registration number', data.registration_no], ['Course', data.course], ['Department', data.department], ['Batch', data.batch], ['Current semester', data.current_semester], ['Email', data.email]];
  return (
    <>
      <PageHead title="My profile" />
      {data.missing_fields.length > 0 && <div className="alert warn">Some details are missing from your record: {data.missing_fields.join(', ')}. Please contact the administrator.</div>}
      <div className="tablewrap" style={{ maxWidth: 560 }}><table><tbody>{rows.map(([k, v]) => <tr key={k}><th style={{ width: '40%' }}>{k}</th><td>{v || <span className="muted">Not available</span>}</td></tr>)}</tbody></table></div>
    </>
  );
}

export function Results() {
  const [sem, setSem] = useState('');
  const { ay, s } = { ay: parseSem(sem).academic_year_id, s: parseSem(sem).semester_no };
  const { loading, data, error } = useAsync(() => (sem ? api.get(`/api/student/grade-card${qs({ academic_year_id: ay, semester_no: s })}`) : Promise.resolve(null)), [sem]);
  return (
    <>
      <PageHead title="Semester results" sub="Subject-wise grades for a published semester." />
      <SemesterPicker value={sem} onChange={setSem} />
      <ErrorBox error={error} />
      {loading && sem && <Loading />}
      {data && (
        <>
          <div className="figures">
            <div className="figure"><div className="n">{data.sgpa === null ? '-' : n2(data.sgpa)}</div><div className="l">SGPA</div></div>
            <div className="figure"><div className="n">{data.cgpa === null ? '-' : n2(data.cgpa)}</div><div className="l">CGPA</div></div>
            <div className="figure"><div className="n">{n2(data.total_credits, 1)}</div><div className="l">Credits</div></div>
            <div className="figure"><div className="n"><Status value={data.result_status} /></div><div className="l">Result</div></div>
          </div>
          <div className="tablewrap"><table>
            <thead><tr><th>Code</th><th>Subject</th><th className="ctr">Grade</th><th className="num">Points</th><th className="num">Credit</th><th className="num">Credit points</th></tr></thead>
            <tbody>{data.subjects.map((x) => <tr key={x.code}><td>{x.code}</td><td>{x.name}</td><td className="ctr">{x.letter_grade}</td><td className="num">{trim(x.grade_point)}</td><td className="num">{n2(x.credits, 1)}</td><td className="num">{n2(x.credit_points, 1)}</td></tr>)}</tbody>
            <tfoot><tr><td colSpan={4}>Total</td><td className="num">{n2(data.total_credits, 1)}</td><td className="num">{n2(data.total_credit_points, 1)}</td></tr></tfoot>
          </table></div>
          {data.pending_subjects > 0 && <div className="alert warn" style={{ marginTop: '.8rem' }}>{data.pending_subjects} subject(s) are not yet published, so SGPA and CGPA are not shown.</div>}
          <p style={{ marginTop: '.8rem' }}>Individual internal marks are in <Link to="/detailed-marks">Detailed marks</Link>.</p>
        </>
      )}
    </>
  );
}

function DocPage({ title, sub, path, pdfPath, Doc, prop, pdfName }) {
  const [sem, setSem] = useState('');
  const [msg, setMsg] = useState(null);
  const p = parseSem(sem);
  const { loading, data, error } = useAsync(() => (sem ? api.get(`${path}${qs(p)}`) : Promise.resolve(null)), [sem]);
  const pdf = async () => { setMsg(null); try { await download(`${pdfPath}${qs(p)}`, pdfName); } catch (e) { setMsg(e); } };
  return (
    <>
      <PageHead title={title} sub={sub}>
        {data && <><button className="btn secondary" onClick={() => window.print()}>Print</button><button className="btn" onClick={pdf}>Download PDF</button></>}
      </PageHead>
      <SemesterPicker value={sem} onChange={setSem} />
      <ErrorBox error={error || msg} />
      {loading && sem && <Loading />}
      {data && <Doc {...{ [prop]: data }} />}
    </>
  );
}

export const GradeCard = () => <DocPage title="Grade card" sub="Grades and credits for a published semester. Individual marks are not shown here." path="/api/student/grade-card" pdfPath="/api/student/grade-card.pdf" Doc={GradeCardDoc} prop="gc" pdfName="grade-card.pdf" />;
export const InternalMarksheet = () => <DocPage title="Internal marksheet" sub="Internal assessment marks and their converted contributions." path="/api/student/internal-marksheet" pdfPath="/api/student/internal-marksheet.pdf" Doc={InternalMarksheetDoc} prop="ms" pdfName="internal-marksheet.pdf" />;

export function DetailedMarksPage() {
  const [sem, setSem] = useState('');
  const [msg, setMsg] = useState(null);
  const p = parseSem(sem);
  const { loading, data, error } = useAsync(() => (sem ? api.get(`/api/student/marks${qs(p)}`) : Promise.resolve(null)), [sem]);
  const pdf = async () => { setMsg(null); try { await download(`/api/student/marks.pdf${qs(p)}`, 'marks-report.pdf'); } catch (e) { setMsg(e); } };
  return (
    <>
      <PageHead title="Detailed marks" sub="Raw marks, maximum marks and converted contributions for each component, with the final result.">
        {data && <button className="btn" onClick={pdf}>Download PDF</button>}
      </PageHead>
      <SemesterPicker value={sem} onChange={setSem} />
      <ErrorBox error={error || msg} />
      {loading && sem && <Loading />}
      {data && <DetailedMarks d={data} />}
    </>
  );
}

export function History() {
  const { loading, data, error } = useAsync(() => api.get('/api/student/semesters'), []);
  if (loading) return <Loading />;
  if (error) return <ErrorBox error={error} />;
  const rows = data.rows;
  return (
    <>
      <PageHead title="Academic history" sub="All semesters with published results." />
      {rows.length === 0 ? <p className="muted">No published results yet.</p> : (
        <>
          <section className="panel"><h2>SGPA by semester</h2><TrendChart points={rows.map((s) => ({ label: `S${s.semester_no}`, value: s.sgpa }))} /></section>
          <div className="tablewrap"><table>
            <thead><tr><th>Academic year</th><th>Semester</th><th className="num">Credits</th><th className="num">SGPA</th><th className="num">CGPA</th><th>Result</th></tr></thead>
            <tbody>{rows.map((s) => <tr key={`${s.academic_year_id}:${s.semester_no}`}><td>{s.academic_year}</td><td>{s.semester_no}</td><td className="num">{n2(s.total_credits, 1)}</td><td className="num">{n2(s.sgpa)}</td><td className="num">{n2(s.cgpa)}</td><td><Status value={s.result_status} /></td></tr>)}</tbody>
          </table></div>
        </>
      )}
    </>
  );
}
