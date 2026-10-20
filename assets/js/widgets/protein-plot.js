/* =====================================================================
   A protein's length with its domains, and ClinVar's variants along it:
   pathogenic above the line, benign below, the variant marked. Where
   pathogenic missense variants cluster with no benign ones is where a
   hotspot (PM1) may be.
   ===================================================================== */
import { h, esc, fmt } from '../core.js';

const NS = 'http://www.w3.org/2000/svg';
const svg = (tag, attrs = {}, ...kids) => {
  const el = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) if (v != null) el.setAttribute(k, v);
  for (const k of kids.flat()) if (k != null) el.appendChild(typeof k === 'string' ? document.createTextNode(k) : k);
  return el;
};
const DOMAIN_COLOURS = ['#5b8fb9', '#7aa874', '#c09a4d', '#9a7bb8', '#c47a6a', '#5aa6a6', '#a58c6f', '#7d8fb3'];
const P_RX = /^(Pathogenic|Likely pathogenic|Pathogenic\/Likely pathogenic)/;
const B_RX = /^(Benign|Likely benign|Benign\/Likely benign)$/;
const posOf = (c) => {
  const m = /^p\.[A-Z][a-z]{2}(\d+)/.exec(c.hgvsp || '');
  return m ? +m[1] : null;
};
const KIND = (c) => (/missense|inframe/.test(c.major_consequence || '') ? 'missense' : /stop_gained|frameshift|splice_donor|splice_acceptor|start_lost/.test(c.major_consequence || '') ? 'truncating' : /synonymous/.test(c.major_consequence || '') ? 'synonymous' : 'other');

/** proteinPlot({length, features, clinvar, variantPos, variantLabel, gene}) → element */
export function proteinPlot(opts) {
  const state = { kinds: { missense: true, truncating: true, other: false, synonymous: false }, vus: false, minStars: 1, regions: false };
  // the domains, coloured by name (repeats of a domain share a colour)
  const colourOf = new Map();
  const doms = (opts.features || []).filter((f) => f.kind === 'domain' || (f.kind === 'topo' && /Transmembrane|Intramembrane|Signal/.test(f.type)))
    .map((f) => {
      const k = f.kind === 'topo' ? f.type : f.description.replace(/\s+\d+$/, '');
      if (!colourOf.has(k)) colourOf.set(k, f.kind === 'topo' ? '#8c98a8' : DOMAIN_COLOURS[colourOf.size % DOMAIN_COLOURS.length]);
      return Object.assign({}, f, { colour: colourOf.get(k), key: k });
    });
  // UniProt's other regions (disordered stretches, binding regions, repeats...) overlap one
  // another, so they go in a strip of their own under the plot, packed into lanes
  const regions = (opts.features || []).filter((f) => f.kind === 'region' && f.end > f.start);
  const wrap = h('div.pplot');
  const controls = h('div.pplot-controls.small');
  const fig = h('figure.pplot-fig');
  const cap = h('figcaption.small.muted');
  const key = h('ul.pplot-key.small');
  wrap.append(controls, fig, key, cap);
  const chk = (label, on, fn) => {
    const b = h('input', { type: 'checkbox' });
    b.checked = on;
    b.addEventListener('change', () => fn(b.checked));
    return h('label.check', b, h('span', label));
  };
  controls.append(...[
    h('span', 'Show: '),
    chk('missense and in-frame', true, (x) => { state.kinds.missense = x; draw(); }),
    chk('truncating', true, (x) => { state.kinds.truncating = x; draw(); }),
    chk('synonymous and other', false, (x) => { state.kinds.other = x; state.kinds.synonymous = x; draw(); }),
    chk('uncertain (on the line)', false, (x) => { state.vus = x; draw(); }),
    regions.length ? chk(`other UniProt regions (${regions.length})`, false, (x) => { state.regions = x; draw(); }) : null].filter(Boolean));
  const draw = () => {
    fig.innerHTML = '';
    const L = Math.max(1, opts.length || 1);
    const W = 1000, padL = 20, padR = 20, axisY = 118, H = 236;
    const x = (p) => padL + ((Math.max(1, Math.min(L, p)) - 1) / Math.max(1, L - 1)) * (W - padL - padR);
    const root = svg('svg', { viewBox: `0 0 ${W} ${H}`, class: 'pplot-svg', role: 'img', 'aria-label': `${opts.gene || 'The protein'}, ${L} residues long, with its domains and ClinVar variants` });
    // the variants, counted by position and side
    const bins = new Map();
    const BIN = Math.max(1, Math.round(L / 220));
    let nP = 0, nB = 0, nV = 0;
    for (const c of opts.clinvar || []) {
      if ((c.gold_stars || 0) < state.minStars) continue;
      const k = KIND(c);
      if (!state.kinds[k]) continue;
      const p = posOf(c);
      if (p == null) continue;
      const side = P_RX.test(c.clinical_significance) ? 'p' : B_RX.test(c.clinical_significance) ? 'b' : /Uncertain|Conflicting/.test(c.clinical_significance) ? 'v' : null;
      if (!side || (side === 'v' && !state.vus)) continue;
      const key = `${side}:${Math.floor((p - 1) / BIN)}`;
      const b = bins.get(key) || { side, pos: p, n: 0, trunc: 0, items: [] };
      b.n++;
      if (k === 'truncating') b.trunc++;
      b.items.push(c);
      bins.set(key, b);
      if (side === 'p') nP++;
      else if (side === 'b') nB++;
      else nV++;
    }
    const maxN = Math.max(1, ...Array.from(bins.values()).map((b) => b.n));
    const stem = (n) => 14 + (Math.log(1 + n) / Math.log(1 + maxN)) * 72;
    for (const b of bins.values()) {
      const cx = x(b.pos);
      const len = stem(b.n);
      const y2 = b.side === 'p' ? axisY - 16 - len : b.side === 'b' ? axisY + 16 + len : axisY;
      const col = b.side === 'p' ? 'var(--c-p)' : b.side === 'b' ? 'var(--c-lb)' : 'var(--c-vus)';
      const g = svg('g', { class: 'pp-pin' });
      if (b.side !== 'v') g.appendChild(svg('line', { x1: cx, x2: cx, y1: b.side === 'p' ? axisY - 12 : axisY + 12, y2, stroke: col, 'stroke-width': 1.2, opacity: 0.7 }));
      const r = 2.5 + Math.min(5, Math.sqrt(b.n) * 1.4);
      const head = b.trunc > b.n / 2 ? svg('rect', { x: cx - r, y: y2 - r, width: r * 2, height: r * 2, fill: col, opacity: 0.9 }) : svg('circle', { cx, cy: y2, r, fill: col, opacity: 0.9 });
      g.appendChild(head);
      const names = b.items.slice(0, 6).map((c) => `${c.hgvsp || c.hgvsc} (${c.clinical_significance}${c.gold_stars ? ', ' + c.gold_stars + '★' : ''})`).join('\n');
      g.appendChild(svg('title', {}, `${b.n} variant${b.n === 1 ? '' : 's'} near residue ${b.pos}:\n${names}${b.items.length > 6 ? '\n…' : ''}`));
      root.appendChild(g);
    }
    // the protein and its domains (UniProt's Domain, Zinc finger, DNA binding,
    // and the membrane-spanning parts); their names are in the key below
    root.appendChild(svg('rect', { x: padL, y: axisY - 7, width: W - padL - padR, height: 14, rx: 4, fill: 'var(--sunk)', stroke: 'var(--line)' }));
    for (const f of doms) {
      const x1 = x(f.start), x2 = x(f.end);
      const g = svg('g');
      g.appendChild(svg('rect', { x: x1, y: axisY - 11, width: Math.max(2, x2 - x1), height: 22, rx: 4, fill: f.colour, opacity: 0.92 }));
      const room = Math.floor((x2 - x1 - 8) / 6.4);
      if (room >= 4) g.appendChild(svg('text', { x: (x1 + x2) / 2, y: axisY + 4, 'text-anchor': 'middle', 'font-size': 11, fill: '#fff', 'font-weight': 700 }, truncate(f.description, room)));
      g.appendChild(svg('title', {}, `${f.description}: residues ${f.start}–${f.end}`));
      root.appendChild(g);
    }
    // ticks
    const step = niceStep(L);
    for (let t = 0; t <= L; t += step) {
      const tx = x(Math.max(1, t));
      root.appendChild(svg('line', { x1: tx, x2: tx, y1: H - 22, y2: H - 17, stroke: 'var(--faint)' }));
      root.appendChild(svg('text', { x: tx, y: H - 6, 'text-anchor': 'middle', 'font-size': 10, fill: 'var(--muted)' }, String(Math.max(1, t))));
    }
    root.appendChild(svg('text', { x: padL, y: 12, 'font-size': 11, fill: 'var(--c-p)', 'font-weight': 700 }, `Pathogenic and likely pathogenic (${nP})`));
    root.appendChild(svg('text', { x: padL, y: H - 28, 'font-size': 11, fill: 'var(--c-lb)', 'font-weight': 700 }, `Benign and likely benign (${nB})`));
    // the variant
    if (opts.variantPos) {
      const vx = x(opts.variantPos);
      root.appendChild(svg('line', { x1: vx, x2: vx, y1: 20, y2: H - 30, stroke: 'var(--ink)', 'stroke-width': 1.5, 'stroke-dasharray': '3 3' }));
      root.appendChild(svg('path', { d: `M${vx - 7},${axisY - 26} L${vx + 7},${axisY - 26} L${vx},${axisY - 14} Z`, fill: 'var(--ink)' }));
      const lab = svg('text', { x: vx + (vx > W - 150 ? -8 : 8), y: 30, 'font-size': 12, 'font-weight': 700, fill: 'var(--ink)', 'text-anchor': vx > W - 150 ? 'end' : 'start' }, opts.variantLabel || `residue ${opts.variantPos}`);
      root.appendChild(lab);
    }
    fig.appendChild(root);
    if (state.regions && regions.length) fig.appendChild(regionStrip(regions, L, W, padL, padR, x));
    cap.textContent = `The ${opts.gene || ''} protein has ${L} residues. The plot shows ${nP} pathogenic or likely pathogenic and ${nB} benign or likely benign ClinVar variants with one star or more${state.vus ? `, and ${nV} of uncertain or conflicting significance on the line` : ''}. A square marks a pin where most of the variants are truncating. Point at a pin to see its variants.`;
  };
  const seenKey = new Set();
  for (const f of doms) {
    if (seenKey.has(f.key)) continue;
    seenKey.add(f.key);
    const same = doms.filter((d) => d.key === f.key);
    key.appendChild(h('li', h('span.pplot-swatch', { style: { background: f.colour } }), `${f.key} `, h('span.muted', same.map((d) => `${d.start}–${d.end}`).join(', '))));
  }
  draw();
  return wrap;
}

/** the regions, packed into lanes so that none overlaps another; each names itself on pointing */
function regionStrip(regions, L, W, padL, padR, x) {
  const lanes = [];
  const sorted = regions.slice().sort((a, b) => a.start - b.start || b.end - a.end);
  const placed = sorted.map((f) => {
    let lane = lanes.findIndex((end) => end < f.start);
    if (lane < 0) {
      lanes.push(0);
      lane = lanes.length - 1;
    }
    lanes[lane] = f.end + Math.ceil(L / 120);
    return { f, lane };
  });
  const laneH = 9, H = lanes.length * laneH + 18;
  const root = svg('svg', { viewBox: `0 0 ${W} ${H}`, class: 'pplot-svg', role: 'img', 'aria-label': `${regions.length} other regions from UniProt` });
  root.appendChild(svg('text', { x: padL, y: 11, 'font-size': 11, fill: 'var(--muted)', 'font-weight': 700 }, 'Other regions from UniProt. Point at one to see its name.'));
  for (const { f, lane } of placed) {
    const x1 = x(f.start), x2 = x(f.end);
    const dis = /disorder/i.test(f.description);
    const g = svg('g', { class: 'pp-reg' });
    g.appendChild(svg('rect', { x: x1, y: 16 + lane * laneH, width: Math.max(2, x2 - x1), height: laneH - 3, rx: 2, fill: dis ? '#c9d1db' : '#7d8fb3', opacity: dis ? 0.9 : 0.75 }));
    g.appendChild(svg('title', {}, `${f.description} (${f.type}): residues ${f.start}–${f.end}`));
    root.appendChild(g);
  }
  return root;
}
const truncate = (s, n) => (s.length > n ? s.slice(0, Math.max(1, n - 1)) + '…' : s);
function niceStep(L) {
  const raw = L / 8;
  const p = Math.pow(10, Math.floor(Math.log10(raw)));
  for (const m of [1, 2, 5, 10]) if (raw <= m * p) return m * p;
  return 10 * p;
}
