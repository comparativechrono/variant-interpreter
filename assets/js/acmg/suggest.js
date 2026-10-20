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
  if (gene && gene.hi === 3) why.push('a ClinGen haploinsufficiency score of 3');
  for (const g of (gene && gene.g2p) || []) if (/loss of function/i.test(g.mechanism) && /definitive|strong/i.test(g.confidence)) {
    why.push(`Gene2Phenotype’s “loss of function” mechanism for ${g.disease} (${g.confidence})`);
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
      add('PM2', pm2, `The variant is absent from ${g.dataset} (${g.found ? 'no alleles in the samples that passed its quality filters' : 'not seen at all'}). Check that the region is well covered before you rely on this.`);
    } else {
      const fafV = faf ? faf.faf : null;
      const exception = isBA1Exception(d.gene, d.hgvsc, g.caid);
      const over1 = (fafV != null && fafV > 0.01) || !!(top && top.af > 0.01);
      const calcSet = !!(calc.af && calc.af.userSet && calc.af.max);
      if (exception) out._ba1Note = `This variant is on ClinGen’s list of exceptions to BA1, which are common yet pathogenic, so its frequency isn’t evidence that it is benign.`; // and no frequency-based benign criteria
      else if (fafV != null && fafV > 0.05) add('BA1', 'SA', `The grpmax filtering allele frequency is ${fmtAF(fafV)} (${GROUPS[faf.group] || faf.group}), which is above 0.05 (5%), and the variant isn’t one of ClinGen’s exceptions.`);
      // the calculator, once its values are set for the disorder, decides BS1; without it, a flat 1% only for a dominant disorder
      else if (calcSet && fafV != null && fafV > calc.af.max) add('BS1', 'S', `The grpmax filtering allele frequency (${fmtAF(fafV)}) is above the highest credible frequency that the calculator gives for this disorder (${fmtAF(calc.af.max)}).`);
      else if (!calcSet && over1 && moi === 'AD') add('BS1', 'S', `The frequency is above 1%${fafV != null ? ` (grpmax FAF ${fmtAF(fafV)})` : ''}, which is more common than a rare dominant disorder allows. Use the frequency calculator for this disorder to be sure.`);
      else if (!calcSet && over1) out._bs1Note = `The frequency is above 1%${fafV != null ? ` (grpmax FAF ${fmtAF(fafV)})` : ''}. If the inheritance is recessive or not yet known, that isn’t enough for BS1, because carriers of recessive disorders can be this common. Use the frequency calculator with the disorder’s prevalence.`;
      else if (calcSet && (fafV == null || fafV <= calc.af.max) && moi === 'AR' && s.af < 0.0001) add('PM2', pm2, `The variant is rare for a recessive disorder (${fmtAF(s.af)} overall, ${s.ac} alleles) and below the calculator’s highest credible frequency.`);
      else if (moi === 'AR' && s.af < 0.0001 && !(s.hom > 0)) add('PM2', pm2, `The variant is very rare (${fmtAF(s.af)}, ${s.ac} alleles, no homozygotes), which puts it below the usual threshold for a gene with a recessive disorder.`);
      // ACGS 2024: BS2 in a recessive disorder needs two or more healthy homozygotes (gnomAD's are not phenotyped: be careful)
      if (!exception && s.hom >= 2 && moi === 'AR') add('BS2', 'S', `There are ${s.hom} homozygous people in ${g.dataset}, which is meant to exclude people with severe childhood disease. BS2 is only for a fully penetrant, early-onset recessive disorder, and gnomAD’s participants haven’t been examined, so weigh it with care.`);
      else if (!exception && s.hom === 1 && moi === 'AR') out._bs2Note = `There is one homozygous person in ${g.dataset}, but the ACGS 2024 guidelines ask for two or more healthy homozygotes before you use BS2.`;
      if (!exception && s.hemi >= 2 && moi === 'XL') add('BS2', 'S', `There are ${s.hemi} hemizygous men in ${g.dataset}. BS2 is only for a fully penetrant, early-onset X-linked disorder.`);
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
        if (nmd.escapes) add('PVS1', nmd.removedPct != null && nmd.removedPct > 10 ? 'S' : 'M', `This premature stop is expected to escape nonsense-mediated decay, because ${nmd.why}. It removes about ${nmd.removedPct != null ? nmd.removedPct.toFixed(0) + '%' : 'an unknown share'} of the protein. Loss of function causes disease in this gene: ${lof.why.join('; ')}. Work through the PVS1 tree to be sure.`);
        else add('PVS1', 'VS', `This premature stop is expected to trigger nonsense-mediated decay (${nmd.why}). Loss of function causes disease in this gene: ${lof.why.join('; ')}. Use the PVS1 tree to check that the transcript is the one expressed in the relevant tissue.`);
      } else if (is(SPLICE_CANON)) {
        const plus2TC = /c\.[*-]?\d+\+2T>C$/.test(d.hgvsc || '');
        const plus2CT = /c\.[*-]?\d+\+2C>T$/.test(d.hgvsc || '');
        const spl = ev.d && ev.d.spliceai && ev.d.spliceai.max;
        if (plus2CT) out._pvs1Note = `A +2C>T change turns a GC donor (about 1.5% of splice sites) into the usual GT, which is likely to make the site stronger rather than weaker. PVS1 therefore doesn’t apply (ACGS 2024). Check that SpliceAI agrees (here it is ${spl != null ? spl.toFixed(2) : 'not known'}).`;
        else if (F === 'acgs2024' && plus2TC && !(spl >= 0.8)) out._pvs1Note = `A +2T>C change turns the donor into GC, which some introns still splice from. The ACGS 2024 guidelines therefore hold back PVS1 unless SpliceAI is 0.8 or more (here it is ${spl != null ? spl.toFixed(2) : 'not known'}) or an RNA study shows the effect.`;
        else add('PVS1', 'VS', `This change is at a canonical ±1 or 2 splice site. Loss of function causes disease in this gene: ${lof.why.join('; ')}. The strength depends on whether the exon skipping or intron retention it causes is in frame and triggers NMD, so work it through the PVS1 tree.`);
      }
      else if (is(['start_lost'])) add('PVS1', 'P', `The start codon is lost. In the PVS1 tree, PVS1 doesn’t apply if another functional transcript starts elsewhere. It is moderate if at least one pathogenic variant is known upstream of the closest in-frame start codon, and supporting if none is. Supporting is suggested until you have checked in the Variant type and PVS1 section. Loss of function causes disease in this gene: ${lof.why.join('; ')}.`);
    } else if (gene) {
      out._pvs1Note = `This is a loss-of-function variant, but the site has no evidence that loss of function causes disease in ${gene.symbol}, and PVS1 needs that. There is no ClinGen HI score of 3, no Gene2Phenotype loss-of-function entry and few pathogenic LoF variants in ClinVar.`;
    }
  }
  if (is(INFRAME)) {
    const v = variant || {};
    const net = v.ref != null && v.alt != null ? Math.abs(String(v.ref).length - String(v.alt).length) : null;
    const one = net === 3 || /^p\.\(?[A-Z][a-z]{2}\d+(del|dup)\)?$/.test(d.hgvsp ? String(d.hgvsp).replace(/^[^:]*:/, '') : '');
    const what = `This is an in-frame ${cons.includes('inframe_deletion') ? 'deletion' : 'insertion'} (${d.hgvsp || d.hgvsc})`;
    if (one && F === 'acgs2024') add('PM4', 'P', `${what} of a single amino acid. The ACGS 2024 guidelines use PM4 at supporting strength for this, unless the gene gives reason for moderate. Check that it isn’t in a repeat region (if it is, look at BP3 instead) and that the region is conserved.`);
    else add('PM4', 'M', `${what}. Check that it isn’t in a repeat region (if it is, look at BP3 instead) and that it doesn’t overlap PVS1.`);
  }
  if (is(['stop_lost'])) add('PM4', 'M', 'This stop-loss variant lengthens the protein.');

  /* ---------- predictions ---------- */
  const pred = d.predictors || {};
  const chosen = settings.predictor || 'REVEL';
  if (is(MISSENSE)) {
    const p = PREDICTORS[chosen];
    const score = p ? pred[p.key] : null;
    let r = predictorStrength(chosen, score, F);
    const spm = ev.d && ev.d.spliceai ? ev.d.spliceai.max : null;
    let held = false; // BP4 held back because splicing isn't ruled out
    if (r && r.code === 'BP4' && spm != null && (fw(F).splice.bp4Strict ? spm >= fw(F).splice.bp4 : spm > fw(F).splice.bp4)) {
      held = true;
      out._bp4Note = `${p.label} ${score.toFixed(3)} predicts no effect on the protein, but SpliceAI (${spm.toFixed(2)}) doesn’t rule out an effect on splicing, and BP4 needs both.`;
      r = null;
    }
    if (r) add(r.code, r.strength, F === 'acgs2024'
      ? `${p.label} scores it ${score.toFixed(3)} (${r.threshold}), which meets ${r.code} at supporting strength, the only strength the ACGS 2024 guidelines use for it.`
      : `${p.label} scores it ${score.toFixed(3)} (${r.threshold}), which reaches ClinGen’s calibrated threshold for ${r.code}_${word(r.strength)} (Pejaver et al. 2022).`);
    else if (score != null && !held) out._predNote = `${p.label} scores it ${score.toFixed(3)}, which lies between the thresholds for PP3 and BP4, so there’s no computational evidence either way.`;
  }
  const sp = ev.d && ev.d.spliceai;
  const synonymousOrIntronic = is(['synonymous_variant', 'intron_variant']) && !is(SPLICE_CANON) && !is(MISSENSE);
  if (sp && sp.max != null) {
    const sf = fw(F).splice;
    const spliceHigh = sf.pp3Strict ? sp.max > sf.pp3 : sp.max >= sf.pp3;
    const spliceLow = sf.bp4Strict ? sp.max < sf.bp4 : sp.max <= sf.bp4;
    if (spliceHigh && !d.lofConsequence) add('PP3', 'P', `SpliceAI predicts an effect on splicing. Its highest score is ${sp.max.toFixed(2)}, which is ${sf.pp3Strict ? 'above' : 'at or above'} ${sf.pp3} (Walker et al. 2023). Weigh the protein and splicing effects separately and use the more damaging.`);
    if (spliceLow && synonymousOrIntronic && intronDistanceOK(d) && !nearExonEdge(d)) {
      add('BP4', 'P', `SpliceAI predicts no effect on splicing. Its highest score is ${sp.max.toFixed(2)}, which is ${sf.bp4Strict ? 'below' : 'at or below'} ${sf.bp4}.`);
      const cons2 = pred.phylop;
      if (F !== 'acgs2024' || cons2 == null || cons2 < PHYLOP_BP7) add('BP7', 'P', `This is ${is(['synonymous_variant']) ? 'a synonymous variant' : 'an intronic variant beyond +7 and −21'} with no predicted effect on splicing${cons2 != null ? ` (phyloP ${cons2.toFixed(2)}${cons2 < PHYLOP_BP7 ? ', not highly conserved' : ''})` : ''}. BP4 applies too, because Walker et al. 2023 use the two together.`);
      else out._bp7Note = `SpliceAI predicts no effect, but the base is conserved (phyloP ${cons2.toFixed(2)} ≥ ${PHYLOP_BP7}), and in that case the ACGS 2024 guidelines hold back BP7.`;
    } else if (spliceLow && !is(MISSENSE) && !synonymousOrIntronic && !d.lofConsequence && is(['splice_region_variant'])) add('BP4', 'P', `SpliceAI predicts no effect on splicing (its highest score is ${sp.max.toFixed(2)}).`);
  }

  /* ---------- the same residue (ClinVar) ---------- */
  if (is(MISSENSE) && ev.clinvar) {
    const sr = sameResidue(ev);
    const good = (r) => r.stars >= 1;
    const pPS1 = sr.ps1.filter((r) => (r.cls === 'p' || r.cls === 'plp') && good(r));
    const lpPS1 = sr.ps1.filter((r) => r.cls === 'lp' && good(r));
    if (pPS1.length) add('PS1', 'S', `ClinVar lists ${pPS1[0].hgvsc} (${pPS1[0].hgvsp}), the same amino acid change made by a different nucleotide change, as ${pPS1[0].classification.toLowerCase()} (${pPS1[0].stars} star${pPS1[0].stars === 1 ? '' : 's'}). Check that neither variant changes splicing.`);
    else if (lpPS1.length) add('PS1', 'M', `ClinVar lists the same amino acid change (${lpPS1[0].hgvsc}) as likely pathogenic, so PS1 applies at moderate strength.`);
    const pPM5 = sr.pm5.filter((r) => /^(p|lp|plp)$/.test(r.cls) && good(r));
    const pOnly = pPM5.filter((r) => r.cls === 'p' || r.cls === 'plp').length;
    if (pPM5.length) add('PM5', pOnly >= 2 ? 'S' : pOnly === 0 && F === 'acgs2024' ? 'P' : 'M', `ClinVar lists ${pPM5.map((r) => `${r.hgvsp} (${r.classification.toLowerCase()})`).slice(0, 3).join(', ')} at the same residue.${pOnly >= 2 ? ' With two or more pathogenic changes here, some expert panels allow PM5_Strong.' : pOnly === 0 && F === 'acgs2024' ? ' The ACGS 2024 guidelines use PM5 at supporting strength when the known change is likely pathogenic rather than pathogenic.' : ''}`);
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
      if (pn.length >= 4 && bn.length === 0) add('PM1', 'M', `ClinVar has ${pn.length} pathogenic or likely pathogenic missense variants within 12 residues of this one and no benign ones, so this may be a hotspot. Check in the protein view whether it is a well-established functional domain.`);
      out._pm1Counts = { pathogenic: pn.length, benign: bn.length };
    }
  }

  /* ---------- the patient and the family (from the calculators) ---------- */
  if (calc.denovo && calc.denovo.points >= 0.5) {
    const st = strengthOfPoints(calc.denovo.points);
    const code = calc.denovo.anyConfirmed ? 'PS2' : 'PM6';
    add(code, st, `The de novo occurrences score ${calc.denovo.points} ${calc.denovo.points === 1 ? 'point' : 'points'} on ClinGen’s scheme (${calc.denovo.summary}).`);
  }
  if (calc.pm3 && calc.pm3.points >= 0.5) add('PM3', strengthOfPoints(calc.pm3.points), `The observations in trans with pathogenic variants score ${calc.pm3.points} ${calc.pm3.points === 1 ? 'point' : 'points'} on ClinGen’s scheme.`);
  if (calc.seg && calc.seg.ok) {
    if (calc.seg.direction === 'for' && calc.seg.strength) {
      const s = F === 'acgs2024' ? calc.seg.strength.jarvik : calc.seg.strength.bayes || calc.seg.strength.jarvik;
      if (s) add('PP1', s === 'VS' ? 'S' : s, `The co-segregation likelihood ratio is ${calc.seg.lr.toFixed(1)} (LOD ${calc.seg.lod.toFixed(2)}, equivalent to ${calc.seg.meioses.toFixed(1)} informative meioses) under the model chosen in the Patient and family section${F === 'acgs2024' ? '. The strength follows the ACGS 2024 guidelines, which count meioses (Jarvik and Browning)' : '. The strength follows Tavtigian’s odds'}.`);
      else if (F === 'acgs2024' && calc.seg.strength.bayes) out._pp1Note = `The likelihood ratio (${calc.seg.lr.toFixed(1)}) would reach PP1 by Tavtigian’s odds, but not by counting meioses as the ACGS 2024 guidelines do.`;
    }
    if (calc.seg.direction === 'against' && calc.seg.strength && calc.seg.strength.bayes) add('BS4', calc.seg.strength.bayes === 'M' ? 'P' : calc.seg.strength.bayes === 'P' ? 'P' : 'S', `The family’s genotypes fit the variant not causing the disease (likelihood ratio ${calc.seg.lr < 0.001 ? 'below 0.001' : calc.seg.lr.toFixed(3)}).`);
  }
  if (calc.func && calc.func.result) add(calc.func.result.code, calc.func.result.strength, `The functional assay’s controls give an OddsPath of ${calc.func.result.odds.toFixed(2)} (Brnich et al. 2019).`);
  if (calc.pheno && calc.pheno.specific && calc.pheno.rank != null && calc.pheno.rank <= 3) add('PP4', 'P', `The patient’s phenotype closely matches ${calc.pheno.disease} (ranked number ${calc.pheno.rank} of all diseases by the HPO comparison). Use PP4 only if the phenotype is highly specific for this gene.`);
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
