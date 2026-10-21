import React, { useEffect, useState } from 'react';
import { api, qs } from '../api';
import { ErrorBox, Field, Loading, PageHead, Pager, useAsync, fmtDate, Confirm } from '../components/ui.jsx';

/* ---------- Grading and credits ---------- */
export function Grading() {
  const { loading, data, error, reload } = useAsync(() => api.get('/api/admin/grading'), []);
  const [form, setForm] = useState(null);
  const [err, setErr] = useState(null);
  const [ok, setOk] = useState(false);
  const [confirm, setConfirm] = useState(false);
  useEffect(() => { if (data) setForm({ name: data.name, pass_marks_percent: data.pass_marks_percent, is_placeholder: data.is_placeholder, bands: data.bands.map((b) => ({ ...b })) }); }, [data]);
  if (loading || !form) return <Loading />;
  if (error) return <ErrorBox error={error} />;
  const setBand = (i, k, v) => setForm({ ...form, bands: form.bands.map((b, j) => (j === i ? { ...b, [k]: v } : b)) });
  const save = async (reason) => {
    setErr(null); setOk(false);
    const payload = { ...form, reason, bands: form.bands.map((b) => ({ ...b, min_marks: Number(b.min_marks), grade_point: Number(b.grade_point) })) };
    try { await api.put('/api/admin/grading', payload); setOk(true); reload(); } catch (e) { setErr(e); throw e; }
  };
  return (
    <>
      <PageHead title="Grading and credits" sub="Letter grades, grade points and pass rule. Credits are set per subject offering." />
      {form.is_placeholder && <div className="alert warn">These grading bands are placeholders, not official thresholds. Confirm or replace them with the institution's rules, then untick "Still a placeholder".</div>}
      <ErrorBox error={err} />
      {ok && <div className="alert ok">Grading scheme saved. Results already approved keep the grading scheme used at the time.</div>}
      <section className="panel">
        <div className="fields">
          <Field label="Scheme name" id="gn"><input id="gn" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
          <Field label="Minimum pass marks (percent)" id="gp"><input id="gp" type="number" min="0" max="100" value={form.pass_marks_percent} onChange={(e) => setForm({ ...form, pass_marks_percent: e.target.value })} /></Field>
          <div className="field"><label><input type="checkbox" checked={form.is_placeholder} onChange={(e) => setForm({ ...form, is_placeholder: e.target.checked })} /> Still a placeholder</label></div>
        </div>
      </section>
      <div className="tablewrap"><table>
        <thead><tr><th>Letter</th><th>Minimum marks</th><th>Grade point</th><th>Counts as pass</th><th></th></tr></thead>
        <tbody>
          {form.bands.map((b, i) => (
            <tr key={i}>
              <td><input aria-label="Letter grade" value={b.letter} maxLength={4} style={{ width: 70 }} onChange={(e) => setBand(i, 'letter', e.target.value)} /></td>
              <td><input aria-label="Minimum marks" type="number" value={b.min_marks} style={{ width: 100 }} onChange={(e) => setBand(i, 'min_marks', e.target.value)} /></td>
              <td><input aria-label="Grade point" type="number" step="0.5" value={b.grade_point} style={{ width: 100 }} onChange={(e) => setBand(i, 'grade_point', e.target.value)} /></td>
              <td><input aria-label="Counts as pass" type="checkbox" checked={!!b.is_pass} onChange={(e) => setBand(i, 'is_pass', e.target.checked)} /></td>
              <td><button className="btn secondary small" onClick={() => setForm({ ...form, bands: form.bands.filter((_, j) => j !== i) })}>Remove</button></td>
            </tr>
          ))}
        </tbody>
      </table></div>
      <div className="actions" style={{ marginTop: '.8rem' }}>
        <button className="btn secondary" onClick={() => setForm({ ...form, bands: [...form.bands, { letter: '', min_marks: 0, grade_point: 0, is_pass: true }] })}>Add band</button>
        <button className="btn" onClick={() => setConfirm(true)}>Save grading scheme</button>
      </div>
      {confirm && <Confirm title="Save grading scheme" message="A new grading scheme version becomes active. It applies to results approved from now on." confirmLabel="Save" askReason onConfirm={save} onClose={() => setConfirm(false)} />}
    </>
  );
}

/* ---------- Assessment schemes ---------- */
const DEFAULT_CFG = {
  theory: { ca_max: 25, ca_contribution: 10, eca_max: 70, eca_contribution: 10, wca_contribution: 10, ese_max: 70, ese_contribution: 70 },
  practical: { pca_max: 40, pca_contribution: 40, pese_max: 60, pese_contribution: 60 },
};
const LABELS = {
  ca_max: 'Class test raw maximum (CA1, CA2)', ca_contribution: 'Class tests combined contribution', eca_max: 'ECA raw maximum', eca_contribution: 'ECA contribution',
  wca_contribution: 'WCA contribution (raw maximum set per subject)', ese_max: 'End-semester raw maximum', ese_contribution: 'End-semester contribution',
  pca_max: 'PCA raw maximum (PCA1, PCA2)', pca_contribution: 'PCA average contribution', pese_max: 'Practical end-semester raw maximum', pese_contribution: 'Practical end-semester contribution',
};

export function Schemes() {
  const { loading, data, error, reload } = useAsync(() => api.get('/api/admin/schemes'), []);
  const [type, setType] = useState('theory');
  const [cfg, setCfg] = useState(DEFAULT_CFG.theory);
  const [err, setErr] = useState(null);
  const [confirm, setConfirm] = useState(false);
  useEffect(() => { setCfg(DEFAULT_CFG[type] || {}); }, [type]);
  if (loading) return <Loading />;
  if (error) return <ErrorBox error={error} />;
  const save = async (reason) => {
    setErr(null);
    const config = Object.fromEntries(Object.entries(cfg).map(([k, v]) => [k, Number(v)]));
    try { await api.post('/api/admin/schemes', { scheme_type: type, config, reason }); reload(); } catch (e) { setErr(e); throw e; }
  };
  return (
    <>
      <PageHead title="Assessment schemes" sub="Raw maxima and conversion weights. A change creates a new version. Existing offerings and published results keep the version they were created with." />
      <div className="tablewrap"><table>
        <thead><tr><th>Type</th><th>Version</th><th>Name</th><th>Current</th><th>Configuration</th><th>Created</th></tr></thead>
        <tbody>{data.rows.map((s) => <tr key={s.id}><td>{s.scheme_type}</td><td>{s.version}</td><td>{s.name}</td><td>{s.is_current ? 'Yes' : ''}</td><td><code className="small">{JSON.stringify(s.config)}</code></td><td>{fmtDate(s.created_at)}</td></tr>)}</tbody>
      </table></div>
      <section className="panel" style={{ marginTop: '1.1rem' }}>
        <h2>Create a new version</h2>
        <p className="muted small">Theory: class tests are averaged then converted, so the combined contribution is not 25 each. Sessional schemes are built per subject, so they have no global configuration.</p>
        <ErrorBox error={err} />
        <div className="field" style={{ maxWidth: 220 }}><label htmlFor="st">Scheme type</label>
          <select id="st" value={type} onChange={(e) => setType(e.target.value)}><option value="theory">Theory</option><option value="practical">Practical</option></select></div>
        <div className="fields">
          {Object.keys(cfg).map((k) => <Field key={k} id={k} label={LABELS[k] || k}><input id={k} type="number" min="0" step="any" value={cfg[k]} onChange={(e) => setCfg({ ...cfg, [k]: e.target.value })} /></Field>)}
        </div>
        <button className="btn" style={{ marginTop: '.8rem' }} onClick={() => setConfirm(true)}>Create version</button>
      </section>
      {confirm && <Confirm title="Create scheme version" message="New offerings will use this version. Existing offerings are not changed." confirmLabel="Create" askReason onConfirm={save} onClose={() => setConfirm(false)} />}
    </>
  );
}

/* ---------- Settings ---------- */
const SETTING_LABELS = {
  institution_name: ['College or institution name', 'text'], university_name: ['University name', 'text'],
  university_former_name: ['University former name (only if officially applicable)', 'text'], exam_name: ['Examination name on grade cards', 'text'],
  exam_session: ['Examination session', 'text'], rounding_decimals: ['Decimal places for final marks (0 to 4)', 'number'],
  include_failed_in_sgpa: ['Include failed subjects in SGPA and CGPA', 'bool'], cgpa_to_percentage_factor: ['Percentage per CGPA point (leave empty for none)', 'number'],
  show_ygpa: ['Show YGPA line (awaiting configuration)', 'bool'], mar_enabled: ['Show MAR line (awaiting configuration)', 'bool'],
};

export function Settings() {
  const { loading, data, error, reload } = useAsync(() => api.get('/api/admin/settings'), []);
  const [vals, setVals] = useState(null);
  const [err, setErr] = useState(null);
  const [ok, setOk] = useState(false);
  useEffect(() => { if (data) setVals(Object.fromEntries(data.rows.map((r) => [r.key, r.value]))); }, [data]);
  if (loading || !vals) return <Loading />;
  if (error) return <ErrorBox error={error} />;
  const save = async (e) => {
    e.preventDefault(); setErr(null); setOk(false);
    const out = {};
    for (const [k, [, type]] of Object.entries(SETTING_LABELS)) {
      let v = vals[k];
      if (type === 'number') v = v === '' || v === null ? null : Number(v);
      if (type === 'text' && (v === '' || v === undefined)) v = k === 'university_former_name' ? null : '';
      out[k] = v;
    }
    try { await api.put('/api/admin/settings', out); setOk(true); reload(); } catch (x) { setErr(x); }
  };
  return (
    <>
      <PageHead title="Settings" sub="Shown on grade cards and used by the calculation rules." />
      <form className="panel" onSubmit={save}>
        <ErrorBox error={err} />
        {ok && <div className="alert ok">Settings saved.</div>}
        <div className="fields">
          {Object.entries(SETTING_LABELS).map(([k, [label, type]]) => (
            <Field key={k} id={k} label={label}>
              {type === 'bool'
                ? <select id={k} value={vals[k] ? 'yes' : 'no'} onChange={(e) => setVals({ ...vals, [k]: e.target.value === 'yes' })}><option value="yes">Yes</option><option value="no">No</option></select>
                : <input id={k} type={type === 'number' ? 'number' : 'text'} step="any" value={vals[k] ?? ''} onChange={(e) => setVals({ ...vals, [k]: e.target.value })} />}
            </Field>
          ))}
        </div>
        <button className="btn" style={{ marginTop: '1rem' }}>Save settings</button>
      </form>
    </>
  );
}

/* ---------- Audit log ---------- */
export function Audit() {
  const [f, setF] = useState({ entity_type: '', action: '', actor: '' });
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState(null);
  const limit = 25;
  const { loading, data, error } = useAsync(() => api.get(`/api/admin/audit${qs({ ...f, page, limit })}`), [f.entity_type, f.action, f.actor, page]);
  return (
    <>
      <PageHead title="Audit log" sub="Marks, grades, scheme changes, publication, locking and administrative actions." />
      <div className="fields panel">
        <Field label="Entity type" id="e"><input id="e" value={f.entity_type} onChange={(e) => { setPage(1); setF({ ...f, entity_type: e.target.value }); }} placeholder="subject_offering" /></Field>
        <Field label="Action starts with" id="a"><input id="a" value={f.action} onChange={(e) => { setPage(1); setF({ ...f, action: e.target.value }); }} placeholder="offering." /></Field>
        <Field label="Actor" id="c"><input id="c" value={f.actor} onChange={(e) => { setPage(1); setF({ ...f, actor: e.target.value }); }} /></Field>
      </div>
      <ErrorBox error={error} />
      {loading ? <Loading /> : data && (
        <>
          <div className="tablewrap"><table>
            <thead><tr><th>When</th><th>Actor</th><th>Action</th><th>Record</th><th>Reason</th><th></th></tr></thead>
            <tbody>{data.rows.map((r) => (
              <React.Fragment key={r.id}>
                <tr><td className="nowrap">{fmtDate(r.created_at)}</td><td>{r.actor_name}</td><td>{r.action}</td><td>{r.entity_type} {r.entity_id}</td><td>{r.reason}</td>
                  <td><button className="btn secondary small" onClick={() => setOpen(open === r.id ? null : r.id)}>{open === r.id ? 'Hide' : 'Details'}</button></td></tr>
                {open === r.id && <tr><td colSpan={6}><div className="cols"><div><b className="small">Old value</b><pre className="json">{JSON.stringify(r.old_value, null, 2)}</pre></div><div><b className="small">New value</b><pre className="json">{JSON.stringify(r.new_value, null, 2)}</pre></div></div></td></tr>}
              </React.Fragment>
            ))}</tbody>
          </table></div>
          <Pager page={page} limit={limit} total={data.total} onPage={setPage} />
        </>
      )}
    </>
  );
}
