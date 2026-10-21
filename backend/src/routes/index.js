const express = require('express');
const rateLimit = require('express-rate-limit');
const { authenticate, requireRole } = require('../middleware/auth');
const { wrap } = require('../utils/http');
const auth = require('../controllers/auth');
const admin = require('../controllers/admin');
const faculty = require('../controllers/faculty');
const student = require('../controllers/student');
const reports = require('../controllers/reports');

const r = express.Router();
const loginLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: parseInt(process.env.LOGIN_RATE_LIMIT || '20', 10), standardHeaders: true, legacyHeaders: false, message: { error: 'Too many attempts. Please wait a few minutes and try again.' } });
const writeLimiter = rateLimit({ windowMs: 60 * 1000, limit: 120, standardHeaders: true, legacyHeaders: false, message: { error: 'Too many requests. Please slow down.' } });

// Public
r.post('/auth/login', loginLimiter, wrap(auth.login));
r.get('/auth/setup-status', wrap(auth.setupStatus));
r.post('/auth/setup', loginLimiter, wrap(auth.setupAdmin));

// Authenticated
r.use(authenticate);
r.get('/auth/me', wrap(auth.me));
r.post('/auth/change-password', loginLimiter, wrap(auth.changePassword));
r.use((req, res, next) => (['POST', 'PUT', 'DELETE'].includes(req.method) ? writeLimiter(req, res, next) : next()));

// Reference data readable by staff (needed for filters and forms)
r.get('/lookup/:name', requireRole('admin', 'faculty'), wrap(admin.refList));

// Student (own data only)
const S = requireRole('student');
r.get('/student/dashboard', S, wrap(student.dashboard));
r.get('/student/profile', S, wrap(student.profile));
r.get('/student/semesters', S, wrap(student.semesters));
r.get('/student/grade-card', S, wrap(student.gradeCard));
r.get('/student/grade-card.pdf', S, wrap(student.gradeCardPdf));
r.get('/student/marks', S, wrap(student.marks));
r.get('/student/marks.pdf', S, wrap(student.marksPdf));
r.get('/student/internal-marksheet', S, wrap(student.internal));
r.get('/student/internal-marksheet.pdf', S, wrap(student.internalPdf));

// Faculty and admin marks entry (assignment checked inside the service)
const F = requireRole('faculty', 'admin');
r.get('/faculty/dashboard', requireRole('faculty'), wrap(faculty.dashboard));
r.get('/offerings/mine', F, wrap(faculty.myOfferings));
r.get('/offerings/:id/grid', F, wrap(faculty.grid));
r.put('/offerings/:id/marks', F, wrap(faculty.save));
r.post('/offerings/:id/import', F, wrap(faculty.importCsv));
r.post('/offerings/:id/submit', F, wrap(faculty.submit));
r.put('/offerings/:id/wca-max', F, wrap(faculty.setWca));
r.post('/offerings/:id/components', F, wrap(faculty.addComponent));
r.put('/offerings/:id/components/:cid', F, wrap(faculty.updateComponent));
r.delete('/offerings/:id/components/:cid', F, wrap(faculty.deleteComponent));
r.get('/offerings/:id/history', F, wrap(faculty.history));

// Reports (faculty limited inside the service)
r.get('/reports', F, wrap(reports.types));
r.get('/reports/:type', F, wrap(reports.run));

// Administrator only
const A = requireRole('admin');
r.get('/admin/stats', A, wrap(admin.stats));
r.get('/admin/students', A, wrap(admin.listStudents));
r.post('/admin/students', A, wrap(admin.createStudent));
r.put('/admin/students/:id', A, wrap(admin.updateStudent));
r.delete('/admin/students/:id', A, wrap(admin.deleteStudent));
r.post('/admin/users/:id/reset-password', A, wrap(admin.resetPassword));
r.get('/admin/faculty', A, wrap(admin.listFaculty));
r.post('/admin/faculty', A, wrap(admin.createFaculty));
r.put('/admin/faculty/:id', A, wrap(admin.updateFaculty));
r.post('/admin/ref/:name', A, wrap(admin.refCreate));
r.put('/admin/ref/:name/:id', A, wrap(admin.refUpdate));
r.delete('/admin/ref/:name/:id', A, wrap(admin.refDelete));
r.post('/admin/academic-years/:id/activate', A, wrap(admin.activateYear));
r.get('/admin/offerings', A, wrap(admin.listOfferings));
r.get('/admin/offerings/:id', A, wrap(admin.offeringDetail));
r.post('/admin/offerings', A, wrap(admin.createOffering));
r.put('/admin/offerings/:id', A, wrap(admin.updateOffering));
r.delete('/admin/offerings/:id', A, wrap(admin.deleteOffering));
r.post('/admin/offerings/:id/faculty', A, wrap(admin.assign));
r.delete('/admin/offerings/:id/faculty/:facultyId', A, wrap(admin.unassign));
r.post('/admin/offerings/:id/enroll', A, wrap(admin.enroll));
r.delete('/admin/offerings/:id/enroll/:studentId', A, wrap(admin.unenroll));
r.get('/admin/offerings/:id/validate', A, wrap(admin.validate));
r.post('/admin/offerings/:id/:action', A, wrap(admin.workflow));
r.get('/admin/grading', A, wrap(admin.grading));
r.put('/admin/grading', A, wrap(admin.saveGrading));
r.get('/admin/schemes', A, wrap(admin.schemes));
r.post('/admin/schemes', A, wrap(admin.createScheme));
r.get('/admin/settings', A, wrap(admin.settings));
r.put('/admin/settings', A, wrap(admin.saveSettings));
r.get('/admin/audit', A, wrap(admin.audit));

// Admin viewing a student's grade card or internal marksheet for support purposes
const adminStudent = require('../services/student');
const pdfSvc = require('../services/pdf');
const { toInt } = require('../utils/http');
r.get('/admin/students/:id/grade-card', A, wrap(async (req, res) => res.json(await adminStudent.gradeCard(toInt(req.params.id), toInt(req.query.academic_year_id), toInt(req.query.semester_no)))));
r.get('/admin/students/:id/internal-marksheet', A, wrap(async (req, res) => res.json(await adminStudent.internalMarksheet(toInt(req.params.id), toInt(req.query.academic_year_id), toInt(req.query.semester_no)))));
r.get('/admin/students/:id/grade-card.pdf', A, wrap(async (req, res) => {
  const gc = await adminStudent.gradeCard(toInt(req.params.id), toInt(req.query.academic_year_id), toInt(req.query.semester_no));
  res.setHeader('Content-Type', 'application/pdf'); res.setHeader('Content-Disposition', 'attachment; filename="grade-card.pdf"');
  const d = pdfSvc.gradeCardPdf(gc); d.pipe(res); d.end();
}));
r.get('/admin/students/:id/internal-marksheet.pdf', A, wrap(async (req, res) => {
  const ms = await adminStudent.internalMarksheet(toInt(req.params.id), toInt(req.query.academic_year_id), toInt(req.query.semester_no));
  res.setHeader('Content-Type', 'application/pdf'); res.setHeader('Content-Disposition', 'attachment; filename="internal-marksheet.pdf"');
  const d = pdfSvc.internalMarksheetPdf(ms); d.pipe(res); d.end();
}));
r.get('/admin/students/:id/semesters', A, wrap(async (req, res) => res.json({ rows: await adminStudent.semesters(toInt(req.params.id)) })));

module.exports = r;
