/* =====================================================================
   The classification panel: every criterion, which the student marks
   as met (at a strength) or not met, with the evidence scale and the
   class that results, kept up to date as they go.

   A criterion has three states, as in ClinGen's curation interface:
   not evaluated (the start), met, and not met (looked at, and the
   evidence does not meet it). Reports list all three.

   The same criterion can also be shown in an evidence section, beside
   its evidence: criterionRow() makes a row bound to the same state, and
   every row and the panel are redrawn when it changes.
   ===================================================================== */
import { h, esc, icon, modal, bus } from '../core.js';
import { CRITERIA, BY_CODE, GROUPS, REFS } from '../acmg/criteria.js';
import { classify, criteriaString, POINTS } from '../acmg/engine.js';
import { fw, defaultFor, strengthsFor, labelFor, fitStrength as fitStrengthIn } from '../acmg/frameworks.js';
import { scale } from './scale.js';
import { clsBadge, strengthKind } from '../ui.js';
import * as settings from '../settings.js';

const SW = { VS: 'Very strong', S: 'Strong', M: 'Moderate', P: 'Supporting', SA: 'Stand-alone' };
const IS_WORD = { p: 'pathogenic', lp: 'likely pathogenic', vus: 'of uncertain significance', lb: 'likely benign', b: 'benign' }; // "it is …"
export const framework = () => settings.get('framework') || 'acgs2024';

/**
 * A classification in progress, shared by the panel and the rows in the sections.
 *   state: { criteria: { code: {met: true|false, evaluated: true, strength, note} } }
 *   suggestions: { code: { strength, why } }
 */
export class Classification {
  constructor(state, opts = {}) {
    this.state = state || { criteria: {} };
    this.state.criteria = this.state.criteria || {};
    this.suggestions = {};
    this.notes = {};
    this.listeners = new Set();
    this.showSuggestions = opts.showSuggestions || false;
    this.readOnly = !!opts.readOnly;
  }
  get(code) {
    return this.state.criteria[code] || { met: false, evaluated: false, strength: defaultFor(code, framework()), note: '' };
  }
  set(code, patch) {
    const cur = this.get(code);
    const next = Object.assign({}, cur, patch);
    if (!next.strength) next.strength = defaultFor(code, framework());
    if (!next.met && !next.evaluated && !next.note) delete this.state.criteria[code];
    else this.state.criteria[code] = next;
    this.changed(code);
  }
  setSuggestions(s) {
    this.suggestions = {};
    this.notes = {};
    for (const [k, v] of Object.entries(s || {})) {
      if (k.startsWith('_')) this.notes[k] = v;
      else this.suggestions[k] = v;
    }
    this.changed(null, true);
  }
  result() {
    return classify(this.state, { framework: framework(), vusBands: settings.get('vusBands') !== false });
  }
  on(fn) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }
  changed(code, quiet) {
    for (const fn of Array.from(this.listeners)) fn(code, quiet);
  }
  criteriaString() {
    return criteriaString(this.result().met, framework());
  }
}

/** why a criterion wasn't suggested, when the evidence came close: the note suggest() leaves for it */
const NOTE_FOR = { PVS1: '_pvs1Note', PP3: '_predNote', BP4: '_bp4Note', BP7: '_bp7Note', PP1: '_pp1Note', BA1: '_ba1Note', BS1: '_bs1Note', BS2: '_bs2Note' };

/** the strength suggested for a criterion, limited to what the framework allows */
function fitStrength(c, s) {
  const allowed = strengthsFor(c, framework());
  if (allowed.includes(s)) return s;
  const order = ['VS', 'S', 'M', 'P'];
  const i = order.indexOf(s);
  for (let j = i + 1; j < order.length; j++) if (allowed.includes(order[j])) return order[j];
  return allowed[allowed.length - 1];
}

/** one criterion's row: Met / Not met, strength, the evidence note, and its suggestion */
export function criterionRow(cls, code, opts = {}) {
  const c = BY_CODE[code];
  const row = h('div.crow' + (c.dir === 'B' ? '.benign' : '.pathogenic'), { dataset: { code } });
  const draw = () => {
    const F = framework();
    const st = cls.get(code);
    const sug = cls.suggestions[code];
    const showSug = !!(sug && cls.showSuggestions);
    // a note being typed (its change event not yet fired) survives the row being drawn again
    const old = row.querySelector('.crow-note input');
    const typing = old && old === document.activeElement ? { value: old.value, a: old.selectionStart, b: old.selectionEnd } : null;
    row.innerHTML = '';
    row.classList.toggle('met', !!st.met);
    row.classList.toggle('notmet', !st.met && !!st.evaluated);
    const strengths = strengthsFor(c, F);
    const strength = fitStrengthIn(c, st.strength, F) || defaultFor(code, F); // as the engine counts it
    // a criterion not (yet) met shows its bare code; met, it shows the strength it is used at
    const label = st.met ? labelFor(code, strength, F) : code;
    const chip = h('span.crit.' + strengthKind(code, st.met ? strength : defaultFor(code, F)) + (st.met ? '' : '.idle'), label);
    const name = h('span.crow-name', c.name);
    const info = h('button.crow-title', { type: 'button', title: `What ${code} means, and how to use it` }, chip, name);
    info.addEventListener('click', () => criterionGuide(code));
    const metB = h('button.crow-btn.yes', { type: 'button', 'aria-pressed': st.met ? 'true' : 'false', disabled: cls.readOnly || null, title: `${code} is met` }, 'Met');
    const notB = h('button.crow-btn.no', { type: 'button', 'aria-pressed': !st.met && st.evaluated ? 'true' : 'false', disabled: cls.readOnly || null, title: `${code} was looked at and is not met` }, 'Not met');
    metB.addEventListener('click', () => {
      if (st.met) cls.set(code, { met: false, evaluated: false });
      else cls.set(code, { met: true, evaluated: true, strength: showSug ? fitStrength(c, sug.strength) : strength });
    });
    notB.addEventListener('click', () => {
      if (!st.met && st.evaluated) cls.set(code, { met: false, evaluated: false });
      else cls.set(code, { met: false, evaluated: true });
    });
    const group = h('div.crow-state', { role: 'group', 'aria-label': `${code}: met or not met` }, metB, notB);
    let strengthEl;
    if (strengths.length > 1) {
      strengthEl = h('select.crow-str', { 'aria-label': `Strength of ${code}`, disabled: cls.readOnly || !st.met || null });
      for (const s of strengths) strengthEl.appendChild(h('option', { value: s, selected: s === strength || null }, `${SW[s]}${s === defaultFor(code, F) ? ' (default)' : ''}`));
      strengthEl.addEventListener('change', () => cls.set(code, { strength: strengthEl.value, met: true, evaluated: true }));
    } else strengthEl = h('span.crow-str.fixed', SW[strengths[0]]);
    const pts = st.met ? (c.dir === 'B' ? (strength === 'SA' ? 'alone' : '−' + POINTS[strength]) : '+' + POINTS[strength]) : '';
    row.append(info, group, strengthEl, h('span.crow-pts', { title: 'Points' }, pts));
    if (showSug) {
      const sStr = fitStrength(c, sug.strength);
      const applied = st.met && strength === sStr;
      const take = h('button.btn.small', { type: 'button', disabled: cls.readOnly || applied || null }, applied ? 'Applied' : `Apply ${labelFor(code, sStr, F)}`);
      take.addEventListener('click', () => cls.set(code, { met: true, evaluated: true, strength: sStr, note: st.note || sug.why }));
      row.appendChild(h('div.crow-sug', h('span.sug-mark', { 'aria-hidden': 'true', html: icon('lightbulb') }), h('span.sug-text', h('b', `Suggested: ${labelFor(code, sStr, F)}. `), sug.why), take));
    } else if (cls.showSuggestions && typeof cls.notes[NOTE_FOR[code]] === 'string') {
      row.appendChild(h('div.crow-sug.against', h('span.sug-mark', { 'aria-hidden': 'true', html: icon('info') }), h('span.sug-text', h('b', 'Not suggested. '), cls.notes[NOTE_FOR[code]])));
    }
    if (st.met || st.evaluated || st.note) {
      const note = h('input', { type: 'text', placeholder: st.met ? 'The evidence that meets it (goes on the report)' : 'Why it is not met', 'aria-label': `Evidence for ${code}`, disabled: cls.readOnly || null });
      note.value = st.note || '';
      note.addEventListener('change', () => cls.set(code, { note: note.value.trim(), evaluated: true }));
      row.appendChild(h('div.crow-note', note));
      if (typing) {
        if (typing.value.trim() !== (st.note || '')) note.value = typing.value;
        note.focus({ preventScroll: true });
        try {
          note.setSelectionRange(typing.a, typing.b);
        } catch (e) {
          /* not a text field */
        }
      }
    }
    if (c.deprecated && fw(F).retired.includes(code)) row.appendChild(h('div.crow-dep.small', 'ClinGen retired this criterion in 2018 and the ACGS 2024 guidelines leave it out, so weigh the evidence behind other classifications instead.'));
  };
  draw();
  const off = cls.on((changed) => {
    if (!row.isConnected && row._drawn) {
      off();
      return;
    }
    row._drawn = true;
    if (changed == null || changed === code) draw();
  });
  bus.on('settings', () => row.isConnected && draw());
  return row;
}

/** the panel: the scale, the result and the criteria by group */
export function acmgPanel(cls, opts = {}) {
  const sc = scale({ bands: settings.get('vusBands') !== false });
  const result = h('div.acmg-result', { 'aria-live': 'polite' });
  const crit = h('div.acmg-crit');
  const suggestBtn = h('button.btn.small', { type: 'button' });
  const mode = settings.get('suggestions');
  const sugLabel = () => {
    const n = Object.keys(cls.suggestions || {}).length;
    suggestBtn.innerHTML = icon('lightbulb') + `<span>${cls.showSuggestions ? 'Hide suggestions' : 'Show suggestions'}${n && !cls.showSuggestions ? ` (${n})` : ''}</span>`;
  };
  suggestBtn.addEventListener('click', () => {
    cls.showSuggestions = !cls.showSuggestions;
    sugLabel();
    cls.changed(null, true);
  });
  sugLabel();
  const fwId = 'fwsel' + Math.random().toString(36).slice(2, 7);
  const fwSel = h('select.fw-select', { id: fwId });
  for (const k of ['acgs2024', 'clingen', 'acmg2015']) fwSel.appendChild(h('option', { value: k, selected: k === framework() || null }, fw(k).label));
  fwSel.addEventListener('change', () => settings.set('framework', fwSel.value));
  const head = h('div.acmg-head', h('h2', 'Classification'), mode === 'never' ? null : suggestBtn);
  const drawCriteria = () => {
    crit.innerHTML = '';
    const F = fw(framework());
    const showRetired = settings.get('showDeprecated');
    const visible = (c) => !c.deprecated || !F.retired.includes(c.code) || showRetired || cls.get(c.code).met;
    for (const [dir, title, dot] of [['P', 'Pathogenic criteria', 'p'], ['B', 'Benign criteria', 'b']]) {
      const box = h('div.acmg-dir');
      for (const g of GROUPS) {
        const cs = CRITERIA.filter((c) => c.dir === dir && c.group === g.key && visible(c));
        if (!cs.length) continue;
        box.appendChild(h('div.acmg-group', h('h4', g.label), cs.map((c) => criterionRow(cls, c.code, { where: 'panel' }))));
      }
      // on a narrow screen the panel comes before the evidence: its lists start closed (each section has its criteria)
      const narrow = typeof window.matchMedia === 'function' && window.matchMedia('(max-width: 960px)').matches;
      crit.appendChild(h('details.acmg-side', { open: narrow ? null : true }, h('summary', h('span.side-dot.' + dot), title), box));
    }
  };
  drawCriteria();
  const panel = h('section.acmg-panel', { 'aria-label': 'ACMG/AMP classification' }, head, h('div.fw-row', h('label', { for: fwId }, 'Guidelines'), fwSel), sc, result, crit, opts.footer || null);
  const draw = () => {
    const r = cls.result();
    sc.set(r);
    result.innerHTML = '';
    result.appendChild(h('div.res-line', clsBadge(r.cls, { big: true, band: r.band }), h('span.res-pts', `${r.points > 0 ? '+' : ''}${r.points} ${Math.abs(r.points) === 1 ? 'point' : 'points'}`)));
    result.appendChild(h('div.res-crit', r.met.length ? h('span.hgvs', criteriaString(r.met, framework())) : h('span.muted', 'No criteria are met yet. Mark each one as met or not met, either here or beside its evidence.')));
    const lines = [];
    if (r.method === 'points') {
      lines.push(h('div.small', `The probability that it’s pathogenic is ${r.posterior >= 0.999 ? 'above 0.999' : r.posterior <= 0.001 ? 'below 0.001' : r.posterior.toFixed(3)} (Tavtigian et al. 2018).`));
      const br = r.byRules, same = br.cls === r.cls;
      const why = !br.rule ? '' : br.cls === 'vus' ? `, because ${br.rule.text}` : `, with ${br.rule.text}`;
      lines.push(h('div.small' + (same ? '.muted' : '.res-differ'), `Under the 2015 combining rules it${same ? '’s also' : ' would be'} ${IS_WORD[br.cls]}${why}.${same ? '' : ' The two methods give different classes here, and the guide explains why.'}`));
    } else {
      const rule = r.byRules.rule;
      if (rule) lines.push(h('div.small.muted', r.byRules.cls === 'vus' ? `It’s of uncertain significance because ${rule.text}.` : `This meets ${rule.name} in Table 5 of Richards et al. (2015), which asks for ${rule.text}.`));
      const same = r.byPoints.cls === r.cls;
      lines.push(h('div.small' + (same ? '.muted' : '.res-differ'), `Counted as points (Tavtigian et al. 2020), it${same ? '’s also' : ' would be'} ${IS_WORD[r.byPoints.cls]}.${same ? '' : ' The two methods give different classes here, and the guide explains why.'}`));
    }
    for (const nt of r.notes || []) lines.push(h('div.small.res-note', nt));
    for (const w of warnings(cls)) lines.push(h('div.small.res-warn', { html: icon('warning') + '<span>' + esc(w) + '</span>' }));
    result.append(...lines);
    if (opts.onChange) opts.onChange(r);
  };
  draw();
  cls.on(() => draw());
  bus.on('settings', (e) => {
    if (!panel.isConnected) return;
    if (e && e.key === 'framework') fwSel.value = framework();
    drawCriteria();
    draw();
  });
  return panel;
}

/** combinations that ClinGen and the ACGS advise against */
export function warnings(cls) {
  const m = (c) => cls.get(c).met;
  const s = (c) => cls.get(c).strength;
  const F = framework();
  const out = [];
  if (m('PVS1') && m('PM4')) out.push('PVS1 and PM4 count the same effect on the protein, so use only one of them.');
  if (m('PVS1') && m('PP3')) out.push(F === 'acgs2024' ? 'The ACGS 2024 guidelines don’t use PP3 with PVS1.' : 'Using PP3 with PVS1 counts the same predicted effect twice, unless PP3 is for a different effect.');
  if (F === 'acgs2024' && m('PVS1') && (m('PM1') || m('PP2'))) out.push('The ACGS 2024 guidelines don’t use PM1 or PP2 with PVS1.');
  if (F === 'acgs2024' && m('PVS1') && s('PVS1') === 'VS' && m('PS3')) out.push('The ACGS 2024 guidelines don’t use PS3 alongside full-strength PVS1.');
  if (m('PM2') && (m('BS1') || m('BA1'))) out.push('PM2 (absent or very rare) and BS1 or BA1 (too common) contradict each other.');
  if (m('PS1') && m('PM5')) out.push('PS1 (the same amino acid change) and PM5 (a different one at the residue) are not usually both used for one variant.');
  if (m('PM1') && m('PP3') && F === 'clingen' && POINTS[s('PM1')] + POINTS[s('PP3')] > 4) out.push('ClinGen counts PM1 and PP3 together as at most 4 points (Pejaver et al. 2022), so the points here are capped and part of PM1 doesn’t count.');
  else if (m('PM1') && m('PP3') && F === 'acgs2024' && POINTS[s('PM1')] + POINTS[s('PP3')] > 4) out.push('The ACGS 2024 guidelines set no cap on PM1 with PP3 (ClinGen caps the two at 4 points together). Still, make sure they rest on different evidence.');
  if (m('PS2') && m('PM6')) out.push('PS2 and PM6 are a single tally of de novo occurrences, so use one code at the strength the points reach.');
  if (m('PP1') && m('BS4')) out.push('PP1 and BS4 both describe the segregation in the family, so they shouldn’t both be met.');
  if (m('BP7') && !m('BP4') && F !== 'acmg2015') out.push('ClinGen (Walker et al. 2023) uses BP7 only when BP4 is met for the splicing prediction.');
  if (F === 'clingen' && m('PM2') && s('PM2') === 'M') out.push('ClinGen applies PM2 at supporting strength (2020), but the ACGS 2024 guidelines keep it at moderate.');
  if (F === 'acgs2024' && m('PP3') && s('PP3') !== 'P') out.push('The ACGS 2024 guidelines use PP3 at supporting strength only.');
  if ((m('PP5') || m('BP6')) && F !== 'acmg2015') out.push('PP5 and BP6 are retired. Instead, weigh the evidence behind other classifications under the criteria it supports.');
  if (m('BA1') && Object.keys(cls.state.criteria).some((k) => k[0] === 'P' && cls.get(k).met)) out.push('BA1 is met, so the variant is benign on frequency alone unless it is one of ClinGen’s exceptions.');
  if (m('PP4') && (m('PS2') || m('PM6')) && F === 'acgs2024') out.push('The ACGS 2024 guidelines count the phenotype’s specificity in the de novo points, so don’t count it again as PP4 for the same patient.');
  return out;
}

/** the guide to one criterion, in a dialog */
export function criterionGuide(code) {
  const c = BY_CODE[code];
  const F = framework();
  const st = strengthsFor(c, F);
  const body = h('div.crit-guide',
    h('p', c.short),
    h('p.small.muted', `Default strength${F === 'acgs2024' && code === 'PM2' ? ' (ACGS 2024)' : ''}: ${SW[defaultFor(code, F)]}. ${st.length > 1 ? 'With ' + fw(F).label + ', you can use it at these strengths: ' + st.map((s) => SW[s].toLowerCase()).join(', ') + '.' : 'Its strength is fixed.'}`),
    h('ul', c.guide.map((g) => h('li', g))),
    h('h3', 'Sources'),
    h('ul.small', (c.refs || []).map((r) => (REFS[r] ? h('li', h('a', { href: REFS[r].url, target: '_blank', rel: 'noopener' }, REFS[r].text)) : null))),
    h('p.small', h('a', { href: '#/learn/' + code }, 'More in the guide to the criteria')));
  modal(`${code}: ${c.name}`, body, { wide: true });
}
