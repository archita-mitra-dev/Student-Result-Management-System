const reports = require('../services/reports');
const { pagination } = require('../utils/http');

const h = {};
h.types = async (req, res) => res.json({ rows: reports.listTypes() });
h.run = async (req, res) => {
  const { limit, offset } = pagination(req.query, 50, 500);
  const out = await reports.run(req.params.type, req.query, req.user, { format: req.query.format || 'json', limit, offset });
  if (out.doc) {
    res.setHeader('Content-Type', out.contentType);
    res.setHeader('Content-Disposition', `attachment; filename="${out.filename}"`);
    out.doc.pipe(res); out.doc.end();
    return;
  }
  if (out.body) {
    res.setHeader('Content-Type', out.contentType);
    res.setHeader('Content-Disposition', `attachment; filename="${out.filename}"`);
    return res.send(out.body);
  }
  res.json(out);
};
module.exports = h;
