/* =====================================================================
   Pieces that many pages share: page headings, sections, tabs, badges
   for classifications and criteria, tables and form fields.
   ===================================================================== */
import { h, esc, icon, fmt } from './core.js';
import { link } from './router.js';
import { get as setting } from './settings.js';
import { labelFor } from './acmg/frameworks.js';

export function page(cls) {
  return h('div.page' + (cls ? '.' + cls : ''));
}

/** crumbs: [[label, path], ...]; the last has no link */
export function crumbs(items) {
  const nav = h('nav.crumbs', { 'aria-label': 'You are here' });
  items.forEach(([label, path], i) => {
    if (i) nav.appendChild(h('span.sep', { 'aria-hidden': 'true' }, '›'));
    nav.appendChild(path && i < items.length - 1 ? h('a', { href: link(path) }, label) : h('span', { 'aria-current': i === items.length - 1 ? 'page' : null }, label));
  });
  return nav;
}

export function pageHead({ title, titleNode, lede, facts, actions, extra }) {
  return h('div.page-head',
    h('div.titles',
      h('h1', titleNode || title),
      lede ? h('p.lede', lede) : null,
      facts ? factList(facts) : null,
      extra || null),
    actions && actions.length ? h('div.actions', actions) : null);
}

/** [[label, value], ...] → labelled values in a row (values may be nodes) */
export function factList(pairs) {
  const dl = h('dl.facts');
  for (const [k, v] of pairs) {
    if (v == null || v === '') continue;
    dl.appendChild(h('div', h('dt', k), h('dd', v)));
  }
  return dl;
}

export function section(title, opts = {}, ...body) {
  const head = h('div.section-h', h(opts.level || 'h2', opts.icon ? { html: icon(opts.icon) + esc(title) } : title), opts.tools ? h('div.tools', opts.tools) : null);
  return h('section.section', { id: opts.id || null, 'aria-label': title }, head, ...body);
}

export function btn(label, onclick, opts = {}) {
  const b = h('button.btn' + (opts.cls ? '.' + opts.cls.split(' ').join('.') : ''), { type: 'button', title: opts.title || null, disabled: opts.disabled || null, 'aria-label': opts.aria || null });
  b.innerHTML = (opts.icon ? icon(opts.icon) : '') + (label ? `<span>${esc(label)}</span>` : '');
  if (onclick) b.addEventListener('click', onclick);
  return b;
}
export function linkBtn(label, path, opts = {}) {
  const a = h('a.btn' + (opts.cls ? '.' + opts.cls.split(' ').join('.') : ''), { href: path.startsWith('http') ? path : link(path), title: opts.title || null });
  if (path.startsWith('http')) {
    a.target = '_blank';
    a.rel = 'noopener';
  }
  a.innerHTML = (opts.icon ? icon(opts.icon) : '') + `<span>${esc(label)}</span>`;
  return a;
}
export function ext(href, text, opts = {}) {
  const a = h('a', { href, target: '_blank', rel: 'noopener', title: opts.title || null, class: opts.cls || null }, text);
  return a;
}

/** tabs as links: [[key, label, path, count]] */
export function tabs(items, activeKey, label = 'Sections') {
  const nav = h('nav.tabs', { 'aria-label': label });
  for (const [key, text, path, count, ic] of items) {
    const a = h('a', { href: link(path), 'aria-current': key === activeKey ? 'page' : null, dataset: { key } });
    a.innerHTML = (ic ? icon(ic) : '') + `<span>${esc(text)}</span>` + (count != null ? ` <span class="count">${esc(count)}</span>` : '');
    nav.appendChild(a);
  }
  return nav;
}

export function empty(title, text, actions) {
  return h('div.empty', h('h3', title), text ? h('p', text) : null, actions ? h('div.row', actions) : null);
}
export function note(kind, ...body) {
  return h('div.note' + (kind ? '.' + kind : ''), ...body);
}
export function loading(text = 'Loading…') {
  return h('div.loading', h('span.spinner'), h('span', text));
}

/* ---------------- classifications ---------------- */
export const CLASSES = [
  { key: 'p', label: 'Pathogenic', short: 'P' },
  { key: 'lp', label: 'Likely pathogenic', short: 'LP' },
  { key: 'vus', label: 'Uncertain significance', short: 'VUS' },
  { key: 'lb', label: 'Likely benign', short: 'LB' },
  { key: 'b', label: 'Benign', short: 'B' }
];
export const classOf = (key) => CLASSES.find((c) => c.key === key) || null;
export const VUS_BANDS = {
  hot: 'Hot', warm: 'Warm', tepid: 'Tepid', cool: 'Cool', cold: 'Cold', icecold: 'Ice cold'
};
/** the badge for a classification: key p/lp/vus/lb/b, with points and a VUS band if given */
export function clsBadge(key, opts = {}) {
  const c = classOf(key);
  if (!c) return h('span.cls.none', opts.empty || 'Not classified');
  const el = h('span.cls.' + c.key + (opts.big ? '.big' : ''), { title: opts.title || null }, opts.short ? c.short : c.label);
  if (opts.points != null) el.appendChild(h('span.pts', ` ${opts.points > 0 ? '+' : ''}${fmt(opts.points, 0)}`));
  if (opts.band && key === 'vus') return h('span.row', { style: { gap: '4px', display: 'inline-flex' } }, el, h('span.vusband.' + opts.band, VUS_BANDS[opts.band]));
  return el;
}

/** the chip for a criterion: its code with the strength, named as the user's guidelines name it
    (PM2_Supporting for ClinGen, PM2_sup for the ACGS); opts.framework to name it another way */
export function critChip(code, strength, opts = {}) {
  const label = opts.framework || setting('framework') ? labelFor(code, strength || defaultStrength(code), opts.framework || setting('framework')) : critLabel(code, strength);
  const kind = strengthKind(code, strength);
  return h('span.crit.' + kind + (opts.suggested ? '.suggested' : ''), { title: opts.title || null }, label);
}
const DEFAULT_STRENGTH = { PVS: 'VS', PS: 'S', PM: 'M', PP: 'P', BA: 'SA', BS: 'S', BP: 'P' };
const STRENGTH_WORD = { VS: 'Very strong', S: 'Strong', M: 'Moderate', P: 'Supporting', SA: 'Stand-alone' };
export const strengthWord = (s) => STRENGTH_WORD[s] || s;
export function defaultStrength(code) {
  const m = /^(PVS|PS|PM|PP|BA|BS|BP)/.exec(code);
  return m ? DEFAULT_STRENGTH[m[1]] : null;
}
export function critLabel(code, strength) {
  if (!strength || strength === defaultStrength(code)) return code;
  return `${code}_${STRENGTH_WORD[strength].replace(' ', '')}`;
}
export function strengthKind(code, strength) {
  const benign = /^B/.test(code);
  const s = strength || defaultStrength(code);
  if (benign) return s === 'SA' ? 'ba' : s === 'S' || s === 'VS' ? 'bs' : 'bp';
  return s === 'VS' ? 'pvs' : s === 'S' ? 'ps' : s === 'M' ? 'pm' : 'pp';
}

/* ---------------- tables ---------------- */
/**
 * table(cols, rows, opts)
 *   cols: [{ key, label, num, fmt(row) → Node|string, sort(row) → value, cls }]
 *   opts: { onRow(row), empty, sortable, caption, compact }
 */
/** the short name of whoever gave a case's answer, from its citation ("ClinGen TP53 expert panel (VCEP), Evidence
    Repository; …" → "ClinGen TP53 expert panel (VCEP)") */
export function answerBy(source) {
  const first = String(source || '').split(/[;,]/)[0].trim();
  return first && first.length <= 80 ? first : 'The case’s author';
}

export function table(cols, rows, opts = {}) {
  let sortKey = opts.sortKey || null;
  let dir = opts.sortDir || 1;
  const wrap = h('div.table-wrap', { tabindex: opts.scrollFocus ? '0' : null, role: opts.scrollFocus ? 'region' : null, 'aria-label': opts.caption || null });
  const tbl = h('table.data' + (opts.compact ? '.compact' : ''));
  if (opts.caption) tbl.appendChild(h('caption.visually-hidden', opts.caption));
  const thead = h('thead');
  const tbody = h('tbody');
  const draw = () => {
    thead.innerHTML = '';
    tbody.innerHTML = '';
    const tr = h('tr');
    for (const c of cols) {
      const th = h('th', { class: c.num ? 'num' : null, scope: 'col', 'aria-sort': sortKey === c.key ? (dir > 0 ? 'ascending' : 'descending') : null });
      if (opts.sortable && c.sort !== false) {
        const b = h('button.sort', { type: 'button' }, c.label, sortKey === c.key ? (dir > 0 ? ' ▲' : ' ▼') : '');
        b.addEventListener('click', () => {
          if (sortKey === c.key) dir = -dir;
          else {
            sortKey = c.key;
            dir = 1;
          }
          draw();
        });
        th.appendChild(b);
      } else th.textContent = c.label;
      tr.appendChild(th);
    }
    thead.appendChild(tr);
    let list = rows.slice();
    if (sortKey) {
      const c = cols.find((x) => x.key === sortKey);
      const val = (r) => (c && typeof c.sort === 'function' ? c.sort(r) : r[sortKey]);
      list.sort((a, b) => {
        const x = val(a), y = val(b);
        if (x == null && y == null) return 0;
        if (x == null) return 1;
        if (y == null) return -1;
        return (typeof x === 'number' && typeof y === 'number' ? x - y : String(x).localeCompare(String(y), 'en', { numeric: true })) * dir;
      });
    }
    if (!list.length) {
      tbody.appendChild(h('tr', h('td', { colspan: cols.length, class: 'muted' }, opts.empty || 'There’s nothing to show.')));
    }
    for (const r of list) {
      const row = h('tr', { class: opts.onRow ? 'clickable' : null });
      for (const c of cols) {
        const v = c.fmt ? c.fmt(r) : r[c.key];
        const td = h('td', { class: [c.num ? 'num' : '', c.cls || ''].join(' ').trim() || null });
        if (v instanceof Node) td.appendChild(v);
        else if (Array.isArray(v)) v.forEach((x) => td.append(x instanceof Node ? x : document.createTextNode(String(x))));
        else td.textContent = v == null ? '' : String(v);
        row.appendChild(td);
      }
      if (opts.onRow) {
        row.addEventListener('click', (e) => {
          if (e.target.closest('a, button, input, select, label')) return;
          opts.onRow(r, e);
        });
        row.tabIndex = 0;
        row.addEventListener('keydown', (e) => {
          if (e.key === 'Enter' && e.target === row) opts.onRow(r, e);
        });
      }
      tbody.appendChild(row);
      // a line of text under the row, across the whole table (opts.detail), so long text needn't squeeze a column
      const more = opts.detail ? opts.detail(r) : null;
      if (more != null && more !== '') {
        row.classList.add('has-detail');
        tbody.appendChild(h('tr.detail-row', h('td', { colspan: cols.length }, more)));
      }
    }
  };
  tbl.append(thead, tbody);
  wrap.appendChild(tbl);
  draw();
  wrap.redraw = (newRows) => {
    if (newRows) rows = newRows;
    draw();
  };
  return wrap;
}

/* ---------------- form fields ---------------- */
let fid = 0;
export function field(label, input, hint, opts = {}) {
  const id = input.id || 'f' + ++fid;
  input.id = id;
  const lab = h('label', { for: id }, label);
  const hintEl = hint ? h('span.hint', { id: id + '-hint' }, hint) : null;
  if (hintEl) input.setAttribute('aria-describedby', id + '-hint');
  return h('div.field' + (opts.cls ? '.' + opts.cls : ''), { style: opts.span ? { gridColumn: '1 / -1' } : null }, lab, input, hintEl);
}
export function select(options, value, attrs = {}) {
  const s = h('select', attrs);
  for (const o of options) {
    if (o && o.group) {
      const g = h('optgroup', { label: o.group });
      for (const x of o.options) g.appendChild(optionEl(x, value));
      s.appendChild(g);
    } else s.appendChild(optionEl(o, value));
  }
  return s;
}
function optionEl(o, value) {
  const [v, label] = Array.isArray(o) ? o : [o, o];
  const el = h('option', { value: v }, label);
  if (String(v) === String(value == null ? '' : value)) el.selected = true;
  return el;
}
export function input(value, attrs = {}) {
  const el = h('input', Object.assign({ type: 'text' }, attrs));
  el.value = value == null ? '' : value;
  return el;
}
export function textarea(value, attrs = {}) {
  const el = h('textarea', attrs);
  el.value = value == null ? '' : value;
  return el;
}
export function checkbox(label, checked, attrs = {}) {
  const box = h('input', Object.assign({ type: 'checkbox' }, attrs));
  box.checked = !!checked;
  return { el: h('label.check', box, h('span', label)), box };
}
/** a segmented control: options [[value, label]] */
export function seg(options, value, onchange, label) {
  const g = h('div.seg', { role: 'group', 'aria-label': label || null });
  const bs = options.map(([v, l]) => {
    const b = h('button', { type: 'button', 'aria-pressed': String(v) === String(value) ? 'true' : 'false' }, l);
    b.addEventListener('click', () => {
      bs.forEach((x) => x.setAttribute('aria-pressed', 'false'));
      b.setAttribute('aria-pressed', 'true');
      onchange(v);
    });
    g.appendChild(b);
    return b;
  });
  return g;
}

/** a small horizontal bar for a number between 0 and 1 (with a text label beside it) */
export function meter(value, opts = {}) {
  const w = Math.max(0, Math.min(1, value == null ? 0 : value));
  return h('span.meter', { role: 'img', 'aria-label': opts.label || null, title: opts.title || null },
    h('span.meter-fill', { style: { width: (w * 100).toFixed(1) + '%', background: opts.colour || null } }));
}
