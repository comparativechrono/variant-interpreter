/* =====================================================================
   ClinVar, through NCBI's E-utilities: the records at a variant's
   position (the variant itself, and others at the same codon for PS1
   and PM5), with their classifications and review status.
   NCBI allows three requests a second without a key.
   ===================================================================== */
import { fetchJSON, limiter } from '../core.js';
import { CFG } from '../settings.js';
import { cacheGet, cachePut } from '../db.js';

const BASE = () => (CFG.services && CFG.services.eutils) || 'https://eutils.ncbi.nlm.nih.gov/entrez/eutils';
const queue = limiter(1, 380);

export const STARS = {
  'practice guideline': 4,
  'reviewed by expert panel': 3,
  'criteria provided, multiple submitters, no conflicts': 2,
  'criteria provided, conflicting classifications': 1,
  'criteria provided, conflicting interpretations': 1,
  'criteria provided, single submitter': 1,
  'no assertion criteria provided': 0,
  'no classification provided': 0,
  'no assertion provided': 0,
  'no classifications from unflagged records': 0
};
export const stars = (status) => (STARS[String(status || '').toLowerCase()] ?? 0);

/** the class key (p, lp, vus, lb, b) of a ClinVar classification, or null for conflicting and others */
export function classKey(desc) {
  const d = String(desc || '').toLowerCase();
  if (/conflicting/.test(d)) return 'conflict';
  if (/^pathogenic\/likely pathogenic/.test(d)) return 'plp';
  if (/^pathogenic/.test(d)) return 'p';
  if (/^likely pathogenic/.test(d)) return 'lp';
  if (/uncertain/.test(d)) return 'vus';
  if (/^benign\/likely benign/.test(d)) return 'blb';
  if (/^likely benign/.test(d)) return 'lb';
  if (/^benign/.test(d)) return 'b';
  return 'other';
}

async function esearch(term) {
  const d = await queue(() => fetchJSON(`${BASE()}/esearch.fcgi?db=clinvar&retmode=json&retmax=200&term=${encodeURIComponent(term)}`, { retries: 2 }, 30000));
  return (d.esearchresult && d.esearchresult.idlist) || [];
}
async function esummary(ids) {
  const out = [];
  for (let i = 0; i < ids.length; i += 100) {
    const chunk = ids.slice(i, i + 100);
    const d = await queue(() => fetchJSON(`${BASE()}/esummary.fcgi?db=clinvar&retmode=json&id=${chunk.join(',')}`, { retries: 2 }, 30000));
    const r = d.result || {};
    for (const u of r.uids || []) out.push(record(r[u]));
  }
  return out;
}

function record(r) {
  const gc = r.germline_classification || {};
  const vs = (r.variation_set || [])[0] || {};
  const locs = vs.variation_loc || [];
  const loc = (asm) => locs.find((l) => l.assembly_name === asm);
  const title = r.title || vs.variation_name || '';
  const hm = /^([^(:]+)(?:\(([^)]+)\))?:(c\.[^\s]+)(?:\s+\((p\.[^)]+)\))?/.exec(title);
  return {
    uid: r.uid,
    accession: r.accession,
    url: `https://www.ncbi.nlm.nih.gov/clinvar/variation/${r.uid}/`,
    title,
    transcript: hm ? hm[1] : null,
    gene: hm ? hm[2] : ((r.genes || [])[0] || {}).symbol || null,
    hgvsc: hm ? hm[3] : null,
    hgvsp: hm ? hm[4] : null,
    type: r.obj_type,
    spdi: vs.canonical_spdi || null,
    loc38: loc('GRCh38') ? { chrom: loc('GRCh38').chr, start: +loc('GRCh38').start, stop: +loc('GRCh38').stop } : null,
    loc37: loc('GRCh37') ? { chrom: loc('GRCh37').chr, start: +loc('GRCh37').start, stop: +loc('GRCh37').stop } : null,
    classification: gc.description || 'not provided',
    cls: classKey(gc.description),
    review: gc.review_status || '',
    stars: stars(gc.review_status),
    evaluated: gc.last_evaluated && !/^1\/01\/01/.test(gc.last_evaluated) ? gc.last_evaluated.slice(0, 10).replace(/\//g, '-') : null,
    conditions: (gc.trait_set || []).map((t) => t.trait_name).filter((n) => n && n !== 'not provided' && n !== 'not specified'),
    submissions: ((r.supporting_submissions || {}).scv || []).length,
    consequences: r.molecular_consequence_list || [],
    proteinChange: r.protein_change || ''
  };
}

/** the ClinVar records that overlap positions start..end of a chromosome */
export async function atPositions(chrom, start, end, asm = 'GRCh38') {
  const key = `clinvar:${asm}:${chrom}:${start}-${end}`;
  const c = await cacheGet(key, 14);
  if (c) return c.value;
  const field = asm === 'GRCh37' ? 'chrpos37' : 'chrpos38';
  const term = start === end ? `${chrom}[chr] AND ${start}[${field}]` : `${chrom}[chr] AND ${start}:${end}[${field}]`;
  const ids = await esearch(term);
  const recs = ids.length ? await esummary(ids) : [];
  await cachePut(key, recs);
  return recs;
}

/** this variant's own record, found among those at its position: by SPDI for substitutions, otherwise by its
    HGVS on the same transcript. ClinVar's SPDI is on GRCh38: for a GRCh37 variant, its GRCh37 position is
    compared instead, with the alleles (forward strand on both builds) */
export function findSelf(recs, v, hgvsc, asm = 'GRCh38') {
  const spdiPos = v.pos - 1;
  const snv = (v.ref || '').length === 1 && (v.alt || '').length === 1;
  for (const r of recs) {
    if (!r.spdi) continue;
    const m = /^NC_[\d.]+:(\d+):([ACGTN]*):([ACGTN]*)$/.exec(r.spdi);
    if (!m) continue;
    if (asm !== 'GRCh37') {
      if (+m[1] === spdiPos && m[2] === v.ref && m[3] === v.alt) return r;
      continue;
    }
    const l = r.loc37;
    if (!l) continue;
    if (snv) {
      if (l.start === v.pos && m[2] === v.ref && m[3] === v.alt) return r;
    } else if (Math.abs(l.start - v.pos) <= Math.max(v.ref.length, v.alt.length) + 1 && m[2].length - m[3].length === v.ref.length - v.alt.length) return r;
  }
  if (hgvsc) {
    const [tx, c] = hgvsc.split(':');
    const base = tx.replace(/\.\d+$/, '');
    for (const r of recs) if (r.transcript && r.transcript.replace(/\.\d+$/, '') === base && r.hgvsc === c) return r;
  }
  return null;
}

/** copy-number records (losses and gains of 50 kb or more) overlapping a region: the 200 that ClinVar lists first */
export async function cnvsInRegion(chrom, start, end, asm = 'GRCh38') {
  const key = `clinvar-cnv:${asm}:${chrom}:${start}-${end}`;
  const c = await cacheGet(key, 14);
  if (c) return c.value;
  const field = asm === 'GRCh37' ? 'chrpos37' : 'chrpos38';
  const ids = await esearch(`${chrom}[chr] AND ${start}:${end}[${field}] AND ("copy number loss"[Type of variation] OR "copy number gain"[Type of variation])`);
  const recs = (ids.length ? await esummary(ids.slice(0, 200)) : []).filter((r) => {
    const l = asm === 'GRCh37' ? r.loc37 : r.loc38;
    return l && l.stop - l.start + 1 >= 50000;
  });
  await cachePut(key, recs);
  return recs;
}
