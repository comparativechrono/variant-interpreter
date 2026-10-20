/* =====================================================================
   A gene's page (#/gene/TP53, #/gene/TP53/variants …): who the gene is
   and what it does, the diseases it causes and how sure the curators
   are, how intolerant it is of change, its diseases' features, ClinVar's
   variants in it, its protein, the patients in this browser with a
   variant in it, and the genome around it.

   The tabs share the page's data (fetched once) and change without the
   page being made again (the router's sameAs/update).
   ===================================================================== */
import { h, fmt, modal } from '../core.js';
import { go, link } from '../router.js';
import { page, crumbs, pageHead, tabs, note, loading, table, btn, linkBtn, ext, empty } from '../ui.js';
import { loadGenes, gene as findGene, searchGenes, allGenes, validity, g2p, THRESH, genesMeta } from '../genes.js';
import { geneMOI } from '../acmg/suggest.js';
import { allelicWords, dosageWords, clinvarSummary } from '../gene-stats.js';
import { fmtRegion } from '../parse.js';
import { scoreGauges, diseaseLink, inhWords, nearSymbols } from './gene-parts.js';

const TABS = [
  ['overview', 'Overview', 'book'],
  ['phenotypes', 'Phenotypes', 'phenotype'],
  ['variants', 'ClinVar variants', 'clinvar'],
  ['protein', 'Protein', 'protein'],
  ['patients', 'Your patients', 'users'],
  ['browser', 'Genome browser', 'genome']
];
const TAB_KEYS = TABS.map((t) => t[0]);

let S = null; // the page on show: { symbol, g, … }

export function sameAs(p) {
  return !!(S && p.params && p.params.symbol && String(p.params.symbol).toUpperCase() === S.symbol.toUpperCase() && !p.query.from);
}
export function update(params, query) {
  if (!S) return;
  S.query = query || {};
  showTab(TAB_KEYS.includes(params.tab) ? params.tab : 'overview');
}

export async function render(root, params, query) {
  if (S) S.stop();
  const want = String(params.symbol || '').trim();
  const p = page();
  root.appendChild(p);
  p.appendChild(crumbs([['Home', '/'], ['Gene ' + want]]));
  const wait = h('div', h('h1', h('i', want)), loading('Loading the site’s table of genes…'));
  p.appendChild(wait);
  try {
    await loadGenes();
  } catch (e) {
    wait.innerHTML = '';
    wait.append(h('h1', h('i', want)), note('bad', h('p', 'The table of genes could not be loaded: ' + e.message + '. Reload the page to try again.')));
    return;
  }
  const g0 = findGene(want);
  if (!g0) {
    wait.remove();
    notFound(p, want);
    return;
  }
  const tab = TAB_KEYS.includes(params.tab) ? params.tab : 'overview';
  if (g0.symbol !== want) {
    // a previous symbol, an alias or another case: the page is the gene's own symbol's
    const same = g0.symbol.toUpperCase() === want.toUpperCase();
    go(`/gene/${encodeURIComponent(g0.symbol)}${tab !== 'overview' ? '/' + tab : ''}${same ? '' : '?from=' + encodeURIComponent(want)}`, true);
    return;
  }
  wait.remove();
  const g = Object.assign({}, g0, { validity: validity(g0), g2p: g2p(g0) });
  S = makeState(g, p, query);
  drawHead(S);
  showTab(tab);
  return () => S && S.stop();
}

/* ---------------- the page's data, fetched once and shared by the tabs ---------------- */
function makeState(g, p, query) {
  const once = (fn) => {
    let pr = null;
    return () => (pr = pr || fn());
  };
  const st = {
    symbol: g.symbol, g, p, query: query || {}, tab: null, cleanups: [],
    // gnomAD's gene record: constraint, and its copy of ClinVar's variants in the gene
    gnomad: once(() => import('../api/gnomad.js').then((m) => m.gene(g.symbol, 'GRCh38'))),
    uniprot: once(() => (g.uniprot ? import('../api/proteins.js').then((m) => m.uniprot(g.uniprot)) : Promise.resolve(null))),
    diseases: once(() => import('../hpo.js').then((m) => m.diseasesOfGene(g.symbol))),
    patients: once(() => import('./gene-parts.js').then((m) => m.genePatients(g))),
    stop() {
      for (const f of this.cleanups.splice(0)) {
        try {
          f();
        } catch (e) {
          /* gone already */
        }
      }
      if (S === this) S = null;
    }
  };
  return st;
}

/* ---------------- the heading ---------------- */
function drawHead(st) {
  const { g, p } = st;
  const moi = geneMOI(g);
  const strand = g.strand === '-' ? 'minus strand' : g.strand === '+' ? 'plus strand' : '';
  const where = g.chrom && g.start ? `${fmtRegion(g.chrom, g.start, g.end)} (GRCh38)` : '';
  const idLink = (href, text) => ext(href, text);
  const facts = [
    ['Location', [g.cyto || '', where ? (g.cyto ? ', ' : '') + where : '', strand ? `, ${strand}` : ''].join('') || null],
    ['MANE Select', g.mane ? idLink(`https://www.ncbi.nlm.nih.gov/nuccore/${g.mane}`, g.mane) : null],
    ['HGNC', g.hgnc ? idLink(`https://www.genenames.org/data/gene-symbol-report/#!/hgnc_id/${g.hgnc}`, g.hgnc) : null],
    ['OMIM', g.omim ? idLink(`https://omim.org/entry/${g.omim}`, g.omim) : null],
    ['Ensembl', g.ensembl ? idLink(`https://www.ensembl.org/Homo_sapiens/Gene/Summary?g=${g.ensembl}`, g.ensembl) : null],
    ['UniProt', g.uniprot ? idLink(`https://www.uniprot.org/uniprotkb/${g.uniprot}/entry`, g.uniprot) : null]
  ];
  const also = [];
  if ((g.aliases || []).length) also.push('Also known as ' + g.aliases.slice(0, 8).join(', ') + (g.aliases.length > 8 ? '…' : ''));
  if ((g.prev || []).length) also.push('previously ' + g.prev.join(', '));
  // look up a variant in this gene
  const vin = h('input', { type: 'text', placeholder: 'A c. or p. change, e.g. c.100C>T', 'aria-label': `A variant in ${g.symbol}`, spellcheck: 'false', autocomplete: 'off' });
  const look = () => {
    const t = vin.value.trim().replace(/\s+/g, '');
    if (!t) return vin.focus();
    let q = t;
    if (/^[cnp]\./i.test(t)) q = /^p\./i.test(t) || !g.mane ? `${g.symbol}:${t}` : `${g.mane}:${t}`;
    go('/variant/' + encodeURIComponent(q));
  };
  vin.addEventListener('keydown', (e) => e.key === 'Enter' && look());
  const lookBox = h('div.gene-look', h('label', { for: 'gene-look-in' }, `Look up a variant in ${g.symbol}`), h('div.row', vin, btn('Look up', look, { cls: 'small primary', icon: 'search' })));
  vin.id = 'gene-look-in';
  st.summary = h('p.gene-summary', { 'aria-live': 'polite' });
  st.protein = h('div.gene-protein');
  p.appendChild(pageHead({
    titleNode: [h('i.gene-sym', g.symbol), ' ', h('span.gene-name', g.name || '')],
    facts,
    extra: h('div',
      also.length ? h('p.small.muted.gene-also', also.join('; ') + '.') : null,
      h('div.row.gene-tags', moi ? h('span.tag.accent', { title: 'From the gene’s ClinGen and Gene2Phenotype curations' }, 'Inheritance: ' + moiWords(moi)) : null,
        g.hi === 3 ? h('span.tag.bad', { title: 'ClinGen has found sufficient evidence for haploinsufficiency' }, 'Haploinsufficient (ClinGen 3)') : null,
        g.ts === 3 ? h('span.tag.bad', { title: 'ClinGen has found sufficient evidence for triplosensitivity' }, 'Triplosensitive (ClinGen 3)') : null,
        g.loeuf != null && g.loeuf < THRESH.loeuf ? h('span.tag', { title: 'LOEUF is below 0.6 in gnomAD v4.1' }, 'Constrained for loss of function') : null),
      st.summary, st.protein),
    actions: [lookBox]
  }));
  if (st.query.from) p.appendChild(note('', h('p', `${st.query.from} is ${(g.prev || []).map((x) => x.toUpperCase()).includes(String(st.query.from).toUpperCase()) ? 'a previous symbol' : 'another name'} for `, h('i', g.symbol), ', HGNC’s approved symbol, so this is its page.')));
  st.nav = h('div');
  p.appendChild(st.nav);
  st.body = h('div.tab-body.gene-body');
  p.appendChild(st.body);
  st.retab = () => drawTabs(st, {});
  drawTabs(st, {});
  fillSummary(st);
  fillProtein(st);
}

function moiWords(m) {
  const W = { AD: 'autosomal dominant', AR: 'autosomal recessive', XL: 'X-linked' };
  return String(m).split('/').map((x) => W[x] || x).join(' and ');
}

function drawTabs(st, counts) {
  st.counts = Object.assign(st.counts || {}, counts);
  st.nav.innerHTML = '';
  // a patient chosen for comparison (?patient=) stays chosen from tab to tab
  const q = st.query.patient ? '?patient=' + encodeURIComponent(st.query.patient) : '';
  st.nav.appendChild(tabs(TABS.map(([k, label, ic]) => [k, label, `/gene/${st.symbol}${k === 'overview' ? '' : '/' + k}${q}`, st.counts[k] != null ? fmt(st.counts[k]) : null, ic]), st.tab, `${st.symbol}: sections`));
}

/** one sentence on what this browser and ClinVar hold for the gene */
async function fillSummary(st) {
  const parts = { pts: null, cv: null };
  const say = () => {
    if (!st.summary.isConnected) return;
    const bits = [];
    if (parts.pts) {
      const n = parts.pts.patients;
      bits.push(n ? `${n} ${n === 1 ? 'patient' : 'patients'} in this browser ${n === 1 ? 'has' : 'have'} ${parts.pts.variants > n ? `${parts.pts.variants} variants` : n === 1 ? 'a variant' : 'variants'} in ${st.symbol}.` : `No patient in this browser has a variant in ${st.symbol} yet.`);
    }
    if (parts.cv) bits.push(`ClinVar lists ${fmt(parts.cv.total)} variants in the gene, ${fmt(parts.cv.plp)} of them pathogenic or likely pathogenic.`);
    else if (parts.cv === false) bits.push('ClinVar’s variants in the gene could not be fetched just now.');
    st.summary.textContent = bits.join(' ');
  };
  st.patients().then((rows) => {
    parts.pts = { patients: new Set(rows.map((r) => r.p.id)).size, variants: rows.length };
    drawTabs(st, { patients: parts.pts.patients || null });
    say();
  }).catch(() => null);
  st.gnomad().then((gn) => {
    const s = clinvarSummary((gn && gn.clinvar_variants) || []);
    parts.cv = { total: s.total, plp: s.byClass.plp };
    drawTabs(st, { variants: s.total });
    say();
  }).catch(() => {
    parts.cv = false;
    say();
  });
}

/** what the protein does, from UniProt, folded away under the heading */
function fillProtein(st) {
  st.uniprot().then((up) => {
    if (!up || !up.function || !st.protein.isConnected) return;
    st.protein.appendChild(h('details.gene-fn', h('summary', `What the protein does (UniProt ${up.accession})`), h('p.small', up.function)));
  }).catch(() => null);
}

/* ---------------- the tabs ---------------- */
async function showTab(tab) {
  const st = S;
  if (!st) return;
  // leave the tab on show (the genome browser goes with it)
  for (const f of st.cleanups.splice(0)) {
    try {
      f();
    } catch (e) {
      /* gone already */
    }
  }
  st.tab = tab;
  drawTabs(st, {});
  const box = h('div');
  st.body.innerHTML = '';
  st.body.appendChild(box);
  try {
    if (tab === 'overview') await drawOverview(st, box);
    else {
      const m = await import('./gene-tabs.js');
      if (S !== st || st.tab !== tab) return;
      const out = await m.draw(tab, st, box);
      if (typeof out === 'function') st.cleanups.push(out);
    }
  } catch (e) {
    console.error(e);
    box.appendChild(note('bad', h('p', 'This part of the page couldn’t be shown. Try reloading the page. The error was: ' + e.message)));
  }
}

/* ---------------- Overview: the gene's diseases (left), its scores and where to look further (right) ---------------- */
async function drawOverview(st, box) {
  const { g } = st;
  const vcep = h('div');
  const left = h('div.gene-col');
  const right = h('div.gene-col');
  box.append(vcep, h('div.gene-grid', left, right));

  /* ---- left: gene–disease association ---- */
  left.appendChild(h('h2.gene-h', 'Gene–disease association'));
  // ClinGen gene–disease validity
  left.appendChild(h('h3.vsub', 'ClinGen gene–disease validity'));
  left.appendChild(g.validity.length ? table([
    { key: 'disease', label: 'Disease', fmt: (r) => ext(r.url, r.disease) },
    { key: 'moi', label: 'Inheritance', fmt: (r) => moiWords(r.moi) },
    { key: 'classification', label: 'Classification', fmt: (r) => validityTag(r.classification) },
    { key: 'date', label: 'Curated', fmt: (r) => r.date || '' },
    { key: 'gcep', label: 'Expert panel', fmt: (r) => h('span.small', (r.gcep || '').replace(/ Gene Curation Expert Panel$/, ' panel')) }
  ], g.validity, { compact: true, caption: `ClinGen gene–disease validity for ${g.symbol}` }) : h('p.muted.small', `ClinGen hasn’t curated a link between ${g.symbol} and a disease, at least not yet.`));
  // Gene2Phenotype
  left.appendChild(h('h3.vsub', 'Gene2Phenotype'));
  left.appendChild(g.g2p.length ? table([
    { key: 'disease', label: 'Disease', fmt: (r) => ext(r.url, r.disease) },
    { key: 'allelic', label: 'Copies needed', fmt: (r) => allelicWords(r.allelic) },
    { key: 'mechanism', label: 'Mechanism', fmt: (r) => h('span', r.mechanism || '', r.consequence ? h('span.small.muted', h('br'), r.consequence) : null) },
    { key: 'confidence', label: 'Confidence', fmt: (r) => validityTag(r.confidence) },
    { key: 'panels', label: 'Panels', fmt: (r) => h('span.small', r.panels || '') }
  ], g.g2p, { compact: true, caption: `Gene2Phenotype entries for ${g.symbol}` }) : h('p.muted.small', `${g.symbol} isn’t on any of Gene2Phenotype’s panels.`));
  // dosage sensitivity, in words
  left.appendChild(h('h3.vsub', 'Dosage sensitivity (ClinGen)'));
  left.appendChild(h('table.kv', h('tbody',
    h('tr', h('th', { scope: 'row' }, 'Haploinsufficiency'), h('td', dosageCell(g.hi, g.hiDisease, g))),
    h('tr', h('th', { scope: 'row' }, 'Triplosensitivity'), h('td', dosageCell(g.ts, g.tsDisease, g))),
    g.dosageDate ? h('tr', h('th', { scope: 'row' }, 'Curated'), h('td', g.dosageDate, ' ', g.hgnc ? ext(`https://search.clinicalgenome.org/kb/gene-dosage/${g.hgnc}`, 'ClinGen’s dosage page') : null)) : null)));
  // the curated regions (recurrent CNVs and others) that the gene lies in
  const regBox = h('div');
  left.appendChild(regBox);
  if (g.chrom && g.start) {
    import('../api/cnv-sources.js').then((m) => m.dosageRegions(g.chrom, g.start, g.end, 'GRCh38')).then((rs) => {
      const hit = (rs || []).filter((r) => (r.hi != null && r.hi !== 0) || (r.ts != null && r.ts !== 0));
      if (!hit.length || !regBox.isConnected) return;
      regBox.append(h('p.small', { style: { margin: '8px 0 4px' } }, `${g.symbol} lies in ${hit.length === 1 ? 'a region' : hit.length + ' regions'} that ClinGen has curated for copy-number changes:`),
        h('ul.small.gene-regions', hit.map((r) => h('li', ext(r.url, r.name || r.id), ` (${r.id}${r.cytoband ? ', ' + r.cytoband : ''}): ${dosageWords(r.hi)} for haploinsufficiency, and ${dosageWords(r.ts)} for triplosensitivity.`))));
    }).catch(() => null);
  }
  // the diseases of the gene (the HPO's annotations: OMIM and Orphanet)
  left.appendChild(h('h3.vsub', 'Diseases (OMIM and Orphanet)'));
  const dzBox = h('div', loading('Loading the HPO’s disease annotations…'));
  left.appendChild(dzBox);
  left.appendChild(h('p.small', ext(`https://www.ncbi.nlm.nih.gov/books/NBK1116/?term=${encodeURIComponent(g.symbol)}`, `GeneReviews chapters on ${g.symbol}`), '. ', g.omim ? ext(`https://omim.org/entry/${g.omim}`, 'OMIM’s entry for the gene') : null, g.omim ? '.' : null));
  // PanelApp
  left.appendChild(h('h3.vsub', 'Gene panels (Genomics England PanelApp)'));
  const paBox = h('div', loading('Asking PanelApp…'));
  left.appendChild(paBox);

  /* ---- right: scores and links ---- */
  right.appendChild(h('h2.gene-h', 'Gene predictive scores'));
  right.appendChild(scoreGauges(g));
  right.appendChild(h('p.small.muted', 'The constraint scores come from gnomAD v4.1 (for the gene’s MANE Select transcript), and pHaplo and pTriplo from Collins et al. (2022), as recorded in the site’s gene table (', (genesMeta() || {}).made || 'date not recorded', ').'));
  right.appendChild(h('h2.gene-h', 'Search databases'));
  right.appendChild(h('div.ext-links', geneLinks(g).map(([t, u]) => ext(u, t))));

  // the expert panel's rules for the gene, if ClinGen has any
  import('../api/cspec.js').then((cs) => cs.forGene(g.symbol)).then((sets) => {
    if (!sets.length || !vcep.isConnected) return;
    vcep.appendChild(note('ok', h('p', h('b', `${sets.length === 1 ? 'A ClinGen expert panel has' : 'ClinGen expert panels have'} rules for classifying ${g.symbol}’s variants. `), 'They are ', sets.map((s, i) => [i ? (i === sets.length - 1 ? ' and ' : ', ') : '', 'the ', ext(s.url, `${s.panel}’s specifications (version ${s.version})`)]), '. They change how some criteria apply to this gene, such as their thresholds and strengths, and the variant pages show them beside each criterion.')));
  }).catch(() => null);

  // diseases
  st.diseases().then(async (ds) => {
    const H = await import('../hpo.js');
    const { freqWord } = await import('../pheno-explain.js');
    dzBox.innerHTML = '';
    if (!ds.length) {
      dzBox.appendChild(h('p.muted.small', 'The HPO’s annotations link no disease to this gene.'));
      return;
    }
    const rows = ds.map((d) => ({ d, inh: inhWords(d.inh, H) }));
    const tbl = table([
      { key: 'name', label: 'Disease', fmt: (r) => h('span', diseaseLink(r.d), h('span.hpo-id', ' ' + r.d.id)) },
      { key: 'inh', label: 'Inheritance', fmt: (r) => r.inh || h('span.faint', 'not given') },
      { key: 'n', label: 'Features', num: true, fmt: (r) => featuresButton(r.d, H, freqWord), sort: (r) => r.d.pheno.size }
    ], rows, { compact: true, sortable: true, caption: `Diseases of ${g.symbol}` });
    dzBox.appendChild(tbl);
    dzBox.appendChild(h('p.small.muted', `These come from the HPO’s annotations (version ${H.diseaseVersion() || H.hpoVersion()}). Press a number to see the disease’s features, or see `, h('a', { href: link(`/gene/${g.symbol}/phenotypes`) }, 'all the features beside your patients’'), '.'));
  }).catch((e) => {
    dzBox.innerHTML = '';
    dzBox.appendChild(h('p.small.muted', 'The HPO’s annotations couldn’t be loaded. Try reloading the page. The error was: ' + e.message));
  });

  // PanelApp
  import('../panels.js').then((P) => P.panelsOfGene(g.symbol).then((list) => {
    paBox.innerHTML = '';
    if (!list.length) {
      paBox.appendChild(h('p.muted.small', `${g.symbol} isn’t on any of PanelApp’s panels.`));
      return;
    }
    const rows = list.slice().sort((a, b) => b.rating - a.rating || a.panel.localeCompare(b.panel));
    const show = (all) => {
      paBox.innerHTML = '';
      paBox.appendChild(table([
        { key: 'panel', label: 'Panel', fmt: (r) => ext(`https://panelapp.genomicsengland.co.uk/panels/${r.id}/gene/${g.symbol}/`, r.panel) },
        { key: 'rating', label: 'Rating', fmt: (r) => h('span.tag.' + (P.RATING[Math.min(3, r.rating)] || P.RATING[0]).cls, (P.RATING[Math.min(3, r.rating)] || P.RATING[0]).word) },
        { key: 'moi', label: 'Inheritance', fmt: (r) => h('span.small', String(r.moi || '').replace(/^([^,]+),.*/, '$1').toLowerCase()) }
      ], all ? rows : rows.slice(0, 8), { compact: true, caption: `PanelApp panels with ${g.symbol}` }));
      if (!all && rows.length > 8) paBox.appendChild(h('div.btn-row', { style: { marginTop: '6px' } }, btn(`Show all ${rows.length} panels`, () => show(true), { cls: 'small' })));
      paBox.appendChild(h('p.small.muted', 'Green means diagnostic grade, amber means moderate evidence, and red means there isn’t enough evidence for diagnostic use.'));
    };
    show(false);
  })).catch((e) => {
    paBox.innerHTML = '';
    paBox.appendChild(h('p.small.muted', 'PanelApp didn’t answer. Try again in a minute. The error was: ' + e.message));
  });
}

/** ClinGen and Gene2Phenotype classifications as a tag: its words, with a colour that agrees */
export function validityTag(c) {
  const s = String(c || '');
  const kind = /definitive|strong/i.test(s) ? 'ok' : /moderate/i.test(s) ? 'accent' : /limited|disputed|refuted|no known/i.test(s) ? 'warn' : '';
  return h('span.tag' + (kind ? '.' + kind : ''), s.charAt(0).toUpperCase() + s.slice(1));
}

function dosageCell(score, mondo, g) {
  const words = dosageWords(score);
  const strong = score === 3;
  // the disease, by name where the gene's validity curations name it
  const named = mondo ? (g.validity || []).find((v) => v.mondo === mondo) : null;
  return h('span', strong ? h('b', cap(words)) : cap(words), mondo && score != null && score !== 0 && score !== 40 ? h('span.small.muted', ' for ', ext(`https://monarchinitiative.org/${mondo}`, named ? named.disease : mondo)) : null);
}
const cap = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);

/** the number of a disease's features, as a button that lists them */
function featuresButton(d, H, freqWord) {
  const b = h('button.linkish', { type: 'button', title: `The features of ${d.name}` }, fmt(d.pheno.size));
  b.addEventListener('click', () => {
    const rows = Array.from(d.pheno).map(([n, f]) => ({ n, f, name: H.name(n), branch: (H.branch(n) || {}).name || 'Other' }))
      .sort((a, b) => (b.f == null ? -1 : b.f) - (a.f == null ? -1 : a.f) || a.name.localeCompare(b.name));
    modal(d.name, h('div',
      h('p.small.muted', `${d.id}. ${d.inh.length ? 'Inheritance: ' + d.inh.map((n) => H.name(n)).join(', ') + '. ' : ''}The HPO’s annotations list ${rows.length} features, and the commonest come first.`),
      table([
        { key: 'name', label: 'Feature', fmt: (r) => h('span', h('a', { href: link('/phenotype/' + H.hpId(r.n)) }, r.name), ' ', h('span.hpo-id', H.hpId(r.n))) },
        { key: 'f', label: 'How often', fmt: (r) => freqWord(r.f) },
        { key: 'branch', label: 'System', fmt: (r) => h('span.small.muted', r.branch.replace(/^Abnormality of (the )?/, '')) }
      ], rows, { compact: true, caption: `Features of ${d.name}` })), { wide: true });
  });
  return b;
}

/** where else to look: the main databases, searched for the gene */
export function geneLinks(g) {
  const s = encodeURIComponent(g.symbol);
  return [
    ['ClinGen', g.hgnc ? `https://search.clinicalgenome.org/kb/genes/${g.hgnc}` : `https://search.clinicalgenome.org/kb/genes?search=${s}`],
    ['ClinVar', `https://www.ncbi.nlm.nih.gov/clinvar/?term=${s}%5Bgene%5D`],
    ['gnomAD', g.ensembl ? `https://gnomad.broadinstitute.org/gene/${g.ensembl}?dataset=gnomad_r4` : `https://gnomad.broadinstitute.org/`],
    ['PanelApp', `https://panelapp.genomicsengland.co.uk/panels/entities/${s}`],
    ['GeneReviews', `https://www.ncbi.nlm.nih.gov/books/NBK1116/?term=${s}`],
    ['OMIM', g.omim ? `https://omim.org/entry/${g.omim}` : `https://omim.org/search?search=${s}`],
    ['DECIPHER', `https://www.deciphergenomics.org/gene/${s}`],
    ['Gene2Phenotype', `https://www.ebi.ac.uk/gene2phenotype/search?query=${s}`],
    ['VarSome', `https://varsome.com/gene/hg38/${s}`],
    ['LOVD', `https://databases.lovd.nl/shared/genes/${s}`],
    ['GTEx (expression)', `https://gtexportal.org/home/gene/${s}`],
    ['UniProt', g.uniprot ? `https://www.uniprot.org/uniprotkb/${g.uniprot}/entry` : `https://www.uniprot.org/uniprotkb?query=${s}`],
    ['Open Targets', g.ensembl ? `https://platform.opentargets.org/target/${g.ensembl}` : `https://platform.opentargets.org/`],
    ['Monarch', g.hgnc ? `https://monarchinitiative.org/${g.hgnc}` : `https://monarchinitiative.org/`],
    ['PubMed', `https://pubmed.ncbi.nlm.nih.gov/?term=${s}%5Btiab%5D`],
    ['Europe PMC', `https://europepmc.org/search?query=${s}`]
  ];
}

/* ---------------- a symbol the site doesn't know ---------------- */
function notFound(p, want) {
  let like = searchGenes(want, 10);
  // a slip of the keyboard: symbols one or two letters different
  if (!like.length) like = nearSymbols(want, allGenes(), 8).map((g) => ({ symbol: g.symbol, name: g.name, via: null }));
  p.appendChild(h('h1', `No gene called “${want}”`));
  p.appendChild(note('warn', h('p', `“${want}” is not an approved symbol, a previous symbol or an alias in the site’s table of HGNC genes (${fmt((genesMeta() || {}).genes || 19372)} genes).`)));
  if (like.length) {
    p.appendChild(h('h2', { style: { margin: '14px 0 8px' } }, 'Did you mean'));
    p.appendChild(h('ul.gene-like', like.map((x) => h('li', h('a', { href: link('/gene/' + x.symbol) }, h('i.gene', x.symbol)), ' ', h('span.muted', x.name), x.via ? h('span.small.faint', ` (${x.via})`) : null))));
  } else p.appendChild(empty('No similar symbols', 'Check the spelling, or search HGNC for the gene.', [linkBtn('Search HGNC', `https://www.genenames.org/tools/search/#!/?query=${encodeURIComponent(want)}`, { icon: 'external' })]));
}

