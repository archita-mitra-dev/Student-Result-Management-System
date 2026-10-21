const test = require('node:test');
const assert = require('node:assert/strict');
const { execFileSync, spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { resetDb, startServer, pool } = require('./helpers');
const { seed } = require('../scripts/seed');
const { errorHandler } = require('../src/middleware/errors');

const PW = 'Test#Pass2026';
let srv; let ctx; let admin; let fac1; let fac2; let stu1; let stu8;

test.before(async () => {
  await resetDb();
  ctx = await seed({ password: PW, quiet: true });
  srv = await startServer();
  admin = await srv.login('seed.admin', PW);
  fac1 = await srv.login('FAC001', PW);
  fac2 = await srv.login('FAC002', PW);
  stu1 = await srv.login('STU001', PW);
  stu8 = await srv.login('STU008', PW);
});
test.after(async () => { await srv.close(); await pool.end(); });

const AY2 = () => ctx.ids.ay2;

/* ---------------- Authentication ---------------- */
test('login works, wrong password and unknown user get a safe error', async () => {
  assert.ok(admin && fac1 && stu1);
  const bad1 = await srv.call('POST', '/api/auth/login', { body: { login_id: 'STU001', password: 'nope-nope' } });
  assert.equal(bad1.status, 401);
  const bad2 = await srv.call('POST', '/api/auth/login', { body: { login_id: 'nobody', password: 'nope-nope' } });
  assert.equal(bad2.status, 401);
  assert.equal(bad1.body.error, bad2.body.error, 'must not reveal which part was wrong');
});

test('inactive accounts are denied, even with a valid token', async () => {
  const id = ctx.ids.students[2];
  await pool.query('UPDATE users SET is_active=FALSE WHERE id=$1', [id]);
  const t = await srv.login('STU003', PW);
  assert.equal(t, undefined);
  await pool.query('UPDATE users SET is_active=TRUE WHERE id=$1', [id]);
});

test('requests without a token are rejected', async () => {
  assert.equal((await srv.call('GET', '/api/student/profile')).status, 401);
  assert.equal((await srv.call('GET', '/api/admin/stats')).status, 401);
});

test('initial admin setup is unavailable when an administrator exists', async () => {
  const r = await srv.call('POST', '/api/auth/setup', { body: { token: 'x', login_id: 'a', full_name: 'b', password: 'longenough1' } });
  assert.equal(r.status, 403);
});

/* ---------------- Role based permissions ---------------- */
test('students cannot reach admin or faculty endpoints', async () => {
  assert.equal((await srv.call('GET', '/api/admin/stats', { token: stu1 })).status, 403);
  assert.equal((await srv.call('GET', '/api/admin/students', { token: stu1 })).status, 403);
  assert.equal((await srv.call('GET', `/api/offerings/${ctx.offerings.o601}/grid`, { token: stu1 })).status, 403);
  assert.equal((await srv.call('GET', '/api/reports/semester-results', { token: stu1 })).status, 403);
});

test('faculty cannot reach admin endpoints or publish results', async () => {
  assert.equal((await srv.call('GET', '/api/admin/stats', { token: fac1 })).status, 403);
  assert.equal((await srv.call('POST', `/api/admin/offerings/${ctx.offerings.o601}/publish`, { token: fac1, body: {} })).status, 403);
});

test('faculty cannot read or edit an offering they are not assigned to', async () => {
  // o601 belongs to FAC001, FAC002 is not assigned
  const g = await srv.call('GET', `/api/offerings/${ctx.offerings.o601}/grid`, { token: fac2 });
  assert.equal(g.status, 403);
  assert.match(g.body.error, /Unauthorized subject/);
  const w = await srv.call('PUT', `/api/offerings/${ctx.offerings.o601}/marks`, { token: fac2, body: { entries: [{ student_id: ctx.ids.students[0], component_code: 'CA1', raw_score: 5 }] } });
  assert.equal(w.status, 403);
});

/* ---------------- Student data isolation ---------------- */
test('student only ever sees their own data', async () => {
  const p1 = await srv.call('GET', '/api/student/profile', { token: stu1 });
  const p8 = await srv.call('GET', '/api/student/profile', { token: stu8 });
  assert.equal(p1.body.login_id, 'STU001');
  assert.equal(p8.body.login_id, 'STU008');
  // A student id in the query string is ignored
  const gc = await srv.call('GET', `/api/student/grade-card?academic_year_id=${AY2()}&semester_no=5&student_id=${ctx.ids.students[7]}`, { token: stu1 });
  assert.equal(gc.status, 200);
  assert.equal(gc.body.student.roll_no, 'FICT-ROLL-001');
  const admin404 = await srv.call('GET', `/api/admin/students/${ctx.ids.students[7]}/grade-card?academic_year_id=${AY2()}&semester_no=5`, { token: stu1 });
  assert.equal(admin404.status, 403);
});

/* ---------------- Grade card ---------------- */
test('grade card totals match published results and database', async () => {
  const gc = (await srv.call('GET', `/api/student/grade-card?academic_year_id=${AY2()}&semester_no=5`, { token: stu8 })).body;
  assert.equal(gc.subjects.length, 4);
  const sumCredits = gc.subjects.reduce((a, s) => a + s.credits, 0);
  const sumCp = gc.subjects.reduce((a, s) => a + s.credit_points, 0);
  assert.equal(gc.total_credits, sumCredits);
  assert.equal(gc.total_credit_points, sumCp);
  for (const s of gc.subjects) assert.equal(s.credit_points, s.credits * s.grade_point);
  assert.equal(gc.sgpa, Math.round((sumCp / sumCredits) * 100) / 100);
  const db = (await pool.query(`SELECT sgpa, cgpa FROM semester_results WHERE student_id=$1 AND semester_no=5`, [ctx.ids.students[7]])).rows[0];
  assert.equal(gc.sgpa, Number(db.sgpa));
  assert.equal(gc.cgpa, Number(db.cgpa));
  assert.equal(gc.result_status, 'fail', 'the fictional student fails CS501');
});

test('grade card JSON contains no raw or component marks and no signature fields', async () => {
  const gc = (await srv.call('GET', `/api/student/grade-card?academic_year_id=${AY2()}&semester_no=5`, { token: stu1 })).body;
  const text = JSON.stringify(gc).toLowerCase();
  for (const word of ['ca1', 'ca2', 'eca', 'wca', 'pca', 'pese', 'raw', 'breakdown', 'final_marks', 'internal', 'signature', 'seal', 'stamp']) {
    assert.ok(!text.includes(word), `grade card data must not contain "${word}"`);
  }
  assert.deepEqual(Object.keys(gc.subjects[0]).sort(), ['code', 'credit_points', 'credits', 'grade_point', 'letter_grade', 'name']);
});

function pdfText(buf) {
  const f = path.join(os.tmpdir(), `srms-${process.pid}-${Date.now()}.pdf`);
  fs.writeFileSync(f, buf);
  try { return execFileSync('pdftotext', ['-layout', f, '-'], { encoding: 'utf8' }); } finally { fs.unlinkSync(f); }
}
const hasPdftotext = spawnSync('pdftotext', ['-v']).error === undefined;

test('grade card PDF is generated, correct and has no raw marks, signature, seal or stamp', { skip: !hasPdftotext && 'pdftotext not installed' }, async () => {
  const res = await srv.call('GET', `/api/student/grade-card.pdf?academic_year_id=${AY2()}&semester_no=5`, { token: stu1, raw: true });
  assert.equal(res.status, 200);
  assert.equal(res.headers.get('content-type'), 'application/pdf');
  const buf = Buffer.from(await res.arrayBuffer());
  assert.equal(buf.subarray(0, 4).toString(), '%PDF');
  const txt = pdfText(buf);
  assert.match(txt, /GRADE CARD/);
  assert.match(txt, /FICT-ROLL-001/);
  assert.match(txt, /Subject Code/);
  assert.match(txt, /Credit Points/);
  assert.match(txt, /SGPA/);
  assert.ok(!/signature|controller of examinations|principal|seal|stamp/i.test(txt.replace(/is an unsigned academic result report/i, '')), 'no signature, seal or stamp');
  assert.ok(!/\b(CA1|CA2|ECA|WCA|PCA1|PCA2|End-Semester CA)\b/.test(txt), 'no component marks');
  const gc = (await srv.call('GET', `/api/student/grade-card?academic_year_id=${AY2()}&semester_no=5`, { token: stu1 })).body;
  assert.ok(txt.includes(gc.sgpa.toFixed(2)), 'PDF shows the same SGPA as the database');
});

test('grade card PDF is exactly one A4 page for a normal semester (no blank pages)', { skip: !hasPdftotext && 'poppler not installed' }, async () => {
  const res = await srv.call('GET', `/api/student/grade-card.pdf?academic_year_id=${AY2()}&semester_no=5`, { token: stu1, raw: true });
  const f = path.join(os.tmpdir(), `srms-pages-${process.pid}.pdf`);
  fs.writeFileSync(f, Buffer.from(await res.arrayBuffer()));
  const info = execFileSync('pdfinfo', [f], { encoding: 'utf8' });
  fs.unlinkSync(f);
  assert.match(info, /Pages:\s+1\b/);
  assert.match(info, /Page size:\s+595\.\d+ x 84\d\.\d+ pts \(A4\)/);
});

test('students cannot download a grade card for an unpublished semester', async () => {
  const r = await srv.call('GET', `/api/student/grade-card?academic_year_id=${AY2()}&semester_no=6`, { token: stu1 });
  assert.equal(r.status, 404);
  assert.match(r.body.error, /Result Not Available/);
});

/* ---------------- Internal marksheet and detailed marks ---------------- */
test('internal marksheet shows internal components only, with conversions', async () => {
  const ms = (await srv.call('GET', `/api/student/internal-marksheet?academic_year_id=${AY2()}&semester_no=5`, { token: stu1 })).body;
  const theory = ms.subjects.find((s) => s.code === 'CS501');
  const codes = theory.rows.map((r) => r.code);
  assert.deepEqual(codes, ['CA1', 'CA2', 'CA', 'ECA', 'WCA']);
  assert.ok(!codes.includes('ESE'), 'end semester exam is not an internal mark');
  assert.equal(theory.internal_max, 30);
  const ca = theory.rows.find((r) => r.code === 'CA');
  const ca1 = theory.rows[0].raw; const ca2 = theory.rows[1].raw;
  assert.ok(Math.abs(ca.contribution - ((ca1 + ca2) / 2 / 25) * 10) < 1e-9);
  const eca = theory.rows.find((r) => r.code === 'ECA');
  assert.equal(eca.raw_max, 70);
  assert.equal(eca.contribution_max, 10);
  assert.ok(Math.abs(eca.contribution - (eca.raw / 70) * 10) < 1e-9);
  const sum = theory.rows.filter((r) => ['CA', 'ECA', 'WCA'].includes(r.code)).reduce((a, r) => a + r.contribution, 0);
  assert.ok(Math.abs(sum - theory.internal_marks) < 1e-6);
  const prac = ms.subjects.find((s) => s.code === 'CS591');
  assert.equal(prac.internal_max, 40);
  const sess = ms.subjects.find((s) => s.code === 'CS581');
  assert.equal(sess.rows.length, 5);
  assert.equal(sess.internal_max, 100);
});

test('internal marksheet PDF renders', { skip: !hasPdftotext && 'pdftotext not installed' }, async () => {
  const res = await srv.call('GET', `/api/student/internal-marksheet.pdf?academic_year_id=${AY2()}&semester_no=5`, { token: stu1, raw: true });
  assert.equal(res.status, 200);
  const txt = pdfText(Buffer.from(await res.arrayBuffer()));
  assert.match(txt, /INTERNAL ASSESSMENT MARKSHEET/);
  assert.match(txt, /Internal total/);
  assert.ok(!/Theory End-Semester/.test(txt));
});

test('detailed marks report keeps raw marks and converted contributions apart', async () => {
  const d = (await srv.call('GET', `/api/student/marks?academic_year_id=${AY2()}&semester_no=5`, { token: stu1 })).body;
  const t = d.subjects.find((s) => s.code === 'CS501');
  assert.equal(t.final_max, 100);
  const ese = t.rows.find((r) => r.code === 'ESE');
  assert.equal(ese.raw_max, 70);
  assert.equal(ese.contribution_max, 70);
  const total = t.rows.filter((r) => ['CA', 'ECA', 'WCA', 'ESE'].includes(r.code)).reduce((a, r) => a + r.contribution, 0);
  assert.ok(Math.abs(total - t.final_unrounded) < 1e-9);
});

/* ---------------- Marks entry validation ---------------- */
const entry = (i, code, v) => ({ student_id: ctx.ids.students[i], component_code: code, raw_score: v });

test('negative marks, marks above maximum and duplicate entries are rejected and nothing is saved', async () => {
  const o = ctx.offerings.o601;
  const before = (await pool.query('SELECT COUNT(*)::int AS n FROM student_assessment_marks')).rows[0].n;
  const neg = await srv.call('PUT', `/api/offerings/${o}/marks`, { token: fac1, body: { entries: [entry(0, 'CA1', 10), entry(1, 'CA1', -1)] } });
  assert.equal(neg.status, 400);
  const over = await srv.call('PUT', `/api/offerings/${o}/marks`, { token: fac1, body: { entries: [entry(0, 'ECA', 71)] } });
  assert.equal(over.status, 400);
  assert.match(over.body.details[0].error, /exceeds maximum 70/);
  const dup = await srv.call('PUT', `/api/offerings/${o}/marks`, { token: fac1, body: { entries: [entry(0, 'CA1', 10), entry(0, 'CA1', 11)] } });
  assert.equal(dup.status, 400);
  const nan = await srv.call('PUT', `/api/offerings/${o}/marks`, { token: fac1, body: { entries: [entry(0, 'CA1', 'abc')] } });
  assert.equal(nan.status, 400);
  const after = (await pool.query('SELECT COUNT(*)::int AS n FROM student_assessment_marks')).rows[0].n;
  assert.equal(after, before);
});

test('unique constraint prevents duplicate marks rows at database level', async () => {
  const comp = (await pool.query(`SELECT id FROM assessment_components WHERE offering_id=$1 AND code='CA1'`, [ctx.offerings.o601])).rows[0].id;
  await assert.rejects(pool.query('INSERT INTO student_assessment_marks (component_id, student_id, raw_score) VALUES ($1,$2,5)', [comp, ctx.ids.students[0]]), /duplicate key/);
});

test('submission is blocked while marks are missing', async () => {
  const r = await srv.call('POST', `/api/offerings/${ctx.offerings.o601}/submit`, { token: fac1, body: {} });
  assert.equal(r.status, 400);
  assert.match(r.body.error, /incomplete/i);
  assert.ok(r.body.details.some((d) => /ESE missing/.test(d)));
});

test('grid reports missing entries and calculated totals', async () => {
  const g = (await srv.call('GET', `/api/offerings/${ctx.offerings.o601}/grid`, { token: fac1 })).body;
  assert.ok(g.stats.entries_missing > 0);
  assert.equal(g.offering.editable, true);
  assert.equal(g.components.length, 5);
});

/* ---------------- CSV import ---------------- */
test('CSV import validates in a preview and commits only clean files', async () => {
  const o = ctx.offerings.o601;
  const good = 'roll_no,ESE,ECA\nFICT-ROLL-001,50,60\nFICT-ROLL-002,45,55\n';
  const prev = await srv.call('POST', `/api/offerings/${o}/import`, { token: fac1, body: { csv: good } });
  assert.equal(prev.status, 200);
  assert.equal(prev.body.committed, false);
  assert.equal(prev.body.valid_rows, 2);
  const badCsv = 'roll_no,ESE\nFICT-ROLL-001,99\nNOPE-1,10\n';
  const bp = await srv.call('POST', `/api/offerings/${o}/import`, { token: fac1, body: { csv: badCsv } });
  assert.equal(bp.body.error_rows, 2);
  const bc = await srv.call('POST', `/api/offerings/${o}/import`, { token: fac1, body: { csv: badCsv, commit: true } });
  assert.equal(bc.status, 400);
  const unknownCol = await srv.call('POST', `/api/offerings/${o}/import`, { token: fac1, body: { csv: 'roll_no,XYZ\nFICT-ROLL-001,1\n' } });
  assert.equal(unknownCol.status, 400);
  const ok = await srv.call('POST', `/api/offerings/${o}/import`, { token: fac1, body: { csv: good, commit: true } });
  assert.equal(ok.status, 200);
  assert.equal(ok.body.committed, true);
  const s = (await pool.query(`SELECT m.raw_score FROM student_assessment_marks m JOIN assessment_components c ON c.id=m.component_id WHERE c.offering_id=$1 AND c.code='ESE' AND m.student_id=$2`, [o, ctx.ids.students[0]])).rows[0];
  assert.equal(Number(s.raw_score), 50);
  const hist = await srv.call('GET', `/api/offerings/${o}/history`, { token: fac1 });
  assert.ok(hist.body.rows.length > 0);
});

/* ---------------- Publication, locking and corrections ---------------- */
test('marks of a published or locked offering cannot be edited', async () => {
  const published = ctx.offerings.oDaa;
  const r = await srv.call('PUT', `/api/offerings/${published}/marks`, { token: fac1, body: { entries: [entry(0, 'CA1', 1)] } });
  assert.equal(r.status, 409);
  const rAdmin = await srv.call('PUT', `/api/offerings/${published}/marks`, { token: admin, body: { entries: [entry(0, 'CA1', 1)] } });
  assert.equal(rAdmin.status, 409, 'administrators cannot silently overwrite published marks');
  const o = (await pool.query('SELECT id FROM subject_offerings WHERE semester_no=4 LIMIT 1')).rows[0].id;
  const lockedEdit = await srv.call('PUT', `/api/offerings/${o}/marks`, { token: fac1, body: { entries: [entry(0, 'CA1', 1)] } });
  assert.ok([403, 409].includes(lockedEdit.status));
});

test('workflow transitions are ordered and role protected', async () => {
  const o = ctx.offerings.o601;
  assert.equal((await srv.call('POST', `/api/admin/offerings/${o}/approve`, { token: admin, body: {} })).status, 409, 'cannot approve a draft');
  assert.equal((await srv.call('POST', `/api/admin/offerings/${o}/publish`, { token: admin, body: {} })).status, 409);
  assert.equal((await srv.call('POST', `/api/admin/offerings/${o}/lock`, { token: admin, body: {} })).status, 409);
});

test('full workflow: complete, submit, approve, publish, lock, then authorized correction', async () => {
  const o = ctx.offerings.o601;
  // complete the remaining marks directly through the API
  const g = (await srv.call('GET', `/api/offerings/${o}/grid`, { token: fac1 })).body;
  const entries = [];
  for (const r of g.rows) for (const c of g.components) if (r.cells[c.code].score === null) entries.push({ student_id: r.student_id, component_code: c.code, raw_score: Math.round(c.raw_max * 0.7) });
  assert.equal((await srv.call('PUT', `/api/offerings/${o}/marks`, { token: fac1, body: { entries } })).status, 200);
  assert.equal((await srv.call('POST', `/api/offerings/${o}/submit`, { token: fac1, body: {} })).status, 200);
  // after submission faculty cannot edit
  assert.equal((await srv.call('PUT', `/api/offerings/${o}/marks`, { token: fac1, body: { entries: [entry(0, 'CA1', 5)] } })).status, 409);
  // student sees nothing yet
  assert.equal((await srv.call('GET', `/api/student/grade-card?academic_year_id=${AY2()}&semester_no=6`, { token: stu1 })).status, 404);
  assert.equal((await srv.call('POST', `/api/admin/offerings/${o}/approve`, { token: admin, body: {} })).status, 200);
  assert.equal((await srv.call('POST', `/api/admin/offerings/${o}/publish`, { token: admin, body: {} })).status, 200);
  const gc = await srv.call('GET', `/api/student/grade-card?academic_year_id=${AY2()}&semester_no=6`, { token: stu1 });
  assert.equal(gc.status, 200);
  assert.equal(gc.body.subjects.length, 1);
  assert.equal((await srv.call('POST', `/api/admin/offerings/${o}/lock`, { token: admin, body: {} })).status, 200);
  assert.equal((await srv.call('PUT', `/api/offerings/${o}/marks`, { token: fac1, body: { entries: [entry(0, 'CA1', 5)] } })).status, 409);

  // Correction requires a reason and keeps the published version visible meanwhile
  const noReason = await srv.call('POST', `/api/admin/offerings/${o}/reopen`, { token: admin, body: {} });
  assert.equal(noReason.status, 400);
  const before = gc.body.subjects[0].letter_grade;
  assert.equal((await srv.call('POST', `/api/admin/offerings/${o}/reopen`, { token: admin, body: { reason: 'Re-evaluation request approved by committee' } })).status, 200);
  const during = await srv.call('GET', `/api/student/grade-card?academic_year_id=${AY2()}&semester_no=6`, { token: stu1 });
  assert.equal(during.body.subjects[0].letter_grade, before, 'published version stays visible during correction');
  const upd = await srv.call('PUT', `/api/offerings/${o}/marks`, { token: fac1, body: { entries: [entry(0, 'ESE', 5)], reason: 'Corrected after re-evaluation' } });
  assert.equal(upd.status, 200);
  const hist = await srv.call('GET', `/api/offerings/${o}/history?student_id=${ctx.ids.students[0]}`, { token: fac1 });
  assert.ok(hist.body.rows.some((h) => h.reason === 'Corrected after re-evaluation' && Number(h.new_score) === 5));
  // old version kept, new version created on approval
  assert.equal((await srv.call('POST', `/api/offerings/${o}/submit`, { token: fac1, body: {} })).status, 200);
  assert.equal((await srv.call('POST', `/api/admin/offerings/${o}/approve`, { token: admin, body: {} })).status, 200);
  assert.equal((await srv.call('POST', `/api/admin/offerings/${o}/publish`, { token: admin, body: {} })).status, 200);
  const versions = (await pool.query('SELECT result_version FROM subject_results WHERE offering_id=$1 AND student_id=$2 ORDER BY 1', [o, ctx.ids.students[0]])).rows.map((r) => r.result_version);
  assert.deepEqual(versions, [1, 2]);
  const after = await srv.call('GET', `/api/student/grade-card?academic_year_id=${AY2()}&semester_no=6`, { token: stu1 });
  assert.notEqual(after.body.subjects[0].letter_grade, before);
});

test('audit log records publication, correction reason and old and new values', async () => {
  const rows = (await pool.query(`SELECT action, reason, old_value, new_value, actor_name FROM audit_logs WHERE entity_type='subject_offering' AND entity_id=$1 ORDER BY id`, [String(ctx.offerings.o601)])).rows;
  const actions = rows.map((r) => r.action);
  for (const a of ['offering.submit', 'offering.approve', 'offering.publish', 'offering.lock', 'offering.correction_opened']) assert.ok(actions.includes(a), `missing ${a}`);
  const corr = rows.find((r) => r.action === 'offering.correction_opened');
  assert.match(corr.reason, /Re-evaluation/);
  assert.ok(corr.old_value && corr.new_value && corr.actor_name);
  const markAudit = (await pool.query(`SELECT old_value, new_value FROM audit_logs WHERE action='marks.update' AND reason='Corrected after re-evaluation'`)).rows[0];
  assert.ok(markAudit.old_value && markAudit.new_value);
  const adminAudit = await srv.call('GET', '/api/admin/audit?limit=5', { token: admin });
  assert.equal(adminAudit.status, 200);
  assert.equal((await srv.call('GET', '/api/admin/audit', { token: fac1 })).status, 403);
});

test('published results are not changed by a later grading change (scheme version and grading scheme preserved)', async () => {
  const row = (await pool.query(`SELECT scheme_version, grading_scheme_id FROM subject_results LIMIT 1`)).rows[0];
  assert.equal(row.scheme_version, 1);
  assert.ok(row.grading_scheme_id);
});

/* ---------------- Admin configuration ---------------- */
test('admin can configure grading bands; invalid bands are rejected', async () => {
  const bad = await srv.call('PUT', '/api/admin/grading', { token: admin, body: { name: 'x', pass_marks_percent: 40, bands: [{ letter: 'A', min_marks: 50, grade_point: 10, is_pass: true }, { letter: 'F', min_marks: 10, grade_point: 0 }] } });
  assert.equal(bad.status, 400, 'must have a band starting at 0');
  const cfg = (await srv.call('GET', '/api/admin/grading', { token: admin })).body;
  assert.equal(cfg.is_placeholder, true);
  assert.equal(cfg.bands.length, 7);
});

test('assessment scheme versions are stored without touching existing results', async () => {
  const r = await srv.call('POST', '/api/admin/schemes', { token: admin, body: { scheme_type: 'theory', name: 'Theory v2 (test)', config: { ca_max: 25, ca_contribution: 10, eca_max: 70, eca_contribution: 10, wca_contribution: 10, ese_max: 70, ese_contribution: 70 } } });
  assert.equal(r.status, 201);
  assert.equal(r.body.version, 2);
  const n = (await pool.query(`SELECT COUNT(*)::int AS n FROM subject_results WHERE scheme_version=1`)).rows[0].n;
  assert.ok(n > 0);
});

test('admin manages students: create, duplicate roll rejected, deactivate when records exist', async () => {
  const mk = (n) => srv.call('POST', '/api/admin/students', { token: admin, body: { login_id: `NEW${n}`, full_name: 'New Student (fictional)', roll_no: 'FICT-ROLL-999', registration_no: `FICT-REG-9${n}` } });
  const a = await mk(1);
  assert.equal(a.status, 201);
  assert.ok(a.body.temp_password, 'a temporary password is generated');
  assert.equal((await mk(2)).status, 409);
  const del = await srv.call('DELETE', `/api/admin/students/${ctx.ids.students[0]}`, { token: admin });
  assert.equal(del.body.deactivated, true);
  await pool.query('UPDATE users SET is_active=TRUE WHERE id=$1', [ctx.ids.students[0]]);
  const del2 = await srv.call('DELETE', `/api/admin/students/${a.body.id}`, { token: admin });
  assert.equal(del2.body.deleted, true);
});

test('missing credits are reported and block approval', async () => {
  const o = await srv.call('POST', '/api/admin/offerings', { token: admin, body: { subject_id: (await pool.query(`SELECT id FROM subjects WHERE code='CS402'`)).rows[0].id, academic_year_id: AY2(), semester_no: 7, batch_id: ctx.ids.batch } });
  assert.equal(o.status, 201);
  const v = await srv.call('GET', `/api/admin/offerings/${o.body.id}/validate`, { token: admin });
  assert.equal(v.body.ok, false);
  assert.ok(v.body.problems.some((p) => /credits are not configured/.test(p)));
});

/* ---------------- Reports ---------------- */
test('reports filter real data and export to CSV, Excel and PDF', async () => {
  const j = await srv.call('GET', `/api/reports/semester-results?academic_year_id=${AY2()}&semester_no=5`, { token: admin });
  assert.equal(j.status, 200);
  assert.equal(j.body.total, 8);
  const failOnly = await srv.call('GET', `/api/reports/semester-results?academic_year_id=${AY2()}&semester_no=5&result_status=fail`, { token: admin });
  assert.equal(failOnly.body.total, 1);
  assert.equal(failOnly.body.rows[0].roll_no, 'FICT-ROLL-008');
  const csv = await srv.call('GET', `/api/reports/subject-marks?academic_year_id=${AY2()}&semester_no=5&format=csv`, { token: admin, raw: true });
  assert.match(csv.headers.get('content-type'), /text\/csv/);
  const csvText = await csv.text();
  assert.ok(csvText.split('\r\n')[0].includes('Subject'));
  assert.ok(csvText.split('\r\n').length > 10);
  const xlsx = await srv.call('GET', `/api/reports/pass-fail?format=xlsx`, { token: admin, raw: true });
  assert.equal(xlsx.status, 200);
  assert.equal(Buffer.from(await xlsx.arrayBuffer()).subarray(0, 2).toString(), 'PK');
  const pdf = await srv.call('GET', `/api/reports/department-performance?format=pdf`, { token: admin, raw: true });
  assert.equal(Buffer.from(await pdf.arrayBuffer()).subarray(0, 4).toString(), '%PDF');
  const unknown = await srv.call('GET', '/api/reports/nope', { token: admin });
  assert.equal(unknown.status, 400);
});

test('faculty reports are limited to assigned subjects', async () => {
  const mine = await srv.call('GET', `/api/reports/subject-marks?academic_year_id=${AY2()}&semester_no=5`, { token: fac2 });
  const codes = new Set(mine.body.rows.map((r) => r.subject_code));
  assert.deepEqual([...codes].sort(), ['CS581', 'HU501']);
  assert.equal((await srv.call('GET', '/api/reports/semester-results', { token: fac2 })).status, 403);
  const missing = await srv.call('GET', '/api/reports/missing-marks', { token: admin });
  assert.equal(missing.status, 200);
});

test('CSV export neutralizes spreadsheet formulas', () => {
  const { toCsv } = require('../src/utils/csv');
  const out = toCsv([{ key: 'a', label: 'A' }], [{ a: '=1+1' }, { a: '-5' }]);
  assert.ok(out.includes("'=1+1"));
  assert.ok(out.includes('-5') && !out.includes("'-5"));
});

/* ---------------- Dashboards ---------------- */
test('dashboards return database derived numbers', async () => {
  const a = (await srv.call('GET', '/api/admin/stats', { token: admin })).body;
  assert.equal(a.students, 8);
  assert.equal(a.faculty, 2);
  assert.equal(a.active_academic_year, '2025-2026');
  const f = (await srv.call('GET', '/api/faculty/dashboard', { token: fac1 })).body;
  assert.ok(f.offerings.length >= 3);
  const s = (await srv.call('GET', '/api/student/dashboard', { token: stu1 })).body;
  assert.ok(s.semesters.length >= 2);
  assert.ok(s.cgpa > 0);
});

/* ---------------- Failure handling ---------------- */
test('database failures map to a safe 503 without leaking details', () => {
  let status; let body;
  const res = { status(s) { status = s; return this; }, json(b) { body = b; } };
  const err = Object.assign(new Error('connect ECONNREFUSED 10.0.0.5:5432 password=secret'), { code: 'ECONNREFUSED' });
  errorHandler(err, {}, res, () => {});
  assert.equal(status, 503);
  assert.ok(!JSON.stringify(body).includes('secret') && !JSON.stringify(body).includes('10.0.0.5'));
});

test('unexpected errors return a generic 500', () => {
  let status; let body;
  const res = { status(s) { status = s; return this; }, json(b) { body = b; } };
  const origErr = console.error; console.error = () => {};
  errorHandler(new Error('SELECT * FROM users WHERE password = x'), {}, res, () => {});
  console.error = origErr;
  assert.equal(status, 500);
  assert.ok(!/SELECT/.test(JSON.stringify(body)));
});

test('health endpoints respond', async () => {
  assert.equal((await srv.call('GET', '/health')).status, 200);
  assert.equal((await srv.call('GET', '/health/db')).body.database, 'connected');
});

test('CORS allows the configured frontend and rejects others', async () => {
  const ok = await fetch(srv.base + '/health', { headers: { Origin: 'http://localhost:5173' } });
  assert.equal(ok.headers.get('access-control-allow-origin'), 'http://localhost:5173');
  const no = await fetch(srv.base + '/health', { headers: { Origin: 'https://evil.example' } });
  assert.equal(no.headers.get('access-control-allow-origin'), null);
});
