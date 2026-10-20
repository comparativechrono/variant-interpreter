/* =====================================================================
   Scoring a copy-number variant: the five sections of points of the
   ACMG/ClinGen standards (Riggs et al. 2020), each item used or not, at
   its default points or others within its range; the total on a scale;
   and the class it gives. The same rows appear beside their evidence in
   the page's sections, bound to the same score.

     new CNVScore(v)        the score of a CNV record (v.cnv.items, as
                            cnv/rubric.js reads them)
     itemRow(sc, code)      one item: use it or not, its points, notes
     cnvPanel(sc, opts)     the panel: the scale, the class, all items
     scoreBar()             the scale from benign to pathogenic
   ===================================================================== */
import { h, esc, icon, bus, fmt } from '../core.js';
import { RUBRIC, score, itemOf, exclusions, cnvClass, fmtPts } from './rubric.js';
import { clsBadge } from '../ui.js';
import * as settings from '../settings.js';

export const SECTION_TITLES = {
  loss: { 1: 'Overall genomic content', 2: 'Haploinsufficient and benign genes and regions', 3: 'Number of genes', 4: 'Reported cases, families and populations', 5: 'The patient’s inheritance and family' },
  gain: { 1: 'Overall genomic content', 2: 'Triplosensitive, haploinsufficient and benign genes and regions', 3: 'Number of genes', 4: 'Reported cases, families and populations', 5: 'The patient’s inheritance and family' }
};
export const CLS_WORD = { p: 'Pathogenic', lp: 'Likely pathogenic', vus: 'Uncertain significance', lb: 'Likely benign', b: 'Benign' };
const pts2 = (x) => (Math.abs(x) / 100).toFixed(2);

/** the score of one CNV, shared by the panel and the rows in the sections */
export class CNVScore {
  constructor(v, opts = {}) {
    this.v = v;
    v.cnv = v.cnv || {};
    v.cnv.items = v.cnv.items || {};
    v.cnv.notes = v.cnv.notes || {};
    this.type = v.cnvType === 'gain' ? 'gain' : 'loss';
    this.suggestions = {};
    this.showSuggestions = !!opts.showSuggestions;
    this.readOnly = !!opts.readOnly;
    this.listeners = new Set();
  }
  get items() {
    return this.v.cnv.items;
  }
  get(code) {
    return this.items[code] || { on: false };
  }
  isOn(code) {
    return !!(this.items[code] && this.items[code].on);
  }
  /** the items that exclude this one (its group). 4A to 4D are categories for each reported case, so they go together */
  mates(code) {
    const it = itemOf(this.type, code);
    if (!it || !it.group) return [];
    return exclusions(this.type, code);
  }
  /** change an item; turning it on turns off the items it excludes. Returns the codes turned off */
  set(code, patch) {
    const it = itemOf(this.type, code);
    if (!it) return [];
    const next = Object.assign({}, this.items[code] || {}, patch);
    const off = [];
    if (patch.on) {
      for (const m of this.mates(code)) {
        if (this.items[m] && this.items[m].on) {
          this.items[m] = Object.assign({}, this.items[m], { on: false });
          off.push(m);
        }
      }
      if (it.kind === 'case' && !(next.cases && next.cases.length)) next.cases = [{ label: '', confirmed: true }];
    }
    this.items[code] = next;
    this.changed(code);
    return off;
  }
  note(code, text) {
    if (text) this.v.cnv.notes[code] = text;
    else delete this.v.cnv.notes[code];
    this.changed(code);
  }
  result() {
    return score(this.type, this.v.cnv);
  }
  /** the points an item adds now (null if not used) */
  pointsOf(code, r) {
    const row = (r || this.result()).rows.find((x) => x.code === code);
    return row ? row.pts : null;
  }
  /** the codes used, with their points: '1A, 2A (+1.00), 3B (+0.45)' */
  summary(r) {
    r = r || this.result();
    return r.rows.map((x) => (x.pts ? `${x.code} (${x.pts > 0 ? '+' : '−'}${pts2(x.pts)})` : x.code)).join(', ');
  }
  setSuggestions(s) {
    this.suggestions = s || {};
    this.changed(null, true);
  }
  on(fn) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }
  changed(code, quiet) {
    for (const fn of Array.from(this.listeners)) fn(code, quiet);
  }
}

/* ---------------- the scale ---------------- */
// the classes are drawn wider than their share of points, so that the narrow likely bands can be seen
const SEG = [[-150, -99, 0, 18], [-99, -90, 18, 30], [-90, 90, 30, 70], [90, 99, 70, 82], [99, 150, 82, 100]];
export function scalePos(v) {
  const x = Math.max(-150, Math.min(150, v));
  for (const [a, b, p, q] of SEG) if (x <= b) return p + ((x - a) / (b - a)) * (q - p);
  return 100;
}
/** the scale from −1.50 to +1.50 points, with the five classes; .set(total) moves the marker */
export function scoreBar() {
  const band = (cls, a, b, label, long, short) => h('div.cnv-band.cb-' + cls, { style: { left: scalePos(a) + '%', width: scalePos(b) - scalePos(a) + '%' }, title: `${CLS_WORD[cls]}: ${label}` },
    long ? h('span.cb-long', long) : null, short ? h('span.cb-short', short) : null);
  const track = h('div.cnv-track',
    band('b', -150, -99, '−0.99 points or fewer', 'Benign', 'B'),
    band('lb', -99, -90, '−0.98 to −0.90 points'),
    band('vus', -90, 90, '−0.89 to +0.89 points', 'Uncertain significance', 'VUS'),
    band('lp', 90, 99, '+0.90 to +0.98 points'),
    band('p', 99, 150, '+0.99 points or more', 'Pathogenic', 'P'));
  const lab = (at, text) => h('span', { style: { left: at + '%' } }, text);
  const ticks = h('div.cnv-scale-ticks', { 'aria-hidden': 'true' },
    lab(scalePos(-99), '−0.99'), lab(scalePos(-90), '−0.90'), lab(50, '0'), lab(scalePos(90), '+0.90'), lab(scalePos(99), '+0.99'));
  const val = h('span.cnv-mark-val');
  const marker = h('div.cnv-mark', val, h('span.cnv-mark-pin'));
  const live = h('div.visually-hidden', { 'aria-live': 'polite' });
  const el = h('div.cnv-scale', { role: 'img' }, h('div.cnv-scale-body', track, marker), ticks, live);
  let first = true;
  el.set = (total) => {
    const t = total || 0;
    marker.style.left = scalePos(t) + '%';
    val.textContent = `Score ${t > 0 ? '+' : t < 0 ? '−' : ''}${pts2(t)}`;
    const cls = cnvClass(t);
    marker.dataset.cls = cls;
    // the label keeps inside the scale at either end
    marker.classList.toggle('at-left', scalePos(t) < 12);
    marker.classList.toggle('at-right', scalePos(t) > 88);
    const label = `${CLS_WORD[cls]}: ${t > 0 ? '+' : t < 0 ? '−' : ''}${pts2(t)} points`;
    el.setAttribute('aria-label', 'The score. ' + label);
    if (!first) live.textContent = label;
    first = false;
  };
  el.set(0);
  return el;
}

/* ---------------- one item ---------------- */
const num = (v, step = 0.05) => {
  const i = h('input.cnv-num', { type: 'number', step, inputmode: 'decimal' });
  i.value = v;
  return i;
};
/** the points an item would give at its default, as text */
function defaultText(it, sc) {
  if (it.kind === 'case') {
    const per = it.perConfirmed != null ? it.perConfirmed : it.per;
    return `${per > 0 ? '+' : per < 0 ? '−' : ''}${pts2(per)} each`;
  }
  if (it.options) return 'by option';
  const p = it.pts || 0;
  return `${p > 0 ? '+' : p < 0 ? '−' : ''}${pts2(p)}`;
}
const rangeText = (a, b) => `${a < 0 ? '−' : ''}${pts2(a)} to ${b < 0 ? '−' : ''}${pts2(b)}`;
const signedPts = (x) => `${x > 0 ? '+' : x < 0 ? '−' : ''}${pts2(x)}`;

/** one item of the rubric, bound to the score: where 'panel' (narrow) or 'sec' (in a section) */
export function itemRow(sc, code, opts = {}) {
  const it = itemOf(sc.type, code);
  const row = h('div.cnv-item', { dataset: { code } });
  let expanded = false;
  let sig = null;
  const draw = (force) => {
    const st = sc.get(code);
    const on = !!st.on;
    const r = sc.result();
    const p = sc.pointsOf(code, r);
    const sug = sc.showSuggestions ? sc.suggestions[code] : null;
    const mates = sc.mates(code).filter((m) => sc.isOn(m));
    // drawn again only when something it shows has changed; the control that had the focus keeps it
    const now = JSON.stringify([st, p, sug, mates, expanded, sc.v.cnv.notes[code] || '', sc.readOnly]);
    if (!force && now === sig) return;
    sig = now;
    const focusKey = row.contains(document.activeElement) ? document.activeElement.dataset.k : null;
    row.innerHTML = '';
    row.classList.toggle('on', on);
    row.classList.toggle('pos', on && p > 0);
    row.classList.toggle('neg', on && p < 0);
    row.classList.toggle('sug', !!sug);
    const id = `ci-${opts.where || 'x'}-${code}-${Math.random().toString(36).slice(2, 6)}`;
    const box = h('input', { type: 'checkbox', id, disabled: sc.readOnly || null, dataset: { k: 'on' } });
    box.checked = on;
    box.addEventListener('change', () => {
      const off = sc.set(code, { on: box.checked });
      if (off.length && opts.announce) opts.announce(`${code} replaces ${off.join(' and ')}, because they exclude each other.`);
    });
    const chip = h('label.cnv-code', { for: id }, box, h('span', code));
    // the text: two lines of it; pressing it shows the rest, and the guidance
    const more = h('button.cnv-textbtn', { type: 'button', 'aria-expanded': expanded ? 'true' : 'false', title: expanded ? 'Show less' : 'Show the full text and guidance', dataset: { k: 'more' } },
      h('span.cnv-text' + (expanded ? '.full' : ''), it.text));
    more.addEventListener('click', () => {
      expanded = !expanded;
      draw(true);
    });
    const ptsEl = h('span.cnv-pts', { title: 'Points' }, on ? (p == null ? '' : `${p > 0 ? '+' : p < 0 ? '−' : ''}${pts2(p)}`) : h('span.faint', defaultText(it, sc)));
    row.append(chip, h('div.cnv-body', more), ptsEl);
    if (expanded) {
      const bits = [];
      if (it.note) bits.push(it.note);
      if (it.min != null && !it.options) bits.push(`Points can be from ${rangeText(it.min, it.max)}, and the default is ${defaultText(it, sc)}.`);
      if (it.kind === 'case') bits.push(`Points are given for each ${it.unit || 'case'}${it.perAssumed != null ? `: ${signedPts(it.perConfirmed)} if it’s de novo with parentage confirmed, or ${signedPts(it.perAssumed)} if de novo is assumed` : ''}.${it.perMin != null ? ` Each can score from ${rangeText(it.perMin, it.perMax)}.` : ''}${it.max != null ? ` The item gives at most ${it.max < 0 ? '−' : '+'}${pts2(it.max)} in all.` : ''}${it.cap ? ` 4A to 4C together give at most +${pts2(it.cap.max)}.` : ''}`);
      const ex = sc.mates(code);
      if (ex.length) bits.push(`It excludes ${ex.join(', ')}, so using it turns ${ex.length === 1 ? 'that one' : 'them'} off.`);
      if (bits.length) row.appendChild(h('div.cnv-guide.small', bits.join(' ')));
    }
    // an item whose alternative is used is drawn faintly; using it replaces the other
    row.classList.toggle('excluded', !on && mates.length > 0);
    if (!on && mates.length) chip.title = `Using ${code} replaces ${mates.join(' and ')}`;
    // points within the item's range
    if (on && !sc.readOnly) {
      const ctl = controls(sc, code, it, st);
      if (ctl) row.appendChild(ctl);
    }
    if (sug) {
      const applied = on && (sug.option == null || (st.option || 0) === sug.option) && (sug.pts == null || p === sug.pts || (it.kind === 'case'));
      const tx = h('span.sug-text', h('b', sug.look ? `Look at ${code}. ` : `Suggested: ${code}${sug.pts != null && !it.options ? ` (${sug.pts > 0 ? '+' : sug.pts < 0 ? '−' : ''}${pts2(sug.pts)})` : ''}. `), sug.why);
      const line = h('div.crow-sug' + (sug.look ? '.against' : ''), h('span.sug-mark', { 'aria-hidden': 'true', html: icon('lightbulb') }), tx);
      if (!sug.look && !sc.readOnly) {
        const take = h('button.btn.small', { type: 'button', disabled: applied || null, dataset: { k: 'apply' } }, applied ? 'Applied' : `Apply ${code}`);
        take.addEventListener('click', () => {
          const patch = { on: true };
          if (sug.option != null) patch.option = sug.option;
          if (sug.pts != null && it.kind !== 'case' && !it.options && sug.pts !== it.pts) patch.pts = sug.pts;
          if (sug.pts != null && it.options && sug.option != null && it.options[sug.option] && sug.pts !== it.options[sug.option].pts) patch.pts = sug.pts;
          const off = sc.set(code, patch);
          if (!sc.v.cnv.notes[code] && sug.why) sc.note(code, sug.why);
          if (off.length && opts.announce) opts.announce(`${code} replaces ${off.join(' and ')}.`);
        });
        line.appendChild(take);
      }
      row.appendChild(line);
    }
    if (on || sc.v.cnv.notes[code]) {
      const note = h('input', { type: 'text', placeholder: 'Your evidence for it, which goes on the report', 'aria-label': `Evidence for ${code}`, disabled: sc.readOnly || null, dataset: { k: 'note' } });
      note.value = sc.v.cnv.notes[code] || '';
      note.addEventListener('change', () => sc.note(code, note.value.trim()));
      row.appendChild(h('div.cnv-note', note));
    }
    if (focusKey) {
      const el = row.querySelector(`[data-k="${focusKey}"]`);
      if (el) el.focus();
    }
  };
  draw(true);
  // drawn again after the event that changed the score has finished, so that the focus has moved where
  // the person sent it (Tab from a points box to the evidence box) and can be kept there
  let seen = false;
  let pending = false;
  const off = sc.on(() => {
    if (pending) return;
    pending = true;
    setTimeout(() => {
      pending = false;
      if (!row.isConnected) {
        if (seen) off();
        return;
      }
      seen = true;
      draw();
    }, 0);
  });
  return row;
}

/** the controls for an item's points (or its cases) */
function controls(sc, code, it, st) {
  if (it.kind === 'case') return caseList(sc, code, it, st);
  const wrap = h('div.cnv-ctl');
  if (it.options) {
    const sel = h('select.cnv-opt', { 'aria-label': `Which ${code}`, dataset: { k: 'opt' } });
    it.options.forEach((o, i) => sel.appendChild(h('option', { value: i, selected: i === (st.option || 0) || null }, `${o.label} (${o.pts > 0 ? '+' : o.pts < 0 ? '−' : ''}${pts2(o.pts)})`)));
    sel.addEventListener('change', () => sc.set(code, { option: +sel.value, pts: null }));
    wrap.appendChild(sel);
    const o = it.options[st.option || 0];
    if (o && o.min != null && o.min !== o.max) wrap.appendChild(ptsInput(sc, code, st.pts != null ? st.pts : o.pts, o.min, o.max));
    return wrap;
  }
  if (it.min != null && it.min !== it.max) {
    wrap.appendChild(ptsInput(sc, code, st.pts != null ? st.pts : it.pts, it.min, it.max));
    return wrap;
  }
  return null;
}
function ptsInput(sc, code, value, min, max) {
  const lo = Math.min(min, max), hi = Math.max(min, max);
  const i = num((value / 100).toFixed(2));
  i.dataset.k = 'pts';
  i.min = (lo / 100).toFixed(2);
  i.max = (hi / 100).toFixed(2);
  i.setAttribute('aria-label', `Points for ${code}, from ${rangeText(lo, hi)}`);
  i.addEventListener('change', () => {
    let v = Math.round(parseFloat(i.value) * 100);
    if (!isFinite(v)) v = value;
    v = Math.max(lo, Math.min(hi, v));
    sc.set(code, { pts: v });
  });
  return h('label.cnv-ptsin', h('span.small.muted', 'Points'), i, h('span.small.faint', rangeText(lo, hi)));
}
function caseList(sc, code, it, st) {
  const box = h('div.cnv-cases');
  const cases = (st.cases || []).map((c) => Object.assign({}, c));
  const commit = () => sc.set(code, { cases });
  cases.forEach((c, i) => {
    const lab = h('input', { type: 'text', placeholder: `Which ${it.unit || 'case'} (e.g. PMID 12345678)`, 'aria-label': `${code}: which ${it.unit || 'case'}`, dataset: { k: `c${i}l` } });
    lab.value = c.label || '';
    lab.addEventListener('change', () => { c.label = lab.value.trim(); commit(); });
    const parts = [lab];
    if (it.perConfirmed != null) {
      const conf = h('select', { 'aria-label': `${code}: de novo confirmed or assumed`, dataset: { k: `c${i}c` } }, h('option', { value: '1', selected: c.confirmed !== false || null }, 'Confirmed de novo'), h('option', { value: '0', selected: c.confirmed === false || null }, 'Assumed de novo'));
      conf.addEventListener('change', () => { c.confirmed = conf.value === '1'; c.pts = null; commit(); });
      parts.push(conf);
    }
    const per = c.pts != null ? c.pts : it.perConfirmed != null ? (c.confirmed === false ? it.perAssumed : it.perConfirmed) : it.per;
    if (it.perMin != null && it.perMin !== it.perMax) {
      const lo = Math.min(it.perMin, it.perMax), hi = Math.max(it.perMin, it.perMax);
      const n = num((per / 100).toFixed(2));
      n.dataset.k = `c${i}p`;
      n.min = (lo / 100).toFixed(2);
      n.max = (hi / 100).toFixed(2);
      n.setAttribute('aria-label', `${code}: points for this ${it.unit || 'case'}, from ${rangeText(lo, hi)}`);
      n.addEventListener('change', () => {
        let v = Math.round(parseFloat(n.value) * 100);
        if (!isFinite(v)) v = per;
        c.pts = Math.max(lo, Math.min(hi, v));
        commit();
      });
      parts.push(n);
    }
    const del = h('button.icon-btn', { type: 'button', 'aria-label': `Remove this ${it.unit || 'case'}`, html: icon('x'), dataset: { k: `c${i}x` } });
    del.addEventListener('click', () => {
      cases.splice(i, 1);
      if (!cases.length) sc.set(code, { cases, on: false });
      else commit();
    });
    parts.push(del);
    box.appendChild(h('div.cnv-case', parts));
  });
  const add = h('button.btn.small', { type: 'button', html: icon('plus') + `<span>Add a ${esc(it.unit || 'case')}</span>`, dataset: { k: 'addcase' } });
  add.addEventListener('click', () => {
    cases.push({ label: '', confirmed: true });
    commit();
  });
  box.appendChild(h('div.btn-row', add, h('span.small.muted', `${cases.length} ${cases.length === 1 ? it.unit || 'case' : (it.unit || 'case') + 's'}${it.max != null ? `, at most ${it.max < 0 ? '−' : '+'}${pts2(it.max)} in all` : ''}`)));
  return box;
}

/* ---------------- the panel ---------------- */
/** advice on combinations the standards advise against */
export function cnvWarnings(sc) {
  const on = (c) => sc.isOn(c);
  const out = [];
  const s4 = Object.keys(sc.items).filter((k) => /^4[A-N]$/.test(k) && on(k));
  if (on('2A') && s4.length) out.push(`Section 2 already gives points for an established ${sc.type === 'loss' ? 'haploinsufficient' : 'triplosensitive'} gene or region (2A), so the standards go straight to section 5 without ${s4.join(', ')}.`);
  const hiItems = ['2A', '2B', '2C-1', '2C-2', '2D-1', '2D-2', '2D-3', '2D-4'].filter((k) => sc.items[k] && on(k));
  if (sc.type === 'loss' && on('2H') && hiItems.length) out.push(`2H is for when no established haploinsufficient gene or region is involved, so the ACGS 2024 guidelines don’t use it once 2A to 2D-4 apply. Here you’ve used ${hiItems.join(', ')}.`);
  if (on('4O') && on('2A')) out.push('4O (common in the population) and 2A (an established dosage-sensitive gene or region) contradict each other, so look again at both.');
  if (on('1B') && (on('2A') || on('3B') || on('3C'))) out.push('1B says there are no protein-coding genes or functional elements, which the other items contradict.');
  const s3 = ['3A', '3B', '3C'].some(on);
  const s5 = Object.keys(sc.items).some((k) => /^5[A-H]$/.test(k) && on(k));
  const s1 = on('1A') || on('1B');
  const missing = [];
  if (!s1) missing.push('section 1 (1A or 1B)');
  if (!s3 && !on('1B')) missing.push('section 3 (3A, 3B or 3C)');
  if (!s5) missing.push('section 5');
  if (missing.length && (s1 || s3 || s5 || s4.length)) out.push(`Not scored yet: ${missing.join(', ')}.`);
  return out;
}

/** the panel: the scale, the class, the items section by section */
export function cnvPanel(sc, opts = {}) {
  const bar = scoreBar();
  const result = h('div.acmg-result', { 'aria-live': 'polite' });
  const live = h('div.visually-hidden', { 'aria-live': 'assertive' });
  const announce = (t) => (live.textContent = t);
  const mode = settings.get('suggestions');
  const sugBtn = h('button.btn.small', { type: 'button' });
  const sugLabel = () => {
    const n = Object.keys(sc.suggestions || {}).length;
    sugBtn.innerHTML = icon('lightbulb') + `<span>${sc.showSuggestions ? 'Hide suggestions' : 'Show suggestions'}${n && !sc.showSuggestions ? ` (${n})` : ''}</span>`;
  };
  sugBtn.addEventListener('click', () => {
    sc.showSuggestions = !sc.showSuggestions;
    sugLabel();
    sc.changed(null, true);
  });
  sugLabel();
  const head = h('div.acmg-head', h('h2', 'Classification'), mode === 'never' ? null : sugBtn);
  const which = h('p.small.muted.cnv-which', `This panel scores a copy-number ${sc.type} with the ACMG/ClinGen standards for copy-number variants (Riggs et al. 2020). Points add up across the sections.`);
  const secs = h('div.acmg-crit.cnv-secs');
  const subtotals = {};
  // on a phone the panel comes before the evidence: its sections start closed there
  const wide = !(window.matchMedia && window.matchMedia('(max-width: 960px)').matches);
  for (const S of RUBRIC[sc.type]) {
    const sub = h('span.cnv-sub');
    subtotals[S.key] = sub;
    const body = h('div.cnv-sec-b');
    if (S.note) body.appendChild(h('p.small.muted.cnv-sec-note', S.note));
    for (const it of S.items) body.appendChild(itemRow(sc, it.code, { where: 'panel', announce }));
    secs.appendChild(h('details.acmg-side.cnv-sec', { open: wide || null },
      h('summary', h('span.cnv-sec-n', S.key), h('span.cnv-sec-t', { title: S.title }, (SECTION_TITLES[sc.type] || {})[S.key] || S.title), sub),
      body));
  }
  const panel = h('section.acmg-panel.cnv-panel', { 'aria-label': 'Classification of the copy-number variant' }, head, which, bar, result, live, secs, opts.footer || null);
  const draw = () => {
    const r = sc.result();
    bar.set(r.total);
    result.innerHTML = '';
    result.appendChild(h('div.res-line', clsBadge(r.cls, { big: true }), h('span.res-pts', `${r.total > 0 ? '+' : r.total < 0 ? '−' : ''}${pts2(r.total)} points`)));
    result.appendChild(h('div.res-crit', r.rows.length ? h('span.hgvs', sc.summary(r)) : h('span.muted', 'Nothing is scored yet. You can use the items below, or the same items beside their evidence on the page.')));
    for (const w of cnvWarnings(sc)) result.appendChild(h('div.small.res-warn', { html: icon('warning') + '<span>' + esc(w) + '</span>' }));
    for (const S of RUBRIC[sc.type]) {
      const t = r.rows.filter((x) => x.section === S.key).reduce((a, x) => a + x.pts, 0);
      const used = r.rows.some((x) => x.section === S.key);
      subtotals[S.key].textContent = used ? `${t > 0 ? '+' : t < 0 ? '−' : ''}${pts2(t)}` : '';
    }
    if (opts.onChange) opts.onChange(r);
  };
  draw();
  sc.on(() => draw());
  bus.on('settings', () => panel.isConnected && draw());
  return panel;
}

/** the items of the rubric bound to the score, for an evidence section */
export function itemsBox(sc, codes, title = 'Points from this evidence') {
  const box = h('div.sec-crit.cnv-items', h('div.sec-crit-h', title));
  const live = h('div.visually-hidden', { 'aria-live': 'polite' });
  const announce = (t) => (live.textContent = t);
  for (const c of codes) if (itemOf(sc.type, c)) box.appendChild(itemRow(sc, c, { where: 'sec', announce }));
  box.appendChild(live);
  return box;
}

export { pts2, fmtPts };
