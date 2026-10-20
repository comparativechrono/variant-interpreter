/* =====================================================================
   The three ways of applying the criteria that the site offers. They
   differ in how evidence is combined, the strength some criteria start
   at, the strengths they may be given, and how strengths are written.

   acgs2024  The UK's ACGS Best Practice Guidelines for Variant
             Classification in Rare Disease 2024 (Durkie et al., v1.2):
             points; PM2 stays moderate; PP3 and BP4 supporting only
             (REVEL ≥ 0.7 and < 0.4); at least two criteria for any
             class but uncertain, except BA1; strengths written _vstr,
             _str, _mod, _sup.
   clingen   ClinGen's guidance (its Sequence Variant Interpretation
             group, now the Variant Classification Guidance) and the
             expert panels' practice: points; PM2 at supporting; PP3
             and BP4 calibrated up to strong (Pejaver et al. 2022);
             written _Strong, _Moderate, _Supporting.
   acmg2015  The original rules of Richards et al. (2015): the combining
             rules of their Table 5, the criteria at their default
             strengths (they may be changed by judgement), PP5 and BP6
             still in use.
   ===================================================================== */

export const FRAMEWORKS = {
  acgs2024: {
    key: 'acgs2024',
    label: 'ACGS 2024 (UK)',
    long: 'ACGS Best Practice Guidelines for Variant Classification in Rare Disease 2024',
    combine: 'points',
    minTwo: true,
    naming: 'acgs',
    defaults: { PM2: 'M' },
    allowed: {
      PP3: ['P'], BP4: ['P'], PM2: ['M', 'P'], PP4: ['S', 'M', 'P'], PS4: ['S', 'M', 'P'], PM1: ['S', 'M', 'P'], PM4: ['M', 'P'], PM5: ['S', 'M', 'P'], PS1: ['S', 'M', 'P'], BS1: ['S', 'P'], BP7: ['S', 'P']
    },
    retired: ['PP5', 'BP6'],
    predictor: { REVEL: { pp3: { P: 0.7 }, bp4: { P: 0.4, strict: true } } },
    splice: { pp3: 0.2, pp3Strict: true, bp4: 0.1, bp4Strict: true }
  },
  clingen: {
    key: 'clingen',
    label: 'ClinGen (expert panels)',
    long: 'ClinGen’s variant classification guidance (formerly its Sequence Variant Interpretation group)',
    combine: 'points',
    minTwo: false,
    naming: 'clingen',
    defaults: { PM2: 'P' },
    allowed: {},
    retired: ['PP5', 'BP6'],
    predictor: null, // Pejaver et al. (2022): see thresholds.js
    splice: { pp3: 0.2, bp4: 0.1 }
  },
  acmg2015: {
    key: 'acmg2015',
    label: 'ACMG/AMP 2015 rules',
    long: 'Richards et al. (2015), the combining rules of Table 5',
    combine: 'rules',
    minTwo: false,
    naming: 'clingen',
    defaults: {},
    allowed: {},
    retired: [],
    predictor: null,
    splice: { pp3: 0.2, bp4: 0.1 }
  }
};
export const FRAMEWORK_LIST = ['acgs2024', 'clingen', 'acmg2015'];
export const fw = (key) => FRAMEWORKS[key] || FRAMEWORKS.acgs2024;

const BASE_DEFAULT = { PVS: 'VS', PS: 'S', PM: 'M', PP: 'P', BA: 'SA', BS: 'S', BP: 'P' };
export const baseDefault = (code) => BASE_DEFAULT[/^(PVS|PS|PM|PP|BA|BS|BP)/.exec(code)[1]];

/** the strength a criterion starts at in a framework */
export function defaultFor(code, key) {
  const f = fw(key);
  return (f.defaults && f.defaults[code]) || baseDefault(code);
}
/** the strengths a criterion may be given in a framework (its own list unless the framework limits it) */
export function strengthsFor(criterion, key) {
  const f = fw(key);
  return (f.allowed && f.allowed[criterion.code]) || criterion.strengths;
}
/** the strength a criterion counts at in a framework: the one given if the framework allows it, else the nearest
    weaker one it allows (PS4_VeryStrong under the ACGS 2024 guidelines counts as strong), else its weakest */
export function fitStrength(criterion, s, key) {
  const allowed = strengthsFor(criterion, key);
  if (!s || allowed.includes(s)) return s;
  const order = ['SA', 'VS', 'S', 'M', 'P'];
  for (let j = order.indexOf(s) + 1; j > 0 && j < order.length; j++) if (allowed.includes(order[j])) return order[j];
  return allowed[allowed.length - 1];
}

const CLINGEN_WORD = { VS: 'VeryStrong', S: 'Strong', M: 'Moderate', P: 'Supporting', SA: 'StandAlone' };
const ACGS_WORD = { VS: 'vstr', S: 'str', M: 'mod', P: 'sup', SA: '' };
/** how a criterion at a strength is written: PM2_Supporting (ClinGen), PM2_sup (ACGS) */
export function labelFor(code, strength, key) {
  const f = fw(key);
  if (!strength) return code;
  if (f.naming === 'acgs') return strength === 'SA' ? code : `${code}_${ACGS_WORD[strength]}`;
  return strength === baseDefault(code) ? code : `${code}_${CLINGEN_WORD[strength]}`;
}
