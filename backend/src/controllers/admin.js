const svc = require('../services/admin');
const results = require('../services/results');
const { tx } = require('../db/pool');
const { toInt, pagination, bad } = require('../utils/http');

const h = {};
h.stats = async (req, res) => res.json(await svc.stats());
h.listStudents = async (req, res) => res.json(await svc.listStudents(req.query, pagination(req.query)));
h.createStudent = async (req, res) => res.status(201).json(await svc.createStudent(req.user, req.body));
h.updateStudent = async (req, res) => res.json(await svc.updateStudent(req.user, toInt(req.params.id), req.body));
h.deleteStudent = async (req, res) => res.json(await svc.deleteStudent(req.user, toInt(req.params.id)));
h.resetPassword = async (req, res) => res.json(await svc.resetPassword(req.user, toInt(req.params.id)));
h.listFaculty = async (req, res) => res.json({ rows: await svc.listFaculty() });
h.createFaculty = async (req, res) => res.status(201).json(await svc.createFaculty(req.user, req.body));
h.updateFaculty = async (req, res) => res.json(await svc.updateFaculty(req.user, toInt(req.params.id), req.body));

const refName = (req) => { if (!svc.REF[req.params.name]) throw bad('Unknown resource'); return req.params.name; };
h.refList = async (req, res) => res.json({ rows: await svc.refList(refName(req)) });
h.refCreate = async (req, res) => res.status(201).json(await svc.refCreate(req.user, refName(req), req.body));
h.refUpdate = async (req, res) => res.json(await svc.refUpdate(req.user, refName(req), toInt(req.params.id), req.body));
h.refDelete = async (req, res) => res.json(await svc.refDelete(req.user, refName(req), toInt(req.params.id)));
h.activateYear = async (req, res) => res.json(await svc.activateYear(req.user, toInt(req.params.id)));

h.listOfferings = async (req, res) => res.json({ rows: await svc.listOfferings(req.query) });
h.offeringDetail = async (req, res) => res.json(await svc.offeringDetail(toInt(req.params.id)));
h.createOffering = async (req, res) => res.status(201).json(await svc.createOffering(req.user, req.body));
h.updateOffering = async (req, res) => res.json(await svc.updateOffering(req.user, toInt(req.params.id), req.body));
h.deleteOffering = async (req, res) => res.json(await svc.deleteOffering(req.user, toInt(req.params.id)));
h.assign = async (req, res) => res.json(await svc.assignFaculty(req.user, toInt(req.params.id), toInt(req.body.faculty_id, 'faculty id')));
h.unassign = async (req, res) => res.json(await svc.unassignFaculty(req.user, toInt(req.params.id), toInt(req.params.facultyId)));
h.enroll = async (req, res) => res.json(await svc.enroll(req.user, toInt(req.params.id), req.body));
h.unenroll = async (req, res) => res.json(await svc.unenroll(req.user, toInt(req.params.id), toInt(req.params.studentId)));
h.validate = async (req, res) => res.json(await svc.validateOffering(toInt(req.params.id)));

h.workflow = async (req, res) => {
  const action = req.params.action;
  if (!['approve', 'publish', 'lock', 'reopen'].includes(action)) throw bad('Unknown action');
  const status = await tx((c) => results.transition(c, req.user, toInt(req.params.id), action, req.body.reason));
  res.json({ status });
};

h.grading = async (req, res) => res.json(await svc.getGradingConfig());
h.saveGrading = async (req, res) => res.json(await svc.saveGradingConfig(req.user, req.body));
h.schemes = async (req, res) => res.json({ rows: await svc.listSchemes() });
h.createScheme = async (req, res) => res.status(201).json(await svc.createSchemeVersion(req.user, req.body));
h.settings = async (req, res) => res.json({ rows: await svc.getSettingsAll() });
h.saveSettings = async (req, res) => res.json(await svc.saveSettings(req.user, req.body));
h.audit = async (req, res) => res.json(await svc.auditLog(req.query, pagination(req.query, 50)));

module.exports = h;
