/* =====================================================================
   The ACMG/ClinGen technical standards for copy-number variants (Riggs
   et al. 2020, Genet Med 22:245; with the 2021 correction that changed
   the default for loss 5H from 0.30 to 0.15). Each item: its code, our
   wording, its default points, the range a curator may choose from,
   and how it combines.

   Points are kept as whole hundredths (pts: 45 = 0.45), so that sums
   are exact: 0.30 + 0.60 is 0.9 here, not 0.8999…

   Classes: pathogenic ≥ 0.99, likely pathogenic 0.90 to 0.98, uncertain
   −0.89 to 0.89, likely benign −0.90 to −0.98, benign ≤ −0.99.

   kind:  'once'   – scored once (default points, or a value in range)
          'case'   – points for each case or family, up to max (in total)
          'choice' – pick one of options
   group: items of the same group exclude each other
   cap:   a cap shared by several items (4A+4B+4C ≤ 0.90)
   ===================================================================== */

const SEC4_LEAD = {
  loss: 'A reported proband (in the literature, a database or your own laboratory) with a deletion of a gene in this interval, a loss-of-function variant in one, or an overlapping loss, whose phenotype is',
  gain: 'A reported proband (in the literature, a database or your own laboratory) with a complete duplication of a gene in this interval, or an overlapping gain, whose phenotype is'
};

function section4(type) {
  const lead = SEC4_LEAD[type];
  return [
    { code: '4A', kind: 'case', group: '4ABCD', cap: { key: '4ABC', max: 90 }, text: `${lead} highly specific to this gene or region and essentially unique to it`, perConfirmed: 45, perAssumed: 30, perMin: 15, perMax: 45, unit: 'de novo case' },
    { code: '4B', kind: 'case', group: '4ABCD', cap: { key: '4ABC', max: 90 }, text: `${lead} consistent with it and highly specific, but not unique`, perConfirmed: 30, perAssumed: 15, perMin: 0, perMax: 45, unit: 'de novo case' },
    { code: '4C', kind: 'case', group: '4ABCD', cap: { key: '4ABC', max: 90 }, text: `${lead} consistent with it but not specific, or genetically heterogeneous`, perConfirmed: 15, perAssumed: 10, perMin: 0, perMax: 30, unit: 'de novo case' },
    { code: '4D', kind: 'case', group: '4ABCD', text: `${lead} not consistent with what is known of the gene or region, or between cases`, per: 0, perMin: -30, perMax: 0, max: -30, unit: 'case' },
    { code: '4E', kind: 'case', text: 'A reported proband with a highly specific phenotype consistent with this gene or region, whose inheritance is not known (not for developmental delay or autism alone)', per: 10, perMin: 0, perMax: 15, max: 30, unit: 'case' },
    { code: '4F', kind: 'choice', group: '4FGH', text: 'Segregation with a consistent phenotype among affected relatives: 3 or 4 segregations', pts: 15, note: 'Count relatives who have both the CNV and the phenotype, and obligate carriers; families can be added together' },
    { code: '4G', kind: 'choice', group: '4FGH', text: '5 or 6 segregations', pts: 30 },
    { code: '4H', kind: 'choice', group: '4FGH', text: '7 or more segregations', pts: 45 },
    { code: '4I', kind: 'case', group: '4IJK', allowWith: ['4J'], text: 'Does not segregate: an affected relative with the same specific phenotype (where phenocopies are not known) lacks the CNV', per: -45, perMin: -45, perMax: 0, max: -90, unit: 'family' },
    { code: '4J', kind: 'case', group: '4IJK', allowWith: ['4I'], text: 'Does not segregate: an unaffected relative carries the CNV, and the proband’s phenotype is specific', per: -30, perMin: -30, perMax: 0, max: -90, unit: 'family' },
    { code: '4K', kind: 'case', group: '4IJK', text: 'Does not segregate: an unaffected relative carries the CNV, and the proband’s phenotype is not specific', per: -15, perMin: -15, perMax: 0, max: -30, unit: 'family' },
    { code: '4L', kind: 'case', group: '4LM', text: 'Case-control data: significantly more common in cases with a consistent, specific phenotype than in controls', per: 45, perMin: 0, perMax: 45, max: 45, unit: 'study', note: 'p < 0.05, odds or likelihood ratio > 5, lower bound of the 95% interval > 1' },
    { code: '4M', kind: 'case', group: '4LM', text: 'Case-control data: significantly more common in cases with a non-specific or unknown phenotype', per: 30, perMin: 0, perMax: 30, max: 45, unit: 'study' },
    { code: '4N', kind: 'case', text: 'Case-control data: no significant difference between cases and controls', per: -90, perMin: -90, perMax: 0, max: -90, unit: 'study', note: 'Mainly for CNVs that are fairly common (above 0.1%)' },
    { code: '4O', kind: 'once', text: 'Overlaps common population variation (e.g. at least 1% in the DGV Gold Standard)', pts: -100, min: -100, max: 0, note: 'Less weight below 1%. Not when the interval contains a well-known recessive gene whose loss of function causes disease.' }
  ];
}

function section5() {
  return [
    { code: '5A', kind: 'choice', group: '5', text: 'De novo in the patient: scored as a case under 4A to 4D', options: [
      { label: 'Phenotype highly specific and unique to the gene or region; de novo confirmed', pts: 45, min: 15, max: 45 },
      { label: 'Phenotype highly specific and unique; de novo assumed (parentage not confirmed)', pts: 30, min: 15, max: 45 },
      { label: 'Phenotype consistent and specific, not unique; confirmed', pts: 30, min: 0, max: 45 },
      { label: 'Phenotype consistent and specific, not unique; assumed', pts: 15, min: 0, max: 45 },
      { label: 'Phenotype consistent but not specific; confirmed', pts: 15, min: 0, max: 30 },
      { label: 'Phenotype consistent but not specific; assumed', pts: 10, min: 0, max: 30 },
      { label: 'Phenotype not consistent with the gene or region', pts: 0 }
    ] },
    { code: '5B', kind: 'choice', group: '5', text: 'Inherited from an apparently unaffected parent; the patient’s phenotype is specific, with no family history', pts: -30, min: -45, max: 0 },
    { code: '5C', kind: 'choice', group: '5', text: 'Inherited from an apparently unaffected parent; the patient’s phenotype is not specific', pts: -15, min: -30, max: 0 },
    { code: '5D', kind: 'choice', group: '5', text: 'Segregates with a consistent phenotype in the patient’s family: scored as for 4F to 4H', options: [
      { label: '3 or 4 segregations (as 4F)', pts: 15 },
      { label: '5 or 6 segregations (as 4G)', pts: 30 },
      { label: '7 or more segregations (as 4H)', pts: 45 }
    ] },
    { code: '5E', kind: 'choice', group: '5', text: 'Does not segregate with the phenotype in the patient’s family: scored as for 4I to 4K', options: [
      { label: 'An affected relative lacks the CNV (as 4I)', pts: -45, min: -45, max: 0 },
      { label: 'An unaffected relative carries it; specific phenotype (as 4J)', pts: -30, min: -30, max: 0 },
      { label: 'An unaffected relative carries it; non-specific phenotype (as 4K)', pts: -15, min: -15, max: 0 }
    ] },
    { code: '5F', kind: 'choice', group: '5', text: 'Inheritance not known or not informative', pts: 0 },
    { code: '5G', kind: 'choice', group: '5', text: 'Inheritance not known; non-specific phenotype, consistent with the cases reported', pts: 10, min: 0, max: 15 },
    { code: '5H', kind: 'choice', group: '5', text: 'Inheritance not known; highly specific phenotype, consistent with the cases reported', pts: 15, min: 0, max: 30, note: 'The 2021 correction changed the default for losses from 0.30 to 0.15' }
  ];
}

export const RUBRIC = {
  loss: [
    { key: '1', title: 'Genomic content', items: [
      { code: '1A', kind: 'choice', group: '1', text: 'Contains protein-coding genes or other known functionally important elements', pts: 0, note: 'Continue to section 2' },
      { code: '1B', kind: 'choice', group: '1', text: 'Does not contain protein-coding genes or any known functionally important elements', pts: -60 }
    ] },
    { key: '2', title: 'Overlap with established or predicted haploinsufficient (HI) genes or regions, and with benign regions', note: 'Established means a ClinGen haploinsufficiency score of 3; established benign, a score of 40. Skip to section 3 if there is no overlap.', items: [
      { code: '2A', kind: 'once', text: 'Contains a whole established HI gene or region (its critical region, for a region)', pts: 100, min: 0, max: 100 },
      { code: '2B', kind: 'once', text: 'Partly overlaps an established HI region, but the causative gene or critical region is not included, or not known', pts: 0 },
      { code: '2C-1', kind: 'choice', group: '2C', text: 'Partly overlaps an established HI gene: removes its 5′ end and some coding sequence (the 3′ end stays)', pts: 90, min: 45, max: 100 },
      { code: '2C-2', kind: 'choice', group: '2C', text: 'Partly overlaps an established HI gene: removes its 5′ end, but only the 5′ untranslated region', pts: 0, min: 0, max: 45 },
      { code: '2D-1', kind: 'choice', group: '2D', text: 'Removes the 3′ end of an established HI gene (the 5′ end stays): only the 3′ untranslated region', pts: 0 },
      { code: '2D-2', kind: 'choice', group: '2D', text: 'Removes only the last exon of an established HI gene, where other pathogenic variants are known', pts: 90, min: 45, max: 90 },
      { code: '2D-3', kind: 'choice', group: '2D', text: 'Removes only the last exon of an established HI gene, where no pathogenic variants are known', pts: 30, min: 0, max: 45 },
      { code: '2D-4', kind: 'choice', group: '2D', text: 'Removes the last exon and other exons of an established HI gene: nonsense-mediated decay is expected', pts: 90, min: 45, max: 100 },
      { code: '2E', kind: 'choice', group: '2E', text: 'Both breakpoints are within one established HI gene (an intragenic deletion): score with the PVS1 decision tree', options: [
        { label: 'PVS1 (very strong)', pts: 90, min: 45, max: 90 },
        { label: 'PVS1_Strong', pts: 45, min: 30, max: 90 },
        { label: 'PVS1_Moderate, or PM4 (in-frame, under 10% of the protein)', pts: 30, min: 15, max: 45 },
        { label: 'PVS1_Supporting', pts: 15, min: 0, max: 30 },
        { label: 'Not applicable', pts: 0 }
      ] },
      { code: '2F', kind: 'once', text: 'Completely contained within an established benign CNV region', pts: -100, min: -100, max: 0 },
      { code: '2G', kind: 'once', text: 'Overlaps an established benign CNV, but includes more genomic material', pts: 0 },
      { code: '2H', kind: 'once', text: 'Two or more haploinsufficiency predictors suggest that at least one gene in the interval is haploinsufficient', pts: 15, note: 'E.g. pLI ≥ 0.9, LOEUF < 0.35 (gnomAD v2; v4 uses < 0.6) and pHaplo ≥ 0.86. Not when the interval already contains a gene with an HI score of 3.' }
    ] },
    { key: '3', title: 'The number of protein-coding RefSeq genes, whole or in part', note: 'Families of genes of no known clinical relevance (e.g. olfactory receptors) count as one gene; clusters linked to disease count gene by gene.', items: [
      { code: '3A', kind: 'choice', group: '3', text: '0 to 24 genes', pts: 0, genes: [0, 24] },
      { code: '3B', kind: 'choice', group: '3', text: '25 to 34 genes', pts: 45, min: 0, max: 45, genes: [25, 34] },
      { code: '3C', kind: 'choice', group: '3', text: '35 or more genes', pts: 90, min: 0, max: 90, genes: [35, Infinity] }
    ] },
    { key: '4', title: 'Detailed evaluation of genomic content: published literature, public databases and internal laboratory data', note: 'Skip to section 5 if section 2 already gave points for an established HI gene or region, or if nothing reported links the CNV or its genes to a phenotype.', items: section4('loss') },
    { key: '5', title: 'Evaluation of inheritance pattern and family history in the patient', items: section5() }
  ],
  gain: [
    { key: '1', title: 'Genomic content', items: [
      { code: '1A', kind: 'choice', group: '1', text: 'Contains protein-coding genes or other known functionally important elements', pts: 0, note: 'Continue to section 2' },
      { code: '1B', kind: 'choice', group: '1', text: 'Does not contain protein-coding genes or any known functionally important elements', pts: -60 }
    ] },
    { key: '2', title: 'Overlap with established triplosensitive (TS), haploinsufficient (HI) or benign genes or regions', note: 'Established means a ClinGen score of 3; established benign, a score of 40. Skip to section 3 if there is no overlap.', items: [
      { code: '2A', kind: 'once', text: 'Contains a whole established TS gene or minimal critical region', pts: 100, min: 0, max: 100 },
      { code: '2B', kind: 'once', text: 'Partly overlaps an established TS region, but the causative gene or critical region is not included, or not known', pts: 0 },
      { code: '2C', kind: 'choice', group: '2CDEFG', text: 'Identical in gene content to an established benign copy-number gain', pts: -100 },
      { code: '2D', kind: 'choice', group: '2CDEFG', text: 'Smaller than an established benign gain; its breakpoints do not interrupt protein-coding genes', pts: -100 },
      { code: '2E', kind: 'choice', group: '2CDEFG', text: 'Smaller than an established benign gain; a breakpoint may interrupt a protein-coding gene', pts: 0 },
      { code: '2F', kind: 'choice', group: '2CDEFG', text: 'Larger than an established benign gain, but with no further protein-coding genes', pts: -100, min: -100, max: 0, note: 'ClinGen’s online calculator shows −0.90 here; the paper gives −1.00' },
      { code: '2G', kind: 'choice', group: '2CDEFG', text: 'Overlaps a benign gain but includes more genomic material', pts: 0 },
      { code: '2H', kind: 'once', text: 'Contains a whole established HI gene', pts: 0, note: 'A gain of a haploinsufficient gene is not by itself evidence: continue' },
      { code: '2I', kind: 'choice', group: '2I', text: 'Both breakpoints are within one established HI gene (the gene may be disrupted): score with the PVS1 decision tree', options: [
        { label: 'PVS1 (very strong)', pts: 90, min: 45, max: 90 },
        { label: 'PVS1_Strong', pts: 45, min: 30, max: 90 },
        { label: 'Not applicable', pts: 0 }
      ] },
      { code: '2J', kind: 'choice', group: '2JK', text: 'One breakpoint is within an established HI gene; the patient’s phenotype is not consistent with its loss, or not known', pts: 0 },
      { code: '2K', kind: 'choice', group: '2JK', text: 'One breakpoint is within an established HI gene; the patient’s phenotype is highly specific and consistent with its loss', pts: 45 },
      { code: '2L', kind: 'once', text: 'Breakpoints within genes of no established clinical significance', pts: 0 }
    ] },
    { key: '3', title: 'The number of protein-coding RefSeq genes, whole or in part', items: [
      { code: '3A', kind: 'choice', group: '3', text: '0 to 34 genes', pts: 0, genes: [0, 34] },
      { code: '3B', kind: 'choice', group: '3', text: '35 to 49 genes', pts: 45, min: 0, max: 45, genes: [35, 49] },
      { code: '3C', kind: 'choice', group: '3', text: '50 or more genes', pts: 90, min: 0, max: 90, genes: [50, Infinity] }
    ] },
    { key: '4', title: 'Detailed evaluation of genomic content: published literature, public databases and internal laboratory data', note: 'Skip to section 5 if nothing reported links the gain or its genes to a phenotype of triplosensitivity.', items: section4('gain') },
    { key: '5', title: 'Evaluation of inheritance pattern and family history in the patient', items: section5() }
  ]
};

export const CNV_THRESHOLDS = { p: 99, lp: 90, lb: -90, b: -99 };
export function cnvClass(total) {
  if (total >= 99) return 'p';
  if (total >= 90) return 'lp';
  if (total <= -99) return 'b';
  if (total <= -90) return 'lb';
  return 'vus';
}
export const fmtPts = (h) => (h > 0 ? '+' : h < 0 ? '−' : '') + (Math.abs(h) / 100).toFixed(2);

export function itemOf(type, code) {
  for (const s of RUBRIC[type]) for (const it of s.items) if (it.code === code) return it;
  return null;
}

/**
 * The points of each item chosen, and the total.
 *   state.items: { code: { on: true, pts (hundredths, a value the curator chose), option (index), cases: [{confirmed, pts}] } }
 */
export function score(type, state) {
  const chosen = (state && state.items) || {};
  const rows = [];
  const capUse = {};
  let total = 0;
  for (const s of RUBRIC[type]) {
    for (const it of s.items) {
      const c = chosen[it.code];
      if (!c || !c.on) continue;
      let pts = 0;
      if (it.kind === 'case') {
        for (const cs of c.cases || []) pts += cs.pts != null ? cs.pts : (it.perConfirmed != null ? (cs.confirmed === false ? it.perAssumed : it.perConfirmed) : it.per);
        if (it.max != null) pts = it.max < 0 ? Math.max(it.max, pts) : Math.min(it.max, pts);
      } else if (it.options) {
        const o = it.options[c.option || 0];
        pts = c.pts != null && o.min != null ? clampPts(c.pts, o.min, o.max) : o.pts;
      } else {
        pts = c.pts != null && it.min != null ? clampPts(c.pts, it.min, it.max) : it.pts;
      }
      if (it.cap) {
        const used = capUse[it.cap.key] || 0;
        const room = it.cap.max - used;
        if (pts > room) pts = Math.max(0, room);
        capUse[it.cap.key] = used + pts;
      }
      rows.push({ code: it.code, section: s.key, pts });
      total += pts;
    }
  }
  return { total, rows, cls: cnvClass(total) };
}
const clampPts = (v, a, b) => Math.max(Math.min(a, b), Math.min(Math.max(a, b), Math.round(v)));

/** the items that exclude each other: choosing one turns the others of its group off */
export function exclusions(type, code) {
  const it = itemOf(type, code);
  if (!it || !it.group) return [];
  const out = [];
  for (const s of RUBRIC[type]) for (const x of s.items) if (x.code !== code && x.group === it.group && !(it.allowWith || []).includes(x.code)) out.push(x.code);
  // section 2: the partial-overlap items of a loss are alternatives for one gene, so 2C and 2D exclude each other's options only
  return out;
}
