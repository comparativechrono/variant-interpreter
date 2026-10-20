/* =====================================================================
   Ensembl's REST service: the Variant Effect Predictor (VEP) and
   genes in a region. Only positions and alleles are sent.
   https://rest.ensembl.org (GRCh38) and https://grch37.rest.ensembl.org
   ===================================================================== */
import { fetchJSON, limiter } from '../core.js';
import { CFG } from '../settings.js';
import { cacheGet, cachePut } from '../db.js';

const queue = limiter(3, 70); // Ensembl allows 15 requests a second; keep well under it
export const server = (asm) => ((CFG.services && CFG.services.ensembl && CFG.services.ensembl[asm]) || (asm === 'GRCh37' ? 'https://grch37.rest.ensembl.org' : 'https://rest.ensembl.org')).replace(/\/$/, '');

/* what VEP is asked for. The plugins (CADD, REVEL, SpliceAI, AlphaMissense, dbNSFP) run on Ensembl's
   transcripts; mane_select gives the matching RefSeq transcript */
const FLAGS38 = {
  hgvs: 1, mane: 1, canonical: 1, numbers: 1, protein: 1, uniprot: 1, variant_class: 1, vcf_string: 1, ccds: 1,
  af_gnomade: 1, af_gnomadg: 1, pubmed: 1, CADD: 1, REVEL: 1, SpliceAI: 2, AlphaMissense: 1, Conservation: 1, Blosum62: 1, NMD: 1, LoF: 1,
  dbNSFP: 'BayesDel_noAF_score,PrimateAI_score,MetaRNN_score,phyloP100way_vertebrate,GERP++_RS'
};
const FLAGS37 = { hgvs: 1, canonical: 1, numbers: 1, protein: 1, uniprot: 1, variant_class: 1, vcf_string: 1, ccds: 1, af_gnomade: 1, af_gnomadg: 1, pubmed: 1, CADD: 1, REVEL: 1, SpliceAI: 2, Conservation: 1, Blosum62: 1, NMD: 1, LoF: 1, dbNSFP: 'BayesDel_noAF_score,PrimateAI_score,phyloP100way_vertebrate,GERP++_RS' };
const qs = (o) => Object.entries(o).map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join('&');

async function get(path, asm, ms = 60000) {
  // VEP with many plugins sometimes fails at the first try and answers at the next
  return queue(() => fetchJSON(server(asm) + path, { headers: { Accept: 'application/json' }, retries: 2 }, ms));
}
async function post(path, body, asm, ms = 90000) {
  return queue(() => fetchJSON(server(asm) + path, { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify(body), retries: 1 }, ms));
}

/** HGVS (on a RefSeq or Ensembl transcript, or a chromosome) → the variant on the chromosome, by VEP.
    Returns [{chrom, pos, ref, alt, vcf, input}] (several for some inputs) */
export async function resolveHGVS(hgvs, asm) {
  const refseq = /^(N[MRC]_|X[MR]_|NP_|XP_)/i.test(hgvs) ? '&refseq=1' : '';
  const d = await get(`/vep/human/hgvs/${encodeURIComponent(hgvs)}?vcf_string=1${refseq}`, asm, 60000);
  return fromVcfStrings(d);
}
/** an rsID → its alleles on the chromosome */
export async function resolveId(id, asm) {
  const d = await get(`/vep/human/id/${encodeURIComponent(id)}?vcf_string=1&hgvs=1&canonical=1${asm === 'GRCh37' ? '' : '&mane=1'}`, asm, 60000);
  return fromVcfStrings(d);
}
/** a protein change (NP_000537.3:p.Arg273His) → the DNA changes that could make it */
export async function recode(hgvs, asm) {
  const d = await get(`/variant_recoder/human/${encodeURIComponent(hgvs)}?vcf_string=1`, asm, 60000);
  const out = [];
  for (const block of d || []) {
    for (const [, v] of Object.entries(block)) {
      for (const s of (v && v.vcf_string) || []) {
        const m = /^([\dXYMT]+)-(\d+)-([ACGTN]+)-([ACGTN]*)$/.exec(s);
        if (m && !out.some((x) => x.vcf === s)) out.push({ chrom: m[1], pos: +m[2], ref: m[3], alt: m[4], vcf: s, input: hgvs, hgvsc: (v.hgvsc || [])[0] || '' });
      }
    }
  }
  return out;
}
function fromVcfStrings(d) {
  const out = [];
  for (const v of d || []) {
    const list = Array.isArray(v.vcf_string) ? v.vcf_string : v.vcf_string ? [v.vcf_string] : [];
    for (const s of list) {
      const m = /^([\dXYMT]+)-(\d+)-([ACGTN]+)-([ACGTN]*)$/.exec(s);
      if (!m || out.some((x) => x.vcf === s)) continue;
      // the change on the MANE Select (or canonical) transcript, so that the choices can be told apart
      const tcs = (v.transcript_consequences || []).filter((t) => t.variant_allele === m[4] || (m[4] && t.variant_allele === m[4].slice(1)));
      const tc = tcs.find((t) => t.mane_select) || tcs.find((t) => t.canonical) || null;
      out.push({ chrom: m[1], pos: +m[2], ref: m[3], alt: m[4], vcf: s, input: v.input || v.id, hgvsc: tc && tc.hgvsc ? tc.hgvsc : '', hgvsp: tc && tc.hgvsp ? tc.hgvsp.split(':').pop() : '', gene: tc ? tc.gene_symbol || '' : '' });
    }
  }
  return out;
}

/** the full VEP annotation of one variant (VCF-style); cached for 30 days */
export async function vep(v, asm, opts = {}) {
  const key = `vep:${asm}:${v.chrom}-${v.pos}-${v.ref}-${v.alt}:v2`;
  if (!opts.fresh) {
    const c = await cacheGet(key, 30);
    if (c) return c.value;
  }
  const line = `${v.chrom} ${v.pos} . ${v.ref} ${v.alt || '-'} . . .`;
  const flags = asm === 'GRCh37' ? FLAGS37 : FLAGS38;
  const d = await post('/vep/homo_sapiens/region', Object.assign({ variants: [line] }, flags), asm);
  const res = (d && d[0]) || null;
  if (res) await cachePut(key, res);
  return res;
}

/** VEP for many variants at once (a VCF), with fewer extras; returns results matched by VCF key */
export async function vepMany(recs, asm, progress) {
  const out = new Map();
  const B = 100;
  const flags = { hgvs: 1, mane: asm === 'GRCh37' ? 0 : 1, canonical: 1, numbers: 1, variant_class: 1, vcf_string: 1, af_gnomade: 1, af_gnomadg: 1, CADD: 1, REVEL: 1, SpliceAI: 2 };
  for (let i = 0; i < recs.length; i += B) {
    if (progress) progress(i, recs.length);
    const chunk = recs.slice(i, i + B);
    const body = Object.assign({ variants: chunk.map((r) => `${r.chrom} ${r.pos} . ${r.ref} ${r.alt || '-'} . . .`) }, flags);
    let tries = 0;
    for (;;) {
      try {
        const d = await post('/vep/homo_sapiens/region', body, asm, 120000);
        for (const x of d || []) {
          const p = String(x.input || '').trim().split(/\s+/);
          if (p.length >= 5) out.set(`${p[0]}-${p[1]}-${p[3]}-${p[4] === '-' ? '' : p[4]}`, x);
        }
        break;
      } catch (e) {
        if (++tries >= 3) throw e;
        await new Promise((r) => setTimeout(r, 2500 * tries));
      }
    }
  }
  if (progress) progress(recs.length, recs.length);
  return out;
}

/** the genes in a region: [{symbol, id, start, end, strand, biotype, description}] */
export async function genesInRegion(chrom, start, end, asm) {
  const key = `genes:${asm}:${chrom}:${start}-${end}`;
  const c = await cacheGet(key, 60);
  if (c) return c.value;
  const out = [];
  // the service answers at most 5 Mb at a time
  const step = 4900000;
  for (let s = start; s <= end; s += step) {
    const e = Math.min(end, s + step - 1);
    const d = await get(`/overlap/region/human/${chrom}:${s}-${e}?feature=gene`, asm, 60000);
    for (const g of d || []) {
      if (out.some((x) => x.id === g.id)) continue;
      out.push({ id: g.id, symbol: g.external_name || g.id, start: g.start, end: g.end, strand: g.strand, biotype: g.biotype, description: (g.description || '').replace(/\s*\[Source:.*\]$/, ''), canonical: g.canonical_transcript || null });
    }
  }
  out.sort((a, b) => a.start - b.start);
  await cachePut(key, out);
  return out;
}

/** a gene's transcripts and exons (for drawing a gene, and for the exon a variant is in) */
export async function lookupGene(symbolOrId, asm) {
  const key = `lookup:${asm}:${symbolOrId}`;
  const c = await cacheGet(key, 60);
  if (c) return c.value;
  const path = /^ENSG/i.test(symbolOrId) ? `/lookup/id/${symbolOrId}?expand=1` : `/lookup/symbol/homo_sapiens/${encodeURIComponent(symbolOrId)}?expand=1`;
  const d = await get(path, asm, 60000);
  await cachePut(key, d);
  return d;
}

/** the reference sequence of a region (for the splice and sequence views) */
export async function sequence(chrom, start, end, asm, strand = 1) {
  const d = await get(`/sequence/region/human/${chrom}:${start}..${end}:${strand}?content-type=application/json`, asm, 30000);
  return d && d.seq;
}

export async function release(asm) {
  try {
    const d = await get('/info/software', asm, 15000);
    return d && d.release;
  } catch (e) {
    return null;
  }
}
