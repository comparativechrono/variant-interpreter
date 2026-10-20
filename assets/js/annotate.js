/* =====================================================================
   Annotating a variant: what Ensembl's VEP, gnomAD and ClinVar say of
   it, put together into one "evidence" object for its page, its
   suggestions and its report. Each source is asked separately, so that
   one service being down leaves the others.
   ===================================================================== */
import * as ens from './api/ensembl.js';
import * as gn from './api/gnomad.js';
import * as cv from './api/clinvar.js';
import { readQuery, normChrom } from './parse.js';
import { loadGenes, gene as geneInfo } from './genes.js';

/* Ensembl's consequence terms, most severe first */
export const SO = [
  'transcript_ablation', 'splice_acceptor_variant', 'splice_donor_variant', 'stop_gained', 'frameshift_variant', 'stop_lost', 'start_lost',
  'transcript_amplification', 'feature_elongation', 'feature_truncation', 'inframe_insertion', 'inframe_deletion', 'missense_variant',
  'protein_altering_variant', 'splice_donor_5th_base_variant', 'splice_region_variant', 'splice_donor_region_variant',
  'splice_polypyrimidine_tract_variant', 'incomplete_terminal_codon_variant', 'start_retained_variant', 'stop_retained_variant',
  'synonymous_variant', 'coding_sequence_variant', 'mature_miRNA_variant', '5_prime_UTR_variant', '3_prime_UTR_variant',
  'non_coding_transcript_exon_variant', 'intron_variant', 'NMD_transcript_variant', 'non_coding_transcript_variant',
  'coding_transcript_variant', 'upstream_gene_variant', 'downstream_gene_variant', 'TFBS_ablation', 'TFBS_amplification',
  'TF_binding_site_variant', 'regulatory_region_ablation', 'regulatory_region_amplification', 'regulatory_region_variant',
  'intergenic_variant', 'sequence_variant'
];
const RANK = new Map(SO.map((t, i) => [t, i]));
export const rankOf = (terms) => Math.min(...(terms || ['sequence_variant']).map((t) => (RANK.has(t) ? RANK.get(t) : 99)));
export const niceConsequence = (t) => String(t || '').replace(/_variant$/, '').replace(/_/g, ' ').replace(/^5 prime/, '5′').replace(/^3 prime/, '3′');
export const LOF_TERMS = ['transcript_ablation', 'splice_acceptor_variant', 'splice_donor_variant', 'stop_gained', 'frameshift_variant', 'start_lost'];

/**
 * An insertion or deletion moved to its left-most position, with one base before it: how gnomAD and
 * ClinVar (and VCF files, by convention) write it. VEP describes a deletion in a repeat at its 3′-most
 * position, so without this, F508del (7-117559591-TCTT-T as VEP gives it) would not be found in gnomAD,
 * which has it as 7-117559590-ATCT-A. Substitutions are returned as they are.
 */
export async function leftAlign(c, asm) {
  let ref = String(c.ref || '').toUpperCase(), alt = String(c.alt || '').toUpperCase();
  if (ref.length === alt.length) return c;
  let pos = c.pos;
  const winStart = Math.max(1, pos - 300);
  let seq;
  try {
    seq = String((await ens.sequence(c.chrom, winStart, pos + Math.max(ref.length, 1) - 1, asm)) || '').toUpperCase();
  } catch (e) {
    return c;
  }
  // the reference allele must be what the genome has there
  if (!seq || (ref && seq.slice(pos - winStart, pos - winStart + ref.length) !== ref)) return c;
  for (let guard = 0; guard < 2000; guard++) {
    let changed = false;
    if (ref.length && alt.length && ref[ref.length - 1] === alt[alt.length - 1]) {
      ref = ref.slice(0, -1);
      alt = alt.slice(0, -1);
      changed = true;
    }
    if (!ref.length || !alt.length) {
      if (pos - 1 < winStart) break;
      const b = seq[pos - 1 - winStart];
      ref = b + ref;
      alt = b + alt;
      pos -= 1;
      changed = true;
    }
    if (!changed) break;
  }
  while (ref.length > 1 && alt.length > 1 && ref[0] === alt[0]) {
    ref = ref.slice(1);
    alt = alt.slice(1);
    pos += 1;
  }
  if (pos === c.pos && ref === c.ref && alt === (c.alt || '')) return c;
  return Object.assign({}, c, { pos, ref, alt, vcf: `${c.chrom}-${pos}-${ref}-${alt}`, shiftedFrom: c.vcf || `${c.chrom}-${c.pos}-${c.ref}-${c.alt}` });
}

/**
 * From what was typed to the variant on the chromosome.
 * → { ok: true, candidates: [{chrom, pos, ref, alt, vcf, input, hgvsc?}], input, kind }  (one or more)
 *   { ok: false, message }
 */
export async function resolveInput(text, asm) {
  const res = await resolveRaw(text, asm);
  if (res.ok && res.kind === 'vcf') {
    // a typed reference allele must be what the genome has there: a GRCh37 position read on GRCh38 (or a slip)
    // would otherwise be annotated as the change the genome's own base gives
    const c = res.candidates[0];
    const has = await genomeBase(c, asm);
    if (has) return { ok: false, refMismatch: true, message: `On ${asm}, the genome has ${has} at ${c.chrom}:${c.pos}${c.ref.length > 1 ? `-${c.pos + c.ref.length - 1}` : ''}, not ${c.ref.toUpperCase()}. Check the position, the alleles and the genome build, because positions on GRCh37 and GRCh38 differ.` };
  }
  if (res.ok) res.candidates = await Promise.all(res.candidates.map((c) => leftAlign(c, asm)));
  return res;
}
/** the genome's own bases where a typed reference allele is, if they differ from it (null if they agree, or can't be checked) */
async function genomeBase(c, asm) {
  const ref = String(c.ref || '').toUpperCase();
  if (!/^[ACGTN]+$/.test(ref) || ref.length > 200) return null;
  let seq;
  try {
    seq = String((await ens.sequence(c.chrom, c.pos, c.pos + ref.length - 1, asm)) || '').toUpperCase();
  } catch (e) {
    return null; // the check needs Ensembl: without it, carry on
  }
  return seq && seq.length === ref.length && seq !== ref ? seq : null;
}
async function resolveRaw(text, asm) {
  const r = readQuery(text);
  try {
    if (r.kind === 'vcf') return { ok: true, kind: 'vcf', candidates: [{ chrom: r.chrom, pos: r.pos, ref: r.ref, alt: r.alt, vcf: `${r.chrom}-${r.pos}-${r.ref}-${r.alt}`, input: text }] };
    if (r.kind === 'rsid') {
      const c = await ens.resolveId(r.id, asm);
      return c.length ? { ok: true, kind: 'rsid', candidates: c } : { ok: false, message: `Ensembl has no record of ${r.id} on ${asm}. Check that the rsID is right.` };
    }
    if (r.kind === 'hgvs') {
      let hgvs = r.hgvs;
      if (r.ref === 'gene') {
        // a gene's symbol: use its MANE Select transcript (VEP is slow with symbols, and the transcript should be named)
        await loadGenes().catch(() => null);
        const g = geneInfo(r.gene);
        if (!g || !g.mane) return { ok: false, message: `Give the transcript as well as the gene, for example NM_000546.6:c.818G>A. ${g ? '' : `${r.gene} isn’t a gene symbol the site knows.`}` };
        hgvs = `${g.mane}:${r.type}.${hgvs.split(/:[cgnmrp]\./)[1]}`;
      }
      if (r.ref === 'protein') {
        let ph = hgvs;
        if (/^[A-Za-z][A-Za-z0-9-]*:p\./.test(hgvs) && !/^(NP_|XP_|ENSP)/i.test(hgvs)) {
          await loadGenes().catch(() => null);
          const g = geneInfo(r.gene);
          if (g && g.mane) ph = `${r.gene}:${hgvs.split(':')[1]}`;
        }
        let c;
        try {
          c = await ens.recode(ph, asm);
        } catch (e) {
          if (/HTTP 400/.test(String(e.message))) throw e;
          return { ok: false, message: `Ensembl’s look-up of protein changes didn’t answer in time. It’s slow and sometimes busy, so give the DNA change on a transcript instead (for example NM_000546.6:c.818G>A), or try again in a few minutes.` };
        }
        return c.length ? { ok: true, kind: 'protein', candidates: c, note: 'More than one DNA change can make this protein change, so choose the one the test found.' }
          : { ok: false, message: 'Ensembl couldn’t find the DNA changes that make this protein change. Give the change on a transcript (c.) instead.' };
      }
      const c = await ens.resolveHGVS(hgvs, asm);
      return c.length ? { ok: true, kind: 'hgvs', candidates: c.map((x) => Object.assign(x, { input: hgvs })) } : { ok: false, message: `VEP couldn’t place ${hgvs} on ${asm}. Check the transcript version and the change.` };
    }
    return { ok: false, message: 'That doesn’t look like a variant. Try a transcript change (NM_000546.6:c.818G>A), a chromosome position (17-7673802-C-T) or an rsID (rs28934576).' };
  } catch (e) {
    const m = String(e.message || e);
    if (/HTTP 400/.test(m)) {
      const detail = /"error"\s*:\s*"([^"]+)"/.exec(m);
      return { ok: false, message: 'Ensembl couldn’t read that variant' + (detail ? ': ' + detail[1].replace(/\\n/g, ' ').slice(0, 220) : '.') + ' Check the transcript version and the reference base.' };
    }
    return { ok: false, message: 'Ensembl didn’t answer (' + m + '). Try again in a minute, or give the variant as chromosome-position-reference-alternative, for example 17-7673802-C-T.' };
  }
}

/** the transcript to describe the variant with: the one asked for, else MANE Select, else canonical */
export function chooseTranscript(vep, want) {
  const tcs = (vep && vep.transcript_consequences) || [];
  if (!tcs.length) return null;
  const base = (s) => String(s || '').replace(/\.\d+$/, '');
  if (want) {
    const w = base(want);
    const t = tcs.find((x) => base(x.transcript_id) === w || base(x.mane_select) === w);
    if (t) return t;
  }
  const coding = (t) => t.biotype === 'protein_coding';
  return tcs.find((t) => t.mane_select && coding(t)) || tcs.find((t) => t.canonical && coding(t)) || tcs.find((t) => t.canonical) ||
    tcs.slice().sort((a, b) => rankOf(a.consequence_terms) - rankOf(b.consequence_terms))[0];
}

/** what a list of transcripts shows */
export function transcriptRows(vep) {
  return ((vep && vep.transcript_consequences) || []).map((t) => ({
    id: t.transcript_id, refseq: t.mane_select || null, mane: (t.mane || []).length ? t.mane.join(', ').replace(/_/g, ' ') : '', canonical: !!t.canonical,
    gene: t.gene_symbol, biotype: t.biotype, consequence: (t.consequence_terms || []).map(niceConsequence).join(', '), rank: rankOf(t.consequence_terms),
    hgvsc: t.hgvsc ? t.hgvsc.split(':')[1] : '', hgvsp: t.hgvsp ? t.hgvsp.split(':')[1] : '', exon: t.exon || (t.intron ? 'intron ' + t.intron : '')
  })).sort((a, b) => (b.mane ? 1 : 0) - (a.mane ? 1 : 0) || (b.canonical ? 1 : 0) - (a.canonical ? 1 : 0) || a.rank - b.rank);
}

const num = (x) => {
  if (x == null || x === '' || x === '.' || x === 'invalid_field') return null;
  if (typeof x === 'number') return x;
  const vals = String(x).split(/[,;|]/).map(Number).filter((v) => !isNaN(v));
  return vals.length ? Math.max(...vals) : null;
};

/** the numbers the pages and suggestions use, from VEP's answer for one transcript */
export function describe(vep, t, v) {
  if (!vep) return null;
  const terms = t ? t.consequence_terms.slice().sort((a, b) => rankOf([a]) - rankOf([b])) : [vep.most_severe_consequence];
  const sp = t && t.spliceai;
  const spMax = sp ? Math.max(sp.DS_AG || 0, sp.DS_AL || 0, sp.DS_DG || 0, sp.DS_DL || 0) : null;
  const lofInfo = {};
  if (t && t.lof_info) for (const kv of String(t.lof_info).split(',')) { const [k, val] = kv.split(':'); lofInfo[k] = val; }
  const exon = t && t.exon ? t.exon.split('/').map(Number) : null;
  const intron = t && t.intron ? t.intron.split('/').map(Number) : null;
  const hgvsc = t && t.hgvsc ? t.hgvsc : '';
  const cpart = hgvsc ? hgvsc.split(':')[1] : '';
  const ppart = t && t.hgvsp ? t.hgvsp.split(':')[1].replace(/%3D/g, '=') : '';
  const refseq = t && t.mane_select ? t.mane_select : null;
  const co = (vep.colocated_variants || []).filter((c) => c.id && !/^(COSV|CM|CS|CD|CI|CR|CX|HM|CG)/.test(c.id));
  const rs = co.find((c) => /^rs/.test(c.id));
  const pubmed = new Set();
  for (const c of co) for (const p of c.pubmed || []) pubmed.add(p);
  return {
    gene: t ? t.gene_symbol || '' : '',
    geneId: t ? t.gene_id : '',
    hgnc: t ? t.hgnc_id : '',
    transcript: t ? t.transcript_id : '',
    transcriptVersioned: hgvsc ? hgvsc.split(':')[0] : t ? t.transcript_id : '',
    refseq,
    mane: t && t.mane ? t.mane.join(', ') : '',
    canonical: !!(t && t.canonical),
    biotype: t ? t.biotype : '',
    consequence: terms[0],
    consequences: terms,
    impact: t ? t.impact : '',
    lofConsequence: terms.some((x) => LOF_TERMS.includes(x)),
    hgvsc: refseq && cpart ? `${refseq}:${cpart}` : hgvsc,
    hgvscEnsembl: hgvsc,
    hgvsp: ppart,
    hgvsg: v ? `${v.chrom}-${v.pos}-${v.ref}-${v.alt || '-'}` : '',
    exon: exon ? { n: exon[0], of: exon[1] } : null,
    intron: intron ? { n: intron[0], of: intron[1] } : null,
    cdsPos: t ? t.cds_start || null : null,
    proteinPos: t ? t.protein_start || null : null,
    proteinEnd: t ? t.protein_end || null : null,
    aminoAcids: t ? t.amino_acids || '' : '',
    codons: t ? t.codons || '' : '',
    strand: t ? t.strand : null,
    uniprot: t && t.uniprot_isoform ? t.uniprot_isoform[0] : t && t.swissprot ? String(t.swissprot[0]).replace(/\.\d+$/, '') : null,
    variantClass: vep.variant_class,
    rsid: rs ? rs.id : '',
    pubmed: Array.from(pubmed),
    clinSigVep: Array.from(new Set(co.flatMap((c) => c.clin_sig || []))),
    predictors: t ? {
      revel: num(t.revel != null ? t.revel : t.revel_score),
      alphamissense: t.alphamissense ? t.alphamissense.am_pathogenicity : null,
      alphamissenseClass: t.alphamissense ? t.alphamissense.am_class : null,
      cadd: t.cadd_phred != null ? t.cadd_phred : null,
      bayesdel: num(t.bayesdel_noaf_score),
      primateai: num(t.primateai_score),
      metarnn: num(t.metarnn_score),
      sift: t.sift_score != null ? { score: t.sift_score, pred: t.sift_prediction } : null,
      polyphen: t.polyphen_score != null ? { score: t.polyphen_score, pred: t.polyphen_prediction } : null,
      phylop: num(t.phylop100way_vertebrate),
      gerp: num(t['gerp++_rs']),
      conservation: t.conservation != null ? t.conservation : null,
      blosum62: t.blosum62 != null ? t.blosum62 : null
    } : {},
    spliceai: sp ? { ag: sp.DS_AG, al: sp.DS_AL, dg: sp.DS_DG, dl: sp.DS_DL, pag: sp.DP_AG, pal: sp.DP_AL, pdg: sp.DP_DG, pdl: sp.DP_DL, max: spMax } : null,
    lof: t && t.lof ? { call: t.lof, filter: t.lof_filter || '', flags: t.lof_flags || '', info: lofInfo } : null,
    nmd: t && t.nmd ? t.nmd : null
  };
}

/**
 * Annotate a variant: each source separately; onUpdate(evidence) after each arrives.
 * v: {chrom, pos, ref, alt, assembly, transcript}
 */
export async function annotate(v, onUpdate, opts = {}) {
  const asm = v.assembly || 'GRCh38';
  const ev = { asm, status: { vep: 'loading', gnomad: 'loading', clinvar: 'loading' }, errors: {}, at: new Date().toISOString() };
  const tell = () => onUpdate && onUpdate(ev);
  const pVep = ens.vep(v, asm, { fresh: opts.fresh }).then((res) => {
    ev.vep = res;
    ev.t = chooseTranscript(res, v.transcript);
    ev.d = describe(res, ev.t, v);
    ev.status.vep = res ? 'ok' : 'empty';
    tell();
  }).catch((e) => {
    ev.status.vep = 'error';
    ev.errors.vep = e.message;
    tell();
  });
  const pGn = gn.variant(v, asm, { fresh: opts.fresh }).then((res) => {
    ev.gnomad = res;
    ev.status.gnomad = 'ok';
    tell();
  }).catch((e) => {
    ev.status.gnomad = 'error';
    ev.errors.gnomad = e.message;
    tell();
  });
  // ClinVar: the variant's own position, and once VEP has said which codon it is in, the codon's three positions
  const pCv = (async () => {
    try {
      const end = v.pos + Math.max(0, (v.ref || '').length - 1);
      let recs = await cv.atPositions(v.chrom, v.pos, end, asm);
      await pVep;
      let codon = null;
      if (ev.d && ev.d.cdsPos && ev.d.proteinPos && (ev.d.consequence === 'missense_variant' || ev.d.consequence === 'synonymous_variant' || ev.d.consequence === 'stop_gained')) {
        const off = (ev.d.cdsPos - 1) % 3;
        const strand = ev.d.strand || 1;
        const a = strand > 0 ? v.pos - off : v.pos - (2 - off);
        codon = { start: a, end: a + 2 };
        if (codon.start !== v.pos || codon.end !== end) {
          const more = await cv.atPositions(v.chrom, codon.start, codon.end, asm);
          const have = new Set(recs.map((r) => r.uid));
          recs = recs.concat(more.filter((r) => !have.has(r.uid)));
        }
      }
      const self = cv.findSelf(recs, v, ev.d && ev.d.hgvsc, asm);
      ev.clinvar = { records: recs, self, codon };
      ev.status.clinvar = 'ok';
    } catch (e) {
      ev.status.clinvar = 'error';
      ev.errors.clinvar = e.message;
    }
    tell();
  })();
  await Promise.all([pVep, pGn, pCv]);
  return ev;
}

/** the same codon's ClinVar records, for PS1 (same amino acid change) and PM5 (another change at the residue) */
export function sameResidue(ev) {
  if (!ev || !ev.clinvar || !ev.d || !ev.d.proteinPos) return { ps1: [], pm5: [], others: [] };
  const pos = ev.d.proteinPos;
  const [refAA, altAA] = (ev.d.aminoAcids || '').split('/');
  const out = { ps1: [], pm5: [], others: [] };
  const AA3 = { A: 'Ala', R: 'Arg', N: 'Asn', D: 'Asp', C: 'Cys', Q: 'Gln', E: 'Glu', G: 'Gly', H: 'His', I: 'Ile', L: 'Leu', K: 'Lys', M: 'Met', F: 'Phe', P: 'Pro', S: 'Ser', T: 'Thr', W: 'Trp', Y: 'Tyr', V: 'Val', '*': 'Ter', X: 'Ter' };
  const mine = refAA && altAA ? `p.${AA3[refAA]}${pos}${AA3[altAA]}` : null;
  for (const r of ev.clinvar.records) {
    if (ev.clinvar.self && r.uid === ev.clinvar.self.uid) continue;
    const m = /^p\.([A-Z][a-z]{2})(\d+)([A-Z][a-z]{2}|=|\*)$/.exec(r.hgvsp || '');
    if (!m || +m[2] !== pos) {
      out.others.push(r);
      continue;
    }
    if (mine && r.hgvsp === mine) out.ps1.push(r);
    else if (m[3] !== '=' && m[3] !== m[1]) out.pm5.push(r);
    else out.others.push(r);
  }
  return out;
}
