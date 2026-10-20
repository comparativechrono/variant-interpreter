/* =====================================================================
   The evidence scale: the points of the criteria applied so far, on the
   line from benign to pathogenic, with the six bands of uncertain
   significance between. It moves as criteria are applied, so that the
   student sees what each criterion is worth.

   The line is made of one cell for each whole number of points, from
   −12 to +14 (beyond those, the marker stays at the end).
   ===================================================================== */
import { h } from '../core.js';

const MIN = -12, MAX = 14, N = MAX - MIN + 1;
const left = (v) => ((v - MIN) / N) * 100;              // the left edge of the cell of v
const centre = (v) => ((Math.max(MIN, Math.min(MAX, v)) - MIN + 0.5) / N) * 100;
const SEGS = [
  { from: MIN, to: -7, cls: 'b', label: 'Benign' },
  { from: -6, to: -1, cls: 'lb', label: 'Likely benign' },
  { from: 0, to: 0, cls: 'icecold', label: 'Uncertain (ice cold)', band: true },
  { from: 1, to: 1, cls: 'cold', label: 'Uncertain (cold)', band: true },
  { from: 2, to: 2, cls: 'cool', label: 'Uncertain (cool)', band: true },
  { from: 3, to: 3, cls: 'tepid', label: 'Uncertain (tepid)', band: true },
  { from: 4, to: 4, cls: 'warm', label: 'Uncertain (warm)', band: true },
  { from: 5, to: 5, cls: 'hot', label: 'Uncertain (hot)', band: true },
  { from: 6, to: 9, cls: 'lp', label: 'Likely pathogenic' },
  { from: 10, to: MAX, cls: 'p', label: 'Pathogenic' }
];
const WORD = { p: 'Pathogenic', lp: 'Likely pathogenic', vus: 'Uncertain significance', lb: 'Likely benign', b: 'Benign' };
const range = (s) => (s.from === MIN ? `${s.to} or fewer` : s.to === MAX ? `${s.from} or more` : s.from === s.to ? `${s.from}` : `${s.from} to ${s.to}`);

/** scale({result, bands}) → element, with .set(result) to move the marker */
export function scale(opts = {}) {
  const bands = opts.bands !== false;
  const track = h('div.scale-track');
  for (const s of SEGS) {
    if (!bands && s.band) continue;
    track.appendChild(h('div.scale-seg.s-' + s.cls, { style: { left: left(s.from) + '%', width: ((s.to - s.from + 1) / N) * 100 + '%' }, title: `${s.label}: ${range(s)} points` }));
  }
  if (!bands) track.appendChild(h('div.scale-seg.s-vus', { style: { left: left(0) + '%', width: (6 / N) * 100 + '%' }, title: 'Uncertain significance: 0 to 5 points' }));
  const ticks = h('div.scale-ticks', { 'aria-hidden': 'true' });
  for (const [v, text] of [[-6, '−6'], [0, '0'], [6, '+6'], [10, '+10']]) ticks.appendChild(h('span.scale-tick', { style: { left: left(v) + '%' } }, text));
  const marker = h('div.scale-marker', h('span.scale-pin'), h('span.scale-val'));
  // full names where the scale is wide; the short forms where it is narrow (CSS chooses)
  const name = (cls, at, long, short) => h('span.l-' + cls, { style: { left: centre(at) + '%' } }, h('span.l-long', long), h('span.l-short', short));
  const names = h('div.scale-labels', { 'aria-hidden': 'true' },
    name('b', -9.5, 'Benign', 'B'),
    name('lb', -3.5, 'Likely benign', 'LB'),
    name('vus', 2.5, 'Uncertain', 'VUS'),
    name('lp', 7.5, 'Likely pathogenic', 'LP'),
    name('p', 12, 'Pathogenic', 'P'));
  const live = h('div.visually-hidden', { 'aria-live': 'polite' });
  const el = h('div.scale', { role: 'img' }, names, h('div.scale-body', track, marker), ticks, live);
  let first = true;
  el.set = (r) => {
    const p = r && r.points != null ? r.points : 0;
    const cls = r ? r.cls : 'vus';
    marker.style.left = centre(p) + '%';
    marker.dataset.cls = cls;
    marker.querySelector('.scale-val').textContent = (p > 0 ? '+' : p < 0 ? '−' : '') + Math.abs(p);
    const label = `${WORD[cls]}${r && r.band ? ', ' + r.band.replace('icecold', 'ice cold') : ''}: ${p > 0 ? '+' : ''}${p} points`;
    el.setAttribute('aria-label', 'The evidence scale. ' + label);
    if (!first) live.textContent = label;
    first = false;
  };
  el.set(opts.result || { points: 0, cls: 'vus' });
  return el;
}

/** a small version for lists: a short line with a dot */
export function miniScale(points, cls) {
  const p = points == null ? 0 : points;
  return h('span.mini-scale', { title: `${p > 0 ? '+' : ''}${p} points`, 'aria-hidden': 'true' },
    h('span.mini-dot', { style: { left: centre(p) + '%' }, dataset: { cls: cls || 'vus' } }));
}
