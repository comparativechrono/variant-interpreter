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
  if (st === 'error') return note('bad', h('p', `The data from ${text} couldn’t be fetched: ${ctx.ev.errors[src]}. The rest of the page still works, and you can try “Fetch the annotation again” from the ⋯ menu in a minute.`));
  if (!st || st === 'loading') return loading(`Asking ${text}…`);
  return null;
}
/** keep what is being typed in a part of the page across drawing it again: call before emptying it, and call
    the function it returns once the new content is in (the text, the focus and the caret come back) */
export function keepTyping(container) {
  const a = document.activeElement;
  if (!a || !container.contains(a) || !/^(TEXTAREA|INPUT)$/.test(a.tagName)) return null;
  let sel = null;
  if (a.matches('textarea.sec-notes')) sel = 'textarea.sec-notes';
  else if (a.closest('.crow-note') && a.closest('.crow')) sel = `.crow[data-code="${a.closest('.crow').dataset.code}"] .crow-note input`;
  if (!sel) return null;
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

/** draw one section of a variant's or a CNV's page ({ S: {draw}, body }). Each drawing gets a box of its own, so
    that an older one still finishing (an asynchronous section drawn again when more data came) writes into a box
    no longer shown rather than beside the new one; and a note being typed is carried over to the newest */
export function drawSectionInto(s, ctx) {
  const kept = keepTyping(s.body) || s.keep || null;
  s.keep = kept;
  const token = {};
  s.token = token;
  s.body.innerHTML = '';
  const box = h('div.vsec-c');
  s.body.appendChild(box);
  const fail = (e) => {
    console.error(e);
    if (s.token === token) box.appendChild(note('bad', h('p', 'This section couldn’t be shown because of an error: ' + e.message)));
  };
  const done = () => {
    if (s.token !== token) return;
    s.keep = null;
    if (kept) kept();
  };
  try {
    const out = s.S.draw(ctx, box);
    if (out && out.then) out.then(done, fail);
    else done();
  } catch (e) {
    fail(e);
  }
}

export function sectionNote(ctx, key) {
  const v = ctx.v;
  v.notes = v.notes || {};
  const ta = h('textarea.sec-notes', { rows: 2, placeholder: 'Your notes on this evidence, saved with the variant' });
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

