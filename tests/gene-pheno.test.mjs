// Tests of the gene page's counting and the phenotype pages' explanations: node tests/gene-pheno.test.mjs
// (the HPO files are read from data/hpo, the gene table from data/genes, as the site reads them)
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
globalThis.window = globalThis;
globalThis.fetch = async (url) => {
  const file = path.join(root, String(url));
  return { ok: true, status: 200, json: async () => JSON.parse(fs.readFileSync(file, 'utf8')), text: async () => fs.readFileSync(file, 'utf8') };
};

const S = await import('../assets/js/gene-stats.js');
const X = await import('../assets/js/pheno-explain.js');
const H = await import('../assets/js/hpo.js');
let n = 0;
const ok = (cond, msg) => {
  assert.ok(cond, msg);
  n++;
};
const eq = (a, b, msg) => {
  assert.deepEqual(a, b, msg);
  n++;
};

/* ---------------- ClinVar's classes and kinds of change ---------------- */
eq(S.cvClass('Pathogenic'), 'plp');
eq(S.cvClass('Pathogenic/Likely pathogenic/Pathogenic, low penetrance'), 'plp');
eq(S.cvClass('Likely pathogenic'), 'plp');
eq(S.cvClass('Conflicting classifications of pathogenicity'), 'conflict');
eq(S.cvClass('Conflicting interpretations of pathogenicity'), 'conflict');
eq(S.cvClass('Uncertain significance'), 'vus');
eq(S.cvClass('Benign/Likely benign'), 'blb');
eq(S.cvClass('Likely benign'), 'blb');
eq(S.cvClass('drug response'), 'other');
eq(S.cvClass('not provided'), 'other');
eq(S.consequenceGroup('stop_gained'), 'lof');
eq(S.consequenceGroup('splice_donor_variant'), 'lof');
eq(S.consequenceGroup('missense_variant'), 'missense');
eq(S.consequenceGroup('stop_lost'), 'missense');
eq(S.consequenceGroup('splice_region_variant'), 'splice');
eq(S.consequenceGroup('synonymous_variant'), 'synonymous');
eq(S.consequenceGroup('intron_variant'), 'other');
eq(S.consequenceGroup(undefined), 'other');

const cv = (sig, cons, stars = 1, p = '') => ({ clinical_significance: sig, major_consequence: cons, gold_stars: stars, hgvsp: p });
const list = [];
for (let i = 0; i < 20; i++) list.push(cv('Pathogenic', 'frameshift_variant'));
list.push(cv('Benign', 'stop_gained'));
for (let i = 0; i < 15; i++) list.push(cv('Pathogenic', 'missense_variant', 2, `p.Arg${100 + (i % 3)}His`));
list.push(cv('Likely benign', 'missense_variant', 1, 'p.Val200Ile'));
list.push(cv('Uncertain significance', 'missense_variant', 0, 'p.Gly101Ser'));
for (let i = 0; i < 12; i++) list.push(cv('Benign', 'synonymous_variant'));
const sum = S.clinvarSummary(list);
eq(sum.total, list.length);
eq(sum.matrix.lof.plp, 20);
eq(sum.matrix.lof.blb, 1);
eq(sum.matrix.missense.plp, 15);
eq(sum.matrix.missense.vus, 1);
eq(sum.byClass.blb, 14);
const sum1 = S.clinvarSummary(list, 1);
eq(sum1.total, list.length - 1, 'the zero-star variant is left out');
const notes = S.geneNotes(sum);
ok(notes.some((x) => x.about === 'lof' && x.codes.includes('PVS1') && /95%/.test(x.text)), 'truncating variants mostly pathogenic: a PVS1 note');
ok(notes.some((x) => x.about === 'missense' && x.codes.includes('PP2')), 'missense variants mostly pathogenic: a PP2 note');
ok(notes.some((x) => x.about === 'synonymous' && x.codes.includes('BP7')), 'no pathogenic synonymous variants: a BP7 note');
// a gene where only truncating variants are pathogenic
const lofOnly = [];
for (let i = 0; i < 30; i++) lofOnly.push(cv('Pathogenic', 'stop_gained'));
for (let i = 0; i < 10; i++) lofOnly.push(cv('Benign', 'missense_variant'));
ok(S.geneNotes(S.clinvarSummary(lofOnly)).some((x) => x.codes.includes('BP1')), 'BP1 suggested where only truncating variants are pathogenic');
const hs = S.hotspots(list);
eq(hs[0].plp, 5, 'five pathogenic missense variants at each of residues 100 to 102');
eq(hs.map((x) => x.residue).sort(), [100, 101, 102]);
eq(S.dosageWords(3), 'sufficient evidence (3)');
eq(S.dosageWords(30), 'gene associated with an autosomal recessive phenotype (30)');
eq(S.dosageWords(null), 'not curated');
eq(S.allelicWords('biallelic_autosomal'), 'two copies (autosomal)');
eq(S.allelicWords('monoallelic_X_hemizygous'), 'one copy, X-linked (hemizygous)');

/* ---------------- the HPO's frequencies, in words ---------------- */
eq(X.freqWord(1), 'obligate (100%)');
eq(X.freqWord(0.9), 'very frequent (80–99%)');
eq(X.freqWord(0.55), 'frequent (30–79%)');
eq(X.freqWord(0.17), 'occasional (5–29%)');
eq(X.freqWord(0.025), 'very rare (under 5%)');
eq(X.freqWord(0), 'excluded (0%)');
eq(X.freqWord(null), 'frequency not given');

/* ---------------- ranks with ties ---------------- */
eq(X.ranksWithTies([{ s: 3 }, { s: 3 }, { s: 2 }, { s: 1 }, { s: 1 }], (x) => x.s).map((r) => r.label), ['=1', '=1', '3', '=4', '=4']);
eq(X.ranksWithTies([{ a: 2, b: 5 }, { a: 2, b: 4 }, { a: 2, b: 4 }, { a: 1, b: 9 }], (x) => [x.a, x.b]).map((r) => r.label), ['1', '=2', '=2', '4'], 'a tie on the first score is broken by the second');

/* ---------------- matches, on the real ontology ---------------- */
await H.loadDiseases();
const SEIZ = H.hpNum('HP:0001250'), FOCAL = H.hpNum('HP:0007359'), GDD = H.hpNum('HP:0001263');
ok(H.ancestors(FOCAL).has(SEIZ), 'focal-onset seizure is a kind of seizure');
eq(X.explainMatch({ patient: SEIZ, target: SEIZ, via: SEIZ, ic: H.ic(SEIZ) }).kind, 'exact');
eq(X.explainMatch({ patient: SEIZ, target: FOCAL, via: SEIZ, ic: H.ic(SEIZ) }).kind, 'specific', 'the disease has the more specific term');
eq(X.explainMatch({ patient: FOCAL, target: SEIZ, via: SEIZ, ic: H.ic(SEIZ) }).kind, 'general', 'the disease has the more general term');
eq(X.explainMatch({ patient: SEIZ, target: GDD, via: 707, ic: H.ic(707) }).kind, 'related');
eq(X.explainMatch({ patient: SEIZ, target: null, via: 118, ic: 0 }).kind, 'none');
// a match made by hpo.js: the same term counts as exact
const sim = H.similarity(['HP:0001250', 'HP:0001263'], [SEIZ, GDD]);
eq(X.coverage(sim.matches), { explained: 2, related: 0, total: 2 });
// diseases and genes with a term
const D = await H.loadDiseases();
const withSeiz = X.diseasesWithTerm(D, 'HP:0001250');
ok(withSeiz.length > 1000, `seizures are in many diseases (${withSeiz.length})`);
ok(withSeiz.every((r) => r.terms.every((t) => H.ancestors(t).has(SEIZ))), 'each disease has seizures or a more specific kind');
ok(X.genesOf(withSeiz).some((g) => g.gene === 'SCN1A'), 'SCN1A is among the genes of diseases with seizures');
// a disease's features that the patient lacks, and those ruled out
const dravet = D.find((d) => d.genes.includes('SCN1A') && /Dravet/i.test(d.name));
ok(dravet, 'Dravet syndrome is in the annotations');
const unseen = X.unseenFeatures(['HP:0001250'], [], dravet, 50);
ok(unseen.every((u) => !X.lineage(u.term, SEIZ)), 'features on the line of seizures are not unseen');
const exHits = X.excludedHits(['HP:0001250'], dravet);
eq(exHits.length, 1, 'ruling out seizures counts against Dravet syndrome');
const cov = X.diseaseCoverage(['HP:0001250'], dravet);
ok(cov.seen >= 1 && cov.seen < cov.total, 'some of its features are matched, not all');
// patients with a term, or with it ruled out
const pts = [
  { id: 'a', phenotypes: [{ id: 'HP:0007359', observed: true }] },
  { id: 'b', phenotypes: [{ id: 'HP:0001250', observed: false }] },
  { id: 'c', phenotypes: [{ id: 'HP:0007359', observed: false }] },
  { id: 'd', phenotypes: [{ id: 'HP:0001263', observed: true }] }
];
const w = X.patientsWithTerm(pts, 'HP:0001250');
eq(w.observed.map((r) => r.patient.id), ['a'], 'a focal seizure is a seizure');
eq(w.excluded.map((r) => r.patient.id), ['b'], 'ruling out focal seizures does not rule out seizures');
const w2 = X.patientsWithTerm(pts, 'HP:0007359');
eq(w2.excluded.map((r) => r.patient.id).sort(), ['b', 'c'], 'ruling out seizures rules out focal seizures');
// features several patients share, at the most specific informative level
const shared = X.sharedFeatures([{ id: '1', terms: [H.hpNum('HP:0002669')] }, { id: '2', terms: [H.hpNum('HP:0002859')] }], 2);
ok(shared.some((x) => H.name(x.term) === 'Sarcoma'), 'osteosarcoma and rhabdomyosarcoma are both sarcomas');
ok(!shared.some((x) => x.term === 118), 'never the root');
ok(X.sharedWith('HP:0007359', [SEIZ]) && !X.sharedWith('HP:0001263', [SEIZ]), 'shared means the same line of the ontology');

/* ---------------- symbols one or two edits away ---------------- */
const P = await import('../assets/js/views/gene-parts.js');
eq(P.editDistance('BRAC1', 'BRCA1'), 1, 'two swapped letters are one edit');
eq(P.editDistance('TP53', 'TP63'), 1);
const G = await import('../assets/js/genes.js');
await G.loadGenes();
ok(P.nearSymbols('BRAC1', G.allGenes()).some((g) => g.symbol === 'BRCA1'), 'BRAC1 suggests BRCA1');
eq(P.inhWords([H.hpNum('HP:0001417'), H.hpNum('HP:0001423')], H), 'X-linked dominant', 'X-linked and X-linked dominant: the more specific');

console.log(`gene and phenotype pages: ${n} checks passed`);
