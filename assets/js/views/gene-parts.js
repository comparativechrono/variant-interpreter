/* =====================================================================
   Pieces of the gene page: the gene's predictive scores as gauges with
   their thresholds, the patients in this browser with a variant in the
   gene, and ClinVar's review stars.
   ===================================================================== */
import { h, fmt } from '../core.js';
import { ext } from '../ui.js';
import { THRESH } from '../genes.js';
import * as db from '../db.js';
import { summariseVariant } from '../summary.js';
import { normChrom } from '../parse.js';

/**
 * one score on a line, with the stretch of the line that meets a threshold shaded:
 * { label, value, min, max, zone: [from, to], zoneText, verdict: [met, not met], digits, extra }
 */
export function gaugeRow(o) {
  const v = o.value;
  const has = v != null && !isNaN(v);
  const span = o.max - o.min;
  const pos = (x) => Math.max(0, Math.min(100, ((Math.max(o.min, Math.min(o.max, x)) - o.min) / span) * 100));
  const met = has && v >= o.zone[0] && v <= o.zone[1];
  const valText = has ? fmt(v, o.digits == null ? 2 : o.digits) : 'not available';
  const track = h('div.gauge-track', { role: 'img', 'aria-label': has ? `${o.label} ${valText}, on a line from ${o.min} to ${o.max}; ${o.zoneText}` : `${o.label}: not available` },
    h('span.gauge-zone', { style: { left: pos(o.zone[0]) + '%', width: pos(o.zone[1]) - pos(o.zone[0]) + '%' } }),
    has ? h('span.gauge-dot' + (met ? '.met' : ''), { style: { left: pos(v) + '%' } }) : null);
  return h('div.gauge',
    h('div.gauge-h',
      h('span.gauge-l', o.label),
      h('span.gauge-v' + (has ? '' : '.faint'), valText),
      has && o.verdict ? h('span.tag' + (met ? '.accent' : ''), met ? o.verdict[0] : o.verdict[1]) : null),
    track,
    h('div.gauge-s', h('span', String(o.min)), h('span.gauge-zt', o.zoneText), h('span', String(o.max))),
    o.extra ? h('div.small.muted', o.extra) : null);
}

/** the gene's constraint and dosage predictions, with what each means */
export function scoreGauges(g) {
  const box = h('div.gauges');
  box.append(
    gaugeRow({
      label: 'LOEUF', value: g.loeuf, min: 0, max: 2, zone: [0, THRESH.loeuf - 1e-9], zoneText: `below ${THRESH.loeuf}: constrained`,
      verdict: ['constrained', 'not constrained'],
      extra: g.loeuf != null ? `It’s in decile ${g.loeufDecile != null ? g.loeufDecile + 1 : '–'} of 10, where 1 is the most constrained. ${g.lofObs != null ? `gnomAD sees ${fmt(g.lofObs)} loss-of-function variants, against ${fmt(g.lofExp, 1)} expected.` : ''}` : 'gnomAD gives no constraint for this gene. That’s often because it’s on the X or Y chromosome, or has too few expected variants.'
    }),
    gaugeRow({ label: 'pLI', value: g.pLI, min: 0, max: 1, zone: [THRESH.pLI, 1], zoneText: `${THRESH.pLI} or more: intolerant`, verdict: ['intolerant of loss of function', 'not intolerant'] }),
    gaugeRow({
      label: 'Missense Z', value: g.misZ, min: -5, max: 10, zone: [THRESH.misZ, 10], zoneText: `above ${THRESH.misZ}: missense-constrained`, verdict: ['missense-constrained', 'not missense-constrained'],
      extra: g.misOE != null ? `Observed/expected missense variants: ${fmt(g.misOE, 2)}.` : null
    }),
    gaugeRow({ label: 'pHaplo', value: g.pHaplo, min: 0, max: 1, zone: [THRESH.pHaplo, 1], zoneText: `${THRESH.pHaplo} or more: likely haploinsufficient`, verdict: ['likely haploinsufficient', 'not predicted haploinsufficient'] }),
    gaugeRow({ label: 'pTriplo', value: g.pTriplo, min: 0, max: 1, zone: [THRESH.pTriplo, 1], zoneText: `${THRESH.pTriplo} or more: likely triplosensitive`, verdict: ['likely triplosensitive', 'not predicted triplosensitive'] }),
    h('details.gauge-help',
      h('summary', 'What these scores mean'),
      h('dl.small',
        h('dt', 'LOEUF'), h('dd', 'This compares how many loss-of-function variants the people in gnomAD carry in the gene with how many would be expected by chance. It’s the upper end of the 90% confidence interval of observed/expected. A low value means people rarely carry one, so losing a copy is likely to be harmful. gnomAD v4 suggests below 0.6 as constrained.'),
        h('dt', 'pLI'), h('dd', 'This is the probability that the gene is intolerant of losing one copy, worked out from the same counts. A value of 0.9 or more counts as intolerant. LOEUF is the better measure, because it’s continuous.'),
        h('dt', 'Missense Z'), h('dd', 'This measures how many fewer missense variants gnomAD sees than expected, as a Z score. Above 3.09 the gene tolerates few missense changes, which is one of the conditions for PP2.'),
        h('dt', 'pHaplo and pTriplo'), h('dd', 'These are Collins et al.’s (2022) estimates of the probability that losing a copy (pHaplo) or gaining one (pTriplo) causes disease, based on large studies of CNVs. At 0.86 and 0.94 the odds are as high as for genes ClinGen has curated as dosage-sensitive. They help with CNVs, for example with 2H in the CNV guidelines.')),
      h('p.small.muted', 'None of these is a criterion by itself. They tell you how a gene usually behaves, which gives you a reason to look for a mechanism, or to doubt one.')));
  return box;
}

/** ClinVar's review status as stars, with words for screen readers */
export const starsEl = (n) => h('span.stars', { title: `${n} of 4 stars`, 'aria-label': `${n} of 4 stars` }, '★'.repeat(n) + '☆'.repeat(Math.max(0, 4 - n)));

/**
 * the patients in this browser with a variant in the gene: their sequence variants in it, and CNVs (on GRCh38) that
 * cover it, whole or in part. → [{ p (patient), v (variant), s (summariseVariant), hit: 'sequence'|'cnv-whole'|'cnv-part' }]
 */
export async function genePatients(g) {
  const [ps, vs] = await Promise.all([db.listPatients(), db.allVariants()]);
  const byId = new Map(ps.map((x) => [x.id, x]));
  const rows = [];
  for (const v of vs) {
    const p = byId.get(v.patientId);
    if (!p) continue;
    let hit = null;
    if (v.kind !== 'cnv' && v.gene && v.gene.toUpperCase() === g.symbol.toUpperCase()) hit = 'sequence';
    else if (v.kind === 'cnv' && (v.assembly || 'GRCh38') === 'GRCh38' && g.chrom && g.start && normChrom(v.chrom) === normChrom(g.chrom) && v.start <= g.end && v.end >= g.start) {
      hit = v.start <= g.start && v.end >= g.end ? 'cnv-whole' : 'cnv-part';
    }
    if (hit) rows.push({ p, v, s: summariseVariant(v), hit });
  }
  return rows.sort((a, b) => Number(a.p.id) - Number(b.p.id));
}

/** a disease's name, linked to OMIM, Orphanet or DECIPHER by its id */
export function diseaseLink(d) {
  if (d.id.startsWith('OMIM:')) return ext(`https://omim.org/entry/${d.id.slice(5)}`, d.name);
  if (d.id.startsWith('ORPHA:')) return ext(`https://www.orpha.net/en/disease/detail/${d.id.slice(6)}`, d.name);
  if (d.id.startsWith('DECIPHER:')) return ext(`https://www.deciphergenomics.org/syndrome/${d.id.slice(9)}`, d.name);
  return h('span', d.name);
}

/** a disease's modes of inheritance (HPO terms), as one phrase: "Autosomal dominant, typified by somatic mosaicism" */
export function inhWords(list, H) {
  let words = Array.from(new Set((list || []).map((n) => H.name(n).replace(/ inheritance$/, ''))));
  // "X-linked" says less than "X-linked dominant": keep the more specific
  words = words.filter((w) => !words.some((o) => o !== w && o.toLowerCase().startsWith(w.toLowerCase() + ' ')));
  words.sort((a, b) => /^typified|^somatic/i.test(a) - /^typified|^somatic/i.test(b));
  return words.map((w, i) => (i && /^[A-Z][a-z]/.test(w) ? w.charAt(0).toLowerCase() + w.slice(1) : w)).join(', ');
}

/** gene symbols within two edits of what was typed (BRAC1 → BRCA1), the nearest first */
export function nearSymbols(q, genes, limit = 8) {
  const s = String(q || '').toUpperCase();
  if (s.length < 3) return [];
  const out = [];
  for (const g of genes) {
    const t = g.symbol.toUpperCase();
    if (Math.abs(t.length - s.length) > 2) continue;
    const d = editDistance(s, t);
    if (d <= 2) out.push({ g, d });
  }
  return out.sort((a, b) => a.d - b.d || a.g.symbol.localeCompare(b.g.symbol)).slice(0, limit).map((x) => x.g);
}
/** the number of single-letter changes, insertions, deletions or swaps of neighbours between two strings */
export function editDistance(a, b) {
  const m = a.length, n = b.length;
  const d = Array.from({ length: m + 1 }, (_, i) => [i].concat(new Array(n).fill(0)));
  for (let j = 1; j <= n; j++) d[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const c = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + c);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
    }
  }
  return d[m][n];
}
