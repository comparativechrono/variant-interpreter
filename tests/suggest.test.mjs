// Tests of the suggestion rules and the calculators they lean on: node tests/suggest.test.mjs
//   each check is a rule from the guidelines that the site once got wrong, so that it stays right
import assert from 'node:assert/strict';
globalThis.window = globalThis;
globalThis.self = globalThis;
globalThis.addEventListener = () => {};
globalThis.location = { hash: '' };
globalThis.history = { replaceState() {} };
globalThis.indexedDB = undefined;
const mem = new Map();
globalThis.localStorage = { getItem: (k) => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, String(v)), removeItem: (k) => mem.delete(k) };

const { suggest } = await import('../assets/js/acmg/suggest.js');
const { predictorStrength } = await import('../assets/js/acmg/thresholds.js');
const { classify } = await import('../assets/js/acmg/engine.js');
const { maxTolerableAC, faf95 } = await import('../assets/js/acmg/calculators.js');
const { isBA1Exception, BY_CODE } = await import('../assets/js/acmg/criteria.js');
const { strengthsFor } = await import('../assets/js/acmg/frameworks.js');
const pvs1 = await import('../assets/js/acmg/pvs1.js');

let n = 0;
const ok = (cond, msg) => {
  assert.ok(cond, msg);
  n++;
};

/* a variant's evidence, as annotate() gives it, with only what the rules read */
const ev = ({ cons = ['missense_variant'], gene = 'GENE', hgvsc = 'c.100A>G', hgvsp = 'p.Lys34Glu', revel = null, spliceai = null, gnomad = null, caid = null } = {}) => ({
  d: { consequences: cons, gene, hgvsc, hgvsp, predictors: revel != null ? { revel } : {}, spliceai: spliceai != null ? { max: spliceai } : null, lofConsequence: cons.some((c) => /stop_gained|frameshift|splice_(donor|acceptor)_variant|start_lost/.test(c)) },
  gnomad: gnomad ? Object.assign({ found: true, dataset: 'gnomAD v4.1', caid }, { joint: gnomad }) : null,
  status: { gnomad: gnomad ? 'ok' : 'none' }
});
const geneOf = (moi, extra = {}) => Object.assign({ symbol: 'GENE', validity: [{ moi, classification: 'Definitive' }], g2p: [] }, extra);
const pop = (faf, { hom = 0, hemi = 0, af = faf } = {}) => ({ ac: 1000, an: 100000, af, hom, hemi, faf95: faf, faf95Group: 'nfe', pops: { nfe: { ac: 1000, an: 100000, af } } });

/* ---------- BP4 stops at strong (Pejaver 2022; Bergquist 2025) ---------- */
assert.deepEqual(predictorStrength('REVEL', 0.002, 'clingen'), { code: 'BP4', strength: 'S', threshold: '≤ 0.016' });
ok(!BY_CODE.BP4.strengths.includes('VS'), 'BP4 has no very strong');
n++;

/* ---------- BS1 and BS2 by inheritance (ACGS 2024; Whiffin 2017) ---------- */
let s = suggest({ ev: ev({ gnomad: pop(0.0148, { hom: 58 }) }), gene: geneOf('AR'), settings: { framework: 'acgs2024' } });
ok(!s.BS1 && s._bs1Note, 'a recessive variant at 1.5%: no BS1 without the calculator');
ok(s.BS2 && s.BS2.strength === 'S', 'BS2 from two or more homozygotes in a recessive disorder');
s = suggest({ ev: ev({ gnomad: pop(0.0148, { hom: 1 }) }), gene: geneOf('AR'), settings: { framework: 'acgs2024' } });
ok(!s.BS2 && s._bs2Note, 'one homozygote is not enough for BS2');
s = suggest({ ev: ev({ gnomad: pop(0.0148) }), gene: geneOf('AD'), settings: { framework: 'acgs2024' } });
ok(s.BS1 && s.BS1.strength === 'S', 'a dominant variant above 1%: BS1');
// the calculator decides once its values are set: common recessive disorder, credible frequency above 1.5%
s = suggest({ ev: ev({ gnomad: pop(0.0148) }), gene: geneOf('AR'), calc: { af: { userSet: true, max: 0.02 } }, settings: { framework: 'acgs2024' } });
ok(!s.BS1 && !s._bs1Note, 'below the calculator’s highest credible frequency: no BS1');
s = suggest({ ev: ev({ gnomad: pop(0.0148) }), gene: geneOf('AR'), calc: { af: { userSet: true, max: 0.005 } }, settings: { framework: 'acgs2024' } });
ok(s.BS1, 'above the calculator’s highest credible frequency: BS1');
// BA1 exceptions: no frequency-based benign criteria at all (BTD p.Asp424His, matched by its allele id or MANE change)
ok(isBA1Exception('BTD', 'c.1270G>C') && isBA1Exception('X', 'c.1A>G', 'CA90886') && isBA1Exception('BTD', 'c.1330G>C'), 'BTD exception matches');
s = suggest({ ev: ev({ gene: 'BTD', hgvsc: 'c.1270G>C', gnomad: pop(0.0416, { hom: 1308 }), caid: 'CA90886' }), gene: geneOf('AR'), settings: { framework: 'clingen' } });
ok(!s.BS1 && !s.BS2 && !s.BA1 && s._ba1Note, 'BTD p.Asp424His: no benign frequency criteria');

/* ---------- PP3 for splicing and BP4 for the protein never together ---------- */
s = suggest({ ev: ev({ revel: 0.10, spliceai: 0.60 }), gene: geneOf('AD'), settings: { framework: 'clingen' } });
ok(!s.BP4 && s.PP3, 'REVEL 0.10 with SpliceAI 0.60: PP3, not BP4');
s = suggest({ ev: ev({ revel: 0.10, spliceai: 0.10 }), gene: geneOf('AD'), settings: { framework: 'acgs2024' } });
ok(!s.BP4, 'ACGS: SpliceAI must be below 0.1 for BP4');
s = suggest({ ev: ev({ revel: 0.10, spliceai: 0.02 }), gene: geneOf('AD'), settings: { framework: 'acgs2024' } });
ok(s.BP4 && s.BP4.strength === 'P', 'ACGS: BP4 at supporting');

/* ---------- PM1 with PP3 at most 4 points (Pejaver 2022) ---------- */
let r = classify({ criteria: { PM1: { met: true, strength: 'M' }, PP3: { met: true, strength: 'S' }, PM2: { met: true, strength: 'P' } } }, { framework: 'clingen' });
ok(r.points === 5 && r.cls === 'vus', `PM1 + PP3_Strong + PM2_Supporting: 5 points, a VUS (got ${r.points}, ${r.cls})`);
r = classify({ criteria: { PM1: { met: true, strength: 'M' }, PP3: { met: true, strength: 'M' }, PM2: { met: true, strength: 'P' } } }, { framework: 'clingen' });
ok(r.points === 5, 'PM1 + PP3_Moderate: no cap needed');
r = classify({ criteria: { PM1: { met: true, strength: 'S' }, PP3: { met: true, strength: 'P' }, PM2: { met: true, strength: 'M' } } }, { framework: 'acgs2024' });
ok(r.points === 7, 'ACGS: no cap on PM1_str with PP3');

/* ---------- ACGS: two criteria, but BS1_Strong may stand alone ---------- */
r = classify({ criteria: { BS1: { met: true, strength: 'S' } } }, { framework: 'acgs2024' });
ok(r.cls === 'lb', `BS1_str alone under ACGS: likely benign (got ${r.cls})`);
r = classify({ criteria: { PVS1: { met: true, strength: 'VS' } } }, { framework: 'acgs2024' });
ok(r.cls === 'vus', 'PVS1 alone under ACGS: uncertain');
r = classify({ criteria: { PVS1: { met: true, strength: 'VS' }, PP3: { met: true, strength: 'P' } } }, { framework: 'acmg2015' });
ok(r.byRules.cls === 'vus', '2015 rules: very strong with one supporting is not enough (that rule came in 2020)');

/* ---------- a strength marked under one framework, counted under another ---------- */
r = classify({ criteria: { PS4: { met: true, strength: 'VS' }, PM2: { met: true, strength: 'M' } } }, { framework: 'acgs2024' });
ok(r.points === 6 && r.met.find((m) => m.code === 'PS4').strength === 'S' && r.notes.some((x) => /PS4 is marked very strong/.test(x)), `PS4_VeryStrong counts as strong under ACGS (got ${r.points})`);
r = classify({ criteria: { PP3: { met: true, strength: 'S' }, PM2: { met: true, strength: 'M' } } }, { framework: 'acgs2024' });
ok(r.points === 3, 'PP3_Strong counts as supporting under ACGS');
r = classify({ criteria: { PS4: { met: true, strength: 'VS' }, PM2: { met: true, strength: 'P' } } }, { framework: 'clingen' });
ok(r.points === 9, 'ClinGen keeps PS4_VeryStrong');

/* ---------- variant types ---------- */
const lofGene = geneOf('AD', { hi: 3 });
s = suggest({ ev: ev({ cons: ['start_lost'], hgvsc: 'c.1A>G', hgvsp: 'p.Met1?' }), gene: lofGene, settings: { framework: 'clingen' } });
ok(s.PVS1 && s.PVS1.strength === 'P', 'start-loss: supporting until the upstream variants are looked at');
s = suggest({ ev: ev({ cons: ['splice_donor_variant'], hgvsc: 'c.100+2T>C', spliceai: 0.4 }), gene: lofGene, settings: { framework: 'acgs2024' } });
ok(!s.PVS1 && s._pvs1Note, 'ACGS: +2T>C with SpliceAI below 0.8 does not meet PVS1');
s = suggest({ ev: ev({ cons: ['splice_donor_variant'], hgvsc: 'c.100+2T>C', spliceai: 0.9 }), gene: lofGene, settings: { framework: 'acgs2024' } });
ok(s.PVS1, '+2T>C with SpliceAI 0.9: PVS1');
s = suggest({ ev: ev({ cons: ['splice_donor_variant'], hgvsc: 'c.100+2C>T', spliceai: 0.01 }), gene: lofGene, settings: { framework: 'clingen' } });
ok(!s.PVS1 && /GC donor/.test(s._pvs1Note || ''), '+2C>T makes a GC donor GT: no PVS1');
s = suggest({ ev: ev({ cons: ['inframe_deletion'], hgvsc: 'c.1521_1523del', hgvsp: 'p.Phe508del' }), variant: { ref: 'ATCT', alt: 'A' }, gene: geneOf('AR'), settings: { framework: 'acgs2024' } });
ok(s.PM4 && s.PM4.strength === 'P', 'ACGS: one amino acid deleted, PM4 supporting');
s = suggest({ ev: ev({ cons: ['inframe_deletion'], hgvsc: 'c.1521_1523del', hgvsp: 'p.Phe508del' }), variant: { ref: 'ATCT', alt: 'A' }, gene: geneOf('AR'), settings: { framework: 'clingen' } });
ok(s.PM4 && s.PM4.strength === 'M', 'ClinGen: PM4 moderate');

/* ---------- PP1: the ACGS count meioses ---------- */
const seg = { ok: true, direction: 'for', lr: 14.5, lod: 1.16, meioses: 3.86, strength: { bayes: 'M', jarvik: 'P' } };
ok(suggest({ ev: ev(), calc: { seg }, settings: { framework: 'acgs2024' } }).PP1.strength === 'P', 'ACGS: PP1 by meioses');
ok(suggest({ ev: ev(), calc: { seg }, settings: { framework: 'clingen' } }).PP1.strength === 'M', 'ClinGen: PP1 by the odds');

/* ---------- strengths the ACGS allow ---------- */
ok(strengthsFor(BY_CODE.PS1, 'acgs2024').includes('P'), 'ACGS: PS1 supporting (splicing, Walker 2023)');

/* ---------- the PVS1 tree's duplications (Abou Tayoun 2018) ---------- */
const dupAt = (labelPart) => {
  const node = pvs1.TREE.dup;
  const i = node.options.findIndex((o) => o.label.includes(labelPart));
  assert.ok(i >= 0, labelPart);
  return node.options[i].result;
};
ok(dupAt('Proven in tandem; the frame') === 'VS', 'proven in tandem, frame disrupted: very strong');
ok(dupAt('presumed in tandem') === 'S', 'location unknown: presumed in tandem, strong');
ok(dupAt('Proven not in tandem') === 'NA', 'proven not in tandem: not applicable');

/* ---------- the frequency calculators for common variants (no underflow) ---------- */
ok(maxTolerableAC(0.001, 1e6) === 1052, `maxTolerableAC(0.001, 1e6) = ${maxTolerableAC(0.001, 1e6)}`);
const f1 = faf95(1207, 124552);
ok(f1 > 0.0090 && f1 < 0.0094, `faf95 of 1207/124552 near 0.92% (got ${f1})`);
const f2 = faf95(18, 1613942);
ok(Math.abs(f2 - 7.2e-6) < 0.3e-6, `faf95 of 18/1613942 near 7.2e-6 (got ${f2})`);

console.log(`suggestions: ${n} checks passed`);
