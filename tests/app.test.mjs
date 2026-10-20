// Tests of the pieces the pages rest on (no browser needed): node tests/app.test.mjs
//   the router's addresses, the PVS1 decision tree, a variant's class for lists, ClinGen allele ids,
//   ISCN for CNVs, and the relatives read from a pedigree drawing
import assert from 'node:assert/strict';
globalThis.window = globalThis;
globalThis.self = globalThis;
globalThis.addEventListener = () => {};
globalThis.location = { hash: '' };
globalThis.history = { replaceState() {} };
const mem = new Map();
globalThis.localStorage = { getItem: (k) => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, String(v)), removeItem: (k) => mem.delete(k) };

let n = 0;
const ok = (cond, msg) => {
  assert.ok(cond, msg);
  n++;
};

/* ---------- the router: params in the order of the pattern, optional last segments ---------- */
const router = await import('../assets/js/router.js');
for (const p of ['/', '/patients', '/patient/new', '/patient/:id/edit', '/patient/:id/variant/:vid/:section?', '/patient/:id/:tab?', '/variant/:q*', '/cnv/:q*', '/gene/:symbol/:tab?', '/region/:where', '/browser', '/learn/:topic?']) router.route(p, () => null);
const at = (hash) => router.parse(hash);
assert.deepEqual(at('#/patient/1001').params, { id: '1001', tab: undefined });
assert.deepEqual(at('#/patient/1001/family').params, { id: '1001', tab: 'family' });
assert.deepEqual(at('#/patient/1001/').params, { id: '1001', tab: undefined });
assert.equal(at('#/patient/new').route.pattern, '/patient/new');
assert.deepEqual(at('#/patient/1001/variant/v1').params, { id: '1001', vid: 'v1', section: undefined });
assert.deepEqual(at('#/patient/1001/variant/v1/family').params, { id: '1001', vid: 'v1', section: 'family' });
assert.deepEqual(at('#/gene/TP53/variants').params, { symbol: 'TP53', tab: 'variants' });
assert.equal(at('#/variant/NM_000546.6:c.818G%3EA').params.q, 'NM_000546.6:c.818G>A');
assert.deepEqual(at('#/variant/17-7673802-C-T?assembly=GRCh37').query, { assembly: 'GRCh37' });
assert.equal(at('#/cnv/chr22:1-2%20del').params.q, 'chr22:1-2 del');
assert.equal(at('#/nowhere/at/all').route, null);
n += 11;

/* ---------- the PVS1 decision tree ---------- */
const pvs1 = await import('../assets/js/acmg/pvs1.js');
ok(new Set(Object.keys(pvs1.TREE)).size === Object.keys(pvs1.TREE).length, 'each node once');
for (const [k, node] of Object.entries(pvs1.TREE)) for (const o of node.options) ok(o.result || pvs1.TREE[o.next], `${k} → ${o.next} exists`);
assert.equal(pvs1.walk([0, 0, 0]).strength, 'VS'); // nonsense, NMD, exon in relevant transcripts
assert.equal(pvs1.walk([0, 0, 1]).na, true);
assert.equal(pvs1.walk([0, 1, 0]).strength, 'S'); // escapes NMD, critical region
assert.equal(pvs1.walk([0, 1, 1, 1, 1]).strength, 'M'); // not critical, not frequent, ≤10%
assert.equal(pvs1.walk([4]).node.q, 'Does another functional transcript use a different start codon?');
assert.equal(pvs1.walk([4, 1, 0]).strength, 'M'); // start codon: pathogenic variants upstream
assert.equal(pvs1.walk([4, 1, 1]).strength, 'P');
assert.equal(pvs1.walk([2, 0]).strength, 'VS'); // whole-gene deletion
assert.equal(pvs1.startAnswer(['stop_gained']), 0);
assert.equal(pvs1.startAnswer(['start_lost']), 4);
n += 10;

/* ---------- a variant's class for the lists ---------- */
const summary = await import('../assets/js/summary.js');
const settings = await import('../assets/js/settings.js');
settings.set('framework', 'acgs2024');
let c = summary.currentClass({ kind: 'sequence', classification: { criteria: { PVS1: { met: true, strength: 'VS' }, PM2: { met: true, strength: 'M' } } } });
assert.equal(c.cls, 'p');
assert.equal(c.points, 10);
assert.equal(c.criteria, 'PVS1_vstr, PM2_mod');
c = summary.currentClass({ kind: 'sequence', classification: { criteria: { PM2: { met: true, strength: 'M' }, PP3: { met: true, strength: 'P' } } } });
assert.equal(c.cls, 'vus');
assert.equal(c.band, 'tepid');
c = summary.currentClass({ kind: 'cnv', cnvType: 'loss', cnv: { items: { '1A': { on: true }, '2A': { on: true }, '3B': { on: true } } } });
assert.equal(c.cls, 'p');
assert.equal(c.pointsText, '+1.45');
settings.set('framework', 'clingen');
c = summary.currentClass({ kind: 'sequence', classification: { criteria: { PVS1: { met: true, strength: 'VS' }, PM2: { met: true, strength: 'P' } } } });
assert.equal(c.cls, 'lp');
assert.equal(c.criteria, 'PVS1, PM2_Supporting');
// a signed class wins in the lists, the calculated one is kept beside it
const s = summary.summariseVariant({ kind: 'sequence', gene: 'X', classification: { criteria: { PM2: { met: true, strength: 'P' } }, saved: { cls: 'lb', criteria: 'BS1' } } });
assert.equal(s.cls, 'lb');
assert.equal(s.calculated, 'vus');
assert.equal(s.final, true);
settings.set('framework', 'acgs2024');
n += 14;

/* ---------- ClinGen allele ids: gnomAD gives them unpadded ---------- */
globalThis.indexedDB = undefined;
const erepo = await import('../assets/js/api/erepo.js');
assert.equal(erepo.normCaid('CA434'), 'CA000434');
assert.equal(erepo.normCaid('CAR:CA000434'), 'CA000434');
assert.equal(erepo.normCaid('CA10601234'), 'CA10601234');
assert.equal(erepo.normCaid('rs123'), null);
assert.deepEqual(erepo.parseCode('PM2_Supporting'), { code: 'PM2', strength: 'P' });
assert.deepEqual(erepo.parseCode('PS4'), { code: 'PS4', strength: null });
n += 6;

/* ---------- ClinVar's own record of a variant, on either build ---------- */
const cv = await import('../assets/js/api/clinvar.js');
const recs = [
  { uid: '1', spdi: 'NC_000017.11:7673801:C:T', loc37: { chrom: '17', start: 7577120, stop: 7577120 } },
  { uid: '2', spdi: 'NC_000017.11:7673801:C:A', loc37: { chrom: '17', start: 7577120, stop: 7577120 } },
  { uid: '3', spdi: 'NC_000017.11:43124026:CT:', loc37: { chrom: '17', start: 41276113, stop: 41276114 } }
];
assert.equal(cv.findSelf(recs, { pos: 7673802, ref: 'C', alt: 'T' }, null, 'GRCh38').uid, '1');
assert.equal(cv.findSelf(recs, { pos: 7577120, ref: 'C', alt: 'T' }, null, 'GRCh37').uid, '1');
assert.equal(cv.findSelf(recs, { pos: 7577120, ref: 'C', alt: 'G' }, null, 'GRCh37'), null);
assert.equal(cv.findSelf(recs, { pos: 41276112, ref: 'ACT', alt: 'A' }, null, 'GRCh37').uid, '3');
n += 4;

/* ---------- CNVs as ISCN ---------- */
const karyo = await import('../assets/js/widgets/karyogram.js');
const B = { 22: [[18900000, 21700000, 'q11.21', 'gneg'], [21700000, 23100000, 'q11.22', 'gpos25']] };
assert.equal(karyo.iscnOf({ chrom: '22', start: 18912231, end: 21465672, copyNumber: 1, assembly: 'GRCh38' }, B), 'arr[GRCh38] 22q11.21(18912231_21465672)x1');
assert.equal(karyo.iscnOf({ chrom: 'chr22', start: 18912231, end: 22000000, cnvType: 'gain', assembly: 'GRCh38' }, B), 'arr[GRCh38] 22q11.21q11.22(18912231_22000000)x3');
assert.equal(karyo.iscnOf({ chrom: '7', start: 1, end: 2, copyNumber: 0, assembly: 'GRCh37' }, B), 'arr[GRCh37] 7(1_2)x0');
n += 3;

/* ---------- the relatives read from a drawing ---------- */
const seg = await import('../assets/js/acmg/segregation.js');
const fam = await import('../assets/js/views/patient-family.js');
const pt = { pedigree: seg.quickPedigree({ proband: { sex: 'female', affected: true }, motherAffected: true, consanguineous: true, siblings: [{ sex: 'male', affected: false }], condition: 'Hearing loss' }) };
const read = fam.readFamily(seg, pt);
assert.equal(read.proband, 'p-proband');
const byRel = Object.fromEntries(read.list.map((r) => [r.relation, r]));
assert.equal(byRel.mother.affected, 'affected');
assert.equal(byRel.father.affected, 'unaffected');
assert.equal(byRel.brother.sex, 'M');
assert.equal((await fam.familyList(pt)).length, 4);
assert.deepEqual(await fam.familyList({}), []);
n += 6;

console.log(`app: ${n} checks passed`);
