// Read-only views for a single student. Every function takes the student id from the
// authenticated session on student routes, so one student cannot read another's data.
const { query } = require('../db/pool');
const { notFound } = require('../utils/http');
const { getSettings } = require('./settings');

async function profile(studentId) {
  const { rows } = await query(
    `SELECT u.id, u.login_id, u.full_name, u.email, sp.roll_no, sp.registration_no, sp.current_semester,
            d.name AS department, d.code AS department_code, c.name AS course, c.code AS course_code, b.label AS batch
       FROM users u JOIN student_profiles sp ON sp.user_id=u.id
       LEFT JOIN departments d ON d.id=sp.department_id LEFT JOIN courses c ON c.id=sp.course_id LEFT JOIN batches b ON b.id=sp.batch_id
      WHERE u.id=$1`, [studentId]);
  if (!rows[0]) throw notFound('Profile unavailable, please try again');
  const p = rows[0];
  p.missing_fields = ['email', 'department', 'course', 'batch'].filter((k) => !p[k]);
  return p;
}

async function semesters(studentId) {
  const { rows } = await query(
    `SELECT sr.academic_year_id, ay.label AS academic_year, sr.semester_no, sr.sgpa, sr.cgpa, sr.result_status,
            sr.total_credits, sr.total_credit_points, sr.subjects_counted
       FROM semester_results sr JOIN academic_years ay ON ay.id=sr.academic_year_id
      WHERE sr.student_id=$1 AND EXISTS (
        SELECT 1 FROM student_enrollments e JOIN subject_offerings o ON o.id=e.offering_id
         WHERE e.student_id=sr.student_id AND o.academic_year_id=sr.academic_year_id AND o.semester_no=sr.semester_no AND o.published_version IS NOT NULL)
      ORDER BY ay.label, sr.semester_no`, [studentId]);
  return rows.map((r) => ({
    ...r,
    sgpa: r.sgpa === null ? null : Number(r.sgpa), cgpa: r.cgpa === null ? null : Number(r.cgpa),
    total_credits: r.total_credits === null ? null : Number(r.total_credits),
    total_credit_points: r.total_credit_points === null ? null : Number(r.total_credit_points),
  }));
}

async function subjectRows(studentId, ayId, sem) {
  const { rows } = await query(
    `SELECT s.code, s.name, s.subject_type, o.id AS offering_id, o.status AS offering_status, o.published_at,
            sr.letter_grade, sr.grade_point, sr.credits, sr.credit_points, sr.final_marks, sr.internal_marks, sr.internal_max,
            sr.result_status, sr.breakdown, sr.scheme_version, sr.result_version
       FROM student_enrollments e
       JOIN subject_offerings o ON o.id=e.offering_id JOIN subjects s ON s.id=o.subject_id
       JOIN subject_results sr ON sr.offering_id=o.id AND sr.student_id=e.student_id AND sr.result_version=o.published_version
      WHERE e.student_id=$1 AND o.academic_year_id=$2 AND o.semester_no=$3
      ORDER BY s.subject_type, s.code`, [studentId, ayId, sem]);
  return rows.map((r) => ({
    ...r,
    grade_point: Number(r.grade_point),
    credits: r.credits === null ? null : Number(r.credits),
    credit_points: r.credit_points === null ? null : Number(r.credit_points),
    final_marks: Number(r.final_marks),
    internal_marks: r.internal_marks === null ? null : Number(r.internal_marks),
    internal_max: r.internal_max === null ? null : Number(r.internal_max),
  }));
}

async function semesterSummary(studentId, ayId, sem) {
  const r = (await query(
    `SELECT sr.*, ay.label AS academic_year FROM semester_results sr JOIN academic_years ay ON ay.id=sr.academic_year_id
      WHERE sr.student_id=$1 AND sr.academic_year_id=$2 AND sr.semester_no=$3`, [studentId, ayId, sem])).rows[0];
  if (!r) return null;
  return { ...r, sgpa: r.sgpa === null ? null : Number(r.sgpa), cgpa: r.cgpa === null ? null : Number(r.cgpa),
    total_credits: r.total_credits === null ? null : Number(r.total_credits), total_credit_points: r.total_credit_points === null ? null : Number(r.total_credit_points) };
}

async function pendingCount(studentId, ayId, sem) {
  const r = await query(
    `SELECT COUNT(*)::int AS n FROM student_enrollments e JOIN subject_offerings o ON o.id=e.offering_id
      WHERE e.student_id=$1 AND o.academic_year_id=$2 AND o.semester_no=$3 AND o.published_version IS NULL`, [studentId, ayId, sem]);
  return r.rows[0].n;
}

// Grade card: grades, points, credits and credit points only. No raw or component marks.
async function gradeCard(studentId, ayId, sem) {
  const subjects = await subjectRows(studentId, ayId, sem);
  if (!subjects.length) throw notFound('Result Not Available');
  const [p, settings, sum, pending] = await Promise.all([profile(studentId), getSettings(), semesterSummary(studentId, ayId, sem), pendingCount(studentId, ayId, sem)]);
  const label = sum ? sum.academic_year : (await query('SELECT label FROM academic_years WHERE id=$1', [ayId])).rows[0].label;
  const totalCredits = subjects.reduce((a, s) => a + (s.credits || 0), 0);
  const totalCp = subjects.reduce((a, s) => a + (s.credit_points || 0), 0);
  const status = pending > 0 ? 'incomplete' : (sum ? sum.result_status : 'incomplete');
  const publishedAt = subjects.map((s) => s.published_at).filter(Boolean).sort().pop() || null;
  return {
    institution: settings.institution_name, university: settings.university_name, university_former_name: settings.university_former_name,
    exam_name: settings.exam_name, exam_session: settings.exam_session,
    academic_year: label, semester_no: sem,
    student: { name: p.full_name, roll_no: p.roll_no, registration_no: p.registration_no, course: p.course, department: p.department },
    subjects: subjects.map((s) => ({ code: s.code, name: s.name, letter_grade: s.letter_grade, grade_point: s.grade_point, credits: s.credits, credit_points: s.credit_points })),
    total_credits: totalCredits, total_credit_points: totalCp,
    sgpa: pending > 0 ? null : (sum ? sum.sgpa : null), cgpa: pending > 0 ? null : (sum ? sum.cgpa : null),
    result_status: status, pending_subjects: pending,
    show_ygpa: settings.show_ygpa === true, mar_enabled: settings.mar_enabled === true,
    percentage: settings.cgpa_to_percentage_factor && sum && sum.cgpa !== null ? Math.round(sum.cgpa * Number(settings.cgpa_to_percentage_factor) * 100) / 100 : null,
    published_on: publishedAt,
    reference: `SRMS-${p.roll_no}-${label}-S${sem}`,
  };
}

// Detailed marks report: raw marks, maxima, converted contributions. Separate from the grade card.
async function detailedMarks(studentId, ayId, sem) {
  const subjects = await subjectRows(studentId, ayId, sem);
  if (!subjects.length) throw notFound('Result Not Available');
  const p = await profile(studentId);
  return {
    student: { name: p.full_name, roll_no: p.roll_no, registration_no: p.registration_no, course: p.course, department: p.department },
    academic_year: (await query('SELECT label FROM academic_years WHERE id=$1', [ayId])).rows[0].label, semester_no: sem,
    subjects: subjects.map((s) => ({
      code: s.code, name: s.name, type: s.subject_type, rows: s.breakdown.rows, internal_marks: s.internal_marks, internal_max: s.internal_max,
      final_marks: s.final_marks, final_max: s.breakdown.final_max, letter_grade: s.letter_grade, grade_point: s.grade_point, credits: s.credits,
      scheme_version: s.scheme_version, rounding_decimals: s.breakdown.rounding_decimals,
      calculation: s.breakdown.contributions, final_unrounded: s.breakdown.final_unrounded,
    })),
  };
}

// Internal assessment marksheet: only internal components and their converted contributions.
async function internalMarksheet(studentId, ayId, sem) {
  const d = await detailedMarks(studentId, ayId, sem);
  const settings = await getSettings();
  return {
    institution: settings.institution_name, university: settings.university_name,
    student: d.student, academic_year: d.academic_year, semester_no: d.semester_no,
    subjects: d.subjects.map((s) => ({
      code: s.code, name: s.name, type: s.type,
      rows: s.rows.filter((r) => r.kind === 'internal'),
      internal_marks: s.internal_marks, internal_max: s.internal_max,
    })),
    reference: `SRMS-IA-${d.student.roll_no}-${d.academic_year}-S${sem}`,
  };
}

async function dashboard(studentId) {
  const [p, sems] = await Promise.all([profile(studentId), semesters(studentId)]);
  const last = sems[sems.length - 1] || null;
  const latestCgpa = [...sems].reverse().find((s) => s.cgpa !== null);
  return { profile: p, semesters: sems, latest: last, cgpa: latestCgpa ? latestCgpa.cgpa : null };
}

module.exports = { profile, semesters, gradeCard, detailedMarks, internalMarksheet, dashboard };
