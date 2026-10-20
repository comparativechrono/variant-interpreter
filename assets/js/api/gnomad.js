/* =====================================================================
   gnomAD's API (GraphQL): a variant's frequencies, exome and genome,
   by genetic ancestry group; a gene's constraint and its ClinVar
   variants. GRCh38 → gnomAD v4.1; GRCh37 → gnomAD v2.1.1.
   https://gnomad.broadinstitute.org/api
   ===================================================================== */
import { fetchJSON, limiter } from '../core.js';
import { CFG } from '../settings.js';
import { cacheGet, cachePut } from '../db.js';

const URL = () => (CFG.services && CFG.services.gnomad) || 'https://gnomad.broadinstitute.org/api';
// gnomAD limits how fast one address may ask (30 queries a minute by default): one at a time, apart
const queue = limiter(1, 700);
export const DATASET = { GRCh38: 'gnomad_r4', GRCh37: 'gnomad_r2_1' };
export const VERSION = { GRCh38: 'gnomAD v4.1', GRCh37: 'gnomAD v2.1.1' };

export const GROUPS = {
  afr: 'African/African American', amr: 'Admixed American', asj: 'Ashkenazi Jewish', eas: 'East Asian', fin: 'European (Finnish)',
  mid: 'Middle Eastern', nfe: 'European (non-Finnish)', sas: 'South Asian', ami: 'Amish', remaining: 'Remaining', oth: 'Other'
};
/* the groups whose filtering allele frequency counts for BA1/BS1 (bottlenecked groups are left out: Ashkenazi Jewish,
   Finnish, Amish, "remaining"/"other"), as gnomAD's grpmax does */
export const GRPMAX_GROUPS = ['afr', 'amr', 'eas', 'mid', 'nfe', 'sas'];

async function gql(query, variables, ms = 45000, again = true) {
  const d = await queue(() => fetchJSON(URL(), { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify({ query, variables }), retries: 1 }, ms));
  if (d.errors && d.errors.length) {
    const msg = d.errors.map((e) => e.message).join('; ');
    // over gnomAD's limit: wait, and ask once more
    if (again && /rate limit/i.test(msg)) {
      await new Promise((res) => setTimeout(res, 20000));
      return gql(query, variables, ms, false);
    }
    // "Variant not found" is an answer, not a failure
    if (/not found/i.test(msg)) return { notFound: true, data: d.data };
    const err = new Error('gnomAD: ' + msg);
    err.gnomad = d.errors;
    throw err;
  }
  return d;
}

const FREQ = 'ac an homozygote_count hemizygote_count af filters faf95 { popmax popmax_population } populations { id ac an homozygote_count hemizygote_count }';
const Q_VARIANT = `query($id: String!, $ds: DatasetId!) {
  variant(variantId: $id, dataset: $ds) {
    variant_id reference_genome chrom pos ref alt rsids flags caid
    exome { ${FREQ} }
    genome { ${FREQ} }
    in_silico_predictors { id value flags }
  }
}`;
const Q_VARIANT_JOINT = `query($id: String!, $ds: DatasetId!) {
  variant(variantId: $id, dataset: $ds) {
    variant_id reference_genome chrom pos ref alt rsids flags caid
    exome { ${FREQ} }
    genome { ${FREQ} }
    joint { ac an homozygote_count hemizygote_count filters faf95 { popmax popmax_population } populations { id ac an homozygote_count hemizygote_count } }
    in_silico_predictors { id value flags }
  }
}`;

/** a variant's frequencies; { found: false } if gnomAD has not seen it */
export async function variant(v, asm, opts = {}) {
  const id = `${v.chrom}-${v.pos}-${v.ref}-${v.alt}`;
  const key = `gnomad:${asm}:${id}`;
  if (!opts.fresh) {
    const c = await cacheGet(key, 30);
    if (c) return c.value;
  }
  const ds = DATASET[asm] || 'gnomad_r4';
  const d = await gql(asm === 'GRCh37' ? Q_VARIANT : Q_VARIANT_JOINT, { id, ds });
  const x = d.notFound ? null : d.data && d.data.variant;
  const out = x ? summarise(x, asm) : { found: false, dataset: VERSION[asm], id };
  await cachePut(key, out);
  return out;
}

/** the numbers a page needs, from gnomAD's answer */
function summarise(x, asm) {
  const part = (s) => {
    if (!s) return null;
    const pops = {};
    for (const p of s.populations || []) {
      if (/_X[XY]$|^X[XY]$/.test(p.id)) continue;
      pops[p.id] = { ac: p.ac, an: p.an, hom: p.homozygote_count, hemi: p.hemizygote_count, af: p.an ? p.ac / p.an : null };
    }
    return {
      ac: s.ac, an: s.an, af: s.af != null ? s.af : s.an ? s.ac / s.an : null, hom: s.homozygote_count, hemi: s.hemizygote_count,
      filters: s.filters || [], faf95: s.faf95 ? s.faf95.popmax : null, faf95Group: s.faf95 ? s.faf95.popmax_population : null, pops
    };
  };
  const exome = part(x.exome), genome = part(x.genome);
  let joint = part(x.joint);
  if (!joint && (exome || genome)) {
    // gnomAD v2: add the exomes and the genomes together for a view of all of it
    joint = { ac: 0, an: 0, hom: 0, hemi: 0, filters: [], pops: {}, faf95: null, faf95Group: null, combined: true };
    for (const s of [exome, genome]) {
      if (!s) continue;
      joint.ac += s.ac; joint.an += s.an; joint.hom += s.hom || 0; joint.hemi += s.hemi || 0;
      if (s.faf95 != null && (joint.faf95 == null || s.faf95 > joint.faf95)) {
        joint.faf95 = s.faf95;
        joint.faf95Group = s.faf95Group;
      }
      for (const [k, p] of Object.entries(s.pops)) {
        const j = joint.pops[k] || (joint.pops[k] = { ac: 0, an: 0, hom: 0, hemi: 0 });
        j.ac += p.ac; j.an += p.an; j.hom += p.hom || 0; j.hemi += p.hemi || 0;
      }
    }
    joint.af = joint.an ? joint.ac / joint.an : null;
    for (const p of Object.values(joint.pops)) p.af = p.an ? p.ac / p.an : null;
  }
  const pred = {};
  for (const p of x.in_silico_predictors || []) pred[p.id] = p.value;
  return { found: true, dataset: VERSION[asm], id: x.variant_id, rsids: x.rsids || [], flags: x.flags || [], caid: x.caid || null, exome, genome, joint, predictors: pred };
}

/** a gene's constraint and its ClinVar variants (gnomAD keeps a copy of ClinVar) */
export async function gene(symbol, asm = 'GRCh38') {
  const key = `gnomad-gene:${asm}:${symbol}`;
  const c = await cacheGet(key, 14);
  if (c) return c.value;
  const ref = asm === 'GRCh37' ? 'GRCh37' : 'GRCh38';
  const q = `query($sym: String!) {
    gene(gene_symbol: $sym, reference_genome: ${ref}) {
      gene_id symbol name chrom start stop strand canonical_transcript_id
      ${ref === 'GRCh38' ? 'mane_select_transcript { ensembl_id ensembl_version refseq_id refseq_version }' : ''}
      gnomad_constraint { exp_lof obs_lof oe_lof oe_lof_lower oe_lof_upper pli exp_mis obs_mis oe_mis oe_mis_upper mis_z syn_z }
      clinvar_variants { variant_id clinical_significance gold_stars hgvsc hgvsp major_consequence pos review_status clinvar_variation_id in_gnomad }
    }
  }`;
  const d = await gql(q, { sym: symbol }, 90000);
  const g = d.notFound ? null : d.data && d.data.gene;
  if (g) await cachePut(key, g);
  return g;
}

/** structural variants in a region (gnomAD SVs: v4 on GRCh38, v2 on GRCh37) */
export async function structuralVariants(chrom, start, end, asm = 'GRCh38') {
  const key = `gnomad-sv:${asm}:${chrom}:${start}-${end}`;
  const c = await cacheGet(key, 30);
  if (c) return c.value;
  const ds = asm === 'GRCh37' ? 'gnomad_sv_r2_1' : 'gnomad_sv_r4';
  const q = `query($chrom: String!, $start: Int!, $stop: Int!, $ds: StructuralVariantDatasetId!) {
    region(chrom: $chrom, start: $start, stop: $stop, reference_genome: ${asm === 'GRCh37' ? 'GRCh37' : 'GRCh38'}) {
      structural_variants(dataset: $ds) { variant_id type chrom pos end length ac an af homozygote_count consequence filters }
    }
  }`;
  const d = await gql(q, { chrom: String(chrom), start: Math.max(1, start), stop: end, ds }, 90000);
  const out = (d.data && d.data.region && d.data.region.structural_variants) || [];
  await cachePut(key, out);
  return out;
}

/** the frequency to compare with thresholds: the grpmax filtering allele frequency (joint where there is one) */
export function grpmaxFAF(g) {
  if (!g || !g.found) return null;
  const s = g.joint || g.exome || g.genome;
  return s && s.faf95 != null ? { faf: s.faf95, group: s.faf95Group, from: g.joint && !g.joint.combined ? 'exomes and genomes together' : 'the larger of exomes and genomes' } : null;
}
/** the largest allele frequency in a continental group with enough alleles (at least 2,000) */
export function maxGroupAF(g, minAN = 2000) {
  if (!g || !g.found) return null;
  const s = g.joint || g.exome || g.genome;
  let best = null;
  for (const [k, p] of Object.entries(s.pops || {})) {
    if (!GRPMAX_GROUPS.includes(k) || !p.an || p.an < minAN) continue;
    if (!best || p.af > best.af) best = { group: k, af: p.af, ac: p.ac, an: p.an };
  }
  return best;
}
