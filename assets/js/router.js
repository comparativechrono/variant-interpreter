/* =====================================================================
   Pages are addressed after the # of the address (#/patient/1001), so
   that the site needs no server: GitHub Pages serves index.html, and
   the router shows the page that the rest of the address names.
   ===================================================================== */
import { bus, finishPending } from './core.js';

const routes = [];
let current = null;
let cleanup = null;
let guard = null;

/** route('/patient/:id/:tab?', loader) – loader() resolves to a module with render(root, params, query) */
export function route(pattern, loader, opts = {}) {
  // one pass, so that the keys are in the order the groups are (an optional segment can come last)
  const keys = [];
  const rx = new RegExp('^' + pattern.replace(/\/:(\w+)(\?|\*)?/g, (_, k, mod) => {
    keys.push(k);
    return mod === '?' ? '(?:/([^/]+))?' : mod === '*' ? '/(.+)' : '/([^/]+)';
  }) + '/?$');
  routes.push({ pattern, rx, keys, loader, opts });
}

export function parse(hash) {
  const raw = (hash || '').replace(/^#/, '') || '/';
  const [path, qs] = raw.split('?');
  const query = Object.fromEntries(new URLSearchParams(qs || ''));
  for (const r of routes) {
    const m = r.rx.exec(path);
    if (m) {
      const params = {};
      r.keys.forEach((k, i) => (params[k] = m[i + 1] != null ? decodeURIComponent(m[i + 1]) : undefined));
      return { route: r, params, query, path };
    }
  }
  return { route: null, params: {}, query, path };
}

export function go(path, replace) {
  const h = '#' + (path.startsWith('/') ? path : '/' + path);
  if (replace) history.replaceState(null, '', h);
  else if (location.hash !== h) location.hash = h;
  else render();
  if (replace) render();
}
export const link = (path) => '#' + (path.startsWith('/') ? path : '/' + path);

/** a page may ask before it is left (unsaved changes): fn() → true to stay */
export function setLeaveGuard(fn) {
  guard = fn;
}

let root = null;
let notFound = null;
export function start(container, notFoundLoader) {
  root = container;
  notFound = notFoundLoader;
  window.addEventListener('hashchange', () => render());
  render();
}

let lastHash = null;
async function render() {
  finishPending(); // a field being typed in, and a save waiting, before the page changes
  if (guard) {
    const stay = await guard(location.hash);
    if (stay) {
      if (lastHash != null) history.replaceState(null, '', lastHash);
      return;
    }
    guard = null;
  }
  lastHash = location.hash;
  const p = parse(location.hash);
  // the same page with a different section: let it handle the change itself
  if (current && p.route && current.route === p.route && current.mod && current.mod.update && current.sameAs && current.sameAs(p)) {
    current.params = p.params;
    current.query = p.query;
    current.mod.update(p.params, p.query);
    bus.emit('route', p);
    return;
  }
  if (cleanup) {
    try {
      cleanup();
    } catch (e) {
      console.error(e);
    }
    cleanup = null;
  }
  const token = {};
  current = { token, route: p.route, params: p.params, query: p.query };
  bus.emit('route', p);
  root.innerHTML = '<div class="page"><div class="loading"><span class="spinner"></span> Loading…</div></div>';
  try {
    const mod = await (p.route ? p.route.loader() : notFound());
    if (current.token !== token) return;
    current.mod = mod;
    current.sameAs = mod.sameAs || null;
    root.innerHTML = '';
    const r = await mod.render(root, p.params, p.query);
    if (current.token !== token) {
      if (typeof r === 'function') r();
      return;
    }
    cleanup = typeof r === 'function' ? r : null;
    if (!p.query.keepScroll) window.scrollTo(0, 0);
    const h1 = root.querySelector('h1');
    const t = h1 ? h1.textContent.trim() : '';
    if (t) document.title = t === 'Variant interpreter' ? t : `${t} – Variant interpreter`;
  } catch (e) {
    console.error(e);
    root.innerHTML = '';
    const box = document.createElement('div');
    box.className = 'page narrow';
    // a module that does not match the others (the site was updated while this page was open, or a file is still
    // the old one in the browser's cache) fails to load: a reload, bypassing the cache, fetches the new set
    const stale = /does not provide an export|Failed to fetch dynamically imported module|Importing a module script failed|error loading dynamically imported module/i.test(String(e && e.message));
    box.innerHTML = stale
      ? '<div class="note warn"><p><b>The site has just been updated.</b></p><p>Reload the page to use the new version. Your work is safe in this browser.</p><p><button type="button" class="btn primary">Reload</button></p></div>'
      : '<div class="note bad"><p><b>This page couldn’t be shown.</b></p><p class="err"></p><p>Reload the page to try again. If it keeps happening, download your work from Cases and data and let your tutor know.</p></div>';
    if (!stale) box.querySelector('.err').textContent = e && e.message ? e.message : String(e);
    else box.querySelector('button').addEventListener('click', () => location.reload());
    root.appendChild(box);
  }
}
export const currentRoute = () => current;
