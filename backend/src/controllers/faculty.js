const marks = require('../services/marks');
const { query } = require('../db/pool');
const { toInt, bad } = require('../utils/http');
const admin = require('../services/admin');

const h = {};
h.myOfferings = async (req, res) => {
  const rows = await admin.listOfferings({ ...req.query, ...(req.user.role === 'faculty' ? { faculty_id: req.user.id } : {}) });
  res.json({ rows });
};
h.grid = async (req, res) => res.json(await marks.getGrid(req.user, toInt(req.params.id)));
h.save = async (req, res) => res.json(await marks.saveMarks(req.user, toInt(req.params.id), req.body.entries, req.body.reason));
h.importCsv = async (req, res) => {
  if (typeof req.body.csv !== 'string' || req.body.csv.length > 2_000_000) throw bad('CSV text is required');
  res.json(await marks.importCsv(req.user, toInt(req.params.id), req.body.csv, req.body.commit === true));
};
h.submit = async (req, res) => res.json({ status: await marks.submit(req.user, toInt(req.params.id)) });
h.setWca = async (req, res) => res.json(await marks.setWcaMax(req.user, toInt(req.params.id), req.body.wca_max));
h.addComponent = async (req, res) => res.status(201).json(await marks.upsertSessionalComponent(req.user, toInt(req.params.id), req.body));
h.updateComponent = async (req, res) => res.json(await marks.upsertSessionalComponent(req.user, toInt(req.params.id), req.body, toInt(req.params.cid)));
h.deleteComponent = async (req, res) => res.json(await marks.deleteSessionalComponent(req.user, toInt(req.params.id), toInt(req.params.cid)));
h.history = async (req, res) => res.json({ rows: await marks.markHistory(req.user, toInt(req.params.id), req.query.student_id ? toInt(req.query.student_id) : null) });
h.dashboard = async (req, res) => {
  const rows = await admin.listOfferings({ faculty_id: req.user.id });
  const act = (await query(`SELECT created_at, action, entity_type, entity_id FROM audit_logs WHERE actor_id=$1 ORDER BY created_at DESC LIMIT 8`, [req.user.id])).rows;
  const students = (await query(`SELECT COUNT(DISTINCT e.student_id)::int AS n FROM student_enrollments e JOIN faculty_subject_assignments fa ON fa.offering_id=e.offering_id WHERE fa.faculty_id=$1`, [req.user.id])).rows[0].n;
  res.json({
    offerings: rows, students,
    draft: rows.filter((r) => r.status === 'draft').length, submitted: rows.filter((r) => r.status === 'submitted').length,
    missing_marks: rows.filter((r) => r.status === 'draft').reduce((a, r) => a + r.entries_missing, 0), recent_activity: act,
  });
};
module.exports = h;
