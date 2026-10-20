/* =====================================================================
   What is known about a stretch of a chromosome, for weighing a
   copy-number variant (or looking at a region):

     regionGenes      the genes in it, whole or in part, with their dosage
                      sensitivity, constraint and diseases (the site's gene
                      table on GRCh38; Ensembl's genes on GRCh37)
     dosageRegions    ClinGen's curated regions overlapping it (the table)
     clinvarCNVs      ClinVar's losses and gains overlapping it (UCSC's
                      monthly copy of ClinVar; NCBI's search if that fails)
     dgvGold          the Database of Genomic Variants' gold standard CNVs
     gnomadSVs        gnomAD's structural variants (v4 on GRCh38, v2 on GRCh37)
     cytobands        the chromosome bands it spans

   Positions are 1-based and inclusive throughout.
   ===================================================================== */
import { fetchWithTimeout } from '../core.js';
import { cacheGet, cachePut } from '../db.js';
import { normChrom } from '../parse.js';
import { loadGenes, allGenes, gene as geneInfo, genesMeta, hiPredicted, tsPredicted, validity, g2p, bestValidity } from '../genes.js';
import { genesInRegion } from './ensembl.js';
import { structuralVariants } from './gnomad.js';
import { cnvsInRegion } from './clinvar.js';
import { bigBedRegion } from './ucsc.js';
import { ucscBase, UCSC_DB } from '../widgets/genome.js';

/* ---------------- overlaps ---------------- */
export const overlapBp = (a1, a2, b1, b2) => Math.max(0, Math.min(a2, b2) - Math.max(a1, b1) + 1);
/** how much of each of two stretches the other covers */
export function cover(a1, a2, b1, b2) {
  const o = overlapBp(a1, a2, b1, b2);
  const la = Math.max(1, a2 - a1 + 1), lb = Math.max(1, b2 - b1 + 1);
  return { bp: o, ofA: o / la, ofB: o / lb, reciprocal: Math.min(o / la, o / lb) };
}

/* ---------------- genes ---------------- */
const MONO = /^(AD|XL|XLD|XLR|YL|SD)$|semidominant|dominant|x-linked|monoallelic/i;
/** what the site knows of a gene, flattened for the tables */
function describeGene(g, base) {
  const val = g ? validity(g) : [];
  const gp = g ? g2p(g) : [];
  const best = g ? bestValidity(g) : null;
  const moi = new Set();
  for (const x of val) if (!/Refuted|Disputed|No Known/i.test(x.classification) && x.moi) moi.add(x.moi);
  for (const x of gp) if (x.allelic) moi.add(x.allelic);
  const goodValidity = val.filter((x) => /Definitive|Strong|Moderate/.test(x.classification));
  const goodG2P = gp.filter((x) => /definitive|strong|moderate|confirmed|probable/i.test(x.confidence || ''));
  return Object.assign(base, {
    known: !!g,
    name: (g && g.name) || base.name || '',
    hgnc: g ? g.hgnc : null,
    omim: g ? g.omim : null,
    pc: base.pc != null ? base.pc : g ? g.locus === 'pc' : false,
    hi: g ? g.hi : null,
    ts: g ? g.ts : null,
    hiDisease: g ? g.hiDisease || '' : '',
    tsDisease: g ? g.tsDisease || '' : '',
    pHaplo: g ? g.pHaplo : null,
    pTriplo: g ? g.pTriplo : null,
    loeuf: g ? g.loeuf : null,
    pLI: g ? g.pLI : null,
    hiWhy: g ? hiPredicted(g) : [],
    tsWhy: g ? tsPredicted(g) : [],
    validity: best,
    validityAll: val,
    g2p: gp,
    moi: Array.from(moi),
    monoallelic: Array.from(moi).some((m) => MONO.test(m) && !/biallelic|AR\b/i.test(m)),
    disease: goodValidity.length > 0 || goodG2P.length > 0 || !!(g && (g.hiDisease || g.tsDisease))
  });
}

/** where a gene lies against the CNV: whole, within (both breakpoints in it), and which ends are in it */
function placeGene(base, start, end) {
  const plus = base.strand === '+' || base.strand === 1 || base.strand === '1';
  const five = plus ? base.start : base.end;
  const three = plus ? base.end : base.start;
  const c = cover(start, end, base.start, base.end);
  return Object.assign(base, {
    whole: base.start >= start && base.end <= end,
    inside: start > base.start && end < base.end,
    five: five >= start && five <= end,
    three: three >= start && three <= end,
    overlapBp: c.bp,
    coverOfGene: c.ofB
  });
}

/** the genes in a region: [{ symbol, name, start, end, strand, pc, whole, inside, five, three, hi, ts, … }] */
export async function regionGenes(chrom, start, end, asm = 'GRCh38') {
  await loadGenes();
  const c = normChrom(chrom);
  let out = [];
  if (asm !== 'GRCh37') {
    for (const g of allGenes()) {
      if (normChrom(g.chrom) !== c || g.start == null || g.start > end || g.end < start) continue;
      out.push(describeGene(g, placeGene({ symbol: g.symbol, start: g.start, end: g.end, strand: g.strand, pc: g.locus === 'pc' }, start, end)));
    }
  } else {
    // GRCh37: Ensembl's genes there, joined to the site's table for what is known of each
    const list = await genesInRegion(c, start, end, 'GRCh37');
    for (const x of list) {
      const pc = x.biotype === 'protein_coding';
      const g = geneInfo(x.id) || (x.symbol && geneInfo(x.symbol)) || null;
      if (!pc && !(g && g.locus === 'pc')) continue;
      out.push(describeGene(g, placeGene({ symbol: (g && g.symbol) || x.symbol, name: x.description, start: x.start, end: x.end, strand: x.strand, pc: pc || !!(g && g.locus === 'pc') }, start, end)));
    }
  }
  out.sort((a, b) => a.start - b.start);
  return out;
}

/** the protein-coding genes of the site's table in a stretch of GRCh38 (for a curated region's gene content) */
function genesOn38(chrom, start, end) {
  const c = normChrom(chrom);
  return allGenes().filter((g) => g.locus === 'pc' && normChrom(g.chrom) === c && g.start != null && g.start <= end && g.end >= start).map((g) => g.symbol);
}

/* ---------------- ClinGen's curated regions ---------------- */
export const clingenRegionUrl = (id) => `https://search.clinicalgenome.org/kb/gene-dosage/region/${encodeURIComponent(id)}`;
export const clingenGeneUrl = (hgnc) => (hgnc ? `https://search.clinicalgenome.org/kb/gene-dosage/${encodeURIComponent(hgnc)}` : null);

/** ClinGen's regions overlapping: [{ id, name, cytoband, hi, ts, start, end, whole, inside, coverOfRegion, coverOfCnv, genes }] */
export async function dosageRegions(chrom, start, end, asm = 'GRCh38') {
  await loadGenes();
  const M = genesMeta();
  const c = normChrom(chrom);
  const out = [];
  for (const r of M.regions || []) {
    const [id, name, cytoband, rc, s38, e38, s37, e37, hi, ts, date] = r;
    if (normChrom(rc) !== c) continue;
    const s = asm === 'GRCh37' ? s37 : s38, e = asm === 'GRCh37' ? e37 : e38;
    if (s == null || e == null || s > end || e < start) continue;
    const cv = cover(start, end, s, e);
    out.push({
      id, name, cytoband, hi, ts, date, chrom: c, start: s, end: e,
      whole: s >= start && e <= end,
      inside: start >= s && end <= e,
      coverOfRegion: cv.ofB, coverOfCnv: cv.ofA,
      genes: s38 != null ? genesOn38(rc, s38, e38) : null,
      url: clingenRegionUrl(id)
    });
  }
  return out.sort((a, b) => a.start - b.start);
}

/* ---------------- ClinVar ---------------- */
const CV_CODE = { PG: 'p', LP: 'lp', VUS: 'vus', UC: 'vus', LB: 'lb', BN: 'b', CF: 'conflict', OT: 'other', RF: 'other' };
const kindOf = (t) => (/loss|deletion/i.test(t || '') ? 'loss' : /gain|duplication|amplification|triplication/i.test(t || '') ? 'gain' : 'other');
const stripHtml = (s) => String(s || '').replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&#97\d\d;/g, '').replace(/&[a-z]+;/g, ' ').replace(/^\s*based on:\s*/i, '').replace(/\s+/g, ' ').trim();

function fromBigBed(r, start, end) {
  const f = r.f;
  const cv = cover(start, end, r.start, r.end);
  const copies = /\)x(\d+)/.exec(f.origName || '');
  const conditions = String(f.phenotypeList || '').split(/\|/).map((x) => x.trim()).filter((x) => x && !/^(not provided|not specified|see cases)$/i.test(x));
  return {
    id: f.vcvId || f.name, uid: f._variantId || null,
    url: f._variantId ? `https://www.ncbi.nlm.nih.gov/clinvar/variation/${f._variantId}/` : `https://www.ncbi.nlm.nih.gov/clinvar/?term=${encodeURIComponent(f.vcvId || f.name || '')}`,
    type: kindOf(f.type), typeText: f.type || '', start: r.start, end: r.end, size: r.end - r.start + 1,
    copies: copies ? +copies[1] : null,
    cls: CV_CODE[f._clinSignCode] || 'other', clinSign: f.clinSign || '',
    stars: f._starCount != null && f._starCount !== '' ? +f._starCount : null, review: stripHtml(f.reviewStatus),
    conditions, origin: f.origin || '', cytogenetic: f.cytogenetic || '', evaluated: f.lastEval || '', submitters: f.numSubmit ? +f.numSubmit : null,
    genesText: f.geneId || '',
    coverOfCnv: cv.ofA, coverOfTheirs: cv.ofB, reciprocal: cv.reciprocal
  };
}
function fromEutils(r, start, end, asm) {
  const l = asm === 'GRCh37' ? r.loc37 : r.loc38;
  const cv = l ? cover(start, end, l.start, l.stop) : { ofA: 0, ofB: 0, reciprocal: 0 };
  const cls = { p: 'p', lp: 'lp', plp: 'p', vus: 'vus', lb: 'lb', b: 'b', blb: 'b', conflict: 'conflict' }[r.cls] || 'other';
  return {
    id: r.accession, uid: r.uid, url: r.url, type: kindOf(r.type), typeText: r.type || '', start: l ? l.start : null, end: l ? l.stop : null, size: l ? l.stop - l.start + 1 : null,
    copies: null, cls, clinSign: r.classification, stars: r.stars, review: r.review, conditions: r.conditions || [], origin: '', cytogenetic: '', evaluated: r.evaluated || '', submitters: r.submissions || null,
    genesText: r.gene || '', coverOfCnv: cv.ofA, coverOfTheirs: cv.ofB, reciprocal: cv.reciprocal
  };
}

/** ClinVar's copy-number records overlapping: { list, source, note } */
export async function clinvarCNVs(chrom, start, end, asm = 'GRCh38', opts = {}) {
  const db = UCSC_DB[asm] || 'hg38';
  try {
    const rows = await bigBedRegion(`${ucscBase()}/gbdb/${db}/bbi/clinvar/clinvarCnv.bb`, chrom, start, end, { fresh: opts.fresh });
    const list = rows.map((r) => fromBigBed(r, start, end)).filter((x) => x.type !== 'other');
    return { list, source: 'ClinVar, as copied each month by UCSC' };
  } catch (e) {
    // NCBI's search finds records that start or end in the region (not larger ones around it)
    const recs = await cnvsInRegion(normChrom(chrom), start, end, asm);
    return { list: recs.map((r) => fromEutils(r, start, end, asm)).filter((x) => x.type !== 'other'), source: 'ClinVar, searched at NCBI', note: `UCSC’s copy of ClinVar could not be read (${e.message}), so NCBI was searched instead. Its search finds the records that begin or end in the region, but not larger ones that contain it.` };
  }
}

/* ---------------- population CNVs ---------------- */
/** the Database of Genomic Variants' gold standard set: [{ id, type, start, end, inner: [s, e], af, carriers, tested, studies, coverOfCnv, … }] */
export async function dgvGold(chrom, start, end, asm = 'GRCh38', opts = {}) {
  const db = UCSC_DB[asm] || 'hg38';
  const rows = await bigBedRegion(`${ucscBase()}/gbdb/${db}/dgv/dgvGold.bb`, chrom, start, end, { fresh: opts.fresh });
  return rows.map((r) => {
    const f = r.f;
    const sizes = String(f.blockSizes || '').split(',').filter(Boolean).map(Number);
    const starts = String(f.chromStarts || '').split(',').filter(Boolean).map(Number);
    let inner = [r.start, r.end];
    if (sizes.length && sizes.length === starts.length) {
      let k = 0;
      sizes.forEach((s, i) => { if (s > sizes[k]) k = i; });
      if (sizes[k] > 1) inner = [r.start + starts[k], r.start + starts[k] + sizes[k] - 1];
    }
    const af = f.Frequency ? parseFloat(f.Frequency) / 100 : null;
    const cvi = cover(start, end, inner[0], inner[1]);
    const cvo = cover(start, end, r.start, r.end);
    return {
      source: 'DGV gold standard', id: f.dgvID || f.name, type: /loss/i.test(f.variant_sub_type) ? 'loss' : /gain/i.test(f.variant_sub_type) ? 'gain' : 'other',
      start: r.start, end: r.end, inner, size: r.end - r.start + 1,
      af: isFinite(af) ? af : null, carriers: f.num_samples ? +f.num_samples : null, tested: f.num_unique_samples_tested ? +f.num_unique_samples_tested : null, studies: f.num_studies ? +f.num_studies : null,
      coverOfCnv: cvi.ofA, coverOfCnvOuter: cvo.ofA, coverOfTheirs: cvo.ofB, reciprocal: cvo.reciprocal,
      url: `http://dgv.tcag.ca/gb2/gbrowse/dgv2_${asm === 'GRCh37' ? 'hg19' : 'hg38'}/?name=${encodeURIComponent(f.dgvID || f.name || '')}`
    };
  }).filter((x) => x.type !== 'other');
}

const SV_KIND = { DEL: 'loss', DUP: 'gain', CNV: 'both' };
export const GNOMAD_SV_MAX = 20000000;
/** gnomAD's structural variants (deletions, duplications and multi-copy CNVs) overlapping: { list, dataset, skipped } */
export async function gnomadSVs(chrom, start, end, asm = 'GRCh38') {
  const dataset = asm === 'GRCh37' ? 'gnomAD SVs v2.1' : 'gnomAD SVs v4.1';
  if (end - start + 1 > GNOMAD_SV_MAX) return { list: [], dataset, skipped: true };
  const c = normChrom(chrom);
  const rows = await structuralVariants(c, start, end, asm);
  const list = [];
  for (const s of rows || []) {
    const type = SV_KIND[s.type];
    if (!type || normChrom(s.chrom) !== c) continue;
    const e = s.end != null && s.end > s.pos ? s.end : s.pos + Math.max(0, s.length || 0);
    const cv = cover(start, end, s.pos, e);
    if (!cv.bp) continue;
    list.push({
      source: dataset, id: s.variant_id, type, svtype: s.type, start: s.pos, end: e, size: e - s.pos + 1,
      af: s.af, ac: s.ac, an: s.an, hom: s.homozygote_count, filters: (s.filters || []).filter((x) => x !== 'PASS'), consequence: s.consequence || '',
      coverOfCnv: cv.ofA, coverOfTheirs: cv.ofB, reciprocal: cv.reciprocal,
      url: `https://gnomad.broadinstitute.org/variant/${encodeURIComponent(s.variant_id)}?dataset=${asm === 'GRCh37' ? 'gnomad_sv_r2_1' : 'gnomad_sv_r4'}`
    });
  }
  return { list, dataset };
}

/* ---------------- chromosome bands ---------------- */
const bandsP = {};
async function loadBands(asm) {
  const db = UCSC_DB[asm] || 'hg38';
  if (!bandsP[db]) {
    bandsP[db] = (async () => {
      const key = `cytoband:${db}`;
      const c = await cacheGet(key, 365);
      if (c) return c.value;
      const r = await fetchWithTimeout(`${ucscBase()}/goldenPath/${db}/database/cytoBand.txt.gz`, {}, 30000);
      const stream = r.body.pipeThrough(new DecompressionStream('gzip'));
      const txt = await new Response(stream).text();
      const out = {};
      for (const line of txt.split('\n')) {
        const f = line.split('\t');
        if (f.length < 5 || !f[3]) continue;
        const ch = normChrom(f[0]);
        if (!/^(\d+|X|Y)$/.test(ch)) continue;
        (out[ch] = out[ch] || []).push([+f[1] + 1, +f[2], f[3], f[4]]);
      }
      await cachePut(key, out);
      return out;
    })().catch((e) => {
      delete bandsP[db];
      throw e;
    });
  }
  return bandsP[db];
}
/** the bands a region spans: { first, last, text ('22q11.21' or '22q11.1–q11.21'), iscn ('22q11.1q11.21') } */
export async function cytobands(chrom, start, end, asm = 'GRCh38') {
  const all = await loadBands(asm);
  const c = normChrom(chrom);
  const bands = (all[c] || []).filter(([s, e]) => s <= end && e >= start);
  if (!bands.length) return null;
  const first = bands[0][2], last = bands[bands.length - 1][2];
  if (first === last) return { first, last, text: c + first, iscn: c + first };
  return { first, last, text: `${c}${first}–${last}`, iscn: `${c}${first}${last}` };
}
/** ISCN for a CNV: arr[GRCh38] 22q11.21(18912231_21465672)x1 */
export function iscn(v, bands) {
  const cn = v.copyNumber != null ? v.copyNumber : v.cnvType === 'gain' ? 3 : 1;
  return `arr[${v.assembly || 'GRCh38'}] ${bands ? bands.iscn : normChrom(v.chrom)}(${v.start}_${v.end})x${cn}`;
}
