/* =====================================================================
   Reading what people type: variants in their usual forms, genomic
   regions, genes, HPO terms and patient numbers.
   ===================================================================== */

const CHROMS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12', '13', '14', '15', '16', '17', '18', '19', '20', '21', '22', 'X', 'Y', 'MT'];
export const chromOK = (c) => CHROMS.includes(normChrom(c));
export function normChrom(c) {
  let s = String(c || '').trim().replace(/^chr/i, '').toUpperCase();
  if (s === 'M') s = 'MT';
  if (s === '23') s = 'X';
  if (s === '24') s = 'Y';
  return s;
}
export const chromOrder = (c) => {
  const i = CHROMS.indexOf(normChrom(c));
  return i < 0 ? 99 : i;
};

/* RefSeq chromosome accessions (GRCh38 and GRCh37) */
export const NC = {
  GRCh38: { 1: 'NC_000001.11', 2: 'NC_000002.12', 3: 'NC_000003.12', 4: 'NC_000004.12', 5: 'NC_000005.10', 6: 'NC_000006.12', 7: 'NC_000007.14', 8: 'NC_000008.11', 9: 'NC_000009.12', 10: 'NC_000010.11', 11: 'NC_000011.10', 12: 'NC_000012.12', 13: 'NC_000013.11', 14: 'NC_000014.9', 15: 'NC_000015.10', 16: 'NC_000016.10', 17: 'NC_000017.11', 18: 'NC_000018.10', 19: 'NC_000019.10', 20: 'NC_000020.11', 21: 'NC_000021.9', 22: 'NC_000022.11', X: 'NC_000023.11', Y: 'NC_000024.10', MT: 'NC_012920.1' },
  GRCh37: { 1: 'NC_000001.10', 2: 'NC_000002.11', 3: 'NC_000003.11', 4: 'NC_000004.11', 5: 'NC_000005.9', 6: 'NC_000006.11', 7: 'NC_000007.13', 8: 'NC_000008.10', 9: 'NC_000009.11', 10: 'NC_000010.10', 11: 'NC_000011.9', 12: 'NC_000012.11', 13: 'NC_000013.10', 14: 'NC_000014.8', 15: 'NC_000015.9', 16: 'NC_000016.9', 17: 'NC_000017.10', 18: 'NC_000018.9', 19: 'NC_000019.9', 20: 'NC_000020.10', 21: 'NC_000021.8', 22: 'NC_000022.10', X: 'NC_000023.10', Y: 'NC_000024.9', MT: 'NC_012920.1' }
};
export function chromOfNC(acc) {
  const m = /^NC_0000(\d\d)\.(\d+)$/i.exec(String(acc || ''));
  if (!m) return null;
  const n = +m[1];
  const chrom = n === 23 ? 'X' : n === 24 ? 'Y' : String(n);
  const asm = NC.GRCh38[chrom] === acc.toUpperCase() ? 'GRCh38' : NC.GRCh37[chrom] === acc.toUpperCase() ? 'GRCh37' : null;
  return { chrom, assembly: asm };
}

const num = (s) => parseInt(String(s).replace(/[,\s]/g, ''), 10);

/**
 * What a piece of text is. Returns one of
 *  { kind: 'vcf', chrom, pos, ref, alt }            17-7673802-C-T, chr17:7673802 C>T, 17 7673802 C T
 *  { kind: 'hgvs', hgvs, ref: 'transcript'|'genomic'|'gene'|'protein' }  NM_000546.6:c.818G>A, BRCA1:c.68_69del
 *  { kind: 'rsid', id }
 *  { kind: 'region', chrom, start, end }            chr22:18,900,000-21,500,000
 *  { kind: 'cnv', chrom, start, end, type }         del 22:18900000-21500000, dup(22)(q11.21) is not read
 *  { kind: 'hpo', id }
 *  { kind: 'patient', id }
 *  { kind: 'gene', symbol }                          a word that could be a gene symbol
 *  { kind: 'text', text }
 */
export function readQuery(q) {
  const s = String(q || '').trim().replace(/\s+/g, ' ');
  if (!s) return { kind: 'empty' };
  let m;
  if ((m = /^(?:patient\s*)?#?(\d{4,7})$/i.exec(s))) return { kind: 'patient', id: m[1] };
  if ((m = /^HP[:_]?(\d{7})$/i.exec(s))) return { kind: 'hpo', id: 'HP:' + m[1] };
  if ((m = /^rs(\d+)$/i.exec(s))) return { kind: 'rsid', id: 'rs' + m[1] };
  const cnv = readCNV(s);
  if (cnv) return cnv;
  const v = readVCFish(s);
  if (v) return v;
  const hg = readHGVS(s);
  if (hg) return hg;
  const r = readRegion(s);
  if (r) return Object.assign({ kind: 'region' }, r);
  if (/^[A-Za-z][A-Za-z0-9-]{0,15}$/.test(s) && !/^(the|and|of)$/i.test(s)) return { kind: 'gene', symbol: s.toUpperCase().replace(/^C(\d+)ORF(\d+)$/, 'C$1orf$2') };
  return { kind: 'text', text: s };
}

/** chromosome, position, reference and alternative alleles, in most of the ways people write them */
export function readVCFish(s) {
  const t = String(s || '').trim();
  let m = /^(?:chr)?([0-9]{1,2}|X|Y|MT?)\s*[-:_\s]\s*([\d,]+)\s*[-:_\s]\s*([ACGTN]+)\s*(?:[-:_\s>/]|\s*>\s*)\s*([ACGTN]+|-|\*)$/i.exec(t);
  if (!m) m = /^(?:chr)?([0-9]{1,2}|X|Y|MT?)\s*:\s*g\.\s*([\d,]+)\s*([ACGTN])\s*>\s*([ACGTN])$/i.exec(t);
  if (!m) return null;
  const chrom = normChrom(m[1]);
  if (!chromOK(chrom)) return null;
  return { kind: 'vcf', chrom, pos: num(m[2]), ref: m[3].toUpperCase(), alt: m[4] === '-' ? '' : m[4].toUpperCase() };
}

/** HGVS: on a transcript, a chromosome, a gene symbol, or a protein */
export function readHGVS(s) {
  let t = String(s || '').trim().replace(/\s*:\s*/g, ':');
  // "BRCA1 c.68_69del" → "BRCA1:c.68_69del"
  t = t.replace(/^([A-Za-z0-9_.()-]+)\s+([cgnmrp]\.)/, '$1:$2');
  const m = /^([A-Za-z0-9_.-]+)(\([A-Za-z0-9_.-]+\))?:([cgnmrp])\.(.+)$/.exec(t);
  if (!m) return null;
  let acc = m[1];
  const inner = m[2] ? m[2].slice(1, -1) : null;
  const type = m[3];
  const body = m[4].replace(/\s+/g, '');
  // NM_000546.6(TP53):c.818G>A – keep the transcript; TP53(NM_000546.6):c. – the same
  let gene = null;
  if (inner && /^(N[MRCGTP]_|X[MR]_|ENS[TGP]|LRG_)/i.test(inner)) {
    gene = acc;
    acc = inner;
  } else if (inner) gene = inner;
  const isTx = /^(N[MR]_|X[MR]_|ENST|LRG_\d+t)/i.test(acc);
  const isNC = /^NC_/i.test(acc);
  const isProt = /^(NP_|XP_|ENSP)/i.test(acc) || type === 'p';
  const isGene = !isTx && !isNC && !/^(NP_|XP_|ENSP)/i.test(acc) && /^[A-Za-z][A-Za-z0-9-]*$/.test(acc);
  if (isNC && type !== 'g' && type !== 'm') return null;
  const hgvs = `${acc}:${type}.${body}`;
  return {
    kind: 'hgvs',
    hgvs,
    accession: acc,
    gene: gene || (isGene ? acc.toUpperCase() : null),
    type,
    ref: isProt ? 'protein' : isNC ? 'genomic' : isTx ? 'transcript' : isGene ? 'gene' : 'other'
  };
}

/** chr22:18,900,000-21,500,000 (or 22:18900000..21500000) */
export function readRegion(s) {
  const m = /^(?:chr)?([0-9]{1,2}|X|Y|MT?)\s*:\s*([\d,]+)\s*(?:-|–|\.\.)\s*([\d,]+)$/i.exec(String(s || '').trim());
  if (!m) return null;
  const chrom = normChrom(m[1]);
  if (!chromOK(chrom)) return null;
  let start = num(m[2]), end = num(m[3]);
  if (end < start) [start, end] = [end, start];
  return { chrom, start, end };
}

/** a copy-number change: "del 22:18900000-21500000", "dup chr7:72,700,000-74,100,000",
    "22:18900000-21500000 loss", "arr[GRCh38] 22q11.21(18912231_21465672)x1" */
export function readCNV(s) {
  const t = String(s || '').trim();
  let m = /^(del(?:etion)?|dup(?:lication)?|loss|gain|cnv)\s+(.+)$/i.exec(t) || /^(.+?)\s+(del(?:etion)?|dup(?:lication)?|loss|gain)$/i.exec(t);
  if (m) {
    const word = /^(del|dup|loss|gain|cnv)/i.test(m[1]) ? m[1] : m[2];
    const where = /^(del|dup|loss|gain|cnv)/i.test(m[1]) ? m[2] : m[1];
    const r = readRegion(where);
    if (r) return Object.assign({ kind: 'cnv', type: /^(del|loss)/i.test(word) ? 'loss' : /^(dup|gain)/i.test(word) ? 'gain' : null }, r);
  }
  m = /^arr\s*(?:\[(GRCh3[78]|hg1[89]|hg38)\])?\s*(\d{1,2}|X|Y)([pq][\d.]+(?:[pq][\d.]+)?)?\s*\(\s*([\d,]+)\s*[_-]\s*([\d,]+)\s*\)\s*x\s*(\d)/i.exec(t);
  if (m) {
    const cn = +m[6];
    const chrom = normChrom(m[2]);
    const assembly = m[1] ? (/38/.test(m[1]) ? 'GRCh38' : 'GRCh37') : null;
    return { kind: 'cnv', chrom, start: num(m[4]), end: num(m[5]), copyNumber: cn, type: cn < 2 ? 'loss' : cn > 2 ? 'gain' : null, assembly, iscn: t };
  }
  return null;
}

export const fmtRegion = (chrom, start, end) => `chr${normChrom(chrom)}:${Number(start).toLocaleString('en-GB')}-${Number(end).toLocaleString('en-GB')}`;
export const plainRegion = (chrom, start, end) => `${normChrom(chrom)}:${start}-${end}`;
export const fmtSize = (bp) => (bp >= 1e6 ? (bp / 1e6).toFixed(bp >= 1e7 ? 1 : 2) + ' Mb' : bp >= 1e3 ? (bp / 1e3).toFixed(bp >= 1e4 ? 0 : 1) + ' kb' : bp + ' bp');
export const vcfKey = (v) => `${normChrom(v.chrom)}-${v.pos}-${v.ref}-${v.alt || '-'}`;

/** a VCF file: its records, with each sample's genotype */
export function parseVCF(text) {
  const recs = [];
  let samples = [];
  const meta = [];
  for (const line of String(text || '').split(/\r?\n/)) {
    if (!line) continue;
    if (line.startsWith('##')) {
      meta.push(line);
      continue;
    }
    if (line.startsWith('#CHROM')) {
      samples = line.split('\t').slice(9);
      continue;
    }
    const f = line.split('\t');
    if (f.length < 8) continue;
    const info = {};
    for (const kv of f[7].split(';')) {
      const i = kv.indexOf('=');
      if (i < 0) info[kv] = true;
      else info[kv.slice(0, i)] = kv.slice(i + 1);
    }
    const fmt = (f[8] || '').split(':');
    const sampleData = samples.map((_, si) => {
      const o = {};
      (f[9 + si] || '').split(':').forEach((v, i) => (o[fmt[i]] = v));
      return o;
    });
    f[4].split(',').forEach((alt, ai) => {
      if (alt === '*' || alt === '.') return;
      recs.push({
        chrom: normChrom(f[0]), pos: +f[1], id: f[2], ref: f[3].toUpperCase(), alt: alt.toUpperCase(), altIndex: ai + 1,
        qual: f[5] === '.' ? null : +f[5], filter: f[6], info, samples: sampleData,
        gt: sampleData[0] ? sampleData[0].GT || '' : ''
      });
    });
  }
  const build = meta.find((l) => /##reference=|##contig=.*assembly/i.test(l)) || '';
  const assembly = /GRCh37|hg19|b37|hs37/i.test(build) ? 'GRCh37' : /GRCh38|hg38/i.test(build) ? 'GRCh38' : null;
  return { recs, samples, meta, assembly };
}

/** het / hom / hemi from a VCF genotype and the person's sex and chromosome */
export function zygosityOfGT(gt, chrom, sex) {
  const a = String(gt || '').split(/[/|]/);
  if (a.includes('.') || !a[0]) return 'unknown';
  if (a.length === 1) return a[0] === '0' ? 'reference' : 'hemizygous';
  if (a[0] === a[1]) {
    if (a[0] === '0') return 'reference';
    if (sex === 'male' && /^(X|Y)$/.test(normChrom(chrom))) return 'hemizygous';
    return 'homozygous';
  }
  return 'heterozygous';
}
