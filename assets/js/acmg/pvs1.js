/* =====================================================================
   The PVS1 decision tree of ClinGen's SVI group (Abou Tayoun et al.
   2018, Hum Mutat 39:1517), as questions to answer one at a time. Each
   answer leads to another question or to a strength (VS, S, M, P) or
   to "not applicable" (NA).
   ===================================================================== */

const CRITICAL = {
  q: 'Is the truncated or altered region critical to the protein’s function?',
  help: 'It might be a domain where pathogenic missense variants cluster, or the end of the protein where other truncating variants are pathogenic. Check the protein view and ClinVar.',
  options: [
    { label: 'Yes, it is critical', result: 'S' },
    { label: 'No, or its role is not known', next: 'frequent' }
  ]
};
const FREQUENT = {
  q: 'Are loss-of-function variants in this exon frequent in the general population, or is the exon absent from biologically relevant transcripts?',
  help: 'Look at gnomAD’s loss-of-function variants in the exon, and check whether the exon is in the transcripts expressed in the tissue that matters (in GTEx, for example).',
  options: [
    { label: 'Yes', result: 'NA' },
    { label: 'No', next: 'size' }
  ]
};
const SIZE = {
  q: 'Does the variant remove more than 10% of the protein?',
  help: 'Measure from the position of the new stop, or of the deleted exons, to the end of the protein.',
  options: [
    { label: 'Yes, more than 10%', result: 'S' },
    { label: 'No, 10% or less', result: 'M' }
  ]
};
const RELEVANT = {
  q: 'Is the exon present in the biologically relevant transcript(s)?',
  help: 'These are the transcripts expressed in the tissue the disease affects. An exon left out of them, or a variant only in a minor transcript, may not cause loss of function.',
  options: [
    { label: 'Yes', result: 'VS' },
    { label: 'No', result: 'NA' }
  ]
};

export const TREE = {
  start: {
    q: 'What kind of variant is it?',
    options: [
      { label: 'Nonsense or frameshift', next: 'nmd' },
      { label: 'At a canonical ±1 or 2 splice site (GT…AG)', next: 'splice' },
      { label: 'A deletion of one or more exons, or of the whole gene', next: 'deletion' },
      { label: 'A duplication of one or more exons, within the gene', next: 'dup' },
      { label: 'In the initiation (start) codon', next: 'initiation' }
    ]
  },
  nmd: {
    q: 'Is the transcript predicted to undergo nonsense-mediated decay (NMD)?',
    help: 'A premature stop more than 50–55 bases before the last exon–exon junction triggers NMD. One in the last exon, or within 50 bases of the end of the penultimate exon, escapes it. The variant’s page works this out from the exon numbers.',
    options: [
      { label: 'Yes, NMD is predicted', next: 'relevant' },
      { label: 'No, it escapes NMD', next: 'critical' }
    ]
  },
  splice: {
    q: 'What does the change do to the transcript?',
    help: 'Usually the exon is skipped, or a cryptic splice site nearby is used. If the exon’s length is a multiple of 3, skipping it keeps the reading frame. SpliceAI’s scores and positions can help you decide.',
    options: [
      { label: 'Exon skipping or a cryptic site disrupts the reading frame, and NMD is predicted', next: 'relevant' },
      { label: 'It disrupts the reading frame, but NMD is not predicted', next: 'critical' },
      { label: 'It keeps the reading frame (in-frame skipping)', next: 'critical' }
    ]
  },
  deletion: {
    q: 'How much is deleted?',
    options: [
      { label: 'The whole gene', result: 'VS' },
      { label: 'One or more exons: the reading frame is disrupted, and NMD is predicted', next: 'relevant' },
      { label: 'One or more exons: the reading frame is disrupted, but NMD is not predicted', next: 'critical' },
      { label: 'One or more exons: the reading frame is kept', next: 'critical' }
    ]
  },
  dup: {
    q: 'Is the duplication in tandem, and what does it do to the reading frame?',
    help: 'To disrupt the gene, a duplication must lie wholly within it and be in tandem, next to the original copy. If its location hasn’t been shown, it is presumed to be in tandem.',
    options: [
      { label: 'Proven in tandem; the frame is disrupted and NMD is predicted', result: 'VS' },
      { label: 'Location not proven (presumed in tandem); the frame is disrupted and NMD is predicted', result: 'S' },
      { label: 'In tandem (proven or presumed), but no effect, or an unknown effect, on the frame or NMD', result: 'NA' },
      { label: 'Proven not in tandem (inserted elsewhere in the genome)', result: 'NA' }
    ]
  },
  initiation: {
    q: 'Does another functional transcript use a different start codon?',
    options: [
      { label: 'Yes', result: 'NA' },
      { label: 'No', next: 'upstream' }
    ]
  },
  upstream: {
    q: 'Are pathogenic variants known upstream of the closest potential in-frame start codon?',
    help: 'If a variant before the next in-frame methionine is pathogenic, starting translation there instead doesn’t rescue the protein.',
    options: [
      { label: 'Yes, at least one', result: 'M' },
      { label: 'No', result: 'P' }
    ]
  },
  relevant: RELEVANT,
  critical: CRITICAL,
  frequent: FREQUENT,
  size: SIZE
};

export const RESULT_TEXT = { VS: 'PVS1 (very strong)', S: 'PVS1_Strong', M: 'PVS1_Moderate', P: 'PVS1_Supporting', NA: 'PVS1 does not apply' };

/** follow answers (a list of option indices) through the tree → { node, done, strength, path } */
export function walk(answers) {
  let key = 'start';
  const steps = [];
  for (const a of answers || []) {
    const node = TREE[key];
    const opt = node && node.options[a];
    if (!opt) break;
    steps.push({ key, q: node.q, answer: opt.label });
    if (opt.result) return { done: true, strength: opt.result === 'NA' ? null : opt.result, na: opt.result === 'NA', steps, path: steps.map((s) => s.answer).join(' → ') + ' → ' + RESULT_TEXT[opt.result] };
    key = opt.next;
  }
  return { done: false, key, node: TREE[key], steps };
}

/** where to start, from the variant's consequence */
export function startAnswer(consequences) {
  const c = consequences || [];
  if (c.includes('stop_gained') || c.includes('frameshift_variant')) return 0;
  if (c.includes('splice_acceptor_variant') || c.includes('splice_donor_variant')) return 1;
  if (c.includes('start_lost')) return 4;
  return null;
}
