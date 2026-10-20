/* =====================================================================
   The genome browser: igv.js (assets/vendor/igv, from the Bioinformatics
   workbench), with the reference sequence and the tracks a variant
   scientist looks at, read from UCSC's copy of its files on Amazon
   (genome-browser.s3.us-east-1.amazonaws.com: the same files as
   hgdownload.soe.ucsc.edu, open to any page, read a piece at a time).

     genomeBrowser(holder, { assembly, locus, tracks, extra, roi })
       → { browser, goTo(locus), addTrack(config), setFeatures(name, features), destroy() }

   tracks: keys of TRACKS (below); extra: igv.js track configurations,
   such as a patient's variants made with variantTrack(). roi: regions to
   shade, [{ chrom, start, end, colour, name }] (1-based, inclusive).
   ===================================================================== */
import { h, esc } from '../core.js';
import { CFG } from '../settings.js';
import { normChrom } from '../parse.js';

let loading = null;
/** igv.js, loaded the first time a browser is needed */
export function loadIgv() {
  if (window.igv) return Promise.resolve(window.igv);
  if (!loading) {
    loading = new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = 'assets/vendor/igv/igv.min.js';
      s.onload = () => (window.igv ? resolve(window.igv) : reject(new Error('igv.js loaded but didn’t start')));
      s.onerror = () => {
        loading = null;
        reject(new Error('its program (igv.js) couldn’t be loaded'));
      };
      document.head.appendChild(s);
    });
  }
  return loading;
}

/** where UCSC's files are read from: the site's setting, else UCSC's copy on Amazon */
export function ucscBase() {
  const u = CFG.services && CFG.services.ucsc;
  const list = Array.isArray(u) ? u : u ? [u] : [];
  const pick = list.find((x) => /amazonaws\.com/.test(x)) || list[0] || 'https://genome-browser.s3.us-east-1.amazonaws.com';
  return pick.replace(/\/$/, '');
}
export const UCSC_DB = { GRCh38: 'hg38', GRCh37: 'hg19' };

/** the reference genome, as igv.js takes it */
export function reference(assembly) {
  const db = UCSC_DB[assembly] || 'hg38';
  const B = ucscBase();
  return {
    id: db,
    name: assembly === 'GRCh37' ? 'GRCh37 (hg19)' : 'GRCh38 (hg38)',
    twoBitURL: `${B}/goldenPath/${db}/bigZips/${db}.2bit`,
    chromSizesURL: `${B}/goldenPath/${db}/bigZips/${db}.chrom.sizes`,
    cytobandURL: `${B}/goldenPath/${db}/database/cytoBandIdeo.txt.gz`,
    chromosomeOrder: 'chr1,chr2,chr3,chr4,chr5,chr6,chr7,chr8,chr9,chr10,chr11,chr12,chr13,chr14,chr15,chr16,chr17,chr18,chr19,chr20,chr21,chr22,chrX,chrY,chrM'
  };
}

/* the tracks on offer. Each: a name, what it shows (for the track list), and its igv.js configuration on a build */
export const TRACKS = {
  genes: {
    name: 'Genes (RefSeq Select)',
    about: 'One transcript for each protein-coding gene, from NCBI’s RefSeq Select. Where a gene has a MANE Select transcript, that’s the one shown.',
    cfg: (db, B) => ({ format: 'refgene', url: `${B}/goldenPath/${db}/database/ncbiRefSeqSelect.txt.gz`, displayMode: 'EXPANDED', height: 100, visibilityWindow: -1, searchable: true })
  },
  clinvar: {
    name: 'ClinVar: short variants',
    about: 'ClinVar’s classifications of short variants, coloured by class: red for pathogenic, blue for benign and grey for uncertain. They appear when you zoom in to 600 kb or less.',
    cfg: (db, B) => ({ format: 'bigbed', url: `${B}/gbdb/${db}/bbi/clinvar/clinvarMain.bb`, displayMode: 'SQUISHED', visibilityWindow: 600000, height: 80 })
  },
  clinvarCnv: {
    name: 'ClinVar: copy-number variants',
    about: 'Gains and losses in ClinVar, with their classifications. They appear when you zoom in to 30 Mb or less.',
    cfg: (db, B) => ({ format: 'bigbed', url: `${B}/gbdb/${db}/bbi/clinvar/clinvarCnv.bb`, displayMode: 'SQUISHED', visibilityWindow: 30000000, height: 90 })
  },
  haplo: {
    name: 'ClinGen: haploinsufficiency',
    about: 'ClinGen’s haploinsufficiency curations of genes and regions. A score of 3 (sufficient evidence) means an established haploinsufficient gene or region, and a score of 40 means dosage sensitivity is unlikely.',
    cfg: (db, B) => ({ format: 'bigbed', url: `${B}/gbdb/${db}/bbi/clinGen/clinGenHaplo.bb`, displayMode: 'EXPANDED', height: 60 })
  },
  triplo: {
    name: 'ClinGen: triplosensitivity',
    about: 'ClinGen’s curations of triplosensitivity, which is sensitivity to a gain of the gene or region. A score of 3 means an established triplosensitive gene or region.',
    cfg: (db, B) => ({ format: 'bigbed', url: `${B}/gbdb/${db}/bbi/clinGen/clinGenTriplo.bb`, displayMode: 'EXPANDED', height: 50 })
  },
  validity: {
    name: 'ClinGen: gene–disease validity',
    about: 'How strong the evidence is that each gene causes a disease, with ratings such as Definitive, Strong, Moderate and Limited.',
    cfg: (db, B) => ({ format: 'bigbed', url: `${B}/gbdb/${db}/bbi/clinGen/clinGenGeneDisease.bb`, displayMode: 'EXPANDED', height: 50 })
  },
  dgvGold: {
    name: 'DGV gold standard CNVs',
    about: 'Copy-number variants seen in people without a known disorder, merged across studies by the Database of Genomic Variants into its gold standard set. Losses are red and gains are blue.',
    cfg: (db, B) => ({ format: 'bigbed', url: `${B}/gbdb/${db}/dgv/dgvGold.bb`, displayMode: 'SQUISHED', visibilityWindow: 30000000, height: 70 })
  }
};
export const DEFAULT_TRACKS = ['genes', 'clinvar', 'clinvarCnv', 'haplo', 'triplo'];

/** a track configuration for a TRACKS key on a build */
export function trackConfig(key, assembly) {
  const t = TRACKS[key];
  if (!t) return null;
  const db = UCSC_DB[assembly] || 'hg38';
  return Object.assign({ name: t.name, type: 'annotation', order: Object.keys(TRACKS).indexOf(key) + 10, removable: true }, t.cfg(db, ucscBase()));
}

/* the colours of the five classes (as the page's), for variants drawn on the browser */
export const CLASS_COLOURS = { p: '#9e1b32', lp: '#c4432f', vus: '#8a6d1f', lb: '#2f6fa8', b: '#1e4f86', none: '#566476' };

/**
 * a track of variants that igv.js draws from memory: [{ chrom, start, end, name, cls, url? }]
 * (start and end 1-based and inclusive, as the rest of the site has them)
 */
export function variantTrack(name, variants, opts = {}) {
  const features = variants.filter((v) => v && v.chrom && v.start).map((v) => ({
    chr: 'chr' + normChrom(v.chrom),
    start: Math.max(0, v.start - 1),
    end: Math.max(v.start, v.end || v.start),
    name: v.name || '',
    color: CLASS_COLOURS[v.cls || 'none'] || CLASS_COLOURS.none,
    // igv.js shows these in the pop-up for the feature
    Class: v.clsText || '',
    Note: v.note || ''
  }));
  // (no track colour: igv.js would use it in place of each feature's own)
  return Object.assign({ name, type: 'annotation', format: 'bed', features, displayMode: 'EXPANDED', height: Math.min(140, 30 + features.length * 12), order: 1, removable: false }, opts);
}

/** "chr17:7,673,700-7,673,900" for igv.js, from chrom/start/end (1-based); padded by pad bases each side */
export function locusOf(chrom, start, end, pad = 0) {
  const s = Math.max(1, Math.round(start - pad));
  const e = Math.round((end || start) + pad);
  return `chr${normChrom(chrom)}:${s}-${e}`;
}

/**
 * make a browser in holder. Returns a handle; its .ready is a promise of the browser.
 * If igv.js or the genome can't be loaded, holder says so (and .ready rejects).
 */
export function genomeBrowser(holder, opts = {}) {
  const assembly = opts.assembly || 'GRCh38';
  const host = h('div.igv-host', { role: 'region', 'aria-label': `Genome browser, ${assembly}` });
  const status = h('p.small.muted.igv-status', { 'aria-live': 'polite' }, 'Opening the genome browser…');
  holder.append(status, host);
  const handle = { browser: null, assembly };
  // igv.js takes regions of interest as sets, each with its colour and features
  const roi = (opts.roi || []).filter((r) => r && r.chrom).map((r, i) => ({
    name: r.name || `Region ${i + 1}`,
    color: r.colour || 'rgba(31, 111, 126, 0.12)',
    features: [{ chr: 'chr' + normChrom(r.chrom), start: Math.max(0, r.start - 1), end: r.end || r.start, name: r.name || '' }]
  }));
  handle.ready = (async () => {
    const igv = await loadIgv();
    const tracks = (opts.tracks || DEFAULT_TRACKS).map((k) => trackConfig(k, assembly)).filter(Boolean).concat(opts.extra || []);
    const cfg = {
      reference: reference(assembly),
      locus: opts.locus || 'chr17:7,661,779-7,687,538',
      tracks: [],
      roi,
      showSVGButton: true,
      showCenterGuide: !!opts.centreGuide,
      showCursorGuide: false,
      showTrackLabelButton: true,
      showNavigation: true,
      loadDefaultGenomes: false,
      promisified: true
    };
    const browser = await igv.createBrowser(host, cfg);
    handle.browser = browser;
    status.textContent = '';
    // each track on its own, so that one that can't be read doesn't stop the rest
    const failed = [];
    for (const t of tracks) {
      try {
        await browser.loadTrack(t);
      } catch (e) {
        failed.push(t.name);
      }
    }
    if (failed.length) status.textContent = `These tracks couldn’t be read: ${failed.join(', ')}.`;
    return browser;
  })().catch((e) => {
    status.innerHTML = '';
    status.className = 'note warn';
    status.append(h('p', `The genome browser couldn’t open: ${e.message || e}. It reads its files from UCSC’s copy on Amazon, so it needs an internet connection.`));
    throw e;
  });
  handle.goTo = async (locus) => {
    const b = await handle.ready;
    await b.search(locus);
  };
  handle.addTrack = async (cfg) => {
    const b = await handle.ready;
    return b.loadTrack(cfg);
  };
  /** replace the features of a track made with variantTrack (by its name) */
  handle.setFeatures = async (name, cfg) => {
    const b = await handle.ready;
    b.removeTrackByName(name);
    return b.loadTrack(cfg);
  };
  handle.destroy = () => {
    try {
      if (handle.browser && window.igv) window.igv.removeBrowser(handle.browser);
    } catch (e) {
      /* already gone */
    }
  };
  return handle;
}

/** the track list as checkboxes: onToggle(key, on) */
export function trackPicker(chosen, onToggle) {
  const box = h('fieldset.track-pick');
  box.appendChild(h('legend', 'Tracks'));
  for (const [k, t] of Object.entries(TRACKS)) {
    const b = h('input', { type: 'checkbox', value: k });
    b.checked = chosen.includes(k);
    b.addEventListener('change', () => onToggle(k, b.checked));
    box.appendChild(h('label.check', { title: t.about }, b, h('span', t.name)));
  }
  return box;
}
export { esc };
