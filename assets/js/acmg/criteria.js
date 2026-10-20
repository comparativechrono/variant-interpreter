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
    short: 'A nonsense, frameshift, canonical ±1 or 2 splice site or start-loss variant, or a deletion of one or more exons, in a gene where loss of function is a known cause of the disease.',
    guide: [
      'Use it only when the gene–disease relationship is strong or definitive, as the decision tree assumes (Abou Tayoun et al. 2018), and loss of function (LoF) is an established cause of the disease. The paper’s Table 1 also allows a moderate relationship, with PVS1 one or two levels lower, and the ACGS 2024 guidelines accept moderate. As evidence that LoF causes the disease, look for several pathogenic LoF variants in ClinVar, a ClinGen haploinsufficiency score of 3, or Gene2Phenotype’s “loss of function” mechanism. Constraint (pLI, LOEUF) shows that the gene is intolerant of LoF, which doesn’t prove that LoF causes this disease. Never use it when the disease is caused by gain of function.',
      'Work out the strength with ClinGen’s decision tree (Abou Tayoun et al. 2018), which is built into the Variant type and PVS1 section of the variant’s page. A premature stop that triggers nonsense-mediated decay (NMD) usually stays very strong. One that escapes NMD, because it is in the last exon or within 50 bases of the end of the penultimate one, is strong if it removes a critical region or more than 10% of the protein, and moderate otherwise.',
      'Check the transcript. A variant in an exon that is skipped in the transcripts expressed in the relevant tissue may not cause LoF.',
      'Don’t use it with PM4, or with PP3 for the same effect. The ACGS 2024 guidelines never use it with PM1, PM4, PP2 or PP3, and don’t use PS3 with it when PVS1 is very strong. For a variant that escapes NMD, functional evidence may raise PVS1 instead. With PM2_Supporting, PVS1 makes a variant likely pathogenic (ClinGen 2020).',
      'The ACGS adds some rules of its own. A canonical +2T>C change needs a SpliceAI score of 0.8 or more, or RNA evidence, before PVS1 is used, and a +2C>T change doesn’t meet PVS1. A stop-loss with no in-frame stop in the 3′ UTR can meet PVS1, because nonstop decay is expected.'
    ],
    refs: ['abou2018', 'richards2015', 'acgs2024']
  },
  {
    code: 'PS1', dir: 'P', def: 'S', strengths: ['S', 'M', 'P'], group: 'computational', section: 'clinvar',
    name: 'Same amino acid change as an established pathogenic variant',
    short: 'A different nucleotide change that gives the same amino acid change as a variant already established as pathogenic.',
    guide: [
      'For example, if codon 12 is GTG (valine), c.34G>C and c.34G>T both give p.Val12Leu, so if c.34G>C is pathogenic, c.34G>T may meet PS1. This is the example Richards et al. (2015) give.',
      'First rule out a different effect on splicing. If SpliceAI predicts that the established variant or this one changes splicing, the two may not act alike.',
      'The established variant should be pathogenic by a reliable classification, for example from a ClinVar expert panel or several submitters who agree. If it is likely pathogenic, use PS1_Moderate (ACGS 2024 and ClinGen).',
      'ClinGen (Walker et al. 2023) also uses PS1 for splicing. A variant predicted to cause the same splicing change as a pathogenic splice variant, at least as strongly, meets PS1 if it is at the same nucleotide, or PS1_Moderate if it is in the same splice motif.'
    ],
    refs: ['richards2015', 'walker2023', 'acgs2024']
  },
  {
    code: 'PS2', dir: 'P', def: 'S', strengths: ['VS', 'S', 'M', 'P'], group: 'denovo', section: 'family',
    name: 'De novo, with maternity and paternity confirmed',
    short: 'The variant is de novo in a patient whose phenotype fits the gene and who has no family history. Both parents have been tested, and parentage is confirmed.',
    guide: [
      'A de novo variant is confirmed when both parents have been tested and don’t have it, and maternity and paternity are confirmed (for example by trio sequencing). If it isn’t confirmed, use PM6.',
      'ClinGen gives points for each de novo occurrence (SVI recommendation 1.1). A phenotype highly specific for the gene scores 2 points if the occurrence is confirmed, or 1 if it is assumed. A consistent but not highly specific phenotype scores 1 (0.5 if assumed). A consistent but non-specific and very heterogeneous phenotype, such as developmental delay, scores 0.5 (0.25 if assumed), and such occurrences add at most 1 point in all. A phenotype that isn’t consistent scores 0. Occurrences in other published patients add up. A total of 0.5 is supporting, 1 moderate, 2 strong and 4 very strong. The de novo calculator in the Patient and family section adds them up, and writes the result as PS2_x if any occurrence is confirmed, or PM6_x if none is.',
      'The points already count how specific the phenotype is, so don’t also use PP4 for the same patient’s phenotype (ACGS 2024).'
    ],
    refs: ['svi_denovo', 'richards2015', 'acgs2024']
  },
  {
    code: 'PS3', dir: 'P', def: 'S', strengths: ['VS', 'S', 'M', 'P'], group: 'functional', section: 'functional',
    name: 'Well-established functional studies show a damaging effect',
    short: 'A validated laboratory or in vivo assay shows that the variant damages the gene or its product.',
    guide: [
      'The assay must reflect the disease mechanism and must have been validated with known pathogenic and benign variants (Brnich et al. 2019). Without a formal calculation, 10 controls or fewer allow supporting strength, and 11 or more (of both kinds) allow moderate. If you work out the odds of pathogenicity (OddsPath) from the controls, any strength is possible: above 2.1 is supporting, above 4.3 moderate, above 18.7 strong and above 350 very strong. The calculator in the Functional data section does this for you.',
      'Under the ACGS 2024 guidelines, PS3 is for assays of the protein only. Tests at the level of the gene or tissue, such as an enzyme assay or a biopsy, count towards PP4 instead.',
      'Don’t use it for RNA studies of splicing, whether from the patient’s blood or a minigene. ClinGen (Walker et al. 2023) and the ACGS 2024 guidelines put those under PVS1 (RNA) when splicing is abnormal, or BP7 (RNA) when it is normal. PS3 is for assays of the protein’s function, so using it as well would count the splicing twice.',
      'Don’t count the same experiment twice under PS3 and PM1.'
    ],
    refs: ['brnich2019', 'richards2015', 'acgs2024']
  },
  {
    code: 'PS4', dir: 'P', def: 'S', strengths: ['VS', 'S', 'M', 'P'], group: 'population', section: 'clinvar',
    name: 'More common in patients than in controls',
    short: 'The variant is significantly more frequent in affected people than in controls (a case-control odds ratio over 5, with a confidence interval that does not include 1), or it has been seen in several unrelated patients with the same phenotype.',
    guide: [
      'In a case-control study, you need an odds ratio above 5 whose 95% confidence interval excludes 1.',
      'For rare variants, you count unrelated affected people instead. The ACGS 2024 guidelines give it moderate strength for two or more unrelated people with a rare, specific phenotype when the variant is absent from gnomAD, and supporting strength for one. ClinGen’s expert panels set their own counts for their genes, and some, such as the TP53 panel, allow PS4 up to very strong when many probands meet their criteria.',
      'For recessive disorders, use PM3 instead of PS4. A case counts towards either PS4 or PP4, but not both.',
      'Don’t count relatives as separate probands, because they belong to segregation (PP1).'
    ],
    refs: ['richards2015', 'acgs2024']
  },
  {
    code: 'PM1', dir: 'P', def: 'M', strengths: ['S', 'M', 'P'], group: 'functional', section: 'protein',
    name: 'In a mutational hotspot or a critical, well-studied domain',
    short: 'A missense change in a hotspot or a well-established functional domain, such as an enzyme’s active site, that has no benign variation.',
    guide: [
      'PM1 is for missense and in-frame changes. Look at the gene’s protein view to see whether pathogenic missense variants cluster here and benign ones are absent from the region.',
      'Many ClinGen expert panels define the gene’s hotspots or critical residues in the CSpec registry, which the Gene and disease section shows. The ACGS 2024 guidelines allow PM1_Strong for some, such as FBN1’s calcium-binding EGF cysteines or the glycines of a collagen triple helix, and PM1_Supporting for others. They don’t use PM1 for truncating or splicing variants.',
      'Don’t reuse the same evidence for PM5 or PP2.',
      'ClinGen (Pejaver et al. 2022) limits PM1 and PP3 together to 4 points, the same as strong. With PP3_Moderate, PM1 adds at most moderate, and with PP3_Strong it adds nothing. The site caps the points this way when it follows ClinGen. The ACGS 2024 guidelines use PP3 at supporting strength only and set no cap.'
    ],
    refs: ['richards2015', 'pejaver2022', 'acgs2024']
  },
  {
    code: 'PM2', dir: 'P', def: 'M', strengths: ['M', 'P'], group: 'population', section: 'population',
    name: 'Absent from controls, or extremely rare',
    short: 'The variant is absent from population databases such as gnomAD or, for recessive disorders, at a frequency far too low to matter.',
    guide: [
      'The strength depends on which guidelines you follow. ClinGen (2020) applies PM2 at supporting strength, as PM2_Supporting. The ACGS 2024 guidelines keep it at moderate (PM2_mod) and use supporting when the population data are weak. They also require the frequency to be at least ten times below the disorder’s BS1 threshold.',
      'ClinGen’s expert panels set their own PM2 thresholds for their genes, which you can find in the CSpec registry in the Gene and disease section. Often the threshold is a grpmax filtering allele frequency below a set value, with no homozygotes, rather than complete absence.',
      'Check the coverage, because absence only means something where gnomAD sequenced the region well. Indels and repeats are called less reliably.',
      'For a recessive disorder, a rare variant can still meet PM2_Supporting if it is below the gene’s threshold, for example a grpmax filtering allele frequency below 0.0001, or a threshold from the frequency calculator.',
      'A variant cannot meet both PM2 and BS1 or BA1.'
    ],
    refs: ['svi_pm2', 'richards2015', 'acgs2024']
  },
  {
    code: 'PM3', dir: 'P', def: 'M', strengths: ['VS', 'S', 'M', 'P'], group: 'allelic', section: 'family',
    name: 'In trans with a pathogenic variant (recessive disorders)',
    short: 'For a recessive disorder, the variant is found in trans with a pathogenic or likely pathogenic variant in an affected person.',
    guide: [
      'ClinGen gives points for each affected person (SVI recommendation 1.0). A variant in trans with a pathogenic or likely pathogenic variant, with the phase confirmed, scores 1 point. If the phase isn’t known, it scores 0.5 with a pathogenic variant or 0.25 with a likely pathogenic one. A homozygous variant scores 0.5, up to 1 point in all, and one in trans with a VUS scores 0.25, up to 0.5. A total of 0.5 is supporting, 1 moderate, 2 strong and 4 very strong. The calculator in the Patient and family section adds them up.',
      'The phase can come from the parents, if each carries one of the variants, or from the sequencing reads. Without phase, the evidence is weaker.',
      'Both variants must be rare enough to meet PM2. One parent’s test is enough to set the phase.'
    ],
    refs: ['svi_pm3', 'richards2015', 'acgs2024']
  },
  {
    code: 'PM4', dir: 'P', def: 'M', strengths: ['M', 'P'], group: 'computational', section: 'type',
    name: 'Protein length changed (in-frame indel or stop-loss)',
    short: 'An in-frame deletion or insertion outside a repeat region, or a stop-loss variant, that changes the length of the protein.',
    guide: [
      'Don’t use it for indels in repetitive regions. Use BP3 there instead if the region has no known function.',
      'Don’t use it together with PVS1 for the same variant.',
      'Under the ACGS 2024 guidelines, a deletion or insertion of a single amino acid is PM4_Supporting unless the gene gives reason for moderate, and PM4 doesn’t apply where the region isn’t conserved. A stop-loss with another in-frame stop codon in the 3′ UTR is PM4. With none, nonstop decay is expected and PVS1 applies instead.',
      'A truncating variant in the last exon of a gene whose disease comes from gain of function, such as SRCAP or NOTCH2, meets PM4 rather than PVS1 (ACGS 2024).'
    ],
    refs: ['richards2015', 'acgs2024']
  },
  {
    code: 'PM5', dir: 'P', def: 'M', strengths: ['S', 'M', 'P'], group: 'computational', section: 'clinvar',
    name: 'A different pathogenic missense change at the same residue',
    short: 'A novel missense change at an amino acid where a different missense change has been established as pathogenic.',
    guide: [
      'For example, p.Arg520Gln may meet PM5 if p.Arg520Trp is pathogenic.',
      'The other change should be pathogenic and act through the protein rather than through splicing. This variant’s own effect may be milder or worse, so compare the amino acids, for example with BLOSUM62 and the predictors.',
      'Several pathogenic changes at the same residue may support PM5_Strong, as some expert panels allow. Don’t use it with PS1 for the same residue.'
    ],
    refs: ['richards2015', 'acgs2024']
  },
  {
    code: 'PM6', dir: 'P', def: 'M', strengths: ['VS', 'S', 'M', 'P'], group: 'denovo', section: 'family',
    name: 'Assumed de novo (parentage not confirmed)',
    short: 'The parents’ tests show that the variant is de novo, but maternity and paternity haven’t been confirmed.',
    guide: [
      'ClinGen gives an assumed de novo occurrence half the points of a confirmed one. With a phenotype that is consistent with the gene but not highly specific, for example, a confirmed occurrence scores 1 point and an assumed one 0.5 (see PS2 for the full scale). The de novo calculator in the Patient and family section adds confirmed and assumed occurrences together, and writes the result as PS2_x if any occurrence is confirmed, or PM6_x if none is.'
    ],
    refs: ['svi_denovo', 'richards2015']
  },
  {
    code: 'PP1', dir: 'P', def: 'P', strengths: ['S', 'M', 'P'], group: 'segregation', section: 'family',
    name: 'Co-segregates with disease in the family',
    short: 'The variant is in affected relatives and segregates with the disease in a gene definitively known to cause it.',
    guide: [
      'Count informative meioses (Jarvik and Browning 2016), as the ACGS does. In one family, 3 meioses are supporting (a 1 in 8 probability that the segregation is due to chance), 4 moderate (1 in 16) and 5 strong (1 in 32). Across two or more families, the counts are 2, 3 and 4. Or you can weigh the whole pedigree with a likelihood ratio, using the co-segregation calculator in the Patient and family section. On Tavtigian’s scale, a ratio of at least 2.08 is supporting, 4.33 moderate and 18.7 strong.',
      'Unaffected carriers count against it when penetrance is high, and phenocopies make it weaker.',
      'Segregation shows that the region is linked to the disease, but it doesn’t prove that this variant is the cause, because another variant nearby could explain it.'
    ],
    refs: ['jarvik2016', 'richards2015', 'tavtigian2018']
  },
  {
    code: 'PP2', dir: 'P', def: 'P', strengths: ['P'], group: 'computational', section: 'gene',
    name: 'Missense in a gene that has few benign missense variants',
    short: 'A missense variant in a gene with a low rate of benign missense variation, in which missense changes are a common cause of the disease.',
    guide: [
      'The evidence is missense constraint in gnomAD (a missense Z score above 3.09 is often used), and many pathogenic but few benign missense variants in ClinVar.',
      'Some expert panels don’t use it, or restrict it to some regions of the gene.'
    ],
    refs: ['richards2015', 'acgs2024']
  },
  {
    code: 'PP3', dir: 'P', def: 'P', strengths: ['S', 'M', 'P'], group: 'computational', section: 'predictions',
    name: 'Computational evidence for a damaging effect',
    short: 'Computer predictions agree that the variant is damaging, either to the protein (for missense changes) or to splicing.',
    guide: [
      'ClinGen (Pejaver et al. 2022) recommends one calibrated predictor, chosen before you look at the scores, with its own thresholds. For REVEL, for example, these are ≥ 0.932 for strong, ≥ 0.773 for moderate and ≥ 0.644 for supporting. The ACGS 2024 guidelines use PP3 at supporting strength only, with REVEL ≥ 0.7. The Predictions section shows where the variant’s scores fall.',
      'For splicing, SpliceAI ≥ 0.2 meets PP3 at supporting strength (Walker et al. 2023). Weigh the effects on the protein and on splicing separately, and use whichever is more damaging.',
      'Don’t use it with PVS1 for the same effect. With PM1, the two together count at most as strong.'
    ],
    refs: ['pejaver2022', 'walker2023', 'richards2015']
  },
  {
    code: 'PP4', dir: 'P', def: 'P', strengths: ['S', 'M', 'P'], group: 'other', section: 'gene',
    name: 'Phenotype or family history highly specific for the gene',
    short: 'The patient’s phenotype or family history fits a disease with a single genetic cause very well.',
    guide: [
      'Use it only when the phenotype is highly specific for this gene, such as a recognisable syndrome or a specific biochemical test, and the test has looked at the other genes that could explain it.',
      'The ACGS 2024 guidelines allow PP4 at moderate or strong for highly specific phenotypes, such as a diagnostic enzyme assay. Take care not to double count when the same phenotype is used to choose the patient for other evidence (PS4, PS2).',
      'The Gene and disease section compares the patient’s HPO terms with the gene’s diseases.'
    ],
    refs: ['richards2015', 'acgs2024']
  },
  {
    code: 'PP5', dir: 'P', def: 'P', strengths: ['P'], group: 'database', section: 'clinvar', deprecated: true,
    name: 'A reputable source reports it as pathogenic',
    short: 'A reputable source reports the variant as pathogenic, but the evidence is not available to evaluate.',
    guide: [
      'ClinGen’s SVI (Biesecker and Harrison 2018) recommends not using PP5 and BP6. Instead, weigh the evidence behind other classifications under the criteria it supports. The ACGS guidelines agree. The site shows these criteria only when “Show retired criteria” is on in Settings.'
    ],
    refs: ['biesecker2018']
  },

  /* ---------------- benign ---------------- */
  {
    code: 'BA1', dir: 'B', def: 'SA', strengths: ['SA'], group: 'population', section: 'population',
    name: 'Too common to cause the disease (above 5%)',
    short: 'The allele frequency is above 5% in a gnomAD population, or in another large database.',
    guide: [
      'ClinGen’s threshold (Ghosh et al. 2018) is a frequency above 0.05 in a continental population with at least 2,000 alleles. For gnomAD v4, use the filtering allele frequency of the group with the highest one (the grpmax FAF), which leaves out the Amish, Ashkenazi Jewish, Finnish and unassigned groups.',
      'Nine variants are exceptions that are common yet pathogenic. They include HFE p.Cys282Tyr and p.His63Asp, GJB2 p.Val37Ile, BTD p.Asp424His (p.Asp444His on the older transcript) and ACAD9 c.-44_-41dup. The site checks variants against ClinGen’s list.',
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
      'For a recessive disorder, use the carrier frequency. For a dominant one with incomplete penetrance, allow for the penetrance.',
      'Some expert panels use BS1_Supporting just above their PM2 threshold.',
      'Under the ACGS 2024 guidelines, BS1_Strong alone can make a variant likely benign for a highly penetrant dominant disorder. This is an exception to their rule of at least two criteria.'
    ],
    refs: ['whiffin2017', 'richards2015', 'acgs2024']
  },
  {
    code: 'BS2', dir: 'B', def: 'S', strengths: ['S', 'P'], group: 'population', section: 'population',
    name: 'Seen in healthy adults where the disorder is fully penetrant early',
    short: 'The variant has been seen in a healthy adult who is homozygous for a recessive disorder, heterozygous for a dominant one or hemizygous for an X-linked one, when the disorder is fully penetrant at an early age.',
    guide: [
      'The ACGS 2024 guidelines ask for two or more healthy, well-phenotyped heterozygous adults for a dominant disorder, or two or more healthy homozygotes for a recessive one. For a severe disorder of childhood, homozygotes in gnomAD are acceptable. Ask for more people for disorders of later onset.',
      'gnomAD’s participants aren’t screened for every disease, and some may be mildly affected.',
      'Don’t use it for late-onset or incompletely penetrant disorders.'
    ],
    refs: ['richards2015', 'acgs2024']
  },
  {
    code: 'BS3', dir: 'B', def: 'S', strengths: ['S', 'M', 'P'], group: 'functional', section: 'functional',
    name: 'Well-established functional studies show no damaging effect',
    short: 'A validated assay shows normal function.',
    guide: ['As with PS3, the strength depends on how the assay was validated (Brnich et al. 2019), and the assay must test the relevant function.'],
    refs: ['brnich2019', 'richards2015']
  },
  {
    code: 'BS4', dir: 'B', def: 'S', strengths: ['S', 'P'], group: 'segregation', section: 'family',
    name: 'Does not segregate in affected relatives',
    short: 'An affected relative does not carry the variant.',
    guide: [
      'Phenocopies (relatives affected for another reason) are common in some conditions, such as cancers, so be careful.',
      'Make sure the relative really has the same disease, and that their test was reliable.'
    ],
    refs: ['richards2015', 'acgs2024']
  },
  {
    code: 'BP1', dir: 'B', def: 'P', strengths: ['S', 'P'], group: 'computational', section: 'gene',
    name: 'Missense in a gene where only truncating variants cause disease',
    short: 'A missense variant in a gene in which disease is caused mainly by truncating variants.',
    guide: ['For example, it fits many genes where loss of function is the only known mechanism and missense changes are not pathogenic. Check ClinVar for pathogenic missense variants first.'],
    refs: ['richards2015']
  },
  {
    code: 'BP2', dir: 'B', def: 'P', strengths: ['P'], group: 'allelic', section: 'family',
    name: 'In trans with a pathogenic variant in a dominant disorder, or in cis',
    short: 'Seen in trans with a pathogenic variant for a fully penetrant dominant disorder, or in cis with a pathogenic variant in any inheritance pattern.',
    guide: ['For a dominant disorder, if a person already has the pathogenic variant on the other copy and isn’t more severely affected, this variant is unlikely to be pathogenic.'],
    refs: ['richards2015']
  },
  {
    code: 'BP3', dir: 'B', def: 'P', strengths: ['P'], group: 'computational', section: 'type',
    name: 'In-frame indel in a repeat without known function',
    short: 'An in-frame deletion or insertion in a repetitive region with no known function.',
    guide: ['This is the opposite of PM4. Check that the repeat isn’t known to be functional, like a polyglutamine tract whose expansion causes disease.'],
    refs: ['richards2015']
  },
  {
    code: 'BP4', dir: 'B', def: 'P', strengths: ['S', 'M', 'P'], group: 'computational', section: 'predictions',
    name: 'Computational evidence for no impact',
    short: 'Computer predictions agree that the variant has no effect on the gene or its product.',
    guide: [
      'With one calibrated predictor (Pejaver et al. 2022), the thresholds for REVEL, for example, are ≤ 0.290 for supporting, ≤ 0.183 for moderate and ≤ 0.016 for strong. Pejaver et al. recommend no more than strong. The ACGS 2024 guidelines use BP4 at supporting strength only, with REVEL < 0.4.',
      'For splicing, SpliceAI ≤ 0.1 meets BP4 at supporting strength (Walker et al. 2023).',
      'For a synonymous or deep intronic variant with no predicted splicing effect, see BP7.'
    ],
    refs: ['pejaver2022', 'walker2023', 'richards2015']
  },
  {
    code: 'BP5', dir: 'B', def: 'P', strengths: ['P'], group: 'other', section: 'family',
    name: 'Found in a patient with another molecular cause',
    short: 'Found in a case with another explanation for the disease.',
    guide: ['It’s weak in practice, because a person can carry two pathogenic variants, as in blended phenotypes or a cancer predisposition alongside another cause. Don’t use it for recessive disorders where the second variant is unknown.'],
    refs: ['richards2015']
  },
  {
    code: 'BP6', dir: 'B', def: 'P', strengths: ['P'], group: 'database', section: 'clinvar', deprecated: true,
    name: 'A reputable source reports it as benign',
    short: 'A reputable source reports the variant as benign, but the evidence is not available to evaluate.',
    guide: ['ClinGen’s SVI (Biesecker and Harrison 2018) and the ACGS guidelines don’t recommend it. See PP5.'],
    refs: ['biesecker2018']
  },
  {
    code: 'BP7', dir: 'B', def: 'P', strengths: ['S', 'P'], group: 'computational', section: 'splicing',
    name: 'Synonymous (or deep intronic) with no predicted splicing effect',
    short: 'A synonymous change, or an intronic one beyond the splice region, predicted not to affect splicing, at a position that is not highly conserved.',
    guide: [
      'ClinGen (Walker et al. 2023) uses BP7 only when BP4 is met for splicing (SpliceAI ≤ 0.1), and then the two are used together. It doesn’t apply at the first base or the last three bases of an exon. An intronic variant must be at or beyond +7 at the intron’s 5′ end, or −21 at its 3′ end. An RNA study showing normal splicing gives BP7_Strong (RNA), wherever the variant is.',
      'The ACGS 2024 guidelines also ask that the nucleotide isn’t highly conserved (for example, phyloP below 0.1), and they allow BP7 for untranslated regions. Walker et al. advise against weighing conservation for synonymous and intronic variants.'
    ],
    refs: ['walker2023', 'richards2015']
  }
];

export const BY_CODE = Object.fromEntries(CRITERIA.map((c) => [c.code, c]));

/* ClinGen's exceptions to BA1 (Ghosh et al. 2018): [gene, change on the MANE Select transcript, ClinGen allele id,
   change as the paper wrote it]. BTD's MANE transcript (NM_001370658.1) numbers its exception c.1270G>C p.(Asp424His);
   the paper, on NM_000060, wrote c.1330G>C p.(Asp444His). Matched by allele id where gnomAD gives one. */
export const BA1_EXCEPTIONS = [
  ['ACAD9', 'c.-44_-41dup', 'CA114709'], ['GJB2', 'c.109G>A', 'CA172210'], ['HFE', 'c.187C>G', 'CA113797'], ['HFE', 'c.845G>A', 'CA113795'],
  ['MEFV', 'c.1105C>T', 'CA280114'], ['MEFV', 'c.1223G>A', 'CA280116'], ['PIBF1', 'c.1214G>A', 'CA210261'], ['ACADS', 'c.511C>T', 'CA312214'],
  ['BTD', 'c.1270G>C', 'CA090886', 'c.1330G>C']
];
export function isBA1Exception(gene, hgvsc, caid) {
  const id = /^(?:CAR:)?CA0*(\d+)$/i.exec(String(caid || ''));
  if (id && BA1_EXCEPTIONS.some((x) => +x[2].slice(2) === +id[1])) return true;
  const c = String(hgvsc || '').split(':').pop().replace(/dupTAAG$/, 'dup');
  return BA1_EXCEPTIONS.some(([g, x, , old]) => g === gene && (x === c || old === c));
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
