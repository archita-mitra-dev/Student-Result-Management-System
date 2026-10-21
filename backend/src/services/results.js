// Result calculation, workflow transitions and SGPA/CGPA generation.
const calc = require('./calc');
const { bad, conflict, notFound, forbidden } = require('../utils/http');
const { audit } = require('../utils/audit');
const { getSettings, getGrading } = require('./settings');

const STATUS_ORDER = ['draft', 'submitted', 'approved', 'published', 'locked'];

async function loadOffering(client, offeringId, lock = false) {
  const { rows } = await client.query(
    `SELECT o.*, s.code AS subject_code, s.name AS subject_name, s.subject_type,
            sc.version AS scheme_version, sc.config AS scheme_config, ay.label AS academic_year
       FROM subject_offerings o
       JOIN subjects s ON s.id=o.subject_id
       JOIN assessment_schemes sc ON sc.id=o.scheme_id
       JOIN academic_years ay ON ay.id=o.academic_year_id
      WHERE o.id=$1 ${lock ? 'FOR UPDATE OF o' : ''}`, [offeringId]);
  if (!rows[0]) throw notFound('Offering not found');
  return rows[0];
}

async function loadComponents(client, offeringId) {
  return (await client.query('SELECT * FROM assessment_components WHERE offering_id=$1 ORDER BY sort_order, id', [offeringId])).rows;
}

// Standard components created when an offering is created. Sessional components are added by teachers.
function standardComponents(type, cfg, wcaMax) {
  if (type === 'theory') {
    return [
      { code: 'CA1', label: 'Class Test 1', category: 'internal', raw_max: cfg.ca_max, contribution_max: cfg.ca_contribution, conducted_by: 'College' },
      { code: 'CA2', label: 'Class Test 2', category: 'internal', raw_max: cfg.ca_max, contribution_max: 0, conducted_by: 'College' },
      { code: 'ECA', label: 'End-Semester CA (central online test)', category: 'internal', raw_max: cfg.eca_max, contribution_max: cfg.eca_contribution, conducted_by: 'University' },
      { code: 'WCA', label: 'Whole-Semester CA', category: 'internal', raw_max: wcaMax || 1, contribution_max: cfg.wca_contribution, conducted_by: 'College / Teacher' },
      { code: 'ESE', label: 'Theory End-Semester Examination', category: 'external', raw_max: cfg.ese_max, contribution_max: cfg.ese_contribution, conducted_by: 'University' },
    ];
  }
  if (type === 'practical') {
    return [
      { code: 'PCA1', label: 'Practical CA 1', category: 'internal', raw_max: cfg.pca_max, contribution_max: cfg.pca_contribution, conducted_by: 'College' },
      { code: 'PCA2', label: 'Practical CA 2', category: 'internal', raw_max: cfg.pca_max, contribution_max: 0, conducted_by: 'College' },
      { code: 'PESE', label: 'Practical End-Semester Examination', category: 'external', raw_max: cfg.pese_max, contribution_max: cfg.pese_contribution, conducted_by: 'External Examiner' },
    ];
  }
  return [];
}

// Builds the row list used by the detailed marks report and the internal marksheet.
function displayRows(c, comps, cfg) {
  const rows = [];
  const raw = c.raw || {};
  if (c.type === 'theory') {
    const wmax = raw.wca_max;
    rows.push({ code: 'CA1', label: 'Class Test 1', kind: 'internal', raw: raw.CA1, raw_max: cfg.ca_max });
    rows.push({ code: 'CA2', label: 'Class Test 2', kind: 'internal', raw: raw.CA2, raw_max: cfg.ca_max });
    rows.push({ code: 'CA', label: 'CA (average of CA1 and CA2)', kind: 'internal', raw: (raw.CA1 + raw.CA2) / 2, raw_max: cfg.ca_max, contribution: c.contributions.CA, contribution_max: cfg.ca_contribution });
    rows.push({ code: 'ECA', label: 'End-Semester CA', kind: 'internal', raw: raw.ECA, raw_max: cfg.eca_max, contribution: c.contributions.ECA, contribution_max: cfg.eca_contribution });
    rows.push({ code: 'WCA', label: 'Whole-Semester CA', kind: 'internal', raw: raw.WCA, raw_max: wmax, contribution: c.contributions.WCA, contribution_max: cfg.wca_contribution });
    rows.push({ code: 'ESE', label: 'Theory End-Semester Examination', kind: 'external', raw: raw.ESE, raw_max: cfg.ese_max, contribution: c.contributions.ESE, contribution_max: cfg.ese_contribution });
  } else if (c.type === 'practical') {
    rows.push({ code: 'PCA1', label: 'Practical CA 1', kind: 'internal', raw: raw.PCA1, raw_max: cfg.pca_max });
    rows.push({ code: 'PCA2', label: 'Practical CA 2', kind: 'internal', raw: raw.PCA2, raw_max: cfg.pca_max });
    rows.push({ code: 'PCA', label: 'PCA (average of PCA1 and PCA2)', kind: 'internal', raw: (raw.PCA1 + raw.PCA2) / 2, raw_max: cfg.pca_max, contribution: c.contributions.PCA, contribution_max: cfg.pca_contribution });
    rows.push({ code: 'PESE', label: 'Practical End-Semester Examination', kind: 'external', raw: raw.PESE, raw_max: cfg.pese_max, contribution: c.contributions.PESE, contribution_max: cfg.pese_contribution });
  } else {
    for (const comp of comps) {
      rows.push({ code: comp.code, label: comp.label, kind: 'internal', raw: raw[comp.code], raw_max: Number(comp.raw_max), contribution: c.contributions[comp.code], contribution_max: Number(comp.contribution_max) });
    }
  }
  return rows;
}

function scoresFor(type, comps, markMap, studentId) {
  if (type === 'sessional') {
    return comps.map((c) => ({ code: c.code, label: c.label, raw_max: c.raw_max, contribution_max: c.contribution_max, score: markMap.get(`${c.id}:${studentId}`) ?? null }));
  }
  const s = {};
  for (const c of comps) s[c.code] = markMap.get(`${c.id}:${studentId}`) ?? null;
  return s;
}

async function loadMarkMap(client, offeringId) {
  const { rows } = await client.query(
    `SELECT m.component_id, m.student_id, m.raw_score FROM student_assessment_marks m
       JOIN assessment_components c ON c.id=m.component_id WHERE c.offering_id=$1`, [offeringId]);
  const map = new Map();
  for (const r of rows) map.set(`${r.component_id}:${r.student_id}`, r.raw_score === null ? null : Number(r.raw_score));
  return map;
}

function calcStudent(off, comps, markMap, studentId) {
  const sc = scoresFor(off.subject_type, comps, markMap, studentId);
  if (off.subject_type === 'theory') return calc.computeTheory(sc, off.scheme_config, off.wca_max);
  if (off.subject_type === 'practical') return calc.computePractical(sc, off.scheme_config);
  return calc.computeSessional(sc);
}

// Computes results for every enrolled student without saving. Used by validation and approval.
async function computeOffering(client, offeringId) {
  const off = await loadOffering(client, offeringId);
  const comps = await loadComponents(client, offeringId);
  const markMap = await loadMarkMap(client, offeringId);
  const grading = await getGrading(client);
  const settings = await getSettings(client);
  const students = (await client.query(
    `SELECT e.student_id, u.full_name, sp.roll_no FROM student_enrollments e
       JOIN student_profiles sp ON sp.user_id=e.student_id JOIN users u ON u.id=e.student_id
      WHERE e.offering_id=$1 ORDER BY sp.roll_no`, [offeringId])).rows;
  const decimals = settings.rounding_decimals ?? 2;
  const out = students.map((st) => {
    const c = calcStudent(off, comps, markMap, st.student_id);
    const item = { student_id: st.student_id, roll_no: st.roll_no, full_name: st.full_name, calc: c };
    if (c.complete && grading) {
      const final = calc.roundTo(c.final, decimals);
      const g = calc.gradeFor(final, grading.bands, grading.scheme.pass_marks_percent);
      item.final_rounded = final;
      item.grade = g;
    }
    return item;
  });
  return { off, comps, grading, settings, items: out };
}

function assertEligibleForApproval(res) {
  const problems = [];
  if (!res.grading) problems.push('No active grading scheme is configured');
  if (!res.items.length) problems.push('No students are enrolled');
  if (res.off.credits === null || res.off.credits === undefined) problems.push('Subject credits are not configured for this offering');
  for (const it of res.items) {
    if (!it.calc.complete) problems.push(`${it.roll_no}: ${[...it.calc.missing.map((m) => `${m} missing`), ...it.calc.errors].join('; ')}`);
    else if (!it.grade) problems.push(`${it.roll_no}: no grading band matches ${it.final_rounded}`);
  }
  return problems;
}

async function transition(client, user, offeringId, action, reason) {
  const off = await loadOffering(client, offeringId, true);
  const st = off.status;
  const log = (to, extra = {}) => client.query(
    `INSERT INTO result_publications (offering_id, action, result_version, acted_by, reason) VALUES ($1,$2,$3,$4,$5)`,
    [offeringId, action, extra.version ?? off.result_version, user.id, reason || null]);

  if (action === 'submit') {
    if (st !== 'draft') throw conflict(`Only a draft can be submitted (current status: ${st})`);
    const res = await computeOffering(client, offeringId);
    const probs = assertEligibleForApproval({ ...res, off: { ...res.off, credits: res.off.credits ?? 0 } })
      .filter((p) => !/credits are not configured/.test(p));
    if (probs.length) throw bad('Marks are incomplete or invalid, submission blocked', probs.slice(0, 50));
    await client.query(`UPDATE subject_offerings SET status='submitted', submitted_at=now(), updated_at=now() WHERE id=$1`, [offeringId]);
    await log('submitted');
    await audit(client, user, 'offering.submit', 'subject_offering', offeringId, { status: st }, { status: 'submitted' }, reason);
    return 'submitted';
  }

  if (action === 'approve') {
    if (st !== 'submitted') throw conflict(`Only submitted marks can be approved (current status: ${st})`);
    const res = await computeOffering(client, offeringId);
    const probs = assertEligibleForApproval(res);
    if (probs.length) throw bad('Result validation failed, approval blocked', probs.slice(0, 50));
    await client.query('DELETE FROM subject_results WHERE offering_id=$1 AND result_version=$2', [offeringId, off.result_version]);
    const grading = res.grading;
    for (const it of res.items) {
      const c = it.calc;
      const display = displayRows(c, res.comps, off.scheme_config);
      const breakdown = {
        type: c.type, rows: display, contributions: c.contributions, internal: c.internal, internal_max: c.internal_max,
        final_unrounded: c.final, final_max: c.final_max, rounding_decimals: res.settings.rounding_decimals ?? 2,
      };
      const cp = calc.creditPoints(off.credits, it.grade.grade_point);
      await client.query(
        `INSERT INTO subject_results (offering_id, student_id, result_version, scheme_id, scheme_version, grading_scheme_id,
           internal_marks, internal_max, final_marks, breakdown, letter_grade, grade_point, credits, credit_points, is_pass, result_status)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)`,
        [offeringId, it.student_id, off.result_version, off.scheme_id, off.scheme_version, grading.scheme.id,
          c.internal, c.internal_max, it.final_rounded, JSON.stringify(breakdown), it.grade.letter, it.grade.grade_point,
          off.credits, cp, it.grade.is_pass, it.grade.is_pass ? 'pass' : 'fail']);
    }
    await client.query(`UPDATE subject_offerings SET status='approved', approved_at=now(), updated_at=now() WHERE id=$1`, [offeringId]);
    await log('approved');
    await audit(client, user, 'offering.approve', 'subject_offering', offeringId, { status: st }, { status: 'approved', students: res.items.length }, reason);
    return 'approved';
  }

  if (action === 'publish') {
    if (st !== 'approved') throw conflict(`Only approved results can be published (current status: ${st})`);
    await client.query(`UPDATE subject_offerings SET status='published', published_at=now(), published_version=result_version, updated_at=now() WHERE id=$1`, [offeringId]);
    await log('published');
    await audit(client, user, 'offering.publish', 'subject_offering', offeringId, { status: st }, { status: 'published', version: off.result_version }, reason);
    await regenerateSemesterResultsForOffering(client, offeringId);
    return 'published';
  }

  if (action === 'lock') {
    if (st !== 'published') throw conflict(`Only published results can be locked (current status: ${st})`);
    await client.query(`UPDATE subject_offerings SET status='locked', locked_at=now(), updated_at=now() WHERE id=$1`, [offeringId]);
    await log('locked');
    await audit(client, user, 'offering.lock', 'subject_offering', offeringId, { status: st }, { status: 'locked' }, reason);
    return 'locked';
  }

  if (action === 'reopen') {
    if (!reason || reason.trim().length < 5) throw bad('A reason of at least 5 characters is required');
    if (st === 'draft') throw conflict('Already a draft');
    if (st === 'submitted' || st === 'approved') {
      // Not yet published: safe to return to draft and recalculate later.
      await client.query('DELETE FROM subject_results WHERE offering_id=$1 AND result_version=$2', [offeringId, off.result_version]);
      await client.query(`UPDATE subject_offerings SET status='draft', updated_at=now() WHERE id=$1`, [offeringId]);
      await log('reopen');
      await audit(client, user, 'offering.reopen', 'subject_offering', offeringId, { status: st }, { status: 'draft' }, reason);
      return 'draft';
    }
    // Published or locked: open a new result version. The published version stays visible to students until republished.
    const nv = off.result_version + 1;
    await client.query(`UPDATE subject_offerings SET status='draft', result_version=$2, updated_at=now() WHERE id=$1`, [offeringId, nv]);
    await client.query(`INSERT INTO result_publications (offering_id, action, result_version, acted_by, reason) VALUES ($1,'correction',$2,$3,$4)`, [offeringId, nv, user.id, reason]);
    await audit(client, user, 'offering.correction_opened', 'subject_offering', offeringId, { status: st, version: off.result_version }, { status: 'draft', version: nv }, reason);
    return 'draft';
  }
  throw bad('Unknown action');
}

// SGPA/CGPA generation. Uses only published versions of subject results.
async function regenerateSemesterResultsForOffering(client, offeringId) {
  const students = (await client.query('SELECT student_id FROM student_enrollments WHERE offering_id=$1', [offeringId])).rows;
  for (const s of students) await regenerateStudentSemesterResults(client, s.student_id);
}

async function studentSubjectRows(client, studentId) {
  const { rows } = await client.query(
    `SELECT o.id AS offering_id, o.academic_year_id, ay.label AS academic_year, o.semester_no, o.credits AS offering_credits,
            s.code, s.name, e.attempt_no,
            sr.letter_grade, sr.grade_point, sr.credits, sr.credit_points, sr.result_status, sr.final_marks, sr.result_version
       FROM student_enrollments e
       JOIN subject_offerings o ON o.id=e.offering_id
       JOIN subjects s ON s.id=o.subject_id
       JOIN academic_years ay ON ay.id=o.academic_year_id
       LEFT JOIN subject_results sr ON sr.offering_id=o.id AND sr.student_id=e.student_id AND sr.result_version=o.published_version
      WHERE e.student_id=$1
      ORDER BY ay.label, o.semester_no, s.code`, [studentId]);
  return rows.map((r) => ({
    ...r,
    result_status: r.letter_grade ? r.result_status : 'incomplete',
    grade_point: r.letter_grade ? Number(r.grade_point) : null,
    credits: r.letter_grade ? (r.credits === null ? null : Number(r.credits)) : (r.offering_credits === null ? null : Number(r.offering_credits)),
  }));
}

async function regenerateStudentSemesterResults(client, studentId) {
  const settings = await getSettings(client);
  const opts = { includeFailed: settings.include_failed_in_sgpa !== false, decimals: settings.rounding_decimals ?? 2 };
  const rows = await studentSubjectRows(client, studentId);
  // Group by academic year and semester
  const groups = new Map();
  rows.forEach((r, idx) => {
    const k = `${r.academic_year_id}:${r.semester_no}`;
    if (!groups.has(k)) groups.set(k, { academic_year_id: r.academic_year_id, label: r.academic_year, semester_no: r.semester_no, subjects: [] });
    groups.get(k).subjects.push({ ...r, order: idx });
  });
  const ordered = [...groups.values()];
  const soFar = [];
  for (const g of ordered) {
    soFar.push(g);
    const sg = calc.computeSgpa(g.subjects, opts);
    const incomplete = sg.status === 'incomplete';
    const cg = calc.computeCgpa(soFar, opts);
    await client.query(
      `INSERT INTO semester_results (student_id, academic_year_id, semester_no, total_credits, total_credit_points, sgpa, cgpa, result_status, subjects_counted, generated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,now())
       ON CONFLICT (student_id, academic_year_id, semester_no) DO UPDATE SET
         total_credits=EXCLUDED.total_credits, total_credit_points=EXCLUDED.total_credit_points, sgpa=EXCLUDED.sgpa, cgpa=EXCLUDED.cgpa,
         result_status=EXCLUDED.result_status, subjects_counted=EXCLUDED.subjects_counted, generated_at=now()`,
      [studentId, g.academic_year_id, g.semester_no, incomplete ? null : sg.total_credits, incomplete ? null : sg.total_credit_points,
        incomplete ? null : sg.sgpa, incomplete ? null : cg.cgpa, sg.status, sg.subjects_counted]);
  }
}

module.exports = {
  STATUS_ORDER, loadOffering, loadComponents, standardComponents, computeOffering, transition,
  assertEligibleForApproval, regenerateStudentSemesterResults, studentSubjectRows, loadMarkMap, calcStudent,
};
