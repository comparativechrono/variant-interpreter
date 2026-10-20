/* =====================================================================
   A patient's genome at a glance: the 24 chromosomes, banded as on a
   karyotype (UCSC's cytoBandIdeo for the build, read once and kept),
   with the patient's variants beside them – a mark for a sequence
   variant, a bar for a copy-number variant – coloured by class.
   Without the bands (offline), the chromosomes are drawn plain, from
   their lengths and centromeres.
   ===================================================================== */
import { h, fetchWithTimeout } from '../core.js';
import { cacheGet, cachePut } from '../db.js';
import { ucscBase, UCSC_DB, CLASS_COLOURS } from './genome.js';
import { normChrom } from '../parse.js';

const NS = 'http://www.w3.org/2000/svg';
const svg = (tag, attrs = {}, ...kids) => {
  const el = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) if (v != null) el.setAttribute(k, v);
  for (const k of kids.flat()) if (k != null) el.appendChild(typeof k === 'string' ? document.createTextNode(k) : k);
  return el;
};

export const CHROMS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12', '13', '14', '15', '16', '17', '18', '19', '20', '21', '22', 'X', 'Y'];
/* lengths, and the middle of each centromere (in Mb), for drawing without the bands */
const LEN = {
  GRCh38: [248.96, 242.19, 198.3, 190.21, 181.54, 170.81, 159.35, 145.14, 138.39, 133.8, 135.09, 133.28, 114.36, 107.04, 101.99, 90.34, 83.26, 80.37, 58.62, 64.44, 46.71, 50.82, 156.04, 57.23],
  GRCh37: [249.25, 243.2, 198.02, 191.15, 180.92, 171.12, 159.14, 146.36, 141.21, 135.53, 135.01, 133.85, 115.17, 107.35, 102.53, 90.35, 81.2, 78.08, 59.13, 63.03, 48.13, 51.3, 155.27, 59.37]
};
const CEN = {
  GRCh38: [123.4, 93.9, 90.9, 50.0, 48.8, 59.8, 60.1, 45.2, 43.0, 39.8, 53.4, 35.5, 17.7, 17.2, 19.0, 36.8, 25.1, 18.5, 26.2, 28.1, 12.0, 15.0, 60.6, 10.4],
  GRCh37: [125.0, 93.3, 91.0, 50.4, 48.4, 61.0, 59.9, 45.6, 49.0, 40.2, 53.7, 35.8, 17.9, 17.6, 19.0, 36.6, 24.0, 17.2, 26.5, 27.5, 13.2, 14.7, 60.6, 12.5]
};
const STAIN = { gneg: '#ffffff', gpos25: '#c8c8c8', gpos33: '#b4b4b4', gpos50: '#969696', gpos66: '#787878', gpos75: '#646464', gpos100: '#1e1e1e', gvar: '#dcdcdc', stalk: '#e8e8e8', acen: '#b4505a' };

/** the bands of a build: { chrom: [[start, end, name, stain]] }, or null if they can't be had */
export async function bands(assembly) {
  const key = 'cytobands:' + assembly;
  const c = await cacheGet(key, 365);
  if (c) return c.value;
  if (typeof DecompressionStream === 'undefined') return null;
  try {
    const r = await fetchWithTimeout(`${ucscBase()}/goldenPath/${UCSC_DB[assembly] || 'hg38'}/database/cytoBandIdeo.txt.gz`, {}, 20000);
    const text = await new Response(r.body.pipeThrough(new DecompressionStream('gzip'))).text();
    const out = {};
    for (const line of text.split('\n')) {
      const f = line.split('\t');
      if (f.length < 5) continue;
      const ch = f[0].replace(/^chr/, '');
      if (!CHROMS.includes(ch)) continue;
      (out[ch] = out[ch] || []).push([+f[1], +f[2], f[3], f[4]]);
    }
    if (!Object.keys(out).length) return null;
    await cachePut(key, out);
    return out;
  } catch (e) {
    return null;
  }
}

/**
 * karyogram(holder, { assembly, marks: [{ chrom, start, end, cls, label, href, cnv }] })
 * Draws now (plain), then again with the bands when they arrive.
 */
export function karyogram(holder, opts) {
  const asm = opts.assembly === 'GRCh37' ? 'GRCh37' : 'GRCh38';
  const marks = (opts.marks || []).filter((m) => m && CHROMS.includes(normChrom(m.chrom)));
  const fig = h('figure.karyo');
  const cap = h('figcaption.small.muted');
  holder.append(fig, cap);
  const draw = (B) => {
    fig.innerHTML = '';
    // one row of 24 on a wide screen; two rows of 12 on a narrow one
    const rows = (holder.clientWidth || window.innerWidth || 1000) < 640 ? 2 : 1;
    const perRow = Math.ceil(CHROMS.length / rows);
    const W = rows === 1 ? 1000 : 520, top = 26, maxH = rows === 1 ? 250 : 210, colW = W / perRow, bw = rows === 1 ? 11 : 12;
    const rowH = top + maxH + 18;
    const maxLen = LEN[asm][0] * 1e6;
    let y0 = 0;
    const y = (bp) => y0 + top + (bp / maxLen) * maxH;
    const root = svg('svg', { viewBox: `0 0 ${W} ${rowH * rows + 8}`, class: 'karyo-svg', role: 'img', 'aria-label': `The patient’s variants on the chromosomes (${asm}): ${marks.length ? marks.map((m) => `${m.label} on chromosome ${normChrom(m.chrom)}`).join('; ') : 'none yet'}` });
    CHROMS.forEach((ch, i) => {
      y0 = Math.floor(i / perRow) * rowH;
      const x = (i % perRow) * colW + colW / 2 - bw / 2 - 5;
      const len = LEN[asm][i] * 1e6;
      const g = svg('g', { class: 'karyo-chr' });
      const clipId = `kc-${asm}-${ch}-${Math.random().toString(36).slice(2, 6)}`;
      const cen = (B && B[ch] ? (B[ch].find((b) => b[3] === 'acen') || [null, CEN[asm][i] * 1e6])[1] : CEN[asm][i] * 1e6);
      // the outline: two rounded arms, pinched at the centromere
      const clip = svg('clipPath', { id: clipId },
        svg('rect', { x, y: y(0), width: bw, height: y(cen) - y(0), rx: 5 }),
        svg('rect', { x, y: y(cen), width: bw, height: y(len) - y(cen), rx: 5 }));
      g.appendChild(clip);
      if (B && B[ch]) {
        for (const [s, e, , stain] of B[ch]) g.appendChild(svg('rect', { x, y: y(s), width: bw, height: Math.max(0.5, y(e) - y(s)), fill: STAIN[stain] || '#ddd', 'clip-path': `url(#${clipId})` }));
      } else g.appendChild(svg('rect', { x, y: y(0), width: bw, height: y(len) - y(0), fill: '#e3e7ec', 'clip-path': `url(#${clipId})` }));
      g.appendChild(svg('rect', { x, y: y(0), width: bw, height: y(cen) - y(0), rx: 5, fill: 'none', stroke: '#6b7787', 'stroke-width': 0.8 }));
      g.appendChild(svg('rect', { x, y: y(cen), width: bw, height: y(len) - y(cen), rx: 5, fill: 'none', stroke: '#6b7787', 'stroke-width': 0.8 }));
      g.appendChild(svg('text', { x: x + bw / 2, y: y0 + top - 9, 'text-anchor': 'middle', 'font-size': 12, 'font-weight': 700, fill: 'var(--ink-2)' }, ch));
      root.appendChild(g);
      // the variants on this chromosome
      const here = marks.filter((m) => normChrom(m.chrom) === ch);
      here.forEach((m, j) => {
        const col = CLASS_COLOURS[m.cls || 'none'] || CLASS_COLOURS.none;
        const a = svg('a', { href: m.href || null, class: 'karyo-mark' });
        const tip = svg('title', {}, `${m.label}${m.clsText ? ': ' + m.clsText : ''}`);
        if (m.cnv) {
          const xb = x + bw + 3 + (j % 2) * 7;
          a.append(svg('rect', { x: xb, y: y(m.start) - 1, width: 6, height: Math.max(5, y(m.end) - y(m.start) + 2), rx: 2, fill: col, stroke: '#fff', 'stroke-width': 0.6 }), tip);
        } else {
          const ym = y(m.start);
          a.append(svg('path', { d: `M${x + bw + 1.5},${ym} l11,-7 v14 z`, fill: col, stroke: '#fff', 'stroke-width': 0.8 }), tip);
        }
        root.appendChild(a);
      });
    });
    fig.appendChild(root);
    cap.textContent = `${marks.length ? `This shows the patient’s variants on ${asm}. Triangles mark sequence variants and bars mark copy-number variants. Red is pathogenic, blue is benign and brown is uncertain. Point at a variant to see its name, or click it to open it.` : `The patient’s variants will appear here, on ${asm}.`}${B ? '' : ' The chromosomes’ bands couldn’t be loaded, so they’re drawn plain.'}`;
  };
  draw(null);
  bands(asm).then((B) => B && fig.isConnected !== false && draw(B));
  return fig;
}

/** the band a position is in (e.g. 'q11.21'), from bands(): or '' if not known */
export function bandAt(B, chrom, pos) {
  const list = B && B[normChrom(chrom)];
  if (!list) return '';
  const b = list.find(([s, e]) => pos > s && pos <= e);
  return b ? b[2] : '';
}
/** a CNV as an ISCN microarray result, e.g. arr[GRCh38] 22q11.21(18912231_21465672)x1 (bands from bands(); without
    them, the band is left out) */
export function iscnOf(v, B) {
  const ch = normChrom(v.chrom);
  const a = bandAt(B, ch, v.start), b = bandAt(B, ch, v.end);
  const band = a && b ? (a === b ? a : a + b) : '';
  const cn = v.copyNumber != null ? v.copyNumber : v.cnvType === 'gain' ? 3 : 1;
  return `arr[${v.assembly || 'GRCh38'}] ${ch}${band}(${v.start}_${v.end})x${cn}`;
}
