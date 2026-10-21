const ExcelJS = require('exceljs');
const { query } = require('../db/pool');
const { bad, forbidden } = require('../utils/http');
const { toCsv } = require('../utils/csv');
const pdf = require('./pdf');
const { getSettings } = require('./settings');

const FACULTY_TYPES = new Set(['subject-marks', 'practical-sessional', 'internal-assessment', 'missing-marks', 'assessment-completion', 'pass-fail']);

class Filter {
  constructor(user) { this.p = []; this.w = []; this.user = user; }
  add(cond, v) { this.p.push(v); this.w.push(cond.replace('?', `$${this.p.length}`)); }
  get where() { return this.w.length ? 'WHERE ' + this.w.join(' AND ') : ''; }
}

function offeringFilters(f, q, user) {
  if (q.academic_year_id) f.add('o.academic_year_id=?', Number(q.academic_year_id));
  if (q.semester_no) f.add('o.semester_no=?', Number(q.semester_no));
  if (q.subject_id) f.add('o.subject_id=?', Number(q.subject_id));
  if (q.batch_id) f.add('o.batch_id=?', Number(q.batch_id));
  if (q.status) f.add('o.status=?', q.status);
  if (q.subject_type) f.add('s.subject_type=?', q.subject_type);
  if (user.role === 'faculty') f.add('o.id IN (SELECT offering_id FROM faculty_subject_assignments WHERE faculty_id=?)', user.id);
}
function studentFilters(f, q, alias = 'sp') {
  if (q.department_id) f.add(`${alias}.department_id=?`, Number(q.department_id));
  if (q.course_id) f.add(`${alias}.course_id=?`, Number(q.course_id));
  if (q.student_id) f.add(`${alias}.user_id=?`, Number(q.student_id));
}

const DEFS = {
  'semester-results': {
    title: 'Semester Result Report',
    columns: [['roll_no', 'Roll No', 12], ['full_name', 'Student', 22], ['department', 'Department', 14], ['academic_year', 'Year', 10], ['semester_no', 'Sem', 6], ['total_credits', 'Credits', 8], ['sgpa', 'SGPA', 8], ['cgpa', 'CGPA', 8], ['result_status', 'Result', 10]],
    async run(q, user, lim) {
      const f = new Filter(user);
      studentFilters(f, q);
      if (q.academic_year_id) f.add('sr.academic_year_id=?', Number(q.academic_year_id));
      if (q.semester_no) f.add('sr.semester_no=?', Number(q.semester_no));
      if (q.batch_id) f.add('sp.batch_id=?', Number(q.batch_id));
      if (q.result_status) f.add('sr.result_status=?', q.result_status);
      return query(
        `SELECT sp.roll_no, u.full_name, d.code AS department, ay.label AS academic_year, sr.semester_no, sr.total_credits, sr.sgpa, sr.cgpa, sr.result_status
           FROM semester_results sr JOIN student_profiles sp ON sp.user_id=sr.student_id JOIN users u ON u.id=sr.student_id
           JOIN academic_years ay ON ay.id=sr.academic_year_id LEFT JOIN departments d ON d.id=sp.department_id
           ${f.where} ORDER BY ay.label, sr.semester_no, sp.roll_no LIMIT ${lim}`, f.p);
    },
  },
  'sgpa-cgpa': null,
  'subject-marks': {
    title: 'Subject-wise Marks Report',
    columns: [['subject_code', 'Subject', 10], ['subject_name', 'Subject Name', 22], ['roll_no', 'Roll No', 12], ['full_name', 'Student', 20], ['internal_marks', 'Internal', 9], ['final_marks', 'Final', 9], ['letter_grade', 'Grade', 7], ['grade_point', 'Points', 7], ['result_status', 'Result', 9], ['offering_status', 'Status', 10]],
    async run(q, user, lim) {
      const f = new Filter(user);
      offeringFilters(f, q, user);
      studentFilters(f, q);
      if (q.result_status) f.add('sr.result_status=?', q.result_status);
      if (q._practical_sessional) f.w.push(`s.subject_type IN ('practical','sessional')`);
      return query(
        `SELECT s.code AS subject_code, s.name AS subject_name, sp.roll_no, u.full_name, ROUND(sr.internal_marks,2) AS internal_marks, sr.final_marks,
                sr.letter_grade, sr.grade_point, sr.result_status, o.status AS offering_status
           FROM subject_results sr JOIN subject_offerings o ON o.id=sr.offering_id AND sr.result_version=COALESCE(o.published_version, o.result_version)
           JOIN subjects s ON s.id=o.subject_id JOIN student_profiles sp ON sp.user_id=sr.student_id JOIN users u ON u.id=sr.student_id
           ${f.where} ORDER BY s.code, sp.roll_no LIMIT ${lim}`, f.p);
    },
  },
  'internal-assessment': {
    title: 'Internal Assessment Report',
    columns: [['subject_code', 'Subject', 10], ['roll_no', 'Roll No', 12], ['full_name', 'Student', 22], ['component', 'Component', 10], ['raw_score', 'Marks', 8], ['raw_max', 'Max', 8], ['offering_status', 'Status', 10]],
    async run(q, user, lim) {
      const f = new Filter(user);
      offeringFilters(f, q, user);
      studentFilters(f, q);
      f.w.push(`c.category='internal'`);
      if (q.component) f.add('c.code=?', q.component);
      return query(
        `SELECT s.code AS subject_code, sp.roll_no, u.full_name, c.code AS component, m.raw_score, c.raw_max, o.status AS offering_status
           FROM student_enrollments e JOIN subject_offerings o ON o.id=e.offering_id JOIN subjects s ON s.id=o.subject_id
           JOIN assessment_components c ON c.offering_id=o.id JOIN student_profiles sp ON sp.user_id=e.student_id JOIN users u ON u.id=e.student_id
           LEFT JOIN student_assessment_marks m ON m.component_id=c.id AND m.student_id=e.student_id
           ${f.where} ORDER BY s.code, sp.roll_no, c.sort_order LIMIT ${lim}`, f.p);
    },
  },
  'missing-marks': {
    title: 'Missing Marks Report',
    columns: [['subject_code', 'Subject', 12], ['semester_no', 'Sem', 6], ['roll_no', 'Roll No', 12], ['full_name', 'Student', 24], ['component', 'Component', 12], ['offering_status', 'Status', 10]],
    async run(q, user, lim) {
      const f = new Filter(user);
      offeringFilters(f, q, user);
      studentFilters(f, q);
      if (q.component) f.add('c.code=?', q.component);
      f.w.push('m.raw_score IS NULL');
      return query(
        `SELECT s.code AS subject_code, o.semester_no, sp.roll_no, u.full_name, c.code AS component, o.status AS offering_status
           FROM student_enrollments e JOIN subject_offerings o ON o.id=e.offering_id JOIN subjects s ON s.id=o.subject_id
           JOIN assessment_components c ON c.offering_id=o.id JOIN student_profiles sp ON sp.user_id=e.student_id JOIN users u ON u.id=e.student_id
           LEFT JOIN student_assessment_marks m ON m.component_id=c.id AND m.student_id=e.student_id
           ${f.where} ORDER BY s.code, sp.roll_no, c.sort_order LIMIT ${lim}`, f.p);
    },
  },
  'pass-fail': {
    title: 'Pass and Fail Summary',
    columns: [['subject_code', 'Subject', 10], ['subject_name', 'Subject Name', 28], ['semester_no', 'Sem', 6], ['students', 'Students', 9], ['passed', 'Pass', 8], ['failed', 'Fail', 8], ['pass_percent', 'Pass %', 9]],
    async run(q, user, lim) {
      const f = new Filter(user);
      offeringFilters(f, q, user);
      return query(
        `SELECT s.code AS subject_code, s.name AS subject_name, o.semester_no, COUNT(sr.id)::int AS students,
                COUNT(*) FILTER (WHERE sr.result_status='pass')::int AS passed, COUNT(*) FILTER (WHERE sr.result_status='fail')::int AS failed,
                ROUND(100.0*COUNT(*) FILTER (WHERE sr.result_status='pass')/NULLIF(COUNT(sr.id),0),1) AS pass_percent
           FROM subject_offerings o JOIN subjects s ON s.id=o.subject_id
           JOIN subject_results sr ON sr.offering_id=o.id AND sr.result_version=COALESCE(o.published_version, o.result_version)
           ${f.where} GROUP BY s.code, s.name, o.semester_no ORDER BY o.semester_no, s.code LIMIT ${lim}`, f.p);
    },
  },
  'department-performance': {
    title: 'Department Performance Report',
    columns: [['department', 'Department', 24], ['academic_year', 'Year', 10], ['semester_no', 'Sem', 6], ['students', 'Students', 9], ['avg_sgpa', 'Average SGPA', 12], ['pass_percent', 'Pass %', 9]],
    async run(q, user, lim) {
      const f = new Filter(user);
      if (q.academic_year_id) f.add('sr.academic_year_id=?', Number(q.academic_year_id));
      if (q.semester_no) f.add('sr.semester_no=?', Number(q.semester_no));
      if (q.department_id) f.add('sp.department_id=?', Number(q.department_id));
      f.w.push('sr.sgpa IS NOT NULL');
      return query(
        `SELECT COALESCE(d.name,'Unassigned') AS department, ay.label AS academic_year, sr.semester_no, COUNT(*)::int AS students,
                ROUND(AVG(sr.sgpa),2) AS avg_sgpa, ROUND(100.0*COUNT(*) FILTER (WHERE sr.result_status='pass')/COUNT(*),1) AS pass_percent
           FROM semester_results sr JOIN student_profiles sp ON sp.user_id=sr.student_id LEFT JOIN departments d ON d.id=sp.department_id
           JOIN academic_years ay ON ay.id=sr.academic_year_id ${f.where}
          GROUP BY d.name, ay.label, sr.semester_no ORDER BY ay.label, sr.semester_no, d.name LIMIT ${lim}`, f.p);
    },
  },
  'assessment-completion': {
    title: 'Assessment Completion Report',
    columns: [['subject_code', 'Subject', 10], ['subject_name', 'Subject Name', 26], ['semester_no', 'Sem', 6], ['status', 'Status', 10], ['students', 'Students', 9], ['entries_filled', 'Filled', 8], ['entries_total', 'Total', 8], ['completion_percent', 'Complete %', 11]],
    async run(q, user, lim) {
      const f = new Filter(user);
      offeringFilters(f, q, user);
      return query(
        `SELECT * FROM (SELECT s.code AS subject_code, s.name AS subject_name, o.semester_no, o.status,
                (SELECT COUNT(*)::int FROM student_enrollments e WHERE e.offering_id=o.id) AS students,
                (SELECT COUNT(*)::int FROM student_assessment_marks m JOIN assessment_components c ON c.id=m.component_id WHERE c.offering_id=o.id AND m.raw_score IS NOT NULL) AS entries_filled,
                (SELECT COUNT(*)::int FROM student_enrollments e WHERE e.offering_id=o.id) * (SELECT COUNT(*)::int FROM assessment_components c WHERE c.offering_id=o.id) AS entries_total
           FROM subject_offerings o JOIN subjects s ON s.id=o.subject_id ${f.where}) t
          ORDER BY semester_no, subject_code LIMIT ${lim}`, f.p)
        .then((r) => ({ rows: r.rows.map((x) => ({ ...x, completion_percent: x.entries_total ? Math.round((1000 * x.entries_filled) / x.entries_total) / 10 : 0 })) }));
    },
  },
};
DEFS['sgpa-cgpa'] = { ...DEFS['semester-results'], title: 'SGPA and CGPA Report' };
DEFS['grade-cards'] = { ...DEFS['semester-results'], title: 'Grade Card Register' };
DEFS['practical-sessional'] = { ...DEFS['subject-marks'], title: 'Practical and Sessional Report', run: (q, user, lim) => DEFS['subject-marks'].run({ ...q, _practical_sessional: true }, user, lim) };
DEFS['student-assessment'] = { ...DEFS['internal-assessment'], title: 'Student Complete Assessment Report' };

function listTypes() {
  return Object.keys(DEFS).map((k) => ({ type: k, title: DEFS[k].title }));
}

async function run(type, q, user, { format = 'json', limit = 50, offset = 0 }) {
  const def = DEFS[type];
  if (!def) throw bad('Unknown report type');
  if (user.role === 'faculty' && !FACULTY_TYPES.has(type)) throw forbidden();
  if (user.role === 'student') throw forbidden();
  if (type === 'student-assessment' && !q.student_id) throw bad('Choose a student for this report');
  const exporting = format !== 'json';
  const lim = exporting ? 50000 : limit + offset;
  const r = await def.run(q, user, lim);
  const all = r.rows;
  const cols = def.columns.map(([key, label, w]) => ({ key, label, w }));
  if (!exporting) return { title: def.title, columns: cols, rows: all.slice(offset, offset + limit), total: all.length, truncated: all.length >= lim };
  const name = `${type}-${new Date().toISOString().slice(0, 10)}`;
  if (format === 'csv') return { contentType: 'text/csv; charset=utf-8', filename: `${name}.csv`, body: Buffer.from(toCsv(cols, all)) };
  if (format === 'xlsx') {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet(def.title.slice(0, 30));
    ws.columns = cols.map((c) => ({ header: c.label, key: c.key, width: Math.max(10, c.w + 2) }));
    ws.getRow(1).font = { bold: true };
    all.forEach((row) => ws.addRow(Object.fromEntries(cols.map((c) => [c.key, row[c.key] === null ? '' : (/^[=+\-@]/.test(String(row[c.key])) && Number.isNaN(Number(row[c.key])) ? "'" + row[c.key] : row[c.key])]))));
    return { contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', filename: `${name}.xlsx`, body: Buffer.from(await wb.xlsx.writeBuffer()) };
  }
  if (format === 'pdf') {
    const settings = await getSettings();
    const doc = pdf.reportPdf(def.title, `${all.length} rows`, cols, all, settings.institution_name);
    return { contentType: 'application/pdf', filename: `${name}.pdf`, doc };
  }
  throw bad('Unknown format');
}

module.exports = { run, listTypes };
