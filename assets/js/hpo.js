/* =====================================================================
   The Human Phenotype Ontology in the browser: searching terms, their
   parents and children, and comparing a patient's phenotype with the
   phenotypes of diseases (and so of genes).

   data/hpo/terms.json and data/hpo/diseases.json are made from an HPO
   release by build/make_hpo.py; their meta.version is the release.

   Similarity: each term has an information content (IC), -log of the
   fraction of annotated diseases that have it or a more specific term.
   Two terms are as similar as their most informative common ancestor
   (Resnik). A patient's terms are compared with a disease's by the
   average of each patient term's best match (as in the Phenomizer),
   which favours diseases that explain the patient's features.
   ===================================================================== */
import { fetchJSON } from './core.js';

const pad = (n) => 'HP:' + String(n).padStart(7, '0');
const numOf = (id) => (typeof id === 'number' ? id : parseInt(String(id).replace(/^HP:/, ''), 10));

let termsP = null;
let diseasesP = null;
let T = null; // Map num → {id, name, syn, parents, def, children}
let ALT = null;
let META = null;

export function loadTerms() {
  if (!termsP) {
    termsP = fetchJSON('data/hpo/terms.json', {}, 60000).then((d) => {
      T = new Map();
      for (const [n, name, syn, parents, def] of d.terms) T.set(n, { n, id: pad(n), name, syn: syn || [], parents: parents || [], def: def || '', children: [] });
      for (const t of T.values()) for (const p of t.parents) if (T.has(p)) T.get(p).children.push(t.n);
      ALT = new Map(Object.entries(d.alt || {}).map(([a, b]) => [+a, b]));
      META = d.meta;
      return T;
    }).catch((e) => {
      termsP = null;
      throw e;
    });
  }
  return termsP;
}
export const hpoVersion = () => (META ? META.version : '');
export const ready = () => !!T;

/** the current term for an id (following alternative ids); null if unknown */
export function term(id) {
  if (!T) return null;
  let n = numOf(id);
  if (!T.has(n) && ALT.has(n)) n = ALT.get(n);
  return T.get(n) || null;
}
export const name = (id) => (term(id) || {}).name || String(id);

const ROOTS = { 118: 'Phenotypic abnormality', 5: 'Mode of inheritance', 12823: 'Clinical modifier', 40279: 'Frequency', 31797: 'Clinical course', 32443: 'Past medical history', 32223: 'Blood group' };
const ancCache = new Map();
/** every ancestor of a term, itself included (as numbers) */
export function ancestors(id) {
  const n = typeof id === 'number' ? id : (term(id) || {}).n;
  if (n == null) return new Set();
  if (ancCache.has(n)) return ancCache.get(n);
  const out = new Set([n]);
  const t = T.get(n);
  if (t) for (const p of t.parents) for (const a of ancestors(p)) out.add(a);
  ancCache.set(n, out);
  return out;
}
/** the top-level branch under Phenotypic abnormality (e.g. Abnormality of the nervous system) */
export function branch(id) {
  const t = term(id);
  if (!t) return null;
  const anc = ancestors(t.n);
  if (!anc.has(118)) {
    for (const r of Object.keys(ROOTS)) if (anc.has(+r)) return { id: pad(+r), name: ROOTS[r] };
    return null;
  }
  for (const c of T.get(118).children) if (anc.has(c)) return { id: pad(c), name: T.get(c).name };
  return null;
}
export const isUnder = (id, rootId) => ancestors(id).has(numOf(rootId));
export function descendantsOf(id, limit = 5000) {
  const t = term(id);
  const out = new Set();
  if (!t) return out;
  const stack = [t.n];
  while (stack.length && out.size < limit) {
    const n = stack.pop();
    if (out.has(n)) continue;
    out.add(n);
    for (const c of T.get(n).children) stack.push(c);
  }
  return out;
}

/* ---------------- search ---------------- */
const norm = (s) => String(s || '').toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
let index = null;
function buildIndex() {
  index = [];
  for (const t of T.values()) {
    index.push({ t, text: norm(t.name), main: true });
    for (const s of t.syn) index.push({ t, text: norm(s), main: false, syn: s });
  }
}
/** terms matching what was typed: an id (HP:0001250 or 1250) or words, best first */
export function search(q, opts = {}) {
  if (!T) return [];
  const limit = opts.limit || 20;
  const only118 = opts.phenotypicOnly !== false;
  const raw = String(q || '').trim();
  const idm = /^(?:hp[:_ ]?)?(\d{3,7})$/i.exec(raw);
  if (idm) {
    const t = term(+idm[1]);
    return t ? [{ term: t, via: null, score: 1000 }] : [];
  }
  const nq = norm(raw);
  if (nq.length < 2) return [];
  if (!index) buildIndex();
  const words = nq.split(' ');
  const best = new Map();
  for (const e of index) {
    if (!words.every((w) => e.text.includes(w))) continue;
    if (only118 && !ancestors(e.t.n).has(118)) continue;
    let s = 0;
    if (e.text === nq) s += 100;
    else if (e.text.startsWith(nq)) s += 60;
    else if (words.every((w) => (' ' + e.text).includes(' ' + w))) s += 35;
    else s += 10;
    if (e.main) s += 8;
    s -= e.text.length / 12;
    const prev = best.get(e.t.n);
    if (!prev || prev.score < s) best.set(e.t.n, { term: e.t, via: e.main ? null : e.syn, score: s });
  }
  return Array.from(best.values()).sort((a, b) => b.score - a.score).slice(0, limit);
}

/* ---------------- diseases and similarity ---------------- */
let D = null; // [{id, name, genes, pheno: Map(num → freq|null), inh:[], onset:[]}]
let ICmap = null;
let IC_UNSEEN = 10;
let DMETA = null;
export function loadDiseases() {
  if (!diseasesP) {
    diseasesP = Promise.all([loadTerms(), fetchJSON('data/hpo/diseases.json', {}, 60000)]).then(([, d]) => {
      ICmap = new Map(Object.entries(d.ic).map(([k, v]) => [+k, v]));
      IC_UNSEEN = d.ic_unseen || 10;
      DMETA = d.meta;
      D = d.diseases.map(([id, name, genes, flat, inh, onset]) => {
        const pheno = new Map();
        for (let i = 0; i < flat.length; i += 2) pheno.set(flat[i], flat[i + 1] < 0 ? null : flat[i + 1] / 100);
        return { id, name, genes: genes || [], pheno, inh: inh || [], onset: onset || [] };
      });
      return D;
    }).catch((e) => {
      diseasesP = null;
      throw e;
    });
  }
  return diseasesP;
}
export const diseaseVersion = () => (DMETA ? DMETA.version : '');
export const ic = (n) => (ICmap && ICmap.has(n) ? ICmap.get(n) : IC_UNSEEN);

/** the most informative common ancestor of two terms, and its IC */
function mica(a, b) {
  const A = ancestors(a);
  let best = 0, who = 118;
  for (const x of ancestors(b)) {
    if (A.has(x)) {
      const v = ic(x);
      if (v > best) {
        best = v;
        who = x;
      }
    }
  }
  return { ic: best, term: who };
}

/** how well a patient's observed terms are explained by a set of terms (a disease's):
    the average, over the patient's terms, of the IC of their best match */
export function similarity(patientTerms, targetTerms, opts = {}) {
  const P = patientTerms.map((t) => (typeof t === 'number' ? t : (term(t) || {}).n)).filter((n) => n != null);
  const Q = Array.from(targetTerms);
  if (!P.length || !Q.length) return { score: 0, matches: [] };
  const matches = P.map((p) => {
    let best = { ic: 0, term: 118, q: null };
    for (const q of Q) {
      const m = mica(p, q);
      if (m.ic > best.ic) best = { ic: m.ic, term: m.term, q };
    }
    return { patient: p, target: best.q, via: best.term, ic: best.ic, exact: best.q === p || (best.q != null && ancestors(best.q).has(p)) };
  });
  let score = matches.reduce((s, m) => s + m.ic, 0) / P.length;
  if (opts.symmetric) {
    const back = Q.map((q) => {
      let b = 0;
      for (const p of P) b = Math.max(b, mica(p, q).ic);
      return b;
    });
    score = (score + back.reduce((s, x) => s + x, 0) / Q.length) / 2;
  }
  return { score, matches };
}

/** diseases ranked by how well they explain the patient's terms (excluded terms count against a disease
    that has them commonly). Returns [{disease, score, matches}] */
export async function rankDiseases(observed, excluded = [], opts = {}) {
  await loadDiseases();
  const obs = observed.map((t) => (term(t) || {}).n).filter((n) => n != null);
  const exc = excluded.map((t) => (term(t) || {}).n).filter((n) => n != null);
  if (!obs.length) return [];
  const limitTo = opts.genes ? new Set(opts.genes) : null;
  const out = [];
  for (const d of D) {
    if (limitTo && !d.genes.some((g) => limitTo.has(g))) continue;
    if (opts.withGenesOnly && !d.genes.length) continue;
    const sim = similarity(obs, d.pheno.keys());
    let penalty = 0;
    for (const e of exc) {
      for (const [q, f] of d.pheno) {
        if (q === e || ancestors(q).has(e)) {
          penalty += (f == null ? 0.5 : f) * ic(e) * 0.5;
          break;
        }
      }
    }
    out.push({ disease: d, score: sim.score - penalty / Math.max(1, obs.length), raw: sim.score, matches: sim.matches });
  }
  out.sort((a, b) => b.score - a.score);
  // a rough calibration against random sets of terms of the same size, so that scores can be read
  return out.slice(0, opts.limit || 50);
}

/** genes ranked by their best disease */
export async function rankGenes(observed, excluded = [], opts = {}) {
  const ds = await rankDiseases(observed, excluded, { limit: 100000, withGenesOnly: true, genes: opts.genes });
  const best = new Map();
  for (const r of ds) {
    for (const g of r.disease.genes) {
      if (opts.genes && !opts.genes.includes(g)) continue;
      const b = best.get(g);
      if (!b || b.score < r.score) best.set(g, { gene: g, score: r.score, disease: r.disease, matches: r.matches });
    }
  }
  return Array.from(best.values()).sort((a, b) => b.score - a.score).slice(0, opts.limit || 50);
}

export async function diseasesOfGene(symbol) {
  await loadDiseases();
  return D.filter((d) => d.genes.includes(symbol));
}
export async function disease(id) {
  await loadDiseases();
  return D.find((d) => d.id === id) || null;
}
/** all phenotype terms of a gene's diseases */
export async function termsOfGene(symbol) {
  const ds = await diseasesOfGene(symbol);
  const out = new Map();
  for (const d of ds) for (const [t, f] of d.pheno) if (!out.has(t) || (f || 0) > (out.get(t) || 0)) out.set(t, f);
  return out;
}

/** how unusual a score is: the patient's terms against the same number of random terms from the diseases */
export async function scoreContext(observed, score, trials = 200) {
  await loadDiseases();
  const n = observed.length;
  if (!n) return null;
  const pool = Array.from(ICmap.keys()).filter((k) => T.has(k) && ancestors(k).has(118));
  const sims = [];
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < trials; i++) {
    const rand = [];
    for (let j = 0; j < n; j++) rand.push(pool[Math.floor(rnd() * pool.length)]);
    const d = D[Math.floor(rnd() * D.length)];
    sims.push(similarity(rand, d.pheno.keys()).score);
  }
  sims.sort((a, b) => a - b);
  const above = sims.filter((s) => s >= score).length;
  return { p: (above + 1) / (trials + 1), median: sims[Math.floor(trials / 2)] };
}

export { pad as hpId, numOf as hpNum };
