import React, { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../api';
import { useAuth } from '../auth.jsx';
import { Confirm, ErrorBox, Field, Loading, Modal, PageHead, Progress, Status, useAsync, n2, trim, fmtDate } from '../components/ui.jsx';

export function FacultyDashboard() {
  const { loading, data, error } = useAsync(() => api.get('/api/faculty/dashboard'), []);
  if (loading) return <Loading />;
  if (error) return <ErrorBox error={error} />;
  return (
    <>
      <PageHead title="Faculty dashboard" sub="Your assigned subjects and pending assessment work." />
      <div className="figures">
        <div className="figure"><div className="n">{data.offerings.length}</div><div className="l">Assigned subjects</div></div>
        <div className="figure"><div className="n">{data.students}</div><div className="l">Students in your classes</div></div>
        <div className="figure"><div className="n">{data.draft}</div><div className="l">Drafts</div></div>
        <div className="figure"><div className="n">{data.submitted}</div><div className="l">Submitted</div></div>
        <div className="figure"><div className="n">{data.missing_marks}</div><div className="l">Missing marks in drafts</div></div>
      </div>
      <div className="cols">
        <section className="panel"><h2>Subjects needing attention</h2>
          <OfferingTable rows={data.offerings.filter((o) => o.status === 'draft')} empty="No drafts. Everything assigned to you has been submitted." />
        </section>
        <section className="panel"><h2>Recent activity</h2>
          {data.recent_activity.length === 0 ? <p className="muted">No activity yet.</p> : (
            <div className="tablewrap"><table><tbody>{data.recent_activity.map((a, i) => <tr key={i}><td className="small nowrap">{fmtDate(a.created_at)}</td><td>{a.action}</td></tr>)}</tbody></table></div>
          )}
        </section>
      </div>
    </>
  );
}

function OfferingTable({ rows, empty }) {
  if (!rows.length) return <p className="muted">{empty}</p>;
  return (
    <div className="tablewrap"><table>
      <thead><tr><th>Subject</th><th>Type</th><th>Sem</th><th>Status</th><th>Entries</th><th></th></tr></thead>
      <tbody>{rows.map((o) => (
        <tr key={o.id}>
          <td>{o.subject_code} {o.subject_name}<div className="small muted">{o.academic_year}</div></td>
          <td style={{ textTransform: 'capitalize' }}>{o.subject_type}</td><td>{o.semester_no}</td><td><Status value={o.status} /></td>
          <td style={{ minWidth: 130 }}><Progress value={o.entries_filled} max={o.entries_total} /><span className="small muted">{o.entries_missing} missing</span></td>
          <td><Link className="btn small" to={`/marks/${o.id}`}>Open marks</Link></td>
        </tr>
      ))}</tbody>
    </table></div>
  );
}

export function MySubjects() {
  const { loading, data, error } = useAsync(() => api.get('/api/offerings/mine'), []);
  return (
    <>
      <PageHead title="My subjects" sub="Assigned subjects and their assessment status." />
      <ErrorBox error={error} />
      {loading ? <Loading /> : <OfferingTable rows={data.rows} empty="No subjects have been assigned to you." />}
    </>
  );
}

const keyOf = (sid, code) => `${sid}:${code}`;

export function MarksEntry() {
  const { id } = useParams();
  const { user } = useAuth();
  const { loading, data, error, reload } = useAsync(() => api.get(`/api/offerings/${id}/grid`), [id]);
  const [edits, setEdits] = useState({});
  const [msg, setMsg] = useState(null);
  const [err, setErr] = useState(null);
  const [tab, setTab] = useState('grid');
  const [confirmSubmit, setConfirmSubmit] = useState(false);

  useEffect(() => { setEdits({}); }, [id, data && data.offering.result_version]);

  const dirtyCount = Object.keys(edits).length;
  const compByCode = useMemo(() => Object.fromEntries((data ? data.components : []).map((c) => [c.code, c])), [data]);
  const invalid = (code, v) => {
    if (v === '' || v === undefined) return false;
    const n = Number(v);
    return !Number.isFinite(n) || n < 0 || n > compByCode[code].raw_max;
  };
  const anyInvalid = Object.entries(edits).some(([k, v]) => invalid(k.split(':')[1], v));

  if (loading && !data) return <Loading />;
  if (error) return <ErrorBox error={error} />;
  const off = data.offering;
  const editable = off.editable;

  const save = async () => {
    setErr(null); setMsg(null);
    const entries = Object.entries(edits).map(([k, v]) => { const [sid, code] = k.split(':'); return { student_id: Number(sid), component_code: code, raw_score: v === '' ? null : Number(v) }; });
    try {
      const r = await api.put(`/api/offerings/${id}/marks`, { entries });
      setMsg(`Saved ${r.changed} changed mark(s) as draft.`); setEdits({}); reload();
    } catch (e) { setErr(e); }
  };
  const move = (e, ri, code) => {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp' && e.key !== 'Enter') return;
    e.preventDefault();
    const next = ri + (e.key === 'ArrowUp' ? -1 : 1);
    const el = document.getElementById(`cell-${next}-${code}`);
    if (el) { el.focus(); el.select(); }
  };
  const valueOf = (r, code) => {
    const k = keyOf(r.student_id, code);
    if (k in edits) return edits[k];
    const s = r.cells[code].score;
    return s === null ? '' : String(s);
  };
  const exportCsv = () => {
    const head = ['roll_no', ...data.components.map((c) => c.code)];
    const lines = [head.join(','), ...data.rows.map((r) => [r.roll_no, ...data.components.map((c) => valueOf(r, c.code))].join(','))];
    const blob = new Blob([lines.join('\r\n') + '\r\n'], { type: 'text/csv' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `marks-${off.subject_code}.csv`; a.click();
  };

  return (
    <>
      <PageHead title={`${off.subject_code} ${off.subject_name}`} sub={`${off.academic_year}, semester ${off.semester_no}, ${off.subject_type}. Scheme version ${off.scheme_version}.`}>
        <Status value={off.status} />
        {user.role === 'admin' && <Link className="btn secondary small" to={`/admin/offerings/${id}`}>Offering settings</Link>}
      </PageHead>
      {!editable && <div className="alert warn">This offering is {off.status}, so marks are read only. An administrator must reopen it before changes can be made.</div>}
      <div className="figures">
        <div className="figure"><div className="n">{data.stats.students}</div><div className="l">Students</div></div>
        <div className="figure"><div className="n">{data.stats.entries_total - data.stats.entries_missing}/{data.stats.entries_total}</div><div className="l">Marks entered</div></div>
        <div className="figure"><div className="n">{data.stats.entries_missing}</div><div className="l">Missing</div></div>
        <div className="figure"><div className="n">{data.stats.complete_students}</div><div className="l">Complete students</div></div>
      </div>
      <div className="tabs" role="tablist">
        {[['grid', 'Marks table'], ['import', 'CSV import'], ['history', 'Change history'], ...(off.subject_type === 'sessional' ? [['components', 'Sessional components']] : [])].map(([k, l]) => (
          <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)}>{l}</button>
        ))}
      </div>
      <ErrorBox error={err} />
      {msg && <div className="alert ok" role="status">{msg}</div>}

      {tab === 'grid' && (
        <>
          {off.subject_type === 'theory' && <WcaSetting off={off} editable={editable} onSaved={reload} />}
          {off.credits === null && <div className="alert warn">Credits are not configured for this subject yet. An administrator must set them before approval.</div>}
          <div className="tablewrap"><table className="grid">
            <thead><tr>
              <th className="sticky-col">Roll no</th><th>Student</th>
              {data.components.map((c) => <th key={c.code} className="num">{c.code}<small>out of {trim(c.raw_max)}</small></th>)}
              <th className="num">Internal<small>converted</small></th><th className="num">Final<small>converted</small></th>
            </tr></thead>
            <tbody>
              {data.rows.map((r, ri) => (
                <tr key={r.student_id}>
                  <td className="sticky-col nowrap">{r.roll_no}</td><td>{r.full_name}</td>
                  {data.components.map((c) => {
                    const k = keyOf(r.student_id, c.code);
                    const v = valueOf(r, c.code);
                    return (
                      <td key={c.code} className="num">
                        <input id={`cell-${ri}-${c.code}`} inputMode="decimal" aria-label={`${r.roll_no} ${c.code}`} value={v} disabled={!editable}
                          className={`${k in edits ? 'dirty' : ''} ${invalid(c.code, v) ? 'invalid' : ''}`}
                          onChange={(e) => setEdits({ ...edits, [k]: e.target.value })} onKeyDown={(e) => move(e, ri, c.code)} />
                      </td>
                    );
                  })}
                  <td className="num">{r.complete ? `${n2(r.summary.internal)} / ${trim(r.summary.internal_max)}` : <span className="muted small">incomplete</span>}</td>
                  <td className="num">{r.complete ? `${n2(r.summary.final)} / ${trim(r.summary.final_max)}` : <span className="muted small">{r.summary.errors && r.summary.errors.length ? 'check marks' : `${(r.summary.missing || []).length} missing`}</span>}</td>
                </tr>
              ))}
            </tbody>
          </table></div>
          <p className="hint">Internal and final columns show converted marks, not raw marks. Use arrow keys or Enter to move down a column. Blank means not entered yet.</p>
          <div className="actions" style={{ marginTop: '.8rem' }}>
            <button className="btn" disabled={!editable || !dirtyCount || anyInvalid} onClick={save}>Save draft{dirtyCount ? ` (${dirtyCount})` : ''}</button>
            <button className="btn secondary" disabled={!dirtyCount} onClick={() => setEdits({})}>Discard changes</button>
            <button className="btn secondary" onClick={exportCsv}>Export CSV</button>
            <button className="btn" disabled={!editable || dirtyCount > 0} onClick={() => setConfirmSubmit(true)}>Submit for approval</button>
          </div>
          {dirtyCount > 0 && <p className="hint">Save your changes before submitting.</p>}
        </>
      )}
      {tab === 'import' && <CsvImport id={id} editable={editable} codes={data.components.map((c) => c.code)} onDone={() => { reload(); setTab('grid'); setMsg('CSV imported as draft marks.'); }} />}
      {tab === 'history' && <History id={id} />}
      {tab === 'components' && <SessionalComponents id={id} data={data} editable={editable} onChanged={reload} />}
      {confirmSubmit && <Confirm title="Submit marks for approval" message="After submitting you cannot edit these marks. An administrator can approve them or return them to draft. Continue?" confirmLabel="Submit" onClose={() => setConfirmSubmit(false)} onConfirm={async () => { await api.post(`/api/offerings/${id}/submit`); reload(); setMsg('Submitted for approval.'); }} />}
    </>
  );
}

function WcaSetting({ off, editable, onSaved }) {
  const [v, setV] = useState(off.wca_max === null ? '' : String(off.wca_max));
  const [err, setErr] = useState(null);
  return (
    <div className="panel">
      <div className="fields">
        <Field label="WCA maximum marks" id="wca" hint="Raw maximum for the whole-semester CA. Converted to 10 in the final result.">
          <input id="wca" inputMode="decimal" value={v} disabled={!editable} onChange={(e) => setV(e.target.value)} />
        </Field>
        <div><button className="btn secondary" disabled={!editable || !v} onClick={async () => { setErr(null); try { await api.put(`/api/offerings/${off.id}/wca-max`, { wca_max: Number(v) }); onSaved(); } catch (e) { setErr(e); } }}>Set WCA maximum</button></div>
      </div>
      <ErrorBox error={err} />
    </div>
  );
}

function CsvImport({ id, editable, codes, onDone }) {
  const [csv, setCsv] = useState('');
  const [prev, setPrev] = useState(null);
  const [err, setErr] = useState(null);
  const file = (e) => { const f = e.target.files[0]; if (f) f.text().then((t) => { setCsv(t); setPrev(null); }); };
  const preview = async () => { setErr(null); try { setPrev(await api.post(`/api/offerings/${id}/import`, { csv })); } catch (e) { setErr(e); setPrev(null); } };
  const commit = async () => { setErr(null); try { await api.post(`/api/offerings/${id}/import`, { csv, commit: true }); onDone(); } catch (e) { setErr(e); } };
  return (
    <section className="panel">
      <p>First column <b>roll_no</b>, then one column per component: <code>{codes.join(', ')}</code>. Blank cells leave existing marks untouched. Nothing is saved until the preview is clean and you import.</p>
      <div className="field"><label htmlFor="csvf">CSV file</label><input id="csvf" type="file" accept=".csv,text/csv" onChange={file} /></div>
      <div className="field"><label htmlFor="csvt">Or paste CSV text</label><textarea id="csvt" value={csv} onChange={(e) => { setCsv(e.target.value); setPrev(null); }} placeholder={`roll_no,${codes.slice(0, 2).join(',')}\n...`} /></div>
      <ErrorBox error={err} />
      <div className="actions"><button className="btn secondary" onClick={preview} disabled={!csv.trim()}>Preview and validate</button><button className="btn" onClick={commit} disabled={!editable || !prev || prev.error_rows > 0 || prev.valid_rows === 0}>Import as draft</button></div>
      {prev && (
        <div style={{ marginTop: '1rem' }}>
          <p><b>{prev.valid_rows}</b> valid row(s), <b>{prev.error_rows}</b> row(s) with errors.</p>
          <div className="tablewrap"><table><thead><tr><th>Line</th><th>Roll no</th><th>Values</th><th>Problems</th></tr></thead>
            <tbody>{prev.rows.map((r) => <tr key={r.line}><td>{r.line}</td><td>{r.roll_no}</td><td className="small">{Object.entries(r.values).map(([k, v]) => `${k}=${v}`).join(', ')}</td><td>{r.errors.length ? <span style={{ color: 'var(--bad)' }}>{r.errors.join('; ')}</span> : <span className="muted">None</span>}</td></tr>)}</tbody></table></div>
        </div>
      )}
    </section>
  );
}

function History({ id }) {
  const { loading, data, error } = useAsync(() => api.get(`/api/offerings/${id}/history`), [id]);
  if (loading) return <Loading />;
  if (error) return <ErrorBox error={error} />;
  if (!data.rows.length) return <p className="muted">No changes recorded yet.</p>;
  return (
    <div className="tablewrap"><table><thead><tr><th>When</th><th>Roll no</th><th>Component</th><th className="num">Old</th><th className="num">New</th><th>By</th><th>Reason</th></tr></thead>
      <tbody>{data.rows.map((h, i) => <tr key={i}><td className="small nowrap">{fmtDate(h.changed_at)}</td><td>{h.roll_no}</td><td>{h.component}</td><td className="num">{trim(h.old_score)}</td><td className="num">{trim(h.new_score)}</td><td>{h.changed_by}</td><td className="small">{h.reason}</td></tr>)}</tbody></table></div>
  );
}

function SessionalComponents({ id, data, editable, onChanged }) {
  const [form, setForm] = useState(null);
  const [err, setErr] = useState(null);
  const [del, setDel] = useState(null);
  const sum = data.components.reduce((a, c) => a + c.contribution_max, 0);
  const save = async () => {
    setErr(null);
    try {
      const body = { code: form.code, label: form.label, raw_max: Number(form.raw_max), contribution_max: Number(form.contribution_max) };
      if (form.id) await api.put(`/api/offerings/${id}/components/${form.id}`, body); else await api.post(`/api/offerings/${id}/components`, body);
      setForm(null); onChanged();
    } catch (e) { setErr(e); }
  };
  return (
    <section className="panel">
      <p>Each sessional subject has its own components. Weights must add up to <b>100</b> before the marks can be submitted. Current total: <b style={{ color: Math.abs(sum - 100) < 1e-9 ? 'var(--ok)' : 'var(--bad)' }}>{trim(sum)}</b>.</p>
      <div className="tablewrap"><table><thead><tr><th>Code</th><th>Component</th><th className="num">Maximum marks</th><th className="num">Weight (of 100)</th><th></th></tr></thead>
        <tbody>{data.components.map((c) => (
          <tr key={c.id}><td>{c.code}</td><td>{c.label}</td><td className="num">{trim(c.raw_max)}</td><td className="num">{trim(c.contribution_max)}</td>
            <td className="right">{editable && <><button className="btn secondary small" onClick={() => setForm({ id: c.id, code: c.code, label: c.label, raw_max: c.raw_max, contribution_max: c.contribution_max })}>Edit</button> <button className="btn danger small" onClick={() => setDel(c)}>Remove</button></>}</td></tr>
        ))}</tbody></table></div>
      {editable && <p style={{ marginTop: '.8rem' }}><button className="btn" onClick={() => setForm({ code: '', label: '', raw_max: '', contribution_max: '' })}>Add component</button></p>}
      {form && (
        <Modal title={form.id ? 'Edit component' : 'Add component'} onClose={() => setForm(null)} actions={<><button className="btn secondary" onClick={() => setForm(null)}>Cancel</button><button className="btn" onClick={save}>Save</button></>}>
          <ErrorBox error={err} />
          <Field label="Code" id="cc" hint="Letters and digits, for example ASG, PRJ"><input id="cc" value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })} /></Field>
          <Field label="Name" id="cl"><input id="cl" value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })} /></Field>
          <Field label="Maximum marks" id="cm"><input id="cm" inputMode="decimal" value={form.raw_max} onChange={(e) => setForm({ ...form, raw_max: e.target.value })} /></Field>
          <Field label="Weight in the final 100" id="cw"><input id="cw" inputMode="decimal" value={form.contribution_max} onChange={(e) => setForm({ ...form, contribution_max: e.target.value })} /></Field>
        </Modal>
      )}
      {del && <Confirm title="Remove component" danger confirmLabel="Remove" message={`Remove ${del.code}? Any marks entered for it are deleted. This is recorded in the audit log.`} onClose={() => setDel(null)} onConfirm={async () => { await api.del(`/api/offerings/${id}/components/${del.id}`); onChanged(); }} />}
    </section>
  );
}
