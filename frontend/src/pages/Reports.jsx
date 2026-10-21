import React, { useState } from 'react';
import { api, download, qs } from '../api';
import { useAuth } from '../auth.jsx';
import { ErrorBox, Field, Loading, PageHead, Pager, Select, useAsync } from '../components/ui.jsx';

const FACULTY_TYPES = ['subject-marks', 'practical-sessional', 'internal-assessment', 'missing-marks', 'assessment-completion', 'pass-fail'];

export default function Reports() {
  const { user } = useAuth();
  const types = useAsync(() => api.get('/api/reports'), []);
  const years = useAsync(() => api.get('/api/lookup/academic-years'), []);
  const depts = useAsync(() => api.get('/api/lookup/departments'), []);
  const subjects = useAsync(() => api.get('/api/lookup/subjects'), []);
  const batches = useAsync(() => api.get('/api/lookup/batches'), []);
  const students = useAsync(() => (user.role === 'admin' ? api.get('/api/admin/students?limit=200') : Promise.resolve({ rows: [] })), []);
  const [type, setType] = useState('semester-results');
  const [f, setF] = useState({ academic_year_id: '', semester_no: '', department_id: '', subject_id: '', batch_id: '', status: '', result_status: '', component: '', student_id: '' });
  const [page, setPage] = useState(1);
  const [run, setRun] = useState(null); // the filters that were last applied
  const [busy, setBusy] = useState(false);
  const [data, setData] = useState(null);
  const [err, setErr] = useState(null);
  const limit = 50;
  const set = (k) => (v) => setF({ ...f, [k]: v && v.target ? v.target.value : v });

  const load = async (p = 1, nextType = type) => {
    setBusy(true); setErr(null); setPage(p);
    try { setData(await api.get(`/api/reports/${nextType}${qs({ ...f, page: p, limit })}`)); setRun({ type: nextType }); } catch (e) { setErr(e); setData(null); } finally { setBusy(false); }
  };
  const exp = async (format) => { setErr(null); try { await download(`/api/reports/${type}${qs({ ...f, format })}`, `report.${format}`); } catch (e) { setErr(e); } };

  if (types.loading) return <Loading />;
  if (types.error) return <ErrorBox error={types.error} />;
  const list = types.data.rows.filter((t) => user.role === 'admin' || FACULTY_TYPES.includes(t.type));
  const sems = [1, 2, 3, 4, 5, 6, 7, 8].map((n) => ({ id: n, label: `Semester ${n}` }));
  return (
    <>
      <PageHead title="Reports" sub="Every report is built from live database records. Export to CSV, Excel or PDF, or print the table.">
        {data && <button className="btn secondary" onClick={() => window.print()}>Print</button>}
      </PageHead>
      <section className="panel no-print">
        <div className="fields">
          <Field label="Report" id="rt"><select id="rt" value={type} onChange={(e) => { setType(e.target.value); setData(null); }}>{list.map((t) => <option key={t.type} value={t.type}>{t.title}</option>)}</select></Field>
          <Field label="Academic year" id="ry"><Select id="ry" value={f.academic_year_id} onChange={set('academic_year_id')} options={(years.data && years.data.rows) || []} /></Field>
          <Field label="Semester" id="rs"><Select id="rs" value={f.semester_no} onChange={set('semester_no')} options={sems} /></Field>
          {user.role === 'admin' && <Field label="Department" id="rd"><Select id="rd" value={f.department_id} onChange={set('department_id')} options={(depts.data && depts.data.rows) || []} labelKey="name" /></Field>}
          <Field label="Batch" id="rb"><Select id="rb" value={f.batch_id} onChange={set('batch_id')} options={(batches.data && batches.data.rows) || []} /></Field>
          <Field label="Subject" id="rj"><Select id="rj" value={f.subject_id} onChange={set('subject_id')} options={((subjects.data && subjects.data.rows) || []).map((s) => ({ id: s.id, label: `${s.code} ${s.name}` }))} /></Field>
          <Field label="Publication status" id="rp"><Select id="rp" value={f.status} onChange={set('status')} options={['draft', 'submitted', 'approved', 'published', 'locked'].map((s) => ({ id: s, label: s }))} /></Field>
          <Field label="Pass or fail" id="rr"><Select id="rr" value={f.result_status} onChange={set('result_status')} options={[{ id: 'pass', label: 'Pass' }, { id: 'fail', label: 'Fail' }, { id: 'incomplete', label: 'Incomplete' }]} /></Field>
          <Field label="Assessment component" id="rc"><input id="rc" value={f.component} placeholder="CA1, ECA, PCA1" onChange={set('component')} /></Field>
          {user.role === 'admin' && <Field label="Student" id="rst"><Select id="rst" value={f.student_id} onChange={set('student_id')} options={((students.data && students.data.rows) || []).map((s) => ({ id: s.id, label: `${s.roll_no} ${s.full_name}` }))} /></Field>}
        </div>
        <div className="actions" style={{ marginTop: '.9rem' }}>
          <button className="btn" onClick={() => load(1)} disabled={busy}>{busy ? 'Loading...' : 'Show report'}</button>
          <button className="btn secondary" onClick={() => exp('csv')}>Export CSV</button>
          <button className="btn secondary" onClick={() => exp('xlsx')}>Export Excel</button>
          <button className="btn secondary" onClick={() => exp('pdf')}>Export PDF</button>
        </div>
      </section>
      <ErrorBox error={err} />
      {data && (
        <>
          <h2>{data.title}</h2>
          {data.rows.length === 0 ? <div className="alert">No records match these filters.</div> : (
            <div className="tablewrap"><table>
              <thead><tr>{data.columns.map((c) => <th key={c.key}>{c.label}</th>)}</tr></thead>
              <tbody>{data.rows.map((r, i) => <tr key={i}>{data.columns.map((c) => <td key={c.key}>{r[c.key] === null ? '' : String(r[c.key])}</td>)}</tr>)}</tbody>
            </table></div>
          )}
          <Pager page={page} limit={limit} total={data.total} onPage={(p) => load(p)} />
        </>
      )}
    </>
  );
}
