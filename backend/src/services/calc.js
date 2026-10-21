// Pure calculation engine. No database access, so every rule can be unit tested.
// Raw marks and converted contributions are always kept separate.

class MarkError extends Error {}

function roundTo(value, decimals) {
  if (value === null || value === undefined || Number.isNaN(value)) return null;
  const d = Math.max(0, decimals | 0);
  return Number(Math.round(Number(value + 'e' + d)) + 'e-' + d);
}

const isMissing = (v) => v === null || v === undefined || v === '';

// Returns { ok, missing, error }.
function checkScore(score, max, label) {
  if (isMissing(score)) return { ok: false, missing: true };
  const n = Number(score);
  if (!Number.isFinite(n)) return { ok: false, error: `${label}: not a number` };
  if (n < 0) return { ok: false, error: `${label}: marks cannot be negative` };
  if (n > Number(max)) return { ok: false, error: `${label}: ${n} exceeds maximum ${max}` };
  return { ok: true, value: n };
}

function scale(score, rawMax, contribution) {
  return (score / rawMax) * contribution;
}

// scores: { CA1, CA2, ECA, WCA, ESE }  cfg: scheme config   wcaMax: teacher configured
function computeTheory(scores, cfg, wcaMax) {
  const need = [['CA1', cfg.ca_max], ['CA2', cfg.ca_max], ['ECA', cfg.eca_max], ['WCA', wcaMax], ['ESE', cfg.ese_max]];
  const missing = [];
  const errors = [];
  const vals = {};
  if (isMissing(wcaMax) || Number(wcaMax) <= 0) errors.push('WCA maximum is not configured');
  for (const [code, max] of need) {
    if (code === 'WCA' && (isMissing(wcaMax) || Number(wcaMax) <= 0)) continue;
    const r = checkScore(scores[code], max, code);
    if (r.missing) missing.push(code);
    else if (!r.ok) errors.push(r.error);
    else vals[code] = r.value;
  }
  const internalMax = cfg.ca_contribution + cfg.eca_contribution + cfg.wca_contribution;
  const base = { type: 'theory', missing, errors, internal_max: internalMax, final_max: internalMax + cfg.ese_contribution };
  if (missing.length || errors.length) return { ...base, complete: false };
  const ca = scale((vals.CA1 + vals.CA2) / 2, cfg.ca_max, cfg.ca_contribution);
  const eca = scale(vals.ECA, cfg.eca_max, cfg.eca_contribution);
  const wca = scale(vals.WCA, Number(wcaMax), cfg.wca_contribution);
  const ese = scale(vals.ESE, cfg.ese_max, cfg.ese_contribution);
  const internal = ca + eca + wca;
  return {
    ...base,
    complete: true,
    raw: { ...vals, wca_max: Number(wcaMax) },
    contributions: { CA: ca, ECA: eca, WCA: wca, ESE: ese },
    internal,
    final: internal + ese,
  };
}

function computePractical(scores, cfg) {
  const need = [['PCA1', cfg.pca_max], ['PCA2', cfg.pca_max], ['PESE', cfg.pese_max]];
  const missing = [];
  const errors = [];
  const vals = {};
  for (const [code, max] of need) {
    const r = checkScore(scores[code], max, code);
    if (r.missing) missing.push(code);
    else if (!r.ok) errors.push(r.error);
    else vals[code] = r.value;
  }
  const base = { type: 'practical', missing, errors, internal_max: cfg.pca_contribution, final_max: cfg.pca_contribution + cfg.pese_contribution };
  if (missing.length || errors.length) return { ...base, complete: false };
  const pca = scale((vals.PCA1 + vals.PCA2) / 2, cfg.pca_max, cfg.pca_contribution);
  const pese = scale(vals.PESE, cfg.pese_max, cfg.pese_contribution);
  return { ...base, complete: true, raw: vals, contributions: { PCA: pca, PESE: pese }, internal: pca, final: pca + pese };
}

// components: [{ code, label, raw_max, contribution_max, score }]
function computeSessional(components) {
  const errors = [];
  const missing = [];
  if (!components.length) errors.push('No sessional components are defined');
  const weightSum = components.reduce((a, c) => a + Number(c.contribution_max), 0);
  if (components.length && Math.abs(weightSum - 100) > 1e-9) errors.push(`Component weights add up to ${weightSum}, they must add up to 100`);
  const contributions = {};
  const raw = {};
  let total = 0;
  for (const c of components) {
    const r = checkScore(c.score, c.raw_max, c.code);
    if (r.missing) missing.push(c.code);
    else if (!r.ok) errors.push(r.error);
    else {
      raw[c.code] = r.value;
      contributions[c.code] = scale(r.value, Number(c.raw_max), Number(c.contribution_max));
      total += contributions[c.code];
    }
  }
  const base = { type: 'sessional', missing, errors, internal_max: 100, final_max: 100 };
  if (missing.length || errors.length) return { ...base, complete: false };
  return { ...base, complete: true, raw, contributions, internal: total, final: total };
}

// bands: [{letter,min_marks,grade_point,is_pass}] any order. passPercent from the grading scheme.
function gradeFor(finalMarks, bands, passPercent = 0) {
  if (finalMarks === null || finalMarks === undefined) return null;
  const sorted = [...bands].sort((a, b) => Number(b.min_marks) - Number(a.min_marks));
  const band = sorted.find((b) => finalMarks >= Number(b.min_marks));
  if (!band) return null;
  return {
    letter: band.letter,
    grade_point: Number(band.grade_point),
    is_pass: !!band.is_pass && finalMarks >= Number(passPercent),
  };
}

function creditPoints(credits, gradePoint) {
  if (isMissing(credits) || isMissing(gradePoint)) return null;
  return Number(credits) * Number(gradePoint);
}

// subjects: [{ credits, grade_point, result_status }]
// opts: { includeFailed: bool, decimals }
function computeSgpa(subjects, opts = {}) {
  const includeFailed = opts.includeFailed !== false;
  const decimals = opts.decimals ?? 2;
  const warnings = [];
  let credits = 0;
  let points = 0;
  let counted = 0;
  let anyFail = false;
  let anyIncomplete = false;
  for (const s of subjects) {
    if (s.result_status === 'incomplete' || isMissing(s.grade_point)) { anyIncomplete = true; continue; }
    if (s.result_status === 'fail') anyFail = true;
    if (isMissing(s.credits) || Number(s.credits) <= 0) {
      warnings.push(`${s.code || 'A subject'} has no credits configured and is excluded`);
      continue;
    }
    if (s.result_status === 'fail' && !includeFailed) continue;
    credits += Number(s.credits);
    points += Number(s.credits) * Number(s.grade_point);
    counted += 1;
  }
  const status = anyIncomplete ? 'incomplete' : anyFail ? 'fail' : 'pass';
  const sgpa = credits > 0 ? roundTo(points / credits, decimals) : null;
  if (credits === 0) warnings.push('Total credits are zero, SGPA is not available');
  return { total_credits: credits, total_credit_points: points, sgpa, status, subjects_counted: counted, warnings };
}

// semesters: [{ semester_no, subjects:[{code, credits, grade_point, result_status, order}] }]
// Repeated subjects: only the latest attempt (highest order) counts toward CGPA.
function computeCgpa(semesters, opts = {}) {
  const includeFailed = opts.includeFailed !== false;
  const decimals = opts.decimals ?? 2;
  const latest = new Map();
  for (const sem of semesters) {
    for (const s of sem.subjects) {
      if (s.result_status === 'incomplete' || isMissing(s.grade_point)) continue;
      const prev = latest.get(s.code);
      if (!prev || (s.order ?? 0) >= (prev.order ?? 0)) latest.set(s.code, s);
    }
  }
  let credits = 0;
  let points = 0;
  for (const s of latest.values()) {
    if (isMissing(s.credits) || Number(s.credits) <= 0) continue;
    if (s.result_status === 'fail' && !includeFailed) continue;
    credits += Number(s.credits);
    points += Number(s.credits) * Number(s.grade_point);
  }
  return { total_credits: credits, total_credit_points: points, cgpa: credits > 0 ? roundTo(points / credits, decimals) : null };
}

module.exports = {
  MarkError, roundTo, checkScore, computeTheory, computePractical, computeSessional,
  gradeFor, creditPoints, computeSgpa, computeCgpa, isMissing,
};
