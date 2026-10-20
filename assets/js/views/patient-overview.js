/* =====================================================================
   A patient at a glance: the variants and where they are in the genome,
   the clinical story, the phenotype, the family, what is left to do,
   and the overall assessment: does the genotype explain the phenotype?
   ===================================================================== */
import { h, icon, toast, dateStr, nowISO, safeHTML, fetchJSON } from '../core.js';
import { go, link } from '../router.js';
import * as db from '../db.js';
import * as settings from '../settings.js';
import { btn, linkBtn, select, field, note, clsBadge } from '../ui.js';
import { summariseVariant, variantLong, signerName } from '../summary.js';
import { variantTable, variantPath } from './patient-common.js';
import { addSequenceDialog, addCnvDialog } from './patient-add.js';
import { karyogram } from '../widgets/karyogram.js';
import { familyList } from './patient-family.js';

const CLS_WORD = { p: 'Pathogenic', lp: 'Likely pathogenic', vus: 'Uncertain significance', lb: 'Likely benign', b: 'Benign' };

export async function render(body, { patient: pt, variants: vs, refresh, query = {} }) {
  const grid = h('div.ov-grid');
  const main = h('div.ov-main');
  const side = h('div.ov-side');
  grid.append(main, side);
  body.appendChild(grid);

  /* ---------- the case, for a patient opened from a case file: its brief and what to do ---------- */
  const theCase = await caseOf(pt);
  if (theCase) main.appendChild(caseBox(theCase, vs, query.case === 'open'));

  /* ---------- variants ---------- */
  const vbox = h('section.ov-sec', { 'aria-labelledby': 'ov-v' });
  vbox.appendChild(h('div.ov-sec-h', h('h2', { id: 'ov-v', html: icon('dna') + '<span>Variants</span>' }),
    h('div.btn-row', btn('Add a variant', () => addSequenceDialog(pt, vs), { cls: 'small primary', icon: 'plus' }), btn('Add a CNV', () => addCnvDialog(pt), { cls: 'small', icon: 'region' }), vs.length ? linkBtn('All variants', `/patient/${pt.id}/variants`, { cls: 'small' }) : null)));
  if (vs.length) vbox.appendChild(variantTable(pt, vs, { compact: true }));
  else vbox.appendChild(h('p.muted', 'You haven’t added any variants yet. Add the ones the patient’s test found, or import a VCF file on the Variants tab.'));
  main.appendChild(vbox);

  /* ---------- the genome at a glance ---------- */
  const builds = vs.reduce((m, v) => ((m[v.assembly || 'GRCh38'] = (m[v.assembly || 'GRCh38'] || 0) + 1), m), {});
  const asm = Object.keys(builds).sort((a, b) => builds[b] - builds[a])[0] || settings.get('assembly');
  const kbox = h('section.ov-sec', { 'aria-labelledby': 'ov-k' });
  kbox.appendChild(h('div.ov-sec-h', h('h2', { id: 'ov-k', html: icon('chromosome') + '<span>The genome at a glance</span>' }), linkBtn('Genome browser', `/patient/${pt.id}/browser`, { cls: 'small', icon: 'genome' })));
  const marks = vs.filter((v) => (v.assembly || 'GRCh38') === asm && v.chrom).map((v) => {
    const s = summariseVariant(v);
    return { chrom: v.chrom, start: v.kind === 'cnv' ? v.start : v.pos, end: v.kind === 'cnv' ? v.end : v.pos, cnv: v.kind === 'cnv', cls: s.assessed === false ? null : s.cls, label: `${s.gene ? s.gene + ' ' : ''}${s.short}`, clsText: s.assessed === false ? 'not assessed yet' : s.cls ? CLS_WORD[s.cls] + (s.final ? '' : ' (so far)') : 'not classified', href: link(variantPath(pt, v)) };
  });
  karyogram(kbox, { assembly: asm, marks });
  if (Object.keys(builds).length > 1) kbox.appendChild(h('p.small.muted', `Some variants are on another build (${Object.keys(builds).filter((b) => b !== asm).join(', ')}), so they aren’t drawn here.`));
  main.appendChild(kbox);

  /* ---------- the overall assessment ---------- */
  main.appendChild(await assessment(pt, vs, refresh));

  /* ---------- the clinical story ---------- */
  const cs = h('section.ov-sec.ov-card', { 'aria-labelledby': 'ov-c' });
  cs.appendChild(h('div.ov-sec-h', h('h2', { id: 'ov-c', html: icon('patient') + '<span>Clinical summary</span>' }), linkBtn('Edit', `/patient/${pt.id}/edit`, { cls: 'small', icon: 'pencil' })));
  const story = [
    ['Reason for testing', pt.referral],
    ['Summary', pt.summary],
    ['Family history', pt.familyHistory],
    ['Test', pt.test && pt.test.type ? [pt.test.type, pt.test.panel && pt.test.panel.name ? `(${pt.test.panel.name}${pt.test.panel.version ? ' v' + pt.test.panel.version : ''})` : '', pt.test.lab ? `at ${pt.test.lab}` : '', pt.test.date ? `on ${pt.test.date}` : ''].filter(Boolean).join(' ') : ''],
    ['Notes', pt.notes]
  ].filter(([, v]) => v);
  cs.appendChild(story.length ? h('dl.ov-story', story.map(([k, v]) => [h('dt', k), h('dd', v)])) : h('p.muted', 'Nothing has been recorded yet. Use Edit to add why the patient was tested, their history and the test they had.'));
  side.appendChild(cs);

  /* ---------- the phenotype ---------- */
  const obs = (pt.phenotypes || []).filter((t) => t.observed !== false);
  const exc = (pt.phenotypes || []).filter((t) => t.observed === false);
  const ph = h('section.ov-sec.ov-card', { 'aria-labelledby': 'ov-p' });
  ph.appendChild(h('div.ov-sec-h', h('h2', { id: 'ov-p', html: icon('phenotype') + '<span>Phenotype</span>' }), linkBtn(obs.length || exc.length ? 'Change' : 'Add terms', `/patient/${pt.id}/phenotypes`, { cls: 'small', icon: obs.length ? 'pencil' : 'plus' })));
  if (obs.length) ph.appendChild(h('ul.chips', obs.map((t) => h('li', h('a.chip', { href: link('/phenotype/' + t.id), title: t.id }, t.name)))));
  if (exc.length) ph.appendChild(h('div', h('p.small.muted', 'Looked for and absent:'), h('ul.chips', exc.map((t) => h('li', h('a.chip.absent', { href: link('/phenotype/' + t.id), title: t.id + ': absent' }, t.name))))));
  if (!obs.length && !exc.length) ph.appendChild(h('p.muted', 'You haven’t added any HPO terms yet. They drive the search for diseases that fit, and the case for PP4.'));
  else ph.appendChild(h('p.small', h('a', { href: link(`/match?patient=${pt.id}`) }, 'Diseases, genes and patients that match this phenotype')));
  side.appendChild(ph);

  /* ---------- the family ---------- */
  const fam = h('section.ov-sec.ov-card', { 'aria-labelledby': 'ov-f' });
  // (worked out from the drawing, which is what counts: a case file may bring a drawing without the list)
  const rel = (await familyList(pt)).filter((r) => r.relation !== 'proband');
  fam.appendChild(h('div.ov-sec-h', h('h2', { id: 'ov-f', html: icon('pedigree') + '<span>Family</span>' }), linkBtn(pt.pedigree ? 'Pedigree' : 'Draw the family', `/patient/${pt.id}/family`, { cls: 'small', icon: 'pedigree' })));
  if (pt.consanguinity === 'yes') fam.appendChild(h('p', h('span.tag.warn', 'Parents related')));
  if (rel.length) {
    const aff = rel.filter((r) => r.affected === 'affected');
    const and = (xs) => (xs.length < 2 ? xs.join('') : xs.slice(0, -1).join(', ') + ' and ' + xs[xs.length - 1]);
    fam.appendChild(h('p', `The pedigree has ${rel.length} ${rel.length === 1 ? 'relative' : 'relatives'}${aff.length ? `. The affected ${aff.length === 1 ? 'one is the' : 'ones are the'} ${and(aff.map((r) => r.relation))}` : ', none of them affected'}.`));
  } else fam.appendChild(h('p.muted', pt.familyHistory ? 'You haven’t drawn the pedigree yet.' : 'You haven’t recorded the family yet.'));
  side.appendChild(fam);

  /* ---------- what is left to do ---------- */
  side.appendChild(progress(pt, vs));
}

/** the steps of the work, with what has been done */
function progress(pt, vs) {
  const S = vs.map((v) => [v, summariseVariant(v)]);
  const touched = (v) => (v.kind === 'cnv' ? Object.values((v.cnv && v.cnv.items) || {}).some((x) => x && x.on) : Object.keys((v.classification && v.classification.criteria) || {}).length > 0);
  const obs = (pt.phenotypes || []).filter((t) => t.observed !== false).length;
  const steps = [
    ['Sex, age and the reason for testing', pt.sex !== 'unknown' && (pt.age && (pt.age.years != null || pt.age.months != null) || pt.prenatal) && !!pt.referral, `/patient/${pt.id}/edit`],
    [`HPO terms for the phenotype (${obs})`, obs >= 3 ? true : obs ? 'part' : false, `/patient/${pt.id}/phenotypes`],
    ['Pedigree and relatives’ results', pt.pedigree && (pt.pedigree.persons || []).length > 1, `/patient/${pt.id}/family`],
    [`Variants added (${vs.length})`, vs.length > 0, `/patient/${pt.id}/variants`],
    ['Evidence weighed for each variant', vs.length ? (S.every(([v]) => touched(v)) ? true : S.some(([v]) => touched(v)) ? 'part' : false) : false, `/patient/${pt.id}/variants`],
    ['Each classification signed', vs.length ? (S.every(([, s]) => s.final) ? true : S.some(([, s]) => s.final) ? 'part' : false) : false, `/patient/${pt.id}/variants`],
    ['Overall assessment recorded', !!(pt.assessment && pt.assessment.conclusion), '#ov-a'],
    ['Report', null, `/patient/${pt.id}/report`]
  ];
  const box = h('section.ov-sec.ov-card', { 'aria-labelledby': 'ov-todo' });
  box.appendChild(h('div.ov-sec-h', h('h2', { id: 'ov-todo', html: icon('circleCheck') + '<span>Progress</span>' })));
  box.appendChild(h('ol.todo', steps.map(([t, done, to]) => h('li.todo-' + (done === true ? 'done' : done === 'part' ? 'part' : 'open'),
    h('span.todo-mark', { 'aria-hidden': 'true', html: icon(done === true ? 'circleCheck' : done === 'part' ? 'circle' : 'circle') }),
    h('a', { href: to.startsWith('#') ? to : link(to) }, t),
    h('span.visually-hidden', done === true ? ' (done)' : done === 'part' ? ' (partly done)' : done === false ? ' (to do)' : '')))));
  return box;
}

/* ---------------- the overall assessment ---------------- */
/* Whether the patient's genotype explains their phenotype, weighed row by row. Clinical genomics databases
   record such an assessment beside the variants' classes: a variant can be pathogenic and still not explain
   this patient's features. Each row is evidence for or against the diagnosis, at a strength. */
export const ASSESS_ROWS = [
  ['footprint', 'Genomic footprint of the phenotype', 'Are all the patient’s features explained by the gene or region, or only some, which may point to a second diagnosis?'],
  ['onset', 'Age at onset', 'Does it fit the disease’s usual age at onset?'],
  ['fit', 'Clinical fit', 'How closely do the features match the disease, including key features that are present or absent?'],
  ['severity', 'Severity and progression', 'Is it as expected for the disease, or milder or more severe?'],
  ['investigations', 'Other investigations', 'Do biochemistry, imaging, histology or functional tests support the diagnosis or argue against it?'],
  ['family', 'Family history', 'Do affected and unaffected relatives fit the inheritance and the variants?']
];
export const ASSESS_LEVELS = [['', 'Not assessed'], ['SVS', 'For: very strong'], ['SS', 'For: strong'], ['SM', 'For: moderate'], ['SP', 'For: supporting'], ['N', 'Neutral'], ['NP', 'Against: supporting'], ['NS', 'Against: strong']];
export const CONCLUSIONS = [['', 'Not decided'], ['confirmed', 'Genetic diagnosis confirmed'], ['likely', 'Genetic diagnosis likely'], ['uncertain', 'Genetic diagnosis uncertain'], ['nonpenetrant', 'Not affected yet (presymptomatic)'], ['carrier', 'Carrier'], ['none', 'No genetic diagnosis established']];
export const conclusionText = (k) => (CONCLUSIONS.find((c) => c[0] === (k || '')) || [null, 'Not decided'])[1];

async function assessment(pt, vs, refresh) {
  const a = pt.assessment || { rows: {}, variants: [], disease: '', conclusion: '', note: '' };
  a.rows = a.rows || {};
  const box = h('section.ov-sec', { id: 'ov-a', 'aria-labelledby': 'ov-ah' });
  box.appendChild(h('div.ov-sec-h', h('h2', { id: 'ov-ah', html: icon('scale') + '<span>Overall assessment</span>' })));
  box.appendChild(h('p.small.muted', 'Does the genotype explain the phenotype? A variant can be pathogenic but still not explain this patient’s features, or explain only some of them. Weigh the clinical evidence row by row, then record your conclusion.'));
  // the variants it is about, and the disease
  const vlist = h('div.assess-vars', { role: 'group', 'aria-label': 'The variants the diagnosis rests on' });
  for (const v of vs) {
    const s = summariseVariant(v);
    const b = h('input', { type: 'checkbox', value: v.id });
    b.checked = (a.variants || []).includes(v.id);
    vlist.appendChild(h('label.check', b, h('span', s.gene ? h('i.gene', s.gene + ' ') : '', h('span.hgvs.small', s.short), ' ', clsBadge(s.cls, { short: true, empty: '–' }))));
  }
  const genes = Array.from(new Set(vs.map((v) => v.gene).filter(Boolean)));
  const disease = h('input', { type: 'text', value: a.disease || '', placeholder: 'e.g. Li-Fraumeni syndrome (OMIM:151623)', list: 'assess-dis-' + pt.id });
  const dl = h('datalist', { id: 'assess-dis-' + pt.id });
  if (genes.length) {
    import('../hpo.js').then(async (H) => {
      for (const g of genes.slice(0, 8)) {
        try {
          for (const d of (await H.diseasesOfGene(g)) || []) dl.appendChild(h('option', { value: `${d.name} (${d.id})` }));
        } catch (e) {
          /* no annotations: free text still works */
        }
      }
    });
  }
  const rows = ASSESS_ROWS.map(([key, label, help]) => {
    const s = select(ASSESS_LEVELS, a.rows[key] || '', { 'aria-label': label });
    s.dataset.key = key;
    return [key, label, help, s];
  });
  const concl = select(CONCLUSIONS, a.conclusion || '');
  const noteIn = h('textarea', { rows: 3, placeholder: 'Your reasoning in a few sentences, as you’d write it in a report' });
  noteIn.value = a.note || '';
  const tally = h('p.small', { 'aria-live': 'polite' });
  const count = () => {
    const vals = rows.map((r) => r[3].value).filter(Boolean);
    const forN = vals.filter((x) => x.startsWith('S')).length, against = vals.filter((x) => x.startsWith('N') && x !== 'N').length;
    tally.textContent = vals.length ? `${forN} ${forN === 1 ? 'row' : 'rows'} for the diagnosis, ${against} against, ${vals.filter((x) => x === 'N').length} neutral.` : '';
  };
  rows.forEach((r) => r[3].addEventListener('change', count));
  count();
  box.append(
    field('The variants the diagnosis rests on', vlist),
    field('The disease', disease, 'Pick from the diseases linked to these genes in the HPO annotations, or type your own.'), dl,
    h('div.assess-grid', rows.map(([key, label, help, s]) => h('div.assess-row', h('div', h('b', label), h('div.small.muted', help)), s))),
    tally,
    h('div.fields', field('Conclusion', concl)),
    field('Reasoning', noteIn),
    h('div.btn-row', btn('Save the assessment', async () => {
      pt.assessment = {
        variants: Array.from(vlist.querySelectorAll('input:checked')).map((x) => x.value),
        disease: disease.value.trim(), rows: Object.fromEntries(rows.map(([k, , , s]) => [k, s.value])), conclusion: concl.value, note: noteIn.value.trim(),
        at: nowISO(), by: settings.get('name') || 'not named'
      };
      await db.savePatient(pt, `Assessment: ${conclusionText(concl.value)}${pt.assessment.disease ? ' (' + pt.assessment.disease + ')' : ''}`);
      toast('Assessment saved.', 'ok');
      if (refresh) refresh();
    }, { cls: 'primary', icon: 'save' }), a.at ? h('span.small.muted', `Last saved ${dateStr(a.at, true)}${signerName(a.by) ? ' by ' + a.by : ''}`) : null));
  return box;
}
export { go, note, variantLong };

/* ---------------- the case ---------------- */
/** a case's brief and tasks: kept with the patient when the case was opened, or read from the site's list of cases */
async function caseOf(pt) {
  if (pt.case && (pt.case.brief || (pt.case.tasks || []).length)) return pt.case;
  if (!pt.caseId) return null;
  try {
    const idx = await fetchJSON('data/cases/index.json');
    const entry = (idx.cases || []).find((c) => c.id === pt.caseId);
    if (!entry) return null;
    const doc = await fetchJSON(entry.file);
    const c = doc.case || {};
    return { id: pt.caseId, title: c.title || entry.title || '', brief: c.brief || '', tasks: c.tasks || [], source: c.source || '' };
  } catch (e) {
    return null;
  }
}
function caseBox(c, vs, force) {
  // open until the student has signed a classification (or asked for it from the Case tag)
  const open = force || !vs.some((v) => v.classification && v.classification.saved);
  const box = h('details.ov-sec.ov-card.ov-case', { open: open || null },
    h('summary', h('span.ic', { html: icon('book') }), h('span', 'The case'), c.title ? h('span.case-title', c.title) : null),
    c.brief ? h('div.case-brief', safeHTML(c.brief)) : null,
    (c.tasks || []).length ? [h('h3', 'What to do'), h('ol.case-tasks', c.tasks.map((t) => h('li', t)))] : null,
    h('p.small.muted', 'Once you’ve signed your classification, you’ll find the case’s answer under Conclusion on each variant’s page.'),
    c.source ? h('p.small.muted', c.source) : null);
  return box;
}
