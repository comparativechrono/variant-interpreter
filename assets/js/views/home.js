/* The first page: where to start, the patients in this browser and the cases to open */
import { h, esc, icon, fetchJSON, toast, dateStr } from '../core.js';
import { go, link } from '../router.js';
import * as db from '../db.js';
import * as settings from '../settings.js';
import { CFG } from '../settings.js';
import { page, linkBtn, btn, section, clsBadge, note } from '../ui.js';
import { summariseVariant, patientFacts } from '../summary.js';
import { openCase } from './data.js';

export async function render(root) {
  const p = page();
  root.appendChild(p);

  const intro = h('div.home-intro',
    h('div.home-text',
      h('h1', 'Interpret a patient’s variants'),
      h('p.lede', 'Record a patient’s phenotype and family, add the variants from their test, look at the evidence for each from the public databases, and classify it with the ACMG/AMP criteria. Everything you enter stays in this browser.'),
      h('div.btn-row', linkBtn('New patient', '/patient/new', { cls: 'primary', icon: 'plus' }), linkBtn('Open a case', '/data', { icon: 'import' }), linkBtn('Look up a variant', '/variant/NM_000546.6:c.818G>A', { icon: 'search', title: 'Try it with a TP53 variant' }))),
    flow());
  p.appendChild(intro);

  if (!settings.get('name')) {
    const nameIn = h('input', { type: 'text', placeholder: 'Your name', 'aria-label': 'Your name', style: { maxWidth: '260px' } });
    const save = btn('Save', () => {
      settings.set('name', nameIn.value.trim());
      nb.remove();
      toast('Your name will go on your classifications and reports.', 'ok');
    }, { cls: 'small' });
    nameIn.addEventListener('keydown', (e) => e.key === 'Enter' && save.click());
    const nb = note('', h('p', h('b', 'What should your classifications be signed with? '), 'Your name goes on each classification you save and on your reports, as a laboratory’s classifier’s would. It is kept in this browser.'), h('div.row', nameIn, save));
    p.appendChild(nb);
  }

  const ps = await db.listPatients();
  const recent = h('div');
  p.appendChild(section('Your patients', { tools: ps.length ? [linkBtn('All patients', '/patients', { cls: 'small' })] : null }, recent));
  if (!ps.length) {
    recent.appendChild(h('p.muted', 'None yet. Make one, or open an example case below to see how a finished interpretation looks.'));
  } else {
    const list = h('div.patient-cards');
    for (const x of ps.slice(0, 6)) {
      const vs = (await db.variantsOf(x.id)).map(summariseVariant);
      const obs = (x.phenotypes || []).filter((t) => t.observed !== false);
      list.appendChild(h('a.pcard', { href: link('/patient/' + x.id) },
        h('div.pcard-h', h('b', 'Patient ' + x.id), x.ref ? h('span.muted', x.ref) : null),
        h('div.small.muted', patientFacts(x).short || 'Sex and age not recorded'),
        h('div.small.faint', 'Changed ', dateStr(x.updated)),
        h('div.pcard-ph', obs.length ? obs.slice(0, 4).map((t) => t.name).join(', ') + (obs.length > 4 ? '…' : '') : h('span.faint', 'No phenotypes yet')),
        h('div.pcard-v', vs.length ? vs.slice(0, 3).map((v) => h('span.row', { style: { gap: '6px' } }, clsBadge(v.cls, { short: true, empty: '–' }), v.gene ? h('i.gene', v.gene) : null, h('span.hgvs.small', v.short))) : h('span.faint.small', 'No variants yet'))));
    }
    recent.appendChild(list);
  }

  // the example cases and any the site's owner added
  const casesBox = h('div', h('p.muted', 'Loading the cases…'));
  p.appendChild(section('Cases to practise on', { tools: [linkBtn('All cases and files', '/data', { cls: 'small' })] }, casesBox));
  try {
    const idx = await fetchJSON(CFG.cases || 'data/cases/index.json');
    casesBox.innerHTML = '';
    const grid = h('div.case-cards');
    for (const c of idx.cases || []) {
      const b = h('button.ccard', { type: 'button' },
        h('b', c.title), h('span.small.muted', c.teaser || ''),
        h('span.ccard-tags', (c.tags || []).map((t) => h('span.tag', t))));
      b.addEventListener('click', () => openCase(c));
      grid.appendChild(b);
    }
    casesBox.appendChild(grid);
  } catch (e) {
    casesBox.innerHTML = '';
    casesBox.appendChild(h('p.muted', 'The list of cases could not be read: ' + e.message));
  }
}

/** the work, in order: a real sequence, so it is numbered */
function flow() {
  const steps = [
    ['patient', 'Patient', 'Sex, age, the reason for testing'],
    ['phenotype', 'Phenotype', 'HPO terms, observed or excluded'],
    ['pedigree', 'Family', 'Relatives, a pedigree, who carries what'],
    ['dna', 'Variants', 'From HGVS, coordinates, a VCF or a CNV'],
    ['microscope', 'Evidence', 'Population, predictions, ClinVar, protein, splicing'],
    ['scale', 'Classification', 'ACMG/AMP criteria, points and a class'],
    ['report', 'Report', 'The evidence and the decision, to print']
  ];
  const ol = h('ol.flow', { 'aria-label': 'How an interpretation goes' });
  steps.forEach(([ic, t, s]) => ol.appendChild(h('li', h('span.flow-ic', { html: icon(ic) }), h('span.flow-t', t), h('span.flow-s', s))));
  return ol;
}
