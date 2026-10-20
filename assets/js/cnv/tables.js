/* =====================================================================
   The tables of a CNV's page and a region's page: the genes, ClinGen's
   curated regions, population CNVs and ClinVar's CNVs, each with the
   overlap that matters for the scoring.
   ===================================================================== */
import { h, fmt, fmtAF, oneIn } from '../core.js';
import { link } from '../router.js';
import { table, ext } from '../ui.js';
import { fmtRegion, fmtSize } from '../parse.js';
import { THRESH, dosageText } from '../genes.js';
import { clingenGeneUrl } from '../api/cnv-sources.js';
import { stars } from '../views/evidence-common.js';

const pct = (x) => (x == null ? '–' : x >= 0.995 ? '100%' : x < 0.01 && x > 0 ? '<1%' : `${Math.round(x * 100)}%`);
const DS_WORD = { 3: 'Sufficient', 2: 'Some', 1: 'Little', 0: 'None', 30: 'Recessive', 40: 'Unlikely' };
/** a ClinGen dosage score as a small badge */
export function dsBadge(score, kind) {
  if (score == null || score === '') return h('span.faint', '–');
  return h('span.ds.ds-' + score, { title: `ClinGen ${kind === 'ts' ? 'triplosensitivity' : 'haploinsufficiency'} ${score}: ${dosageText(score)}` }, `${score} ${DS_WORD[score] || ''}`.trim());
}
const n2 = (x, d = 2) => (x == null ? '–' : Number(x).toFixed(d));

/** where a gene lies against the CNV, in words */
export function placeText(g) {
  if (g.whole) return 'Whole gene';
  if (g.inside) return 'Within the gene';
  if (g.five && !g.three) return '5′ end';
  if (g.three && !g.five) return '3′ end';
  return 'Part';
}

/** the dosage summary line of a set of genes and regions: [text, …] */
export function dosageSummary(genes, regions, type) {
  const pc = genes.filter((g) => g.pc);
  const whole = pc.filter((g) => g.whole).length;
  const split = !pc.length ? '' : whole === pc.length ? (pc.length === 1 ? ' (whole)' : ` (all ${pc.length} whole)`) : !whole ? (pc.length === 1 ? ' (in part)' : ` (all ${pc.length} in part)`) : ` (${whole} whole, ${pc.length - whole} in part)`;
  const bits = [`${pc.length} protein-coding ${pc.length === 1 ? 'gene' : 'genes'}${split}`];
  const hi3 = pc.filter((g) => g.hi === 3), ts3 = pc.filter((g) => g.ts === 3);
  const reg = (regions || []).filter((r) => r.hi === 3 || r.ts === 3);
  if (hi3.length) bits.push(`${hi3.length} established haploinsufficient (ClinGen 3): ${hi3.slice(0, 5).map((g) => g.symbol).join(', ')}${hi3.length > 5 ? '…' : ''}`);
  if (ts3.length) bits.push(`${ts3.length} established triplosensitive (ClinGen 3): ${ts3.slice(0, 5).map((g) => g.symbol).join(', ')}${ts3.length > 5 ? '…' : ''}`);
  const pH = pc.filter((g) => g.pHaplo != null && g.pHaplo >= THRESH.pHaplo).length;
  const pT = pc.filter((g) => g.pTriplo != null && g.pTriplo >= THRESH.pTriplo).length;
  if (type !== 'gain' || pH) bits.push(`${pH} with pHaplo ≥ ${THRESH.pHaplo}`);
  if (type !== 'loss' || pT) bits.push(`${pT} with pTriplo ≥ ${THRESH.pTriplo}`);
  if (reg.length) bits.push(`${reg.length} established dosage-sensitive ${reg.length === 1 ? 'region' : 'regions'}`);
  return bits;
}

/** the genes, with quick filters: { el, update(genes) } */
export function genesTable(genes, opts = {}) {
  const state = { disease: false, mono: false, whole: false, dosage: false, nc: false };
  const wrap = h('div.cnv-genes');
  const bar = h('div.cnv-filters', { role: 'group', 'aria-label': 'Show only' });
  const count = h('span.small.muted', { 'aria-live': 'polite' });
  const chk = (key, label, title) => {
    const b = h('input', { type: 'checkbox' });
    b.addEventListener('change', () => {
      state[key] = b.checked;
      redraw();
    });
    return h('label.check.cnv-filter', { title }, b, h('span', label));
  };
  bar.append(h('span.small.muted', 'Show only:'),
    chk('disease', 'Disease-associated', 'Genes linked to a disease by ClinGen’s gene–disease validity (moderate or stronger), Gene2Phenotype, ClinGen’s dosage curation or HPO’s disease annotations'),
    chk('mono', 'Monoallelic disease', 'Genes whose disease needs only one changed copy (dominant or X-linked), according to ClinGen’s or Gene2Phenotype’s curations or HPO’s annotations'),
    chk('dosage', 'Dosage-sensitive', `Genes with a ClinGen haploinsufficiency or triplosensitivity score of 1 to 3, or with pHaplo ≥ ${THRESH.pHaplo} or pTriplo ≥ ${THRESH.pTriplo}`),
    chk('whole', 'Whole genes', 'Genes that lie wholly within the region'),
    count);
  let rows = genes.slice();
  const view = () => rows.filter((g) => (state.nc || g.pc)
    && (!state.disease || g.disease || (g.hpoDiseases || 0) > 0)
    && (!state.mono || g.monoallelic)
    && (!state.whole || g.whole)
    && (!state.dosage || [1, 2, 3].includes(g.hi) || [1, 2, 3].includes(g.ts) || (g.pHaplo != null && g.pHaplo >= THRESH.pHaplo) || (g.pTriplo != null && g.pTriplo >= THRESH.pTriplo)));
  const strong = (cond, text, title) => (cond ? h('b', { title }, text) : h('span', { title }, text));
  const cols = [
    { key: 'symbol', label: 'Gene', fmt: (g) => h('span', h('a.gene', { href: link('/gene/' + encodeURIComponent(g.symbol)), title: g.name }, g.symbol), g.pc ? null : h('span.tag', { style: { marginLeft: '6px' } }, 'non-coding')), sort: (g) => g.start },
    { key: 'place', label: 'In the region', fmt: (g) => h('span' + (g.whole ? '' : '.cnv-part'), placeText(g)), sort: (g) => (g.whole ? 0 : 1) },
    { key: 'hi', label: 'Haplo­insufficiency', fmt: (g) => h('span.cnv-ds', dsBadge(g.hi, 'hi'), g.pHaplo != null ? strong(g.pHaplo >= THRESH.pHaplo, `pHaplo ${n2(g.pHaplo)}`, 'The chance that the gene is haploinsufficient (Collins et al. 2022)') : null), sort: (g) => (g.hi === 3 ? 10 : g.hi === 2 ? 9 : g.hi === 1 ? 8 : 0) + (g.pHaplo || 0) },
    { key: 'ts', label: 'Triplo­sensitivity', fmt: (g) => h('span.cnv-ds', dsBadge(g.ts, 'ts'), g.pTriplo != null ? strong(g.pTriplo >= THRESH.pTriplo, `pTriplo ${n2(g.pTriplo)}`, 'The chance that the gene is triplosensitive (Collins et al. 2022)') : null), sort: (g) => (g.ts === 3 ? 10 : g.ts === 2 ? 9 : g.ts === 1 ? 8 : 0) + (g.pTriplo || 0) },
    { key: 'loeuf', label: 'LOEUF', num: true, fmt: (g) => (g.loeuf == null ? h('span.faint', '–') : strong(g.loeuf < THRESH.loeuf, n2(g.loeuf), 'The upper bound of observed/expected loss-of-function variants in gnomAD v4.1. A low value means the gene is intolerant.')), sort: (g) => (g.loeuf == null ? 9 : g.loeuf) },
    { key: 'pLI', label: 'pLI', num: true, fmt: (g) => (g.pLI == null ? h('span.faint', '–') : strong(g.pLI >= THRESH.pLI, n2(g.pLI), 'The chance that the gene is intolerant of loss of function (gnomAD v4.1)')), sort: (g) => -(g.pLI || 0) },
    { key: 'disease', label: 'Disease', fmt: (g) => diseaseCell(g), sort: (g) => (g.validity ? ['Definitive', 'Strong', 'Moderate', 'Limited'].indexOf(g.validity.classification) + 1 || 9 : g.g2p.length ? 5 : 9) }
  ];
  const t = table(cols, view(), { sortable: true, compact: true, caption: opts.caption || 'Genes in the region', empty: 'No genes match these filters.' });
  t.classList.add('cnv-gene-table');
  const redraw = () => {
    const v = view();
    t.redraw(v);
    const all = rows.filter((g) => state.nc || g.pc).length;
    count.textContent = v.length === all ? `${all} ${all === 1 ? 'gene' : 'genes'}` : `${v.length} of ${all} genes`;
  };
  wrap.append(bar, t);
  redraw();
  wrap.update = (gs) => {
    rows = gs.slice();
    redraw();
  };
  return wrap;
}
function diseaseCell(g) {
  const bits = [];
  if (g.validity) bits.push(h('div', h('span.tag' + (/Definitive|Strong/.test(g.validity.classification) ? '.ok' : /Moderate/.test(g.validity.classification) ? '' : '.warn'), g.validity.classification), ' ', ext(g.validity.url, g.validity.disease), g.validity.moi ? h('span.muted', ` (${g.validity.moi})`) : null));
  const gp = (g.g2p || [])[0];
  if (gp) bits.push(h('div.small', 'G2P: ', ext(gp.url, gp.disease), h('span.muted', ` (${gp.confidence}, ${String(gp.allelic || '').replace(/_/g, ' ')})`)));
  if (!bits.length && (g.hiDisease || g.tsDisease)) bits.push(h('div.small', diseaseName(g)));
  if (!bits.length && g.hpoDiseases) bits.push(h('div.small.muted', `${g.hpoDiseases} ${g.hpoDiseases === 1 ? 'disease' : 'diseases'} in HPO’s annotations`));
  return bits.length ? h('div', bits) : h('span.faint', '–');
}

/** ClinGen's curated regions overlapping a stretch */
export function regionsTable(regions, opts = {}) {
  return table([
    { key: 'name', label: 'Region', fmt: (r) => h('div', ext(r.url, r.name || r.id), h('div.small.muted', `${r.id}${r.cytoband ? ', ' + r.cytoband : ''}`)) },
    { key: 'hi', label: 'Haploinsufficiency', fmt: (r) => dsBadge(r.hi, 'hi') },
    { key: 'ts', label: 'Triplosensitivity', fmt: (r) => dsBadge(r.ts, 'ts') },
    { key: 'over', label: opts.of || 'Overlap', fmt: (r) => (r.whole && r.inside ? 'The same stretch' : r.whole ? 'All of the region' : r.inside ? 'Lies within it' : `${pct(r.coverOfRegion)} of the region`) },
    { key: 'where', label: 'Where', fmt: (r) => h('span.small', fmtRegion(r.chrom || opts.chrom, r.start, r.end), h('span.muted', ` (${fmtSize(r.end - r.start + 1)})`)) },
    { key: 'date', label: 'Curated', fmt: (r) => h('span.small', r.date || '–') }
  ], regions, { compact: true, caption: 'ClinGen’s curated regions', empty: 'ClinGen hasn’t curated any region here.' });
}

/** population CNVs (gnomAD or DGV) */
export function popTable(list, opts = {}) {
  const dgv = opts.kind === 'dgv';
  return table([
    { key: 'id', label: dgv ? 'DGV variant' : 'gnomAD variant', fmt: (x) => h('span', ext(x.url, x.id), x.filters && x.filters.length ? h('span.tag.warn', { style: { marginLeft: '6px' }, title: 'Did not pass all of gnomAD’s filters' }, x.filters.join(', ').toLowerCase()) : null) },
    { key: 'type', label: 'Kind', fmt: (x) => h('span.tag.' + (x.type === 'gain' ? 'gain' : x.type === 'loss' ? 'loss' : 'accent'), x.type === 'both' ? 'gain or loss' : x.type) },
    { key: 'size', label: 'Size', num: true, fmt: (x) => fmtSize(x.size), sort: (x) => x.size },
    { key: 'cov', label: (opts.labels || [])[0] || 'Covers this CNV', num: true, fmt: (x) => pct(x.coverOfCnv), sort: (x) => -x.coverOfCnv },
    { key: 'of', label: (opts.labels || [])[1] || 'Of theirs within it', num: true, fmt: (x) => pct(x.coverOfTheirs), sort: (x) => -x.coverOfTheirs },
    { key: 'af', label: 'Frequency', num: true, fmt: (x) => (x.af == null ? '–' : h('span.af2', h('span' + (x.af >= 0.01 ? '.cnv-common' : ''), x.af >= 0.001 ? `${(x.af * 100).toFixed(x.af >= 0.1 ? 0 : 2)}%` : fmtAF(x.af)), x.af ? h('span.muted.small', oneIn(x.af)) : null)), sort: (x) => -(x.af || 0) },
    dgv ? { key: 'tested', label: 'People', num: true, fmt: (x) => (x.tested ? `${fmt(x.carriers)} of ${fmt(x.tested)}` : '–'), sort: (x) => -(x.tested || 0) } : { key: 'hom', label: 'Homozygotes', num: true, fmt: (x) => fmt(x.hom) }
  ], list, { sortable: true, compact: true, caption: opts.caption || 'Population CNVs', empty: opts.empty || 'None.' });
}

const CV_TEXT = { p: 'Pathogenic', lp: 'Likely pathogenic', vus: 'Uncertain significance', lb: 'Likely benign', b: 'Benign', conflict: 'Conflicting', other: 'Other' };
/** ClinVar's CNVs */
export function clinvarTable(list, opts = {}) {
  return table([
    { key: 'id', label: 'ClinVar', fmt: (x) => h('div', ext(x.url, x.id), x.cytogenetic ? h('div.small.muted', x.cytogenetic) : null) },
    { key: 'type', label: 'Kind and size', fmt: (x) => h('div', h('span.tag.' + x.type, x.type + (x.copies != null ? ` ×${x.copies}` : '')), h('div.small', x.size ? fmtSize(x.size) : '–')), sort: (x) => x.size || 0 },
    { key: 'cov', label: (opts.labels || [])[0] || 'Covers this CNV', num: true, fmt: (x) => pct(x.coverOfCnv), sort: (x) => -(x.coverOfCnv || 0) },
    { key: 'of', label: (opts.labels || [])[1] || 'Of theirs within it', num: true, fmt: (x) => pct(x.coverOfTheirs), sort: (x) => -(x.coverOfTheirs || 0) },
    { key: 'cls', label: 'Classification', fmt: (x) => h('div', h('span.cnv-cv.cv-' + x.cls, x.clinSign || CV_TEXT[x.cls]), x.stars != null ? h('div', stars(x.stars)) : null), sort: (x) => ['p', 'lp', 'conflict', 'vus', 'lb', 'b', 'other'].indexOf(x.cls) },
    { key: 'cond', label: 'Condition and origin', fmt: (x) => h('div.small', x.conditions.slice(0, 2).join('; ') || h('span.faint', 'not given'), x.origin && x.origin !== 'not provided' ? h('div.muted', x.origin) : null) }
  ], list, { sortable: true, compact: true, caption: opts.caption || 'ClinVar’s copy-number variants', empty: opts.empty || 'None match.' });
}

/** a gene's disease, by name where the curations give one */
export function diseaseName(g) {
  if (g.validity && g.validity.disease) return ext(g.validity.url, g.validity.disease);
  if (g.g2p && g.g2p[0]) return ext(g.g2p[0].url, g.g2p[0].disease);
  const d = g.hiDisease || g.tsDisease || '';
  if (/^MONDO:\d+$/.test(d)) return ext(`https://monarchinitiative.org/${d}`, d);
  return d ? h('span', d) : h('span.faint', '–');
}

/** counts of ClinVar's CNVs by class: [['p', n], …] */
export function clinvarCounts(list) {
  const out = {};
  for (const x of list) out[x.cls] = (out[x.cls] || 0) + 1;
  return ['p', 'lp', 'vus', 'conflict', 'lb', 'b', 'other'].filter((k) => out[k]).map((k) => [k, out[k], CV_TEXT[k]]);
}
export { pct, CV_TEXT };
