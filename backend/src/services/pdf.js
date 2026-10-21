const PDFDocument = require('pdfkit');

const INK = '#1a1a1a';
const RULE = '#444444';
const M = 48; // page margin in points (about 17 mm)

function fmt(v, d = 2) {
  if (v === null || v === undefined || Number.isNaN(v)) return '-';
  return Number(v).toFixed(d);
}
const trimNum = (v) => (v === null || v === undefined ? '-' : String(Math.round(Number(v) * 100) / 100));

// Generic table with repeating header and rows that never split across pages.
function drawTable(doc, { columns, rows, startY, rowHeight = 20, headerHeight = 24, fontSize = 9, footerRow }) {
  const width = doc.page.width - M * 2;
  const total = columns.reduce((a, c) => a + c.w, 0);
  const cols = columns.map((c) => ({ ...c, pw: (c.w / total) * width }));
  let y = startY;
  const header = () => {
    doc.save().rect(M, y, width, headerHeight).fill('#e9e9e9').restore();
    doc.rect(M, y, width, headerHeight).lineWidth(0.8).stroke(RULE);
    let x = M;
    doc.font('Times-Bold').fontSize(fontSize).fillColor(INK);
    for (const c of cols) {
      doc.text(c.label, x + 4, y + (headerHeight - fontSize) / 2 - 1, { width: c.pw - 8, align: c.align || 'left', lineBreak: false });
      x += c.pw;
      if (x < M + width - 1) doc.moveTo(x, y).lineTo(x, y + headerHeight).lineWidth(0.5).stroke(RULE);
    }
    y += headerHeight;
  };
  const drawRow = (r, bold) => {
    const h = r._h || rowHeight;
    if (y + h > doc.page.height - M - 30) { doc.addPage(); y = M; header(); }
    doc.rect(M, y, width, h).lineWidth(0.5).stroke(RULE);
    let x = M;
    doc.font(bold ? 'Times-Bold' : 'Times-Roman').fontSize(fontSize).fillColor(INK);
    for (const c of cols) {
      const text = r[c.key] === null || r[c.key] === undefined ? '' : String(r[c.key]);
      doc.text(text, x + 4, y + (h - fontSize) / 2 - 1, { width: c.pw - 8, align: c.align || 'left', lineBreak: false, ellipsis: true });
      x += c.pw;
      if (x < M + width - 1) doc.moveTo(x, y).lineTo(x, y + h).lineWidth(0.5).stroke(RULE);
    }
    y += h;
  };
  header();
  rows.forEach((r) => drawRow(r, r._bold));
  if (footerRow) drawRow(footerRow, true);
  return y;
}

function titleBlock(doc, lines, title) {
  doc.font('Times-Bold').fontSize(14).fillColor(INK);
  lines.filter(Boolean).forEach((l, i) => doc.text(l, M, doc.y, { align: 'center', width: doc.page.width - M * 2 }));
  doc.moveDown(0.6);
  doc.font('Times-Bold').fontSize(15).text(title, { align: 'center', underline: true, width: doc.page.width - M * 2 });
  doc.moveDown(0.8);
}

function infoBox(doc, pairs) {
  const width = doc.page.width - M * 2;
  const startY = doc.y;
  const rowH = 20;
  const half = width / 2;
  const rows = Math.ceil(pairs.length / 2);
  doc.rect(M, startY, width, rowH * rows).lineWidth(0.8).stroke(RULE);
  doc.moveTo(M + half, startY).lineTo(M + half, startY + rowH * rows).lineWidth(0.5).stroke(RULE);
  pairs.forEach((p, i) => {
    const r = Math.floor(i / 2);
    const x = M + (i % 2) * half;
    const y = startY + r * rowH;
    if (i % 2 === 0 && r > 0) doc.moveTo(M, y).lineTo(M + width, y).lineWidth(0.4).stroke(RULE);
    doc.font('Times-Bold').fontSize(9.5).fillColor(INK).text(`${p[0]} : `, x + 6, y + 6, { continued: true, lineBreak: false });
    doc.font('Times-Roman').text(p[1] || '-', { lineBreak: false, width: half - 16 });
  });
  doc.y = startY + rowH * rows + 14;
}

function newDoc(info) {
  return new PDFDocument({ size: 'A4', margins: { top: M, bottom: M, left: M, right: M }, info, bufferPages: true });
}

function footer(doc, text) {
  const range = doc.bufferedPageRange();
  for (let i = 0; i < range.count; i++) {
    doc.switchToPage(i);
    // Footer sits inside the bottom margin. Zero the margin while writing so pdfkit does not add blank pages.
    const oldBottom = doc.page.margins.bottom;
    doc.page.margins.bottom = 0;
    doc.font('Times-Italic').fontSize(8).fillColor('#555555');
    doc.text(text, M, doc.page.height - M + 8, { align: 'center', width: doc.page.width - M * 2, lineBreak: false });
    doc.text(`Page ${i + 1} of ${range.count}`, M, doc.page.height - M + 20, { align: 'center', width: doc.page.width - M * 2, lineBreak: false });
    doc.page.margins.bottom = oldBottom;
  }
}

// GRADE CARD. Only grades and credit information. No component marks, no signature, no seal.
function gradeCardPdf(gc) {
  const doc = newDoc({ Title: 'Grade Card', Author: gc.institution || 'SRMS' });
  titleBlock(doc, [gc.university, gc.university_former_name ? `(${gc.university_former_name})` : null], 'GRADE CARD');
  doc.font('Times-Bold').fontSize(10.5).fillColor(INK)
    .text(`${gc.exam_name || 'Examination'}  |  Academic Year ${gc.academic_year}  |  Semester ${gc.semester_no}${gc.exam_session ? `  |  Session ${gc.exam_session}` : ''}`, { align: 'center' });
  doc.moveDown(0.8);
  infoBox(doc, [
    ['Name', gc.student.name], ['Roll No.', gc.student.roll_no],
    ['Registration No.', gc.student.registration_no], ['Course', gc.student.course],
    ['Department', gc.student.department], ['Semester', String(gc.semester_no)],
  ]);
  const rows = gc.subjects.map((s) => ({ code: s.code, name: s.name, letter: s.letter_grade, points: trimNum(s.grade_point), credit: fmt(s.credits, 1), cp: fmt(s.credit_points, 1) }));
  const y = drawTable(doc, {
    startY: doc.y,
    columns: [
      { key: 'code', label: 'Subject Code', w: 12 }, { key: 'name', label: 'Subjects Offered', w: 40 },
      { key: 'letter', label: 'Letter Grade', w: 10, align: 'center' }, { key: 'points', label: 'Points', w: 9, align: 'center' },
      { key: 'credit', label: 'Credit', w: 9, align: 'center' }, { key: 'cp', label: 'Credit Points', w: 12, align: 'center' },
    ],
    rows,
    footerRow: { code: '', name: 'Total', letter: '', points: '', credit: fmt(gc.total_credits, 2), cp: fmt(gc.total_credit_points, 2) },
  });
  doc.y = y + 16;
  if (doc.y > doc.page.height - 200) doc.addPage();
  const statusText = { pass: 'PASS', fail: 'FAIL', incomplete: 'INCOMPLETE' }[gc.result_status] || '-';
  const sumRows = [
    ['SGPA (Semester ' + gc.semester_no + ')', gc.sgpa === null ? 'Not available' : fmt(gc.sgpa)],
    ['CGPA', gc.cgpa === null ? 'Not available' : fmt(gc.cgpa)],
  ];
  if (gc.show_ygpa) sumRows.push(['YGPA', 'Awaiting configuration']);
  if (gc.percentage !== null && gc.percentage !== undefined) sumRows.push(['Percentage (configured policy)', fmt(gc.percentage)]);
  sumRows.push(['Result', statusText]);
  if (gc.mar_enabled) sumRows.push(['MAR (Mandatory Additional Requirement)', 'Awaiting configuration']);
  sumRows.push(['Academic Year', gc.academic_year]);
  sumRows.push(['College / Institution', gc.institution]);
  const w = doc.page.width - M * 2;
  let sy = doc.y;
  const rh = 19;
  doc.rect(M, sy, w, rh * sumRows.length).lineWidth(0.8).stroke(RULE);
  sumRows.forEach((r, i) => {
    const yy = sy + i * rh;
    if (i) doc.moveTo(M, yy).lineTo(M + w, yy).lineWidth(0.4).stroke(RULE);
    doc.font('Times-Bold').fontSize(9.5).fillColor(INK).text(r[0], M + 8, yy + 5, { width: w * 0.5, lineBreak: false });
    doc.font('Times-Roman').text(r[1] || '-', M + w * 0.5, yy + 5, { width: w * 0.5 - 8, lineBreak: false });
  });
  doc.y = sy + rh * sumRows.length + 12;
  if (gc.pending_subjects > 0) doc.font('Times-Italic').fontSize(9).text(`${gc.pending_subjects} subject(s) of this semester are not yet published. SGPA and CGPA are shown once all results are published.`, M, doc.y, { width: w });
  doc.moveDown(0.8);
  doc.font('Times-Italic').fontSize(8.5).fillColor('#333333').text(
    `Generated from the published results held in the application${gc.published_on ? ` (published ${new Date(gc.published_on).toISOString().slice(0, 10)})` : ''}. Application reference: ${gc.reference}. This is an unsigned academic result report and is not an officially certified document.`,
    M, doc.y, { width: w });
  footer(doc, `${gc.institution || ''}`);
  return doc;
}

// INTERNAL MARKSHEET. Internal assessment components only, unsigned.
function internalMarksheetPdf(ms) {
  const doc = newDoc({ Title: 'Internal Assessment Marksheet', Author: ms.institution || 'SRMS' });
  titleBlock(doc, [ms.university], 'INTERNAL ASSESSMENT MARKSHEET');
  doc.font('Times-Roman').fontSize(10).fillColor(INK).text(`Academic Year ${ms.academic_year}  |  Semester ${ms.semester_no}`, { align: 'center' });
  doc.moveDown(0.8);
  infoBox(doc, [
    ['Name', ms.student.name], ['Roll No.', ms.student.roll_no],
    ['Registration No.', ms.student.registration_no], ['Course', ms.student.course],
    ['Department', ms.student.department], ['Institution', ms.institution],
  ]);
  for (const s of ms.subjects) {
    if (doc.y + 40 + (s.rows.length + 2) * 18 + 22 > doc.page.height - M - 30) doc.addPage();
    doc.font('Times-Bold').fontSize(10.5).fillColor(INK).text(`${s.code}  ${s.name}  (${s.type})`, M, doc.y, { width: doc.page.width - M * 2 });
    doc.moveDown(0.3);
    const rows = s.rows.map((r) => ({
      comp: r.label, raw: r.raw === undefined || r.raw === null ? '-' : trimNum(r.raw), max: trimNum(r.raw_max),
      conv: r.contribution === undefined || r.contribution === null ? '' : fmt(r.contribution, 2),
      cmax: r.contribution_max === undefined || r.contribution_max === null ? '' : trimNum(r.contribution_max),
    }));
    const y = drawTable(doc, {
      startY: doc.y, fontSize: 8.8, rowHeight: 18, headerHeight: 22,
      columns: [
        { key: 'comp', label: 'Component', w: 40 }, { key: 'raw', label: 'Marks Obtained', w: 13, align: 'center' },
        { key: 'max', label: 'Maximum', w: 11, align: 'center' }, { key: 'conv', label: 'Converted', w: 12, align: 'center' },
        { key: 'cmax', label: 'Out of', w: 10, align: 'center' },
      ],
      rows,
      footerRow: { comp: 'Internal total', raw: '', max: '', conv: fmt(s.internal_marks, 2), cmax: trimNum(s.internal_max) },
    });
    doc.y = y + 14;
  }
  const w = doc.page.width - M * 2;
  doc.font('Times-Italic').fontSize(8.5).fillColor('#333333').text(
    `This sheet lists internal assessment components only. Converted marks follow the assessment scheme recorded with the published result. Application reference: ${ms.reference}. This is an unsigned report and is not an officially certified document.`,
    M, doc.y, { width: w });
  footer(doc, `${ms.institution || ''}`);
  return doc;
}

// Detailed marks report (raw marks, conversions and final marks).
function detailedMarksPdf(d, institution) {
  const doc = newDoc({ Title: 'Detailed Marks Report', Author: institution || 'SRMS' });
  titleBlock(doc, [institution], 'DETAILED MARKS REPORT');
  doc.font('Times-Roman').fontSize(10).text(`Academic Year ${d.academic_year}  |  Semester ${d.semester_no}`, { align: 'center' });
  doc.moveDown(0.8);
  infoBox(doc, [['Name', d.student.name], ['Roll No.', d.student.roll_no], ['Registration No.', d.student.registration_no], ['Course', d.student.course]]);
  for (const s of d.subjects) {
    if (doc.y + 40 + (s.rows.length + 2) * 18 + 22 > doc.page.height - M - 30) doc.addPage();
    doc.font('Times-Bold').fontSize(10.5).fillColor(INK).text(`${s.code}  ${s.name}  (${s.type}, scheme v${s.scheme_version})`, M, doc.y, { width: doc.page.width - M * 2 });
    doc.moveDown(0.3);
    const rows = s.rows.map((r) => ({
      comp: r.label, raw: r.raw === undefined || r.raw === null ? '-' : trimNum(r.raw), max: trimNum(r.raw_max),
      conv: r.contribution === undefined || r.contribution === null ? '' : fmt(r.contribution, 2),
      cmax: r.contribution_max === undefined || r.contribution_max === null ? '' : trimNum(r.contribution_max),
    }));
    const y = drawTable(doc, {
      startY: doc.y, fontSize: 8.8, rowHeight: 18, headerHeight: 22,
      columns: [
        { key: 'comp', label: 'Component', w: 40 }, { key: 'raw', label: 'Raw', w: 12, align: 'center' }, { key: 'max', label: 'Raw Max', w: 12, align: 'center' },
        { key: 'conv', label: 'Converted', w: 12, align: 'center' }, { key: 'cmax', label: 'Out of', w: 10, align: 'center' },
      ],
      rows,
      footerRow: { comp: `Final marks (grade ${s.letter_grade}, ${trimNum(s.credits)} credits)`, raw: '', max: '', conv: fmt(s.final_marks, 2), cmax: trimNum(s.final_max) },
    });
    doc.y = y + 14;
  }
  doc.font('Times-Italic').fontSize(8.5).fillColor('#333333').text('Detailed marks report. Unsigned and not an officially certified document.', M, doc.y);
  footer(doc, institution || '');
  return doc;
}

// Generic report table for the reports module (landscape).
function reportPdf(title, subtitle, columns, rows, institution) {
  const doc = new PDFDocument({ size: 'A4', layout: 'landscape', margins: { top: M, bottom: M, left: M, right: M }, bufferPages: true, info: { Title: title } });
  titleBlock(doc, [institution], title.toUpperCase());
  if (subtitle) { doc.font('Times-Roman').fontSize(9.5).fillColor(INK).text(subtitle, { align: 'center' }); doc.moveDown(0.6); }
  drawTable(doc, {
    startY: doc.y, fontSize: 8, rowHeight: 17, headerHeight: 22,
    columns: columns.map((c) => ({ key: c.key, label: c.label, w: c.w || 10, align: c.align })),
    rows: rows.map((r) => Object.fromEntries(columns.map((c) => [c.key, r[c.key]]))),
  });
  footer(doc, `Generated ${new Date().toISOString().slice(0, 10)}`);
  return doc;
}

module.exports = { gradeCardPdf, internalMarksheetPdf, detailedMarksPdf, reportPdf };
