/* =====================================================================
   Adding variants to a patient: one sequence variant (HGVS, a position
   or an rsID), a copy-number variant, a list pasted in, or the variants
   of a VCF file, sorted the way an exome is triaged (rare, protein-
   altering, in the genes of the patient's panel).
   ===================================================================== */
import { h, esc, icon, toast, modal, pickFiles, fmt, fmtAF } from '../core.js';
import { go } from '../router.js';
import * as db from '../db.js';
import * as settings from '../settings.js';
import { field, select, btn, note, loading, table, checkbox } from '../ui.js';
import { ZYGOSITY, INHERITANCE, CNV_COPIES } from '../summary.js';
import { resolveInput, niceConsequence, rankOf } from '../annotate.js';
import { readQuery, readCNV, readRegion, parseVCF, zygosityOfGT, vcfKey, fmtRegion, fmtSize, normChrom } from '../parse.js';
import { vepMany } from '../api/ensembl.js';

const ASSEMBLIES = [['GRCh38', 'GRCh38 (hg38)'], ['GRCh37', 'GRCh37 (hg19)']];
const transcriptOf = (q) => {
  const m = /^(N[MR]_\d+(?:\.\d+)?|ENST\d+(?:\.\d+)?)[(:]/i.exec(String(q || '').trim());
  return m ? m[1] : null;
};

/** a new sequence-variant record */
export function seqRecord(pt, c, extra = {}) {
  return Object.assign({
    id: null, patientId: pt.id, kind: 'sequence', assembly: extra.assembly || 'GRCh38', input: c.input || extra.input || c.vcf,
    chrom: normChrom(c.chrom), pos: c.pos, ref: c.ref, alt: c.alt, transcript: transcriptOf(c.input || extra.input), gene: c.gene || null,
    hgvsc: c.hgvsc || null, consequence: c.consequence || null,
    zygosity: 'heterozygous', inheritance: 'unknown', classification: { criteria: {} }, calc: {}
  }, extra);
}
/** a new CNV record */
export function cnvRecord(pt, r, extra = {}) {
  const type = r.type || (r.copyNumber != null ? (r.copyNumber < 2 ? 'loss' : 'gain') : 'loss');
  return Object.assign({
    id: null, patientId: pt.id, kind: 'cnv', assembly: r.assembly || 'GRCh38', input: r.input || `${fmtRegion(r.chrom, r.start, r.end)} ${type === 'gain' ? 'dup' : 'del'}`,
    chrom: normChrom(r.chrom), start: r.start, end: r.end, cnvType: type, copyNumber: r.copyNumber != null ? r.copyNumber : type === 'gain' ? 3 : 1,
    inheritance: 'unknown', genesSummary: '', cnv: { items: {}, notes: {} }, classification: {}
  }, extra);
}
const sameSeq = (a, b) => a.kind !== 'cnv' && b.kind !== 'cnv' && (a.assembly || 'GRCh38') === (b.assembly || 'GRCh38') && vcfKey(a) === vcfKey(b);

/* ------------------------------------------------------------------ */
/** add one sequence variant: find it, choose the right one, then open its page */
export function addSequenceDialog(pt, existing = []) {
  const q = h('input', { type: 'text', placeholder: 'NM_000546.6:c.818G>A, 17-7673802-C-T or rs28934576', spellcheck: 'false', autocomplete: 'off' });
  const asm = select(ASSEMBLIES, settings.get('assembly'));
  const zyg = select(ZYGOSITY, 'heterozygous');
  const inh = select(INHERITANCE, 'unknown');
  const out = h('div.add-found', { 'aria-live': 'polite' });
  let found = null;
  let choice = 0;
  const find = async () => {
    const text = q.value.trim();
    found = null;
    out.innerHTML = '';
    if (!text) return;
    const r = readQuery(text);
    if (r.kind === 'cnv' || r.kind === 'region') {
      out.appendChild(note('warn', h('p', 'That’s a region, so add it as a copy-number variant instead.')));
      return;
    }
    out.appendChild(loading(`Finding ${text} on ${asm.value}…`));
    const res = await resolveInput(text, asm.value);
    out.innerHTML = '';
    if (!res.ok) {
      out.appendChild(note('bad', h('p', res.message)));
      return;
    }
    found = res;
    choice = 0;
    if (res.candidates.length > 1) out.appendChild(h('p.small', res.note || 'This matches more than one variant. Choose the one the test found.'));
    const list = h('div.add-cands', { role: 'radiogroup', 'aria-label': 'The variant' });
    res.candidates.forEach((c, i) => {
      const r2 = h('input', { type: 'radio', name: 'cand', value: String(i) });
      r2.checked = i === 0;
      r2.addEventListener('change', () => (choice = i));
      const dup = existing.find((x) => sameSeq(x, { chrom: c.chrom, pos: c.pos, ref: c.ref, alt: c.alt, assembly: asm.value }));
      list.appendChild(h('label.check.add-cand', r2, h('span', h('span.hgvs', `${asm.value} ${c.chrom}-${c.pos}-${c.ref}-${c.alt || '-'}`), c.hgvsc ? h('span.small.muted', `  ${c.hgvsc}`) : null, dup ? h('span.tag.warn', { style: { marginLeft: '6px' } }, 'already added') : null)));
    });
    out.appendChild(list);
  };
  q.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      find();
    }
  });
  const body = h('div.stack',
    h('div.add-q', field('Variant', q, 'You can enter a change on a transcript (c.), a change on a chromosome (g. or chromosome-position-reference-alternative), an rsID or a protein change.'), btn('Find it', find, { cls: 'primary', icon: 'search' })),
    out,
    h('div.fields', field('Genome build', asm), field('Zygosity', zyg), field('How the patient got it', inh, 'You can change this later on the variant’s page, for example when the parents are tested.')));
  modal(`Add a variant to Patient ${pt.id}`, body, {
    wide: true,
    actions: [['Cancel', null, 'ghost'], ['Add and open', async () => {
      if (!found) {
        await find();
        if (!found) return true;
        if (found.candidates.length > 1) return true;
      }
      const c = found.candidates[choice];
      const dup = existing.find((x) => sameSeq(x, { chrom: c.chrom, pos: c.pos, ref: c.ref, alt: c.alt, assembly: asm.value }));
      if (dup) {
        toast('This patient already has that variant, so it’s been opened for you.', null);
        go(`/patient/${pt.id}/variant/${dup.id}`);
        return;
      }
      const rec = seqRecord(pt, c, { assembly: asm.value, input: q.value.trim(), zygosity: zyg.value, inheritance: inh.value });
      const saved = await db.saveVariant(rec, `Variant added: ${rec.input}`);
      toast('Variant added. Its evidence is being gathered now.', 'ok');
      go(`/patient/${pt.id}/variant/${saved.id}`);
    }, 'primary']]
  });
}

/* ------------------------------------------------------------------ */
/** add a copy-number variant: a region, the type and copy number */
export function addCnvDialog(pt) {
  const region = h('input', { type: 'text', placeholder: 'chr22:18,912,231-21,465,672, or arr[GRCh38] 22q11.21(18912231_21465672)x1', spellcheck: 'false' });
  const asm = select(ASSEMBLIES, settings.get('assembly'));
  const type = select([['loss', 'Loss (deletion)'], ['gain', 'Gain (duplication)']], 'loss');
  const cn = select(CNV_COPIES.map(([v, l]) => [String(v), l]), '1');
  const inh = select(INHERITANCE, 'unknown');
  const msg = h('div', { 'aria-live': 'polite' });
  // the copy number follows the type, and the other way round
  type.addEventListener('change', () => {
    if (type.value === 'loss' && +cn.value > 2) cn.value = '1';
    if (type.value === 'gain' && +cn.value < 2) cn.value = '3';
  });
  cn.addEventListener('change', () => (type.value = +cn.value < 2 ? 'loss' : 'gain'));
  const read = () => {
    const t = region.value.trim();
    const c = readCNV(t);
    if (c) {
      if (c.assembly) asm.value = c.assembly;
      if (c.copyNumber != null) {
        cn.value = String(Math.min(5, c.copyNumber));
        type.value = c.copyNumber < 2 ? 'loss' : 'gain';
      } else if (c.type) type.value = c.type;
      return c;
    }
    return readRegion(t);
  };
  region.addEventListener('change', () => {
    const r = read();
    msg.innerHTML = '';
    if (r) msg.appendChild(h('p.small.muted', `${fmtRegion(r.chrom, r.start, r.end)}: ${fmtSize(r.end - r.start + 1)}`));
  });
  const body = h('div.stack',
    field('Region', region, 'Give the chromosome, start and end (1-based), or an ISCN array result.'),
    msg,
    h('div.fields', field('Genome build', asm), field('Type', type), field('Copy number', cn), field('How the patient got it', inh)));
  modal(`Add a copy-number variant to Patient ${pt.id}`, body, {
    wide: true,
    actions: [['Cancel', null, 'ghost'], ['Add and open', async () => {
      const r = read();
      if (!r) {
        msg.innerHTML = '';
        msg.appendChild(note('bad', h('p', 'Give the region as chromosome:start-end, e.g. chr22:18912231-21465672.')));
        return true;
      }
      if (r.end - r.start < 49) {
        msg.innerHTML = '';
        msg.appendChild(note('warn', h('p', 'That’s under 50 bases, so add it as a sequence variant instead.')));
        return true;
      }
      const rec = cnvRecord(pt, { chrom: r.chrom, start: r.start, end: r.end, type: type.value, copyNumber: +cn.value, assembly: asm.value, input: region.value.trim() }, { inheritance: inh.value });
      const saved = await db.saveVariant(rec, `Copy-number variant added: ${rec.input}`);
      toast('Copy-number variant added.', 'ok');
      go(`/patient/${pt.id}/variant/${saved.id}`);
    }, 'primary']]
  });
}

/* ------------------------------------------------------------------ */
/** several variants at once: one per line (HGVS, positions, rsIDs or CNV regions) */
export function pasteListDialog(pt, existing = [], onDone) {
  const ta = h('textarea', { rows: 8, spellcheck: 'false', placeholder: 'One variant per line, e.g.\nNM_000546.6:c.818G>A\n17-43124027-ACT-A\nrs113993960\ndel chr22:18912231-21465672' });
  const asm = select(ASSEMBLIES, settings.get('assembly'));
  const prog = h('div', { 'aria-live': 'polite' });
  modal(`Add a list of variants to Patient ${pt.id}`, h('div.stack', field('Variants', ta, 'Sequence variants are looked up in Ensembl one at a time. Any lines it can’t read are listed afterwards.'), field('Genome build', asm), prog), {
    wide: true,
    actions: [['Cancel', null, 'ghost'], ['Add them', async () => {
      const lines = ta.value.split(/\n/).map((s) => s.trim()).filter(Boolean).slice(0, 60);
      if (!lines.length) return true;
      const bad = [];
      let added = 0;
      const have = existing.slice();
      for (let i = 0; i < lines.length; i++) {
        prog.innerHTML = '';
        prog.appendChild(loading(`${i + 1} of ${lines.length}: ${lines[i]}`));
        const r = readQuery(lines[i]);
        if (r.kind === 'cnv') {
          const rec = cnvRecord(pt, Object.assign({ assembly: r.assembly || asm.value, input: lines[i] }, r));
          await db.saveVariant(rec, `Copy-number variant added: ${lines[i]}`);
          added++;
          continue;
        }
        const res = await resolveInput(lines[i], asm.value);
        if (!res.ok || !res.candidates.length) {
          bad.push([lines[i], res.message || 'not found']);
          continue;
        }
        const c = res.candidates[0];
        if (have.some((x) => sameSeq(x, { chrom: c.chrom, pos: c.pos, ref: c.ref, alt: c.alt, assembly: asm.value }))) {
          bad.push([lines[i], 'already added']);
          continue;
        }
        const rec = seqRecord(pt, c, { assembly: asm.value, input: lines[i] });
        if (res.candidates.length > 1) rec.notes = `“${lines[i]}” could be any of ${res.candidates.length} DNA changes. The first was added, so check that it’s the right one.`;
        have.push(await db.saveVariant(rec, `Variant added: ${lines[i]}`));
        added++;
      }
      prog.innerHTML = '';
      prog.appendChild(h('p', `${added} added.`));
      if (bad.length) {
        prog.appendChild(note('warn', h('p', 'These lines weren’t added:'), h('ul', bad.map(([l, why]) => h('li', h('span.hgvs', l), ': ', why)))));
        if (onDone) onDone();
        return true;
      }
      toast(`${added} ${added === 1 ? 'variant' : 'variants'} added.`, 'ok');
      if (onDone) onDone();
    }, 'primary']]
  });
}

/* ------------------------------------------------------------------ */
const PROTEIN_ALTERING = new Set(['transcript_ablation', 'splice_acceptor_variant', 'splice_donor_variant', 'stop_gained', 'frameshift_variant', 'stop_lost', 'start_lost', 'inframe_insertion', 'inframe_deletion', 'missense_variant', 'protein_altering_variant', 'splice_region_variant', 'splice_donor_5th_base_variant', 'splice_donor_region_variant', 'splice_polypyrimidine_tract_variant']);

/** read a VCF (or .vcf.gz) file: text */
async function readVcfFile(file) {
  if (/\.gz$|\.bgz$/i.test(file.name)) {
    if (typeof DecompressionStream === 'undefined') throw new Error('This browser can’t unpack .gz files, so unpack it on your computer and choose the .vcf file instead');
    // bgzip files are gzip members one after another; the stream reads them all
    return new Response(file.stream().pipeThrough(new DecompressionStream('gzip'))).text();
  }
  return file.text();
}

/** the variants of a VCF: choose the sample, annotate them, filter as for an exome, and add the chosen ones */
export async function importVcfDialog(pt, existing = [], onDone) {
  const [file] = await pickFiles('.vcf,.gz,.bgz,text/plain');
  if (!file) return;
  let parsed;
  try {
    const text = await readVcfFile(file);
    parsed = parseVCF(text);
  } catch (e) {
    toast('The file could not be read: ' + e.message, 'error', 8000);
    return;
  }
  if (!parsed.recs.length) {
    toast('There are no variants in that file. Check that it’s a VCF.', 'error');
    return;
  }
  const asm = select(ASSEMBLIES, parsed.assembly || settings.get('assembly'));
  const sample = select(parsed.samples.length ? parsed.samples.map((s, i) => [String(i), s]) : [['0', 'No genotypes in the file']], '0', { disabled: parsed.samples.length ? null : true });
  // how rare: 1% suits most triage; a recessive disorder's common alleles (e.g. CFTR F508del, 1.2% in gnomAD's exomes) need more
  const fRare = select([['', 'Any frequency'], ['0.001', 'Under 0.1% in gnomAD'], ['0.01', 'Under 1% in gnomAD'], ['0.05', 'Under 5% in gnomAD']], '0.01', { 'aria-label': 'Frequency in gnomAD' });
  const fProt = checkbox('Protein-altering or at a splice site', true);
  const panelGenes = new Set();
  const fPanel = checkbox('In the genes of the patient’s panel', false);
  const fCall = checkbox('Called in this person (not 0/0 or ./.)', true);
  // a VCF of sites only (no sample columns) has no genotypes to filter on: every variant is listed
  if (!parsed.samples.length) {
    fCall.box.checked = false;
    fCall.box.disabled = true;
  }
  const status = h('div', { 'aria-live': 'polite' });
  const listBox = h('div.vcf-list');
  let ann = null;
  const chosen = new Set();
  const MAX = 50;
  const recs = parsed.recs.slice(0, 5000);
  if (pt.test && pt.test.panel && pt.test.panel.id) {
    try {
      const { panelGenes: pg } = await import('../panels.js');
      const panel = await pg(pt.test.panel.id);
      // the green genes (diagnostic grade) and the amber ones
      for (const g of panel.genes || []) if (g.rating >= 2) panelGenes.add(g.symbol);
    } catch (e) {
      /* no panel genes: the filter stays off */
    }
  }
  if (!panelGenes.size) fPanel.box.disabled = true;
  const gtOf = (r) => (r.samples[+sample.value] || {}).GT || r.gt || '';
  const view = () => {
    let rows = recs.map((r) => {
      const key = `${r.chrom}-${r.pos}-${r.ref}-${r.alt}`;
      const a = ann ? ann.get(key) : null;
      const tc = a ? pickTx(a) : null;
      const freq = a ? afOf(a) : null;
      return { r, key, a, tc, gene: tc ? tc.gene_symbol : (r.info.GENE || r.info.Gene || r.info.SYMBOL || ''), cons: a ? a.most_severe_consequence : '', hgvsc: tc && tc.hgvsc ? tc.hgvsc.split(':')[1] : '', hgvsp: tc && tc.hgvsp ? tc.hgvsp.split(':')[1] : '', af: freq, zyg: zygosityOfGT(gtOf(r), r.chrom, pt.sex) };
    });
    rows = rows.filter((x) => {
      if (fCall.box.checked && (x.zyg === 'reference' || x.zyg === 'unknown')) return false;
      // the annotation's filters apply to annotated variants; one not yet annotated stays, marked as such
      if (x.a && fRare.value && x.af != null && x.af >= +fRare.value) return false;
      if (x.a && fProt.box.checked && !(x.a.transcript_consequences || []).some((t) => (t.consequence_terms || []).some((c) => PROTEIN_ALTERING.has(c)))) return false;
      if (fPanel.box.checked && panelGenes.size && !panelGenes.has(x.gene)) return false;
      return true;
    });
    rows.sort((a, b) => (a.a && b.a ? rankOf([a.cons]) - rankOf([b.cons]) : 0));
    listBox.innerHTML = '';
    status.innerHTML = '';
    status.appendChild(h('p.small', `${fmt(recs.length)} ${recs.length === 1 ? 'variant was' : 'variants were'} read from the file${parsed.recs.length > recs.length ? ` (the first ${fmt(recs.length)} of ${fmt(parsed.recs.length)})` : ''}, and ${fmt(rows.length)} ${rows.length === 1 ? 'is' : 'are'} shown. ${chosen.size} chosen (up to ${MAX}).`));
    const tbl = table([
      { key: 'pick', label: '', sort: false, fmt: (x) => {
        const b = h('input', { type: 'checkbox', 'aria-label': `Choose ${x.key}` });
        b.checked = chosen.has(x.key);
        b.addEventListener('change', () => {
          if (b.checked) {
            if (chosen.size >= MAX) {
              b.checked = false;
              toast(`You can choose up to ${MAX} variants at a time.`);
              return;
            }
            chosen.add(x.key);
          } else chosen.delete(x.key);
          status.querySelector('p').textContent = status.querySelector('p').textContent.replace(/\d+ chosen/, `${chosen.size} chosen`);
        });
        return b;
      } },
      { key: 'key', label: 'Variant', fmt: (x) => h('span.hgvs.small', x.key) },
      { key: 'gene', label: 'Gene', fmt: (x) => (x.gene ? h('i.gene', x.gene) : '–') },
      { key: 'cons', label: 'Consequence', fmt: (x) => (x.cons ? niceConsequence(x.cons) : ann ? '–' : h('span.faint', 'not yet annotated')) },
      { key: 'hgvs', label: 'Change', fmt: (x) => h('span.hgvs.small', [x.hgvsc, x.hgvsp].filter(Boolean).join(' ')) },
      { key: 'af', label: 'gnomAD', num: true, fmt: (x) => (x.a ? (x.af != null ? fmtAF(x.af) : 'absent') : '') },
      { key: 'zyg', label: 'Genotype', fmt: (x) => `${gtOf(x.r) || '–'} (${x.zyg})` },
      { key: 'qual', label: 'Quality', num: true, fmt: (x) => (x.r.qual != null ? fmt(x.r.qual, 0) : '–') + (x.r.filter && x.r.filter !== 'PASS' && x.r.filter !== '.' ? ` ${x.r.filter}` : '') }
    ], rows.slice(0, 400), { compact: true, caption: 'Variants in the file', empty: 'No variants pass the filters. Try loosening them.' });
    listBox.appendChild(tbl);
    if (rows.length > 400) listBox.appendChild(h('p.small.muted', `Only the first 400 of ${fmt(rows.length)} are shown. Narrow the filters to shorten the list.`));
  };
  const annotateBtn = btn('Annotate with Ensembl VEP', async () => {
    annotateBtn.disabled = true;
    try {
      // those the filters let through and not yet annotated (unticking "Called" later annotates the rest)
      const todo = recs.filter((r) => (!fCall.box.checked || !['reference', 'unknown'].includes(zygosityOfGT(gtOf(r), r.chrom, pt.sex))) && !(ann && ann.has(`${r.chrom}-${r.pos}-${r.ref}-${r.alt}`))).slice(0, 2000);
      const got = await vepMany(todo, asm.value, (i, n) => {
        status.innerHTML = '';
        status.appendChild(loading(`Annotating ${i} of ${n}…`));
      });
      ann = ann || new Map();
      for (const [k, a] of got) ann.set(k, a);
      view();
    } catch (e) {
      status.innerHTML = '';
      status.appendChild(note('bad', h('p', `Ensembl didn’t answer: ${e.message}. Try again in a moment.`)));
    } finally {
      annotateBtn.disabled = false;
    }
  }, { cls: 'primary', icon: 'sparkle', title: 'Looks up genes, consequences and gnomAD frequencies for up to 2,000 variants, sending them to Ensembl in batches of 100' });
  [fRare, fProt.box, fPanel.box, fCall.box, sample].forEach((el) => el.addEventListener('change', view));
  const body = h('div.stack',
    h('p', `${file.name} has ${fmt(parsed.recs.length)} variants${parsed.samples.length ? ` and ${parsed.samples.length} ${parsed.samples.length === 1 ? 'sample' : 'samples'}` : ''}${parsed.assembly ? `. Its header gives the build as ${parsed.assembly}` : ''}.`),
    h('div.fields', field('Genome build', asm), field('Sample (the patient)', sample)),
    h('div.vcf-filters', annotateBtn, fCall.el, h('label.vcf-rare', h('span.visually-hidden', 'Frequency'), fRare), fProt.el, fPanel.el),
    h('p.small.muted', 'Annotating sends only the variants’ positions to Ensembl. The frequency and consequence filters work once the variants are annotated. A real exome has tens of thousands of variants, and these filters are only the first steps of triage. The frequency is the higher of gnomAD’s exome and genome frequencies, with all groups taken together, so a variant that’s common in one group can still pass.'),
    status, listBox);
  view();
  modal(`Import variants from a VCF for Patient ${pt.id}`, body, {
    wide: true,
    sticky: true,
    actions: [['Cancel', null, 'ghost'], ['Add the chosen variants', async () => {
      if (!chosen.size) {
        toast('Tick the variants you want to add first.');
        return true;
      }
      let added = 0;
      for (const key of chosen) {
        const r = recs.find((x) => `${x.chrom}-${x.pos}-${x.ref}-${x.alt}` === key);
        if (!r) continue;
        if (existing.some((x) => sameSeq(x, { chrom: r.chrom, pos: r.pos, ref: r.ref, alt: r.alt, assembly: asm.value }))) continue;
        const a = ann ? ann.get(key) : null;
        const tc = a ? pickTx(a) : null;
        const zyg = zygosityOfGT(gtOf(r), r.chrom, pt.sex);
        const rec = seqRecord(pt, { chrom: r.chrom, pos: r.pos, ref: r.ref, alt: r.alt, vcf: key, input: key, gene: tc ? tc.gene_symbol : null, consequence: a ? a.most_severe_consequence : null, hgvsc: tc && tc.hgvsc ? tc.hgvsc : null }, {
          assembly: asm.value, input: key, zygosity: zyg === 'reference' || zyg === 'unknown' ? 'unknown' : zyg,
          vaf: vafOf((r.samples[+sample.value] || {})), source: `VCF: ${file.name}`, transcript: tc && tc.mane_select ? tc.mane_select : null
        });
        await db.saveVariant(rec, `Variant added from ${file.name}`);
        added++;
      }
      toast(`${added} ${added === 1 ? 'variant' : 'variants'} added from ${file.name}.`, 'ok');
      if (onDone) onDone();
    }, 'primary']]
  });
}

/** VEP's transcript to describe a variant by: MANE Select, else canonical, else the most severe */
function pickTx(a) {
  const tcs = a.transcript_consequences || [];
  return tcs.find((t) => t.mane_select) || tcs.find((t) => t.canonical) || tcs.slice().sort((x, y) => rankOf(x.consequence_terms) - rankOf(y.consequence_terms))[0] || null;
}
/** the gnomAD frequency VEP gives (the higher of exomes and genomes), or null if the variant isn't in gnomAD */
function afOf(a) {
  let best = null;
  for (const cv of a.colocated_variants || []) {
    for (const fr of Object.values(cv.frequencies || {})) {
      for (const k of ['gnomade', 'gnomadg']) if (fr[k] != null) best = Math.max(best || 0, fr[k]);
    }
  }
  return best;
}
/** the variant allele fraction from AD (ref,alt) or AF/VAF fields */
function vafOf(s) {
  if (s.AD) {
    const n = s.AD.split(',').map(Number);
    const tot = n.reduce((x, y) => x + (y || 0), 0);
    if (tot > 0 && n.length > 1) return Math.round((n[1] / tot) * 100);
  }
  const v = +(s.VAF || s.AF);
  return isNaN(v) ? null : Math.round(v * (v <= 1 ? 100 : 1));
}
export { esc, icon };
