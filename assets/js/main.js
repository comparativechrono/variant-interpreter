/* =====================================================================
   The Variant interpreter: the page frame, the search box and the
   pages (each loaded when first opened).
   ===================================================================== */
import { $, $$, h, esc, bus, icon, debounce, toast } from './core.js';
import { route, start, go, link } from './router.js';
import { readQuery, fmtRegion } from './parse.js';
import * as db from './db.js';
import * as settings from './settings.js';

/* ---------------- the pages ---------------- */
route('/', () => import('./views/home.js'));
route('/patients', () => import('./views/patients.js'));
route('/patient/new', () => import('./views/patient-edit.js'));
route('/patient/:id/edit', () => import('./views/patient-edit.js'));
route('/patient/:id/variant/:vid/:section?', () => import('./views/variant.js'));
route('/patient/:id/:tab?', () => import('./views/patient.js'));
route('/variant/:q*', () => import('./views/variant.js'));
route('/cnv/:q*', () => import('./views/variant.js'));
route('/gene/:symbol/:tab?', () => import('./views/gene.js'));
route('/region/:where', () => import('./views/region.js'));
route('/browser', () => import('./views/browser.js'));
route('/phenotype/:hp', () => import('./views/phenotype.js'));
route('/match', () => import('./views/match.js'));
route('/learn/:topic?', () => import('./views/learn.js'));
route('/data', () => import('./views/data.js'));
route('/settings', () => import('./views/settings.js'));
route('/about/:topic?', () => import('./views/about.js'));

/* ---------------- the bar ---------------- */
function navState(p) {
  const top = (p.path || '/').split('/')[1] || '';
  const map = { patients: 'patients', patient: 'patients', browser: 'browser', region: 'browser', learn: 'learn', data: 'data' };
  $$('.mainnav a').forEach((a) => (a.dataset.nav === map[top] ? a.setAttribute('aria-current', 'page') : a.removeAttribute('aria-current')));
}
bus.on('route', navState);

function showName() {
  const n = settings.get('name');
  $('#who-name').textContent = n || 'Settings';
}
bus.on('settings', showName);

async function showSaveState() {
  const ok = await db.persistent();
  const el = $('#savestate');
  if (!ok) {
    el.classList.add('memory');
    el.title = 'This browser isn’t letting the site keep anything, perhaps because it’s a private window. Your work lasts only until the page is closed, so download it from Cases and data before then.';
    el.querySelector('span').textContent = 'Not saved: private window?';
  }
}

/* ---------------- the search box ---------------- */
let genesP = null;
const geneList = () => (genesP = genesP || import('./genes.js').then((m) => m.loadGenes().then(() => m)).catch(() => null));
let hpoP = null;
const hpo = () => (hpoP = hpoP || import('./hpo.js').then((m) => m.loadTerms().then(() => m)).catch(() => null));

function setupSearch() {
  const form = $('#gsearch');
  const input = $('#gsearch-q');
  const list = $('#gsearch-list');
  let items = [];
  let active = -1;
  const close = () => {
    list.hidden = true;
    input.setAttribute('aria-expanded', 'false');
    active = -1;
  };
  const choose = (it) => {
    close();
    input.blur();
    go(it.to);
  };
  const paint = () => {
    list.innerHTML = '';
    if (!items.length) {
      close();
      return;
    }
    let lastGroup = null;
    items.forEach((it, i) => {
      if (it.group !== lastGroup) {
        list.appendChild(h('div.sg-h', it.group));
        lastGroup = it.group;
      }
      const b = h('button', { type: 'button', role: 'option', id: 'sg' + i, class: i === active ? 'active' : null, 'aria-selected': i === active ? 'true' : 'false' },
        h('span.sg-kind', it.kind), h('span.sg-main', { html: it.html || esc(it.label) }, it.sub ? h('span.sg-sub', it.sub) : null));
      b.addEventListener('mousedown', (e) => e.preventDefault());
      b.addEventListener('click', () => choose(it));
      list.appendChild(b);
    });
    list.hidden = false;
    input.setAttribute('aria-expanded', 'true');
    if (active >= 0) input.setAttribute('aria-activedescendant', 'sg' + active);
    else input.removeAttribute('aria-activedescendant');
  };
  const update = debounce(async () => {
    const q = input.value.trim();
    items = await suggestions(q);
    active = items.length ? 0 : -1;
    paint();
  }, 120);
  input.addEventListener('input', update);
  input.addEventListener('focus', () => {
    if (input.value.trim()) update();
  });
  input.addEventListener('blur', () => setTimeout(close, 150));
  input.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown' && items.length) {
      e.preventDefault();
      active = (active + 1) % items.length;
      paint();
    } else if (e.key === 'ArrowUp' && items.length) {
      e.preventDefault();
      active = (active - 1 + items.length) % items.length;
      paint();
    } else if (e.key === 'Escape') {
      close();
    }
  });
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const q = input.value.trim();
    if (!q) return;
    if (!list.hidden && active >= 0 && items[active]) return choose(items[active]);
    const its = await suggestions(q);
    if (its.length) choose(its[0]);
    else toast('Nothing matches that. Try a gene symbol, a variant such as NM_000546.6:c.818G>A or 17-7673802-C-T, a region such as chr22:18900000-21500000, or an HPO term.', 'error', 9000);
  });
  // "/" puts the cursor in the search box, as on many sites
  document.addEventListener('keydown', (e) => {
    if (e.key === '/' && !/^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement.tagName) && !document.activeElement.isContentEditable) {
      e.preventDefault();
      input.focus();
    }
  });
}

/** a chromosome band as people write it (22q11.2, 1p36, Xq28): its extent on a build, from UCSC's bands, or null */
async function bandRegion(q, asm) {
  const m = /^(?:chr)?([0-9]{1,2}|X|Y)([pq])(\d+(?:\.\d+)?)?$/i.exec(q.replace(/\s+/g, ''));
  if (!m) return null;
  const chrom = m[1].toUpperCase();
  const arm = m[2].toLowerCase();
  const sub = m[3] || '';
  const K = await import('./widgets/karyogram.js');
  const B = await K.bands(asm).catch(() => null);
  const list = B && B[chrom];
  if (!list) return null;
  const hits = list.filter(([, , name]) => name && name.startsWith(arm + sub) && (!sub || name.length === (arm + sub).length || /^[.\d]/.test(name.slice((arm + sub).length))));
  if (!hits.length) return null;
  return { chrom, start: Math.min(...hits.map((x) => x[0])) + 1, end: Math.max(...hits.map((x) => x[1])), name: `${chrom}${arm}${sub}` };
}

/** what the search box offers for some text: groups in the order of how well they match (an exact gene symbol or
    HPO term before a patient whose notes mention the word) */
async function suggestions(q) {
  if (!q) return [];
  const groups = [];
  const group = (rank) => {
    const g = { rank, items: [] };
    groups.push(g);
    return g.items;
  };
  const out = group(0);
  const r = readQuery(q);
  const enc = encodeURIComponent;
  const band = r.kind === 'text' || r.kind === 'gene' ? await bandRegion(q, settings.get('assembly')) : null;
  if (band) out.push({ group: 'Region', kind: 'Band', label: `${band.name}: ${fmtRegion(band.chrom, band.start, band.end)}`, sub: 'Genes, dosage sensitivity and known CNVs in this band', to: `/region/${enc(`${band.chrom}:${band.start}-${band.end}`)}` });
  if (r.kind === 'vcf') out.push({ group: 'Variant', kind: 'Variant', label: `${r.chrom}-${r.pos}-${r.ref}-${r.alt || '-'}`, sub: 'Annotate and classify this variant', to: `/variant/${enc(`${r.chrom}-${r.pos}-${r.ref}-${r.alt || '-'}`)}` });
  if (r.kind === 'hgvs') out.push({ group: 'Variant', kind: 'Variant', label: r.hgvs, sub: r.ref === 'protein' ? 'This is a protein change, so the variant page will look for the DNA changes that make it' : 'Annotate and classify this variant', to: `/variant/${enc(r.hgvs)}` });
  if (r.kind === 'rsid') out.push({ group: 'Variant', kind: 'dbSNP', label: r.id, sub: 'Annotate and classify this variant', to: `/variant/${enc(r.id)}` });
  if (r.kind === 'cnv') out.push({ group: 'Variant', kind: 'CNV', label: `${r.type === 'gain' ? 'Gain' : r.type === 'loss' ? 'Loss' : 'Copy-number change'} of ${fmtRegion(r.chrom, r.start, r.end)}`, sub: 'Classify this copy-number variant (ACMG/ClinGen 2020)', to: `/cnv/${enc(q)}` });
  if (r.kind === 'region' || r.kind === 'cnv') out.push({ group: 'Region', kind: 'Region', label: fmtRegion(r.chrom, r.start, r.end), sub: 'Genes, dosage sensitivity and known CNVs in this region', to: `/region/${enc(`${r.chrom}:${r.start}-${r.end}`)}` });
  if (r.kind === 'hpo') out.push({ group: 'Phenotype', kind: 'HPO', label: r.id, sub: 'The term, its genes and diseases, and your patients with it', to: `/phenotype/${r.id}` });
  const ql = q.toLowerCase();
  // patients: by number or reference first; those whose notes merely mention the words last
  try {
    const ps = await db.listPatients();
    const named = ps.filter((p) => p.id === q.replace(/^patient\s*/i, '') || (p.ref && p.ref.toLowerCase().includes(ql)));
    const noted = q.length >= 3 ? ps.filter((p) => !named.includes(p) && (p.summary || '').toLowerCase().includes(ql)) : [];
    const item = (p) => ({ group: 'Your patients', kind: 'Patient', label: `Patient ${p.id}${p.ref ? ' – ' + p.ref : ''}`, sub: (p.summary || '').slice(0, 90), to: `/patient/${p.id}` });
    if (named.length) group(1).push(...named.slice(0, 5).map(item));
    if (noted.length) group(4).push(...noted.slice(0, Math.max(0, 5 - named.length)).map(item));
  } catch (e) {
    /* ignore */
  }
  // genes: an exact symbol first
  if (r.kind === 'gene' || r.kind === 'text') {
    const G = await geneList();
    if (G) {
      const gs = G.searchGenes(q, 6);
      const exact = gs.some((g) => g.symbol.toLowerCase() === ql);
      group(exact ? 1 : 3).push(...gs.map((g) => ({ group: 'Genes', kind: 'Gene', html: `<i class="gene">${esc(g.symbol)}</i>${g.via ? ` <span class="muted">(${esc(g.via)})</span>` : ''}`, sub: g.name, to: `/gene/${enc(g.symbol)}` })));
    }
  }
  // HPO terms: an exact name (or synonym) first
  if ((r.kind === 'text' || r.kind === 'gene') && q.length >= 3) {
    const H = await hpo();
    if (H) {
      const ms = H.search(q, { limit: 6 });
      const exact = ms.some((m) => (m.term.name || '').toLowerCase() === ql || (m.via || '').toLowerCase() === ql);
      group(exact ? 1 : 2).push(...ms.map((m) => ({ group: 'Phenotypes (HPO)', kind: 'HPO', html: esc(m.term.name) + ` <span class="hpo-id">${m.term.id}</span>`, sub: m.via ? `also called ${m.via}` : '', to: `/phenotype/${m.term.id}` })));
    }
  }
  // groups in order of rank (ties keep this order: variants and regions, patients, genes, phenotypes)
  return groups.map((g, i) => [g, i]).sort((a, b) => a[0].rank - b[0].rank || a[1] - b[1]).flatMap(([g]) => g.items).slice(0, 16);
}

/* ---------------- start ---------------- */
showName();
showSaveState();
setupSearch();
// saves that a reload or a closed tab interrupted are put back before any page reads the patients
db.replayJournal()
  .catch((e) => console.warn('could not replay the journal', e))
  .then(() => start($('#main'), () => import('./views/notfound.js')));
db.askPersist();
window.VI = { go, link, db, settings };
