/* The first page: the logo and the tool's name, where to start, the patients in this browser and the cases to open */
import { h, fetchJSON, toast, dateStr } from '../core.js';
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

  // the masthead: the logo (the site's mark, larger and in more detail), the name and where to start
  p.appendChild(h('section.home-hero', { 'aria-labelledby': 'home-name' },
    h('img.home-logo', { src: 'assets/img/logo.svg', width: 192, height: 192, alt: '' }),
    h('div.home-hero-text',
      h('h1.home-name', { id: 'home-name' }, 'Variant interpreter'),
      h('p.home-tag', 'For teaching clinical genomics'),
      h('p.lede', 'Practise interpreting genetic test results the way a clinical genomics laboratory does. Record a patient’s features and family history, add the variants their test found, weigh up the evidence from the public databases and classify each variant with the ACMG/AMP criteria. Everything you enter stays in your own browser.'),
      h('div.btn-row', linkBtn('New patient', '/patient/new', { cls: 'primary', icon: 'plus' }), linkBtn('Open a case', '/data', { icon: 'import' }), linkBtn('Look up a variant', '/variant/NM_000546.6:c.818G>A', { icon: 'search', title: 'Try it with a TP53 variant' })),
      h('p.home-copy', '© 2026 Chronomic Medicine Group'))));

  if (!settings.get('name')) {
    const nameIn = h('input', { type: 'text', placeholder: 'Your name', 'aria-label': 'Your name', style: { maxWidth: '260px' } });
    const save = btn('Save', () => {
      settings.set('name', nameIn.value.trim());
      nb.remove();
      toast('Saved. Your name will go on your classifications and reports.', 'ok');
    }, { cls: 'small' });
    nameIn.addEventListener('keydown', (e) => e.key === 'Enter' && save.click());
    const nb = note('', h('p', h('b', 'What name should go on your classifications? '), 'When you sign a classification your name is recorded with it and printed on your reports, just as a laboratory scientist’s would be. It’s kept only in this browser.'), h('div.row', nameIn, save));
    p.appendChild(nb);
  }

  const ps = await db.listPatients();
  const recent = h('div');
  p.appendChild(section('Your patients', { tools: ps.length ? [linkBtn('All patients', '/patients', { cls: 'small' })] : null }, recent));
  if (!ps.length) {
    recent.appendChild(h('p.muted', 'You haven’t added any patients yet. Create one with “New patient”, or open one of the practice cases below to get started.'));
  } else {
    const list = h('div.patient-cards');
    for (const x of ps.slice(0, 6)) {
      const vs = (await db.variantsOf(x.id)).map(summariseVariant);
      const obs = (x.phenotypes || []).filter((t) => t.observed !== false);
      list.appendChild(h('a.pcard', { href: link('/patient/' + x.id) },
        h('div.pcard-h', h('b', 'Patient ' + x.id), x.ref ? h('span.muted', x.ref) : null),
        h('div.small.muted', patientFacts(x).short || 'Sex and age not recorded'),
        h('div.small.faint', 'Last changed ', dateStr(x.updated)),
        h('div.pcard-ph', obs.length ? obs.slice(0, 4).map((t) => t.name).join(', ') + (obs.length > 4 ? '…' : '') : h('span.faint', 'No phenotypes recorded yet')),
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
    casesBox.appendChild(h('p.muted', `The list of cases couldn’t be loaded (${e.message}). Try reloading the page.`));
  }
}

