/* =====================================================================
   The site's table of genes (data/genes/genes.json, made by
   build/make_genes.py): names and identifiers (HGNC, MANE), where each
   is on GRCh38, how intolerant it is of change (gnomAD), how sensitive
   to dosage (ClinGen, Collins et al. 2022), and its gene–disease
   curations (ClinGen gene validity, Gene2Phenotype). One file, so that
   a CNV's genes can be weighed without asking a service gene by gene.
   ===================================================================== */
import { fetchJSON } from './core.js';

let P = null;
let G = null;        // Map symbol → gene
let BY_ID = null;    // Map Ensembl id / HGNC id / previous symbol / alias → symbol(s)
let META = null;

export function loadGenes() {
  if (!P) {
    P = fetchJSON('data/genes/genes.json', {}, 60000).then((d) => {
      META = d.meta;
      const F = d.fields;
      const ix = Object.fromEntries(F.map((f, i) => [f, i]));
      G = new Map();
      BY_ID = new Map();
      const add = (k, sym) => {
        if (!k) return;
        const key = String(k).toUpperCase();
        if (!BY_ID.has(key)) BY_ID.set(key, []);
        const a = BY_ID.get(key);
        if (!a.includes(sym)) a.push(sym);
      };
      for (const row of d.genes) {
        const g = {};
        for (const f of F) g[f] = row[ix[f]];
        g.aliases = g.aliases || [];
        g.prev = g.prev || [];
        G.set(g.symbol, g);
        add(g.ensembl, g.symbol);
        add(g.hgnc, g.symbol);
        for (const a of g.prev) add(a, g.symbol);
        for (const a of g.aliases) add(a, g.symbol);
      }
      // curations kept in their own lists
      META.clingenValidity = d.validity || {};
      META.g2p = d.g2p || {};
      META.regions = d.regions || [];
      return G;
    }).catch((e) => {
      P = null;
      throw e;
    });
  }
  return P;
}
export const genesMeta = () => META;
export const loaded = () => !!G;

/** a gene by symbol, previous symbol, alias, Ensembl or HGNC id */
export function gene(q) {
  if (!G || !q) return null;
  const s = String(q).trim();
  if (G.has(s)) return G.get(s);
  const up = s.toUpperCase();
  for (const [sym, g] of G) if (sym.toUpperCase() === up) return g;
  const hits = BY_ID.get(up.replace(/\.\d+$/, ''));
  return hits && hits.length ? G.get(hits[0]) : null;
}
export const allGenes = () => (G ? Array.from(G.values()) : []);

/** genes for the search box: by symbol first, then previous symbols and aliases, then names */
export function searchGenes(q, limit = 8) {
  if (!G) return [];
  const s = String(q || '').trim();
  if (s.length < 2) return [];
  const up = s.toUpperCase();
  const out = [];
  const seen = new Set();
  const push = (g, via) => {
    if (!g || seen.has(g.symbol)) return;
    seen.add(g.symbol);
    out.push({ symbol: g.symbol, name: g.name, via });
  };
  if (G.has(up)) push(G.get(up));
  for (const [sym, g] of G) if (out.length < limit && sym.toUpperCase() === up) push(g);
  const ids = BY_ID.get(up);
  if (ids) for (const sym of ids) push(G.get(sym), up === sym.toUpperCase() ? null : `was ${s}`);
  if (out.length < limit) for (const [sym, g] of G) if (out.length < limit && sym.toUpperCase().startsWith(up)) push(g);
  if (out.length < limit && s.length >= 4) {
    const low = s.toLowerCase();
    for (const g of G.values()) if (out.length < limit && (g.name || '').toLowerCase().includes(low)) push(g);
  }
  return out.slice(0, limit);
}

/* ---------------- reading the numbers ---------------- */
/** ClinGen's dosage scores, as words */
export const DOSAGE = {
  3: { text: 'Sufficient evidence', short: '3', level: 'high' },
  2: { text: 'Some evidence', short: '2', level: 'mid' },
  1: { text: 'Little evidence', short: '1', level: 'low' },
  0: { text: 'No evidence', short: '0', level: 'none' },
  30: { text: 'Gene associated with autosomal recessive phenotype', short: '30', level: 'ar' },
  40: { text: 'Dosage sensitivity unlikely', short: '40', level: 'unlikely' }
};
export const dosageText = (s) => (s == null || s === '' ? 'Not curated' : (DOSAGE[s] || { text: String(s) }).text);

/** thresholds for calling a gene likely haploinsufficient or triplosensitive from predictions:
    pHaplo ≥ 0.86 and pTriplo ≥ 0.94 (Collins et al. 2022: odds of being dosage-sensitive as high as
    for ClinGen's curated genes); LOEUF < 0.6 (gnomAD v4's suggestion for constrained genes);
    pLI ≥ 0.9 */
export const THRESH = { pHaplo: 0.86, pTriplo: 0.94, loeuf: 0.6, pLI: 0.9, misZ: 3.09 };
export function hiPredicted(g) {
  if (!g) return [];
  const why = [];
  if (g.pHaplo != null && g.pHaplo >= THRESH.pHaplo) why.push(`pHaplo ${g.pHaplo.toFixed(2)} ≥ ${THRESH.pHaplo}`);
  if (g.loeuf != null && g.loeuf < THRESH.loeuf) why.push(`LOEUF ${g.loeuf.toFixed(2)} < ${THRESH.loeuf}`);
  if (g.pLI != null && g.pLI >= THRESH.pLI) why.push(`pLI ${g.pLI.toFixed(2)} ≥ ${THRESH.pLI}`);
  return why;
}
export function tsPredicted(g) {
  if (!g) return [];
  return g.pTriplo != null && g.pTriplo >= THRESH.pTriplo ? [`pTriplo ${g.pTriplo.toFixed(2)} ≥ ${THRESH.pTriplo}`] : [];
}
/** the strongest ClinGen gene–disease validity of a gene, and all its curations */
export function validity(g) {
  if (!g || !META) return [];
  return (META.clingenValidity[g.symbol] || []).map(([disease, mondo, moi, classification, date, report, gcep]) =>
    ({ disease, mondo, moi, classification, date, gcep, url: 'https://search.clinicalgenome.org/kb/gene-validity/' + report }));
}
export function g2p(g) {
  if (!g || !META) return [];
  return (META.g2p[g.symbol] || []).map(([disease, confidence, allelic, mechanism, panels, id, consequence, diseaseId]) =>
    ({ disease, confidence, allelic, mechanism, panels, id, consequence, diseaseId, url: 'https://www.ebi.ac.uk/gene2phenotype/lgd/' + id }));
}
const VORDER = ['Definitive', 'Strong', 'Moderate', 'Limited', 'Disputed', 'Refuted', 'No Known Disease Relationship'];
export function bestValidity(g) {
  const v = validity(g).slice().sort((a, b) => VORDER.indexOf(a.classification) - VORDER.indexOf(b.classification));
  return v[0] || null;
}
