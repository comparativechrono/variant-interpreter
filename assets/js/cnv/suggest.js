/* =====================================================================
   Suggestions for a copy-number variant's points (Riggs et al. 2020),
   from what the page found: the genes and ClinGen's dosage curations in
   the region, population CNVs, and how the patient came to have it.
   Pure: no page, no network, so that it can be tested.

     suggestCNV(input) → { code: { pts, option, why, look } }
       pts in hundredths, as cnv/rubric.js keeps them; option: the index
       of an item's option; look: true when the evidence points at an
       item but only the student can choose its points (no "Apply").

   input: {
     type: 'loss' | 'gain', start, end,
     genes:   [{ symbol, pc, whole, inside, five, three, hi, ts, hiWhy: [] }],
                 pc: protein-coding; whole: the whole gene is in the CNV; inside: the CNV is
                 within the gene (both breakpoints in it); five/three: the CNV holds the gene's
                 5′ or 3′ end; hiWhy: the haploinsufficiency predictors it meets (genes.js)
     regions: [{ id, name, hi, ts, whole, inside, coverOfRegion, genes: [symbols] }]
                 ClinGen's curated regions overlapping it; whole: the region is all in the CNV;
                 inside: the CNV is all within the region
     pop:     [{ source, type, af, coverOfCnv }]  population CNVs of the same kind
     inheritance: a key of INHERITANCE (summary.js); parentAffected: true | false | null
   }
   ===================================================================== */

/* families of genes of no known clinical relevance count as one gene each (the rubric's note to section 3) */
export const GENE_FAMILIES = [
  [/^OR\d+[A-Z]+\d+[A-Z]?\d*(P)?$/, 'olfactory receptor genes (OR)'],
  [/^KRTAP\d/, 'keratin-associated protein genes (KRTAP)'],
  [/^LCE\d/, 'late cornified envelope genes (LCE)'],
  [/^DEFB\d/, 'β-defensin genes (DEFB)'],
  [/^TAS2R\d/, 'bitter taste receptor genes (TAS2R)'],
  [/^PRAMEF\d/, 'PRAME family genes (PRAMEF)'],
  [/^USP17L\d/, 'USP17L genes'],
  [/^NBPF\d/, 'NBPF genes'],
  [/^GAGE\d/, 'GAGE genes']
];

/** the number of protein-coding genes as section 3 counts them: families of no known relevance as one each */
export function geneCount(genes) {
  const pc = (genes || []).filter((g) => g.pc !== false);
  const fams = new Map();
  let n = 0;
  for (const g of pc) {
    const f = GENE_FAMILIES.find(([rx]) => rx.test(g.symbol || ''));
    if (f) fams.set(f[1], (fams.get(f[1]) || 0) + 1);
    else n++;
  }
  // (a family with one gene here counts as that gene: only those with two or more are told of)
  return { all: pc.length, counted: n + fams.size, families: Array.from(fams, ([name, k]) => ({ name, n: k })).filter((f) => f.n >= 2) };
}

/* the bands of section 3, by the number of genes */
export const SECTION3 = { loss: [[0, 24, '3A', 0], [25, 34, '3B', 45], [35, Infinity, '3C', 90]], gain: [[0, 34, '3A', 0], [35, 49, '3B', 45], [50, Infinity, '3C', 90]] };

const list = (xs, n = 6) => (xs.length <= n ? xs.join(', ') : xs.slice(0, n).join(', ') + ` and ${xs.length - n} more`);
const pctTxt = (x) => `${Math.round(x * 100)}%`;
const DENOVO = ['denovo-confirmed', 'denovo-assumed', 'denovo-mosaic'];
const INHERITED = ['maternal', 'paternal', 'maternal-mosaic', 'paternal-mosaic'];

/* The items of section 2 that involve an established haploinsufficient gene or region: 2H is not used with them (ACGS 2024) */
export const HI_GENE_ITEMS = ['2A', '2B', '2C-1', '2C-2', '2D-1', '2D-2', '2D-3', '2D-4'];
/** how many independent haploinsufficiency predictors a gene meets: pLI and LOEUF both come from gnomAD's constraint, so count once */
export function hiSources(why = []) {
  const kinds = new Set(why.map((w) => (/^(pLI|LOEUF)\b/.test(w) ? 'gnomAD constraint' : w.split(' ')[0])));
  return kinds.size;
}

export function suggestCNV(input) {
  const type = input.type === 'gain' ? 'gain' : 'loss';
  const genes = input.genes || [];
  const regions = input.regions || [];
  const pop = input.pop || [];
  const out = {};
  const add = (code, s) => {
    if (!out[code]) out[code] = s;
  };
  const pc = genes.filter((g) => g.pc !== false);
  const established = regions.filter((r) => (type === 'loss' ? r.hi === 3 : r.ts === 3));

  /* ---- section 1 ---- */
  if (pc.length || established.length) add('1A', { pts: 0, why: pc.length ? `The CNV contains ${pc.length} protein-coding ${pc.length === 1 ? 'gene' : 'genes'}${pc.length <= 6 ? ` (${list(pc.map((g) => g.symbol))})` : ''}.` : `The CNV contains no protein-coding genes, but it overlaps ClinGen’s ${list(established.map((r) => r.name || r.id))}.` });
  else add('1B', { pts: -60, why: 'The CNV contains no protein-coding genes and overlaps no region that ClinGen has curated. Before you use 1B, check that it holds no other known functional elements, such as an enhancer of a disease gene.' });

  /* ---- section 2 ---- */
  if (type === 'loss') {
    const hiWhole = pc.filter((g) => g.hi === 3 && g.whole);
    const regWhole = regions.filter((r) => r.hi === 3 && r.whole);
    if (hiWhole.length || regWhole.length) {
      const what = [];
      if (regWhole.length) what.push(`the whole of ClinGen’s ${list(regWhole.map((r) => r.name || r.id), 3)} (haploinsufficiency 3)`);
      if (hiWhole.length) what.push(`the whole of ${hiWhole.length === 1 ? 'an established haploinsufficient gene' : hiWhole.length + ' established haploinsufficient genes'}, ${list(hiWhole.map((g) => g.symbol))}`);
      add('2A', { pts: 100, why: `This deletion contains ${what.join(', and ')}.` });
    } else {
      const regPart = regions.filter((r) => r.hi === 3 && !r.whole);
      if (regPart.length) {
        const r = regPart[0];
        add('2B', { pts: 0, why: `This deletion partly overlaps ClinGen’s ${r.name || r.id} (haploinsufficiency 3), covering ${pctTxt(r.coverOfRegion || 0)} of it. Use 2B if the region’s causative gene or critical region is not in the deletion, or 2A if it is.` });
      }
    }
    for (const g of pc.filter((x) => x.hi === 3 && !x.whole)) {
      if (g.inside) add('2E', { look: true, why: `Both breakpoints are within ${g.symbol}, an established haploinsufficient gene, so this is an intragenic deletion. Work out its strength with the PVS1 decision tree, which asks whether the deleted exons are in frame and whether NMD is expected.` });
      else if (g.five && !g.three) add('2C-1', { pts: 90, why: `This deletion removes the 5′ end of ${g.symbol}, an established haploinsufficient gene. Use 2C-1 if coding sequence is removed, or 2C-2 if only the 5′ untranslated region is.` });
      else if (g.three && !g.five) add('2D-4', { look: true, why: `This deletion removes the 3′ end of ${g.symbol}, an established haploinsufficient gene. Check which exons are lost. If only the 3′ untranslated region goes, use 2D-1. If only the last exon goes, use 2D-2 or 2D-3, depending on whether pathogenic variants are known in that exon. If the last exon and others go, so that NMD is expected, use 2D-4.` });
    }
    const benign = regions.filter((r) => r.hi === 40);
    const inBenign = benign.find((r) => r.inside);
    if (inBenign) add('2F', { pts: -100, why: `This deletion lies entirely within ClinGen’s established benign region ${inBenign.name || inBenign.id} (score 40).` });
    else if (benign.length) add('2G', { pts: 0, why: `This deletion overlaps ClinGen’s established benign region ${benign[0].name || benign[0].id} but includes more, so you still need to score the rest.` });
    // ACGS 2024: not once 2A–2D-4 apply (an established HI gene or region is involved), and pLI and LOEUF,
    // from the same gnomAD data, count as one predictor
    if (!HI_GENE_ITEMS.some((k) => out[k])) {
      const pred = pc.filter((g) => hiSources(g.hiWhy) >= 2 && g.hi !== 3);
      if (pred.length) add('2H', { pts: 15, why: `Two or more independent predictors say at least one gene is haploinsufficient: ${list(pred.map((g) => `${g.symbol} (${g.hiWhy.join('; ')})`), 3)}. Count 2H once, however many genes qualify.` });
    }
  } else {
    const tsWhole = pc.filter((g) => g.ts === 3 && g.whole);
    const regWhole = regions.filter((r) => r.ts === 3 && r.whole);
    if (tsWhole.length || regWhole.length) {
      const what = [];
      if (regWhole.length) what.push(`the whole of ClinGen’s ${list(regWhole.map((r) => r.name || r.id), 3)} (triplosensitivity 3)`);
      if (tsWhole.length) what.push(`the whole of ${tsWhole.length === 1 ? 'an established triplosensitive gene' : tsWhole.length + ' established triplosensitive genes'}, ${list(tsWhole.map((g) => g.symbol))}`);
      add('2A', { pts: 100, why: `This gain contains ${what.join(', and ')}.` });
    } else {
      const regPart = regions.filter((r) => r.ts === 3 && !r.whole);
      if (regPart.length) add('2B', { pts: 0, why: `This gain partly overlaps ClinGen’s ${regPart[0].name || regPart[0].id} (triplosensitivity 3), covering ${pctTxt(regPart[0].coverOfRegion || 0)} of it. Use 2B if its critical region is not in the gain.` });
    }
    // established benign gains (ClinGen triplosensitivity 40)
    const benign = regions.filter((r) => r.ts === 40);
    if (benign.length) {
      const r = benign[0];
      const mine = new Set(pc.map((g) => g.symbol));
      const theirs = new Set(r.genes || []);
      const extra = [...mine].filter((s) => !theirs.has(s));
      const missing = [...theirs].filter((s) => !mine.has(s));
      const cutsGenes = pc.some((g) => !g.whole);
      const name = r.name || r.id;
      if (r.whole && r.inside) add('2C', { pts: -100, why: `This gain has the same extent as ClinGen’s established benign gain ${name}.` });
      else if (!extra.length && !missing.length && r.genes) add('2C', { pts: -100, why: `This gain has the same protein-coding genes as ClinGen’s established benign gain ${name}.` });
      else if (r.inside) add(cutsGenes ? '2E' : '2D', cutsGenes
        ? { pts: 0, why: `This gain is smaller than ClinGen’s established benign gain ${name}, but a breakpoint may interrupt a protein-coding gene (${list(pc.filter((g) => !g.whole).map((g) => g.symbol), 3)}).` }
        : { pts: -100, why: `This gain is smaller than ClinGen’s established benign gain ${name}, and its breakpoints do not interrupt protein-coding genes.` });
      else if (r.whole && !extra.length) add('2F', { pts: -100, why: `This gain is larger than ClinGen’s established benign gain ${name}, but it holds no further protein-coding genes.` });
      else add('2G', { pts: 0, why: `This gain overlaps ClinGen’s established benign gain ${name} but includes more${extra.length ? ` (${list(extra, 4)})` : ''}, so you still need to score the rest.` });
    }
    const hi = pc.filter((g) => g.hi === 3);
    const hiWhole = hi.filter((g) => g.whole);
    if (hiWhole.length) add('2H', { pts: 0, why: `This gain contains the whole of an established haploinsufficient gene (${list(hiWhole.map((g) => g.symbol), 4)}). A gain of such a gene is not evidence by itself, so continue the evaluation.` });
    const hiIn = hi.find((g) => g.inside);
    if (hiIn) add('2I', { look: true, why: `Both breakpoints are within ${hiIn.symbol}, an established haploinsufficient gene, and a duplication within a gene may disrupt it. Work out its strength with the PVS1 decision tree, which asks whether the duplication is in tandem and whether it breaks the reading frame.` });
    else {
      const cut = hi.find((g) => !g.whole);
      if (cut) add('2J', { pts: 0, why: `One breakpoint is within ${cut.symbol}, an established haploinsufficient gene. Use 2K (+0.45) instead if the patient’s phenotype is highly specific and consistent with its loss.` });
    }
  }

  /* ---- section 3 ---- */
  const n = geneCount(pc);
  const band = SECTION3[type].find(([lo, hi]) => n.counted >= lo && n.counted <= hi);
  if (band) {
    const fs = n.families.map((f) => `the ${f.n} ${f.name}`);
    const fam = !fs.length ? '' : fs.length === 1 ? `. There are ${n.all} in all, but ${fs[0]} count as one, as a family of genes of no known clinical relevance`
      : `. There are ${n.all} in all, but ${fs.slice(0, -1).join(', ')} and ${fs[fs.length - 1]} each count as one, as families of genes of no known clinical relevance`;
    add(band[2], { pts: band[3], why: `Section 3 counts ${n.counted} protein-coding ${n.counted === 1 ? 'gene' : 'genes'}${fam}.` });
  }

  /* ---- section 4: common in the population (4O) ---- */
  const same = pop.filter((p) => p.type === type && p.af != null);
  const common = same.filter((p) => p.af >= 0.01 && (p.coverOfCnv || 0) >= 0.9).sort((a, b) => b.af - a.af);
  if (common.length) {
    const c = common[0];
    add('4O', { pts: -100, why: `${c.source} has a ${type === 'loss' ? 'deletion' : 'duplication'} covering ${pctTxt(c.coverOfCnv)} of this CNV in ${(c.af * 100).toFixed(c.af >= 0.1 ? 0 : 1)}% of people${c.id ? ` (${c.id})` : ''}. Before you use 4O, check that the region holds no well-known recessive gene.` });
  } else {
    const fairly = same.filter((p) => p.af >= 0.001 && (p.coverOfCnv || 0) >= 0.9).sort((a, b) => b.af - a.af);
    if (fairly.length) add('4O', { look: true, why: `${fairly[0].source} has a ${type === 'loss' ? 'deletion' : 'duplication'} covering most of this CNV in ${(fairly[0].af * 100).toFixed(2)}% of people. That is below 1%, so 4O deserves less than its full weight, if any.` });
  }

  /* ---- section 5: the patient (only for a patient's CNV: inheritance null means none) ---- */
  const inh = input.inheritance == null ? null : input.inheritance || 'unknown';
  if (inh == null) {
    // no patient: nothing to say about section 5
  } else if (DENOVO.includes(inh)) {
    const confirmed = inh === 'denovo-confirmed';
    add('5A', { option: confirmed ? 4 : 5, pts: confirmed ? 15 : 10, why: `The CNV is de novo in the patient${confirmed ? ', with both parents tested and parentage confirmed' : inh === 'denovo-mosaic' ? ', in mosaic form' : ', but parentage is not confirmed'}. The points depend on how well the patient’s phenotype fits the region. They are 0.45 for a phenotype that is highly specific and unique to it, 0.30 for specific but not unique, 0.15 for consistent but not specific, and 0 for not consistent. If de novo is only assumed, the first three drop to 0.30, 0.15 and 0.10. This suggestion assumes “consistent but not specific”.` });
  } else if (INHERITED.includes(inh)) {
    const who = /^maternal/.test(inh) ? 'mother' : 'father';
    if (input.parentAffected === false) add('5C', { pts: -15, why: `The CNV was inherited from the ${who}, who is unaffected according to the pedigree. Use 5B (−0.30) instead if the patient’s phenotype is specific and there is no family history.` });
    else if (input.parentAffected === true) add('5D', { look: true, why: `The CNV was inherited from the ${who}, who is affected according to the pedigree. Count the segregations in the family and score 5D, whose first option needs 3 or 4.` });
    else add('5F', { pts: 0, why: `The CNV was inherited from the ${who}, but the pedigree does not say whether the ${who} is affected. If they are unaffected, 5B or 5C apply, and you can record the ${who}’s phenotype on the Family tab.` });
  } else if (inh === 'balanced') {
    add('5A', { look: true, why: 'The patient’s unbalanced form arose from a parent’s balanced rearrangement. The imbalance is new in the patient, so you can score it as de novo, according to how well the phenotype fits.' });
  } else if (['unknown', 'notmaternal', 'notpaternal', ''].includes(inh)) {
    add('5F', { pts: 0, why: inh === 'notmaternal' || inh === 'notpaternal' ? 'Only one parent was tested, so the inheritance is not known.' : 'The parents were not tested, so the inheritance is not known. If the phenotype is consistent with the region’s, 5G (non-specific) or 5H (highly specific) may apply.' });
  }
  return out;
}
