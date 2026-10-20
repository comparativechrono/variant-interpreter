/* =====================================================================
   The gene page's tabs other than the overview: the features of the
   gene's diseases beside your patients', ClinVar's variants in the gene,
   its protein, your patients with a variant in it, and the genome
   browser. Each draws itself into a box from the page's shared data
   (st: see makeState in gene.js) and may return a function to tidy up.
   ===================================================================== */
import { h, fmt, toast } from '../core.js';
import { link } from '../router.js';
import * as db from '../db.js';
import { note, loading, table, btn, linkBtn, ext, empty, select, field, clsBadge } from '../ui.js';
import { CV_CLASSES, CONSEQ_GROUPS, cvClass, consequenceGroup, clinvarSummary, geneNotes, hotspots, starCount } from '../gene-stats.js';
import { starsEl } from './gene-parts.js';
import { niceConsequence } from '../annotate.js';
import { patientFacts, inheritanceText, contributionText, ZYGOSITY, CONTRIBUTION, SEX } from '../summary.js';

export async function draw(tab, st, box) {
  if (tab === 'phenotypes') return drawPhenotypes(st, box);
  if (tab === 'variants') return drawVariants(st, box);
  if (tab === 'protein') return drawProtein(st, box);
  if (tab === 'patients') return drawPatients(st, box);
  if (tab === 'browser') return drawBrowser(st, box);
  return null;
}

/** a patient chooser for marking shared features: the patients with a variant in the gene, or anyone in this browser */
async function contextPicker(st, rows, onChange, hint) {
  const ps = await db.listPatients();
  const withVar = new Set(rows.map((r) => r.p.id));
  const opts = [['', withVar.size ? `Your patients with a variant in ${st.symbol}` : 'No one']]
    .concat(ps.map((p) => [p.id, `Patient ${p.id}${p.ref ? ' – ' + p.ref : ''}${withVar.has(p.id) ? '' : ' (no variant in the gene)'}`]));
  const sel = select(opts, st.query.patient || '');
  sel.addEventListener('change', () => {
    st.query.patient = sel.value || undefined;
    // keep the choice in the address, so that it can be shared or reloaded
    const q = sel.value ? '?patient=' + encodeURIComponent(sel.value) : '';
    history.replaceState(null, '', `#/gene/${st.symbol}/${st.tab}${q}`);
    if (st.retab) st.retab();
    onChange(sel.value ? ps.find((p) => p.id === sel.value) : null);
  });
  const chosen = st.query.patient ? ps.find((p) => p.id === st.query.patient) || null : null;
  return { el: field('Compare with', sel, hint), chosen };
}

/* ================================================================
   Phenotypes: the features of the gene's diseases, and your patients'
   ================================================================ */
async function drawPhenotypes(st, box) {
  box.appendChild(loading('Loading the Human Phenotype Ontology and its disease annotations…'));
  const H = await import('../hpo.js');
  const X = await import('../pheno-explain.js');
  let ds, rows;
  try {
    await H.loadDiseases();
    [ds, rows] = await Promise.all([st.diseases(), st.patients()]);
  } catch (e) {
    box.innerHTML = '';
    box.appendChild(note('bad', h('p', 'The HPO couldn’t be loaded. Try reloading the page. The error was: ' + e.message)));
    return;
  }
  box.innerHTML = '';
  if (!ds.length) {
    box.appendChild(empty(`No diseases of ${st.symbol} in the HPO’s annotations`, 'So there are no features to show, but the gene’s curations on the Overview tab may still link it to a disease.'));
    return;
  }
  // the features of the gene's diseases: for each, the highest frequency in any of them, and which diseases have it
  const feats = new Map();
  for (const d of ds) {
    for (const [n, f] of d.pheno) {
      const x = feats.get(n) || { n, freq: null, known: false, diseases: [] };
      x.diseases.push(d.name);
      if (f != null && (!x.known || f > x.freq)) {
        x.freq = f;
        x.known = true;
      }
      feats.set(n, x);
    }
  }
  // the patients with a variant in the gene, and their observed features
  const people = [];
  const seen = new Set();
  for (const r of rows) {
    if (seen.has(r.p.id)) continue;
    seen.add(r.p.id);
    people.push({ id: r.p.id, p: r.p, terms: (r.p.phenotypes || []).filter((t) => t.observed !== false).map((t) => X.numOf(t.id)).filter((x) => x != null), vars: rows.filter((x) => x.p.id === r.p.id) });
  }
  const ctxBox = h('div.gene-ctx');
  const listBox = h('div');
  const side = h('aside.gene-side');
  box.append(h('p.lede', `These are the features of ${st.symbol}’s ${ds.length} ${ds.length === 1 ? 'disease' : 'diseases'} in the HPO’s annotations (${feats.size} features), grouped by body system. A feature your patients have, or a more specific form of it, is in bold, with the patients who have it. If they have it only in a more general form, that’s noted under it.`), ctxBox, h('div.cols', listBox, side));
  const pick = await contextPicker(st, rows, (pt) => paint(pt), 'A feature is shared when the patient has it, or a more specific form of it');
  ctxBox.appendChild(pick.el);

  const paint = (ctxPatient) => {
    const who = ctxPatient
      ? [{ id: ctxPatient.id, p: ctxPatient, terms: (ctxPatient.phenotypes || []).filter((t) => t.observed !== false).map((t) => X.numOf(t.id)).filter((x) => x != null) }]
      : people;
    listBox.innerHTML = '';
    side.innerHTML = '';
    // group the features by body system
    const groups = new Map();
    for (const x of feats.values()) {
      const b = H.branch(x.n);
      const k = b ? b.name : 'Other';
      if (!groups.has(k)) groups.set(k, []);
      groups.get(k).push(x);
    }
    let sharedN = 0;
    const order = Array.from(groups).sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0]));
    for (const [gname, xs] of order) {
      xs.sort((a, b) => (b.known ? b.freq : -1) - (a.known ? a.freq : -1) || b.diseases.length - a.diseases.length || H.name(a.n).localeCompare(H.name(b.n)));
      const ul = h('ul.feat-list');
      let shared = 0;
      for (const x of xs) {
        // has it: the feature, or a more specific form of it; near it: only a more general form (seizures, for myoclonic seizures)
        const with_ = who.filter((p) => p.terms.some((t) => H.ancestors(t).has(x.n)));
        const near = who.filter((p) => !with_.includes(p) && p.terms.some((t) => t !== 118 && H.ic(t) >= 1 && H.ancestors(x.n).has(t)))
          .map((p) => ({ p, as: p.terms.filter((t) => H.ancestors(x.n).has(t) && t !== 118) }));
        if (with_.length) shared++;
        const name = h('a', { href: link('/phenotype/' + H.hpId(x.n)) }, H.name(x.n));
        ul.appendChild(h('li' + (with_.length ? '.shared' : ''),
          h('span.feat-name', with_.length ? h('b', name) : name, ' ', h('span.hpo-id', H.hpId(x.n))),
          h('span.feat-freq.small', X.freqWord(x.known ? x.freq : null)),
          h('span.feat-dz.small.muted', { title: x.diseases.join('; ') }, ds.length > 1 ? `in ${x.diseases.length} of ${ds.length} diseases` : ''),
          with_.length || near.length ? h('span.feat-who.small',
            with_.map((p, i) => [i ? ', ' : '', h('a', { href: link('/patient/' + p.id + '/phenotypes') }, 'Patient ' + p.id)]),
            near.length ? h('span.muted', `${with_.length ? '; ' : ''}${near.map((n) => `Patient ${n.p.id} only as ${n.as.map((t) => H.name(t)).join(', ')}`).join('; ')}`) : null) : null));
      }
      sharedN += shared;
      const label = `${gname.replace(/^Abnormality of (the )?/, (m) => m)} (${xs.length}${shared ? `, ${shared} shared` : ''})`;
      listBox.appendChild(h('details.feat-group', { open: shared || xs.length <= 12 || order.length <= 3 ? true : null }, h('summary', label), ul));
    }
    listBox.prepend(h('p.small.muted', { 'aria-live': 'polite' }, who.length ? `${sharedN} of the ${feats.size} features are shared with ${ctxPatient ? 'Patient ' + ctxPatient.id : `your ${who.length === 1 ? 'patient' : who.length + ' patients'} with a variant in ${st.symbol}`}.` : `No patient in this browser has a variant in ${st.symbol}, but you can choose one above to compare their features.`));
    // the side: the patients, their features, and those several share
    side.appendChild(h('h3.vsub', ctxPatient ? `Patient ${ctxPatient.id}` : `Your patients with a variant in ${st.symbol}`));
    if (!who.length) side.appendChild(h('p.small.muted', 'None yet.'));
    const geneSet = Array.from(feats.keys());
    for (const p of who) {
      const obs = (p.p.phenotypes || []).filter((t) => t.observed !== false);
      side.appendChild(h('div.gene-person',
        h('div', h('a', { href: link('/patient/' + p.id) }, h('b', 'Patient ' + p.id)), p.p.ref ? h('span.muted', ' ' + p.p.ref) : null, h('span.small.muted', ' ' + (patientFacts(p.p).short || ''))),
        (p.vars || []).length ? h('div.small', p.vars.map((r, i) => [i ? '; ' : '', h('span.hgvs', r.s.short), ' ', clsBadge(r.s.cls, { short: true, empty: 'not classified' })])) : null,
        obs.length ? h('ul.small.person-feats', obs.map((t) => {
          const sh = X.sharedWith(t.id, geneSet);
          return h('li' + (sh ? '.shared' : ''), sh ? h('b', t.name) : t.name);
        })) : h('p.small.faint', 'No features recorded.')));
    }
    if (!ctxPatient && people.length >= 2) {
      const common = X.sharedFeatures(people.map((p) => ({ id: p.id, terms: p.terms })), 2);
      side.appendChild(h('h3.vsub', 'Features several of them share'));
      side.appendChild(common.length ? h('ul.small.person-feats', common.slice(0, 15).map((c) => sharedItem(c, people.length, H))) : h('p.small.muted', 'They share no feature beyond the most general ones.'));
    }
    side.appendChild(h('p.small', h('a', { href: link('/match' + (ctxPatient ? '?patient=' + ctxPatient.id : '')) }, 'Rank diseases and genes by a patient’s features'), '.'));
  };
  paint(pick.chosen);
}

/* ================================================================
   ClinVar's variants in the gene (gnomAD's copy of ClinVar)
   ================================================================ */
async function drawVariants(st, box) {
  box.appendChild(loading(`Fetching ClinVar’s variants in ${st.symbol} from gnomAD’s copy of ClinVar…`));
  let gn;
  try {
    gn = await st.gnomad();
  } catch (e) {
    box.innerHTML = '';
    box.appendChild(note('bad', h('p', `ClinVar’s variants in ${st.symbol} couldn’t be fetched from gnomAD (${e.message}). You can `, ext(`https://www.ncbi.nlm.nih.gov/clinvar/?term=${encodeURIComponent(st.symbol)}%5Bgene%5D`, 'search ClinVar itself'), ' instead.')));
    return;
  }
  box.innerHTML = '';
  const list = (gn && gn.clinvar_variants) || [];
  if (!list.length) {
    box.appendChild(empty(`No ClinVar variants in ${st.symbol}`, gn ? 'gnomAD’s copy of ClinVar has none in this gene.' : 'gnomAD doesn’t have this gene on GRCh38.'));
    return;
  }
  const f = { cls: '', group: '', stars: 0, text: '', order: 'pos', shown: 100 };
  const sumBox = h('div');
  const notesBox = h('div');
  const listBox = h('div');
  box.append(sumBox, notesBox, listBox);

  // the counts: a bar by class, and a table of kinds of change by class
  const drawSummary = () => {
    sumBox.innerHTML = '';
    const s = clinvarSummary(list, f.stars);
    sumBox.appendChild(h('div.cv-head', h('h2.gene-h', 'ClinVar’s variants in ' + st.symbol), h('span.small.muted', `${fmt(s.total)} variants${f.stars ? ` with ${f.stars} or more ${f.stars === 1 ? 'star' : 'stars'}` : ''}`)));
    sumBox.appendChild(classBar(s));
    const cell = (gk, ck, nv) => {
      if (!nv) return h('span.faint', '0');
      const b = h('button.linkish', { type: 'button', title: 'Show these variants' }, fmt(nv));
      b.addEventListener('click', () => {
        f.group = gk;
        f.cls = ck;
        f.shown = 100;
        syncFilters();
        drawList();
        listBox.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
      return b;
    };
    const rows = CONSEQ_GROUPS.map((g) => Object.assign({ g }, s.matrix[g.key]));
    sumBox.appendChild(table([
      { key: 'g', label: 'Kind of change', fmt: (r) => h('span', h('b', r.g.label), h('span.small.muted', h('br'), r.g.about)) },
      ...CV_CLASSES.map((c) => ({ key: c.key, label: c.short, num: true, fmt: (r) => cell(r.g.key, c.key, r[c.key]) })),
      { key: 'total', label: 'All', num: true, fmt: (r) => cell(r.g.key, '', r.total) }
    ], rows, { compact: true, caption: `ClinVar’s variants in ${st.symbol}, by kind of change and class` }));
    notesBox.innerHTML = '';
    const ns = geneNotes(s);
    if (ns.length) {
      notesBox.appendChild(h('h3.vsub', 'What the counts suggest'));
      notesBox.appendChild(h('ul.gene-notes', ns.map((x) => h('li', x.codes.length ? h('span.crit-list', x.codes.map((c) => h('span.tag', c))) : null, ' ', x.text))));
      notesBox.appendChild(h('p.small.muted', 'These counts come from other laboratories’ classifications, so treat them as pointers rather than proof. Some genes have few classified variants, and ClinVar’s submissions vary in quality. The stars show how well each one has been reviewed.'));
    }
  };

  // the filters and the list
  const clsSel = select([['', 'All classes']].concat(CV_CLASSES.map((c) => [c.key, c.label])), f.cls);
  const grpSel = select([['', 'All kinds of change']].concat(CONSEQ_GROUPS.map((g) => [g.key, g.label])), f.group);
  const starSel = select([[0, 'Any'], [1, 'One star or more'], [2, 'Two stars or more'], [3, 'Three or more (expert panel)'], [4, 'Four (practice guideline)']], f.stars);
  const ordSel = select([['pos', 'Along the gene, 5′ to 3′'], ['class', 'Class, pathogenic first'], ['stars', 'Review status, best first']], f.order);
  // along the gene: on the minus strand, the gene runs from higher positions to lower
  const along = st.g.strand === '-' ? (a, b) => b.pos - a.pos : (a, b) => a.pos - b.pos;
  const txt = h('input', { type: 'search', placeholder: 'e.g. Arg273 or c.818', 'aria-label': 'Find a variant by its HGVS' });
  const syncFilters = () => {
    clsSel.value = f.cls;
    grpSel.value = f.group;
    starSel.value = String(f.stars);
  };
  clsSel.addEventListener('change', () => { f.cls = clsSel.value; f.shown = 100; drawList(); });
  grpSel.addEventListener('change', () => { f.group = grpSel.value; f.shown = 100; drawList(); });
  starSel.addEventListener('change', () => { f.stars = +starSel.value; f.shown = 100; drawSummary(); drawList(); });
  ordSel.addEventListener('change', () => { f.order = ordSel.value; drawList(); });
  let tt = null;
  txt.addEventListener('input', () => {
    clearTimeout(tt);
    tt = setTimeout(() => { f.text = txt.value.trim().toLowerCase(); f.shown = 100; drawList(); }, 200);
  });
  const filters = h('div.fields.cv-filters', field('Class', clsSel), field('Kind of change', grpSel), field('Review status', starSel), field('Order', ordSel), field('Find', txt));
  const count = h('p.small.muted', { 'aria-live': 'polite' });
  const tblBox = h('div');
  listBox.append(h('h3.vsub', 'The variants'), filters, count, tblBox);
  const CLS_ORDER = { plp: 0, conflict: 1, vus: 2, blb: 3, other: 4 };
  const drawList = () => {
    let xs = list.filter((c) => starCount(c) >= f.stars && (!f.cls || cvClass(c.clinical_significance) === f.cls) && (!f.group || consequenceGroup(c.major_consequence) === f.group));
    if (f.text) xs = xs.filter((c) => `${c.hgvsc || ''} ${c.hgvsp || ''} ${c.variant_id}`.toLowerCase().includes(f.text));
    if (f.order === 'class') xs.sort((a, b) => CLS_ORDER[cvClass(a.clinical_significance)] - CLS_ORDER[cvClass(b.clinical_significance)] || starCount(b) - starCount(a) || along(a, b));
    else if (f.order === 'stars') xs.sort((a, b) => starCount(b) - starCount(a) || along(a, b));
    else xs.sort(along);
    const page = xs.slice(0, f.shown);
    count.textContent = xs.length ? `${xs.length > page.length ? `The first ${fmt(page.length)} of ` : ''}${fmt(xs.length)} ${xs.length === 1 ? 'variant' : 'variants'}.` : 'No variants match these filters.';
    tblBox.innerHTML = '';
    if (!xs.length) return;
    tblBox.appendChild(table([
      { key: 'v', label: 'Variant', fmt: (c) => h('a', { href: link(`/variant/${encodeURIComponent(c.variant_id)}?assembly=GRCh38`), title: `Open ${c.variant_id} (GRCh38) to classify it` }, h('span.hgvs', c.hgvsc || c.variant_id)) },
      { key: 'p', label: 'Protein', fmt: (c) => (c.hgvsp ? h('span.hgvs', c.hgvsp) : h('span.faint', '–')) },
      { key: 'k', label: 'Consequence', fmt: (c) => niceConsequence(c.major_consequence) },
      { key: 'c', label: 'Classification', fmt: (c) => h('span.cv-cls', h('span.cv-dot.' + cvClass(c.clinical_significance), { 'aria-hidden': 'true' }), c.clinical_significance) },
      { key: 's', label: 'Review', fmt: (c) => starsEl(starCount(c)) },
      { key: 'g', label: 'In gnomAD', fmt: (c) => (c.in_gnomad ? 'Yes' : h('span.muted', 'No')) },
      { key: 'id', label: 'ClinVar', fmt: (c) => (c.clinvar_variation_id ? ext(`https://www.ncbi.nlm.nih.gov/clinvar/variation/${c.clinvar_variation_id}/`, String(c.clinvar_variation_id)) : '') }
    ], page, { compact: true, caption: `ClinVar variants in ${st.symbol}` }));
    if (xs.length > page.length) tblBox.appendChild(h('div.btn-row', { style: { marginTop: '8px' } }, btn(`Show ${fmt(Math.min(200, xs.length - page.length))} more`, () => { f.shown += 200; drawList(); }, { cls: 'small' })));
  };
  drawSummary();
  drawList();
  listBox.appendChild(h('p.small.muted', 'These come from gnomAD’s copy of ClinVar, which gnomAD updates each month. Positions are on GRCh38, and the HGVS is on the gene’s main transcript. Open a variant to see all of its evidence and classify it yourself.'));
}

/** ClinVar's classes as one bar, with the counts written beside it (the colours are never the only label) */
function classBar(s) {
  const bar = h('div.cv-bar', { role: 'img', 'aria-label': CV_CLASSES.map((c) => `${c.label}: ${s.byClass[c.key]}`).join('; ') });
  const key = h('ul.cv-key.small');
  for (const c of CV_CLASSES) {
    const nv = s.byClass[c.key];
    if (nv) bar.appendChild(h('span.cv-seg.' + c.key, { style: { flexGrow: String(nv) }, title: `${c.label}: ${fmt(nv)}` }));
    key.appendChild(h('li', h('span.cv-dot.' + c.key, { 'aria-hidden': 'true' }), `${c.label}: `, h('b', fmt(nv)), s.total ? h('span.muted', ` (${Math.round((100 * nv) / s.total)}%)`) : null));
  }
  return h('div.cv-summary', bar, key);
}

/* ================================================================
   The protein: its domains, where ClinVar's variants fall, hotspots, and AlphaFold's model
   ================================================================ */
async function drawProtein(st, box) {
  const { g } = st;
  if (!g.uniprot) {
    box.appendChild(empty('No protein', `${g.symbol} has no reviewed UniProt entry in the site’s gene table, so it may not code for a protein.`));
    return;
  }
  box.appendChild(loading(`Fetching ${g.uniprot} from UniProt and the gene’s ClinVar variants from gnomAD…`));
  const [upR, gnR, plot] = await Promise.all([st.uniprot().then((x) => ({ ok: x }), (e) => ({ err: e })), st.gnomad().then((x) => ({ ok: x }), (e) => ({ err: e })), import('../widgets/protein-plot.js')]);
  box.innerHTML = '';
  const up = upR.ok || null;
  const cv = (gnR.ok && gnR.ok.clinvar_variants) || [];
  const errs = [upR.err ? 'UniProt didn’t answer: ' + upR.err.message : null, gnR.err ? 'gnomAD didn’t return the ClinVar variants: ' + gnR.err.message : null].filter(Boolean);
  if (errs.length) box.appendChild(note('warn', h('p', errs.join('. ') + '.')));
  if (!up) return;
  box.appendChild(h('h2.gene-h', `${up.name || g.symbol} (${up.length} residues)`));
  box.appendChild(plot.proteinPlot({ length: up.length, features: up.features, clinvar: cv, gene: g.symbol }));
  box.appendChild(h('p.small.muted', `The protein and its domains come from UniProt ${up.accession} (`, ext(`https://www.uniprot.org/uniprotkb/${up.accession}/entry`, 'see its entry'), '). The ClinVar variants come from gnomAD’s copy of ClinVar and have one star or more. Their positions are on the main transcript’s protein, which is usually UniProt’s.'));
  const cols = h('div.gene-grid');
  box.appendChild(cols);
  // the residues where pathogenic missense variants gather
  const hs = hotspots(cv, 12);
  const left = h('div');
  const right = h('div');
  cols.append(left, right);
  const holder3d = h('div.struct-holder');
  let viewer = null;
  const show3d = async (residue) => {
    if (!residue || residue < 1 || residue > up.length) {
      toast(`Give a residue between 1 and ${up.length}.`, 'error');
      return;
    }
    try {
      if (viewer && viewer.plugin) viewer.plugin.dispose();
    } catch (e) {
      /* gone already */
    }
    viewer = null;
    const m = await import('../widgets/structure.js');
    const aa = up.sequence ? up.sequence[residue - 1] : '';
    try {
      viewer = await m.showStructure(holder3d, { accession: up.accession, residue, label: `${aa || 'residue '}${residue}`, gene: g.symbol, clinvar: cv, what: 'The marked residue' });
    } catch (e) {
      holder3d.innerHTML = '';
      holder3d.appendChild(note('bad', h('p', 'The 3D model couldn’t be shown: ' + e.message)));
    }
  };
  left.appendChild(h('h3.vsub', 'Where pathogenic missense variants gather'));
  if (hs.length) {
    const domOf = (r) => up.features.filter((x) => x.kind === 'domain' && x.start <= r && x.end >= r).map((x) => x.description).join(', ');
    left.appendChild(table([
      { key: 'residue', label: 'Residue', fmt: (x) => h('span.hgvs', `${up.sequence ? up.sequence[x.residue - 1] || '' : ''}${x.residue}`) },
      { key: 'plp', label: 'P/LP', num: true, fmt: (x) => fmt(x.plp) },
      { key: 'blb', label: 'B/LB', num: true, fmt: (x) => fmt(x.blb) },
      { key: 'dom', label: 'Domain', fmt: (x) => h('span.small', domOf(x.residue) || h('span.faint', 'none')) },
      { key: 'go', label: '', fmt: (x) => btn('3D', () => show3d(x.residue), { cls: 'small', icon: 'cube', title: `Mark residue ${x.residue} on AlphaFold’s model` }) }
    ], hs, { compact: true, caption: 'Residues with the most pathogenic missense variants' }));
    left.appendChild(h('p.small.muted', 'The table counts missense variants with one star or more at each residue, as pathogenic or likely pathogenic (P/LP) and benign or likely benign (B/LB). A residue or region where pathogenic changes gather and benign ones don’t is the kind of hotspot PM1 is for.'));
  } else left.appendChild(h('p.small.muted', 'ClinVar has no pathogenic missense variant with a star in this gene.'));
  // AlphaFold
  right.appendChild(h('h3.vsub', 'AlphaFold’s model'));
  const resIn = h('input', { type: 'number', min: 1, max: up.length, step: 1, value: hs.length ? hs[0].residue : Math.round(up.length / 2), 'aria-label': 'Residue to mark' });
  resIn.addEventListener('keydown', (e) => e.key === 'Enter' && show3d(+resIn.value));
  right.appendChild(h('div.row', h('label', { for: 'res3d' }, 'Residue'), resIn, btn('Show it in 3D', () => show3d(+resIn.value), { cls: 'small primary', icon: 'cube' })));
  resIn.id = 'res3d';
  right.appendChild(h('p.small.muted', 'The residue is drawn dark and large, with ClinVar’s pathogenic missense residues in red around it. The model is AlphaFold’s prediction, loaded from AlphaFold DB, and the Mol* viewer is loaded from jsDelivr the first time you use it.'));
  box.appendChild(holder3d);
  // the domains and other features
  const feats = up.features.filter((x) => ['domain', 'topo', 'region', 'site'].includes(x.kind)).sort((a, b) => a.start - b.start);
  if (feats.length) {
    box.appendChild(h('h3.vsub', 'Domains, regions and sites (UniProt)'));
    box.appendChild(table([
      { key: 'type', label: 'Kind', fmt: (x) => x.type },
      { key: 'description', label: 'Description' },
      { key: 'start', label: 'Residues', fmt: (x) => (x.start === x.end ? String(x.start) : `${x.start}–${x.end}`), sort: (x) => x.start },
      { key: 'len', label: 'Length', num: true, fmt: (x) => fmt(x.end - x.start + 1), sort: (x) => x.end - x.start }
    ], feats, { compact: true, sortable: true, caption: `UniProt features of ${up.accession}` }));
  }
  if (up.function) box.appendChild(h('details', h('summary', 'What the protein does (UniProt)'), h('p.small', up.function)));
  return () => {
    try {
      if (viewer && viewer.plugin) viewer.plugin.dispose();
    } catch (e) {
      /* gone already */
    }
  };
}

/* ================================================================
   Your patients with a variant in the gene, with filters
   ================================================================ */
const KIND_WORDS = { lof: 'Truncating', missense: 'Missense or in-frame', splice: 'Splice region', synonymous: 'Synonymous', other: 'Other', 'cnv-loss': 'Copy-number loss', 'cnv-gain': 'Copy-number gain' };
async function drawPatients(st, box) {
  const rows = await st.patients();
  if (!rows.length) {
    box.appendChild(empty(`No patients with a variant in ${st.symbol}`, `Variants in ${st.symbol} that you add to patients in this browser will appear here, with their classes and the patients’ features. So will copy-number changes on GRCh38 that cover the gene.`, [linkBtn('Your patients', '/patients', { icon: 'users' }), linkBtn('Open a case', '/data', { icon: 'import' })]));
    return;
  }
  const H = await import('../hpo.js');
  const X = await import('../pheno-explain.js');
  await H.loadTerms().catch(() => null);
  const kindOf = (r) => (r.v.kind === 'cnv' ? (r.v.cnvType === 'gain' ? 'cnv-gain' : 'cnv-loss') : consequenceGroup(r.v.consequence));
  const f = { sex: '', kind: '', cls: '', contribution: '', inheritance: '', zygosity: '', text: '' };
  const opt = (vals, all) => [['', all]].concat(vals);
  const used = (fn) => Array.from(new Set(rows.map(fn).filter((x) => x != null && x !== '')));
  const sexSel = select(opt(used((r) => r.p.sex || 'unknown').map((k) => [k, SEX[k] || k]), 'Any sex'), '');
  const kindSel = select(opt(used(kindOf).map((k) => [k, KIND_WORDS[k] || k]), 'Any kind'), '');
  const clsSel = select(opt([['p', 'Pathogenic'], ['lp', 'Likely pathogenic'], ['vus', 'Uncertain significance'], ['lb', 'Likely benign'], ['b', 'Benign'], ['none', 'Not classified']], 'Any class'), '');
  const conSel = select(opt(CONTRIBUTION.filter((c) => c[0]).concat([['undecided', 'Not decided']]), 'Any contribution'), '');
  const inhSel = select(opt(used((r) => r.v.inheritance || 'unknown').map((k) => [k, inheritanceText(k)]), 'Any inheritance'), '');
  const zygSel = select(opt(used((r) => (r.v.kind === 'cnv' ? null : r.v.zygosity || 'unknown')).map((k) => [k, (ZYGOSITY.find((z) => z[0] === k) || [k, k])[1]]), 'Any zygosity'), '');
  const txt = h('input', { type: 'search', placeholder: 'e.g. seizure', 'aria-label': 'Filter by phenotype' });
  const bind = (el, key) => el.addEventListener(el.tagName === 'INPUT' ? 'input' : 'change', () => { f[key] = el.value.trim().toLowerCase(); paint(); });
  [[sexSel, 'sex'], [kindSel, 'kind'], [clsSel, 'cls'], [conSel, 'contribution'], [inhSel, 'inheritance'], [zygSel, 'zygosity'], [txt, 'text']].forEach(([el, k]) => bind(el, k));
  const ctxBox = h('div.gene-ctx');
  const count = h('p.small.muted', { 'aria-live': 'polite' });
  const tblBox = h('div');
  const shareBox = h('div');
  box.append(
    h('p.lede', `These are the patients in this browser with a variant in ${st.symbol}${rows.some((r) => r.v.kind === 'cnv') ? ', or with a copy-number change that covers it' : ''}. You can filter them as you would a database’s matching patients.`),
    h('div.fields.cv-filters', field('Sex', sexSel), field('Kind of variant', kindSel), field('Class', clsSel), field('Contribution', conSel), field('Inheritance', inhSel), field('Zygosity', zygSel), field('Phenotype', txt)),
    ctxBox, count, tblBox, shareBox);
  let ctxPatient = null;
  const pick = await contextPicker(st, rows, (pt) => { ctxPatient = pt; paint(); }, 'Features they share with this patient are in bold, whether it’s the same feature or a more specific or more general form of it');
  ctxPatient = pick.chosen;
  ctxBox.appendChild(pick.el);
  const paint = () => {
    const ctxTerms = ctxPatient ? (ctxPatient.phenotypes || []).filter((t) => t.observed !== false).map((t) => X.numOf(t.id)).filter((x) => x != null) : null;
    const xs = rows.filter((r) => (!f.sex || (r.p.sex || 'unknown') === f.sex) &&
      (!f.kind || kindOf(r) === f.kind) &&
      (!f.cls || (r.s.cls || 'none') === f.cls) &&
      (!f.contribution || (r.v.contribution || 'undecided') === f.contribution) &&
      (!f.inheritance || (r.v.inheritance || 'unknown') === f.inheritance) &&
      (!f.zygosity || (r.v.zygosity || 'unknown') === f.zygosity) &&
      (!f.text || (r.p.phenotypes || []).some((t) => t.observed !== false && (t.name || '').toLowerCase().includes(f.text))));
    count.textContent = `${xs.length} of ${rows.length} ${rows.length === 1 ? 'variant' : 'variants'}, in ${new Set(xs.map((r) => r.p.id)).size} ${new Set(xs.map((r) => r.p.id)).size === 1 ? 'patient' : 'patients'}.`;
    tblBox.innerHTML = '';
    tblBox.appendChild(table([
      { key: 'p', label: 'Patient', fmt: (r) => h('span', h('a.nowrap', { href: link('/patient/' + r.p.id) }, 'Patient ' + r.p.id), r.p.ref ? h('span.small.muted', h('br'), r.p.ref) : null), sort: (r) => +r.p.id },
      { key: 'sex', label: 'Sex, age', fmt: (r) => patientFacts(r.p).short || h('span.faint', '–') },
      { key: 'v', label: 'Variant', fmt: (r) => h('span', h('a', { href: link(`/patient/${r.p.id}/variant/${r.v.id}`) }, h('span.hgvs', r.s.short)), r.v.kind === 'cnv' ? h('span.small.muted', h('br'), r.hit === 'cnv-whole' ? `covers all of ${st.symbol}` : `covers part of ${st.symbol}`) : null) },
      { key: 'k', label: 'Kind', fmt: (r) => (r.v.kind === 'cnv' ? KIND_WORDS[kindOf(r)] : r.v.consequence ? niceConsequence(r.v.consequence) : h('span.faint', 'not annotated yet')) },
      { key: 'z', label: 'Genotype', fmt: (r) => h('span.small', r.v.kind === 'cnv' ? (r.v.copyNumber != null ? `${r.v.copyNumber} ${r.v.copyNumber === 1 ? 'copy' : 'copies'}` : '') : cap(r.v.zygosity || 'not known'), h('br'), h('span.muted', inheritanceText(r.v.inheritance || 'unknown'))) },
      { key: 'c', label: 'Class', fmt: (r) => h('span', clsBadge(r.s.cls, { short: true, empty: 'not classified' }), h('span.small.muted', h('br'), r.s.final ? 'signed' : r.s.cls ? 'as it stands' : '')), sort: (r) => ['p', 'lp', 'vus', 'lb', 'b'].indexOf(r.s.cls) },
      { key: 'con', label: 'Contribution', fmt: (r) => h('span.small', contributionText(r.v.contribution)) },
      { key: 'ph', label: 'Phenotype', fmt: (r) => phenoCell(r.p, ctxTerms, ctxPatient, X) }
    ], xs, { compact: true, sortable: true, caption: `Your patients with a variant in ${st.symbol}` }));
    // the features that several of the listed patients share
    shareBox.innerHTML = '';
    const people = [];
    const seen = new Set();
    for (const r of xs) {
      if (seen.has(r.p.id)) continue;
      seen.add(r.p.id);
      people.push({ id: r.p.id, terms: (r.p.phenotypes || []).filter((t) => t.observed !== false).map((t) => X.numOf(t.id)).filter((x) => x != null) });
    }
    if (people.length >= 2) {
      const common = X.sharedFeatures(people, 2);
      shareBox.appendChild(h('h3.vsub', 'Features present in several of these patients'));
      shareBox.appendChild(common.length ? h('ul.small.shared-list', common.slice(0, 20).map((c) => sharedItem(c, people.length, H))) : h('p.small.muted', 'They share no feature beyond the most general ones.'));
    }
  };
  paint();
}
const cap = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);

/** a feature several patients share: who, and (when it is a more general term than theirs) as what */
function sharedItem(c, n, H) {
  return h('li', h('a', { href: link('/phenotype/' + H.hpId(c.term)) }, H.name(c.term)), ' ',
    h('span.muted', `(${c.ids.length} of ${n}: `, c.ids.map((id, i) => {
      const own = c.via[id] || [];
      const as = own.filter((t) => t !== c.term);
      return [i ? '; ' : '', 'Patient ' + id, as.length ? ` as ${as.map((t) => H.name(t)).join(', ')}` : ''];
    }), ')'));
}

/** a patient's observed features, those shared with the chosen patient in bold */
function phenoCell(p, ctxTerms, ctxPatient, X) {
  const obs = (p.phenotypes || []).filter((t) => t.observed !== false);
  if (!obs.length) return h('span.faint', 'none recorded');
  const same = ctxPatient && ctxPatient.id === p.id;
  const parts = obs.map((t) => {
    const shared = ctxTerms && !same && X.sharedWith(t.id, ctxTerms);
    return shared ? h('b', { title: `Shared with Patient ${ctxPatient.id}` }, t.name) : h('span', t.name);
  });
  const shown = parts.slice(0, 8);
  return h('span.small.pheno-cell', shown.map((x, i) => [i ? '; ' : '', x]), obs.length > 8 ? h('span.muted', `; and ${obs.length - 8} more`) : null);
}

/* ================================================================
   The genome browser, at the gene
   ================================================================ */
async function drawBrowser(st, box) {
  const { g } = st;
  if (!g.chrom || !g.start) {
    box.appendChild(note('warn', h('p', `The site’s gene table has no GRCh38 position for ${g.symbol}.`)));
    return;
  }
  const [G, B] = await Promise.all([import('../widgets/genome.js'), import('./browser.js')]);
  const rows = await st.patients().catch(() => []);
  const vs = rows.map((r) => r.v).filter((v, i, a) => a.indexOf(v) === i);
  const feats = B.patientFeatures(vs, 'GRCh38');
  const extra = feats.length ? [G.variantTrack('Your patients’ variants', feats)] : [];
  const pad = Math.max(2000, Math.round((g.end - g.start) * 0.08));
  const holder = h('div.igv-holder');
  box.append(h('p.small.muted', `This shows ${g.symbol} on GRCh38 with ClinVar, ClinGen’s dosage curations and genes${feats.length ? ', and your patients’ variants' : ''}. You can search for another gene or region in the browser’s own box, or `, h('a', { href: link(`/browser?locus=${encodeURIComponent(`chr${g.chrom}:${g.start - pad}-${g.end + pad}`)}&assembly=GRCh38`) }, 'open the full genome browser'), '.'), holder);
  const handle = G.genomeBrowser(holder, { assembly: 'GRCh38', locus: `chr${g.chrom}:${Math.max(1, g.start - pad)}-${g.end + pad}`, tracks: G.DEFAULT_TRACKS, extra });
  handle.ready.catch(() => null);
  return () => handle.destroy();
}

