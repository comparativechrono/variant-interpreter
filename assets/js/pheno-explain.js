/* =====================================================================
   Explaining phenotype matches: what each of hpo.js's matches means in
   words, which of a disease's features a patient has not been recorded
   with (to look for, or to exclude), which excluded features count
   against a disease, and which diseases, genes and patients have a
   term. The ranking itself is hpo.js's (rankDiseases, rankGenes,
   similarity); this file only puts it into words. No page-drawing, so
   that the tests can run it in Node.
   ===================================================================== */
import * as H from './hpo.js';

const ROOT = 118; // HP:0000118 Phenotypic abnormality: shared by everything, so it explains nothing

/** the HPO's frequency of a feature in a disease, in its own words (bands, not a precise percentage) */
export function freqWord(f) {
  if (f == null) return 'frequency not given';
  if (f >= 1) return 'obligate (100%)';
  if (f >= 0.8) return 'very frequent (80–99%)';
  if (f >= 0.3) return 'frequent (30–79%)';
  if (f >= 0.05) return 'occasional (5–29%)';
  if (f > 0) return 'very rare (under 5%)';
  return 'excluded (0%)';
}

/** a term as a number, from 'HP:0001250', 1250 or a recorded phenotype {id} */
export const numOf = (t) => {
  if (t == null) return null;
  if (typeof t === 'number') return t;
  const x = H.term(typeof t === 'object' ? t.id : t);
  return x ? x.n : null;
};

/**
 * one of similarity()'s matches ({patient, target, via, ic, exact}) in words:
 *   exact    – the disease has the same term
 *   specific – the disease has a more specific form of it (the patient's term is the more general)
 *   general  – the disease has a more general term (the patient's is a more specific form of it)
 *   related  – they share an informative ancestor (named)
 *   none     – nothing informative in common
 */
export function explainMatch(m) {
  if (!m || m.target == null || !(m.ic > 0) || m.via === ROOT) return { kind: 'none', text: 'not explained by it', ic: 0 };
  if (m.target === m.patient) return { kind: 'exact', text: 'the same feature', ic: m.ic };
  if (H.ancestors(m.target).has(m.patient)) return { kind: 'specific', text: `as the more specific “${H.name(m.target)}”`, ic: m.ic };
  if (H.ancestors(m.patient).has(m.target)) return { kind: 'general', text: `as the more general “${H.name(m.target)}”`, ic: m.ic };
  return { kind: 'related', text: `related: both are “${H.name(m.via)}”`, ic: m.ic };
}

/** the matches as rows to show, the most informative first */
export function matchRows(matches) {
  return (matches || []).map((m) => Object.assign({ patient: m.patient, target: m.target, via: m.via }, explainMatch(m)))
    .sort((a, b) => b.ic - a.ic);
}

/** how many of the patient's features the disease explains (the same term, or a more specific or more general one) */
export function coverage(matches) {
  const rows = (matches || []).map(explainMatch);
  return { explained: rows.filter((r) => r.kind === 'exact' || r.kind === 'specific' || r.kind === 'general').length, related: rows.filter((r) => r.kind === 'related').length, total: rows.length };
}

/** true when two terms are on one line of the ontology (the same, or one a more specific form of the other) */
export function lineage(a, b) {
  return a === b || H.ancestors(a).has(b) || H.ancestors(b).has(a);
}

/** the patient's excluded features that the disease has (or a more specific form of): they count against it */
export function excludedHits(excluded, disease) {
  const out = [];
  for (const e of (excluded || []).map(numOf).filter((x) => x != null)) {
    for (const [q, f] of disease.pheno) {
      if (q === e || H.ancestors(q).has(e)) {
        out.push({ term: e, diseaseTerm: q, freq: f });
        break;
      }
    }
  }
  return out;
}

/**
 * the disease's features that the patient has not been recorded with (neither as observed, on the same line of the
 * ontology, nor as excluded): the things to look for, or to rule out. The commonest and most specific first.
 */
export function unseenFeatures(observed, excluded, disease, limit = 6) {
  const obs = (observed || []).map(numOf).filter((x) => x != null);
  const exc = (excluded || []).map(numOf).filter((x) => x != null);
  const out = [];
  for (const [q, f] of disease.pheno) {
    if (obs.some((p) => lineage(p, q))) continue;
    if (exc.some((e) => q === e || H.ancestors(q).has(e))) continue;
    if (f != null && f < 0.3) continue;
    out.push({ term: q, freq: f, ic: H.ic(q) });
  }
  return out.sort((a, b) => (b.freq == null ? 0.5 : b.freq) - (a.freq == null ? 0.5 : a.freq) || b.ic - a.ic).slice(0, limit);
}

/**
 * ranks with ties shown: equal scores share a rank ("=1"). list must be sorted best first; key(x) its score, or
 * several scores (an array: the first decides, the next breaks ties). Scores within eps of each other are equal.
 */
export function ranksWithTies(list, key, eps = 0.005) {
  const same = (a, b) => a.length === b.length && a.every((v, i) => Math.abs(v - b[i]) <= eps);
  const keys = list.map((x) => {
    const k = key(x);
    return Array.isArray(k) ? k : [k];
  });
  const rank = [];
  keys.forEach((k, i) => rank.push(i && same(k, keys[i - 1]) ? rank[i - 1] : i + 1));
  const count = new Map();
  for (const r of rank) count.set(r, (count.get(r) || 0) + 1);
  return rank.map((r) => ({ rank: r, tied: count.get(r) > 1, label: (count.get(r) > 1 ? '=' : '') + r }));
}

/** how many of a disease's features the patient has (on the same line of the ontology): { seen, total } */
export function diseaseCoverage(observed, disease) {
  const obs = (observed || []).map(numOf).filter((x) => x != null);
  let seen = 0;
  for (const q of disease.pheno.keys()) if (obs.some((p) => lineage(p, q))) seen++;
  return { seen, total: disease.pheno.size };
}

/** the diseases with a term, or a more specific form of it: [{ disease, freq (the highest), terms: [their matching terms] }] */
export function diseasesWithTerm(diseases, id) {
  const t = H.term(id);
  if (!t) return [];
  const desc = H.descendantsOf(t.id, 100000);
  const out = [];
  for (const d of diseases) {
    let best = undefined;
    const terms = [];
    for (const [q, f] of d.pheno) {
      if (!desc.has(q)) continue;
      terms.push(q);
      if (best === undefined || (f != null && (best == null || f > best))) best = f;
    }
    if (terms.length) out.push({ disease: d, freq: best === undefined ? null : best, terms, exact: terms.includes(t.n) });
  }
  return out.sort((a, b) => (b.freq == null ? -1 : b.freq) - (a.freq == null ? -1 : a.freq) || b.exact - a.exact || a.disease.name.localeCompare(b.disease.name));
}

/** the genes of those diseases: [{ gene, diseases: [names] }], the genes with most diseases first */
export function genesOf(rows) {
  const by = new Map();
  for (const r of rows) {
    for (const g of r.disease.genes) {
      const x = by.get(g) || { gene: g, diseases: [] };
      x.diseases.push(r.disease.name);
      by.set(g, x);
    }
  }
  return Array.from(by.values()).sort((a, b) => b.diseases.length - a.diseases.length || a.gene.localeCompare(b.gene));
}

/**
 * patients (records with phenotypes [{id, observed}]) who have the term (observed: it or a more specific form) or have
 * had it ruled out (excluded: it or a more general term – ruling out seizures rules out focal seizures).
 * → { observed: [{ patient, terms }], excluded: [{ patient, terms }] }
 */
export function patientsWithTerm(patients, id) {
  const t = H.term(id);
  const out = { observed: [], excluded: [] };
  if (!t) return out;
  const anc = H.ancestors(t.n);
  for (const p of patients || []) {
    const obs = [], exc = [];
    for (const x of p.phenotypes || []) {
      const n = numOf(x.id);
      if (n == null) continue;
      if (x.observed !== false && H.ancestors(n).has(t.n)) obs.push(x);
      if (x.observed === false && anc.has(n)) exc.push(x);
    }
    if (obs.length) out.observed.push({ patient: p, terms: obs });
    else if (exc.length) out.excluded.push({ patient: p, terms: exc });
  }
  return out;
}

/**
 * features that several patients share: each term recorded for any of them, and each more general term above those
 * that is still informative (information content at least minIC), with the patients who have it or a more specific
 * form of it; those of at least `min` patients, and of each group of patients only the most specific such term.
 * people: [{ id, terms: [numbers] }] → [{ term, ids: [patient ids], via: { id: [their terms under it] }, recorded }]
 */
export function sharedFeatures(people, min = 2, opts = {}) {
  const minIC = opts.minIC == null ? 2 : opts.minIC;
  const recorded = new Set();
  const cand = new Set();
  for (const p of people) {
    for (const t of p.terms) {
      recorded.add(t);
      cand.add(t);
      for (const a of H.ancestors(t)) if (a !== ROOT && H.ic(a) >= minIC) cand.add(a);
    }
  }
  const rows = [];
  for (const t of cand) {
    if (t === ROOT) continue;
    const via = {};
    for (const p of people) {
      const under = p.terms.filter((x) => H.ancestors(x).has(t));
      if (under.length) via[p.id] = under;
    }
    const ids = Object.keys(via);
    if (ids.length >= min) rows.push({ term: t, ids, via, recorded: recorded.has(t) });
  }
  // keep the most specific term of each group of patients
  const same = (a, b) => a.ids.length === b.ids.length && a.ids.every((id) => b.ids.includes(id));
  const keep = rows.filter((r) => !rows.some((o) => o !== r && same(o, r) && H.ancestors(o.term).has(r.term)));
  return keep.sort((a, b) => b.ids.length - a.ids.length || H.ic(b.term) - H.ic(a.term));
}

/** whether a term is shared with a set of terms (the same line of the ontology): for marking it in bold */
export function sharedWith(t, set) {
  const n = numOf(t);
  if (n == null) return false;
  for (const s of set) if (lineage(n, s)) return true;
  return false;
}
