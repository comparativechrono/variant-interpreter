// Tests of the CNV points: node tests/cnv-rubric.test.mjs
import assert from 'node:assert/strict';
import { score, cnvClass, RUBRIC, fmtPts } from '../assets/js/cnv/rubric.js';
let n = 0;
// a 2.5 Mb 22q11.2 deletion: 1A, 2A (contains the established HI region), 3C (more than 35 genes), de novo
let r = score('loss', { items: { '1A': { on: true }, '2A': { on: true }, '3C': { on: true }, '5A': { on: true, option: 0 } } });
assert.equal(r.total, 0 + 100 + 90 + 45); assert.equal(r.cls, 'p'); n += 2;
// 0.30 + 0.60: exactly 0.90 (likely pathogenic), not 0.8999…
r = score('loss', { items: { '2D-3': { on: true }, '3B': { on: true, pts: 45 }, '5H': { on: true } } });
assert.equal(r.total, 30 + 45 + 15); assert.equal(r.cls, 'lp'); n += 2;
// the shared cap of 4A+4B+4C (0.90)
r = score('loss', { items: { '4A': { on: true, cases: [{ confirmed: true }, { confirmed: true }, { confirmed: true }] } } });
assert.equal(r.total, 90); n++;
// the boundaries
assert.equal(cnvClass(99), 'p'); assert.equal(cnvClass(98), 'lp'); assert.equal(cnvClass(89), 'vus'); assert.equal(cnvClass(-89), 'vus');
assert.equal(cnvClass(-90), 'lb'); assert.equal(cnvClass(-95), 'lb'); assert.equal(cnvClass(-98), 'lb'); assert.equal(cnvClass(-99), 'b'); n += 8;
// benign: no genes, within a benign region
r = score('loss', { items: { '1B': { on: true }, '2F': { on: true } } });
assert.equal(r.total, -160); assert.equal(r.cls, 'b'); n += 2;
// a gain with loss 4N: −0.90 per study, at most −0.90
r = score('gain', { items: { '1A': { on: true }, '4N': { on: true, cases: [{}, {}] } } });
assert.equal(r.total, -90); assert.equal(r.cls, 'lb'); n += 2;
assert.equal(fmtPts(45), '+0.45'); assert.equal(fmtPts(-100), '−1.00'); n += 2;
// every item has a code and text
for (const t of ['loss', 'gain']) for (const s of RUBRIC[t]) for (const it of s.items) { assert.ok(it.code && it.text, t + ' ' + it.code); n++; }
console.log(`cnv rubric: ${n} checks passed`);
