// Seed with clearly FICTIONAL data for development and demonstration. Never run against real records.
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const { pool, tx } = require('../src/db/pool');
const results = require('../src/services/results');
const admin = require('../src/services/admin');
const marks = require('../src/services/marks');

function rng(seed) {
  let s = seed >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
}

async function seed({ password, quiet } = {}) {
  const log = quiet ? () => {} : console.log;
  const pw = password || process.env.SEED_PASSWORD || crypto.randomBytes(9).toString('base64').replace(/[^a-zA-Z0-9]/g, 'k') + '#1';
  const hash = await bcrypt.hash(pw, 10);
  const rand = rng(42);

  const ids = await tx(async (c) => {
    const one = async (sql, p) => (await c.query(sql, p)).rows[0];
    const dept = await one(`INSERT INTO departments (code,name) VALUES ('CSE','Computer Science and Engineering (fictional)') RETURNING id`);
    const course = await one(`INSERT INTO courses (code,name,department_id,total_semesters) VALUES ('BTECH-CSE','B.Tech Computer Science (fictional)',$1,8) RETURNING id`, [dept.id]);
    const batch = await one(`INSERT INTO batches (label,course_id) VALUES ('2022-2026',$1) RETURNING id`, [course.id]);
    const ay1 = await one(`INSERT INTO academic_years (label,is_active) VALUES ('2024-2025',FALSE) RETURNING id`);
    const ay2 = await one(`INSERT INTO academic_years (label,is_active) VALUES ('2025-2026',TRUE) RETURNING id`);
    const mkUser = async (login, role, name) => (await one(`INSERT INTO users (login_id,password_hash,role,full_name,email) VALUES ($1,$2,$3,$4,$5) RETURNING id`, [login, hash, role, name, `${login.toLowerCase()}@example.invalid`])).id;
    const adminId = await mkUser('seed.admin', 'admin', 'Seed Administrator (fictional)');
    const f1 = await mkUser('FAC001', 'faculty', 'Dr. Faculty One (fictional)');
    const f2 = await mkUser('FAC002', 'faculty', 'Prof. Faculty Two (fictional)');
    await c.query(`INSERT INTO faculty_profiles (user_id,employee_id,department_id,designation) VALUES ($1,'EMP-FICT-001',$3,'Associate Professor'),($2,'EMP-FICT-002',$3,'Assistant Professor')`, [f1, f2, dept.id]);
    const names = ['Asha Demo', 'Bikram Sample', 'Chitra Example', 'Dev Placeholder', 'Esha Fictional', 'Farhan Test', 'Gauri Mock', 'Hari Specimen'];
    const students = [];
    for (let i = 0; i < names.length; i++) {
      const n = String(i + 1).padStart(3, '0');
      const id = await mkUser(`STU${n}`, 'student', `${names[i]} (fictional)`);
      await c.query(`INSERT INTO student_profiles (user_id,roll_no,registration_no,department_id,course_id,batch_id,current_semester) VALUES ($1,$2,$3,$4,$5,$6,6)`,
        [id, `FICT-ROLL-${n}`, `FICT-REG-${n}`, dept.id, course.id, batch.id]);
      students.push(id);
    }
    return { dept: dept.id, batch: batch.id, ay1: ay1.id, ay2: ay2.id, adminId, f1, f2, students };
  });

  const adminUser = { id: ids.adminId, full_name: 'Seed Administrator (fictional)', login_id: 'seed.admin', role: 'admin' };
  const subj = async (code, name, type) => (await pool.query('INSERT INTO subjects (code,name,subject_type,department_id) VALUES ($1,$2,$3,$4) RETURNING id', [code, name, type, ids.dept])).rows[0].id;
  const S = {
    cs401: await subj('CS401', 'Operating Systems', 'theory'),
    cs402: await subj('CS402', 'Computer Networks', 'theory'),
    cs491: await subj('CS491', 'Operating Systems Laboratory', 'practical'),
    hu501: await subj('HU501', 'Economics for Engineers', 'theory'),
    cs501: await subj('CS501', 'Design and Analysis of Algorithms', 'theory'),
    cs591: await subj('CS591', 'Algorithms Laboratory', 'practical'),
    cs581: await subj('CS581', 'Mini Project', 'sessional'),
    cs601: await subj('CS601', 'Compiler Design', 'theory'),
  };

  const mkOffering = async (subject, ay, sem, credits, wca, faculty) => {
    const o = await admin.createOffering(adminUser, { subject_id: subject, academic_year_id: ay, semester_no: sem, batch_id: ids.batch, credits, wca_max: wca });
    await admin.enroll(adminUser, o.id, { student_ids: ids.students });
    await admin.assignFaculty(adminUser, o.id, faculty);
    return o.id;
  };
  const fill = async (offeringId, facultyId, opts = {}) => {
    const user = { id: facultyId, role: 'faculty', full_name: 'seed', login_id: 'seed' };
    const grid = await marks.getGrid(user, offeringId);
    const entries = [];
    grid.rows.forEach((r, idx) => {
      const ability = idx === opts.weakIndex ? 0.14 : 0.5 + (idx * 0.06) + (rand() - 0.5) * 0.1;
      for (const comp of grid.components) {
        if (opts.skip && opts.skip(r, comp, idx)) continue;
        const v = Math.max(0, Math.min(comp.raw_max, Math.round(comp.raw_max * Math.min(0.99, ability + (rand() - 0.5) * 0.12) * 2) / 2));
        entries.push({ student_id: r.student_id, component_code: comp.code, raw_score: v });
      }
    });
    await marks.saveMarks(user, offeringId, entries, 'Seed data');
  };
  const publishAll = async (offeringId, facultyId, lock) => {
    await marks.submit({ id: facultyId, role: 'faculty', full_name: 'seed', login_id: 'seed' }, offeringId);
    await tx((c) => results.transition(c, adminUser, offeringId, 'approve'));
    await tx((c) => results.transition(c, adminUser, offeringId, 'publish'));
    if (lock) await tx((c) => results.transition(c, adminUser, offeringId, 'lock'));
  };

  // Semester 4, academic year 2024-2025, published and locked
  for (const [sub, cr, wca, f] of [[S.cs401, 3, 20, ids.f1], [S.cs402, 4, 20, ids.f2], [S.cs491, 2, null, ids.f1]]) {
    const o = await mkOffering(sub, ids.ay1, 4, cr, wca, f);
    await fill(o, f);
    await publishAll(o, f, true);
  }
  // Semester 5, academic year 2025-2026, published. One fictional student fails CS501 for demonstration.
  const o501 = await mkOffering(S.hu501, ids.ay2, 5, 3, 20, ids.f2);
  await fill(o501, ids.f2); await publishAll(o501, ids.f2, false);
  const oDaa = await mkOffering(S.cs501, ids.ay2, 5, 4, 25, ids.f1);
  await fill(oDaa, ids.f1, { weakIndex: 7 }); await publishAll(oDaa, ids.f1, false);
  const oLab = await mkOffering(S.cs591, ids.ay2, 5, 2, null, ids.f1);
  await fill(oLab, ids.f1); await publishAll(oLab, ids.f1, false);
  const oMini = await mkOffering(S.cs581, ids.ay2, 5, 2, null, ids.f2);
  const f2u = { id: ids.f2, role: 'faculty', full_name: 'seed', login_id: 'seed' };
  await marks.upsertSessionalComponent(f2u, oMini, { code: 'ASG', label: 'Assignments', raw_max: 20, contribution_max: 20 });
  await marks.upsertSessionalComponent(f2u, oMini, { code: 'PRS', label: 'Presentation', raw_max: 10, contribution_max: 20 });
  await marks.upsertSessionalComponent(f2u, oMini, { code: 'PRJ', label: 'Project Work', raw_max: 50, contribution_max: 40 });
  await marks.upsertSessionalComponent(f2u, oMini, { code: 'VIV', label: 'Viva', raw_max: 10, contribution_max: 10 });
  await marks.upsertSessionalComponent(f2u, oMini, { code: 'ATT', label: 'Attendance', raw_max: 10, contribution_max: 10 });
  await fill(oMini, ids.f2); await publishAll(oMini, ids.f2, false);
  // Semester 6 in progress: draft with some marks missing
  const o601 = await mkOffering(S.cs601, ids.ay2, 6, 3, 20, ids.f1);
  await fill(o601, ids.f1, { skip: (r, comp, idx) => comp.code === 'ESE' || comp.code === 'ECA' || (comp.code === 'CA2' && idx % 3 === 0) });

  log(`Seeded fictional data. Login IDs: seed.admin, FAC001, FAC002, STU001 to STU008. Password for all: ${pw}`);
  return { password: pw, ids, offerings: { o501, oDaa, oLab, oMini, o601 } };
}

module.exports = { seed };

if (require.main === module) {
  if (process.env.NODE_ENV === 'production' && process.env.ALLOW_SEED !== 'true') {
    console.error('Refusing to seed in production. Set ALLOW_SEED=true only if you really mean to load fictional data.');
    process.exit(1);
  }
  seed().then(() => pool.end()).catch((e) => { console.error(e); process.exit(1); });
}
