/* What has happened to a patient's record: the changes to the patient and to each variant, newest first,
   and each variant's signed classifications */
import { h, dateStr } from '../core.js';
import { link } from '../router.js';
import { table, clsBadge, empty } from '../ui.js';
import { summariseVariant, signerName } from '../summary.js';
import { variantPath } from './patient-common.js';

export function render(body, { patient: pt, variants: vs }) {
  const events = [];
  for (const e of pt.log || []) events.push({ at: e.at, what: e.what, where: 'Patient', to: `/patient/${pt.id}` });
  for (const v of vs) {
    const s = summariseVariant(v);
    for (const e of v.log || []) events.push({ at: e.at, what: e.what, where: `${s.gene ? s.gene + ' ' : ''}${s.short}`, to: variantPath(pt, v) });
  }
  events.sort((a, b) => String(b.at).localeCompare(String(a.at)));
  // signed classifications, variant by variant
  const signed = [];
  for (const v of vs) {
    const s = summariseVariant(v);
    for (const r of (v.classification && v.classification.history) || []) signed.push(Object.assign({ v, s }, r));
  }
  signed.sort((a, b) => String(b.at).localeCompare(String(a.at)));
  body.appendChild(h('h2.tab-h', 'Signed classifications'));
  body.appendChild(signed.length ? table([
    { key: 'at', label: 'When', fmt: (x) => dateStr(x.at, true), sort: (x) => x.at },
    { key: 'v', label: 'Variant', fmt: (x) => h('a', { href: link(variantPath(pt, x.v)) }, x.s.gene ? h('i.gene', x.s.gene + ' ') : '', h('span.hgvs.small', x.s.short)) },
    { key: 'cls', label: 'Class', fmt: (x) => h('span', clsBadge(x.cls, { short: true }), x.calculated && x.calculated !== x.cls ? h('span.small.muted', ` (calculated ${x.calculated.toUpperCase()})`) : null) },
    { key: 'criteria', label: 'Criteria', fmt: (x) => h('span.hgvs.small', x.criteria || '–') },
    { key: 'by', label: 'By', fmt: (x) => signerName(x.by) || h('span.muted', 'Not named') },
    { key: 'reason', label: 'Reason for a change', fmt: (x) => x.reason || '' }
  ], signed, { compact: true, sortable: true, caption: 'Signed classifications' }) : h('p.muted', 'No classifications have been signed yet. Each time you use “Sign the classification” beside a variant’s criteria, it’s recorded here.'));
  body.appendChild(h('h2.tab-h', 'Changes'));
  if (!events.length) {
    body.appendChild(empty('No changes yet', 'Changes to the patient and their variants will be listed here as you make them.'));
    return;
  }
  body.appendChild(table([
    { key: 'at', label: 'When', fmt: (x) => dateStr(x.at, true), sort: (x) => x.at },
    { key: 'where', label: 'What changed', fmt: (x) => h('a', { href: link(x.to) }, x.where) },
    { key: 'what', label: 'Change' }
  ], events.slice(0, 500), { compact: true, sortable: true, caption: 'Changes to the record' }));
  if (events.length > 500) body.appendChild(h('p.small.muted', `Showing the newest 500 of ${events.length} changes.`));
}
