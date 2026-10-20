/* =====================================================================
   Suggestions: what the evidence on a variant's page points to, for
   each criterion it bears on, with the reason in words. They are only
   suggestions: the student decides, and nothing is applied for them.
   (Rules in the spirit of VarSome's and InterVar's, but simpler, and
   each one says what it did not check.)
   ===================================================================== */
import { PREDICTORS, predictorStrength, SPLICEAI, PHYLOP_BP7 } from './thresholds.js';
import { grpmaxFAF, maxGroupAF, GROUPS } from '../api/gnomad.js';
import { sameResidue } from '../annotate.js';
import { fmtAF } from '../core.js';
import { strengthOfPoints } from './calculators.js';
import { fw, defaultFor } from './frameworks.js';
import { isBA1Exception } from './criteria.js';

const MISSENSE = ['missense_variant'];
const INFRAME = ['inframe_insertion', 'inframe_deletion'];
const SPLICE_CANON = ['splice_acceptor_variant', 'splice_donor_variant'];

/** the gene's mode of inheritance, from its curations: 'AD', 'AR', 'XL' or null */
export function geneMOI(gene) {
  if (!gene) return null;
  const moi = new Set();
  for (const v of gene.validity || []) {
    if (/AD|dominant/i.test(v.moi)) moi.add('AD');
    if (/AR|recessive/i.test(v.moi)) moi.add('AR');
    if (/X/i.test(v.moi)) moi.add('XL');
  }
  for (const g of gene.g2p || []) {
    if (/monoallelic_autosomal/.test(g.allelic)) moi.add('AD');
    if (/biallelic_autosomal/.test(g.allelic)) moi.add('AR');
    if (/X/.test(g.allelic)) moi.add('XL');
  }
  if (gene.hi === 30) moi.add('AR');
  return moi.size === 1 ? [...moi][0] : moi.size ? [...moi].join('/') : null;
}

/** is loss of function a known way of causing disease for the gene? → { yes, why } */
export function lofMechanism(gene, clinvarGene) {
  const why = [];
  if (gene && gene.hi === 3) why.push('ClinGen haploinsufficiency score 3');
  for (const g of (gene && gene.g2p) || []) if (/loss of function/i.test(g.mechanism) && /definitive|strong/i.test(g.confidence)) {
    why.push(`Gene2Phenotype: loss of function in ${g.disease} (${g.confidence})`);
    break;
  }
  if (clinvarGene) {
    const lof = clinvarGene.filter((c) => /stop_gained|frameshift|splice_donor|splice_acceptor/.test(c.major_consequence || '') && /^(Pathogenic|Likely pathogenic|Pathogenic\/Likely pathogenic)$/.test(c.clinical_significance) && c.gold_stars >= 1);
    if (lof.length >= 3) why.push(`${lof.length} pathogenic or likely pathogenic loss-of-function variants in ClinVar (one star or more)`);
  }
  return { yes: why.length > 0, why };
}

/**
 * suggest({ ev, gene, clinvarGene, patient, variant, calc, settings }) → { code: { strength, why } }
 *   ev: from annotate(); gene: from genes.js (with validity and g2p attached); clinvarGene: gnomAD's ClinVar variants
 *   of the gene; calc: the calculators' results kept on the variant
 */
export function suggest({ ev, gene, clinvarGene, variant, calc = {}, settings = {} }) {
  const out = {};
  const add = (code, strength, why) => {
    if (!out[code] || rank(strength) > rank(out[code].strength)) out[code] = { strength, why };
  };
  if (!ev) return out;
  const d = ev.d || {};
  const cons = d.consequences || [];
  const is = (list) => cons.some((c) => list.includes(c));
  const moi = geneMOI(gene);
  const F = settings.framework || 'acgs2024';
  const pm2 = defaultFor('PM2', F);

  /* ---------- population ---------- */
  const g = ev.gnomad;
  if (g && ev.status && ev.status.gnomad === 'ok') {
    const faf = grpmaxFAF(g);
    const top = maxGroupAF(g);
    const s = g.found ? (g.joint || g.exome || g.genome) : null;
    if (!g.found || !s || !s.ac) {
      add('PM2', pm2, `Not in ${g.dataset} (${g.found ? 'no alleles in the samples that passed its quality filters' : 'not seen at all'}). Check that the region is well covered before relying on it.`);
    } else {
      const fafV = faf ? faf.faf : null;
      if (fafV != null && fafV > 0.05 && isBA1Exception(d.gene, d.hgvsc)) out._ba1Note = `The frequency is above 5%, but this variant is on ClinGen’s list of exceptions to BA1: common, yet pathogenic.`;
      else if (fafV != null && fafV > 0.05) add('BA1', 'SA', `The grpmax filtering allele frequency is ${fmtAF(fafV)} (${GROUPS[faf.group] || faf.group}), above 0.05 (5%), and the variant is not one of ClinGen’s exceptions.`);
      else if ((fafV != null && fafV > 0.01) || (top && top.af > 0.01)) add('BS1', 'S', `The frequency is above 1%${fafV != null ? ` (grpmax FAF ${fmtAF(fafV)})` : ''}: more common than almost any rare Mendelian disorder allows. Use the frequency calculator for this disorder to be sure.`);
      else if (calc.af && calc.af.userSet && calc.af.max && fafV != null && fafV > calc.af.max) add('BS1', 'S', `The grpmax filtering allele frequency (${fmtAF(fafV)}) is above the highest credible frequency for this disorder from the calculator (${fmtAF(calc.af.max)}).`);
      else if (calc.af && calc.af.userSet && calc.af.max && (fafV == null || fafV <= calc.af.max) && moi === 'AR' && s.af < 0.0001) add('PM2', pm2, `Rare (${fmtAF(s.af)} overall; ${s.ac} alleles) for a recessive disorder, and below the calculator’s highest credible frequency.`);
      else if (moi === 'AR' && s.af < 0.0001 && !(s.hom > 0)) add('PM2', pm2, `Very rare (${fmtAF(s.af)}, ${s.ac} alleles, no homozygotes) for a gene with a recessive disorder: below the usual threshold for recessive conditions.`);
      if (s.hom > 0 && (moi === 'AR')) add('BS2', 'S', `${s.hom} homozygous ${s.hom === 1 ? 'person' : 'people'} in ${g.dataset}, which is meant to exclude people with severe childhood disease. Only for a fully penetrant, early-onset recessive disorder.`);
      if (s.hemi > 0 && moi === 'XL') add('BS2', 'S', `${s.hemi} hemizygous ${s.hemi === 1 ? 'man' : 'men'} in ${g.dataset}. Only for a fully penetrant, early-onset X-linked disorder.`);
      if (s.filters && s.filters.length) out._gnomadFilters = s.filters;
    }
  }

  /* ---------- variant type ---------- */
  const lof = lofMechanism(gene, clinvarGene);
  if (d.lofConsequence) {
    const tree = calc.pvs1 && calc.pvs1.result;
    if (tree && tree.strength) add('PVS1', tree.strength, `From the PVS1 decision tree: ${tree.path}.`);
    else if (lof.yes) {
      const nmd = nmdPrediction(d);
      if (is(['stop_gained', 'frameshift_variant'])) {
        if (nmd.escapes) add('PVS1', nmd.removedPct != null && nmd.removedPct > 10 ? 'S' : 'M', `A premature stop that is expected to escape nonsense-mediated decay (${nmd.why}); removes about ${nmd.removedPct != null ? nmd.removedPct.toFixed(0) + '%' : 'an unknown share'} of the protein. Loss of function causes disease: ${lof.why.join('; ')}. Work through the PVS1 tree to be sure.`);
        else add('PVS1', 'VS', `A premature stop expected to trigger nonsense-mediated decay (${nmd.why}), in a gene where loss of function causes disease: ${lof.why.join('; ')}. Check the transcript is the one expressed in the relevant tissue (PVS1 tree).`);
      } else if (is(SPLICE_CANON)) add('PVS1', 'VS', `A change at a canonical ±1 or 2 splice site, in a gene where loss of function causes disease (${lof.why.join('; ')}). The strength depends on whether the exon skipping or intron retention it causes is in frame and triggers NMD: work it through the PVS1 tree.`);
      else if (is(['start_lost'])) add('PVS1', 'M', `Loss of the start codon. The PVS1 tree gives moderate strength when no pathogenic variants are known upstream of the next in-frame methionine, supporting if the next methionine is close. Loss of function causes disease: ${lof.why.join('; ')}.`);
    } else if (gene) {
      out._pvs1Note = `A loss-of-function variant, but the site has no evidence that loss of function causes disease in ${gene.symbol} (no ClinGen HI score of 3, no Gene2Phenotype loss-of-function entry, few pathogenic LoF variants in ClinVar). PVS1 needs that.`;
    }
  }
  if (is(INFRAME)) add('PM4', 'M', `An in-frame ${cons.includes('inframe_deletion') ? 'deletion' : 'insertion'} (${d.hgvsp || d.hgvsc}). Check it is not in a repeat region (then BP3) and does not overlap PVS1.`);
  if (is(['stop_lost'])) add('PM4', 'M', 'A stop-loss variant, which lengthens the protein.');

  /* ---------- predictions ---------- */
  const pred = d.predictors || {};
  const chosen = settings.predictor || 'REVEL';
  if (is(MISSENSE)) {
    const p = PREDICTORS[chosen];
    const score = p ? pred[p.key] : null;
    const r = predictorStrength(chosen, score, F);
    if (r) add(r.code, r.strength, F === 'acgs2024'
      ? `${p.label} ${score.toFixed(3)} (${r.threshold}): ${r.code} at supporting strength, as the ACGS 2024 guidelines use it.`
      : `${p.label} ${score.toFixed(3)} (${r.threshold}): ClinGen’s calibrated threshold for ${r.code}_${word(r.strength)} (Pejaver et al. 2022).`);
    else if (score != null) out._predNote = `${p.label} ${score.toFixed(3)} lies between the thresholds for PP3 and BP4: no computational evidence either way.`;
  }
  const sp = ev.d && ev.d.spliceai;
  const synonymousOrIntronic = is(['synonymous_variant', 'intron_variant']) && !is(SPLICE_CANON) && !is(MISSENSE);
  if (sp && sp.max != null) {
    const sf = fw(F).splice;
    const spliceHigh = sf.pp3Strict ? sp.max > sf.pp3 : sp.max >= sf.pp3;
    const spliceLow = sf.bp4Strict ? sp.max < sf.bp4 : sp.max <= sf.bp4;
    if (spliceHigh && !d.lofConsequence) add('PP3', 'P', `SpliceAI predicts an effect on splicing (highest score ${sp.max.toFixed(2)}, ${sf.pp3Strict ? 'above' : 'at or above'} ${sf.pp3}; Walker et al. 2023). Weigh the protein and splicing effects separately and use the more damaging.`);
    if (spliceLow && synonymousOrIntronic && intronDistanceOK(d) && !nearExonEdge(d)) {
      add('BP4', 'P', `SpliceAI predicts no effect on splicing (highest score ${sp.max.toFixed(2)}, ${sf.bp4Strict ? 'below' : 'at or below'} ${sf.bp4}).`);
      const cons2 = pred.phylop;
      if (F !== 'acgs2024' || cons2 == null || cons2 < PHYLOP_BP7) add('BP7', 'P', `${is(['synonymous_variant']) ? 'Synonymous' : 'Intronic, beyond +7 and −21'}, with no predicted effect on splicing (so BP4 too: Walker et al. 2023 use the two together)${cons2 != null ? `; phyloP ${cons2.toFixed(2)}${cons2 < PHYLOP_BP7 ? ', not highly conserved' : ''}` : ''}.`);
      else out._bp7Note = `SpliceAI predicts no effect, but the base is conserved (phyloP ${cons2.toFixed(2)} ≥ ${PHYLOP_BP7}): the ACGS 2024 guidelines then withhold BP7.`;
    } else if (spliceLow && !is(MISSENSE) && !synonymousOrIntronic && !d.lofConsequence && is(['splice_region_variant'])) add('BP4', 'P', `SpliceAI predicts no effect on splicing (highest score ${sp.max.toFixed(2)}).`);
  }

  /* ---------- the same residue (ClinVar) ---------- */
  if (is(MISSENSE) && ev.clinvar) {
    const sr = sameResidue(ev);
    const good = (r) => r.stars >= 1;
    const pPS1 = sr.ps1.filter((r) => (r.cls === 'p' || r.cls === 'plp') && good(r));
    const lpPS1 = sr.ps1.filter((r) => r.cls === 'lp' && good(r));
    if (pPS1.length) add('PS1', 'S', `ClinVar has ${pPS1[0].hgvsc} (${pPS1[0].hgvsp}), the same amino acid change by a different nucleotide change, as ${pPS1[0].classification.toLowerCase()} (${pPS1[0].stars} star${pPS1[0].stars === 1 ? '' : 's'}). Check neither changes splicing.`);
    else if (lpPS1.length) add('PS1', 'M', `ClinVar has the same amino acid change (${lpPS1[0].hgvsc}) as likely pathogenic: PS1 at moderate strength.`);
    const pPM5 = sr.pm5.filter((r) => /^(p|lp|plp)$/.test(r.cls) && good(r));
    if (pPM5.length) add('PM5', pPM5.filter((r) => r.cls === 'p' || r.cls === 'plp').length >= 2 ? 'S' : 'M', `ClinVar has ${pPM5.map((r) => `${r.hgvsp} (${r.classification.toLowerCase()})`).slice(0, 3).join(', ')} at the same residue.${pPM5.length >= 2 ? ' Two or more pathogenic changes here: some expert panels allow PM5_Strong.' : ''}`);
  }

  /* ---------- the gene ---------- */
  if (is(MISSENSE) && gene) {
    const mis = (clinvarGene || []).filter((c) => c.major_consequence === 'missense_variant' && c.gold_stars >= 1);
    const pm = mis.filter((c) => /^(Pathogenic|Likely pathogenic|Pathogenic\/Likely pathogenic)$/.test(c.clinical_significance));
    const bm = mis.filter((c) => /^(Benign|Likely benign|Benign\/Likely benign)$/.test(c.clinical_significance));
    if (gene.misZ != null && gene.misZ > 3.09 && pm.length >= 10 && pm.length / Math.max(1, pm.length + bm.length) > 0.8) add('PP2', 'P', `${gene.symbol} has few missense variants in gnomAD (missense Z ${gene.misZ.toFixed(2)} > 3.09), and ${pm.length} of its ${pm.length + bm.length} classified missense variants in ClinVar are pathogenic or likely pathogenic.`);
    if (lof.yes && pm.length <= 1 && bm.length >= 10 && (gene.g2p || []).every((x) => /loss of function/i.test(x.mechanism))) add('BP1', 'P', `Disease in ${gene.symbol} is caused by loss of function, and ClinVar has ${pm.length} pathogenic missense variants against ${bm.length} benign ones.`);
    // PM1: a hotspot – pathogenic missense variants close by, and no benign ones
    if (d.proteinPos && mis.length) {
      const near = (c) => {
        const m = /^p\.[A-Z][a-z]{2}(\d+)/.exec(c.hgvsp || '');
        return m && Math.abs(+m[1] - d.proteinPos) <= 12;
      };
      const pn = pm.filter(near), bn = bm.filter(near);
      if (pn.length >= 4 && bn.length === 0) add('PM1', 'M', `${pn.length} pathogenic or likely pathogenic missense variants in ClinVar within 12 residues of this one, and no benign ones: a possible hotspot. Check whether it is a well-established functional domain (the protein view).`);
      out._pm1Counts = { pathogenic: pn.length, benign: bn.length };
    }
  }

  /* ---------- the patient and the family (from the calculators) ---------- */
  if (calc.denovo && calc.denovo.points >= 0.5) {
    const st = strengthOfPoints(calc.denovo.points);
    const code = calc.denovo.anyConfirmed ? 'PS2' : 'PM6';
    add(code, st, `De novo occurrences: ${calc.denovo.points} points by ClinGen’s scheme (${calc.denovo.summary}).`);
  }
  if (calc.pm3 && calc.pm3.points >= 0.5) add('PM3', strengthOfPoints(calc.pm3.points), `In trans with pathogenic variants: ${calc.pm3.points} points by ClinGen’s scheme.`);
  if (calc.seg && calc.seg.ok) {
    if (calc.seg.direction === 'for' && calc.seg.strength) {
      const s = calc.seg.strength.bayes || calc.seg.strength.jarvik;
      if (s) add('PP1', s === 'VS' ? 'S' : s, `Co-segregation likelihood ratio ${calc.seg.lr.toFixed(1)} (LOD ${calc.seg.lod.toFixed(2)}) under the model chosen in the Family section.`);
    }
    if (calc.seg.direction === 'against' && calc.seg.strength && calc.seg.strength.bayes) add('BS4', calc.seg.strength.bayes === 'M' ? 'P' : calc.seg.strength.bayes === 'P' ? 'P' : 'S', `The family’s genotypes fit the variant not causing the disease: likelihood ratio ${calc.seg.lr < 0.001 ? 'below 0.001' : calc.seg.lr.toFixed(3)}.`);
  }
  if (calc.func && calc.func.result) add(calc.func.result.code, calc.func.result.strength, `Functional assay: OddsPath ${calc.func.result.odds.toFixed(2)} from its controls (Brnich et al. 2019).`);
  if (calc.pheno && calc.pheno.specific && calc.pheno.rank != null && calc.pheno.rank <= 3) add('PP4', 'P', `The patient’s phenotype matches ${calc.pheno.disease} closely (ranked ${calc.pheno.rank} of all diseases by the HPO comparison). PP4 only if the phenotype is highly specific for this gene.`);
  return out;
}

const rank = (s) => ({ VS: 4, SA: 5, S: 3, M: 2, P: 1 })[s] || 0;
const word = (s) => ({ VS: 'VeryStrong', S: 'Strong', M: 'Moderate', P: 'Supporting' })[s];

/** whether a premature stop is expected to escape nonsense-mediated decay: in the last exon, or within 50
    bases of the end of the penultimate exon (LOFTEE's 50_BP_RULE), or the transcript has one exon */
export function nmdPrediction(d) {
  const info = (d.lof && d.lof.info) || {};
  const out = { escapes: null, why: '', removedPct: null };
  if (info.PERCENTILE != null) out.removedPct = (1 - Number(info.PERCENTILE)) * 100;
  if (d.exon && d.exon.of === 1) {
    out.escapes = true;
    out.why = 'the transcript has a single exon';
  } else if (d.exon && d.exon.n === d.exon.of) {
    out.escapes = true;
    out.why = `it is in the last exon (exon ${d.exon.n} of ${d.exon.of})`;
  } else if (info['50_BP_RULE'] === 'FAIL') {
    out.escapes = true;
    out.why = 'it is within 50 bases of the end of the penultimate exon';
  } else if (info['50_BP_RULE'] === 'PASS' || d.exon) {
    out.escapes = false;
    out.why = d.exon ? `exon ${d.exon.n} of ${d.exon.of}, more than 50 bases before the last exon junction` : 'more than 50 bases before the last exon junction';
  } else {
    out.why = 'not known';
  }
  return out;
}

/** not at the first base or the last three bases of an exon, where BP7 does not apply (Walker et al. 2023): from VEP's
    splice-region flag, which covers them */
function nearExonEdge(d) {
  return (d.consequences || []).includes('splice_region_variant') && (d.consequences || []).includes('synonymous_variant');
}

/** BP7 for intronic variants: at +7 or beyond, or −21 or beyond (Walker et al. 2023) */
function intronDistanceOK(d) {
  if (!d.hgvsc) return true;
  const m = /c\.[*-]?\d+([+-])(\d+)/.exec(d.hgvsc);
  if (!m) return true;
  const dist = +m[2];
  return m[1] === '+' ? dist >= 7 : dist >= 21;
}
