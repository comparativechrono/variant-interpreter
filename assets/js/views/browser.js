/* =====================================================================
   The genome browser page: any region, on either build, with the
   tracks of the clinical databases, and (if chosen) one patient's
   variants coloured by their classification.
     #/browser?locus=chr17:7661779-7687538&assembly=GRCh38&patient=1001
   ===================================================================== */
import { h, toast } from '../core.js';
import { go, link } from '../router.js';
import * as db from '../db.js';
import * as settings from '../settings.js';
import { page, pageHead, select, field, note, btn } from '../ui.js';
import { genomeBrowser, variantTrack, trackPicker, DEFAULT_TRACKS, trackConfig, TRACKS } from '../widgets/genome.js';
import { summariseVariant } from '../summary.js';
import { readQuery } from '../parse.js';

const CLS_WORD = { p: 'Pathogenic', lp: 'Likely pathogenic', vus: 'Uncertain significance', lb: 'Likely benign', b: 'Benign' };

/** a patient's variants on one build, as features for the browser */
export function patientFeatures(variants, assembly) {
  return variants.filter((v) => (v.assembly || 'GRCh38') === assembly && v.chrom).map((v) => {
    const s = summariseVariant(v);
    const start = v.kind === 'cnv' ? v.start : v.pos;
    const end = v.kind === 'cnv' ? v.end : v.pos + Math.max(0, (v.ref || 'N').length - 1);
    return { chrom: v.chrom, start, end, name: (s.gene ? s.gene + ' ' : '') + s.short, cls: s.cls, clsText: s.cls ? CLS_WORD[s.cls] + (s.final ? ' (signed)' : ' (so far)') : 'Not classified' };
  });
}

export async function render(root, params, query) {
  const asm = query.assembly === 'GRCh37' ? 'GRCh37' : query.assembly === 'GRCh38' ? 'GRCh38' : settings.get('assembly');
  const pid = query.patient || '';
  const ps = await db.listPatients();
  const p = page('wide');
  root.appendChild(p);
  p.appendChild(pageHead({
    title: 'Genome browser',
    lede: 'Look at any region with ClinVar, ClinGen’s dosage curations, population CNVs and genes. Type a gene, a position or a region in the browser’s own box, or show a patient’s variants.'
  }));
  const asmSel = select([['GRCh38', 'GRCh38 (hg38)'], ['GRCh37', 'GRCh37 (hg19)']], asm);
  const ptSel = select([['', 'None']].concat(ps.map((x) => [x.id, `Patient ${x.id}${x.ref ? ' – ' + x.ref : ''}`])), pid);
  const chosen = (() => {
    try {
      const s = JSON.parse(localStorage.getItem('varint:browser-tracks') || 'null');
      return Array.isArray(s) && s.length ? s.filter((k) => TRACKS[k]) : DEFAULT_TRACKS.slice();
    } catch (e) {
      return DEFAULT_TRACKS.slice();
    }
  })();
  const remember = () => {
    try {
      localStorage.setItem('varint:browser-tracks', JSON.stringify(chosen));
    } catch (e) {
      /* the browser won't keep it: no matter */
    }
  };
  const holder = h('div.igv-holder');
  let handle = null;
  const reopen = (keepLocus) => {
    const q = new URLSearchParams();
    let loc = query.locus || '';
    try {
      if (handle && handle.browser) loc = handle.browser.currentLoci().join(' ');
    } catch (e) {
      /* not ready */
    }
    if (keepLocus && loc) q.set('locus', loc);
    q.set('assembly', asmSel.value);
    if (ptSel.value) q.set('patient', ptSel.value);
    go('/browser?' + q.toString());
  };
  // a position on one build is not the same place on the other: start afresh (at the patient's first variant, or TP53)
  asmSel.addEventListener('change', () => reopen(false));
  ptSel.addEventListener('change', () => reopen(true));
  const picker = trackPicker(chosen, async (k, on) => {
    if (on && !chosen.includes(k)) chosen.push(k);
    if (!on) chosen.splice(chosen.indexOf(k), 1);
    remember();
    if (!handle) return;
    const b = await handle.ready.catch(() => null);
    if (!b) return;
    if (on) handle.addTrack(trackConfig(k, asmSel.value)).catch((e) => toast(`The track “${TRACKS[k].name}” couldn’t be read: ${e.message}`, 'error'));
    else b.removeTrackByName(TRACKS[k].name);
  });
  p.appendChild(h('div.browser-bar', field('Genome build', asmSel), field('Show a patient’s variants', ptSel), picker));
  p.appendChild(holder);
  // where to start
  let locus = query.locus || '';
  let extra = [];
  if (pid) {
    const pt = ps.find((x) => x.id === pid);
    const vs = pt ? await db.variantsOf(pid) : [];
    const feats = patientFeatures(vs, asmSel.value);
    if (feats.length) {
      extra = [variantTrack(`Patient ${pid}`, feats)];
      if (!locus) {
        const f = feats[0];
        const pad = Math.max(60, Math.round((f.end - f.start) * 0.15));
        locus = `chr${f.chrom}:${Math.max(1, f.start - pad)}-${f.end + pad}`;
      }
    } else if (pt) p.insertBefore(note('', h('p', `Patient ${pid} has no variants on ${asmSel.value} yet.`)), holder);
  }
  if (locus) {
    // a gene name or region typed into the address: igv.js takes either
    const r = readQuery(locus.replace(/,/g, ''));
    if (r.kind === 'region' || r.kind === 'cnv') locus = `chr${r.chrom}:${r.start}-${r.end}`;
  }
  handle = genomeBrowser(holder, { assembly: asmSel.value, locus: locus || (asmSel.value === 'GRCh37' ? 'chr17:7565097-7590856' : 'chr17:7661779-7687538'), tracks: chosen, extra });
  p.appendChild(h('p.small.muted', 'Point at or click a feature to see its details. The tracks come from UCSC’s copy of its files on Amazon, and they include ClinVar (NCBI), ClinGen’s dosage sensitivity and gene–disease validity curations, the Database of Genomic Variants’ gold standard set and NCBI’s RefSeq Select genes. You can read about the ', h('a', { href: link('/about') }, 'sources and licences'), '.'));
  return () => handle && handle.destroy();
}
