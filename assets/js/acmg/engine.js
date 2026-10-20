/* =====================================================================
   Combining the criteria into a classification, two ways.

   1. The rules of Richards et al. (2015), Table 5: counts of very strong,
      strong, moderate and supporting pathogenic evidence, and of stand-
      alone, strong and supporting benign evidence, at the strengths the
      criteria were given. With ClinGen's later additions: 1 very strong
      and 1 supporting is likely pathogenic (SVI 2020, for PVS1 with
      PM2_Supporting); benign moderate evidence counts as two supporting
      (Pejaver et al. 2022). When the criteria for a pathogenic and a
      benign class are both met, the variant is of uncertain significance.

   2. Points (Tavtigian et al. 2018 and 2020), which ClinGen and the ACGS
      2024 guidelines use: supporting 1, moderate 2, strong 4, very strong
      8, negative for benign evidence. Pathogenic ≥ 10, likely pathogenic
      6 to 9, uncertain 0 to 5, likely benign −1 to −6, benign ≤ −7. BA1
      makes a variant benign by itself. The points are the exponent of the
      odds of pathogenicity in Tavtigian's Bayesian model: odds =
      350^(points/8), with a prior probability of 0.1.

   The ACGS 2024 guidelines add that, except for BA1, a class other than
   uncertain needs at least two criteria (so PVS1 alone is a VUS).
   ===================================================================== */
import { fw, labelFor, baseDefault, fitStrength } from './frameworks.js';
import { BY_CODE } from './criteria.js';

export const LEVEL = { VS: 4, S: 3, M: 2, P: 1 };
export const POINTS = { VS: 8, S: 4, M: 2, P: 1, SA: 8 };
export const PRIOR = 0.1;
export const O_PVST = 350;

/* the six bands of uncertain significance (NHS England GeNotes; ACGS 2020), by points; ACGS 2024 groups them in three */
export const VUS_BANDS = [
  { key: 'hot', points: 5, label: 'Hot' },
  { key: 'warm', points: 4, label: 'Warm' },
  { key: 'tepid', points: 3, label: 'Tepid' },
  { key: 'cool', points: 2, label: 'Cool' },
  { key: 'cold', points: 1, label: 'Cold' },
  { key: 'icecold', points: 0, label: 'Ice cold' }
];
export const bandOf = (points) => {
  const b = VUS_BANDS.find((x) => x.points === Math.max(0, Math.min(5, Math.floor(points))));
  return points >= 0 && points <= 5 && b ? b.key : null;
};

export const THRESHOLDS = { p: 10, lp: 6, lb: -1, b: -7 };
export function classOfPoints(points, hasBA1) {
  if (hasBA1) return 'b';
  if (points >= THRESHOLDS.p) return 'p';
  if (points >= THRESHOLDS.lp) return 'lp';
  if (points <= THRESHOLDS.b) return 'b';
  if (points <= THRESHOLDS.lb) return 'lb';
  return 'vus';
}
/** the posterior probability of pathogenicity for a number of points (Tavtigian et al. 2018) */
export function posterior(points, prior = PRIOR) {
  const odds = Math.pow(O_PVST, points / 8);
  return (odds * prior) / ((odds - 1) * prior + 1);
}

/** the criteria that are met, as [{code, dir: 'P'|'B', strength}] */
export function metList(state, framework) {
  const out = [];
  for (const [code, c] of Object.entries((state && state.criteria) || {})) {
    if (!c || !c.met) continue;
    const given = c.strength || baseDefault(code);
    // a strength the framework does not allow (marked under another) counts at the nearest one it does
    const s = framework && BY_CODE[code] ? fitStrength(BY_CODE[code], given, framework) : given;
    out.push(Object.assign({ code, dir: code[0] === 'B' ? 'B' : 'P', strength: s }, s !== given ? { given } : {}));
  }
  return out;
}

/** points for a list of met criteria */
export function pointsOf(met) {
  let pts = 0;
  for (const m of met) {
    if (m.dir === 'B' && m.strength === 'SA') continue; // BA1 is stand-alone, not points
    const v = POINTS[m.strength] || 0;
    pts += m.dir === 'P' ? v : -v;
  }
  return pts;
}

/* ---------------- Richards et al. 2015 ---------------- */
/* each rule is a list of slots [level, count]; a slot may be filled by evidence of that level or stronger */
const P_RULES = [
  { name: 'Pathogenic (i)(a)', text: '1 very strong and at least 1 strong', slots: [['VS', 1], ['S', 1]] },
  { name: 'Pathogenic (i)(b)', text: '1 very strong and at least 2 moderate', slots: [['VS', 1], ['M', 2]] },
  { name: 'Pathogenic (i)(c)', text: '1 very strong, 1 moderate and 1 supporting', slots: [['VS', 1], ['M', 1], ['P', 1]] },
  { name: 'Pathogenic (i)(d)', text: '1 very strong and at least 2 supporting', slots: [['VS', 1], ['P', 2]] },
  { name: 'Pathogenic (ii)', text: 'at least 2 strong', slots: [['S', 2]] },
  { name: 'Pathogenic (iii)(a)', text: '1 strong and at least 3 moderate', slots: [['S', 1], ['M', 3]] },
  { name: 'Pathogenic (iii)(b)', text: '1 strong, 2 moderate and at least 2 supporting', slots: [['S', 1], ['M', 2], ['P', 2]] },
  { name: 'Pathogenic (iii)(c)', text: '1 strong, 1 moderate and at least 4 supporting', slots: [['S', 1], ['M', 1], ['P', 4]] }
];
const LP_RULES = [
  { name: 'Likely pathogenic (i)', text: '1 very strong and 1 moderate', slots: [['VS', 1], ['M', 1]] },
  { name: 'Likely pathogenic (ii)', text: '1 strong and 1 or 2 moderate', slots: [['S', 1], ['M', 1]] },
  { name: 'Likely pathogenic (iii)', text: '1 strong and at least 2 supporting', slots: [['S', 1], ['P', 2]] },
  { name: 'Likely pathogenic (iv)', text: 'at least 3 moderate', slots: [['M', 3]] },
  { name: 'Likely pathogenic (v)', text: '2 moderate and at least 2 supporting', slots: [['M', 2], ['P', 2]] },
  { name: 'Likely pathogenic (vi)', text: '1 moderate and at least 4 supporting', slots: [['M', 1], ['P', 4]] }
];
const LP_SVI = { name: 'Likely pathogenic (ClinGen SVI 2020)', text: '1 very strong and 1 supporting, as with PVS1 and PM2_Supporting', slots: [['VS', 1], ['P', 1]] };

/** can the slots be filled from these strengths? Fill the strongest slots first, each with the weakest evidence
    that is strong enough, so that strong evidence is kept for the slots that need it */
function fits(slots, levels) {
  const pool = levels.slice().sort((a, b) => a - b); // weakest first
  const need = slots.slice().sort((a, b) => LEVEL[b[0]] - LEVEL[a[0]]);
  for (const [lv, n] of need) {
    for (let k = 0; k < n; k++) {
      const i = pool.findIndex((x) => x >= LEVEL[lv]);
      if (i < 0) return false;
      pool.splice(i, 1);
    }
  }
  return true;
}

export function richards(met, opts = {}) {
  const pLevels = met.filter((m) => m.dir === 'P').map((m) => LEVEL[m.strength] || 1);
  const b = met.filter((m) => m.dir === 'B');
  const ba = b.filter((m) => m.strength === 'SA').length;
  const bs = b.filter((m) => m.strength === 'S' || m.strength === 'VS').length;
  const bm = b.filter((m) => m.strength === 'M').length;
  // a benign moderate counts as two supporting (Brnich et al. 2019, Table 3; Pejaver et al. 2022 likewise)
  const bp = b.filter((m) => m.strength === 'P').length + 2 * bm;
  const notes = [];
  if (bm) notes.push('The 2015 rules have no benign evidence at moderate strength, so each such criterion counts as two supporting, as Brnich et al. (2019) and Pejaver et al. (2022) advise.');
  let pRule = null;
  for (const r of P_RULES) if (fits(r.slots, pLevels)) { pRule = { cls: 'p', ...r }; break; }
  if (!pRule) for (const r of LP_RULES) if (fits(r.slots, pLevels)) { pRule = { cls: 'lp', ...r }; break; }
  if (!pRule && opts.sviPVS1PM2 !== false && fits(LP_SVI.slots, pLevels)) pRule = { cls: 'lp', ...LP_SVI };
  let bRule = null;
  if (ba) bRule = { cls: 'b', name: 'Benign (i)', text: '1 stand-alone criterion, BA1' };
  else if (bs >= 2) bRule = { cls: 'b', name: 'Benign (ii)', text: 'at least 2 strong' };
  else if (bs >= 1 && bp >= 1) bRule = { cls: 'lb', name: 'Likely benign (i)', text: '1 strong and 1 supporting' };
  else if (bp >= 2) bRule = { cls: 'lb', name: 'Likely benign (ii)', text: 'at least 2 supporting' };
  const anyP = pLevels.length > 0, anyB = b.length > 0;
  if (pRule && bRule) {
    return { cls: 'vus', conflict: true, rule: { name: 'Uncertain significance (ii)', text: 'the criteria for a pathogenic class and for a benign class are both met, and they contradict each other' }, pRule, bRule, notes };
  }
  if (pRule && anyB) notes.push('Benign criteria are met too, though not enough for a benign class. The 2015 rules leave you to weigh them, while the points system subtracts them.');
  if (bRule && anyP) notes.push('Pathogenic criteria are met too, though not enough for a pathogenic class. The 2015 rules leave you to weigh them, while the points system adds them.');
  if (pRule) return { cls: pRule.cls, rule: pRule, notes };
  if (bRule) return { cls: bRule.cls, rule: bRule, notes };
  return { cls: 'vus', rule: { name: 'Uncertain significance (i)', text: 'the criteria for the other classes are not met' }, notes };
}

/** the classification; opts.framework (acgs2024, clingen, acmg2015) decides which method gives "the" result */
export function classify(state, opts = {}) {
  const f = fw(opts.framework || state.framework);
  const met = metList(state, f.key);
  const notes = [];
  const WORD = { SA: 'stand-alone', VS: 'very strong', S: 'strong', M: 'moderate', P: 'supporting' };
  for (const m of met) if (m.given) notes.push(`${m.code} is marked ${WORD[m.given]}, but ${f.label} doesn’t use that strength for it, so it counts as ${WORD[m.strength]} here.`);
  let pts = pointsOf(met);
  // ClinGen: PM1 and PP3 together count at most 4 points (Pejaver et al. 2022), for the overlap between a hotspot and
  // the predictors. The ACGS 2024 guidelines (PP3 at supporting only) set no such cap.
  const pm1 = met.find((m) => m.code === 'PM1'), pp3 = met.find((m) => m.code === 'PP3');
  if (f.key === 'clingen' && pm1 && pp3 && (POINTS[pm1.strength] || 0) + (POINTS[pp3.strength] || 0) > 4) {
    const over = (POINTS[pm1.strength] || 0) + (POINTS[pp3.strength] || 0) - 4;
    pts -= over;
    notes.push(`ClinGen counts PM1 and PP3 together as at most 4 points (Pejaver et al. 2022), so ${over} ${over === 1 ? 'point' : 'points'} of PM1 ${over === 1 ? 'does' : 'do'} not count.`);
  }
  const hasBA1 = met.some((m) => m.code === 'BA1' && m.strength === 'SA');
  const byPoints = { cls: classOfPoints(pts, hasBA1), points: pts, posterior: hasBA1 ? 0 : posterior(pts) };
  // the 2020 rule that very strong and supporting make a variant likely pathogenic is ClinGen's, not the 2015 paper's
  const byRules = richards(met, Object.assign({ sviPVS1PM2: f.key !== 'acmg2015' }, opts));
  // ACGS 2024: at least two criteria for any class but uncertain, except BA1; and BS1_Strong alone may make a
  // variant likely benign (for a highly penetrant dominant disorder)
  if (f.minTwo && !hasBA1 && byPoints.cls !== 'vus') {
    const side = byPoints.cls === 'p' || byPoints.cls === 'lp' ? 'P' : 'B';
    const own = met.filter((m) => m.dir === side);
    const loneBS1 = side === 'B' && own.length === 1 && own[0].code === 'BS1' && own[0].strength === 'S';
    if (loneBS1) notes.push('Under the ACGS 2024 guidelines, BS1_Strong alone may make a variant likely benign, but only for a highly penetrant dominant disorder.');
    else if (own.length < 2) {
      notes.push(`Under the ACGS 2024 guidelines, a ${side === 'P' ? 'pathogenic' : 'benign'} class needs at least two criteria (except for BA1${side === 'B' ? ', and BS1_Strong for a highly penetrant dominant disorder' : ''}), so with only one the variant stays uncertain.`);
      byPoints.capped = byPoints.cls;
      byPoints.cls = 'vus';
    }
  }
  const main = f.combine === 'rules' ? byRules.cls : byPoints.cls;
  const band = main === 'vus' && opts.vusBands !== false ? bandOf(pts) : null;
  const pathogenicSide = met.filter((m) => m.dir === 'P');
  const benignSide = met.filter((m) => m.dir === 'B');
  return {
    framework: f.key,
    method: f.combine,
    cls: main,
    points: pts,
    band,
    posterior: byPoints.posterior,
    byPoints,
    byRules,
    agree: byPoints.cls === byRules.cls,
    met,
    notes: notes.concat(f.combine === 'rules' ? byRules.notes || [] : []),
    pathogenicPoints: pointsOf(pathogenicSide),
    benignPoints: pointsOf(benignSide),
    conflict: pathogenicSide.length > 0 && benignSide.length > 0
  };
}

/** the criteria as a laboratory writes them, in the usual order: PVS1, PM2_Supporting, PP3 (or PVS1_vstr, PM2_mod …) */
const ORDER = ['PVS1', 'PS1', 'PS2', 'PS3', 'PS4', 'PM1', 'PM2', 'PM3', 'PM4', 'PM5', 'PM6', 'PP1', 'PP2', 'PP3', 'PP4', 'PP5', 'BA1', 'BS1', 'BS2', 'BS3', 'BS4', 'BP1', 'BP2', 'BP3', 'BP4', 'BP5', 'BP6', 'BP7'];
export const defaultOf = baseDefault;
export function label(code, strength, framework) {
  return labelFor(code, strength, framework || 'clingen');
}
export function criteriaString(met, framework) {
  return met.slice().sort((a, b) => ORDER.indexOf(a.code) - ORDER.indexOf(b.code)).map((m) => label(m.code, m.strength, framework)).join(', ');
}
