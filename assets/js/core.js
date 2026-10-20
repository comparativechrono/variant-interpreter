/* =====================================================================
   Core helpers: DOM building, events, small formatting functions,
   fetching with time limits, dialogs, menus, messages and downloads.
   Plain browser JavaScript (an ES module): no build step.
   Adapted from the Hearn lab's practicals (variant-practicals core.js).
   ===================================================================== */

export function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** h('div.cls#id', {attr}, children...) – a minimal hyperscript */
export function h(tag, attrs, ...kids) {
  const m = /^([a-z0-9-]+)?((?:[.#][\w-]+)*)$/i.exec(tag) || [];
  const el = document.createElement(m[1] || 'div');
  (m[2] || '').replace(/([.#])([\w-]+)/g, (_, t, v) => {
    if (t === '.') el.classList.add(v);
    else el.id = v;
  });
  if (attrs != null && (typeof attrs !== 'object' || attrs instanceof Node || Array.isArray(attrs))) {
    kids.unshift(attrs);
    attrs = null;
  }
  if (attrs) {
    for (const [k, v] of Object.entries(attrs)) {
      if (v == null || v === false) continue;
      if (k === 'class') el.className += (el.className ? ' ' : '') + v;
      else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
      else if (k === 'html') el.innerHTML = v;
      else if (k === 'text') el.textContent = v;
      else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
      else if (k === 'dataset') Object.assign(el.dataset, v);
      else if (k === 'value' && ('value' in el)) el.value = v;
      else if (k === 'checked' || k === 'selected' || k === 'disabled') el[k] = !!v;
      else el.setAttribute(k, v === true ? '' : v);
    }
  }
  const add = (k) => {
    if (k == null || k === false || k === true) return;
    if (Array.isArray(k)) k.forEach(add);
    else el.appendChild(k instanceof Node ? k : document.createTextNode(String(k)));
  };
  kids.forEach(add);
  return el;
}

/** an element from an HTML string (trusted HTML only: escape what comes from elsewhere) */
export function frag(html) {
  const t = document.createElement('template');
  t.innerHTML = html.trim();
  return t.content.childElementCount === 1 ? t.content.firstElementChild : t.content;
}

/** HTML from a file someone else wrote (a case's brief): only plain formatting is kept – paragraphs, emphasis,
    lists, line breaks and web links – and anything else becomes its text, so a file cannot run code in the site */
export function safeHTML(html) {
  const t = document.createElement('template');
  t.innerHTML = String(html || '');
  const KEEP = new Set(['P', 'B', 'STRONG', 'I', 'EM', 'U', 'BR', 'UL', 'OL', 'LI', 'SUP', 'SUB', 'SPAN', 'A', 'H3', 'H4', 'TABLE', 'THEAD', 'TBODY', 'TR', 'TH', 'TD']);
  const out = document.createDocumentFragment();
  const copy = (node, into) => {
    for (const n of Array.from(node.childNodes)) {
      if (n.nodeType === 3) into.appendChild(document.createTextNode(n.textContent));
      else if (n.nodeType === 1) {
        if (!KEEP.has(n.tagName)) {
          if (!/^(SCRIPT|STYLE|IFRAME|OBJECT|EMBED|TEMPLATE)$/.test(n.tagName)) copy(n, into);
          continue;
        }
        const el = document.createElement(n.tagName.toLowerCase());
        if (n.tagName === 'A') {
          const href = n.getAttribute('href') || '';
          if (/^https?:\/\//i.test(href)) Object.assign(el, { href, target: '_blank', rel: 'noopener' });
        }
        copy(n, el);
        into.appendChild(el);
      }
    }
  };
  copy(t.content, out);
  return out;
}

export const $ = (sel, root) => (root || document).querySelector(sel);
export const $$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));

export function clear(el) {
  while (el.firstChild) el.removeChild(el.firstChild);
  return el;
}

/* ---------- event bus ---------- */
const listeners = {};
export const bus = {
  on(type, fn) {
    (listeners[type] = listeners[type] || []).push(fn);
    return () => bus.off(type, fn);
  },
  off(type, fn) {
    listeners[type] = (listeners[type] || []).filter((f) => f !== fn);
  },
  emit(type, detail) {
    for (const fn of (listeners[type] || []).slice()) {
      try {
        fn(detail || {}, type);
      } catch (e) {
        console.error('listener error', type, e);
      }
    }
  }
};

/* ---------- small things kept in localStorage (never throws) ---------- */
const PFX = 'varint:';
export const store = {
  get(key, fallback) {
    try {
      const v = window.localStorage.getItem(PFX + key);
      return v == null ? fallback : JSON.parse(v);
    } catch (e) {
      return fallback;
    }
  },
  set(key, value) {
    try {
      window.localStorage.setItem(PFX + key, JSON.stringify(value));
      return true;
    } catch (e) {
      return false;
    }
  },
  remove(key) {
    try {
      window.localStorage.removeItem(PFX + key);
    } catch (e) {
      /* ignore */
    }
  }
};

/* ---------- fetching ---------- */
export class FetchError extends Error {
  constructor(message, status, url) {
    super(message);
    this.name = 'FetchError';
    this.status = status;
    this.url = url;
  }
}

export async function fetchWithTimeout(url, opts = {}, ms = 25000) {
  const ctrl = new AbortController();
  const outer = opts.signal;
  if (outer) {
    if (outer.aborted) ctrl.abort();
    else outer.addEventListener('abort', () => ctrl.abort(), { once: true });
  }
  const t = setTimeout(() => ctrl.abort(), ms);
  try {
    const r = await fetch(url, Object.assign({}, opts, { signal: ctrl.signal }));
    if (!r.ok) {
      let detail = '';
      try {
        detail = (await r.text()).slice(0, 300);
      } catch (e) {
        /* ignore */
      }
      throw new FetchError(`HTTP ${r.status}${detail ? ': ' + detail : ''}`, r.status, url);
    }
    return r;
  } catch (e) {
    if (e.name === 'AbortError') throw new FetchError(outer && outer.aborted ? 'Cancelled' : 'The service took too long to answer', 0, url);
    if (e instanceof FetchError) throw e;
    throw new FetchError(e.message === 'Failed to fetch' ? 'The service couldn’t be reached, perhaps because you’re offline or it’s blocked' : e.message, 0, url);
  } finally {
    clearTimeout(t);
  }
}
/** JSON from a service. opts.retries: how many times to try again when the service is
    busy or failing (429, 5xx) or could not be reached; a 429 without CORS headers (NCBI's)
    reaches the page as an unreachable service, so that is tried again too */
export async function fetchJSON(url, opts, ms) {
  const o = Object.assign({ headers: { Accept: 'application/json' } }, opts || {});
  const retries = o.retries || 0;
  delete o.retries;
  for (let i = 0; ; i++) {
    try {
      const r = await fetchWithTimeout(url, o, ms);
      return await r.json();
    } catch (e) {
      const again = e instanceof FetchError && (e.status === 429 || e.status >= 500 || (e.status === 0 && e.message !== 'Cancelled' && !/too long/.test(e.message)));
      if (!again || i >= retries) throw e;
      await new Promise((res) => setTimeout(res, 1200 * Math.pow(2.5, i)));
    }
  }
}
export async function fetchText(url, opts, ms) {
  const r = await fetchWithTimeout(url, opts, ms);
  return r.text();
}

/** a queue that keeps at most `n` requests to one service in flight, with a gap between them */
export function limiter(n = 2, gapMs = 0) {
  let active = 0;
  let last = 0;
  const waiting = [];
  const next = () => {
    if (active >= n || !waiting.length) return;
    const wait = Math.max(0, last + gapMs - Date.now());
    if (wait > 0) {
      setTimeout(next, wait);
      return;
    }
    const { fn, resolve, reject } = waiting.shift();
    active++;
    last = Date.now();
    Promise.resolve()
      .then(fn)
      .then(resolve, reject)
      .finally(() => {
        active--;
        next();
      });
    next();
  };
  return (fn) =>
    new Promise((resolve, reject) => {
      waiting.push({ fn, resolve, reject });
      next();
    });
}

/* ---------- downloads and the clipboard ---------- */
export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = h('a', { href: url, download: filename, style: { display: 'none' } });
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    URL.revokeObjectURL(url);
    a.remove();
  }, 2000);
}
export function downloadText(text, filename, type) {
  downloadBlob(new Blob([text], { type: type || 'text/plain;charset=utf-8' }), filename);
}
export async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch (e) {
    const ta = h('textarea', { style: { position: 'fixed', left: '-9999px' } }, text);
    document.body.appendChild(ta);
    ta.select();
    let ok = false;
    try {
      ok = document.execCommand('copy');
    } catch (e2) {
      ok = false;
    }
    ta.remove();
    return ok;
  }
}
/** ask for a file from the computer; resolves with File objects */
export function pickFiles(accept, multiple = false) {
  return new Promise((resolve) => {
    const inp = h('input', { type: 'file', accept: accept || '', style: { display: 'none' } });
    if (multiple) inp.multiple = true;
    inp.addEventListener('change', () => {
      resolve(Array.from(inp.files || []));
      inp.remove();
    });
    document.body.appendChild(inp);
    inp.click();
  });
}

/* ---------- messages ---------- */
let toastBox;
export function toast(msg, kind, ms) {
  if (!toastBox) {
    toastBox = h('div.toasts', { role: 'status', 'aria-live': 'polite' });
    document.body.appendChild(toastBox);
  }
  const t = h('div.toast' + (kind ? '.' + kind : ''));
  if (msg instanceof Node) t.appendChild(msg);
  else t.textContent = msg;
  toastBox.appendChild(t);
  requestAnimationFrame(() => t.classList.add('show'));
  setTimeout(() => {
    t.classList.remove('show');
    setTimeout(() => t.remove(), 400);
  }, ms || (kind === 'error' ? 7000 : 3500));
}

/* ---------- dialogs ---------- */
let modalDepth = 0;
/** modal(title, body (Node or text), {actions: [[label, fn, cls]], wide, onClose}) → {close, box} */
export function modal(title, body, opts = {}) {
  const prevFocus = document.activeElement;
  let closed = false;
  const close = () => {
    if (closed) return;
    closed = true;
    back.remove();
    modalDepth--;
    offRoute();
    document.removeEventListener('keydown', onKey);
    if (opts.onClose) opts.onClose();
    if (prevFocus && prevFocus.focus) prevFocus.focus();
  };
  const onKey = (e) => {
    if (e.key === 'Escape') {
      e.stopPropagation();
      close();
    }
  };
  const x = h('button.icon-btn.modal-x', { type: 'button', 'aria-label': 'Close', html: icon('x') });
  x.addEventListener('click', close);
  const titleId = 'mt' + Math.random().toString(36).slice(2, 8);
  const bodyEl = h('div.modal-b');
  if (body instanceof Node) bodyEl.appendChild(body);
  else if (body != null) bodyEl.appendChild(h('p', String(body)));
  const foot = opts.actions && opts.actions.length
    ? h('div.modal-f', opts.actions.map(([label, fn, cls]) => h('button.btn' + (cls ? '.' + cls : ''), {
      type: 'button',
      onclick: async () => {
        const keep = fn ? await fn(close) : false;
        if (keep !== true) close();
      }
    }, label)))
    : null;
  const box = h('div.modal' + (opts.wide ? '.wide' : ''), { role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': titleId },
    h('div.modal-h', h('h2', { id: titleId }, title), x), bodyEl, foot);
  const back = h('div.modal-back', box);
  back.addEventListener('mousedown', (e) => {
    if (e.target === back && !opts.sticky) close();
  });
  document.body.appendChild(back);
  modalDepth++;
  // a dialog belongs to the page it was opened on: going to another page closes it
  const offRoute = bus.on('route', () => close());
  document.addEventListener('keydown', onKey);
  setTimeout(() => {
    const first = box.querySelector('input, select, textarea, [data-autofocus]');
    (first || x).focus();
  }, 20);
  return { close, box, body: bodyEl };
}
export const modalOpen = () => modalDepth > 0;

/** confirm(question, {yes, no, danger}) → Promise<boolean> */
export function confirmBox(title, text, opts = {}) {
  return new Promise((resolve) => {
    let answered = false;
    modal(title, typeof text === 'string' ? h('p', text) : text, {
      actions: [
        [opts.no || 'Cancel', () => { answered = true; resolve(false); }, 'ghost'],
        [opts.yes || 'OK', () => { answered = true; resolve(true); }, opts.danger ? 'danger' : 'primary']
      ],
      onClose: () => { if (!answered) resolve(false); }
    });
  });
}

/** a pop-up menu under an element: items are [icon, label, fn] or null for a line */
export function popmenu(anchor, items) {
  $$('.popmenu').forEach((m) => m.remove());
  const m = h('div.popmenu', { role: 'menu' });
  for (const it of items) {
    if (!it) {
      m.appendChild(h('hr'));
      continue;
    }
    const [ic, label, fn, disabled] = it;
    const b = h('button', { type: 'button', role: 'menuitem', disabled: !!disabled, html: (ic ? icon(ic) : '') + '<span>' + esc(label) + '</span>' });
    b.addEventListener('click', () => {
      m.remove();
      fn();
    });
    m.appendChild(b);
  }
  document.body.appendChild(m);
  const r = anchor.getBoundingClientRect();
  m.style.left = Math.max(8, Math.min(window.innerWidth - m.offsetWidth - 8, r.left)) + 'px';
  const top = r.bottom + 4;
  m.style.top = (top + m.offsetHeight > window.innerHeight - 8 ? Math.max(8, r.top - m.offsetHeight - 4) : top) + 'px';
  const first = m.querySelector('button');
  if (first) first.focus();
  const off = (e) => {
    if (!m.contains(e.target)) {
      m.remove();
      document.removeEventListener('pointerdown', off, true);
    }
  };
  m.addEventListener('keydown', (e) => {
    const bs = $$('button', m);
    const i = bs.indexOf(document.activeElement);
    if (e.key === 'Escape') {
      m.remove();
      anchor.focus();
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      bs[(i + 1) % bs.length].focus();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      bs[(i - 1 + bs.length) % bs.length].focus();
    }
  });
  setTimeout(() => document.addEventListener('pointerdown', off, true), 0);
}

/* ---------- formatting ---------- */
export const debounce = (fn, ms) => {
  let t = null;
  let args = [];
  const d = (...a) => {
    args = a;
    clearTimeout(t);
    t = setTimeout(() => {
      t = null;
      fn(...args);
    }, ms);
  };
  /** run now what is waiting, if anything is */
  d.flush = () => {
    if (t == null) return;
    clearTimeout(t);
    t = null;
    fn(...args);
  };
  d.cancel = () => {
    clearTimeout(t);
    t = null;
  };
  return d;
};

/* ---------- work that must not be lost when the page is left, reloaded or hidden ---------- */
const pendingWork = new Set();
/** fn() is run before the page is left or hidden (a debounced save, say); returns a function that removes it */
export function beforeLeaving(fn) {
  pendingWork.add(fn);
  return () => pendingWork.delete(fn);
}
/** commit the text field being typed in (its change event has not fired yet) and finish the waiting saves */
export function finishPending() {
  const a = typeof document !== 'undefined' ? document.activeElement : null;
  const typing = a && (a.tagName === 'TEXTAREA' || (a.tagName === 'INPUT' && /^(text|number|email|url|tel|date)$/i.test(a.type || 'text')));
  if (typing && !a.closest('#gsearch')) a.dispatchEvent(new Event('change', { bubbles: true }));
  for (const fn of [...pendingWork]) {
    try {
      fn();
    } catch (e) {
      console.error(e);
    }
  }
}
if (typeof document !== 'undefined' && typeof window !== 'undefined' && window.addEventListener) {
  window.addEventListener('beforeunload', finishPending); // the earliest warning of a reload or a closed tab
  window.addEventListener('pagehide', finishPending);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') finishPending();
  });
}
export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const fmt = (n, d = 0) =>
  n == null || isNaN(n) ? '–' : Number(n).toLocaleString('en-GB', { maximumFractionDigits: d, minimumFractionDigits: d });
/** an allele frequency as people write it: 0.0123, 1.2 × 10⁻⁵ … */
export function fmtAF(x) {
  if (x == null || isNaN(x)) return '–';
  if (x === 0) return '0';
  if (x >= 0.001) return Number(x.toPrecision(3)).toString();
  const e = Math.floor(Math.log10(x));
  const m = x / Math.pow(10, e);
  return `${m.toFixed(2)} × 10${sup(e)}`;
}
const SUP = { '-': '⁻', 0: '⁰', 1: '¹', 2: '²', 3: '³', 4: '⁴', 5: '⁵', 6: '⁶', 7: '⁷', 8: '⁸', 9: '⁹' };
export const sup = (n) => String(n).split('').map((c) => SUP[c] || c).join('');
/** 1 in N */
export function oneIn(x) {
  if (!x) return '';
  const n = 1 / x;
  return n >= 10 ? `1 in ${fmt(n, 0)}` : `1 in ${fmt(n, 1)}`;
}
export const pct = (x, d = 1) => (x == null || isNaN(x) ? '–' : fmt(x * 100, d) + '%');
export const plural = (n, one, many) => `${fmt(n)} ${n === 1 ? one : many || one + 's'}`;
/** first, second … tenth, then 11th, 22nd, 1,003rd */
export function ordinal(n) {
  const W = ['first', 'second', 'third', 'fourth', 'fifth', 'sixth', 'seventh', 'eighth', 'ninth', 'tenth'];
  if (Number.isInteger(n) && n >= 1 && n <= 10) return W[n - 1];
  const v = n % 100;
  return fmt(n) + (v >= 11 && v <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] || 'th');
}
export function dateStr(iso, withTime) {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d)) return String(iso);
  const s = d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  return withTime ? s + ', ' + d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }) : s;
}
export const nowISO = () => new Date().toISOString();
export const uid = (p = '') => p + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
export const cap = (s) => (s ? s[0].toUpperCase() + s.slice(1) : s);
export const commas = (n) => (n == null ? '' : Number(n).toLocaleString('en-GB'));

export const AA3 = {
  Ala: 'A', Arg: 'R', Asn: 'N', Asp: 'D', Cys: 'C', Gln: 'Q', Glu: 'E', Gly: 'G', His: 'H', Ile: 'I',
  Leu: 'L', Lys: 'K', Met: 'M', Phe: 'F', Pro: 'P', Ser: 'S', Thr: 'T', Trp: 'W', Tyr: 'Y', Val: 'V', Ter: '*', Sec: 'U'
};
export const AA1 = Object.fromEntries(Object.entries(AA3).map(([k, v]) => [v, k]));
export const AA_NAME = {
  A: 'alanine', R: 'arginine', N: 'asparagine', D: 'aspartate', C: 'cysteine', Q: 'glutamine', E: 'glutamate',
  G: 'glycine', H: 'histidine', I: 'isoleucine', L: 'leucine', K: 'lysine', M: 'methionine', F: 'phenylalanine',
  P: 'proline', S: 'serine', T: 'threonine', W: 'tryptophan', Y: 'tyrosine', V: 'valine', '*': 'stop'
};

/* the icon set lives in icons.js; core re-exports it so views need one import */
import { icon } from './icons.js';
export { icon };
