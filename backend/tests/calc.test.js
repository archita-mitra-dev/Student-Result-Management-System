const test = require('node:test');
const assert = require('node:assert/strict');
const c = require('../src/services/calc');

const THEORY = { ca_max: 25, ca_contribution: 10, eca_max: 70, eca_contribution: 10, wca_contribution: 10, ese_max: 70, ese_contribution: 70 };
const PRACT = { pca_max: 40, pca_contribution: 40, pese_max: 60, pese_contribution: 60 };
const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-9, `${a} != ${b}`);

test('CA1/CA2 are averaged then converted to 10, not counted as 25 each', () => {
  const r = c.computeTheory({ CA1: 20, CA2: 25, ECA: 0, WCA: 0, ESE: 0 }, THEORY, 20);
  near(r.contributions.CA, ((20 + 25) / 2 / 25) * 10);
});

test('ECA 70 raw converts to 10 and is separate from end-sem', () => {
  const r = c.computeTheory({ CA1: 0, CA2: 0, ECA: 70, WCA: 0, ESE: 0 }, THEORY, 20);
  near(r.contributions.ECA, 10);
  near(r.contributions.ESE, 0);
  near(r.final, 10);
  const half = c.computeTheory({ CA1: 0, CA2: 0, ECA: 35, WCA: 0, ESE: 0 }, THEORY, 20);
  near(half.contributions.ECA, 5);
});

test('WCA converts using the configured maximum', () => {
  const r = c.computeTheory({ CA1: 0, CA2: 0, ECA: 0, WCA: 15, ESE: 0 }, THEORY, 20);
  near(r.contributions.WCA, 7.5);
  const r2 = c.computeTheory({ CA1: 0, CA2: 0, ECA: 0, WCA: 15, ESE: 0 }, THEORY, 30);
  near(r2.contributions.WCA, 5);
});

test('theory final marks maximum is 100 and internal max is 30', () => {
  const r = c.computeTheory({ CA1: 25, CA2: 25, ECA: 70, WCA: 20, ESE: 70 }, THEORY, 20);
  near(r.final, 100);
  near(r.internal, 30);
  assert.equal(r.final_max, 100);
});

test('theory worked example', () => {
  const r = c.computeTheory({ CA1: 22, CA2: 18, ECA: 56, WCA: 16, ESE: 49 }, THEORY, 20);
  near(r.contributions.CA, 8);
  near(r.contributions.ECA, 8);
  near(r.contributions.WCA, 8);
  near(r.contributions.ESE, 49);
  near(r.final, 73);
});

test('practical: PCA averaged out of 40 plus end-sem out of 60', () => {
  const r = c.computePractical({ PCA1: 30, PCA2: 40, PESE: 45 }, PRACT);
  near(r.contributions.PCA, 35);
  near(r.final, 80);
  near(c.computePractical({ PCA1: 40, PCA2: 40, PESE: 60 }, PRACT).final, 100);
});

test('sessional: configurable components weighted to 100', () => {
  const comps = [
    { code: 'ASG', raw_max: 10, contribution_max: 30, score: 8 },
    { code: 'PRJ', raw_max: 50, contribution_max: 50, score: 40 },
    { code: 'ATT', raw_max: 20, contribution_max: 20, score: 20 },
  ];
  const r = c.computeSessional(comps);
  near(r.final, 24 + 40 + 20);
  assert.ok(r.complete);
});

test('sessional weights that do not add up to 100 are rejected', () => {
  const r = c.computeSessional([{ code: 'A', raw_max: 10, contribution_max: 60, score: 5 }]);
  assert.equal(r.complete, false);
  assert.match(r.errors[0], /add up to 60/);
});

test('missing marks never produce a final result', () => {
  const r = c.computeTheory({ CA1: 10, CA2: null, ECA: 50, WCA: 10, ESE: 40 }, THEORY, 20);
  assert.equal(r.complete, false);
  assert.deepEqual(r.missing, ['CA2']);
  assert.equal(r.final, undefined);
});

test('negative marks and marks above the maximum are rejected', () => {
  assert.equal(c.checkScore(-1, 25, 'CA1').ok, false);
  assert.equal(c.checkScore(26, 25, 'CA1').ok, false);
  assert.equal(c.checkScore(25, 25, 'CA1').ok, true);
  const r = c.computeTheory({ CA1: 26, CA2: 10, ECA: 10, WCA: 10, ESE: 10 }, THEORY, 20);
  assert.equal(r.complete, false);
  assert.match(r.errors[0], /exceeds/);
});

test('missing WCA maximum blocks theory calculation', () => {
  const r = c.computeTheory({ CA1: 1, CA2: 1, ECA: 1, WCA: 1, ESE: 1 }, THEORY, null);
  assert.equal(r.complete, false);
});

test('rounding policy is applied once and is half-up', () => {
  assert.equal(c.roundTo(72.345, 2), 72.35);
  assert.equal(c.roundTo(1.005, 2), 1.01);
  assert.equal(c.roundTo(72.5, 0), 73);
  assert.equal(c.roundTo(null, 2), null);
});

const BANDS = [
  { letter: 'O', min_marks: 90, grade_point: 10, is_pass: true },
  { letter: 'E', min_marks: 80, grade_point: 9, is_pass: true },
  { letter: 'A', min_marks: 70, grade_point: 8, is_pass: true },
  { letter: 'B', min_marks: 60, grade_point: 7, is_pass: true },
  { letter: 'C', min_marks: 50, grade_point: 6, is_pass: true },
  { letter: 'D', min_marks: 40, grade_point: 5, is_pass: true },
  { letter: 'F', min_marks: 0, grade_point: 0, is_pass: false },
];

test('grade and grade point come from configured bands', () => {
  assert.deepEqual(c.gradeFor(73, BANDS, 40), { letter: 'A', grade_point: 8, is_pass: true });
  assert.equal(c.gradeFor(90, BANDS, 40).letter, 'O');
  assert.equal(c.gradeFor(39.99, BANDS, 40).is_pass, false);
  assert.equal(c.gradeFor(null, BANDS), null);
});

test('credit points = credit x grade point; missing credit gives null', () => {
  assert.equal(c.creditPoints(4, 8), 32);
  assert.equal(c.creditPoints(null, 8), null);
});

test('SGPA = sum(credit x gp) / sum(credit)', () => {
  const r = c.computeSgpa([
    { credits: 3, grade_point: 5, result_status: 'pass' },
    { credits: 4, grade_point: 8, result_status: 'pass' },
    { credits: 4, grade_point: 9, result_status: 'pass' },
  ]);
  near(r.total_credits, 11);
  near(r.total_credit_points, 15 + 32 + 36);
  assert.equal(r.sgpa, 7.55);
  assert.equal(r.status, 'pass');
});

test('SGPA with missing credits excludes subject and warns', () => {
  const r = c.computeSgpa([
    { code: 'X1', credits: null, grade_point: 9, result_status: 'pass' },
    { credits: 4, grade_point: 8, result_status: 'pass' },
  ]);
  assert.equal(r.sgpa, 8);
  assert.equal(r.warnings.length, 1);
});

test('SGPA division by zero returns null instead of NaN', () => {
  const r = c.computeSgpa([]);
  assert.equal(r.sgpa, null);
  const r2 = c.computeSgpa([{ credits: 0, grade_point: 8, result_status: 'pass' }]);
  assert.equal(r2.sgpa, null);
});

test('incomplete subject makes semester incomplete, failed subject makes it fail', () => {
  assert.equal(c.computeSgpa([{ credits: 4, grade_point: null, result_status: 'incomplete' }, { credits: 4, grade_point: 8, result_status: 'pass' }]).status, 'incomplete');
  assert.equal(c.computeSgpa([{ credits: 4, grade_point: 0, result_status: 'fail' }, { credits: 4, grade_point: 8, result_status: 'pass' }]).status, 'fail');
});

test('failed subjects can be excluded by configuration', () => {
  const subs = [{ credits: 4, grade_point: 0, result_status: 'fail' }, { credits: 4, grade_point: 8, result_status: 'pass' }];
  assert.equal(c.computeSgpa(subs, { includeFailed: true }).sgpa, 4);
  assert.equal(c.computeSgpa(subs, { includeFailed: false }).sgpa, 8);
});

test('CGPA is credit weighted, not an average of SGPAs', () => {
  const sems = [
    { semester_no: 1, subjects: [{ code: 'A', credits: 2, grade_point: 10, result_status: 'pass', order: 1 }] },
    { semester_no: 2, subjects: [{ code: 'B', credits: 8, grade_point: 6, result_status: 'pass', order: 2 }] },
  ];
  const r = c.computeCgpa(sems);
  assert.equal(r.cgpa, 6.8); // (20+48)/10, a simple average of SGPAs would give 8
});

test('CGPA counts only the latest attempt of a repeated subject', () => {
  const sems = [
    { semester_no: 1, subjects: [{ code: 'A', credits: 4, grade_point: 0, result_status: 'fail', order: 1 }] },
    { semester_no: 3, subjects: [{ code: 'A', credits: 4, grade_point: 6, result_status: 'pass', order: 3 }] },
  ];
  assert.equal(c.computeCgpa(sems).cgpa, 6);
  assert.equal(c.computeCgpa([]).cgpa, null);
});
