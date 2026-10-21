const { query } = require('../db/pool');

async function getSettings(client) {
  const q = client ? client.query.bind(client) : query;
  const { rows } = await q('SELECT key, value FROM system_settings');
  const out = {};
  for (const r of rows) out[r.key] = r.value;
  return out;
}

async function getGrading(client) {
  const q = client ? client.query.bind(client) : query;
  const s = (await q('SELECT * FROM grading_schemes WHERE is_active')).rows[0];
  if (!s) return null;
  const bands = (await q('SELECT letter, min_marks, grade_point, is_pass FROM grading_bands WHERE scheme_id=$1 ORDER BY min_marks DESC', [s.id])).rows;
  return { scheme: s, bands };
}

module.exports = { getSettings, getGrading };
