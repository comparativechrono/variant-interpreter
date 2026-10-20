/* =====================================================================
   Thresholds for computational evidence (PP3 and BP4).

   Missense predictors: Pejaver et al. (2022) Am J Hum Genet 109:2163,
   Table 2 – the score at or beyond which each predictor reaches each
   strength (ClinGen recommends choosing one predictor in advance and
   using it for every variant). AlphaMissense: Bergquist et al. (2025),
   whose ±3-point bins are folded into moderate here.
   ACGS 2024: PP3 and BP4 at supporting only, REVEL ≥ 0.7 and < 0.4.
   Splicing: SpliceAI ≥ 0.2 (PP3) and ≤ 0.1 (BP4, BP7), at supporting
   strength (Walker et al. 2023); ACGS 2024 writes > 0.2 and < 0.1.
   ===================================================================== */
import { fw } from './frameworks.js';

/* For PP3 the score must be ≥ the threshold; for BP4 ≤ it. A missing strength is not reached by the tool. */
export const PREDICTORS = {
  REVEL: {
    label: 'REVEL', key: 'revel', range: [0, 1],
    pp3: { P: 0.644, M: 0.773, S: 0.932 },
    bp4: { P: 0.290, M: 0.183, S: 0.016 },
    about: 'A meta-predictor of missense pathogenicity that combines 13 tools (Ioannidis et al. 2016). ClinGen’s calibration (Pejaver et al. 2022) takes it up to PP3_Strong and BP4_Strong, and recommends no more than strong either way. The ACGS 2024 guidelines use it at supporting strength, with REVEL ≥ 0.7 for PP3 and < 0.4 for BP4.'
  },
  BayesDel: {
    label: 'BayesDel (no AF)', key: 'bayesdel', range: [-1.3, 0.8],
    pp3: { P: 0.13, M: 0.27, S: 0.50 },
    bp4: { P: -0.18, M: -0.36 },
    about: 'A Bayesian meta-predictor (Feng 2017). The site uses the version without allele frequency, so that frequency isn’t counted twice alongside PM2 or BS1.'
  },
  AlphaMissense: {
    label: 'AlphaMissense', key: 'alphamissense', range: [0, 1],
    pp3: { P: 0.792, M: 0.906, S: 0.990 },
    bp4: { P: 0.169, M: 0.099 },
    about: 'A deep-learning predictor from Google DeepMind (Cheng et al. 2023), calibrated by Bergquist et al. (2025). Its developers’ own cut-off (0.564) doesn’t even reach supporting strength.'
  },
  CADD: {
    label: 'CADD (phred)', key: 'cadd', range: [0, 50],
    pp3: { P: 25.3, M: 28.1 },
    bp4: { P: 22.7, M: 17.3, S: 0.15 },
    about: 'Combined Annotation Dependent Depletion (Rentzsch et al. 2019) gives a score for any variant, so it isn’t limited to missense changes. The common cut-off of 20 doesn’t reach supporting strength.'
  },
  PrimateAI: {
    label: 'PrimateAI', key: 'primateai', range: [0, 1],
    pp3: { P: 0.790, M: 0.867 },
    bp4: { P: 0.483, M: 0.362 },
    about: 'A deep-learning predictor trained on variants common in other primates (Sundaram et al. 2018).'
  },
  phyloP: {
    label: 'phyloP (100 vertebrates)', key: 'phylop', range: [-20, 12],
    pp3: { P: 7.367, M: 9.741 },
    bp4: { P: 1.879, M: 0.021 },
    about: 'Conservation of the nucleotide across 100 vertebrates, which shows how much more slowly it has changed than expected.'
  }
};

export const SPLICEAI = { pp3: 0.2, bp4: 0.1, bp7: 0.1 };
export const PHYLOP_BP7 = 0.1; // "not highly conserved", as the ACGS 2024 guidelines and several expert panels use for BP7

/** the PP3 or BP4 strength a score reaches with a predictor, in a framework: { code, strength, threshold } or null */
export function predictorStrength(name, score, framework) {
  const p = PREDICTORS[name];
  if (!p || score == null || isNaN(score)) return null;
  const f = fw(framework);
  if (f.key === 'acgs2024') {
    if (name === 'REVEL') {
      if (score >= 0.7) return { code: 'PP3', strength: 'P', threshold: '≥ 0.7' };
      if (score < 0.4) return { code: 'BP4', strength: 'P', threshold: '< 0.4' };
      return null;
    }
    // other tools: ClinGen's thresholds for supporting strength, the most the ACGS allows
    if (p.pp3.P != null && score >= p.pp3.P) return { code: 'PP3', strength: 'P', threshold: '≥ ' + p.pp3.P };
    if (p.bp4.P != null && score <= p.bp4.P) return { code: 'BP4', strength: 'P', threshold: '≤ ' + p.bp4.P };
    return null;
  }
  for (const s of ['S', 'M', 'P']) if (p.pp3[s] != null && score >= p.pp3[s]) return { code: 'PP3', strength: s, threshold: '≥ ' + p.pp3[s] };
  for (const s of ['S', 'M', 'P']) if (p.bp4[s] != null && score <= p.bp4[s]) return { code: 'BP4', strength: s, threshold: '≤ ' + p.bp4[s] };
  return null;
}

/** the thresholds to draw for a predictor in a framework: [{at, code, strength}] */
export function thresholdMarks(name, framework) {
  const p = PREDICTORS[name];
  if (!p) return [];
  if (fw(framework).key === 'acgs2024' && name === 'REVEL') return [{ at: 0.4, code: 'BP4', strength: 'P' }, { at: 0.7, code: 'PP3', strength: 'P' }];
  const out = [];
  const cap = fw(framework).key === 'acgs2024';
  for (const s of ['P', 'M', 'S']) if (p.pp3[s] != null && (!cap || s === 'P')) out.push({ at: p.pp3[s], code: 'PP3', strength: s });
  for (const s of ['P', 'M', 'S']) if (p.bp4[s] != null && (!cap || s === 'P')) out.push({ at: p.bp4[s], code: 'BP4', strength: s });
  return out;
}
