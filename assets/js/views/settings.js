/* =====================================================================
   Settings (#/settings): the user's own choices, kept in this browser:
   their name, the guidelines they follow, suggestions, the predictor
   for PP3 and BP4, what the classification panel shows, and the genome
   build for new look-ups. The site's defaults are in assets/js/config.js.
   ===================================================================== */
import { h, toast, confirmBox } from '../core.js';
import { link } from '../router.js';
import * as settings from '../settings.js';
import { CFG } from '../settings.js';
import { page, pageHead, note, btn } from '../ui.js';
import { FRAMEWORKS, FRAMEWORK_LIST, fw, labelFor } from '../acmg/frameworks.js';
import { PREDICTORS, thresholdMarks } from '../acmg/thresholds.js';
import { strengthKind } from '../ui.js';

/* one sentence on each set of guidelines, from what acmg/frameworks.js sets */
const ABOUT_FW = {
  acgs2024: 'The UK’s guidelines. They use points, keep PM2 at moderate strength and use PP3 and BP4 at supporting strength only (with REVEL and SpliceAI). Any class but uncertain needs at least two criteria.',
  clingen: 'ClinGen’s guidance and its expert panels’ practice. They use points, put PM2 at supporting strength and use predictors calibrated up to PP3_Strong and BP4_Strong.',
  acmg2015: 'The original combining rules of Richards et al. (2015), which count the criteria at each strength. PP5 and BP6 are still in use.'
};
const SUGGEST = [
  ['show', 'Show suggestions from the start', 'The site marks each criterion the evidence seems to support and gives its reason. You still decide, and you apply each criterion yourself.'],
  ['button', 'Show suggestions when you ask', 'Suggestions stay hidden until you press Show suggestions beside the criteria, so that you weigh the evidence first.'],
  ['never', 'Never show suggestions', 'Use this to practise as you would in an assessment.']
];

export function render(root) {
  const p = page('narrow.settings-page');
  root.appendChild(p);
  p.appendChild(pageHead({ title: 'Settings', lede: 'Your choices are kept in this browser, and each one takes effect straight away on every page.' }));
  const body = h('div.set-body');
  p.appendChild(body);
  const draw = () => {
    body.innerHTML = '';
    body.append(nameSection(), guidelinesSection(draw), suggestionsSection(), predictorSection(), displaySection(), buildSection(), resetSection(draw));
  };
  draw();
}

const saved = (what) => toast(what, 'ok', 2600);

function section(title, intro, ...kids) {
  return h('section.set-sec', { 'aria-label': title }, h('h2', title), intro ? h('p.set-intro', intro) : null, ...kids);
}

/** a set of radio choices: [[value, label, description]] */
function choices(name, legend, items, current, onPick, opts = {}) {
  const fs = h('fieldset.set-choices');
  fs.appendChild(h('legend.visually-hidden', legend));
  for (const [value, label, about] of items) {
    const r = h('input', { type: 'radio', name, value });
    r.checked = value === current;
    r.addEventListener('change', () => r.checked && onPick(value));
    fs.appendChild(h('label.set-choice', r, h('span.set-choice-t', h('b', label), opts.mark && opts.mark(value) ? h('span.tag', opts.mark(value)) : null, about ? h('span.set-choice-d', about) : null)));
  }
  return fs;
}

/* ---------------- you ---------------- */
function nameSection() {
  const input = h('input', { type: 'text', id: 'set-name', autocomplete: 'name', placeholder: 'Your name', maxlength: 80 });
  input.value = settings.get('name') || '';
  const save = () => {
    const v = input.value.trim();
    if (v === (settings.get('name') || '')) return;
    settings.set('name', v);
    saved(v ? `You’ll sign your classifications as ${v}.` : 'Your name has been cleared.');
  };
  input.addEventListener('change', save);
  input.addEventListener('keydown', (e) => e.key === 'Enter' && input.blur());
  return section('Your name', null,
    h('div.field.set-name', h('label', { for: 'set-name' }, 'Name'), input, h('span.hint', 'It goes on each classification you sign and on your reports, just as a laboratory classifier’s name would. It stays in this browser.')));
}

/* ---------------- guidelines ---------------- */
function guidelinesSection(redraw) {
  const cur = settings.get('framework');
  const items = FRAMEWORK_LIST.map((k) => [k, fw(k).label, ABOUT_FW[k]]);
  return section('Guidelines', 'Your guidelines decide how the criteria are combined, the strengths they can take and how strengths are written. You can also change this beside the criteria on any variant’s page.',
    choices('fw', 'Guidelines', items, cur, (v) => {
      settings.set('framework', v);
      saved(`You now follow ${fw(v).label}.`);
      redraw();
    }, { mark: (v) => (v === (CFG.framework || 'acgs2024') ? 'the site’s default' : null) }),
    h('p.small', 'See ', h('a', { href: link('/learn/frameworks') }, 'how the three sets of guidelines differ'), '.'));
}

/* ---------------- suggestions ---------------- */
function suggestionsSection() {
  if (CFG.suggestions === 'never') {
    return section('Suggestions', null, note('', h('p', 'Suggestions from the evidence are switched off on this site for this course, so you weigh every criterion yourself.')));
  }
  return section('Suggestions', 'The site can point out the criteria that the evidence seems to support and explain why, for example PM2 for a variant absent from gnomAD. It never applies a criterion for you.',
    choices('sug', 'Suggestions', SUGGEST, settings.get('suggestions'), (v) => {
      settings.set('suggestions', v);
      saved('Saved. The site will ' + SUGGEST.find((x) => x[0] === v)[1].toLowerCase() + '.');
    }, { mark: (v) => (v === (CFG.suggestions || 'button') ? 'the site’s default' : null) }));
}

/* ---------------- the predictor ---------------- */
function predictorSection() {
  const F = settings.get('framework');
  const cur = PREDICTORS[settings.get('predictor')] ? settings.get('predictor') : 'REVEL';
  const sel = h('select', { id: 'set-pred' });
  for (const [k, p] of Object.entries(PREDICTORS)) sel.appendChild(h('option', { value: k, selected: k === cur || null }, p.label));
  const info = h('div.set-pred-info', { 'aria-live': 'polite' });
  const show = (name) => {
    const p = PREDICTORS[name];
    info.innerHTML = '';
    const marks = thresholdMarks(name, F).slice().sort((a, b) => (a.code === b.code ? (a.code === 'PP3' ? a.at - b.at : b.at - a.at) : a.code === 'PP3' ? -1 : 1));
    const acgsRevel = fw(F).key === 'acgs2024' && name === 'REVEL';
    info.append(
      h('p.small', p.about),
      h('div.set-marks', marks.map((m) => h('span.set-mark', h('span.crit.' + strengthKind(m.code, m.strength), labelFor(m.code, m.strength, F)), ` ${m.code === 'PP3' ? '≥' : acgsRevel ? '<' : '≤'} ${m.at}`))),
      h('p.small.muted', fw(F).key === 'acgs2024'
        ? 'With the ACGS 2024 guidelines, PP3 and BP4 are used at supporting strength only. REVEL is read at its ACGS thresholds, and other tools at ClinGen’s supporting thresholds.'
        : 'These are ClinGen’s calibrated thresholds (Pejaver et al. 2022, and Bergquist et al. 2025 for AlphaMissense). Choose one tool before you look at the scores, and keep to it.'));
  };
  sel.addEventListener('change', () => {
    settings.set('predictor', sel.value);
    show(sel.value);
    saved(`PP3 and BP4 suggestions now follow ${PREDICTORS[sel.value].label}.`);
  });
  show(cur);
  return section('The predictor for PP3 and BP4', 'Choose the one missense predictor whose thresholds the suggestions for PP3 and BP4 will use, as ClinGen recommends. Every tool’s score is still shown on a variant’s page.',
    h('div.field.set-pred', h('label', { for: 'set-pred' }, 'Predictor'), sel), info);
}

/* ---------------- what the panel shows ---------------- */
function displaySection() {
  const box = (key, label, about, onMsg, offMsg) => {
    const b = h('input', { type: 'checkbox' });
    b.checked = !!settings.get(key);
    b.addEventListener('change', () => {
      settings.set(key, b.checked);
      saved(b.checked ? onMsg : offMsg);
    });
    return h('label.set-check', b, h('span', h('b', label), h('span.set-choice-d', about)));
  };
  return section('The classification panel', null,
    box('vusBands', 'Show the bands of uncertain significance', 'A variant of uncertain significance is also given its band, from ice cold (0 points) to hot (5 points), using the names from NHS England’s GeNotes.', 'The bands of uncertain significance are now shown.', 'The bands of uncertain significance are now hidden.'),
    box('showDeprecated', 'Show retired criteria', 'PP5 and BP6 are offered with the other criteria, even though ClinGen and the ACGS no longer use them.', 'PP5 and BP6 are now shown.', 'PP5 and BP6 are now hidden, unless they’re already met.'));
}

/* ---------------- the genome build ---------------- */
function buildSection() {
  const def = CFG.defaultAssembly || 'GRCh38';
  return section('Genome build', 'This is the build used for variants you look up by position and for new patients’ variants. Each variant keeps the build it was entered on.',
    choices('asm', 'Genome build', [['GRCh38', 'GRCh38 (hg38)', 'The current build, which gnomAD v4, MANE and most laboratories use.'], ['GRCh37', 'GRCh37 (hg19)', 'The previous build, which you’ll still find in older reports and files, such as gnomAD v2.1.']], settings.get('assembly'), (v) => {
      settings.set('assembly', v);
      saved(`New look-ups will use ${v}.`);
    }, { mark: (v) => (v === def ? 'the site’s default' : null) }));
}

/* ---------------- reset ---------------- */
function resetSection(redraw) {
  return section('Start again', null,
    h('p.set-intro', 'This puts every setting back to the site’s defaults. Your name is kept, and so are your patients.'),
    btn('Reset the settings', async () => {
      const ok = await confirmBox('Reset the settings?', 'The guidelines, suggestions, predictor, display and genome build will go back to the site’s defaults. Your name and your patients won’t change.', { yes: 'Reset' });
      if (!ok) return;
      const name = settings.get('name');
      settings.reset();
      if (name) settings.set('name', name);
      saved('The settings are back to the site’s defaults.');
      redraw();
    }, { icon: 'reset' }));
}
export { FRAMEWORKS };
