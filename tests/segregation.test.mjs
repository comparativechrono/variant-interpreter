// Tests of the co-segregation likelihood ratio: node tests/segregation.test.mjs
import assert from 'node:assert/strict';
globalThis.window = globalThis;
globalThis.self = globalThis;
const { cosegregation, quickPedigree, readDrawing, relationships } = await import('../assets/js/acmg/segregation.js');

let n = 0;
// a dominant family: father affected, four children
const drawing = quickPedigree({ proband: { sex: 'female', affected: true }, fatherAffected: true, siblings: [{ sex: 'male', affected: true }, { sex: 'female', affected: true }, { sex: 'male', affected: false }], condition: 'Cardiomyopathy' });
const fam = readDrawing(drawing);
const cond = fam.conditions[0].key;
const rel = relationships(fam, 'p-proband');
assert.equal(rel['p-father'], 'father');
assert.equal(rel['p-sib1'], 'brother');
n += 2;
const model = { mode: 'AD', penetrance: 0.999, phenocopy: 0.0001, q: 0.0001 };
// every relative fits: affected carriers and an unaffected non-carrier
let r = cosegregation({ family: fam, conditionKey: cond, probandId: 'p-proband', genotypes: { 'p-proband': 'het', 'p-father': 'het', 'p-sib1': 'het', 'p-sib2': 'het', 'p-sib3': 'ref' }, model });
assert.ok(r.ok, r.message);
// with full penetrance and no phenocopies each informative child halves the chance by chance alone: 2^4 = 16 for the four
// children's transmissions from an affected father who carries it (the father's own genotype adds a little too)
console.log('LR', r.lr.toFixed(2), 'LOD', r.lod.toFixed(2), 'meioses', r.meioses.toFixed(2), r.strength);
assert.ok(r.lr > 8 && r.lr < 64, 'LR in the expected range');
assert.equal(r.direction, 'for');
n += 2;
// an affected sister without the variant: evidence against
r = cosegregation({ family: fam, conditionKey: cond, probandId: 'p-proband', genotypes: { 'p-proband': 'het', 'p-sib2': 'ref' }, model });
console.log('against: LR', r.lr.toExponential(2), r.strength);
assert.equal(r.direction, 'against');
assert.ok(r.lr < 0.1);
n += 2;
// untested relatives say nothing
r = cosegregation({ family: fam, conditionKey: cond, probandId: 'p-proband', genotypes: { 'p-proband': 'het' }, model });
assert.equal(r.ok, false);
n++;
// both parents tested and without it: de novo, not a break of Mendel's laws
r = cosegregation({ family: fam, conditionKey: cond, probandId: 'p-proband', genotypes: { 'p-proband': 'het', 'p-father': 'ref', 'p-mother': 'ref', 'p-sib1': 'ref' }, model });
assert.equal(r.ok, false);
assert.equal(r.denovo, true, r.message);
assert.match(r.message, /de novo/);
n += 3;
console.log(`segregation: ${n} checks passed`);
