/* =====================================================================
   Pieces shared by the evidence sections of a variant's page.
   ===================================================================== */
import { h, icon } from '../core.js';
import { criterionRow } from '../widgets/acmg-panel.js';
import { loading, note } from '../ui.js';

/* ---------------- shared pieces ---------------- */
export function crits(ctx, codes, title = 'Criteria from this evidence') {
  const box = h('div.sec-crit', h('div.sec-crit-h', title));
  for (const c of codes) box.appendChild(criterionRow(ctx.cls, c, { where: 'sec' }));
  return box;
}
export function waiting(ctx, src, text) {
  const st = ctx.ev && ctx.ev.status ? ctx.ev.status[src] : 'loading';
  if (st === 'error') return note('bad', h('p', `${text} could not be fetched: ${ctx.ev.errors[src]}. The rest of the page still works; try “Fetch the annotation again” from the ⋯ menu in a minute.`));
  if (!st || st === 'loading') return loading(`Asking ${text}…`);
  return null;
}
export function sectionNote(ctx, key) {
  const v = ctx.v;
  v.notes = v.notes || {};
  const ta = h('textarea.sec-notes', { rows: 2, placeholder: 'Your notes on this evidence (kept with the variant)' });
  ta.value = v.notes[key] || '';
  ta.addEventListener('change', () => {
    v.notes[key] = ta.value.trim();
    ctx.save();
  });
  return h('details.sec-notes-box', { open: v.notes[key] ? true : null }, h('summary', 'Your notes'), ta);
}
export const stars = (n) => h('span.stars', { title: `${n} of 4 stars`, 'aria-label': `${n} of 4 stars` }, '★'.repeat(n) + '☆'.repeat(Math.max(0, 4 - n)));
export const ext = (href, text) => h('a', { href, target: '_blank', rel: 'noopener' }, text);
export const kv = (rows) => h('table.kv', h('tbody', rows.filter(Boolean).map(([k, v]) => h('tr', h('th', { scope: 'row' }, k), h('td', v == null || v === '' ? h('span.faint', '–') : v)))));
export const ancestryOf = (pt) => (pt && pt.ancestryGroup) || null;

