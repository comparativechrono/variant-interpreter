/* =====================================================================
   An HPO term's page (#/phenotype/HP:0001250): what the term means,
   where it sits in the ontology, the diseases and genes annotated with
   it (or with a more specific form of it), and the patients in this
   browser who have it, or have had it ruled out.
   ===================================================================== */
import { h, fmt, toast, nowISO, modal } from '../core.js';
import { go, link } from '../router.js';
import * as db from '../db.js';
import * as H from '../hpo.js';
import { page, crumbs, pageHead, note, loading, table, btn, linkBtn, ext, empty, select, field, seg } from '../ui.js';
import { freqWord, diseasesWithTerm, genesOf, patientsWithTerm } from '../pheno-explain.js';
import { diseaseLink, inhWords } from './gene-parts.js';
import { patientFacts } from '../summary.js';

export async function render(root, params) {
  const want = String(params.hp || '').trim();
  const p = page();
  root.appendChild(p);
  p.appendChild(crumbs([['Home', '/'], ['Phenotype ' + want]]));
  const wait = h('div', h('h1', want), loading('Loading the Human Phenotype Ontology…'));
  p.appendChild(wait);
  try {
    await H.loadTerms();
  } catch (e) {
    wait.innerHTML = '';
    wait.append(h('h1', want), note('bad', h('p', 'The HPO could not be loaded: ' + e.message + '. Reload the page to try again.')));
    return;
  }
  wait.remove();
  const idm = /^(?:HP[:_]?)?(\d{1,7})$/i.exec(want);
  const t = idm ? H.term(+idm[1]) : null;
  if (!t) {
    notFound(p, want);
    return;
  }
  const askedFor = idm ? H.hpId(+idm[1]) : want;
  const branch = H.branch(t.id);
  const nDesc = H.descendantsOf(t.id, 100000).size - 1;
  const facts = [
    ['HPO id', ext(`https://hpo.jax.org/browse/term/${t.id}`, t.id)],
    ['Branch', branch ? (branch.id === t.id ? 'a branch of its own' : h('a', { href: link('/phenotype/' + branch.id) }, branch.name)) : null],
    ['More specific terms under it', fmt(nDesc)]
  ];
  const icBox = h('span');
  facts.push(['Information content', icBox]);
  const add = btn('Add to a patient…', () => addToPatient(t), { icon: 'plus' });
  p.appendChild(pageHead({
    title: t.name,
    facts,
    actions: [add, linkBtn('Find matching diseases', `/match?terms=${t.id}`, { icon: 'target', title: 'Rank diseases and genes by this feature and any others you add' })]
  }));
  if (askedFor !== t.id) p.appendChild(note('', h('p', `${askedFor} is an old id for this term, which the HPO now calls ${t.id}.`)));

  const main = h('div');
  const side = h('aside');
  p.appendChild(h('div.cols', main, side));

  /* ---- what it means, and where it sits ---- */
  main.appendChild(h('section.section', h('div.section-h', h('h2', 'What it means')),
    t.def ? h('p.pheno-defn', t.def) : h('p.muted', 'The HPO gives no definition for this term.'),
    t.syn.length ? h('p.small', h('b', 'Also called: '), t.syn.join('; ')) : null));
  const path = pathTo(t.n);
  const parents = t.parents.map((n) => H.term(n)).filter(Boolean);
  const children = t.children.map((n) => H.term(n)).filter(Boolean).sort((a, b) => a.name.localeCompare(b.name));
  main.appendChild(h('section.section', h('div.section-h', h('h2', 'Where it sits in the ontology')),
    path.length > 1 ? h('nav.hpo-path', { 'aria-label': 'From the top of the ontology to this term' }, path.map((n, i) => [i ? h('span.sep', { 'aria-hidden': 'true' }, '›') : null, n === t.n ? h('span', { 'aria-current': 'page' }, H.name(n)) : h('a', { href: link('/phenotype/' + H.hpId(n)) }, H.name(n))])) : null,
    h('div.grid2',
      h('div', h('h3.vsub', parents.length === 1 ? 'More general term' : `More general terms (${parents.length})`),
        parents.length ? h('ul.term-list', parents.map((x) => h('li', h('a', { href: link('/phenotype/' + x.id) }, x.name), ' ', h('span.hpo-id', x.id)))) : h('p.small.muted', 'This is a top term, so there are none.')),
      h('div', h('h3.vsub', `More specific terms (${children.length})`),
        children.length ? termList(children) : h('p.small.muted', 'This is as specific as the HPO goes, so there are none.')))));

  /* ---- the diseases and genes with it ---- */
  const dzBox = h('div', loading('Loading the HPO’s disease annotations…'));
  const geneBox = h('div');
  main.appendChild(h('section.section', h('div.section-h', h('h2', 'Diseases with this feature')), dzBox));
  main.appendChild(h('section.section', h('div.section-h', h('h2', 'Genes of those diseases')), geneBox));

  /* ---- the side: counts and your patients ---- */
  const countBox = h('div.pheno-counts', loading('Counting…'));
  side.appendChild(h('section.section', h('div.section-h', h('h3', 'In the HPO’s annotations')), countBox));
  const ptBox = h('div');
  side.appendChild(h('section.section', h('div.section-h', h('h3', 'Your patients')), ptBox));
  side.appendChild(h('section.section', h('div.section-h', h('h3', 'Elsewhere')),
    h('div.ext-links', ext(`https://hpo.jax.org/browse/term/${t.id}`, 'HPO browser'), ext(`https://monarchinitiative.org/${t.id}`, 'Monarch'), ext(`https://www.ebi.ac.uk/ols4/ontologies/hp/classes?obo_id=${t.id}`, 'OLS'))));

  // your patients (the terms are enough: no need to wait for the diseases)
  db.listPatients().then((ps) => drawPatients(ptBox, ps, t)).catch((e) => ptBox.appendChild(h('p.small.muted', 'Your patients couldn’t be read: ' + e.message)));

  // the annotations
  let D;
  try {
    D = await H.loadDiseases();
  } catch (e) {
    dzBox.innerHTML = '';
    dzBox.appendChild(note('bad', h('p', 'The HPO’s disease annotations couldn’t be loaded. Try reloading the page. The error was: ' + e.message)));
    countBox.innerHTML = '';
    return;
  }
  if (!dzBox.isConnected) return;
  icBox.textContent = fmt(H.ic(t.n), 2);
  icBox.title = 'The −log of the share of annotated diseases that have this term or a more specific one, so it’s higher for rarer features';
  const rows = diseasesWithTerm(D, t.id);
  const genes = genesOf(rows);
  countBox.innerHTML = '';
  countBox.append(
    h('p', h('b', fmt(rows.length)), ` of the ${fmt(D.length)} diseases have it${nDesc ? ' or a more specific form of it' : ''} (${rows.length ? Math.max(0.1, (100 * rows.length) / D.length).toFixed(1) : 0}%), linked to `, h('b', fmt(genes.length)), ` ${genes.length === 1 ? 'gene' : 'genes'}.`),
    h('p.small.muted', `The information content, ${fmt(H.ic(t.n), 2)}, says how much the feature narrows the diagnosis. The rarer the feature is among diseases, the higher the value, and matching gives rare features more weight than common ones.`),
    h('p.small.muted', `HPO version ${H.diseaseVersion() || H.hpoVersion()}.`));
  drawDiseases(dzBox, rows, t);
  drawGenes(geneBox, genes, rows.length);
}

/** from the top of the ontology (Phenotypic abnormality, or another root) down to the term, by first parents */
function pathTo(n) {
  const out = [n];
  let cur = H.term(n);
  let guard = 0;
  while (cur && cur.parents.length && guard++ < 40) {
    // prefer a parent under Phenotypic abnormality (HP:0000118), then the most specific
    const ps = cur.parents.map((x) => H.term(x)).filter(Boolean);
    const next = ps.find((x) => H.ancestors(x.n).has(118)) || ps[0];
    if (!next || next.n === 1) break; // HP:0000001 (All) says nothing
    out.unshift(next.n);
    cur = next;
  }
  return out;
}

function termList(list) {
  const ul = h('ul.term-list');
  const shown = list.slice(0, 30);
  for (const x of shown) {
    const n = H.descendantsOf(x.id, 100000).size - 1;
    ul.appendChild(h('li', h('a', { href: link('/phenotype/' + x.id) }, x.name), ' ', h('span.hpo-id', x.id), n ? h('span.small.muted', ` (${fmt(n)} under it)`) : null));
  }
  if (list.length > shown.length) ul.appendChild(h('li.muted.small', `and ${list.length - shown.length} more`));
  return ul;
}

function drawDiseases(box, rows, t) {
  box.innerHTML = '';
  if (!rows.length) {
    box.appendChild(h('p.muted', 'No disease in the HPO’s annotations has this feature.'));
    return;
  }
  let shown = 25;
  const tblBox = h('div');
  const more = h('div.btn-row', { style: { marginTop: '8px' } });
  box.append(h('p.small.muted', 'The diseases where it’s seen most often come first. The HPO gives frequencies for only some diseases, and the others follow.'), tblBox, more);
  const paint = () => {
    tblBox.innerHTML = '';
    more.innerHTML = '';
    tblBox.appendChild(table([
      { key: 'name', label: 'Disease', fmt: (r) => h('span', diseaseLink(r.disease), h('span.hpo-id', ' ' + r.disease.id)) },
      { key: 'freq', label: 'How often', fmt: (r) => h('span.small.nowrap', freqWord(r.freq)) },
      { key: 'via', label: 'As', fmt: (r) => (r.exact ? h('span.small.muted.nowrap', 'this term') : h('span.small', r.terms.slice(0, 2).map((n, i) => [i ? '; ' : '', h('a', { href: link('/phenotype/' + H.hpId(n)) }, H.name(n))]), r.terms.length > 2 ? '…' : '')) },
      { key: 'genes', label: 'Genes', fmt: (r) => (r.disease.genes.length ? h('span', r.disease.genes.slice(0, 4).map((g, i) => [i ? ', ' : '', h('a', { href: link('/gene/' + g) }, h('i', g))]), r.disease.genes.length > 4 ? h('span.muted', ` and ${r.disease.genes.length - 4} more`) : null) : h('span.faint', 'none known')) },
      { key: 'inh', label: 'Inheritance', fmt: (r) => h('span.small', inhWords(r.disease.inh, H) || '') }
    ], rows.slice(0, shown), { compact: true, caption: `Diseases with ${t.name}` }));
    if (rows.length > shown) more.appendChild(btn(`Show ${fmt(Math.min(100, rows.length - shown))} more of ${fmt(rows.length)}`, () => { shown += 100; paint(); }, { cls: 'small' }));
  };
  paint();
}

function drawGenes(box, genes, nDiseases) {
  box.innerHTML = '';
  if (!genes.length) {
    box.appendChild(h('p.muted', 'None of those diseases has a gene in the HPO’s annotations.'));
    return;
  }
  let shown = 30;
  const tblBox = h('div');
  const more = h('div.btn-row', { style: { marginTop: '8px' } });
  box.append(h('p.small.muted', `These are the genes of the ${fmt(nDiseases)} diseases, with the genes that have the most such diseases first. A feature shared by many genes’ diseases says little about which gene is involved.`), tblBox, more);
  const paint = () => {
    tblBox.innerHTML = '';
    more.innerHTML = '';
    tblBox.appendChild(table([
      { key: 'gene', label: 'Gene', fmt: (r) => h('a', { href: link('/gene/' + r.gene) }, h('i.gene', r.gene)) },
      { key: 'n', label: 'Diseases with it', num: true, fmt: (r) => fmt(r.diseases.length) },
      { key: 'ex', label: 'For example', fmt: (r) => h('span.small', r.diseases.slice(0, 2).join('; '), r.diseases.length > 2 ? '…' : '') }
    ], genes.slice(0, shown), { compact: true, caption: 'Genes of the diseases with this feature' }));
    if (genes.length > shown) more.appendChild(btn(`Show ${fmt(Math.min(100, genes.length - shown))} more of ${fmt(genes.length)}`, () => { shown += 100; paint(); }, { cls: 'small' }));
  };
  paint();
}

function drawPatients(box, ps, t) {
  box.innerHTML = '';
  const w = patientsWithTerm(ps, t.id);
  if (!w.observed.length && !w.excluded.length) {
    box.appendChild(h('p.small.muted', ps.length ? 'None of your patients has it recorded or ruled out.' : 'There are no patients in this browser yet.'));
    return;
  }
  const item = (r, how) => h('li',
    h('a', { href: link('/patient/' + r.patient.id + '/phenotypes') }, 'Patient ' + r.patient.id), r.patient.ref ? h('span.muted', ' ' + r.patient.ref) : null,
    h('span.small.muted', ` ${patientFacts(r.patient).short || ''}`),
    h('div.small', how, r.terms.map((x, i) => [i ? '; ' : '', x.id === t.id ? 'this term' : h('a', { href: link('/phenotype/' + x.id) }, x.name)])));
  if (w.observed.length) {
    box.appendChild(h('h4.vsub', `Have it (${w.observed.length})`));
    box.appendChild(h('ul.pt-list', w.observed.map((r) => item(r, 'As '))));
  }
  if (w.excluded.length) {
    box.appendChild(h('h4.vsub', `Ruled out (${w.excluded.length})`));
    box.appendChild(h('ul.pt-list', w.excluded.map((r) => item(r, 'Excluded: '))));
  }
}

/** add the term to a patient's phenotype, observed or excluded */
async function addToPatient(t) {
  const ps = await db.listPatients();
  if (!ps.length) {
    toast('There are no patients in this browser yet, so make one first.', 'error');
    return;
  }
  const pick = select(ps.map((x) => [x.id, `Patient ${x.id}${x.ref ? ' – ' + x.ref : ''}`]), ps[0].id);
  let mode = 'observed';
  const how = seg([['observed', 'Observed'], ['excluded', 'Excluded']], mode, (v) => (mode = v), 'Add it as');
  modal(`Add “${t.name}” to a patient`, h('div.stack', field('Patient', pick), h('div', h('span.small.muted', { style: { marginRight: '8px' } }, 'Add it as'), how),
    h('p.small.muted', 'Excluded means the feature was looked for and is absent, so it counts against diseases that usually have it.')), {
    actions: [['Cancel', null, 'ghost'], ['Add', async () => {
      const pt = await db.getPatient(pick.value);
      if (!pt) return;
      pt.phenotypes = pt.phenotypes || [];
      const ex = pt.phenotypes.find((x) => x.id === t.id);
      if (ex) ex.observed = mode === 'observed';
      else pt.phenotypes.push({ id: t.id, name: t.name, observed: mode === 'observed', onset: '', note: '', added: nowISO() });
      await db.savePatient(pt, `Phenotype ${mode === 'observed' ? 'added' : 'excluded'}: ${t.name} (${t.id})`);
      toast(`${ex ? 'Changed' : 'Added'} for Patient ${pt.id}.`, 'ok');
      go(`/phenotype/${t.id}`, true);
    }, 'primary']]
  });
}

function notFound(p, want) {
  p.appendChild(h('h1', `No HPO term “${want}”`));
  const hits = H.search(want.replace(/^HP[:_]?/i, ''), { limit: 10 });
  p.appendChild(note('warn', h('p', 'The HPO has no current term with that id or name. Terms are written as HP: followed by seven digits, for example HP:0001250 (Seizure).')));
  if (hits.length) {
    p.appendChild(h('h2', { style: { margin: '14px 0 8px' } }, 'Terms with those words'));
    p.appendChild(h('ul.term-list', hits.map((m) => h('li', h('a', { href: link('/phenotype/' + m.term.id) }, m.term.name), ' ', h('span.hpo-id', m.term.id)))));
  } else p.appendChild(empty('Nothing similar', 'Search for the feature in the box at the top of the page.'));
}
