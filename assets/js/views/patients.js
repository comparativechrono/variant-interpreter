/* The list of patients kept in this browser */
import { h, esc, dateStr, fmt, icon } from '../core.js';
import { go } from '../router.js';
import * as db from '../db.js';
import { page, pageHead, table, empty, linkBtn, btn, clsBadge } from '../ui.js';
import { summariseVariant, patientFacts } from '../summary.js';

export async function render(root) {
  const p = page();
  root.appendChild(p);
  const ps = await db.listPatients();
  const counts = {};
  const best = {};
  for (const x of ps) {
    const vs = await db.variantsOf(x.id);
    counts[x.id] = vs.length;
    best[x.id] = vs.map(summariseVariant);
  }
  p.appendChild(pageHead({
    title: 'Patients',
    lede: ps.length ? `${fmt(ps.length)} ${ps.length === 1 ? 'patient is' : 'patients are'} kept in this browser.` : 'You haven’t added any patients yet.',
    actions: [linkBtn('New patient', '/patient/new', { cls: 'primary', icon: 'plus' }), linkBtn('Open a case', '/data', { icon: 'import' })]
  }));
  if (!ps.length) {
    p.appendChild(empty('Start with a patient', 'Create a new patient, or open one of the example cases or a case file from your tutor.', [linkBtn('New patient', '/patient/new', { cls: 'primary', icon: 'plus' }), linkBtn('Example cases', '/data', { icon: 'book' })]));
    return;
  }
  const filter = h('input', { type: 'search', placeholder: 'Filter by number, reference, phenotype or gene', 'aria-label': 'Filter the patients', style: { maxWidth: '420px' } });
  const rows = ps.map((x) => {
    const genes = Array.from(new Set(best[x.id].map((v) => v.gene).filter(Boolean)));
    return Object.assign({}, x, { _genes: genes, _n: counts[x.id], _vars: best[x.id] });
  });
  const cols = [
    { key: 'id', label: 'Patient', fmt: (r) => h('a', { href: '#/patient/' + r.id }, 'Patient ' + r.id), sort: (r) => +r.id },
    { key: 'ref', label: 'Your reference', fmt: (r) => r.ref || h('span.faint', '–') },
    { key: 'sex', label: 'Sex, age', fmt: (r) => patientFacts(r).short },
    { key: 'pheno', label: 'Phenotypes', fmt: (r) => phenoCell(r), sort: (r) => (r.phenotypes || []).length },
    { key: '_n', label: 'Variants', fmt: (r) => varCell(r), sort: (r) => r._n },
    { key: 'updated', label: 'Changed', fmt: (r) => dateStr(r.updated), sort: (r) => r.updated }
  ];
  const tbl = table(cols, rows, { sortable: true, sortKey: 'updated', sortDir: -1, onRow: (r) => go('/patient/' + r.id), caption: 'Your patients' });
  filter.addEventListener('input', () => {
    const q = filter.value.trim().toLowerCase();
    tbl.redraw(rows.filter((r) => !q || r.id.includes(q) || (r.ref || '').toLowerCase().includes(q) || (r.summary || '').toLowerCase().includes(q) ||
      (r.phenotypes || []).some((t) => (t.name || '').toLowerCase().includes(q)) || r._genes.some((g) => g.toLowerCase().includes(q))));
  });
  p.appendChild(h('div.row', { style: { marginBottom: '12px' } }, filter));
  p.appendChild(tbl);
}

function phenoCell(r) {
  const obs = (r.phenotypes || []).filter((t) => t.observed !== false);
  if (!obs.length) return h('span.faint', 'none recorded');
  const names = obs.slice(0, 3).map((t) => t.name).join('; ');
  return h('span', names + (obs.length > 3 ? `; and ${obs.length - 3} more` : ''));
}
function varCell(r) {
  if (!r._vars.length) return h('span.faint', 'none');
  const box = h('div', { style: { display: 'flex', flexDirection: 'column', gap: '3px' } });
  for (const v of r._vars.slice(0, 4)) {
    box.appendChild(h('div.row', { style: { gap: '6px' } }, clsBadge(v.cls, { short: true, empty: '–' }), h('span', v.gene ? h('i.gene', v.gene) : null, ' ', h('span.hgvs', v.short))));
  }
  if (r._vars.length > 4) box.appendChild(h('span.muted.small', `and ${r._vars.length - 4} more`));
  return box;
}
