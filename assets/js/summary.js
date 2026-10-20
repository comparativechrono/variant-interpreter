/* =====================================================================
   How patients and variants are described, the same way on every page.
   ===================================================================== */
import { fmtRegion, fmtSize } from './parse.js';
import { classify, criteriaString } from './acmg/engine.js';
import { score as cnvScore, fmtPts } from './cnv/rubric.js';
import * as settings from './settings.js';

export const SEX = { female: 'Female', male: 'Male', other: 'Other', unknown: 'Not known' };

export function ageText(p) {
  if (p.prenatal) return p.gestation ? `Prenatal, ${p.gestation} weeks` : 'Prenatal';
  const a = p.age || {};
  if (a.years == null && a.months == null) return '';
  if (a.years != null && a.years >= 2) return `${a.years} years`;
  const months = (a.years || 0) * 12 + (a.months || 0);
  return months === 1 ? '1 month' : `${months} months`;
}

export function patientFacts(p) {
  const age = ageText(p);
  const sex = SEX[p.sex] || 'Not known';
  return {
    short: [sex, age].filter(Boolean).join(', '),
    pairs: [
      ['Sex', sex],
      [p.prenatal ? 'Stage' : 'Age at last assessment', age || 'Not recorded'],
      ['Karyotype or chromosomal sex', p.karyotype || null],
      ['Age at onset', p.onsetName || null],
      ['Ancestry', p.ancestry || null],
      ['Parents related', p.consanguinity === 'yes' ? 'Yes' : p.consanguinity === 'no' ? 'No' : null],
      ['Test', p.test && p.test.type ? p.test.type + (p.test.panel && p.test.panel.name ? ` (${p.test.panel.name})` : '') : null]
    ]
  };
}

export const ZYGOSITY = [
  ['heterozygous', 'Heterozygous'],
  ['homozygous', 'Homozygous'],
  ['hemizygous', 'Hemizygous'],
  ['mosaic', 'Mosaic'],
  ['heteroplasmic', 'Heteroplasmic'],
  ['homoplasmic', 'Homoplasmic'],
  ['unknown', 'Not known']
];
export const CNV_COPIES = [
  [0, '0 copies (homozygous loss)'],
  [1, '1 copy (heterozygous loss)'],
  [3, '3 copies (gain of one copy)'],
  [4, '4 copies (gain of two copies)'],
  [5, '5 or more copies']
];
/* how the variant came to the patient: the words follow the usual reporting categories */
export const INHERITANCE = [
  ['denovo-confirmed', 'De novo (both parents tested, parentage confirmed)'],
  ['denovo-assumed', 'De novo (both parents tested, parentage not confirmed)'],
  ['denovo-mosaic', 'De novo, mosaic in the patient'],
  ['maternal', 'Inherited from the mother'],
  ['maternal-mosaic', 'Inherited from the mother, who is mosaic'],
  ['paternal', 'Inherited from the father'],
  ['paternal-mosaic', 'Inherited from the father, who is mosaic'],
  ['biparental', 'Inherited from both parents (homozygous or compound)'],
  ['balanced', 'From a balanced rearrangement in a parent'],
  ['notmaternal', 'Not inherited from the mother (father not tested)'],
  ['notpaternal', 'Not inherited from the father (mother not tested)'],
  ['unknown', 'Not known (parents not tested)']
];
/** the name a classification was signed with, or '' if none was given (older records say 'not named') */
export const signerName = (by) => (by && by !== 'not named' ? by : '');
export const inheritanceText = (k) => (INHERITANCE.find((x) => x[0] === k) || [null, 'Not known'])[1];
export const CONTRIBUTION = [
  ['full', 'Full (explains the phenotype)'],
  ['partial', 'Partial (explains some of it)'],
  ['uncertain', 'Uncertain'],
  ['none', 'None'],
  ['', 'Not decided']
];
export const contributionText = (k) => (CONTRIBUTION.find((x) => x[0] === (k || '')) || [null, 'Not decided'])[1];

/** the short form of a variant for lists: c. change (and p.), or the CNV's region */
export function variantShort(v) {
  if (v.kind === 'cnv') return `${v.cnvType === 'gain' ? 'Gain' : v.cnvType === 'loss' ? 'Loss' : 'CNV'} ${fmtSize((v.end || 0) - (v.start || 0) + 1)}`;
  const c = v.hgvsc ? v.hgvsc.split(':').pop() : '';
  const p = v.hgvsp ? v.hgvsp.split(':').pop() : '';
  if (c) return p ? `${c} ${p.replace(/^p\.\(?/, 'p.(').replace(/\)?$/, ')')}` : c;
  return v.input || `${v.chrom}-${v.pos}-${v.ref}-${v.alt}`;
}
/** the full name, as it goes in a report */
export function variantLong(v) {
  if (v.kind === 'cnv') {
    const cn = v.copyNumber != null ? `, ${v.copyNumber} ${v.copyNumber === 1 ? 'copy' : 'copies'}` : '';
    return `${v.cnvType === 'gain' ? 'Copy-number gain' : v.cnvType === 'loss' ? 'Copy-number loss' : 'Copy-number change'} of ${fmtRegion(v.chrom, v.start, v.end)} (${v.assembly || 'GRCh38'}), ${fmtSize(v.end - v.start + 1)}${cn}`;
  }
  const tx = v.transcript || (v.hgvsc ? v.hgvsc.split(':')[0] : '');
  const c = v.hgvsc ? v.hgvsc.split(':').pop() : '';
  const p = v.hgvsp ? v.hgvsp.split(':').pop() : '';
  if (tx && c) return `${tx}${v.gene ? `(${v.gene})` : ''}:${c}${p ? ` ${p.replace(/^p\.\(?/, 'p.(').replace(/\)?$/, ')')}` : ''}`;
  return v.input || `${v.chrom}-${v.pos}-${v.ref}-${v.alt}`;
}
export function genomicText(v) {
  if (v.kind === 'cnv') return fmtRegion(v.chrom, v.start, v.end);
  if (v.chrom && v.pos) return `${v.assembly || 'GRCh38'} ${v.chrom}-${v.pos}-${v.ref}-${v.alt || '-'}`;
  return '';
}

/** a variant's class as it stands (from its criteria, or for a CNV from its points),
    and the class last signed, if any */
export function currentClass(v) {
  const c = v.classification || {};
  if (v.kind === 'cnv') {
    const sc = cnvScore(v.cnvType === 'gain' ? 'gain' : 'loss', v.cnv || {});
    return { cls: sc.cls, points: sc.total / 100, pointsText: fmtPts(sc.total), band: null, criteria: sc.rows.map((r) => r.code).join(', '), signed: c.saved || null };
  }
  const F = settings.get('framework');
  const r = classify(c.criteria ? c : { criteria: {} }, { framework: F, vusBands: settings.get('vusBands') !== false });
  return { cls: r.cls, points: r.points, pointsText: `${r.points > 0 ? '+' : ''}${r.points}`, band: r.band, criteria: criteriaString(r.met, F), signed: c.saved || null };
}

/** what a list needs from a variant: its class, points, band, gene and short name */
export function summariseVariant(v) {
  const now = currentClass(v);
  return {
    id: v.id,
    kind: v.kind,
    gene: v.kind === 'cnv' ? (v.genesSummary || '') : v.gene || '',
    short: variantShort(v),
    long: variantLong(v),
    cls: now.signed ? now.signed.cls : now.cls,
    calculated: now.cls,
    points: now.points,
    pointsText: now.pointsText,
    band: now.band,
    criteria: now.signed ? now.signed.criteria : now.criteria,
    final: !!now.signed,
    signed: now.signed,
    // anything looked at yet: a criterion marked met or not met, a CNV item used, or a signature
    assessed: !!now.signed || (v.kind === 'cnv'
      ? Object.values((v.cnv && v.cnv.items) || {}).some((x) => x && x.on)
      : Object.values((v.classification && v.classification.criteria) || {}).some((x) => x && (x.met || x.evaluated))),
    contribution: v.contribution || ''
  };
}
