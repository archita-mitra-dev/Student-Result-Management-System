const svc = require('../services/student');
const pdf = require('../services/pdf');
const { getSettings } = require('../services/settings');
const { toInt } = require('../utils/http');

const ids = (req) => ({ ay: toInt(req.query.academic_year_id, 'academic year'), sem: toInt(req.query.semester_no, 'semester') });
function sendPdf(res, doc, filename) {
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  doc.pipe(res);
  doc.end();
}
const safe = (s) => String(s).replace(/[^a-zA-Z0-9_-]/g, '_');

const h = {};
// All handlers use req.user.id, never an id from the request, so students cannot read other students.
h.dashboard = async (req, res) => res.json(await svc.dashboard(req.user.id));
h.profile = async (req, res) => res.json(await svc.profile(req.user.id));
h.semesters = async (req, res) => res.json({ rows: await svc.semesters(req.user.id) });
h.gradeCard = async (req, res) => { const { ay, sem } = ids(req); res.json(await svc.gradeCard(req.user.id, ay, sem)); };
h.gradeCardPdf = async (req, res) => {
  const { ay, sem } = ids(req);
  const gc = await svc.gradeCard(req.user.id, ay, sem);
  sendPdf(res, pdf.gradeCardPdf(gc), `grade-card-${safe(gc.student.roll_no)}-S${sem}.pdf`);
};
h.marks = async (req, res) => { const { ay, sem } = ids(req); res.json(await svc.detailedMarks(req.user.id, ay, sem)); };
h.marksPdf = async (req, res) => {
  const { ay, sem } = ids(req);
  const d = await svc.detailedMarks(req.user.id, ay, sem);
  const s = await getSettings();
  sendPdf(res, pdf.detailedMarksPdf(d, s.institution_name), `marks-report-${safe(d.student.roll_no)}-S${sem}.pdf`);
};
h.internal = async (req, res) => { const { ay, sem } = ids(req); res.json(await svc.internalMarksheet(req.user.id, ay, sem)); };
h.internalPdf = async (req, res) => {
  const { ay, sem } = ids(req);
  const ms = await svc.internalMarksheet(req.user.id, ay, sem);
  sendPdf(res, pdf.internalMarksheetPdf(ms), `internal-marksheet-${safe(ms.student.roll_no)}-S${sem}.pdf`);
};
module.exports = h;
