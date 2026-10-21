import React, { useCallback, useEffect, useRef, useState } from 'react';

export function useAsync(fn, deps = []) {
  const [state, setState] = useState({ loading: true, data: null, error: null });
  const run = useCallback(async () => {
    setState((s) => ({ ...s, loading: true, error: null }));
    try { const data = await fn(); setState({ loading: false, data, error: null }); }
    catch (e) { setState({ loading: false, data: null, error: e }); }
  }, deps); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { run(); }, [run]);
  return { ...state, reload: run };
}

export function ErrorBox({ error }) {
  if (!error) return null;
  const details = Array.isArray(error.details) ? error.details : null;
  return (
    <div className="alert error" role="alert">
      {error.message || String(error)}
      {details && (
        <ul>
          {details.slice(0, 12).map((d, i) => <li key={i}>{typeof d === 'string' ? d : (d.error || (d.errors && d.errors.join('; ')) || JSON.stringify(d))}{d && d.line ? ` (line ${d.line})` : ''}</li>)}
          {details.length > 12 && <li>and {details.length - 12} more</li>}
        </ul>
      )}
    </div>
  );
}

export const Loading = ({ text = 'Loading' }) => <p className="muted" role="status">{text}...</p>;

export function Status({ value }) {
  return <span className={`tag ${value}`}>{value}</span>;
}

export function PageHead({ title, sub, children }) {
  return (
    <div className="pagehead">
      <div><h1>{title}</h1>{sub && <p>{sub}</p>}</div>
      {children && <div className="actions">{children}</div>}
    </div>
  );
}

export function Modal({ title, children, onClose, actions }) {
  const ref = useRef(null);
  useEffect(() => {
    const prev = document.activeElement;
    ref.current && ref.current.focus();
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => { window.removeEventListener('keydown', onKey); prev && prev.focus && prev.focus(); };
  }, [onClose]);
  return (
    <div className="backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby="modal-title" tabIndex={-1} ref={ref}>
        <h2 id="modal-title">{title}</h2>
        {children}
        <div className="actions">{actions}</div>
      </div>
    </div>
  );
}

// Confirmation dialog for irreversible actions such as publishing and locking.
export function Confirm({ title, message, confirmLabel = 'Confirm', danger, askReason, onConfirm, onClose }) {
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const go = async () => {
    setBusy(true); setErr(null);
    try { await onConfirm(reason); onClose(); } catch (e) { setErr(e); setBusy(false); }
  };
  return (
    <Modal title={title} onClose={onClose} actions={
      <>
        <button className="btn secondary" onClick={onClose} disabled={busy}>Cancel</button>
        <button className={`btn ${danger ? 'danger' : ''}`} onClick={go} disabled={busy || (askReason && reason.trim().length < 5)}>{busy ? 'Working...' : confirmLabel}</button>
      </>
    }>
      <p>{message}</p>
      {askReason && (
        <div className="field">
          <label htmlFor="reason">Reason (required, recorded in the audit log)</label>
          <textarea id="reason" value={reason} onChange={(e) => setReason(e.target.value)} style={{ minHeight: 70, fontFamily: 'inherit' }} />
        </div>
      )}
      <ErrorBox error={err} />
    </Modal>
  );
}

export function Field({ label, hint, children, id }) {
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      {children}
      {hint && <div className="hint">{hint}</div>}
    </div>
  );
}

export function Select({ id, value, onChange, options, placeholder = 'All', labelKey = 'label', valueKey = 'id', ...rest }) {
  return (
    <select id={id} value={value ?? ''} onChange={(e) => onChange(e.target.value)} {...rest}>
      {placeholder !== null && <option value="">{placeholder}</option>}
      {(options || []).map((o) => <option key={o[valueKey]} value={o[valueKey]}>{o[labelKey]}</option>)}
    </select>
  );
}

export function Pager({ page, limit, total, onPage }) {
  const pages = Math.max(1, Math.ceil(total / limit));
  return (
    <div className="actions no-print" style={{ marginTop: '.6rem' }}>
      <button className="btn secondary small" disabled={page <= 1} onClick={() => onPage(page - 1)}>Previous</button>
      <span className="small muted">Page {page} of {pages}, {total} records</span>
      <button className="btn secondary small" disabled={page >= pages} onClick={() => onPage(page + 1)}>Next</button>
    </div>
  );
}

export const n2 = (v, d = 2) => (v === null || v === undefined ? '-' : Number(v).toFixed(d));
export const trim = (v) => (v === null || v === undefined ? '-' : String(Math.round(Number(v) * 100) / 100));
export const fmtDate = (v) => (v ? new Date(v).toLocaleString() : '-');

export function Progress({ value, max }) {
  const pct = max ? Math.round((100 * value) / max) : 0;
  return <div className="bar" role="progressbar" aria-valuenow={pct} aria-valuemin="0" aria-valuemax="100" aria-label={`${pct} percent complete`}><span style={{ width: `${pct}%` }} /></div>;
}
