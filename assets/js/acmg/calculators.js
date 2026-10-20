/* =====================================================================
   The calculators behind some criteria: ClinGen's points for de novo
   occurrences (PS2/PM6) and for variants in trans (PM3), the odds of
   pathogenicity from a functional assay's controls (PS3/BS3), and the
   highest allele frequency a pathogenic variant could credibly have
   (BS1, PM2; Whiffin et al. 2017).
   ===================================================================== */

/* ---------------- de novo (ClinGen SVI recommendation, version 1.1) ---------------- */
export const DENOVO_PHENO = [
  { key: 'specific', label: 'Highly specific for the gene', confirmed: 2, assumed: 1 },
  { key: 'consistent', label: 'Consistent with the gene but not highly specific', confirmed: 1, assumed: 0.5 },
  { key: 'heterogeneous', label: 'Consistent, but non-specific and very heterogeneous (e.g. developmental delay, autism)', confirmed: 0.5, assumed: 0.25 },
  { key: 'inconsistent', label: 'Not consistent with the gene’s known phenotype', confirmed: 0, assumed: 0 }
];
/** occurrences: [{confirmed: bool, pheno: key}] → { points, strength, anyConfirmed }. Occurrences with a
    non-specific, very heterogeneous phenotype add at most 1 point in all; with no parental testing, none */
export function denovoPoints(occurrences) {
  let pts = 0, het = 0, anyConfirmed = false;
  for (const o of occurrences || []) {
    const row = DENOVO_PHENO.find((r) => r.key === o.pheno);
    if (!row) continue;
    const v = o.confirmed ? row.confirmed : row.assumed;
    if (o.confirmed && v > 0) anyConfirmed = true;
    if (row.key === 'heterogeneous') het += v;
    else pts += v;
  }
  pts += Math.min(1, het);
  return { points: pts, strength: strengthOfPoints(pts), anyConfirmed };
}
/* 0.5 supporting, 1 moderate, 2 strong, 4 very strong (the same steps for PM3) */
export function strengthOfPoints(pts) {
  return pts >= 4 ? 'VS' : pts >= 2 ? 'S' : pts >= 1 ? 'M' : pts >= 0.5 ? 'P' : null;
}

/* ---------------- in trans (ClinGen SVI recommendation for PM3, version 1.0) ---------------- */
export const PM3_ROWS = [
  { key: 'P-trans', label: 'In trans with a pathogenic or likely pathogenic variant (phase confirmed)', points: 1 },
  { key: 'P-unknown', label: 'With a pathogenic variant, phase not known', points: 0.5 },
  { key: 'LP-unknown', label: 'With a likely pathogenic variant, phase not known', points: 0.25 },
  { key: 'hom', label: 'Homozygous in an affected person', points: 0.5, cap: 1 },
  { key: 'VUS-trans', label: 'In trans with a variant of uncertain significance (phase confirmed)', points: 0.25, cap: 0.5 },
  { key: 'VUS-unknown', label: 'With a variant of uncertain significance, phase not known', points: 0 }
];
/** observations: [{key}] → points (one row for each proband; homozygous occurrences at most 1 point in all, VUS ones 0.5) */
export function pm3Points(observations) {
  const by = {};
  for (const o of observations || []) {
    const row = PM3_ROWS.find((r) => r.key === o.key);
    if (row) by[row.key] = (by[row.key] || 0) + row.points;
  }
  let pts = 0;
  for (const row of PM3_ROWS) if (by[row.key]) pts += row.cap != null ? Math.min(row.cap, by[row.key]) : by[row.key];
  return { points: pts, strength: strengthOfPoints(pts) };
}

/* ---------------- functional evidence (Brnich et al. 2019) ---------------- */
/* OddsPath from the assay's validation: how many pathogenic and benign controls it classified correctly.
   With a prior of P1 = pathogenic controls / all controls, and P2 the proportion pathogenic among the variants
   with this readout, OddsPath = [P2 × (1 − P1)] / [(1 − P2) × P1]. When the assay classifies all its controls
   correctly, one misclassified control is assumed (so that the odds are not infinite), as Brnich et al. do. */
export function oddsPath({ pathControls, benignControls, readout }) {
  const P = +pathControls || 0, B = +benignControls || 0;
  if (P + B < 2 || !P || !B) return { odds: null, strength: null, message: 'An assay needs both pathogenic and benign controls before its results can be weighed.' };
  const P1 = P / (P + B);
  // the variants with the readout that the controls with it show: a damaging readout's are the pathogenic ones
  // classified correctly (all P) and one benign assumed misclassified; a normal readout's the reverse
  let P2;
  if (readout === 'abnormal') P2 = P / (P + 1);
  else P2 = 1 / (B + 1);
  const odds = (P2 * (1 - P1)) / ((1 - P2) * P1);
  let st = strengthOfOdds(odds);
  // without a formal OddsPath, Brnich et al. allow supporting with 10 controls or fewer, moderate with 11 or more
  const capByControls = P + B <= 10 ? 'P' : null;
  if (st && capByControls && st.strength !== 'P') st = Object.assign({}, st, { strength: 'P', capped: true });
  return { odds, P1, P2, strength: st, direction: odds >= 1 ? 'pathogenic' : 'benign', controls: P + B };
}
/* Brnich et al. (2019), Table 3: >350 PS3_VeryStrong, >18.7 PS3, >4.3 PS3_Moderate, >2.1 PS3_Supporting;
   <0.053 BS3, <0.23 BS3_Moderate, <0.48 BS3_Supporting; between, indeterminate */
export function strengthOfOdds(o) {
  if (o > 350) return { code: 'PS3', strength: 'VS', odds: o };
  if (o > 18.7) return { code: 'PS3', strength: 'S', odds: o };
  if (o > 4.3) return { code: 'PS3', strength: 'M', odds: o };
  if (o > 2.1) return { code: 'PS3', strength: 'P', odds: o };
  if (o < 0.053) return { code: 'BS3', strength: 'S', odds: o };
  if (o < 0.23) return { code: 'BS3', strength: 'M', odds: o };
  if (o < 0.48) return { code: 'BS3', strength: 'P', odds: o };
  return null;
}

/* ---------------- the highest credible allele frequency (Whiffin et al. 2017) ----------------
   The dominant formula reproduces Whiffin's worked examples (e.g. hypertrophic cardiomyopathy: prevalence 1/500,
   allelic 0.02, genetic 1, penetrance 0.5 → 4.0 × 10⁻⁵). For a recessive disorder the formula is the usual
   approximation of the CardioDB calculator's (www.cardiodb.org/allelefrequencyapp), which should be preferred. */
/**
 * maxCredibleAF({ inheritance: 'dominant'|'recessive', prevalence, allelic, genetic, penetrance })
 *   prevalence: of the disease (e.g. 1/500); allelic: the largest share of cases one variant causes (allelic
 *   heterogeneity); genetic: the share of cases this gene causes; penetrance: the chance a carrier is affected.
 * dominant:  AF = prevalence × genetic × allelic / (2 × penetrance)    (each carrier has one copy of two)
 * recessive: AF = √(prevalence × genetic / penetrance) × allelic      (for the allele among affected people's alleles)
 */
export function maxCredibleAF({ inheritance, prevalence, allelic, genetic, penetrance }) {
  const p = +prevalence, a = +allelic, g = +genetic, f = +penetrance;
  if (!(p > 0 && a > 0 && g > 0 && f > 0)) return null;
  if (inheritance === 'recessive') return Math.sqrt((p * g) / f) * a;
  return (p * g * a) / (2 * f);
}

/* Poisson sums in log space: the terms e^−λ λ^k / k! underflow to 0 once λ passes about 745, which a common
   variant in gnomAD's 1.6 million alleles easily does (a frequency of 0.05% is enough) */
const logAdd = (a, b) => (a === -Infinity ? b : b === -Infinity ? a : a > b ? a + Math.log1p(Math.exp(b - a)) : b + Math.log1p(Math.exp(a - b)));
/** ln P(X ≤ k) for X ~ Poisson(λ) */
export function logPoissonCdf(k, lambda) {
  if (!(lambda > 0)) return 0;
  if (k < 0) return -Infinity;
  const lnL = Math.log(lambda);
  let logTerm = -lambda, logCum = logTerm;
  for (let i = 1; i <= k; i++) {
    logTerm += lnL - Math.log(i);
    logCum = logAdd(logCum, logTerm);
  }
  return Math.min(0, logCum);
}

/** the largest allele count consistent (at 95% confidence) with a true frequency of af among an alleles (Poisson) */
export function maxTolerableAC(af, an, conf = 0.95) {
  const lambda = af * an;
  if (!(lambda > 0)) return 0;
  const lnL = Math.log(lambda), lnConf = Math.log(conf);
  let k = 0, logTerm = -lambda, logCum = logTerm;
  while (logCum < lnConf && k < 1e7) {
    k++;
    logTerm += lnL - Math.log(k);
    logCum = logAdd(logCum, logTerm);
  }
  return k;
}

/** the 95% filtering allele frequency (as gnomAD computes it): the highest true frequency at which the observed
    allele count would still be likely to be seen 5% of the time or more (Poisson, one-sided) */
export function faf95(ac, an) {
  if (!an || !ac) return 0;
  // for large counts the Poisson is close to normal: λ = ac − 1.645 √ac
  if (ac > 5000) return Math.max(0, ac - 1.6449 * Math.sqrt(ac)) / an;
  let lo = 0, hi = Math.max(1e-12, Math.min(1, (ac / an) * 10 + 1e-3));
  const pAtLeast = (af) => 1 - Math.exp(logPoissonCdf(ac - 1, af * an)); // P(X ≥ ac)
  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2;
    if (pAtLeast(mid) > 0.05) hi = mid;
    else lo = mid;
  }
  return lo;
}
