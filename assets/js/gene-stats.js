/* =====================================================================
   Counting for the gene page: ClinVar's variants of a gene by kind of
   change and by class, and what the counts say about the gene (is loss
   of function its mechanism? are missense changes in it often
   pathogenic, or often benign?). Nothing here draws a page, so that the
   tests can run it in Node.
   ===================================================================== */

/* ClinVar's classes, grouped as the gene page shows them. Colour is never the only sign: each has a label. */
export const CV_CLASSES = [
  { key: 'plp', label: 'Pathogenic or likely pathogenic', short: 'P/LP' },
  { key: 'vus', label: 'Uncertain significance', short: 'VUS' },
  { key: 'conflict', label: 'Conflicting classifications', short: 'Conflicting' },
  { key: 'blb', label: 'Benign or likely benign', short: 'B/LB' },
  { key: 'other', label: 'Other (risk factor, drug response, not provided)', short: 'Other' }
];

/** a ClinVar classification ("Pathogenic/Likely pathogenic", "Conflicting classifications of pathogenicity" …) → a CV_CLASSES key */
export function cvClass(sig) {
  const s = String(sig || '').toLowerCase().trim();
  if (/conflicting/.test(s)) return 'conflict';
  if (/^(pathogenic|likely pathogenic)\b/.test(s)) return 'plp';
  if (/^uncertain significance/.test(s)) return 'vus';
  if (/^(benign|likely benign)\b/.test(s)) return 'blb';
  return 'other';
}

/* kinds of change, by Ensembl's most severe consequence */
export const CONSEQ_GROUPS = [
  { key: 'lof', label: 'Truncating', about: 'stop-gain, frameshift, canonical (±1 or 2) splice site, start-loss',
    terms: ['transcript_ablation', 'stop_gained', 'frameshift_variant', 'splice_acceptor_variant', 'splice_donor_variant', 'start_lost'] },
  { key: 'missense', label: 'Missense and in-frame', about: 'one amino acid changed, or a few added or removed in frame, or a lost stop',
    terms: ['missense_variant', 'inframe_insertion', 'inframe_deletion', 'protein_altering_variant', 'stop_lost'] },
  { key: 'splice', label: 'Splice region', about: 'near an exon’s edge, outside the canonical splice sites',
    terms: ['splice_region_variant', 'splice_donor_5th_base_variant', 'splice_donor_region_variant', 'splice_polypyrimidine_tract_variant'] },
  { key: 'synonymous', label: 'Synonymous', about: 'no change to the protein',
    terms: ['synonymous_variant', 'stop_retained_variant', 'start_retained_variant'] },
  { key: 'other', label: 'Intronic, UTR and other', about: 'in introns, untranslated regions, or around the gene', terms: [] }
];
const GROUP_OF = new Map(CONSEQ_GROUPS.flatMap((g) => g.terms.map((t) => [t, g.key])));
/** Ensembl's consequence term → a CONSEQ_GROUPS key */
export const consequenceGroup = (term) => GROUP_OF.get(String(term || '')) || 'other';

/** the review status as stars (ClinVar's own scale, 0 to 4) */
export const starCount = (c) => Math.max(0, Math.min(4, Number(c && c.gold_stars) || 0));

/**
 * ClinVar's variants of a gene (as gnomAD's copy gives them: clinical_significance, major_consequence, gold_stars …),
 * counted by group and class. Only those with at least minStars stars count.
 * → { total, byClass: {plp, vus, …}, matrix: { lof: {plp, vus, conflict, blb, other, total}, … } }
 */
export function clinvarSummary(list, minStars = 0) {
  const zero = () => Object.fromEntries(CV_CLASSES.map((c) => [c.key, 0]).concat([['total', 0]]));
  const byClass = zero();
  const matrix = Object.fromEntries(CONSEQ_GROUPS.map((g) => [g.key, zero()]));
  let total = 0;
  for (const c of list || []) {
    if (starCount(c) < minStars) continue;
    const k = cvClass(c.clinical_significance);
    const gk = consequenceGroup(c.major_consequence);
    byClass[k]++;
    byClass.total++;
    matrix[gk][k]++;
    matrix[gk].total++;
    total++;
  }
  return { total, byClass, matrix };
}

const pc = (a, b) => (b ? Math.round((100 * a) / b) : 0);
const n = (x) => Number(x).toLocaleString('en-GB');

/**
 * What the counts suggest, as sentences for students (with the criteria they bear on). Counts of variants
 * classified one way or the other (pathogenic or benign) only: uncertain and conflicting ones say little.
 * → [{ about: 'lof'|'missense'|'synonymous', text, codes: ['PVS1'] }]
 */
export function geneNotes(summary) {
  const out = [];
  if (!summary || !summary.total) return out;
  const m = summary.matrix;
  const lof = m.lof, mis = m.missense;
  const lofCls = lof.plp + lof.blb, misCls = mis.plp + mis.blb;
  if (lofCls >= 5) {
    const share = pc(lof.plp, lofCls);
    out.push({
      about: 'lof',
      codes: ['PVS1'],
      text: `${n(lof.plp)} of the ${n(lofCls)} truncating variants classified either way are pathogenic or likely pathogenic (${share}%). ` +
        (share >= 80 ? 'Loss of function looks like a mechanism of disease for this gene, which PVS1 needs.'
          : share <= 30 ? 'Truncating variants are often benign here, so loss of function may not cause disease and PVS1 may not apply.'
            : 'The picture is mixed, so check the gene’s curations for its mechanism before using PVS1.')
    });
  } else if (lof.total) out.push({ about: 'lof', codes: ['PVS1'], text: `Only ${n(lofCls)} truncating ${lofCls === 1 ? 'variant is' : 'variants are'} classified either way, which is too few to say whether loss of function causes disease. The gene’s curations in ClinGen and Gene2Phenotype say more.` });
  if (misCls >= 5) {
    const share = pc(mis.plp, misCls);
    let text = `${n(mis.plp)} of the ${n(misCls)} missense and in-frame variants classified either way are pathogenic or likely pathogenic (${share}%), and ${n(mis.blb)} are benign or likely benign.`;
    const codes = [];
    if (share >= 70 && mis.plp >= 10) {
      text += ' Pathogenic missense variants are common here and benign ones are few, which is the kind of gene PP2 is for. PP2 also needs low missense variation in the population, so check the missense Z score.';
      codes.push('PP2');
    } else if (mis.plp <= 2 && lof.plp >= 10) {
      text += ' Almost all the pathogenic variants truncate the protein, which is the kind of gene BP1 is for. BP1 covers missense variants in a gene where only truncating ones cause disease.';
      codes.push('BP1');
    }
    out.push({ about: 'missense', codes, text });
  }
  const syn = m.synonymous;
  if (syn.total >= 10 && syn.plp === 0) out.push({ about: 'synonymous', codes: ['BP7'], text: `None of the ${n(syn.total)} synonymous variants in ClinVar is classified pathogenic, which is what you’d expect unless one changes splicing.` });
  return out;
}

/** residues where ClinVar's pathogenic missense variants gather (one star or more): [{ residue, plp, blb, names }] */
export function hotspots(list, limit = 10) {
  const by = new Map();
  for (const c of list || []) {
    if (starCount(c) < 1 || !/missense/.test(c.major_consequence || '')) continue;
    const m = /^p\.[A-Z][a-z]{2}(\d+)/.exec(c.hgvsp || '');
    if (!m) continue;
    const r = +m[1];
    const k = cvClass(c.clinical_significance);
    if (k !== 'plp' && k !== 'blb') continue;
    const x = by.get(r) || { residue: r, plp: 0, blb: 0, names: [] };
    x[k]++;
    if (k === 'plp' && x.names.length < 6) x.names.push(c.hgvsp);
    by.set(r, x);
  }
  return Array.from(by.values()).filter((x) => x.plp > 0).sort((a, b) => b.plp - a.plp || a.blb - b.blb || a.residue - b.residue).slice(0, limit);
}

/** ClinGen's dosage score in words: "sufficient evidence (3)" */
export function dosageWords(score) {
  const W = { 3: 'sufficient evidence', 2: 'some evidence', 1: 'little evidence', 0: 'no evidence', 30: 'gene associated with an autosomal recessive phenotype', 40: 'dosage sensitivity unlikely' };
  if (score == null || score === '') return 'not curated';
  return `${W[score] || 'score'} (${score})`;
}

/** Gene2Phenotype's allelic requirement in words */
export function allelicWords(s) {
  const W = {
    monoallelic_autosomal: 'one copy (autosomal)', biallelic_autosomal: 'two copies (autosomal)', monoallelic_X_hemizygous: 'one copy, X-linked (hemizygous)',
    monoallelic_X_heterozygous: 'one copy, X-linked (heterozygous)', monoallelic_X: 'one copy, X-linked', biallelic_PAR: 'two copies (pseudoautosomal)',
    monoallelic_PAR: 'one copy (pseudoautosomal)', mitochondrial: 'mitochondrial', monoallelic_Y_hemizygous: 'one copy, Y-linked'
  };
  const k = String(s || '').trim();
  return W[k] || k.replace(/_/g, ' ');
}
