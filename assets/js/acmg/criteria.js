/* =====================================================================
   The 28 criteria of the ACMG/AMP guidelines (Richards et al. 2015), in
   our own words, with the strengths at which ClinGen's Sequence Variant
   Interpretation (SVI) group and the ACGS 2024 UK guidelines allow each
   to be used, and where to look for the evidence.

   dir: 'P' pathogenic, 'B' benign. def: the strength it has by default.
   strengths: the strengths it may be given (VS very strong, S strong,
   M moderate, P supporting, SA stand-alone).
   group: where the evidence comes from (the groups of the 2015 paper).
   section: the evidence section of a variant's page that holds it.
   ===================================================================== */

export const GROUPS = [
  { key: 'population', label: 'Population data' },
  { key: 'computational', label: 'Variant type and predictions' },
  { key: 'functional', label: 'Functional data' },
  { key: 'segregation', label: 'Segregation' },
  { key: 'denovo', label: 'De novo data' },
  { key: 'allelic', label: 'Allelic data' },
  { key: 'other', label: 'Phenotype and other data' },
  { key: 'database', label: 'Reputable sources (no longer used)' }
];

export const CRITERIA = [
  /* ---------------- pathogenic ---------------- */
  {
    code: 'PVS1', dir: 'P', def: 'VS', strengths: ['VS', 'S', 'M', 'P'], group: 'computational', section: 'type',
    name: 'Null variant where loss of function causes disease',
    short: 'A nonsense, frameshift, canonical ±1 or 2 splice site, start-loss or deletion of exons, in a gene where loss of function is a known way of causing the disease.',
    guide: [
      'Use it only when the gene–disease relationship is strong or definitive (the ACGS accepts moderate) and loss of function (LoF) is an established cause of the disease: e.g. several pathogenic LoF variants in ClinVar, a ClinGen haploinsufficiency score of 3, or Gene2Phenotype’s “loss of function” mechanism. Constraint (pLI, LOEUF) shows the gene is intolerant of LoF, not that LoF causes this disease. Never when the disease is caused by gain of function.',
      'Work out the strength with the ClinGen decision tree (Abou Tayoun et al. 2018), built into the PVS1 section of the variant’s page. A premature stop that triggers nonsense-mediated decay (NMD) usually keeps very strong; one that escapes NMD (in the last exon, or within 50 bases of the end of the penultimate one) is strong if it removes a critical region or more than 10% of the protein, moderate otherwise.',
      'Check the transcript: a variant in an exon that is skipped in the transcripts expressed in the relevant tissue may not cause LoF.',
      'Never with PM4, and not with PP3 for the same effect (ACGS: not with PP3 at all, nor with PM1, PP2, or PS3 alongside full-strength PVS1). With PM2_Supporting it makes a variant likely pathogenic (ClinGen 2020).',
      'The ACGS adds: a canonical +2T>C needs a SpliceAI score of 0.8 or more (or RNA evidence) before PVS1 is used, and +2C>T does not meet PVS1; a stop-loss with no in-frame stop in the 3′ UTR (nonstop decay) can meet PVS1.'
    ],
    refs: ['abou2018', 'richards2015', 'acgs2024']
  },
  {
    code: 'PS1', dir: 'P', def: 'S', strengths: ['S', 'M', 'P'], group: 'computational', section: 'clinvar',
    name: 'Same amino acid change as an established pathogenic variant',
    short: 'A different nucleotide change that gives the same amino acid change as a variant already established as pathogenic.',
    guide: [
      'E.g. c.34G>C and c.34G>T both give p.Gly12Arg: if c.34G>C is pathogenic, c.34G>T may meet PS1.',
      'Rule out a different effect on splicing first: if the established variant or this one changes splicing (SpliceAI), the two may not act alike.',
      'The established variant should be pathogenic by a reliable classification (e.g. a ClinVar expert panel, or several concordant submitters). If it is likely pathogenic, use PS1_Moderate (ACGS 2024 and ClinGen).',
      'ClinGen (Walker et al. 2023) also uses PS1 for splicing: a variant predicted to cause the same splicing change as a pathogenic splice variant at the same nucleotide (PS1) or in the same splice motif (PS1_Moderate), at least as strongly.'
    ],
    refs: ['richards2015', 'walker2023', 'acgs2024']
  },
  {
    code: 'PS2', dir: 'P', def: 'S', strengths: ['VS', 'S', 'M', 'P'], group: 'denovo', section: 'family',
    name: 'De novo, with maternity and paternity confirmed',
    short: 'The variant is de novo in a patient whose phenotype fits the gene, both parents have been tested, and parentage is confirmed, with no family history.',
    guide: [
      'Confirmed: both parents tested and do not have the variant, and maternity and paternity confirmed (e.g. by trio sequencing). Not confirmed: PM6.',
      'ClinGen’s points for each de novo occurrence (SVI recommendation 1.1): phenotype highly specific for the gene, 2 points if confirmed (1 if assumed); consistent but not highly specific, 1 (0.5); consistent but non-specific and very heterogeneous (e.g. developmental delay), 0.5 (0.25), at most 1 point in all; not consistent, 0. Occurrences in other published patients add up. 0.5 is supporting, 1 moderate, 2 strong and 4 very strong. The de novo calculator in the Family section adds them; the result is written PS2_x if any occurrence is confirmed, PM6_x if none is.',
      'The phenotype’s specificity is counted here, so don’t also use PP4 for the same patient’s phenotype (ACGS 2024).'
    ],
    refs: ['svi_denovo', 'richards2015', 'acgs2024']
  },
  {
    code: 'PS3', dir: 'P', def: 'S', strengths: ['VS', 'S', 'M', 'P'], group: 'functional', section: 'functional',
    name: 'Well-established functional studies show a damaging effect',
    short: 'A validated laboratory or in vivo assay shows that the variant damages the gene or its product.',
    guide: [
      'The assay must reflect the disease mechanism and have been validated with known pathogenic and benign variants (Brnich et al. 2019). Without a formal calculation, 10 controls or fewer allow supporting strength, 11 or more (of both kinds) moderate. With the odds of pathogenicity (OddsPath) worked out from the controls, any strength: above 2.1 supporting, 4.3 moderate, 18.7 strong, 350 very strong. The calculator in the Functional section does it.',
      'ACGS 2024: assays of the protein only; tests at the level of the gene or tissue (an enzyme assay, a biopsy) are evidence for PP4 instead.',
      'Patient-derived material (e.g. RNA from blood showing exon skipping) counts as functional evidence, and an RNA study of splicing may be used under PVS1 instead, but not both.',
      'Don’t count the same experiment twice under PS3 and PM1.'
    ],
    refs: ['brnich2019', 'richards2015', 'acgs2024']
  },
  {
    code: 'PS4', dir: 'P', def: 'S', strengths: ['VS', 'S', 'M', 'P'], group: 'population', section: 'clinvar',
    name: 'More common in patients than in controls',
    short: 'The variant is significantly more frequent in affected people than in controls (a case-control odds ratio over 5, with a confidence interval that does not include 1), or has been seen in several unrelated patients with the same phenotype.',
    guide: [
      'With a case-control study: an odds ratio above 5 whose 95% confidence interval excludes 1.',
      'For rare variants, counting unrelated affected people is used instead. ACGS 2024: moderate for two or more unrelated people with a rare, specific phenotype, the variant absent from gnomAD; supporting for one. ClinGen’s expert panels set their own counts for their genes, and some (e.g. TP53’s) allow PS4 up to very strong when many probands meet their criteria.',
      'For recessive disorders use PM3, not PS4. A case counts towards PS4 or PP4, not both.',
      'Don’t count relatives as separate probands (they belong to segregation, PP1).'
    ],
    refs: ['richards2015', 'acgs2024']
  },
  {
    code: 'PM1', dir: 'P', def: 'M', strengths: ['S', 'M', 'P'], group: 'functional', section: 'protein',
    name: 'In a mutational hotspot or a critical, well-studied domain',
    short: 'A missense change in a hotspot or a well-established functional domain (e.g. an enzyme’s active site) that has no benign variation.',
    guide: [
      'For missense and in-frame changes. Look at the gene’s protein view: are pathogenic missense variants clustered here, and are benign ones absent from the region?',
      'Many ClinGen expert panels define the gene’s hotspots or critical residues (the CSpec registry, shown in the Gene section). The ACGS 2024 guidelines allow PM1_Strong for some (e.g. FBN1’s calcium-binding EGF cysteines, glycines of a collagen triple helix) and PM1_Supporting for others; not for truncating or splicing variants.',
      'Don’t reuse the same evidence for PM5 or PP2.',
      'ClinGen (Pejaver et al. 2022) caps PM1 and PP3 together at strong: if PP3 is strong, PM1 can add at most supporting.'
    ],
    refs: ['richards2015', 'pejaver2022', 'acgs2024']
  },
  {
    code: 'PM2', dir: 'P', def: 'M', strengths: ['M', 'P'], group: 'population', section: 'population',
    name: 'Absent from controls, or extremely rare',
    short: 'Absent from population databases such as gnomAD, or at a frequency far too low to matter (for recessive disorders).',
    guide: [
      'The strength depends on the guidelines followed. ClinGen (2020) applies PM2 at supporting strength: PM2_Supporting. The ACGS 2024 guidelines keep it at moderate (PM2_mod), and use supporting when the population data are weak; with the ACGS, the frequency must also be at least ten times below the disorder’s BS1 threshold.',
      'ClinGen’s guidance for gnomAD v4 (2025): compare with a threshold calculated for the disorder rather than demand complete absence.',
      'Check the coverage: absence means something only where gnomAD sequenced the region well. Indels and repeats are called less reliably.',
      'For a recessive disorder a rare frequency can still meet PM2_Supporting, below the gene’s threshold (e.g. a grpmax filtering allele frequency below 0.0001, or one the frequency calculator gives).',
      'A variant cannot meet both PM2 and BS1 or BA1.'
    ],
    refs: ['svi_pm2', 'richards2015', 'acgs2024']
  },
  {
    code: 'PM3', dir: 'P', def: 'M', strengths: ['VS', 'S', 'M', 'P'], group: 'allelic', section: 'family',
    name: 'In trans with a pathogenic variant (recessive disorders)',
    short: 'For a recessive disorder, the variant is found in trans with a pathogenic or likely pathogenic variant in an affected person.',
    guide: [
      'ClinGen’s points (SVI recommendation 1.0), for each affected person: in trans with a pathogenic or likely pathogenic variant, phase confirmed, 1 point; phase not known, 0.5 with a pathogenic variant or 0.25 with a likely pathogenic one; homozygous, 0.5 (at most 1 point in all); in trans with a VUS, 0.25 (at most 0.5). 0.5 is supporting, 1 moderate, 2 strong and 4 very strong. The calculator in the Family section adds them.',
      'Phase: from the parents (one carries each), or from reads. Without phase the evidence is weaker.',
      'Both variants must be rare (meet PM2). One parent’s test is enough to set the phase.'
    ],
    refs: ['svi_pm3', 'richards2015', 'acgs2024']
  },
  {
    code: 'PM4', dir: 'P', def: 'M', strengths: ['M', 'P'], group: 'computational', section: 'type',
    name: 'Protein length changed (in-frame indel or stop-loss)',
    short: 'An in-frame deletion or insertion outside a repeat region, or a stop-loss variant, that changes the length of the protein.',
    guide: [
      'Not for indels in repetitive regions (use BP3 there if the region has no known function).',
      'Not together with PVS1 for the same variant.',
      'A single amino acid deletion may warrant PM4_Supporting.'
    ],
    refs: ['richards2015', 'acgs2024']
  },
  {
    code: 'PM5', dir: 'P', def: 'M', strengths: ['S', 'M', 'P'], group: 'computational', section: 'clinvar',
    name: 'A different pathogenic missense change at the same residue',
    short: 'A novel missense change at an amino acid where a different missense change has been established as pathogenic.',
    guide: [
      'E.g. p.Arg520Gln, where p.Arg520Trp is pathogenic.',
      'The other change should be pathogenic, and act through the protein (not splicing). Its own effect may be milder or worse: compare the amino acids (e.g. BLOSUM62 and the predictors).',
      'Several pathogenic changes at the same residue may support PM5_Strong (as some expert panels allow). Don’t use with PS1 for the same residue.'
    ],
    refs: ['richards2015', 'acgs2024']
  },
  {
    code: 'PM6', dir: 'P', def: 'M', strengths: ['VS', 'S', 'M', 'P'], group: 'denovo', section: 'family',
    name: 'Assumed de novo (parentage not confirmed)',
    short: 'De novo by testing the parents, without confirming maternity and paternity.',
    guide: [
      'ClinGen’s points for an assumed de novo occurrence are half those of a confirmed one (1 point with a consistent phenotype). The de novo calculator in the Family section adds confirmed and assumed occurrences together: use PS2 or PM6 for the result, whichever describes the occurrences, at the strength the points reach.'
    ],
    refs: ['svi_denovo', 'richards2015']
  },
  {
    code: 'PP1', dir: 'P', def: 'P', strengths: ['S', 'M', 'P'], group: 'segregation', section: 'family',
    name: 'Co-segregates with disease in the family',
    short: 'The variant is in affected relatives and segregates with the disease in a gene definitively known to cause it.',
    guide: [
      'Count informative meioses (Jarvik and Browning 2016, as the ACGS uses it): in one family, 3 is supporting (a chance of 1 in 8 that it is chance), 4 moderate (1 in 16) and 5 strong (1 in 32); across two or more families, 2, 3 and 4. Or weigh the whole pedigree with a likelihood ratio (the co-segregation calculator in the Family section): at least 2.08 supporting, 4.33 moderate and 18.7 strong on Tavtigian’s scale.',
      'Unaffected carriers count against it when penetrance is high; phenocopies make it weaker.',
      'Segregation shows linkage of the region, not that this variant is the cause: another variant nearby could explain it.'
    ],
    refs: ['jarvik2016', 'richards2015', 'tavtigian2018']
  },
  {
    code: 'PP2', dir: 'P', def: 'P', strengths: ['P'], group: 'computational', section: 'gene',
    name: 'Missense in a gene that has few benign missense variants',
    short: 'A missense variant in a gene with a low rate of benign missense variation, in which missense changes are a common cause of the disease.',
    guide: [
      'Evidence: gnomAD’s missense constraint (a missense Z score above 3.09 is often used), and many pathogenic but few benign missense variants in ClinVar.',
      'Some expert panels don’t use it, or restrict it to some regions of the gene.'
    ],
    refs: ['richards2015', 'acgs2024']
  },
  {
    code: 'PP3', dir: 'P', def: 'P', strengths: ['S', 'M', 'P'], group: 'computational', section: 'predictions',
    name: 'Computational evidence for a damaging effect',
    short: 'Computer predictions agree that the variant is damaging: to the protein (missense) or to splicing.',
    guide: [
      'ClinGen (Pejaver et al. 2022) recommends one calibrated predictor, chosen before looking, with its thresholds: e.g. REVEL ≥ 0.932 strong, ≥ 0.773 moderate, ≥ 0.644 supporting. The ACGS 2024 guidelines use PP3 at supporting strength only, with REVEL ≥ 0.7. The Predictions section shows where the variant’s scores fall.',
      'For splicing, SpliceAI ≥ 0.2 meets PP3 at supporting strength (Walker et al. 2023). Weigh the effect on the protein and on splicing separately, and use the more damaging.',
      'Not with PVS1 for the same effect. With PM1, the two together count at most as strong.'
    ],
    refs: ['pejaver2022', 'walker2023', 'richards2015']
  },
  {
    code: 'PP4', dir: 'P', def: 'P', strengths: ['S', 'M', 'P'], group: 'other', section: 'gene',
    name: 'Phenotype or family history highly specific for the gene',
    short: 'The patient’s phenotype or family history fits a disease with a single genetic cause very well.',
    guide: [
      'Only when the phenotype is highly specific for this gene (e.g. a recognisable syndrome, a specific biochemical test), and the test has looked at the other genes that could explain it.',
      'The ACGS 2024 guidelines allow PP4 at moderate or strong for highly specific phenotypes (e.g. a diagnostic enzyme assay), with care not to double count when the same phenotype is used to choose the patient for other evidence (PS4, PS2).',
      'The patient’s HPO terms are compared with the gene’s diseases in the Phenotype section.'
    ],
    refs: ['richards2015', 'acgs2024']
  },
  {
    code: 'PP5', dir: 'P', def: 'P', strengths: ['P'], group: 'database', section: 'clinvar', deprecated: true,
    name: 'A reputable source reports it as pathogenic',
    short: 'A reputable source reports the variant as pathogenic, but the evidence is not available to evaluate.',
    guide: [
      'ClinGen’s SVI (Biesecker and Harrison 2018) recommends not using PP5 and BP6: weigh the evidence behind other classifications instead, under the criteria it supports. The ACGS guidelines agree. Shown only if the setting for retired criteria is on.'
    ],
    refs: ['biesecker2018']
  },

  /* ---------------- benign ---------------- */
  {
    code: 'BA1', dir: 'B', def: 'SA', strengths: ['SA'], group: 'population', section: 'population',
    name: 'Too common to cause the disease (above 5%)',
    short: 'The allele frequency is above 5% in a population of gnomAD (or another large database).',
    guide: [
      'ClinGen (Ghosh et al. 2018): above 0.05 in a continental population with at least 2,000 alleles; for gnomAD v4, use the filtering allele frequency of the group with the highest one (grpmax FAF), which leaves out the Amish, Ashkenazi Jewish, Finnish and unassigned groups.',
      'Nine variants are exceptions, common yet pathogenic, among them HFE p.Cys282Tyr and p.His63Asp, GJB2 p.Val37Ile, BTD p.Asp444His and ACAD9 c.-44_-41dup (ClinGen’s list, which the site checks).',
      'BA1 alone makes a variant benign.'
    ],
    refs: ['ghosh2018', 'richards2015']
  },
  {
    code: 'BS1', dir: 'B', def: 'S', strengths: ['S', 'P'], group: 'population', section: 'population',
    name: 'More common than the disorder allows',
    short: 'The allele frequency is higher than expected for the disorder, given its prevalence, penetrance and genetic heterogeneity.',
    guide: [
      'Work out the highest credible allele frequency for a pathogenic variant (Whiffin et al. 2017) with the calculator in the Population section, and compare it with the grpmax filtering allele frequency.',
      'For a recessive disorder, use the carrier frequency; for a dominant one with incomplete penetrance, allow for it.',
      'BS1_Supporting is used by some expert panels just above their PM2 threshold.'
    ],
    refs: ['whiffin2017', 'richards2015', 'acgs2024']
  },
  {
    code: 'BS2', dir: 'B', def: 'S', strengths: ['S', 'P'], group: 'population', section: 'population',
    name: 'Seen in healthy adults where the disorder is fully penetrant early',
    short: 'Observed in a healthy adult: homozygous for a recessive disorder, heterozygous for a dominant one, or hemizygous for an X-linked one, when the disorder is fully penetrant at an early age.',
    guide: [
      'ACGS 2024: for a dominant disorder, two or more healthy, well-phenotyped heterozygous adults; for a recessive one, two or more healthy homozygotes (gnomAD’s are acceptable for a severe disorder of childhood). Ask for more for disorders of later onset.',
      'gnomAD is not screened for every disease, and some participants may be mildly affected.',
      'Not for late-onset or incompletely penetrant disorders.'
    ],
    refs: ['richards2015', 'acgs2024']
  },
  {
    code: 'BS3', dir: 'B', def: 'S', strengths: ['S', 'M', 'P'], group: 'functional', section: 'functional',
    name: 'Well-established functional studies show no damaging effect',
    short: 'A validated assay shows normal function.',
    guide: ['As for PS3: the strength depends on the assay’s validation (Brnich et al. 2019), and the assay must test the relevant function.'],
    refs: ['brnich2019', 'richards2015']
  },
  {
    code: 'BS4', dir: 'B', def: 'S', strengths: ['S', 'P'], group: 'segregation', section: 'family',
    name: 'Does not segregate in affected relatives',
    short: 'An affected relative does not carry the variant.',
    guide: [
      'Phenocopies (relatives affected for another reason) are common in some conditions, such as cancers: be careful.',
      'Make sure the relative really has the same disease, and that their test was reliable.'
    ],
    refs: ['richards2015', 'acgs2024']
  },
  {
    code: 'BP1', dir: 'B', def: 'P', strengths: ['S', 'P'], group: 'computational', section: 'gene',
    name: 'Missense in a gene where only truncating variants cause disease',
    short: 'A missense variant in a gene in which disease is caused mainly by truncating variants.',
    guide: ['E.g. many genes where loss of function is the only known mechanism and missense changes are not pathogenic. Check ClinVar for pathogenic missense variants first.'],
    refs: ['richards2015']
  },
  {
    code: 'BP2', dir: 'B', def: 'P', strengths: ['P'], group: 'allelic', section: 'family',
    name: 'In trans with a pathogenic variant in a dominant disorder, or in cis',
    short: 'Seen in trans with a pathogenic variant for a fully penetrant dominant disorder, or in cis with a pathogenic variant in any inheritance pattern.',
    guide: ['If a person already has the pathogenic variant on the other copy and is not more severely affected, this variant is unlikely to be pathogenic (for dominant disorders).'],
    refs: ['richards2015']
  },
  {
    code: 'BP3', dir: 'B', def: 'P', strengths: ['P'], group: 'computational', section: 'type',
    name: 'In-frame indel in a repeat without known function',
    short: 'An in-frame deletion or insertion in a repetitive region with no known function.',
    guide: ['The opposite of PM4: check that the repeat is not known to be functional (e.g. a polyglutamine tract whose expansion causes disease).'],
    refs: ['richards2015']
  },
  {
    code: 'BP4', dir: 'B', def: 'P', strengths: ['VS', 'S', 'M', 'P'], group: 'computational', section: 'predictions',
    name: 'Computational evidence for no impact',
    short: 'Computer predictions agree that the variant has no effect on the gene or its product.',
    guide: [
      'With one calibrated predictor (Pejaver et al. 2022): e.g. REVEL ≤ 0.290 supporting, ≤ 0.183 moderate, ≤ 0.016 strong and ≤ 0.003 very strong. The ACGS 2024 guidelines use BP4 at supporting strength only, with REVEL < 0.4.',
      'For splicing, SpliceAI ≤ 0.1 meets BP4 at supporting strength (Walker et al. 2023).',
      'For a synonymous or deep intronic variant with no predicted splicing effect, see BP7.'
    ],
    refs: ['pejaver2022', 'walker2023', 'richards2015']
  },
  {
    code: 'BP5', dir: 'B', def: 'P', strengths: ['P'], group: 'other', section: 'family',
    name: 'Found in a patient with another molecular cause',
    short: 'Found in a case with another explanation for the disease.',
    guide: ['Weak in practice: a person can carry two pathogenic variants (e.g. blended phenotypes, or a cancer predisposition alongside another cause). Not for recessive disorders where the second variant is unknown.'],
    refs: ['richards2015']
  },
  {
    code: 'BP6', dir: 'B', def: 'P', strengths: ['P'], group: 'database', section: 'clinvar', deprecated: true,
    name: 'A reputable source reports it as benign',
    short: 'A reputable source reports the variant as benign, but the evidence is not available to evaluate.',
    guide: ['Not recommended by ClinGen’s SVI (Biesecker and Harrison 2018) or the ACGS guidelines; see PP5.'],
    refs: ['biesecker2018']
  },
  {
    code: 'BP7', dir: 'B', def: 'P', strengths: ['S', 'P'], group: 'computational', section: 'splicing',
    name: 'Synonymous (or deep intronic) with no predicted splicing effect',
    short: 'A synonymous change, or an intronic one beyond the splice region, predicted not to affect splicing, at a position that is not highly conserved.',
    guide: [
      'ClinGen (Walker et al. 2023): only when BP4 is met for splicing (SpliceAI ≤ 0.1), and then the two are used together. Not at the first base or the last three bases of an exon. For intronic variants: +7 or further into the intron at its 5′ end, −21 or further at its 3′ end (−4 at the least).',
      'The ACGS 2024 guidelines also ask that the nucleotide is not highly conserved (e.g. phyloP below 0.1), and allow BP7 for untranslated regions.'
    ],
    refs: ['walker2023', 'richards2015']
  }
];

export const BY_CODE = Object.fromEntries(CRITERIA.map((c) => [c.code, c]));

/* ClinGen's BA1 exceptions (July 2018): common, yet pathogenic. Gene and coding change */
export const BA1_EXCEPTIONS = [
  ['ACAD9', 'c.-44_-41dup'], ['GJB2', 'c.109G>A'], ['HFE', 'c.187C>G'], ['HFE', 'c.845G>A'], ['MEFV', 'c.1105C>T'],
  ['MEFV', 'c.1223G>A'], ['PIBF1', 'c.1214G>A'], ['ACADS', 'c.511C>T'], ['BTD', 'c.1330G>C']
];
export function isBA1Exception(gene, hgvsc) {
  const c = String(hgvsc || '').split(':').pop().replace(/dupTAAG$/, 'dup');
  return BA1_EXCEPTIONS.some(([g, x]) => g === gene && x === c);
}

/* the papers the criteria's guidance comes from */
export const REFS = {
  richards2015: { text: 'Richards S et al. (2015) Standards and guidelines for the interpretation of sequence variants. Genet Med 17:405–424', url: 'https://doi.org/10.1038/gim.2015.30' },
  acgs2024: { text: 'Durkie M et al. (2024) ACGS Best Practice Guidelines for Variant Classification in Rare Disease 2024', url: 'https://www.acgs.uk.com/quality/best-practice-guidelines/' },
  abou2018: { text: 'Abou Tayoun AN et al. (2018) Recommendations for interpreting the loss of function PVS1 ACMG/AMP variant criterion. Hum Mutat 39:1517–1524', url: 'https://doi.org/10.1002/humu.23626' },
  tavtigian2018: { text: 'Tavtigian SV et al. (2018) Modeling the ACMG/AMP variant classification guidelines as a Bayesian classification framework. Genet Med 20:1054–1060', url: 'https://doi.org/10.1038/gim.2017.210' },
  tavtigian2020: { text: 'Tavtigian SV et al. (2020) Fitting a naturally scaled point system to the ACMG/AMP variant classification guidelines. Hum Mutat 41:1734–1737', url: 'https://doi.org/10.1002/humu.24088' },
  pejaver2022: { text: 'Pejaver V et al. (2022) Calibration of computational tools for missense variant pathogenicity classification and ClinGen recommendations for PP3/BP4 criteria. Am J Hum Genet 109:2163–2177', url: 'https://doi.org/10.1016/j.ajhg.2022.10.013' },
  walker2023: { text: 'Walker LC et al. (2023) Using the ACMG/AMP framework to capture evidence related to predicted and observed impact on splicing: recommendations from the ClinGen SVI Splicing Subgroup. Am J Hum Genet 110:1046–1067', url: 'https://doi.org/10.1016/j.ajhg.2023.06.002' },
  brnich2019: { text: 'Brnich SE et al. (2019) Recommendations for application of the functional evidence PS3/BS3 criterion using the ACMG/AMP sequence variant interpretation framework. Genome Med 12:3', url: 'https://doi.org/10.1186/s13073-019-0690-2' },
  ghosh2018: { text: 'Ghosh R et al. (2018) Updated recommendation for the benign stand-alone ACMG/AMP criterion. Hum Mutat 39:1525–1530', url: 'https://doi.org/10.1002/humu.23642' },
  whiffin2017: { text: 'Whiffin N et al. (2017) Using high-resolution variant frequencies to empower clinical genome interpretation. Genet Med 19:1151–1158', url: 'https://doi.org/10.1038/gim.2017.26' },
  jarvik2016: { text: 'Jarvik GP and Browning BL (2016) Consideration of cosegregation in the pathogenicity classification of genomic variants. Am J Hum Genet 98:1077–1081', url: 'https://doi.org/10.1016/j.ajhg.2016.04.003' },
  biesecker2018: { text: 'Biesecker LG and Harrison SM (2018) The ACMG/AMP reputable source criteria for the interpretation of sequence variants. Genet Med 20:1687–1688', url: 'https://doi.org/10.1038/gim.2018.42' },
  svi_pm2: { text: 'ClinGen SVI (2020) Recommendation for absence/rarity (PM2), version 1.0', url: 'https://clinicalgenome.org/working-groups/sequence-variant-interpretation/' },
  svi_denovo: { text: 'ClinGen SVI recommendation for de novo criteria (PS2 and PM6), version 1.1', url: 'https://clinicalgenome.org/working-groups/sequence-variant-interpretation/' },
  svi_pm3: { text: 'ClinGen SVI recommendation for in trans criterion (PM3), version 1.0', url: 'https://clinicalgenome.org/working-groups/sequence-variant-interpretation/' },
  riggs2020: { text: 'Riggs ER et al. (2020) Technical standards for the interpretation and reporting of constitutional copy-number variants. Genet Med 22:245–257', url: 'https://doi.org/10.1038/s41436-019-0686-8' }
};
