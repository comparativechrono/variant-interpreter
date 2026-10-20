/* =====================================================================
   Europe PMC (EMBL-EBI): papers that mention a variant, found by the
   ways papers write it (c. change, p. change in three letters or one,
   rsID) beside the gene's symbol. Only those words are sent.
   https://europepmc.org/RestfulWebService
   ===================================================================== */
import { fetchJSON, limiter, AA3 } from '../core.js';
import { CFG } from '../settings.js';
import { cacheGet, cachePut } from '../db.js';

const BASE = () => (CFG.services && CFG.services.europepmc) || 'https://www.ebi.ac.uk/europepmc/webservices/rest';
const queue = limiter(2, 200);

/** the query for a variant: "GENE" AND ("c.818G>A" OR "Arg273His" OR "R273H" OR "rs28934576") */
export function variantQuery({ gene, hgvsc, hgvsp, rsid }) {
  const names = [];
  const c = String(hgvsc || '').split(':').pop();
  if (c) names.push(c);
  const p = String(hgvsp || '').split(':').pop().replace(/^p\.\(?/, '').replace(/\)$/, '');
  if (p) {
    names.push(p);
    const m = /^([A-Z][a-z]{2})(\d+)([A-Z][a-z]{2}|=)$/.exec(p);
    if (m && AA3[m[1]] && (AA3[m[3]] || m[3] === '=')) names.push(`${AA3[m[1]]}${m[2]}${m[3] === '=' ? '=' : AA3[m[3]]}`);
  }
  if (rsid) names.push(rsid);
  if (!names.length) return null;
  const or = names.map((x) => `"${x.replace(/"/g, '')}"`).join(' OR ');
  return gene ? `"${gene}" AND (${or})` : `(${or})`;
}

/** papers for a query: { count, papers: [{ pmid, pmcid, doi, title, authors, journal, year, cited, open }] } */
export async function search(query, opts = {}) {
  const sort = opts.sort === 'recent' ? 'P_PDATE_D desc' : 'CITED desc';
  const key = `epmc:${sort}:${query}`;
  const c = await cacheGet(key, 14);
  if (c) return c.value;
  const url = `${BASE()}/search?query=${encodeURIComponent(query)}&format=json&resultType=lite&pageSize=${opts.size || 10}&sort=${encodeURIComponent(sort)}`;
  const d = await queue(() => fetchJSON(url, { retries: 1 }, 30000));
  const out = {
    count: d.hitCount || 0,
    papers: ((d.resultList && d.resultList.result) || []).map((r) => ({
      pmid: r.pmid || null, pmcid: r.pmcid || null, doi: r.doi || null,
      title: String(r.title || '').replace(/<[^>]+>/g, ''), authors: r.authorString || '', journal: r.journalTitle || r.bookOrReportDetails?.publisher || '',
      year: r.pubYear || '', cited: r.citedByCount || 0, open: r.isOpenAccess === 'Y'
    }))
  };
  await cachePut(key, out);
  return out;
}
