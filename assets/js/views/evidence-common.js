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
/** keep what is being typed in a part of the page across drawing it again: call before emptying it, and call
    the function it returns once the new content is in (the text, the focus and the caret come back) */
export function keepTyping(container) {
  const a = document.activeElement;
  if (!a || !container.contains(a) || !/^(TEXTAREA|INPUT)$/.test(a.tagName)) return () => {};
  let sel = null;
  if (a.matches('textarea.sec-notes')) sel = 'textarea.sec-notes';
  else if (a.closest('.crow-note') && a.closest('.crow')) sel = `.crow[data-code="${a.closest('.crow').dataset.code}"] .crow-note input`;
  if (!sel) return () => {};
  const value = a.value;
  const start = a.selectionStart;
  const end = a.selectionEnd;
  return () => {
    const b = container.querySelector(sel);
    if (!b || b === a) return;
    if (b.value !== value) b.value = value;
    const d = b.closest('details');
    if (d) d.open = true;
    b.focus({ preventScroll: true });
    try {
      b.setSelectionRange(start, end);
    } catch (e) {
      /* not a text field */
    }
  };
}

export function sectionNote(ctx, key) {
  const v = ctx.v;
  v.notes = v.notes || {};
  const ta = h('textarea.sec-notes', { rows: 2, placeholder: 'Your notes on this evidence (kept with the variant)' });
  ta.value = v.notes[key] || '';
  // kept as it is typed (a section drawn again when its data arrive shows it still), tidied when the box is left
  ta.addEventListener('input', () => {
    v.notes[key] = ta.value;
    ctx.save();
  });
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

