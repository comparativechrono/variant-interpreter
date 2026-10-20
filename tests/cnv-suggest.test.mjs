// Tests of the CNV page's suggestions, its score, and the reading of UCSC's files: node tests/cnv-suggest.test.mjs
import assert from 'node:assert/strict';

// the modules expect a browser's window and storage
globalThis.window = globalThis.window || {};
globalThis.localStorage = globalThis.localStorage || { getItem: () => null, setItem: () => {}, removeItem: () => {} };

const { suggestCNV, geneCount, SECTION3 } = await import('../assets/js/cnv/suggest.js');
const { score, RUBRIC } = await import('../assets/js/cnv/rubric.js');
const { CNVScore, scalePos } = await import('../assets/js/cnv/panel.js');
const { cover, overlapBp } = await import('../assets/js/api/cnv-sources.js');
const { fieldsOfAutoSql } = await import('../assets/js/api/ucsc.js');

let n = 0;
const gene = (symbol, o = {}) => Object.assign({ symbol, pc: true, whole: true, inside: false, five: true, three: true, hi: null, ts: null, hiWhy: [] }, o);
const genes = (k, prefix = 'G', o = {}) => Array.from({ length: k }, (_, i) => gene(prefix + (i + 1), o));

/* ---------------- a 22q11.2 deletion ---------------- */
const dgs = { id: 'ISCA-37446', name: '22q11.2 recurrent (DGS) region', hi: 3, ts: 3, whole: true, inside: false, coverOfRegion: 1 };
const popBenign = { id: 'ISCA-46533', name: '22q11.21 population region', hi: 40, ts: 0, whole: true, inside: false, coverOfRegion: 1 };
let s = suggestCNV({ type: 'loss', genes: genes(46), regions: [dgs, popBenign], pop: [], inheritance: null });
assert.equal(s['1A'].pts, 0); n++;
assert.equal(s['2A'].pts, 100); n++;
assert.ok(/22q11\.2 recurrent/.test(s['2A'].why)); n++;
assert.equal(s['2G'].pts, 0, 'a small benign region inside it: 2G'); n++;
assert.equal(s['2H'], undefined, 'no 2H with 2A'); n++;
assert.equal(s['3C'].pts, 90); n++;
assert.ok(!Object.keys(s).some((k) => k[0] === '5'), 'no section 5 without a patient'); n++;

/* ---------------- section 5 ---------------- */
const five = (inheritance, parentAffected = null) => suggestCNV({ type: 'loss', genes: [], regions: [], pop: [], inheritance, parentAffected });
s = five('denovo-confirmed');
assert.equal(s['5A'].option, 4); assert.equal(s['5A'].pts, 15); n += 2;
s = five('denovo-assumed');
assert.equal(s['5A'].option, 5); assert.equal(s['5A'].pts, 10); n += 2;
s = five('maternal', false);
assert.equal(s['5C'].pts, -15); n++;
s = five('paternal', true);
assert.ok(s['5D'] && s['5D'].look); n++;
s = five('maternal', null);
assert.equal(s['5F'].pts, 0); n++;
s = five('unknown');
assert.equal(s['5F'].pts, 0); n++;
s = five('balanced');
assert.ok(s['5A'] && s['5A'].look); n++;

/* ---------------- a loss with no genes ---------------- */
s = suggestCNV({ type: 'loss', genes: [], regions: [], pop: [], inheritance: null });
assert.equal(s['1B'].pts, -60); assert.equal(s['3A'].pts, 0); assert.equal(s['1A'], undefined); n += 3;
// within an established benign region
s = suggestCNV({ type: 'loss', genes: genes(2), regions: [{ id: 'ISCA-1', name: 'benign', hi: 40, inside: true, whole: false }], pop: [] });
assert.equal(s['2F'].pts, -100); n++;

/* ---------------- a haploinsufficient gene cut by a breakpoint ---------------- */
s = suggestCNV({ type: 'loss', genes: [gene('NSD1', { hi: 3, whole: false, five: true, three: false })], regions: [], pop: [] });
assert.equal(s['2C-1'].pts, 90); n++;
s = suggestCNV({ type: 'loss', genes: [gene('NSD1', { hi: 3, whole: false, five: false, three: true })], regions: [], pop: [] });
assert.ok(s['2D-4'].look); n++;
s = suggestCNV({ type: 'loss', genes: [gene('NSD1', { hi: 3, whole: false, inside: true, five: false, three: false })], regions: [], pop: [] });
assert.ok(s['2E'].look); n++;
// predicted haploinsufficiency (2H) needs two predictors
s = suggestCNV({ type: 'loss', genes: [gene('A', { hiWhy: ['pHaplo 0.95 ≥ 0.86', 'LOEUF 0.20 < 0.6'] })], regions: [], pop: [] });
assert.equal(s['2H'].pts, 15); n++;
s = suggestCNV({ type: 'loss', genes: [gene('A', { hiWhy: ['pHaplo 0.95 ≥ 0.86'] })], regions: [], pop: [] });
assert.equal(s['2H'], undefined); n++;

/* ---------------- section 3: the bands, and families of genes counted once ---------------- */
for (const [type, k, code] of [['loss', 24, '3A'], ['loss', 25, '3B'], ['loss', 34, '3B'], ['loss', 35, '3C'], ['gain', 34, '3A'], ['gain', 35, '3B'], ['gain', 49, '3B'], ['gain', 50, '3C']]) {
  s = suggestCNV({ type, genes: genes(k), regions: [], pop: [] });
  assert.ok(s[code], `${type} with ${k} genes: ${code}`); n++;
}
const fam = geneCount([gene('OR4F5'), gene('OR4F29'), gene('OR4F16'), gene('KRTAP1-1'), gene('KRTAP1-3'), gene('TBX1')]);
assert.equal(fam.all, 6); assert.equal(fam.counted, 3); assert.equal(fam.families.length, 2); n += 3;
assert.deepEqual(SECTION3.loss.map((x) => x[2]), ['3A', '3B', '3C']); n++;
const one = geneCount([gene('TAS2R1'), gene('TRIO')]);
assert.equal(one.counted, 2); assert.equal(one.families.length, 0, 'a family of one is not told of'); n += 2;

/* ---------------- 4O: common in the population ---------------- */
s = suggestCNV({ type: 'loss', genes: genes(1), regions: [], pop: [{ source: 'gnomAD', type: 'loss', af: 0.02, coverOfCnv: 0.95 }] });
assert.equal(s['4O'].pts, -100); n++;
s = suggestCNV({ type: 'loss', genes: genes(1), regions: [], pop: [{ source: 'gnomAD', type: 'loss', af: 0.003, coverOfCnv: 0.95 }] });
assert.ok(s['4O'].look); n++;
s = suggestCNV({ type: 'loss', genes: genes(1), regions: [], pop: [{ source: 'gnomAD', type: 'loss', af: 0.02, coverOfCnv: 0.5 }] });
assert.equal(s['4O'], undefined); n++;
s = suggestCNV({ type: 'loss', genes: genes(1), regions: [], pop: [{ source: 'gnomAD', type: 'gain', af: 0.2, coverOfCnv: 1 }] });
assert.equal(s['4O'], undefined, 'gains do not count for a loss'); n++;

/* ---------------- gains ---------------- */
s = suggestCNV({ type: 'gain', genes: [gene('PMP22', { ts: 3 })], regions: [], pop: [] });
assert.equal(s['2A'].pts, 100); n++;
const benignGain = (o) => Object.assign({ id: 'ISCA-9', name: 'benign gain', hi: 0, ts: 40, whole: false, inside: false, coverOfRegion: 0.5, genes: ['A', 'B'] }, o);
s = suggestCNV({ type: 'gain', genes: [gene('A'), gene('B')], regions: [benignGain({ whole: true, inside: true })], pop: [] });
assert.equal(s['2C'].pts, -100); n++;
s = suggestCNV({ type: 'gain', genes: [gene('A')], regions: [benignGain({ inside: true })], pop: [] });
assert.equal(s['2D'].pts, -100); n++;
s = suggestCNV({ type: 'gain', genes: [gene('A', { whole: false })], regions: [benignGain({ inside: true })], pop: [] });
assert.equal(s['2E'].pts, 0); n++;
s = suggestCNV({ type: 'gain', genes: [gene('A'), gene('B')], regions: [benignGain({ whole: true, genes: ['A', 'B', 'Z'] })], pop: [] });
assert.equal(s['2F'].pts, -100, 'larger than the benign gain, with no more genes'); n++;
s = suggestCNV({ type: 'gain', genes: [gene('A'), gene('B'), gene('C')], regions: [benignGain({ whole: true })], pop: [] });
assert.equal(s['2G'].pts, 0); n++;
s = suggestCNV({ type: 'gain', genes: [gene('NSD1', { hi: 3 })], regions: [], pop: [] });
assert.equal(s['2H'].pts, 0); n++;
s = suggestCNV({ type: 'gain', genes: [gene('NSD1', { hi: 3, whole: false, inside: true })], regions: [], pop: [] });
assert.ok(s['2I'].look); n++;
s = suggestCNV({ type: 'gain', genes: [gene('NSD1', { hi: 3, whole: false })], regions: [], pop: [] });
assert.equal(s['2J'].pts, 0); n++;

/* ---------------- the rubric's points ---------------- */
// the 2021 correction: a loss's 5H is 0.15 by default (0 to 0.30)
assert.equal(score('loss', { items: { '5H': { on: true } } }).total, 15); n++;
assert.equal(score('loss', { items: { '5H': { on: true, pts: 30 } } }).total, 30); n++;
assert.equal(score('loss', { items: { '5H': { on: true, pts: 60 } } }).total, 30, 'clamped to its range'); n++;
// 4A to 4C together at most 0.90
assert.equal(score('loss', { items: { '4A': { on: true, cases: [{ confirmed: true }, { confirmed: true }] }, '4B': { on: true, cases: [{ confirmed: true }] } } }).total, 90); n++;
// 4D at most −0.30
assert.equal(score('loss', { items: { '4D': { on: true, cases: [{ pts: -30 }, { pts: -30 }] } } }).total, -30); n++;
// 5A's options and their ranges
assert.equal(score('loss', { items: { '5A': { on: true, option: 0 } } }).total, 45); n++;
assert.equal(score('loss', { items: { '5A': { on: true, option: 4, pts: 30 } } }).total, 30); n++;
assert.equal(score('loss', { items: { '5A': { on: true, option: 4, pts: 80 } } }).total, 30, '5A option 4 is at most 0.30'); n++;

/* ---------------- the score of a page: items that exclude each other ---------------- */
const v = { kind: 'cnv', cnvType: 'loss', cnv: { items: {} } };
const sc = new CNVScore(v);
sc.set('3B', { on: true });
let off = sc.set('3C', { on: true });
assert.deepEqual(off, ['3B']); assert.equal(sc.isOn('3B'), false); assert.equal(sc.isOn('3C'), true); n += 3;
sc.set('4A', { on: true });
sc.set('4B', { on: true });
assert.ok(sc.isOn('4A') && sc.isOn('4B'), '4A to 4D go together: categories of reported cases'); n++;
assert.equal(v.cnv.items['4A'].cases.length, 1, 'a case item starts with one case'); n++;
off = sc.set('5F', { on: true });
off = sc.set('5A', { on: true, option: 0 });
assert.deepEqual(off, ['5F']); n++;
// 3C 0.90, 4A one confirmed case 0.45, 4B one confirmed case 0.30, 5A 0.45: 2.10
assert.equal(sc.result().total, 90 + 45 + 30 + 45); n++;
let heard = 0;
sc.on(() => heard++);
sc.note('3C', 'Contains 40 genes.');
assert.equal(heard, 1); assert.equal(v.cnv.notes['3C'], 'Contains 40 genes.'); n += 2;

/* ---------------- the scale and the overlaps ---------------- */
assert.equal(scalePos(-150), 0); assert.equal(scalePos(150), 100); assert.equal(scalePos(0), 50); n += 3;
assert.ok(scalePos(-90) < scalePos(-89) && scalePos(90) < scalePos(99)); n++;
assert.equal(overlapBp(1, 100, 51, 200), 50); assert.equal(overlapBp(1, 10, 20, 30), 0); n += 2;
const c = cover(1, 100, 51, 250);
assert.equal(c.bp, 50); assert.equal(c.ofA, 0.5); assert.equal(c.ofB, 0.25); assert.equal(c.reciprocal, 0.25); n += 4;

/* ---------------- UCSC's autoSql ---------------- */
const f = fieldsOfAutoSql(`table clinGenCnv
"Dosage"
    (
    string chrom;      "Reference sequence chromosome or scaffold"
    uint   chromStart; "Start position in chromosome"
    uint   chromEnd;   "End position in chromosome"
    string name;       "Short Name of item"
    int[blockCount] blockSizes; "Comma separated list of block sizes"
    lstring _mouseOver; "Mouseover"
    )`);
assert.deepEqual(f, ['chrom', 'chromStart', 'chromEnd', 'name', 'blockSizes', '_mouseOver']); n++;

// every item that a suggestion can name exists in the rubric
const all = { loss: new Set(RUBRIC.loss.flatMap((x) => x.items.map((i) => i.code))), gain: new Set(RUBRIC.gain.flatMap((x) => x.items.map((i) => i.code))) };
for (const type of ['loss', 'gain']) {
  for (const inh of ['denovo-confirmed', 'maternal', 'unknown', 'balanced']) {
    const r = suggestCNV({ type, genes: [gene('A', { hi: 3, whole: false, five: true, three: false }), ...genes(40)], regions: [dgs, popBenign, benignGain({})], pop: [{ source: 'x', type, af: 0.05, coverOfCnv: 1 }], inheritance: inh, parentAffected: false });
    for (const k of Object.keys(r)) {
      assert.ok(all[type].has(k), `${type}: ${k} is an item`);
      n++;
    }
  }
}
console.log(`cnv suggestions: ${n} checks passed`);
