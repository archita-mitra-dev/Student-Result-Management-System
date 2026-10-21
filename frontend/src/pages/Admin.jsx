import React, { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api, qs } from '../api';
import { Confirm, ErrorBox, Field, Loading, Modal, PageHead, Pager, Progress, Select, Status, useAsync, n2, trim, fmtDate } from '../components/ui.jsx';
import { GradeCardDoc, InternalMarksheetDoc } from '../components/Docs.jsx';
import { download } from '../api';

const lookup = (name) => api.get(`/api/lookup/${name}`).then((r) => r.rows);

export function AdminDashboard() {
  const { loading, data, error } = useAsync(() => Promise.all([api.get('/api/admin/stats'), api.get('/api/admin/grading')]).then(([s, g]) => ({ s, g })), []);
  if (loading) return <Loading />;
  if (error) return <ErrorBox error={error} />;
  const { s, g } = data;
  return (
    <>
      <PageHead title="Administrator dashboard" sub={s.active_academic_year ? `Active academic year ${s.active_academic_year}` : 'No active academic year is set.'} />
      {g && g.is_placeholder && <div className="alert warn">Grading bands are placeholders awaiting institutional configuration. <Link to="/admin/grading">Review grading and credits</Link> before publishing real results.</div>}
      {!s.active_academic_year && <div className="alert warn">Set an active academic year under <Link to="/admin/setup">Departments and subjects</Link>.</div>}
      <div className="figures">
        <div className="figure"><div className="n">{s.students}</div><div className="l">Students</div></div>
        <div className="figure"><div className="n">{s.faculty}</div><div className="l">Faculty</div></div>
        <div className="figure"><div className="n">{s.subjects}</div><div className="l">Subjects</div></div>
        <div className="figure"><div className="n">{s.pending_assessments}</div><div className="l">Offerings in draft</div></div>
        <div className="figure"><div className="n">{s.missing_marks}</div><div className="l">Missing marks</div></div>
        <div className="figure"><div className="n">{s.awaiting_approval}</div><div className="l">Awaiting approval</div></div>
        <div className="figure"><div className="n">{s.published}</div><div className="l">Published</div></div>
      </div>
      <div className="cols">
        <section className="panel"><h2>Assessment completion, active year</h2>
          {s.completion.length === 0 ? <p className="muted">No offerings in the active year.</p> : (
            <div className="tablewrap"><table><thead><tr><th>Subject</th><th>Sem</th><th>Status</th><th>Marks entered</th></tr></thead>
              <tbody>{s.completion.map((c) => <tr key={c.id}><td><Link to={`/admin/offerings/${c.id}`}>{c.code}</Link> {c.name}</td><td>{c.semester_no}</td><td><Status value={c.status} /></td><td style={{ minWidth: 120 }}><Progress value={c.filled} max={c.total} /><span className="small muted">{c.filled}/{c.total}</span></td></tr>)}</tbody></table></div>
          )}
        </section>
        <div>
          <section className="panel"><h2>Performance by semester</h2>
            {s.performance.length === 0 ? <p className="muted">No generated results yet.</p> : (
              <div className="tablewrap"><table><thead><tr><th>Sem</th><th className="num">Students</th><th className="num">Average SGPA</th><th className="num">Pass %</th></tr></thead>
                <tbody>{s.performance.map((p) => <tr key={p.semester_no}><td>{p.semester_no}</td><td className="num">{p.students}</td><td className="num">{n2(p.avg_sgpa)}</td><td className="num">{trim(p.pass_pct)}</td></tr>)}</tbody></table></div>
            )}
          </section>
          <section className="panel"><h2>Recent activity</h2>
            <div className="tablewrap"><table><tbody>{s.recent_activity.map((a, i) => <tr key={i}><td className="small nowrap">{fmtDate(a.created_at)}</td><td>{a.actor_name}</td><td>{a.action}</td></tr>)}</tbody></table></div>
          </section>
        </div>
      </div>
    </>
  );
}

/* ---------------- People ---------------- */
function PersonForm({ kind, initial, onClose, onSaved }) {
  const depts = useAsync(() => lookup('departments'), []);
  const courses = useAsync(() => lookup('courses'), []);
  const batches = useAsync(() => lookup('batches'), []);
  const [f, setF] = useState(initial || { login_id: '', full_name: '', email: '', roll_no: '', registration_no: '', employee_id: '', designation: '', department_id: '', course_id: '', batch_id: '', current_semester: 1 });
  const [err, setErr] = useState(null);
  const [temp, setTemp] = useState(null);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const save = async () => {
    setErr(null);
    try {
      const base = kind === 'student' ? '/api/admin/students' : '/api/admin/faculty';
      const body = { ...f, department_id: f.department_id || null, course_id: f.course_id || null, batch_id: f.batch_id || null, current_semester: Number(f.current_semester) };
      const r = initial ? await api.put(`${base}/${initial.id}`, body) : await api.post(base, body);
      if (r.temp_password) setTemp(r.temp_password); else { onSaved(); onClose(); }
    } catch (e) { setErr(e); }
  };
  if (temp) return <Modal title="Account created" onClose={() => { onSaved(); onClose(); }} actions={<button className="btn" onClick={() => { onSaved(); onClose(); }}>Done</button>}><p>Temporary password for <b>{f.login_id}</b>. Share it securely. It is shown only once and must be changed at first use.</p><pre className="json" style={{ fontSize: '1rem' }}>{temp}</pre></Modal>;
  return (
    <Modal title={`${initial ? 'Edit' : 'Add'} ${kind}`} onClose={onClose} actions={<><button className="btn secondary" onClick={onClose}>Cancel</button><button className="btn" onClick={save}>Save</button></>}>
      <ErrorBox error={err} />
      <div className="fields">
        <Field label="Login ID" id="pl"><input id="pl" value={f.login_id} onChange={set('login_id')} disabled={!!initial} /></Field>
        <Field label="Full name" id="pn"><input id="pn" value={f.full_name} onChange={set('full_name')} /></Field>
        <Field label="Email" id="pe"><input id="pe" value={f.email || ''} onChange={set('email')} /></Field>
        {kind === 'student' ? (<>
          <Field label="Roll number" id="pr"><input id="pr" value={f.roll_no} onChange={set('roll_no')} /></Field>
          <Field label="Registration number" id="pg"><input id="pg" value={f.registration_no} onChange={set('registration_no')} /></Field>
          <Field label="Current semester" id="ps"><input id="ps" type="number" min="1" max="12" value={f.current_semester} onChange={set('current_semester')} /></Field>
          <Field label="Course" id="pc"><Select id="pc" value={f.course_id} onChange={(v) => setF({ ...f, course_id: v })} options={courses.data} labelKey="name" placeholder="None" /></Field>
          <Field label="Batch" id="pb"><Select id="pb" value={f.batch_id} onChange={(v) => setF({ ...f, batch_id: v })} options={batches.data} placeholder="None" /></Field>
        </>) : (<>
          <Field label="Employee ID" id="pm"><input id="pm" value={f.employee_id} onChange={set('employee_id')} /></Field>
          <Field label="Designation" id="pd"><input id="pd" value={f.designation || ''} onChange={set('designation')} /></Field>
        </>)}
        <Field label="Department" id="pdp"><Select id="pdp" value={f.department_id} onChange={(v) => setF({ ...f, department_id: v })} options={depts.data} labelKey="name" placeholder="None" /></Field>
      </div>
      {!initial && <p className="hint">A temporary password is generated and shown once after saving.</p>}
    </Modal>
  );
}

export function Students() {
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [form, setForm] = useState(null);
  const [del, setDel] = useState(null);
  const [reset, setReset] = useState(null);
  const { loading, data, error, reload } = useAsync(() => api.get(`/api/admin/students${qs({ search, page, limit: 25 })}`), [search, page]);
  return (
    <>
      <PageHead title="Students" sub="Student records and accounts."><button className="btn" onClick={() => setForm({})}>Add student</button></PageHead>
      <div className="field" style={{ maxWidth: 320 }}><label htmlFor="ss">Search name, roll number or ID</label><input id="ss" value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} /></div>
      <ErrorBox error={error} />
      {loading && !data ? <Loading /> : data && (<>
        <div className="tablewrap"><table><thead><tr><th>Roll no</th><th>Name</th><th>Login ID</th><th>Course</th><th>Batch</th><th>Sem</th><th>Status</th><th></th></tr></thead>
          <tbody>{data.rows.map((s) => (
            <tr key={s.id}><td>{s.roll_no}</td><td>{s.full_name}</td><td>{s.login_id}</td><td>{s.course}</td><td>{s.batch}</td><td>{s.current_semester}</td><td>{s.is_active ? 'Active' : <span className="tag fail">Inactive</span>}</td>
              <td className="right nowrap"><button className="btn secondary small" onClick={() => setForm({ ...s, registration_no: s.registration_no })}>Edit</button> <button className="btn secondary small" onClick={() => setReset(s)}>Reset password</button> <button className="btn danger small" onClick={() => setDel(s)}>Remove</button></td></tr>
          ))}</tbody></table></div>
        <Pager page={page} limit={25} total={data.total} onPage={setPage} />
      </>)}
      {form && <PersonForm kind="student" initial={form.id ? form : null} onClose={() => setForm(null)} onSaved={reload} />}
      {del && <Confirm title="Remove student" danger confirmLabel="Remove" message={`Remove ${del.full_name}? Students with academic records are deactivated instead of deleted so published results stay intact.`} onClose={() => setDel(null)} onConfirm={async () => { await api.del(`/api/admin/students/${del.id}`); reload(); }} />}
      {reset && <ResetPw user={reset} onClose={() => setReset(null)} />}
    </>
  );
}

function ResetPw({ user, onClose }) {
  const [pw, setPw] = useState(null);
  return pw ? <Modal title="Temporary password" onClose={onClose} actions={<button className="btn" onClick={onClose}>Done</button>}><p>New temporary password for <b>{user.login_id}</b>, shown once:</p><pre className="json" style={{ fontSize: '1rem' }}>{pw}</pre></Modal>
    : <Confirm title="Reset password" message={`Generate a new temporary password for ${user.full_name}?`} confirmLabel="Reset" onClose={onClose} onConfirm={async () => { const r = await api.post(`/api/admin/users/${user.id}/reset-password`); setPw(r.temp_password); throw new Error('shown'); }} />;
}

export function FacultyList() {
  const [form, setForm] = useState(null);
  const [reset, setReset] = useState(null);
  const { loading, data, error, reload } = useAsync(() => api.get('/api/admin/faculty'), []);
  return (
    <>
      <PageHead title="Faculty" sub="Faculty accounts. Subjects are assigned on each offering."><button className="btn" onClick={() => setForm({})}>Add faculty</button></PageHead>
      <ErrorBox error={error} />
      {loading && !data ? <Loading /> : data && (
        <div className="tablewrap"><table><thead><tr><th>Employee ID</th><th>Name</th><th>Login ID</th><th>Department</th><th>Designation</th><th>Status</th><th></th></tr></thead>
          <tbody>{data.rows.map((f) => <tr key={f.id}><td>{f.employee_id}</td><td>{f.full_name}</td><td>{f.login_id}</td><td>{f.department}</td><td>{f.designation}</td><td>{f.is_active ? 'Active' : <span className="tag fail">Inactive</span>}</td>
            <td className="right nowrap"><button className="btn secondary small" onClick={() => setForm(f)}>Edit</button> <button className="btn secondary small" onClick={() => setReset(f)}>Reset password</button></td></tr>)}</tbody></table></div>
      )}
      {form && <PersonForm kind="faculty" initial={form.id ? form : null} onClose={() => setForm(null)} onSaved={reload} />}
      {reset && <ResetPw user={reset} onClose={() => setReset(null)} />}
    </>
  );
}

/* ---------------- Reference data ---------------- */
function RefTable({ name, title, fields, columns }) {
  const { loading, data, error, reload } = useAsync(() => lookup(name), [name]);
  const depts = useAsync(() => lookup('departments'), []);
  const courses = useAsync(() => lookup('courses'), []);
  const [form, setForm] = useState(null);
  const [err, setErr] = useState(null);
  const [del, setDel] = useState(null);
  const opts = { department_id: depts.data, course_id: courses.data };
  const save = async () => {
    setErr(null);
    try {
      if (form.id) await api.put(`/api/admin/ref/${name}/${form.id}`, form); else await api.post(`/api/admin/ref/${name}`, form);
      setForm(null); reload();
    } catch (e) { setErr(e); }
  };
  return (
    <section className="panel">
      <div className="pagehead" style={{ border: 0, margin: 0, paddingBottom: '.4rem' }}><h2>{title}</h2><button className="btn small" onClick={() => setForm(Object.fromEntries(fields.map((f) => [f.key, f.def ?? ''])))}>Add</button></div>
      <ErrorBox error={error} />
      {loading ? <Loading /> : (
        <div className="tablewrap"><table><thead><tr>{columns.map((c) => <th key={c.key}>{c.label}</th>)}<th></th></tr></thead>
          <tbody>{data.map((r) => <tr key={r.id}>{columns.map((c) => <td key={c.key}>{c.key === 'is_active' ? (r.is_active ? 'Active year' : '') : String(r[c.key] ?? '')}</td>)}
            <td className="right nowrap">
              {name === 'academic-years' && !r.is_active && <button className="btn secondary small" onClick={async () => { await api.post(`/api/admin/academic-years/${r.id}/activate`); reload(); }}>Make active</button>}{' '}
              <button className="btn secondary small" onClick={() => setForm({ ...r })}>Edit</button> <button className="btn danger small" onClick={() => setDel(r)}>Delete</button></td></tr>)}</tbody></table></div>
      )}
      {form && (
        <Modal title={`${form.id ? 'Edit' : 'Add'} ${title.toLowerCase()}`} onClose={() => { setForm(null); setErr(null); }} actions={<><button className="btn secondary" onClick={() => setForm(null)}>Cancel</button><button className="btn" onClick={save}>Save</button></>}>
          <ErrorBox error={err} />
          {fields.map((f) => (
            <Field key={f.key} label={f.label} id={`rf-${f.key}`}>
              {f.options ? <select id={`rf-${f.key}`} value={form[f.key] ?? ''} onChange={(e) => setForm({ ...form, [f.key]: e.target.value })}><option value="">Choose</option>{f.options.map((o) => <option key={o} value={o}>{o}</option>)}</select>
                : f.ref ? <Select id={`rf-${f.key}`} value={form[f.key]} onChange={(v) => setForm({ ...form, [f.key]: v })} options={opts[f.key]} labelKey="name" placeholder="None" />
                : <input id={`rf-${f.key}`} value={form[f.key] ?? ''} onChange={(e) => setForm({ ...form, [f.key]: e.target.value })} />}
            </Field>
          ))}
        </Modal>
      )}
      {del && <Confirm title="Delete" danger confirmLabel="Delete" message="Delete this record? Records in use cannot be deleted." onClose={() => setDel(null)} onConfirm={async () => { await api.del(`/api/admin/ref/${name}/${del.id}`); reload(); }} />}
    </section>
  );
}

export function SetupPage() {
  return (
    <>
      <PageHead title="Departments and subjects" sub="Academic structure used by students, offerings and reports." />
      <div className="cols">
        <RefTable name="departments" title="Departments" fields={[{ key: 'code', label: 'Code' }, { key: 'name', label: 'Name' }]} columns={[{ key: 'code', label: 'Code' }, { key: 'name', label: 'Name' }]} />
        <RefTable name="academic-years" title="Academic years" fields={[{ key: 'label', label: 'Label, for example 2025-2026' }]} columns={[{ key: 'label', label: 'Year' }, { key: 'is_active', label: '' }]} />
      </div>
      <div className="cols">
        <RefTable name="courses" title="Courses" fields={[{ key: 'code', label: 'Code' }, { key: 'name', label: 'Name' }, { key: 'department_id', label: 'Department', ref: true }, { key: 'total_semesters', label: 'Semesters', def: 8 }]} columns={[{ key: 'code', label: 'Code' }, { key: 'name', label: 'Name' }, { key: 'total_semesters', label: 'Semesters' }]} />
        <RefTable name="batches" title="Batches" fields={[{ key: 'label', label: 'Label, for example 2022-2026' }, { key: 'course_id', label: 'Course', ref: true }]} columns={[{ key: 'label', label: 'Batch' }]} />
      </div>
      <RefTable name="subjects" title="Subjects" fields={[{ key: 'code', label: 'Subject code' }, { key: 'name', label: 'Subject name' }, { key: 'subject_type', label: 'Type', options: ['theory', 'practical', 'sessional'] }, { key: 'department_id', label: 'Department', ref: true }]} columns={[{ key: 'code', label: 'Code' }, { key: 'name', label: 'Name' }, { key: 'subject_type', label: 'Type' }, { key: 'department', label: 'Department' }]} />
    </>
  );
}

/* ---------------- Offerings ---------------- */
export function Offerings() {
  const [f, setF] = useState({ academic_year_id: '', semester_no: '', status: '' });
  const years = useAsync(() => lookup('academic-years'), []);
  const subjects = useAsync(() => lookup('subjects'), []);
  const batches = useAsync(() => lookup('batches'), []);
  const { loading, data, error, reload } = useAsync(() => api.get(`/api/admin/offerings${qs(f)}`), [f.academic_year_id, f.semester_no, f.status]);
  const [form, setForm] = useState(null);
  const [err, setErr] = useState(null);
  const create = async () => {
    setErr(null);
    try { await api.post('/api/admin/offerings', form); setForm(null); reload(); } catch (e) { setErr(e); }
  };
  const sel = subjects.data && subjects.data.find((s) => String(s.id) === String(form && form.subject_id));
  return (
    <>
      <PageHead title="Subject offerings" sub="A subject offered in a given year and semester, with its credits, faculty, students and assessment components."><button className="btn" onClick={() => setForm({ subject_id: '', academic_year_id: (years.data || []).find((y) => y.is_active)?.id || '', semester_no: '', batch_id: '', credits: '', wca_max: '' })}>Create offering</button></PageHead>
      <div className="fields" style={{ marginBottom: '1rem' }}>
        <Field label="Academic year" id="fy"><Select id="fy" value={f.academic_year_id} onChange={(v) => setF({ ...f, academic_year_id: v })} options={years.data} /></Field>
        <Field label="Semester" id="fs"><Select id="fs" value={f.semester_no} onChange={(v) => setF({ ...f, semester_no: v })} options={[1, 2, 3, 4, 5, 6, 7, 8].map((n) => ({ id: n, label: `Semester ${n}` }))} /></Field>
        <Field label="Status" id="ft"><Select id="ft" value={f.status} onChange={(v) => setF({ ...f, status: v })} options={['draft', 'submitted', 'approved', 'published', 'locked'].map((s) => ({ id: s, label: s }))} /></Field>
      </div>
      <ErrorBox error={error} />
      {loading && !data ? <Loading /> : data && <OfferingRows rows={data.rows} />}
      {form && (
        <Modal title="Create offering" onClose={() => setForm(null)} actions={<><button className="btn secondary" onClick={() => setForm(null)}>Cancel</button><button className="btn" onClick={create}>Create</button></>}>
          <ErrorBox error={err} />
          <Field label="Subject" id="os"><Select id="os" value={form.subject_id} onChange={(v) => setForm({ ...form, subject_id: v })} options={(subjects.data || []).map((s) => ({ id: s.id, label: `${s.code} ${s.name} (${s.subject_type})` }))} placeholder="Choose" /></Field>
          <div className="fields">
            <Field label="Academic year" id="oy"><Select id="oy" value={form.academic_year_id} onChange={(v) => setForm({ ...form, academic_year_id: v })} options={years.data} placeholder="Choose" /></Field>
            <Field label="Semester" id="om"><input id="om" type="number" min="1" max="12" value={form.semester_no} onChange={(e) => setForm({ ...form, semester_no: e.target.value })} /></Field>
            <Field label="Batch" id="ob"><Select id="ob" value={form.batch_id} onChange={(v) => setForm({ ...form, batch_id: v })} options={batches.data} placeholder="None" /></Field>
            <Field label="Credits" id="oc" hint="Leave blank if not decided yet"><input id="oc" inputMode="decimal" value={form.credits} onChange={(e) => setForm({ ...form, credits: e.target.value })} /></Field>
            {sel && sel.subject_type === 'theory' && <Field label="WCA maximum" id="ow" hint="Raw max for the whole-semester CA"><input id="ow" inputMode="decimal" value={form.wca_max} onChange={(e) => setForm({ ...form, wca_max: e.target.value })} /></Field>}
          </div>
        </Modal>
      )}
    </>
  );
}

function OfferingRows({ rows }) {
  if (!rows.length) return <p className="muted">No offerings match.</p>;
  return (
    <div className="tablewrap"><table>
      <thead><tr><th>Subject</th><th>Year</th><th>Sem</th><th>Credits</th><th>Faculty</th><th className="num">Students</th><th>Status</th><th>Marks</th><th></th></tr></thead>
      <tbody>{rows.map((o) => (
        <tr key={o.id}><td>{o.subject_code} {o.subject_name}<div className="small muted" style={{ textTransform: 'capitalize' }}>{o.subject_type}</div></td><td>{o.academic_year}</td><td>{o.semester_no}</td>
          <td>{o.credits === null ? <span className="tag incomplete">not set</span> : trim(o.credits)}</td><td className="small">{o.faculty || <span className="muted">Unassigned</span>}</td><td className="num">{o.students}</td><td><Status value={o.status} /></td>
          <td style={{ minWidth: 110 }}><Progress value={o.entries_filled} max={o.entries_total} /></td>
          <td className="right nowrap"><Link className="btn secondary small" to={`/marks/${o.id}`}>Marks</Link> <Link className="btn small" to={`/admin/offerings/${o.id}`}>Manage</Link></td></tr>
      ))}</tbody>
    </table></div>
  );
}

export function OfferingDetail() {
  const { id } = useParams();
  const { loading, data, error, reload } = useAsync(() => api.get(`/api/admin/offerings/${id}`), [id]);
  const faculty = useAsync(() => api.get('/api/admin/faculty').then((r) => r.rows), []);
  const batches = useAsync(() => lookup('batches'), []);
  const students = useAsync(() => api.get('/api/admin/students?limit=200').then((r) => r.rows), []);
  const [facId, setFacId] = useState('');
  const [batchId, setBatchId] = useState('');
  const [stuId, setStuId] = useState('');
  const [credits, setCredits] = useState(null);
  const [validation, setValidation] = useState(null);
  const [act, setAct] = useState(null);
  const [err, setErr] = useState(null);
  if (loading && !data) return <Loading />;
  if (error) return <ErrorBox error={error} />;
  const o = data;
  const draft = o.status === 'draft';
  const run = async (fn) => { setErr(null); try { await fn(); reload(); } catch (e) { setErr(e); } };
  const validate = () => run(async () => setValidation(await api.get(`/api/admin/offerings/${id}/validate`)));
  return (
    <>
      <PageHead title={`${o.subject_code} ${o.subject_name}`} sub={`${o.academic_year}, semester ${o.semester_no}, ${o.subject_type}. Result version ${o.result_version}.`}>
        <Status value={o.status} /><Link className="btn secondary small" to={`/marks/${id}`}>Open marks</Link>
      </PageHead>
      <ErrorBox error={err} />
      <div className="cols">
        <section className="panel"><h2>Credits</h2>
          <p>Credits: <b>{o.credits === null ? 'not set' : trim(o.credits)}</b></p>
          {draft && <div className="actions"><input aria-label="Credits" style={{ width: 100 }} inputMode="decimal" value={credits ?? ''} placeholder="e.g. 4" onChange={(e) => setCredits(e.target.value)} /><button className="btn secondary small" disabled={credits === null || credits === ''} onClick={() => run(() => api.put(`/api/admin/offerings/${id}`, { credits: Number(credits) }))}>Set credits</button></div>}
        </section>
        <section className="panel"><h2>Faculty</h2>
          <ul style={{ paddingLeft: '1.1rem', margin: '0 0 .6rem' }}>{o.assigned_faculty.map((f) => <li key={f.faculty_id}>{f.full_name} <button className="btn secondary small" onClick={() => run(() => api.del(`/api/admin/offerings/${id}/faculty/${f.faculty_id}`))}>Remove</button></li>)}{o.assigned_faculty.length === 0 && <li className="muted">Nobody assigned</li>}</ul>
          <div className="actions"><Select id="af" value={facId} onChange={setFacId} options={(faculty.data || []).map((f) => ({ id: f.id, label: f.full_name }))} placeholder="Choose faculty" style={{ maxWidth: 240 }} /><button className="btn small" disabled={!facId} onClick={() => run(() => api.post(`/api/admin/offerings/${id}/faculty`, { faculty_id: Number(facId) }))}>Assign</button></div>
        </section>
      </div>
      <section className="panel"><h2>Enrolled students ({o.enrolled.length})</h2>
        {draft && (
          <div className="actions" style={{ marginBottom: '.8rem' }}>
            <Select id="eb" value={batchId} onChange={setBatchId} options={batches.data} placeholder="Enroll a whole batch" style={{ maxWidth: 220 }} /><button className="btn small" disabled={!batchId} onClick={() => run(() => api.post(`/api/admin/offerings/${id}/enroll`, { batch_id: Number(batchId) }))}>Enroll batch</button>
            <Select id="es" value={stuId} onChange={setStuId} options={(students.data || []).map((s) => ({ id: s.id, label: `${s.roll_no} ${s.full_name}` }))} placeholder="Enroll one student" style={{ maxWidth: 260 }} /><button className="btn small" disabled={!stuId} onClick={() => run(() => api.post(`/api/admin/offerings/${id}/enroll`, { student_ids: [Number(stuId)] }))}>Enroll student</button>
          </div>
        )}
        <div className="tablewrap" style={{ maxHeight: 280, overflow: 'auto' }}><table><tbody>{o.enrolled.map((s) => <tr key={s.student_id}><td>{s.roll_no}</td><td>{s.full_name}</td><td className="right">{draft && <button className="btn secondary small" onClick={() => run(() => api.del(`/api/admin/offerings/${id}/enroll/${s.student_id}`))}>Remove</button>}</td></tr>)}</tbody></table></div>
      </section>
      <section className="panel"><h2>Result workflow</h2>
        <p className="muted">Draft, submitted, approved, published, locked. Each step is recorded with who did it and when.</p>
        <div className="actions">
          <button className="btn secondary" onClick={validate}>Check marks and credits</button>
          <button className="btn" disabled={o.status !== 'submitted'} onClick={() => setAct('approve')}>Approve</button>
          <button className="btn" disabled={o.status !== 'approved'} onClick={() => setAct('publish')}>Publish</button>
          <button className="btn" disabled={o.status !== 'published'} onClick={() => setAct('lock')}>Lock</button>
          <button className="btn danger" disabled={o.status === 'draft'} onClick={() => setAct('reopen')}>{o.status === 'published' || o.status === 'locked' ? 'Open correction' : 'Return to draft'}</button>
        </div>
        {validation && <div className={`alert ${validation.ok ? 'ok' : 'warn'}`} style={{ marginTop: '.8rem' }}>{validation.ok ? `All ${validation.students} students have complete, valid marks. Credits are set.` : <>Not ready: <ul>{validation.problems.map((p, i) => <li key={i}>{p}</li>)}</ul></>}</div>}
        <h3 style={{ marginTop: '1rem' }}>History</h3>
        {o.history.length === 0 ? <p className="muted">No workflow actions yet.</p> : <div className="tablewrap"><table><thead><tr><th>When</th><th>Action</th><th>Version</th><th>By</th><th>Reason</th></tr></thead><tbody>{o.history.map((h, i) => <tr key={i}><td className="small nowrap">{fmtDate(h.acted_at)}</td><td>{h.action}</td><td>{h.result_version}</td><td>{h.acted_by}</td><td className="small">{h.reason}</td></tr>)}</tbody></table></div>}
      </section>
      {act && <WorkflowConfirm action={act} offering={o} onClose={() => setAct(null)} onDone={reload} />}
    </>
  );
}

const COPY = {
  approve: ['Approve results', 'This calculates grades and credit points for every student from the submitted marks. Nothing is visible to students yet.', 'Approve'],
  publish: ['Publish results', 'Students will immediately see these grades, SGPA and CGPA, and can download grade cards. Continue?', 'Publish'],
  lock: ['Lock results', 'Locked results cannot be changed without an explicit correction that is recorded in the audit log.', 'Lock'],
};
export function WorkflowConfirm({ action, offering, onClose, onDone }) {
  const id = offering.id;
  const published = offering.status === 'published' || offering.status === 'locked';
  if (action === 'reopen') {
    return <Confirm title={published ? 'Open a correction' : 'Return to draft'} danger askReason confirmLabel={published ? 'Open correction' : 'Return to draft'} onClose={onClose}
      message={published ? 'A new result version is started. The currently published version stays visible to students until the corrected version is published. Your reason is recorded.' : 'The submitted or approved marks return to draft so they can be edited and recalculated. Your reason is recorded.'}
      onConfirm={async (reason) => { await api.post(`/api/admin/offerings/${id}/reopen`, { reason }); onDone(); }} />;
  }
  const [t, m, l] = COPY[action];
  return <Confirm title={t} message={`${offering.subject_code}: ${m}`} confirmLabel={l} onClose={onClose} onConfirm={async () => { await api.post(`/api/admin/offerings/${id}/${action}`, {}); onDone(); }} />;
}

export function Workflow() {
  const [status, setStatus] = useState('submitted');
  const { loading, data, error, reload } = useAsync(() => api.get(`/api/admin/offerings${qs({ status })}`), [status]);
  const [act, setAct] = useState(null);
  const next = { submitted: 'approve', approved: 'publish', published: 'lock' };
  return (
    <>
      <PageHead title="Approve and publish" sub="Move subject results through approval, publication and locking." />
      <div className="tabs" role="tablist">{['submitted', 'approved', 'published', 'locked', 'draft'].map((s) => <button key={s} role="tab" aria-selected={status === s} onClick={() => setStatus(s)} style={{ textTransform: 'capitalize' }}>{s}</button>)}</div>
      <ErrorBox error={error} />
      {loading && !data ? <Loading /> : data && (data.rows.length === 0 ? <p className="muted">Nothing in {status}.</p> : (
        <div className="tablewrap"><table><thead><tr><th>Subject</th><th>Year</th><th>Sem</th><th>Faculty</th><th className="num">Students</th><th></th></tr></thead>
          <tbody>{data.rows.map((o) => <tr key={o.id}><td>{o.subject_code} {o.subject_name}</td><td>{o.academic_year}</td><td>{o.semester_no}</td><td className="small">{o.faculty}</td><td className="num">{o.students}</td>
            <td className="right nowrap"><Link className="btn secondary small" to={`/admin/offerings/${o.id}`}>Details</Link> {next[o.status] && <button className="btn small" onClick={() => setAct({ action: next[o.status], o })} style={{ textTransform: 'capitalize' }}>{next[o.status]}</button>}</td></tr>)}</tbody></table></div>
      ))}
      {act && <WorkflowConfirm action={act.action} offering={act.o} onClose={() => setAct(null)} onDone={reload} />}
    </>
  );
}

/* ---------------- Documents for any student ---------------- */
export function Documents() {
  const students = useAsync(() => api.get('/api/admin/students?limit=200').then((r) => r.rows), []);
  const [sid, setSid] = useState('');
  const [sem, setSem] = useState('');
  const [kind, setKind] = useState('grade-card');
  const sems = useAsync(() => (sid ? api.get(`/api/admin/students/${sid}/semesters`).then((r) => r.rows) : Promise.resolve([])), [sid]);
  const [ay, s] = (sem || ':').split(':');
  const doc = useAsync(() => (sid && sem ? api.get(`/api/admin/students/${sid}/${kind}${qs({ academic_year_id: ay, semester_no: s })}`) : Promise.resolve(null)), [sid, sem, kind]);
  return (
    <>
      <PageHead title="Student documents" sub="View or print the grade card or internal marksheet of any student with published results.">
        {doc.data && <><button className="btn secondary" onClick={() => window.print()}>Print</button><button className="btn" onClick={() => download(`/api/admin/students/${sid}/${kind}.pdf${qs({ academic_year_id: ay, semester_no: s })}`, `${kind}.pdf`)}>Download PDF</button></>}
      </PageHead>
      <div className="fields no-print" style={{ marginBottom: '1rem' }}>
        <Field label="Student" id="ds"><Select id="ds" value={sid} onChange={(v) => { setSid(v); setSem(''); }} options={(students.data || []).map((x) => ({ id: x.id, label: `${x.roll_no} ${x.full_name}` }))} placeholder="Choose" /></Field>
        <Field label="Semester" id="dm"><Select id="dm" value={sem} onChange={setSem} options={(sems.data || []).map((r) => ({ id: `${r.academic_year_id}:${r.semester_no}`, label: `${r.academic_year}, semester ${r.semester_no}` }))} placeholder="Choose" /></Field>
        <Field label="Document" id="dk"><select id="dk" value={kind} onChange={(e) => setKind(e.target.value)}><option value="grade-card">Grade card</option><option value="internal-marksheet">Internal marksheet</option></select></Field>
      </div>
      <ErrorBox error={doc.error} />
      {doc.data && (kind === 'grade-card' ? <GradeCardDoc gc={doc.data} /> : <InternalMarksheetDoc ms={doc.data} />)}
    </>
  );
}
