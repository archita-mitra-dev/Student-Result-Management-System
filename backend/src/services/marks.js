// Marks entry for faculty and administrators. Marks can change only while an offering is a draft.
const { query, tx } = require('../db/pool');
const calc = require('./calc');
const { bad, conflict, forbidden, notFound } = require('../utils/http');
const { audit } = require('../utils/audit');
const { parseCsv } = require('../utils/csv');
const results = require('./results');

async function assertOfferingAccess(user, offeringId, client) {
  const q = client ? client.query.bind(client) : query;
  const o = (await q('SELECT id FROM subject_offerings WHERE id=$1', [offeringId])).rows[0];
  if (!o) throw notFound('Offering not found');
  if (user.role === 'admin') return;
  if (user.role !== 'faculty') throw forbidden();
  const a = (await q('SELECT 1 FROM faculty_subject_assignments WHERE faculty_id=$1 AND offering_id=$2', [user.id, offeringId])).rows[0];
  if (!a) throw forbidden('Unauthorized subject: you are not assigned to this subject');
}

async function getGrid(user, offeringId) {
  await assertOfferingAccess(user, offeringId);
  const off = await results.loadOffering({ query }, offeringId);
  const comps = await results.loadComponents({ query }, offeringId);
  const students = (await query(
    `SELECT e.student_id, u.full_name, sp.roll_no FROM student_enrollments e
       JOIN student_profiles sp ON sp.user_id=e.student_id JOIN users u ON u.id=e.student_id
      WHERE e.offering_id=$1 ORDER BY sp.roll_no`, [offeringId])).rows;
  const marks = (await query(
    `SELECT m.component_id, m.student_id, m.raw_score, m.feedback FROM student_assessment_marks m
       JOIN assessment_components c ON c.id=m.component_id WHERE c.offering_id=$1`, [offeringId])).rows;
  const markMap = new Map(marks.map((m) => [`${m.component_id}:${m.student_id}`, m]));
  let missing = 0;
  const rows = students.map((s) => {
    const cells = {};
    for (const c of comps) {
      const m = markMap.get(`${c.id}:${s.student_id}`);
      const v = m && m.raw_score !== null ? Number(m.raw_score) : null;
      if (v === null) missing++;
      cells[c.code] = { score: v, feedback: m ? m.feedback : null };
    }
    const numeric = results.calcStudent(off, comps, new Map(marks.map((m) => [`${m.component_id}:${m.student_id}`, m.raw_score === null ? null : Number(m.raw_score)])), s.student_id);
    const summary = numeric.complete ? {
      internal: calc.roundTo(numeric.internal, 2), internal_max: numeric.internal_max, final: calc.roundTo(numeric.final, 2), final_max: numeric.final_max,
      contributions: Object.fromEntries(Object.entries(numeric.contributions).map(([k, v]) => [k, calc.roundTo(v, 2)])),
    } : { missing: numeric.missing, errors: numeric.errors };
    return { student_id: s.student_id, roll_no: s.roll_no, full_name: s.full_name, cells, summary, complete: numeric.complete };
  });
  const total = students.length * comps.length;
  return {
    offering: {
      id: off.id, subject_code: off.subject_code, subject_name: off.subject_name, subject_type: off.subject_type, status: off.status,
      semester_no: off.semester_no, academic_year: off.academic_year, credits: off.credits === null ? null : Number(off.credits),
      wca_max: off.wca_max === null ? null : Number(off.wca_max), scheme_version: off.scheme_version, result_version: off.result_version,
      editable: off.status === 'draft',
    },
    components: comps.map((c) => ({ id: c.id, code: c.code, label: c.label, category: c.category, raw_max: Number(c.raw_max), contribution_max: Number(c.contribution_max), conducted_by: c.conducted_by })),
    rows,
    stats: { students: students.length, components: comps.length, entries_total: total, entries_missing: missing, complete_students: rows.filter((r) => r.complete).length },
  };
}

// entries: [{ student_id, component_code, raw_score (number|null|''), feedback? }]
async function saveMarks(user, offeringId, entries, reason) {
  if (!Array.isArray(entries) || !entries.length) throw bad('No marks supplied');
  if (entries.length > 5000) throw bad('Too many entries in one request');
  return tx(async (client) => {
    await assertOfferingAccess(user, offeringId, client);
    const off = await results.loadOffering(client, offeringId, true);
    if (off.status !== 'draft') throw conflict(`Marks are ${off.status} and cannot be edited. Ask an administrator to reopen them.`);
    const comps = await results.loadComponents(client, offeringId);
    const compByCode = new Map(comps.map((c) => [c.code, c]));
    const enrolled = new Set((await client.query('SELECT student_id FROM student_enrollments WHERE offering_id=$1', [offeringId])).rows.map((r) => r.student_id));
    const seen = new Set();
    const errors = [];
    const clean = [];
    entries.forEach((e, i) => {
      const comp = compByCode.get(e.component_code);
      const sid = Number(e.student_id);
      if (!comp) return errors.push({ index: i, error: `Unknown component ${e.component_code}` });
      if (!enrolled.has(sid)) return errors.push({ index: i, error: `Student ${e.student_id} is not enrolled in this subject` });
      const key = `${comp.id}:${sid}`;
      if (seen.has(key)) return errors.push({ index: i, error: `Duplicate entry for student ${sid} and ${comp.code}` });
      seen.add(key);
      let score = e.raw_score;
      if (score === '' || score === undefined) score = null;
      if (score !== null) {
        const r = calc.checkScore(score, comp.raw_max, comp.code);
        if (!r.ok) return errors.push({ index: i, student_id: sid, component_code: comp.code, error: r.error });
        score = r.value;
      }
      clean.push({ comp, sid, score, feedback: typeof e.feedback === 'string' ? e.feedback.slice(0, 500) : undefined });
    });
    if (errors.length) throw bad('Some marks are invalid. Nothing was saved.', errors.slice(0, 100));

    let changed = 0;
    for (const e of clean) {
      const old = (await client.query('SELECT raw_score, feedback FROM student_assessment_marks WHERE component_id=$1 AND student_id=$2', [e.comp.id, e.sid])).rows[0];
      const oldScore = old && old.raw_score !== null ? Number(old.raw_score) : null;
      const feedbackChanged = e.feedback !== undefined && (old ? old.feedback : null) !== (e.feedback || null);
      if (old && oldScore === e.score && !feedbackChanged) continue;
      await client.query(
        `INSERT INTO student_assessment_marks (component_id, student_id, raw_score, feedback, entered_by)
         VALUES ($1,$2,$3,$4,$5)
         ON CONFLICT (component_id, student_id) DO UPDATE SET raw_score=EXCLUDED.raw_score,
           feedback=COALESCE($4, student_assessment_marks.feedback), entered_by=$5, updated_at=now()`,
        [e.comp.id, e.sid, e.score, e.feedback === undefined ? null : e.feedback, user.id]);
      if (oldScore !== e.score) {
        await client.query('INSERT INTO mark_history (component_id, student_id, old_score, new_score, changed_by, reason) VALUES ($1,$2,$3,$4,$5,$6)',
          [e.comp.id, e.sid, oldScore, e.score, user.id, reason || null]);
        await audit(client, user, 'marks.update', 'student_assessment_mark', `${e.comp.id}:${e.sid}`, { raw_score: oldScore }, { raw_score: e.score, component: e.comp.code, offering: offeringId }, reason);
      }
      changed++;
    }
    await client.query('UPDATE subject_offerings SET updated_at=now() WHERE id=$1', [offeringId]);
    return { saved: clean.length, changed };
  });
}

// CSV layout: first column roll_no (or login_id), other columns are component codes.
async function importCsv(user, offeringId, csvText, commit) {
  await assertOfferingAccess(user, offeringId);
  const rows = parseCsv(csvText || '');
  if (rows.length < 2) throw bad('The CSV needs a header row and at least one data row');
  const header = rows[0].map((h) => h.trim());
  const idCol = header.findIndex((h) => /^(roll_?no|roll|login_?id)$/i.test(h));
  if (idCol < 0) throw bad('The first header must be roll_no (or login_id)');
  const comps = await results.loadComponents({ query }, offeringId);
  const compByCode = new Map(comps.map((c) => [c.code.toUpperCase(), c]));
  const colMap = [];
  const headerErrors = [];
  header.forEach((h, i) => {
    if (i === idCol) return;
    const c = compByCode.get(h.toUpperCase());
    if (!c) headerErrors.push(`Unknown column "${h}"`);
    else colMap.push({ i, code: c.code });
  });
  if (headerErrors.length) throw bad('CSV header problems', headerErrors);
  if (!colMap.length) throw bad('No component columns found');
  const students = (await query(
    `SELECT e.student_id, sp.roll_no, u.login_id FROM student_enrollments e
       JOIN student_profiles sp ON sp.user_id=e.student_id JOIN users u ON u.id=e.student_id WHERE e.offering_id=$1`, [offeringId])).rows;
  const byKey = new Map();
  students.forEach((s) => { byKey.set(s.roll_no.toUpperCase(), s); byKey.set(s.login_id.toUpperCase(), s); });
  const preview = [];
  const entries = [];
  const seenStudents = new Set();
  rows.slice(1).forEach((r, idx) => {
    const line = idx + 2;
    const key = (r[idCol] || '').toUpperCase();
    const st = byKey.get(key);
    const rowErrors = [];
    if (!st) rowErrors.push(`Student "${r[idCol]}" is not enrolled in this subject`);
    else if (seenStudents.has(st.student_id)) rowErrors.push('Duplicate row for this student');
    if (st) seenStudents.add(st.student_id);
    const vals = {};
    for (const cm of colMap) {
      const raw = r[cm.i];
      if (raw === undefined || raw === '') continue; // blank cell leaves the existing mark untouched
      const comp = compByCode.get(cm.code.toUpperCase());
      const chk = calc.checkScore(raw, comp.raw_max, cm.code);
      if (!chk.ok) rowErrors.push(chk.error || `${cm.code}: invalid`);
      else vals[cm.code] = chk.value;
    }
    preview.push({ line, roll_no: r[idCol], values: vals, errors: rowErrors });
    if (!rowErrors.length && st) for (const [code, v] of Object.entries(vals)) entries.push({ student_id: st.student_id, component_code: code, raw_score: v });
  });
  const errorCount = preview.filter((p) => p.errors.length).length;
  if (!commit) return { committed: false, rows: preview, valid_rows: preview.length - errorCount, error_rows: errorCount };
  if (errorCount) throw bad('Fix the errors in the CSV before importing. Nothing was saved.', preview.filter((p) => p.errors.length).slice(0, 50));
  const r = await saveMarks(user, offeringId, entries, 'CSV import');
  return { committed: true, ...r, rows: preview.length };
}

async function submit(user, offeringId) {
  await assertOfferingAccess(user, offeringId);
  return tx((c) => results.transition(c, user, offeringId, 'submit'));
}

async function setWcaMax(user, offeringId, wcaMax) {
  const n = Number(wcaMax);
  if (!Number.isFinite(n) || n <= 0 || n > 1000) throw bad('WCA maximum must be a positive number');
  return tx(async (client) => {
    await assertOfferingAccess(user, offeringId, client);
    const off = await results.loadOffering(client, offeringId, true);
    if (off.subject_type !== 'theory') throw bad('WCA applies to theory subjects only');
    if (off.status !== 'draft') throw conflict('Locked or submitted offerings cannot be changed');
    const existing = (await client.query(
      `SELECT MAX(m.raw_score) AS mx FROM student_assessment_marks m JOIN assessment_components c ON c.id=m.component_id WHERE c.offering_id=$1 AND c.code='WCA'`, [offeringId])).rows[0];
    if (existing.mx !== null && Number(existing.mx) > n) throw bad(`A saved WCA mark (${existing.mx}) is above the new maximum`);
    await client.query('UPDATE subject_offerings SET wca_max=$2, updated_at=now() WHERE id=$1', [offeringId, n]);
    await client.query(`UPDATE assessment_components SET raw_max=$2, updated_at=now() WHERE offering_id=$1 AND code='WCA'`, [offeringId, n]);
    await audit(client, user, 'offering.wca_max', 'subject_offering', offeringId, { wca_max: off.wca_max }, { wca_max: n });
    return { wca_max: n };
  });
}

async function upsertSessionalComponent(user, offeringId, body, componentId) {
  const code = String(body.code || '').trim().toUpperCase();
  const label = String(body.label || '').trim();
  const raw_max = Number(body.raw_max);
  const weight = Number(body.contribution_max);
  if (!/^[A-Z0-9_]{1,12}$/.test(code)) throw bad('Code must be 1 to 12 letters, digits or underscores');
  if (!label || label.length > 80) throw bad('Label is required');
  if (!(raw_max > 0) || !(weight >= 0) || weight > 100) throw bad('Maximum marks must be above 0 and weight between 0 and 100');
  return tx(async (client) => {
    await assertOfferingAccess(user, offeringId, client);
    const off = await results.loadOffering(client, offeringId, true);
    if (off.subject_type !== 'sessional') throw bad('Custom components are for sessional subjects only');
    if (off.status !== 'draft') throw conflict('Components can be changed only while the offering is a draft');
    let row;
    if (componentId) {
      const old = (await client.query('SELECT * FROM assessment_components WHERE id=$1 AND offering_id=$2', [componentId, offeringId])).rows[0];
      if (!old) throw notFound('Component not found');
      const mx = (await client.query('SELECT MAX(raw_score) AS mx FROM student_assessment_marks WHERE component_id=$1', [componentId])).rows[0].mx;
      if (mx !== null && Number(mx) > raw_max) throw bad(`A saved mark (${mx}) is above the new maximum`);
      row = (await client.query('UPDATE assessment_components SET code=$3,label=$4,raw_max=$5,contribution_max=$6,updated_at=now() WHERE id=$1 AND offering_id=$2 RETURNING *',
        [componentId, offeringId, code, label, raw_max, weight])).rows[0];
      await audit(client, user, 'component.update', 'assessment_component', componentId, old, row);
    } else {
      const n = (await client.query('SELECT COALESCE(MAX(sort_order),0)+1 AS n FROM assessment_components WHERE offering_id=$1', [offeringId])).rows[0].n;
      row = (await client.query(
        `INSERT INTO assessment_components (offering_id, code, label, category, raw_max, contribution_max, sort_order, conducted_by)
         VALUES ($1,$2,$3,'internal',$4,$5,$6,'College (internal)') RETURNING *`, [offeringId, code, label, raw_max, weight, n])).rows[0];
      await audit(client, user, 'component.create', 'assessment_component', row.id, null, row);
    }
    return row;
  });
}

async function deleteSessionalComponent(user, offeringId, componentId) {
  return tx(async (client) => {
    await assertOfferingAccess(user, offeringId, client);
    const off = await results.loadOffering(client, offeringId, true);
    if (off.subject_type !== 'sessional') throw bad('Only sessional components can be removed');
    if (off.status !== 'draft') throw conflict('Components can be changed only while the offering is a draft');
    const old = (await client.query('DELETE FROM assessment_components WHERE id=$1 AND offering_id=$2 RETURNING *', [componentId, offeringId])).rows[0];
    if (!old) throw notFound('Component not found');
    await audit(client, user, 'component.delete', 'assessment_component', componentId, old, null);
    return { deleted: true };
  });
}

async function markHistory(user, offeringId, studentId) {
  await assertOfferingAccess(user, offeringId);
  const params = [offeringId];
  let extra = '';
  if (studentId) { params.push(studentId); extra = ' AND h.student_id=$2'; }
  const { rows } = await query(
    `SELECT h.changed_at, c.code AS component, sp.roll_no, h.old_score, h.new_score, u.full_name AS changed_by, h.reason
       FROM mark_history h JOIN assessment_components c ON c.id=h.component_id
       JOIN student_profiles sp ON sp.user_id=h.student_id LEFT JOIN users u ON u.id=h.changed_by
      WHERE c.offering_id=$1 ${extra} ORDER BY h.changed_at DESC LIMIT 300`, params);
  return rows;
}

module.exports = { assertOfferingAccess, getGrid, saveMarks, importCsv, submit, setWcaMax, upsertSessionalComponent, deleteSessionalComponent, markHistory };
