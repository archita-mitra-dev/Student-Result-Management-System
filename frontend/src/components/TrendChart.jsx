import React from 'react';

// SGPA by semester, drawn from real data. Plain SVG, no chart library.
export default function TrendChart({ points }) {
  const pts = points.filter((p) => p.value !== null && p.value !== undefined);
  if (pts.length < 2) return <p className="muted small">At least two published semesters are needed for a trend.</p>;
  const W = 520; const H = 190; const L = 36; const R = 12; const T = 12; const B = 34;
  const x = (i) => L + (i * (W - L - R)) / (pts.length - 1);
  const y = (v) => T + (1 - v / 10) * (H - T - B);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`SGPA trend: ${pts.map((p) => `${p.label} ${p.value}`).join(', ')}`} style={{ width: '100%', maxWidth: 560, height: 'auto' }}>
      {[0, 2, 4, 6, 8, 10].map((g) => (
        <g key={g}><line x1={L} x2={W - R} y1={y(g)} y2={y(g)} stroke="#d6d0c1" strokeWidth="1" /><text x={L - 6} y={y(g) + 4} fontSize="10" textAnchor="end" fill="#565a62">{g}</text></g>
      ))}
      <polyline fill="none" stroke="#1f4d3a" strokeWidth="2" points={pts.map((p, i) => `${x(i)},${y(p.value)}`).join(' ')} />
      {pts.map((p, i) => (
        <g key={p.label}>
          <circle cx={x(i)} cy={y(p.value)} r="3.5" fill="#1f4d3a" />
          <text x={x(i)} y={y(p.value) - 8} fontSize="10.5" textAnchor="middle" fill="#23262c">{p.value.toFixed(2)}</text>
          <text x={x(i)} y={H - 14} fontSize="10" textAnchor="middle" fill="#565a62">{p.label}</text>
        </g>
      ))}
    </svg>
  );
}
