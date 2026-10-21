const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const { query, tx } = require('../db/pool');
const { bad, conflict, notFound } = require('../utils/http');
const { str, num, oneOf, password } = require('../utils/validate');
const { audit } = require('../utils/audit');
const results = require('./results');

const BCRYPT_ROUNDS = 10;

function tempPassword() {
  return crypto.randomBytes(9).toString('base64').replace(/[^a-zA-Z0-9]/g, 'x').slice(0, 12) + '#7';
}

async function createUser(client, actor, { login_id, full_name, email, role, pw }) {
  const plain = pw ? password(pw) : tempPassword();
  const hash = await bcrypt.hash(plain, BCRYPT_ROUNDS);
  const { rows } = await client.query(
    `INSERT INTO users (login_id, password_hash, role, full_name, email, must_change_pw) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`,
    [login_id, hash, role, full_name, email, !pw]);
  await audit(client, actor, 'user.create', 'user', rows[0].id, null, { login_id, role, full_name });
  return { id: rows[0].id, temp_password: pw ? undefined : plain };
}

/* ---------- Students ---------- */
async function listStudents(q, { limit, offset }) {
  const params = [];
  const where = [];
  if (q.search) { params.push(`%${q.search}%`); where.push(`(u.full_name ILIKE $${params.length} OR sp.roll_no ILIKE $${params.length} OR u.login_id ILIKE $${params.length})`); }
  if (q.department_id) { params.push(Number(q.department_id)); where.push(`sp.department_id=$${params.length}`); }
  if (q.batch_id) { params.push(Number(q.batch_id)); where.push(`sp.batch_id=$${params.length}`); }
  if (q.semester) { params.push(Number(q.semester)); where.push(`sp.current_semester=$${params.length}`); }
  const w = where.length ? 'WHERE ' + where.join(' AND ') : '';
  const total = (await query(`SELECT COUNT(*)::int AS n FROM users u JOIN student_profiles sp ON sp.user_id=u.id ${w}`, params)).rows[0].n;
  params.push(limit, offset);
  const { rows } = await query(
    `SELECT u.id, u.login_id, u.full_name, u.email, u.is_active, sp.roll_no, sp.registration_no, sp.current_semester,
            sp.department_id, d.name AS department, sp.course_id, c.name AS course, sp.batch_id, b.label AS batch
       FROM users u JOIN student_profiles sp ON sp.user_id=u.id
       LEFT JOIN departments d ON d.id=sp.department_id LEFT JOIN courses c ON c.id=sp.course_id LEFT JOIN batches b ON b.id=sp.batch_id
       ${w} ORDER BY sp.roll_no LIMIT $${params.length - 1} OFFSET $${params.length}`, params);
  return { total, rows };
}

async function createStudent(actor, b) {
  const login_id = str(b.login_id, 'Login ID', { max: 40 });
  const full_name = str(b.full_name, 'Name');
  const roll_no = str(b.roll_no, 'Roll number', { max: 30 });
  const registration_no = str(b.registration_no, 'Registration number', { max: 40 });
  return tx(async (client) => {
    const u = await createUser(client, actor, { login_id, full_name, email: str(b.email, 'Email', { optional: true }), role: 'student', pw: b.password });
    await client.query(
      `INSERT INTO student_profiles (user_id, roll_no, registration_no, department_id, course_id, batch_id, current_semester) VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [u.id, roll_no, registration_no, b.department_id || null, b.course_id || null, b.batch_id || null, b.current_semester || 1]);
    return u;
  });
}

async function updateStudent(actor, id, b) {
  return tx(async (client) => {
    const old = (await client.query('SELECT u.full_name,u.email,u.is_active,sp.* FROM users u JOIN student_profiles sp ON sp.user_id=u.id WHERE u.id=$1', [id])).rows[0];
    if (!old) throw notFound('Student not found');
    await client.query('UPDATE users SET full_name=$2, email=$3, is_active=$4, updated_at=now() WHERE id=$1',
      [id, b.full_name ? str(b.full_name, 'Name') : old.full_name, b.email !== undefined ? b.email || null : old.email, b.is_active !== undefined ? !!b.is_active : old.is_active]);
    await client.query(
      `UPDATE student_profiles SET roll_no=$2, registration_no=$3, department_id=$4, course_id=$5, batch_id=$6, current_semester=$7, updated_at=now() WHERE user_id=$1`,
      [id, b.roll_no ?? old.roll_no, b.registration_no ?? old.registration_no, b.department_id !== undefined ? b.department_id || null : old.department_id,
        b.course_id !== undefined ? b.course_id || null : old.course_id, b.batch_id !== undefined ? b.batch_id || null : old.batch_id, b.current_semester ?? old.current_semester]);
    await audit(client, actor, 'student.update', 'user', id, { full_name: old.full_name, roll_no: old.roll_no, is_active: old.is_active }, b);
    return { updated: true };
  });
}

// Students with any enrollment history are deactivated instead of deleted, so published results survive.
async function deleteStudent(actor, id) {
  return tx(async (client) => {
    const has = (await client.query('SELECT 1 FROM student_enrollments WHERE student_id=$1 LIMIT 1', [id])).rows[0];
    if (has) {
      await client.query('UPDATE users SET is_active=FALSE, updated_at=now() WHERE id=$1', [id]);
      await audit(client, actor, 'student.deactivate', 'user', id, { is_active: true }, { is_active: false }, 'Has academic records');
      return { deactivated: true };
    }
    const r = await client.query(`DELETE FROM users WHERE id=$1 AND role='student' RETURNING login_id`, [id]);
    if (!r.rows[0]) throw notFound('Student not found');
    await audit(client, actor, 'student.delete', 'user', id, r.rows[0], null);
    return { deleted: true };
  });
}

async function resetPassword(actor, id) {
  const plain = tempPassword();
  const hash = await bcrypt.hash(plain, BCRYPT_ROUNDS);
  const r = await query('UPDATE users SET password_hash=$2, must_change_pw=TRUE, updated_at=now() WHERE id=$1 RETURNING login_id', [id, hash]);
  if (!r.rows[0]) throw notFound('User not found');
  await tx((c) => audit(c, actor, 'user.reset_password', 'user', id, null, null));
  return { temp_password: plain };
}

/* ---------- Faculty ---------- */
async function listFaculty() {
  const { rows } = await query(
    `SELECT u.id, u.login_id, u.full_name, u.email, u.is_active, fp.employee_id, fp.designation, fp.department_id, d.name AS department
       FROM users u JOIN faculty_profiles fp ON fp.user_id=u.id LEFT JOIN departments d ON d.id=fp.department_id ORDER BY u.full_name`);
  return rows;
}
async function createFaculty(actor, b) {
  const login_id = str(b.login_id, 'Login ID', { max: 40 });
  const full_name = str(b.full_name, 'Name');
  const employee_id = str(b.employee_id, 'Employee ID', { max: 30 });
  return tx(async (client) => {
    const u = await createUser(client, actor, { login_id, full_name, email: str(b.email, 'Email', { optional: true }), role: 'faculty', pw: b.password });
    await client.query('INSERT INTO faculty_profiles (user_id, employee_id, department_id, designation) VALUES ($1,$2,$3,$4)', [u.id, employee_id, b.department_id || null, b.designation || null]);
    return u;
  });
}
async function updateFaculty(actor, id, b) {
  return tx(async (client) => {
    const old = (await client.query('SELECT u.full_name,u.email,u.is_active,fp.* FROM users u JOIN faculty_profiles fp ON fp.user_id=u.id WHERE u.id=$1', [id])).rows[0];
    if (!old) throw notFound('Faculty not found');
    await client.query('UPDATE users SET full_name=$2,email=$3,is_active=$4,updated_at=now() WHERE id=$1',
      [id, b.full_name ? str(b.full_name, 'Name') : old.full_name, b.email !== undefined ? b.email || null : old.email, b.is_active !== undefined ? !!b.is_active : old.is_active]);
    await client.query('UPDATE faculty_profiles SET employee_id=$2, department_id=$3, designation=$4 WHERE user_id=$1',
      [id, b.employee_id ?? old.employee_id, b.department_id !== undefined ? b.department_id || null : old.department_id, b.designation ?? old.designation]);
    await audit(client, actor, 'faculty.update', 'user', id, { full_name: old.full_name, is_active: old.is_active }, b);
    return { updated: true };
  });
}

/* ---------- Simple reference tables ---------- */
const REF = {
  departments: { table: 'departments', fields: ['code', 'name'], order: 'code' },
  courses: { table: 'courses', fields: ['code', 'name', 'department_id', 'total_semesters'], order: 'code' },
  batches: { table: 'batches', fields: ['label', 'course_id'], order: 'label DESC' },
  'academic-years': { table: 'academic_years', fields: ['label'], order: 'label DESC' },
  subjects: { table: 'subjects', fields: ['code', 'name', 'subject_type', 'department_id'], order: 'code' },
};
async function refList(name) {
  const r = REF[name];
  if (name === 'subjects') return (await query('SELECT s.*, d.name AS department FROM subjects s LEFT JOIN departments d ON d.id=s.department_id ORDER BY s.code')).rows;
  if (name === 'courses') return (await query('SELECT c.*, d.name AS department FROM courses c LEFT JOIN departments d ON d.id=c.department_id ORDER BY c.code')).rows;
  return (await query(`SELECT * FROM ${r.table} ORDER BY ${r.order}`)).rows;
}
async function refCreate(actor, name, b) {
  const r = REF[name];
  const vals = r.fields.map((f) => {
    if (f === 'subject_type') return oneOf(b[f], 'Subject type', ['theory', 'practical', 'sessional']);
    if (f === 'code' || f === 'name' || f === 'label') return str(b[f], f);
    if (f === 'total_semesters') return b[f] ? num(b[f], f, { min: 1, max: 12 }) : 8;
    return b[f] || null;
  });
  const ph = vals.map((_, i) => `$${i + 1}`).join(',');
  return tx(async (client) => {
    const row = (await client.query(`INSERT INTO ${r.table} (${r.fields.join(',')}) VALUES (${ph}) RETURNING *`, vals)).rows[0];
    await audit(client, actor, `${r.table}.create`, r.table, row.id, null, row);
    return row;
  });
}
async function refUpdate(actor, name, id, b) {
  const r = REF[name];
  return tx(async (client) => {
    const old = (await client.query(`SELECT * FROM ${r.table} WHERE id=$1`, [id])).rows[0];
    if (!old) throw notFound('Not found');
    const sets = [];
    const vals = [id];
    for (const f of r.fields) {
      if (b[f] === undefined) continue;
      if (f === 'subject_type' && old.subject_type !== b[f]) {
        const used = (await client.query('SELECT 1 FROM subject_offerings WHERE subject_id=$1 LIMIT 1', [id])).rows[0];
        if (used) throw conflict('The subject type cannot change after it has been offered');
      }
      vals.push(b[f] === '' ? null : b[f]);
      sets.push(`${f}=$${vals.length}`);
    }
    if (!sets.length) throw bad('Nothing to update');
    const row = (await client.query(`UPDATE ${r.table} SET ${sets.join(',')} WHERE id=$1 RETURNING *`, vals)).rows[0];
    await audit(client, actor, `${r.table}.update`, r.table, id, old, row);
    return row;
  });
}
async function refDelete(actor, name, id) {
  const r = REF[name];
  return tx(async (client) => {
    const old = (await client.query(`DELETE FROM ${r.table} WHERE id=$1 RETURNING *`, [id])).rows[0];
    if (!old) throw notFound('Not found');
    await audit(client, actor, `${r.table}.delete`, r.table, id, old, null);
    return { deleted: true };
  });
}
async function activateYear(actor, id) {
  return tx(async (client) => {
    await client.query('UPDATE academic_years SET is_active=FALSE WHERE is_active');
    const r = await client.query('UPDATE academic_years SET is_active=TRUE WHERE id=$1 RETURNING *', [id]);
    if (!r.rows[0]) throw notFound('Academic year not found');
    await audit(client, actor, 'academic_year.activate', 'academic_years', id, null, r.rows[0]);
    return r.rows[0];
  });
}

/* ---------- Offerings ---------- */
async function listOfferings(q) {
  const params = [];
  const where = [];
  const add = (cond, v) => { params.push(v); where.push(cond.replace('?', `$${params.length}`)); };
  if (q.academic_year_id) add('o.academic_year_id=?', Number(q.academic_year_id));
  if (q.semester_no) add('o.semester_no=?', Number(q.semester_no));
  if (q.status) add('o.status=?', q.status);
  if (q.subject_type) add('s.subject_type=?', q.subject_type);
  if (q.batch_id) add('o.batch_id=?', Number(q.batch_id));
  if (q.faculty_id) add('o.id IN (SELECT offering_id FROM faculty_subject_assignments WHERE faculty_id=?)', Number(q.faculty_id));
  const w = where.length ? 'WHERE ' + where.join(' AND ') : '';
  const { rows } = await query(
    `SELECT o.id, o.semester_no, o.credits, o.status, o.wca_max, o.result_version, o.published_version, o.batch_id, b.label AS batch,
            s.code AS subject_code, s.name AS subject_name, s.subject_type, ay.label AS academic_year, o.academic_year_id,
            (SELECT COUNT(*)::int FROM student_enrollments e WHERE e.offering_id=o.id) AS students,
            (SELECT string_agg(u.full_name, ', ' ORDER BY u.full_name) FROM faculty_subject_assignments fa JOIN users u ON u.id=fa.faculty_id WHERE fa.offering_id=o.id) AS faculty,
            (SELECT COUNT(*)::int FROM assessment_components c WHERE c.offering_id=o.id) AS components,
            (SELECT COUNT(*)::int FROM student_assessment_marks m JOIN assessment_components c ON c.id=m.component_id WHERE c.offering_id=o.id AND m.raw_score IS NOT NULL) AS entries_filled
       FROM subject_offerings o JOIN subjects s ON s.id=o.subject_id JOIN academic_years ay ON ay.id=o.academic_year_id LEFT JOIN batches b ON b.id=o.batch_id
       ${w} ORDER BY ay.label DESC, o.semester_no, s.code`, params);
  return rows.map((r) => ({ ...r, credits: r.credits === null ? null : Number(r.credits), wca_max: r.wca_max === null ? null : Number(r.wca_max),
    entries_total: r.students * r.components, entries_missing: r.students * r.components - r.entries_filled }));
}

async function createOffering(actor, b) {
  const subject_id = Number(b.subject_id);
  const ay = Number(b.academic_year_id);
  const sem = num(b.semester_no, 'Semester', { min: 1, max: 12 });
  const credits = b.credits === '' || b.credits === undefined || b.credits === null ? null : num(b.credits, 'Credits', { min: 0, max: 20 });
  return tx(async (client) => {
    const subj = (await client.query('SELECT * FROM subjects WHERE id=$1', [subject_id])).rows[0];
    if (!subj) throw notFound('Subject not found');
    const scheme = (await client.query('SELECT * FROM assessment_schemes WHERE scheme_type=$1 AND is_current ORDER BY version DESC LIMIT 1', [subj.subject_type])).rows[0];
    const wca = subj.subject_type === 'theory' && b.wca_max ? num(b.wca_max, 'WCA maximum', { min: 1, max: 1000 }) : null;
    const o = (await client.query(
      `INSERT INTO subject_offerings (subject_id, academic_year_id, semester_no, batch_id, credits, scheme_id, wca_max) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [subject_id, ay, sem, b.batch_id || null, credits, scheme.id, wca])).rows[0];
    const comps = results.standardComponents(subj.subject_type, scheme.config, wca);
    let i = 0;
    for (const c of comps) {
      await client.query(
        `INSERT INTO assessment_components (offering_id, code, label, category, raw_max, contribution_max, sort_order, conducted_by) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
        [o.id, c.code, c.label, c.category, c.raw_max, c.contribution_max, ++i, c.conducted_by]);
    }
    await audit(client, actor, 'offering.create', 'subject_offering', o.id, null, { ...o, scheme_version: scheme.version });
    return o;
  });
}

async function updateOffering(actor, id, b) {
  return tx(async (client) => {
    const off = await results.loadOffering(client, id, true);
    if (off.status !== 'draft') throw conflict('Only draft offerings can be edited. Reopen the result first.');
    const credits = b.credits === '' || b.credits === null ? null : b.credits === undefined ? off.credits : num(b.credits, 'Credits', { min: 0, max: 20 });
    await client.query('UPDATE subject_offerings SET credits=$2, updated_at=now() WHERE id=$1', [id, credits]);
    await audit(client, actor, 'offering.update', 'subject_offering', id, { credits: off.credits }, { credits });
    return { updated: true };
  });
}

async function deleteOffering(actor, id) {
  return tx(async (client) => {
    const off = await results.loadOffering(client, id, true);
    if (off.status !== 'draft' || off.published_version) throw conflict('Only unpublished draft offerings can be deleted');
    const hasMarks = (await client.query('SELECT 1 FROM student_assessment_marks m JOIN assessment_components c ON c.id=m.component_id WHERE c.offering_id=$1 LIMIT 1', [id])).rows[0];
    if (hasMarks) throw conflict('This offering already has marks and cannot be deleted');
    await client.query('DELETE FROM result_publications WHERE offering_id=$1', [id]);
    await client.query('DELETE FROM subject_offerings WHERE id=$1', [id]);
    await audit(client, actor, 'offering.delete', 'subject_offering', id, off, null);
    return { deleted: true };
  });
}

async function assignFaculty(actor, offeringId, facultyId) {
  return tx(async (client) => {
    await results.loadOffering(client, offeringId);
    await client.query('INSERT INTO faculty_subject_assignments (faculty_id, offering_id) VALUES ($1,$2) ON CONFLICT DO NOTHING', [facultyId, offeringId]);
    await audit(client, actor, 'assignment.add', 'subject_offering', offeringId, null, { faculty_id: facultyId });
    return { assigned: true };
  });
}
async function unassignFaculty(actor, offeringId, facultyId) {
  return tx(async (client) => {
    await client.query('DELETE FROM faculty_subject_assignments WHERE faculty_id=$1 AND offering_id=$2', [facultyId, offeringId]);
    await audit(client, actor, 'assignment.remove', 'subject_offering', offeringId, { faculty_id: facultyId }, null);
    return { removed: true };
  });
}

async function enroll(actor, offeringId, b) {
  return tx(async (client) => {
    const off = await results.loadOffering(client, offeringId, true);
    if (off.status !== 'draft') throw conflict('Enrollment can change only while the offering is a draft');
    let ids = Array.isArray(b.student_ids) ? b.student_ids.map(Number) : [];
    if (b.batch_id) {
      const r = await client.query('SELECT user_id FROM student_profiles WHERE batch_id=$1', [Number(b.batch_id)]);
      ids = ids.concat(r.rows.map((x) => x.user_id));
    }
    if (!ids.length) throw bad('No students selected');
    let added = 0;
    for (const sid of ids) {
      const r = await client.query('INSERT INTO student_enrollments (student_id, offering_id, attempt_no) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING', [sid, offeringId, b.attempt_no || 1]);
      added += r.rowCount;
    }
    await audit(client, actor, 'enrollment.add', 'subject_offering', offeringId, null, { added });
    return { added };
  });
}
async function unenroll(actor, offeringId, studentId) {
  return tx(async (client) => {
    const off = await results.loadOffering(client, offeringId, true);
    if (off.status !== 'draft') throw conflict('Enrollment can change only while the offering is a draft');
    const m = (await client.query('SELECT 1 FROM student_assessment_marks m JOIN assessment_components c ON c.id=m.component_id WHERE c.offering_id=$1 AND m.student_id=$2 AND m.raw_score IS NOT NULL LIMIT 1', [offeringId, studentId])).rows[0];
    if (m) throw conflict('This student already has marks in this subject');
    await client.query('DELETE FROM student_enrollments WHERE offering_id=$1 AND student_id=$2', [offeringId, studentId]);
    await audit(client, actor, 'enrollment.remove', 'subject_offering', offeringId, { student_id: studentId }, null);
    return { removed: true };
  });
}

async function offeringDetail(id) {
  const off = (await listOfferings({})).find((o) => o.id === id);
  if (!off) throw notFound('Offering not found');
  const students = (await query(
    `SELECT e.student_id, u.full_name, sp.roll_no FROM student_enrollments e JOIN users u ON u.id=e.student_id JOIN student_profiles sp ON sp.user_id=e.student_id WHERE e.offering_id=$1 ORDER BY sp.roll_no`, [id])).rows;
  const faculty = (await query(`SELECT fa.faculty_id, u.full_name FROM faculty_subject_assignments fa JOIN users u ON u.id=fa.faculty_id WHERE fa.offering_id=$1`, [id])).rows;
  const history = (await query(`SELECT rp.action, rp.result_version, rp.reason, rp.acted_at, u.full_name AS acted_by FROM result_publications rp LEFT JOIN users u ON u.id=rp.acted_by WHERE rp.offering_id=$1 ORDER BY rp.acted_at DESC`, [id])).rows;
  return { ...off, enrolled: students, assigned_faculty: faculty, history };
}

async function validateOffering(id) {
  const res = await results.computeOffering({ query }, id);
  const problems = results.assertEligibleForApproval(res);
  return {
    ok: problems.length === 0, problems: problems.slice(0, 100),
    students: res.items.length, complete: res.items.filter((i) => i.calc.complete).length,
  };
}

/* ---------- Grading, schemes, settings ---------- */
async function getGradingConfig() {
  const s = (await query('SELECT * FROM grading_schemes WHERE is_active')).rows[0];
  if (!s) return null;
  const bands = (await query('SELECT letter, min_marks, grade_point, is_pass FROM grading_bands WHERE scheme_id=$1 ORDER BY min_marks DESC', [s.id])).rows;
  return { ...s, pass_marks_percent: Number(s.pass_marks_percent), bands: bands.map((b) => ({ ...b, min_marks: Number(b.min_marks), grade_point: Number(b.grade_point) })) };
}
async function saveGradingConfig(actor, b) {
  if (!Array.isArray(b.bands) || b.bands.length < 2) throw bad('At least two grading bands are required');
  const letters = new Set();
  const mins = new Set();
  const bands = b.bands.map((x) => {
    const letter = str(x.letter, 'Letter', { max: 4 });
    const min = num(x.min_marks, 'Minimum marks', { min: 0, max: 100 });
    const gp = num(x.grade_point, 'Grade point', { min: 0, max: 20 });
    if (letters.has(letter) || mins.has(min)) throw bad('Letters and minimum marks must be unique');
    letters.add(letter); mins.add(min);
    return { letter, min, gp, pass: !!x.is_pass };
  });
  if (!mins.has(0)) throw bad('One band must start at 0 marks so every score has a grade');
  const passPct = num(b.pass_marks_percent, 'Pass marks percent', { min: 0, max: 100 });
  return tx(async (client) => {
    const old = await getGradingConfig();
    await client.query('UPDATE grading_schemes SET is_active=FALSE WHERE is_active');
    const s = (await client.query('INSERT INTO grading_schemes (name, is_active, is_placeholder, pass_marks_percent) VALUES ($1,TRUE,$2,$3) RETURNING id',
      [str(b.name, 'Name'), b.is_placeholder === undefined ? false : !!b.is_placeholder, passPct])).rows[0];
    for (const x of bands) await client.query('INSERT INTO grading_bands (scheme_id, letter, min_marks, grade_point, is_pass) VALUES ($1,$2,$3,$4,$5)', [s.id, x.letter, x.min, x.gp, x.pass]);
    await audit(client, actor, 'grading.update', 'grading_scheme', s.id, old, b, b.reason);
    return { id: s.id };
  });
}

async function listSchemes() {
  return (await query('SELECT * FROM assessment_schemes ORDER BY scheme_type, version DESC')).rows;
}
async function createSchemeVersion(actor, b) {
  const type = oneOf(b.scheme_type, 'Scheme type', ['theory', 'practical', 'sessional']);
  const cfg = b.config || {};
  if (type === 'theory') for (const k of ['ca_max', 'ca_contribution', 'eca_max', 'eca_contribution', 'wca_contribution', 'ese_max', 'ese_contribution']) num(cfg[k], k, { min: 0.01 });
  if (type === 'practical') for (const k of ['pca_max', 'pca_contribution', 'pese_max', 'pese_contribution']) num(cfg[k], k, { min: 0.01 });
  return tx(async (client) => {
    const v = (await client.query('SELECT COALESCE(MAX(version),0)+1 AS v FROM assessment_schemes WHERE scheme_type=$1', [type])).rows[0].v;
    await client.query('UPDATE assessment_schemes SET is_current=FALSE WHERE scheme_type=$1', [type]);
    const row = (await client.query('INSERT INTO assessment_schemes (scheme_type, version, name, config, created_by) VALUES ($1,$2,$3,$4,$5) RETURNING *',
      [type, v, str(b.name || `${type} v${v}`, 'Name'), JSON.stringify(cfg), actor.id])).rows[0];
    await audit(client, actor, 'scheme.create_version', 'assessment_scheme', row.id, null, row, b.reason);
    return row;
  });
}

async function getSettingsAll() {
  return (await query('SELECT key, value, note FROM system_settings ORDER BY key')).rows;
}
async function saveSettings(actor, b) {
  const allowed = new Set(['institution_name', 'university_name', 'university_former_name', 'exam_name', 'exam_session', 'rounding_decimals', 'include_failed_in_sgpa', 'cgpa_to_percentage_factor', 'show_ygpa', 'mar_enabled']);
  return tx(async (client) => {
    for (const [k, v] of Object.entries(b)) {
      if (!allowed.has(k)) throw bad(`Unknown setting ${k}`);
      if (k === 'rounding_decimals' && !(Number.isInteger(v) && v >= 0 && v <= 4)) throw bad('Rounding decimals must be a whole number from 0 to 4');
      const old = (await client.query('SELECT value FROM system_settings WHERE key=$1', [k])).rows[0];
      await client.query('INSERT INTO system_settings (key, value) VALUES ($1,$2) ON CONFLICT (key) DO UPDATE SET value=$2, updated_at=now()', [k, JSON.stringify(v)]);
      await audit(client, actor, 'settings.update', 'system_settings', k, old ? old.value : null, v);
    }
    return { saved: true };
  });
}

/* ---------- Stats, audit ---------- */
async function stats() {
  const one = async (sql, p) => (await query(sql, p)).rows[0];
  const [c, ay, status, pending, recent, byOff] = await Promise.all([
    one(`SELECT (SELECT COUNT(*) FROM student_profiles sp JOIN users u ON u.id=sp.user_id WHERE u.is_active)::int AS students,
                (SELECT COUNT(*) FROM faculty_profiles fp JOIN users u ON u.id=fp.user_id WHERE u.is_active)::int AS faculty,
                (SELECT COUNT(*) FROM subjects)::int AS subjects`),
    one('SELECT label FROM academic_years WHERE is_active'),
    query(`SELECT status, COUNT(*)::int AS n FROM subject_offerings GROUP BY status`),
    one(`SELECT COUNT(*) FILTER (WHERE m.raw_score IS NULL OR m.id IS NULL)::int AS missing
           FROM student_enrollments e JOIN subject_offerings o ON o.id=e.offering_id AND o.status='draft'
           JOIN assessment_components c ON c.offering_id=o.id LEFT JOIN student_assessment_marks m ON m.component_id=c.id AND m.student_id=e.student_id`),
    query(`SELECT created_at, actor_name, action, entity_type, entity_id FROM audit_logs ORDER BY created_at DESC LIMIT 8`),
    query(`SELECT o.id, s.code, s.name, o.status, o.semester_no,
                  (SELECT COUNT(*) FROM student_enrollments e WHERE e.offering_id=o.id)::int * (SELECT COUNT(*) FROM assessment_components c WHERE c.offering_id=o.id)::int AS total,
                  (SELECT COUNT(*) FROM student_assessment_marks m JOIN assessment_components c ON c.id=m.component_id WHERE c.offering_id=o.id AND m.raw_score IS NOT NULL)::int AS filled
             FROM subject_offerings o JOIN subjects s ON s.id=o.subject_id JOIN academic_years ay ON ay.id=o.academic_year_id
            WHERE ay.is_active ORDER BY o.semester_no, s.code`),
  ]);
  const sm = {};
  status.rows.forEach((r) => { sm[r.status] = r.n; });
  const sem = (await query(`SELECT semester_no, ROUND(AVG(sgpa),2) AS avg_sgpa, COUNT(*)::int AS students,
                  ROUND(100.0*COUNT(*) FILTER (WHERE result_status='pass')/NULLIF(COUNT(*),0),1) AS pass_pct
                  FROM semester_results WHERE sgpa IS NOT NULL GROUP BY semester_no ORDER BY semester_no`)).rows;
  return {
    ...c, active_academic_year: ay ? ay.label : null, offerings_by_status: sm,
    pending_assessments: (sm.draft || 0), awaiting_approval: (sm.submitted || 0), published: (sm.published || 0) + (sm.locked || 0),
    missing_marks: pending.missing, recent_activity: recent.rows, completion: byOff.rows,
    performance: sem.map((s) => ({ ...s, avg_sgpa: Number(s.avg_sgpa), pass_pct: Number(s.pass_pct) })),
  };
}

async function auditLog(q, { limit, offset }) {
  const params = [];
  const where = [];
  if (q.entity_type) { params.push(q.entity_type); where.push(`entity_type=$${params.length}`); }
  if (q.action) { params.push(`${q.action}%`); where.push(`action ILIKE $${params.length}`); }
  if (q.actor) { params.push(`%${q.actor}%`); where.push(`actor_name ILIKE $${params.length}`); }
  const w = where.length ? 'WHERE ' + where.join(' AND ') : '';
  const total = (await query(`SELECT COUNT(*)::int AS n FROM audit_logs ${w}`, params)).rows[0].n;
  params.push(limit, offset);
  const { rows } = await query(`SELECT * FROM audit_logs ${w} ORDER BY id DESC LIMIT $${params.length - 1} OFFSET $${params.length}`, params);
  return { total, rows };
}

module.exports = {
  listStudents, createStudent, updateStudent, deleteStudent, resetPassword, listFaculty, createFaculty, updateFaculty,
  REF, refList, refCreate, refUpdate, refDelete, activateYear, listOfferings, createOffering, updateOffering, deleteOffering,
  assignFaculty, unassignFaculty, enroll, unenroll, offeringDetail, validateOffering, getGradingConfig, saveGradingConfig,
  listSchemes, createSchemeVersion, getSettingsAll, saveSettings, stats, auditLog,
};
