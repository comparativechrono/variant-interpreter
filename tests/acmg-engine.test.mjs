// Tests of the combining rules and the points: node tests/acmg-engine.test.mjs
import assert from 'node:assert/strict';
import { classify, richards, posterior, criteriaString, metList } from '../assets/js/acmg/engine.js';

const st = (...codes) => {
  const criteria = {};
  for (const c of codes) {
    const [code, s] = c.split('_');
    const strength = s ? { VeryStrong: 'VS', Strong: 'S', Moderate: 'M', Supporting: 'P', StandAlone: 'SA' }[s] : null;
    const def = { PVS: 'VS', PS: 'S', PM: 'M', PP: 'P', BA: 'SA', BS: 'S', BP: 'P' }[/^(PVS|PS|PM|PP|BA|BS|BP)/.exec(code)[1]];
    criteria[code] = { met: true, strength: strength || def };
  }
  return { criteria };
};
let n = 0;
const check = (codes, rules, points, pts, framework = 'clingen') => {
  const r = classify(st(...codes), { framework });
  assert.equal(r.byRules.cls, rules, `${codes.join('+')}: rules gave ${r.byRules.cls}, expected ${rules}`);
  assert.equal(r.byPoints.cls, points, `${codes.join('+')}: points gave ${r.byPoints.cls}, expected ${points}`);
  if (pts != null) assert.equal(r.points, pts, `${codes.join('+')}: ${r.points} points, expected ${pts}`);
  n++;
};

// pathogenic
check(['PVS1', 'PS3'], 'p', 'p', 12);
check(['PVS1', 'PM1', 'PM2'], 'p', 'p', 12);
check(['PVS1', 'PM1', 'PP3'], 'p', 'p', 11);
check(['PVS1', 'PP3', 'PP4'], 'p', 'p', 10);
check(['PS1', 'PS3'], 'p', 'lp', 8);                 // 2 strong: pathogenic by the rules, 8 points (LP) by points
check(['PS3', 'PM1', 'PM5', 'PM4'], 'p', 'p', 10);
check(['PS3', 'PM1', 'PM5', 'PP3', 'PP4'], 'p', 'p', 10);
check(['PS3', 'PM1', 'PP1', 'PP2', 'PP3', 'PP4'], 'p', 'p', 10);
// likely pathogenic
check(['PVS1', 'PM2'], 'lp', 'p', 10);               // the known difference between the two
check(['PVS1', 'PM2_Supporting'], 'lp', 'lp', 9);    // ClinGen SVI 2020
check(['PS3', 'PM1'], 'lp', 'lp', 6);
check(['PS3', 'PP3', 'PP4'], 'lp', 'lp', 6);
check(['PM1', 'PM5', 'PM4'], 'lp', 'lp', 6);
check(['PM1', 'PM5', 'PP3', 'PP4'], 'lp', 'lp', 6);
check(['PM1', 'PP1', 'PP2', 'PP3', 'PP4'], 'lp', 'lp', 6);
// uncertain
check(['PVS1'], 'vus', 'lp', 8);                     // PVS1 alone: the rules say nothing, points say LP
check(['PM2_Supporting', 'PP3'], 'vus', 'vus', 2);
check(['PM1', 'PM2_Supporting', 'PP3'], 'vus', 'vus', 4);
check([], 'vus', 'vus', 0);
// strength changes: a strong slot can be filled by very strong evidence
check(['PVS1', 'PS2_VeryStrong'], 'p', 'p', 16);
check(['PS2_VeryStrong', 'PM2_Supporting'], 'lp', 'lp', 9);
check(['PVS1_Strong', 'PM2_Supporting', 'PP3'], 'lp', 'lp', 6);
// benign
check(['BA1'], 'b', 'b');
check(['BS1', 'BS2'], 'b', 'b', -8);
check(['BS1', 'BP4'], 'lb', 'lb', -5);
check(['BP4', 'BP7'], 'lb', 'lb', -2);
check(['BS3'], 'vus', 'lb', -4);
check(['BP4'], 'vus', 'lb', -1);
// both: contradictory when both sides reach a class
check(['PS3', 'PM1', 'BS1', 'BS2'], 'vus', 'lb', -2);    // the rules: contradictory; points: 6 - 8 = -2
check(['PVS1', 'PS3', 'BS1'], 'p', 'lp', 8);         // the rules leave BS1 to judgement (with a note); points subtract it
{
  const r = richards(metList(st('PVS1', 'PS3', 'BS1')));
  assert.ok(r.notes.some((x) => /Benign criteria are met too/.test(x)));
  n++;
}
// ACGS 2024: two criteria at least, except BA1
check(['PVS1'], 'vus', 'vus', 8, 'acgs2024');
check(['BP4'], 'vus', 'vus', -1, 'acgs2024');
check(['BS3'], 'vus', 'vus', -4, 'acgs2024');
check(['BA1'], 'b', 'b', 0, 'acgs2024');
check(['PVS1', 'PM2'], 'lp', 'p', 10, 'acgs2024');
check(['PS3', 'PM2'], 'lp', 'lp', 6, 'acgs2024');
// the 2015 rules as the main method: the class follows the rules
{
  const r = classify(st('PS1', 'PS3'), { framework: 'acmg2015' });
  assert.equal(r.cls, 'p');
  assert.equal(r.byPoints.cls, 'lp');
  n += 2;
}
// a benign moderate counts as two supporting in the rules (Pejaver et al. 2022)
check(['BP4_Moderate'], 'lb', 'lb', -2);
// the bands of uncertain significance
assert.equal(classify(st('PM2_Supporting', 'PP3', 'PP4'), { framework: 'clingen' }).band, 'tepid');
assert.equal(classify(st('PVS1_Moderate', 'PM2_Supporting', 'PP4'), { framework: 'clingen' }).band, 'warm');
n += 2;
// labels in each framework's style
assert.equal(criteriaString(metList(st('PVS1', 'PM2_Supporting', 'PP3')), 'acgs2024'), 'PVS1_vstr, PM2_sup, PP3_sup');
n++;
// posterior probabilities match Tavtigian et al. (2018)
assert.ok(Math.abs(posterior(8) - 0.9749) < 0.001, 'posterior of 8 points');
assert.ok(posterior(10) > 0.99 && posterior(9) < 0.99, 'P boundary at 10 points');
assert.ok(posterior(6) >= 0.899 && posterior(5) < 0.9, 'LP boundary at 6 points');
assert.ok(posterior(-7) < 0.001 && posterior(-6) > 0.001, 'B boundary at -7 points');
n += 4;
// the criteria string
assert.equal(criteriaString(metList(st('PP3', 'PM2_Supporting', 'PVS1', 'BP4'))), 'PVS1, PM2_Supporting, PP3, BP4');
n++;
console.log(`acmg engine: ${n} checks passed`);
