/* =====================================================================
   Gene panels from Genomics England's PanelApp (the panels the NHS
   Genomic Medicine Service applies), asked for by the browser.
   A gene's rating on a panel: green (3) – diagnostic grade; amber (2)
   – moderate evidence; red (1) – not enough.
   ===================================================================== */
import { h, esc, fetchJSON, debounce, limiter } from './core.js';
import { CFG } from './settings.js';
import { cacheGet, cachePut } from './db.js';

const BASE = () => (CFG.services && CFG.services.panelapp) || 'https://panelapp.genomicsengland.co.uk/api/v1';
const q1 = limiter(2, 150);
export const RATING = { 3: { word: 'Green', cls: 'ok', text: 'diagnostic grade' }, 2: { word: 'Amber', cls: 'warn', text: 'moderate evidence' }, 1: { word: 'Red', cls: 'bad', text: 'not enough evidence' }, 0: { word: 'No rating', cls: '', text: '' } };

async function cached(key, days, fn) {
  const c = await cacheGet(key, days);
  if (c) return c.value;
  const v = await fn();
  await cachePut(key, v);
  return v;
}

export async function searchPanels(text) {
  const url = `${BASE()}/panels/?search=${encodeURIComponent(text)}&format=json`;
  const d = await q1(() => fetchJSON(url, {}, 20000));
  return (d.results || []).map((p) => ({ id: p.id, name: p.name, version: p.version, genes: p.stats ? p.stats.number_of_genes : null, relevantDisorders: p.relevant_disorders || [] }));
}

/** a panel's genes: [{symbol, rating, moi, phenotypes}] */
export async function panelGenes(id) {
  return cached('panelapp:panel:' + id, 14, async () => {
    const d = await q1(() => fetchJSON(`${BASE()}/panels/${encodeURIComponent(id)}/?format=json`, {}, 30000));
    return {
      id: d.id, name: d.name, version: d.version,
      genes: (d.genes || []).map((g) => ({ symbol: g.gene_data && g.gene_data.gene_symbol || g.entity_name, rating: +g.confidence_level || 0, moi: g.mode_of_inheritance || '', phenotypes: g.phenotypes || [] }))
    };
  });
}

/** the panels a gene is on: [{panel, id, rating, moi}] */
export async function panelsOfGene(symbol) {
  return cached('panelapp:gene:' + symbol, 14, async () => {
    let url = `${BASE()}/genes/${encodeURIComponent(symbol)}/?format=json`;
    const out = [];
    for (let page = 0; url && page < 5; page++) {
      const d = await q1(() => fetchJSON(url, {}, 30000));
      for (const r of d.results || []) {
        out.push({
          panel: r.panel ? r.panel.name : '', id: r.panel ? r.panel.id : null, version: r.panel ? r.panel.version : '',
          rating: +r.confidence_level || 0, moi: r.mode_of_inheritance || '', phenotypes: r.phenotypes || [], penetrance: r.penetrance || '', publications: r.publications || []
        });
      }
      url = d.next;
    }
    return out.sort((a, b) => b.rating - a.rating || a.panel.localeCompare(b.panel));
  });
}

/** a field for choosing a panel: search PanelApp, or type a name */
export class PanelPicker {
  constructor(value) {
    this.v = value || null;
    this.inp = h('input', { type: 'search', placeholder: 'Search PanelApp, e.g. intellectual disability', 'aria-label': 'Search for a gene panel' });
    this.list = h('div.suggest', { hidden: true, style: { position: 'absolute', top: '38px' } });
    this.chosen = h('div.small');
    this.el = h('div', { style: { position: 'relative' } }, this.inp, this.list, this.chosen);
    this.paint();
    const run = debounce(async () => {
      const t = this.inp.value.trim();
      if (t.length < 3) {
        this.list.hidden = true;
        return;
      }
      this.list.hidden = false;
      this.list.innerHTML = '<div class="sg-h">Searching PanelApp…</div>';
      try {
        const ps = await searchPanels(t);
        this.list.innerHTML = '';
        if (!ps.length) this.list.appendChild(h('div.sg-h', 'No panel has that in its name.'));
        for (const p of ps.slice(0, 12)) {
          const b = h('button', { type: 'button' }, h('span.sg-kind', 'Panel ' + p.id), h('span.sg-main', p.name, h('span.sg-sub', `${p.genes != null ? p.genes + ' genes, ' : ''}version ${p.version}`)));
          b.addEventListener('mousedown', (e) => e.preventDefault());
          b.addEventListener('click', () => {
            this.v = { id: p.id, name: p.name, version: p.version, source: 'PanelApp' };
            this.inp.value = '';
            this.list.hidden = true;
            this.paint();
            this.el.dispatchEvent(new Event('change', { bubbles: true }));
          });
          this.list.appendChild(b);
        }
        const own = h('button', { type: 'button' }, h('span.sg-kind', 'Other'), h('span.sg-main', `Use “${t}” as the panel’s name`));
        own.addEventListener('mousedown', (e) => e.preventDefault());
        own.addEventListener('click', () => {
          this.v = { id: null, name: t, source: 'typed' };
          this.inp.value = '';
          this.list.hidden = true;
          this.paint();
        });
        this.list.appendChild(own);
      } catch (e) {
        this.list.innerHTML = '';
        this.list.appendChild(h('div.sg-h', 'PanelApp did not answer (' + e.message + '). Type the panel’s name and choose “Use … as the panel’s name”.'));
        const own = h('button', { type: 'button' }, h('span.sg-main', `Use “${t}”`));
        own.addEventListener('click', () => {
          this.v = { id: null, name: t, source: 'typed' };
          this.list.hidden = true;
          this.paint();
        });
        this.list.appendChild(own);
      }
    }, 300);
    this.inp.addEventListener('input', run);
    this.inp.addEventListener('blur', () => setTimeout(() => (this.list.hidden = true), 150));
  }
  paint() {
    this.chosen.innerHTML = '';
    if (!this.v) {
      this.chosen.appendChild(h('span.muted', 'No panel chosen.'));
      return;
    }
    const x = h('button.btn.small.ghost', { type: 'button' }, 'Remove');
    x.addEventListener('click', () => {
      this.v = null;
      this.paint();
    });
    this.chosen.append(h('span', 'Chosen: ', h('b', this.v.name), this.v.id ? ` (PanelApp panel ${this.v.id}, version ${this.v.version})` : ''), ' ', x);
  }
  value() {
    return this.v;
  }
}
