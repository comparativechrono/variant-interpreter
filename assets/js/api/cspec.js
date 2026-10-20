/* =====================================================================
   ClinGen's Criteria Specification Registry (CSpec): the rules that
   ClinGen's variant curation expert panels (VCEPs) have written for
   their genes – which strengths of each criterion apply, and when.
   https://cspec.clinicalgenome.org
   ===================================================================== */
import { fetchJSON, limiter } from '../core.js';
import { cacheGet, cachePut } from '../db.js';

const BASE = 'https://cspec.clinicalgenome.org/cspec/api';
const queue = limiter(2, 200);
const STR = { 'Very Strong': 'VS', Strong: 'S', Moderate: 'M', Supporting: 'P', 'Stand Alone': 'SA' };

/** every rule set: [{id, label, panel, genes, status, version, url}] */
export async function ruleSets() {
  const c = await cacheGet('cspec:list', 14);
  if (c) return c.value;
  const d = await queue(() => fetchJSON(`${BASE}/svis`, {}, 45000));
  const out = (d.data || []).map((x) => ({
    id: String(x['@id'] || '').split('/').pop(),
    panel: x.affiliation ? x.affiliation.label : '',
    genes: Array.from(new Set((x.ruleSets || []).flatMap((r) => (r.genes || []).map((g) => g.label)))),
    status: x.status,
    version: x.version,
    url: String(x.url || '').replace('cspec.genome.network', 'cspec.clinicalgenome.org')
  }));
  await cachePut('cspec:list', out);
  return out;
}

/** the released rule sets that cover a gene */
export async function forGene(symbol) {
  const all = await ruleSets();
  return all.filter((r) => r.genes.includes(symbol) && /released/i.test(r.status || ''));
}

/** one rule set, with each criterion's strengths: { label, version, url, criteria: { PM2: [{strength, applicable, text}] } } */
export async function ruleSet(id) {
  const key = 'cspec:' + id;
  const c = await cacheGet(key, 14);
  if (c) return c.value;
  const d0 = await queue(() => fetchJSON(`${BASE}/SequenceVariantInterpretation/id/${encodeURIComponent(id)}`, {}, 45000));
  const d = d0.data || d0;
  const criteria = {};
  for (const rs of d.ruleSets || []) {
    for (const cc of rs.criteriaCodes || []) {
      const code = cc.label;
      if (!code) continue;
      const list = (cc.evidenceStrengths || []).map((s) => ({
        strength: STR[s.label] || s.label,
        applicable: !/not applicable/i.test(s.applicability || ''),
        text: (s.description || '').replace(/\\</g, '<').replace(/\*\s+/g, '• ').replace(/_([^_]+)_/g, '$1').trim()
      }));
      criteria[code] = { description: cc.description || '', strengths: list };
    }
  }
  const out = { id, label: d.label || '', panel: d.affiliation ? d.affiliation.label : '', version: d.version, updated: d.lastUpdated, url: `https://cspec.clinicalgenome.org/cspec/ui/svi/doc/${id}`, criteria };
  await cachePut(key, out);
  return out;
}
