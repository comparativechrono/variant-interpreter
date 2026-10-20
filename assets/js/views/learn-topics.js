/* =====================================================================
   The guide's topic pages: how to interpret a variant, the three sets
   of guidelines, combining the evidence, copy-number variants, using
   the site, the glossary and the references. Tables of numbers are made
   from the modules that classify (acmg/engine.js, acmg/frameworks.js,
   cnv/rubric.js, genes.js), so that the guide cannot disagree with the
   site.
   ===================================================================== */
import { h, icon, fmt } from '../core.js';
import { link } from '../router.js';
import * as settings from '../settings.js';
import { REFS, BY_CODE } from '../acmg/criteria.js';
import { FRAMEWORKS, FRAMEWORK_LIST, fw, defaultFor, labelFor } from '../acmg/frameworks.js';
import { POINTS, THRESHOLDS, PRIOR, O_PVST, VUS_BANDS, posterior, classify, richards, criteriaString } from '../acmg/engine.js';
import { RUBRIC, CNV_THRESHOLDS, fmtPts } from '../cnv/rubric.js';
import { DOSAGE, THRESH } from '../genes.js';
import { clsBadge, seg, strengthKind } from '../ui.js';
import { scale } from '../widgets/scale.js';
import { critLink, table, SW, SECTIONS } from './learn-criteria.js';

/* scroll smoothly, unless the reader has asked for less motion */
const smooth = () => { try { return window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth'; } catch (e) { return 'auto'; } };

const CLS = { p: 'Pathogenic', lp: 'Likely pathogenic', vus: 'Uncertain significance', lb: 'Likely benign', b: 'Benign' };
const pct = (x) => (x >= 0.9995 ? 'above 0.999' : x <= 0.0005 ? 'below 0.001' : x.toFixed(3));
const sgn = (n) => (n < 0 ? '−' + Math.abs(n) : String(n)); // a real minus sign
const ref = (key) => (REFS[key] ? h('a', { href: REFS[key].url, target: '_blank', rel: 'noopener' }, REFS[key].text.replace(/\) .*$/, ')')) : key);
const go = (path, text) => h('a', { href: link(path) }, text);
const site = (...body) => h('div.learn-site', h('span.ls-ic', { html: icon('microscope') }), h('p', ...body));

/* ====================================================================
   How to interpret a variant
   ==================================================================== */
function workflow(a) {
  a.append(
    h('h1', 'How to interpret a variant'),
    h('p.learn-lede', 'A classification answers one question: how likely is it that this variant causes this disease? The evidence comes from the patient, their family, the population, the gene and the variant itself. This page takes you through the steps in the order the site sets them out.'));

  const steps = [
    ['patient', 'Start from the patient', [
      'The question is always about a variant and a disease, so begin with the person. Find out why they were tested, their age and sex, how their condition began and progressed, and their family history. Record their features as Human Phenotype Ontology (HPO) terms, and record the features they don’t have as well, because an absent feature can count against a diagnosis as much as a present one counts for it.',
      'In the site, go to Patients and choose New patient, then open the Phenotypes tab. There you can search for terms or find them in a clinical note.']],
    ['pedigree', 'Draw the family', [
      'Who else is affected, who has been tested and whether the parents are related all decide what the family can tell you. That includes whether a variant arose de novo (PS2, PM6), whether it’s in trans with another variant (PM3) and whether it co-segregates with the disease (PP1, BS4).',
      'In the site, this is the Family tab. You draw the family there in Pedigree Studio and record each relative’s genotype for each variant.']],
    ['dna', 'Describe the variant exactly', [
      'Write it in HGVS on the MANE Select transcript if there is one (for example NM_000546.6:c.818G>A), and keep its genomic position and genome build (GRCh38 or GRCh37). Record the zygosity and, once the parents have been tested, how the patient got the variant.',
      'In the site, add it on the Variants tab. You can also look up any variant in the search box at the top and then add it to a patient.']],
    ['microscope', 'Gather the evidence, section by section', [
      'A variant’s page sets the evidence out in the order a laboratory scientist would work through it. It starts with how common the variant is, then what it does to the transcript and protein, what predictors say and whether it may change splicing. After that come what’s known about other variants at the same place, the gene and its diseases, the family, and any functional studies.']],
    ['scale', 'Decide criterion by criterion', [
      'For each criterion, decide whether the evidence meets it and at what strength. Then mark it Met or Not met, and note the evidence. If you leave a criterion unmarked, that means it wasn’t evaluated. If suggestions are switched on, the site points out what the data seem to support, with its reasons, but it never applies a criterion for you. The decision, and the reason for it, are yours.']],
    ['sigma', 'Combine the evidence', [
      'The criteria that are met are combined into one of five classes: pathogenic, likely pathogenic, uncertain significance, likely benign or benign. The site works this out as you go. It uses Tavtigian’s points, as ClinGen and the ACGS do, and the 2015 rules, and it tells you when the two disagree. A variant of uncertain significance is also given a band from ice cold to hot, according to its points.']],
    ['badgeCheck', 'Sign, compare and report', [
      'Signing records the classification in the variant’s history, with your name, the date, the criteria and a summary of the evidence. You can override the calculated class if you give a reason. Once you’ve signed, you can compare your criteria with the answer a case file gives, and with a ClinGen expert panel’s classification if there is one. The report puts the patient’s variants, their classes and the evidence on one printable page.']]
  ];
  const ol = h('ol.learn-steps');
  for (const [, title, paras] of steps) ol.appendChild(h('li', h('h2', title), paras.map((t) => h('p', t))));
  a.appendChild(ol);

  a.appendChild(h('h2', 'The sections of a variant’s page'));
  const dl = h('dl.learn-dl');
  for (const [key, [title, text]] of Object.entries(SECTIONS)) dl.append(h('dt', title), h('dd', text.charAt(0).toUpperCase() + text.slice(1)));
  a.appendChild(dl);

  a.appendChild(h('h2', 'Before you start: is it the right gene?'));
  a.appendChild(h('p', 'Only classify a variant for a disease that the gene is known to cause, and in the way the gene is known to cause it. Check the gene–disease relationship first, with ClinGen’s gene–disease validity or Gene2Phenotype in the Gene and disease section. PVS1 needs loss of function to be an established cause of the disease. And if the gene’s role is disputed or limited, most variants stay of uncertain significance however much other evidence there is.'));

  a.appendChild(h('h2', 'This site and the platforms laboratories use'));
  a.appendChild(h('p', 'The site is a teaching tool modelled on the workflow of clinical variant-interpretation platforms such as DECIPHER, where clinicians record a patient’s phenotype and variants and classify them with the ACMG/AMP criteria. It has no affiliation with DECIPHER or any other platform and carries none of their branding. It doesn’t share anything with them either, because what you enter stays in your browser.'));
  a.appendChild(h('p', 'These parts work as they do on such platforms:'));
  a.appendChild(h('ul', [
    'A patient record with HPO terms, each marked present or absent.',
    'A table of the patient’s variants, with their zygosity, inheritance, pathogenicity and contribution to the phenotype.',
    'An evidence interface that takes you through the criteria one by one, with suggestions from the data that are never applied automatically.',
    'Scoring of copy-number variants with the points of Riggs et al. (2020).',
    'A genome browser with ClinVar, ClinGen dosage sensitivity and DGV tracks.',
    'Pages for genes, and matching of phenotypes with diseases.'
  ].map((t) => h('li', t))));
  a.appendChild(h('p', 'What it adds for students:'));
  a.appendChild(h('ul', [
    'It works without an account and without real, consented patients, because you practise on fictional cases.',
    'A pedigree editor that records each relative’s genotypes, and a co-segregation likelihood ratio for PP1 and BS4.',
    'Calculators for ClinGen’s de novo points (PS2, PM6) and in-trans points (PM3), for OddsPath (PS3, BS3) and for the highest credible allele frequency (BS1).',
    'The ACGS 2024 points and the bands of uncertain significance, shown beside the 2015 rules and the Bayesian probability of pathogenicity.',
    'A view of the SpliceAI scores.',
    'Comparison with a case’s answer, and with ClinGen expert panels’ classifications from their Evidence Repository, once you’ve signed your own.',
    'Signed classifications with their history, and a printable report.'
  ].map((t) => h('li', t))));
  a.appendChild(h('div.note.warn', h('p', h('b', 'This site is for teaching only. '), 'Its annotations come from public services as they answer on the day you look, some of its rules are simplified, and nothing here has been validated for diagnosis. Keep real patients’ details out of it.')));
}

/* ====================================================================
   Three sets of guidelines
   ==================================================================== */
function frameworks(a) {
  a.append(
    h('h1', 'Three sets of guidelines'),
    h('p.learn-lede', 'The 28 criteria are the same everywhere. What differs is how they are combined, the strength some start at, the strengths they may be given, and how a strength is written. You can choose which set to follow in Settings, or beside the criteria on any variant’s page.'));
  const keys = FRAMEWORK_LIST;
  const writeEx = (k) => [labelFor('PM2', 'P', k), labelFor('PS3', 'S', k), labelFor('PVS1', 'S', k)].join(', ');
  const spl = (k) => {
    const s = fw(k).splice;
    return `PP3 ${s.pp3Strict ? '>' : '≥'} ${s.pp3}, BP4 ${s.bp4Strict ? '<' : '≤'} ${s.bp4}`;
  };
  const pp3 = (k) => (k === 'acgs2024' ? `Supporting only (REVEL ≥ ${fw(k).predictor.REVEL.pp3.P} for PP3, < ${fw(k).predictor.REVEL.bp4.P} for BP4)` : k === 'clingen' ? 'Calibrated tools, up to PP3 strong and BP4 strong (Pejaver et al. 2022)' : 'Supporting by default, or stronger by judgement');
  const rows = [
    ['How criteria are combined', (k) => (fw(k).combine === 'points' ? 'Points (Tavtigian et al. 2018, 2020)' : 'The rules of Table 5 (Richards et al. 2015)')],
    ['PM2 starts at', (k) => SW[defaultFor('PM2', k)]],
    ['PP3 and BP4 (missense)', pp3],
    ['SpliceAI for PP3 and BP4', spl],
    ['Retired criteria', (k) => (fw(k).retired.length ? fw(k).retired.join(' and ') : 'None, so PP5 and BP6 are still in use')],
    ['A class other than uncertain needs two or more criteria', (k) => (fw(k).minTwo ? 'Yes, apart from BA1, and BS1_Strong for a highly penetrant dominant disorder' : 'No')],
    ['PM1 and PP3 together', (k) => (k === 'clingen' ? 'At most 4 points (Pejaver et al. 2022)' : 'No cap')],
    ['How strengths are written', writeEx]
  ];
  a.appendChild(table(['', ...keys.map((k) => fw(k).label)], rows.map(([label, fn]) => [h('b', label), ...keys.map((k) => fn(k))]), []));

  a.appendChild(h('h2', FRAMEWORKS.acgs2024.label));
  a.appendChild(h('p', `NHS laboratories follow the ${FRAMEWORKS.acgs2024.long} (Durkie et al., the Association for Clinical Genomic Science). They use Tavtigian’s points and keep PM2 at moderate strength. They use PP3 and BP4 at supporting strength only, with REVEL for missense variants and SpliceAI for splicing. They need at least two criteria for any class but uncertain, so a variant with PVS1 alone stays uncertain. The exceptions are BA1, and BS1_Strong for a highly penetrant dominant disorder. They write every strength out, as _vstr, _str, _mod or _sup. And they rule out some combinations that count the same evidence twice:`));
  a.appendChild(h('ul', [
    ['PVS1 with PM4', 'because they describe the same effect on the protein'],
    ['PVS1 with PP3, PM1 or PP2', 'and PS3 alongside full-strength PVS1'],
    ['PS2 or PM6 with PP4', 'because the phenotype’s specificity is already counted in the de novo points']
  ].map(([what, why]) => h('li', h('b', what), ', ', why, '.'))));
  a.appendChild(h('p.small.muted', 'In the 2024 document the benign threshold appears as −6 points in the text but −7 in the figure. The site uses −7, as Tavtigian et al. (2020) do. ', ref('acgs2024'), '.'));

  a.appendChild(h('h2', FRAMEWORKS.clingen.label));
  a.appendChild(h('p', `ClinGen’s Sequence Variant Interpretation working group refined most of the criteria from 2018 to 2023. PVS1 now follows a decision tree and PM2 is used at supporting strength. PS2, PM6 and PM3 are scored with points, PS3 and BS3 are weighed by OddsPath, and PP3 and BP4 use calibrated predictors. The group also showed how splicing evidence fits across several criteria. In April 2025 the working group was retired, and its recommendations continue as ClinGen’s Variant Classification Guidance. ClinGen’s expert panels (VCEPs) adapt the criteria for the genes they cover. Their rules are in ClinGen’s Criteria Specification Registry (CSpec), and the Gene and disease section shows them for the variant’s gene. ClinGen writes a strength only when it isn’t the default, and then in full, as in PM2_Supporting or PVS1_Strong. With calibrated predictors, PM1 and PP3 together count at most 4 points, because a hotspot and the predictors partly measure the same thing (Pejaver et al. 2022).`));
  a.appendChild(h('p', 'A variant classified by an expert panel has a three-star ClinVar record, and its criteria are in ClinGen’s Evidence Repository. The Conclusion section of a variant’s page fetches them so that you can compare them with your own.'));

  a.appendChild(h('h2', FRAMEWORKS.acmg2015.label));
  a.appendChild(h('p', `This set uses the original rules: ${FRAMEWORKS.acmg2015.long}. Each criterion starts at its default strength, which you may change by professional judgement, and PP5 and BP6 are still in use. The rules count the criteria at each strength instead of adding up points, so they sometimes give a different class. For example, two strong criteria make a variant pathogenic by the rules but likely pathogenic by points. With the other two sets, the site still shows what the 2015 rules would give, so that you can see when they differ.`));
  a.appendChild(h('p.small.muted', 'A revised version of the ACMG/AMP standards, with a points-based framework, is in preparation. Until it’s published, laboratories use the 2015 criteria with the refinements above.'));
}

/* ====================================================================
   Combining the evidence
   ==================================================================== */
/* Richards et al. (2015) Table 5, as acmg/engine.js applies it (the class shown for each comes from the engine) */
const RULES = [
  ['Pathogenic', '1 very strong and at least 1 strong', [['VS', 1], ['S', 1]]],
  ['Pathogenic', '1 very strong and at least 2 moderate', [['VS', 1], ['M', 2]]],
  ['Pathogenic', '1 very strong, 1 moderate and 1 supporting', [['VS', 1], ['M', 1], ['P', 1]]],
  ['Pathogenic', '1 very strong and at least 2 supporting', [['VS', 1], ['P', 2]]],
  ['Pathogenic', 'at least 2 strong', [['S', 2]]],
  ['Pathogenic', '1 strong and at least 3 moderate', [['S', 1], ['M', 3]]],
  ['Pathogenic', '1 strong, 2 moderate and at least 2 supporting', [['S', 1], ['M', 2], ['P', 2]]],
  ['Pathogenic', '1 strong, 1 moderate and at least 4 supporting', [['S', 1], ['M', 1], ['P', 4]]],
  ['Likely pathogenic', '1 very strong and 1 moderate', [['VS', 1], ['M', 1]]],
  ['Likely pathogenic', '1 strong and 1 or 2 moderate', [['S', 1], ['M', 1]]],
  ['Likely pathogenic', '1 strong and at least 2 supporting', [['S', 1], ['P', 2]]],
  ['Likely pathogenic', 'at least 3 moderate', [['M', 3]]],
  ['Likely pathogenic', '2 moderate and at least 2 supporting', [['M', 2], ['P', 2]]],
  ['Likely pathogenic', '1 moderate and at least 4 supporting', [['M', 1], ['P', 4]]],
  ['Likely pathogenic (ClinGen 2020)', '1 very strong and 1 supporting, such as PVS1 with PM2_Supporting', [['VS', 1], ['P', 1]]],
  ['Benign', '1 stand-alone (BA1)', [['SA', 1]], 'B'],
  ['Benign', 'at least 2 strong', [['S', 2]], 'B'],
  ['Likely benign', '1 strong and 1 supporting', [['S', 1], ['P', 1]], 'B'],
  ['Likely benign', 'at least 2 supporting', [['P', 2]], 'B']
];
const metOf = (slots, dir = 'P') => {
  const out = [];
  let i = 0;
  for (const [s, n] of slots) for (let k = 0; k < n; k++) out.push({ code: `X${++i}`, dir, strength: s });
  return out;
};

function combining(a) {
  a.append(
    h('h1', 'Combining the evidence'),
    h('p.learn-lede', 'Once you’ve decided each criterion, the criteria that are met are combined into a class. There are two ways of doing this. The rules of the 2015 paper count the criteria at each strength, while points add them up. ClinGen and the ACGS 2024 guidelines use points, and the site shows both.'));

  // the rules
  a.appendChild(h('h2', 'The 2015 rules'));
  a.appendChild(h('p', 'These are the rules of Table 5 in Richards et al. (2015). Evidence stronger than a rule asks for can stand in for weaker evidence, so a strong criterion can fill a moderate place. If the rules for a pathogenic class and a benign class are both met, the variant is of uncertain significance, and it’s uncertain too if no rule is met.'));
  // each rule's name and class are the engine's own answer for exactly the evidence the rule describes
  a.appendChild(table(['Rule', 'Criteria met', 'Class'], RULES.map(([, text, slots, dir]) => {
    const r = richards(metOf(slots, dir || 'P'));
    return [r.rule ? r.rule.name : '', text, clsBadge(r.cls, { short: true })];
  }), [false, false, false]));
  a.appendChild(h('p.small.muted', 'ClinGen added the last pathogenic rule in 2020, when it moved PM2 to supporting strength. Benign evidence at moderate strength, which the 2015 rules don’t have, counts as two supporting criteria (Pejaver et al. 2022).'));

  // points
  a.appendChild(h('h2', 'Points'));
  const odds = (k) => fmt(Math.pow(O_PVST, k / 8), k >= 8 ? 0 : k >= 4 ? 1 : 2);
  a.appendChild(h('p', `Tavtigian et al. (2018) showed that the 2015 rules behave like a Bayesian calculation in which each step up in strength squares the odds of pathogenicity. Supporting evidence has odds of ${odds(1)}, moderate evidence ${odds(2)}, strong ${odds(4)} and very strong ${odds(8)}. Taking logarithms turns these odds into points (Tavtigian et al. 2020):`));
  a.appendChild(table(['Strength', 'Pathogenic', 'Benign'], ['VS', 'S', 'M', 'P'].map((s) => [SW[s], `+${POINTS[s]}`, s === 'VS' ? '−8 (BP4 only)' : `−${POINTS[s]}`]), [false, true, true]));
  a.appendChild(h('p', 'The points of all the criteria that are met are added up, and the total decides the class. BA1 doesn’t carry points, because it makes a variant benign on its own.'));
  const T = THRESHOLDS;
  a.appendChild(table(['Class', 'Points', 'Probability of pathogenicity'], [
    [clsBadge('p', { short: true }), `${T.p} or more`, `${pct(posterior(T.p))} or more`],
    [clsBadge('lp', { short: true }), `${T.lp} to ${T.p - 1}`, `${pct(posterior(T.lp))} to ${pct(posterior(T.p - 1))}`],
    [clsBadge('vus', { short: true }), `0 to ${T.lp - 1}`, `${pct(posterior(0))} to ${pct(posterior(T.lp - 1))}`],
    [clsBadge('lb', { short: true }), `${sgn(T.lb)} to ${sgn(T.b + 1)}`, `${pct(posterior(T.lb))} to ${pct(posterior(T.b + 1))}`],
    [clsBadge('b', { short: true }), `${sgn(T.b)} or fewer`, `${pct(posterior(T.b))} or less`]
  ], [false, true, true]));
  a.appendChild(h('p', 'The probability comes from the points through Tavtigian’s model:'));
  a.appendChild(h('div.formula', h('div', `odds of pathogenicity = ${O_PVST}^(points ÷ 8)`), h('div', `probability = odds × prior ÷ ((odds − 1) × prior + 1),  prior = ${PRIOR}`)));
  a.appendChild(h('p.small.muted', 'The prior of 0.1 is the chance, before any evidence, that a rare variant found in a patient is pathogenic, as Tavtigian et al. set it. The probabilities show how the classes relate to each other, but they aren’t measured for each variant.'));

  // the bands of a VUS
  a.appendChild(h('h2', 'The bands of uncertain significance'));
  a.appendChild(h('p', 'A variant of uncertain significance may be close to likely pathogenic or nowhere near it. The ACGS 2024 guidelines split these variants into three groups by points (0–1, 2–3 and 4–5, in their Figure 3), for use within the laboratory and not on reports. NHS England’s GeNotes names six bands from ice cold to hot, one for each whole number of points from 0 to 5, and those are the bands the site shows:'));
  const bands = h('ul.vus-bands');
  for (const b of VUS_BANDS) bands.appendChild(h('li', h('span.vusband.' + b.key, b.label), h('span', `${b.points} ${b.points === 1 ? 'point' : 'points'}`), h('span.small.muted', `probability ${pct(posterior(b.points))}`)));
  a.appendChild(bands);
  a.appendChild(h('p.small.muted', 'A hot VUS may be worth more work, such as testing relatives or a functional study. An ice-cold one is unlikely ever to become pathogenic. Negative points make a variant likely benign and six or more make it likely pathogenic, so the bands cover 0 to 5 points. A VUS outside that range has no band. This happens with a single criterion under the ACGS rule of two, or with conflicting evidence under the 2015 rules.'));

  // examples, worked by the engine
  a.appendChild(h('h2', 'Examples'));
  a.appendChild(h('p', 'The site’s own engine works out each example with each set of guidelines. PM2 takes the strength that each set starts it at.'));
  const EX = [
    { what: 'Two strong criteria', crit: { PS3: 'S', PS4: 'S' } },
    { what: 'A loss-of-function variant absent from gnomAD', crit: { PVS1: 'VS', PM2: null } },
    { what: 'PVS1 alone', crit: { PVS1: 'VS' } },
    { what: 'A missense variant with moderate and supporting evidence', crit: { PM1: 'M', PM2: null, PP3: 'P' } },
    { what: 'Evidence pointing both ways', crit: { PS4: 'S', BS1: 'S' } },
    { what: 'Too common and predicted to be harmless', crit: { BS1: 'S', BP4: 'P' } }
  ];
  const exNotes = [];
  const rowsEx = EX.map((ex) => {
    const cells = [h('span', ex.what)];
    for (const k of FRAMEWORK_LIST) {
      const state = { criteria: {} };
      for (const [code, s] of Object.entries(ex.crit)) state.criteria[code] = { met: true, strength: s || defaultFor(code, k) };
      const r = classify(state, { framework: k });
      for (const n of r.notes || []) if (!exNotes.includes(n)) exNotes.push(n);
      const how = r.method === 'points' ? `${r.points > 0 ? '+' : ''}${sgn(r.points)} points`
        : r.byRules.cls === 'vus' ? (r.byRules.conflict ? 'both sides met' : 'no rule met') : r.byRules.rule ? r.byRules.rule.name : '';
      cells.push(h('div.ex-cell', h('span.hgvs.small', criteriaString(r.met, k)), h('span', clsBadge(r.cls, { short: true }), ' ', h('span.small.muted', how))));
    }
    return cells;
  });
  a.appendChild(table(['', ...FRAMEWORK_LIST.map((k) => fw(k).label)], rowsEx, []));
  for (const n of exNotes) a.appendChild(h('p.small.muted', n));

  // try it
  a.appendChild(h('h2', 'Try it'));
  a.appendChild(tryIt());
}

/** a small calculator: choose criteria, and see the scale and each set of guidelines' class */
function tryIt() {
  const box = h('div.try-it');
  const CHOICES = ['PVS1', 'PS2', 'PS3', 'PS4', 'PM1', 'PM2', 'PM3', 'PP1', 'PP3', 'PP4', 'BA1', 'BS1', 'BS2', 'BS3', 'BP4', 'BP7'];
  const on = new Set(['PVS1', 'PM2']);
  const F = settings.get('framework');
  const sc = scale({ bands: settings.get('vusBands') !== false });
  const out = h('div.try-out', { 'aria-live': 'polite' });
  const picks = h('div.try-picks', { role: 'group', 'aria-label': 'Criteria met' });
  for (const code of CHOICES) {
    const b = h('input', { type: 'checkbox', value: code });
    b.checked = on.has(code);
    b.addEventListener('change', () => {
      if (b.checked) on.add(code);
      else on.delete(code);
      draw();
    });
    picks.appendChild(h('label.check.try-pick', { title: BY_CODE[code].name }, b, h('span.crit.' + strengthKind(code, defaultFor(code, F)), labelFor(code, defaultFor(code, F), F))));
  }
  const draw = () => {
    const res = {};
    for (const k of FRAMEWORK_LIST) {
      const state = { criteria: {} };
      for (const code of on) state.criteria[code] = { met: true, strength: defaultFor(code, k) };
      res[k] = classify(state, { framework: k, vusBands: settings.get('vusBands') !== false });
    }
    sc.set(res[F]);
    out.innerHTML = '';
    out.appendChild(table(['Guidelines', 'Criteria', 'Points', 'Class'], FRAMEWORK_LIST.map((k) => {
      const r = res[k];
      return [k === F ? h('b', fw(k).label, h('span.small.muted', ' (yours)')) : fw(k).label, h('span.hgvs.small', criteriaString(r.met, k) || 'none'), `${r.points > 0 ? '+' : ''}${sgn(r.points)}`, h('span', clsBadge(r.cls, { short: true, band: r.band }), r.method === 'rules' ? h('span.small.muted', ' by the rules') : null)];
    }), [false, false, true, false]));
    const notes = [...new Set(FRAMEWORK_LIST.flatMap((k) => res[k].notes || []))];
    for (const n of notes) out.appendChild(h('p.small.muted', n));
  };
  box.append(h('p', 'Tick the criteria that are met, and each will be used at its default strength. The scale follows the guidelines you’ve chosen in ', go('/settings', 'Settings'), ', and the table shows all three.'), picks, sc, out);
  draw();
  return box;
}

/* ====================================================================
   Copy-number variants
   ==================================================================== */
function cnv(a) {
  a.append(
    h('h1', 'Copy-number variants'),
    h('p.learn-lede', 'Gains and losses of DNA, from a few exons to many megabases, are classified with their own points system, set out in the technical standards of the ACMG and ClinGen (Riggs et al. 2020). Each piece of evidence earns points, positive or negative, and the total gives the class.'));
  const t = CNV_THRESHOLDS;
  a.appendChild(table(['Class', 'Total points'], [
    [clsBadge('p', { short: true }), `${fmtPts(t.p)} or more`],
    [clsBadge('lp', { short: true }), `${fmtPts(t.lp)} to ${fmtPts(t.p - 1)}`],
    [clsBadge('vus', { short: true }), `${fmtPts(t.lb + 1)} to ${fmtPts(t.lp - 1)}`],
    [clsBadge('lb', { short: true }), `${fmtPts(t.lb)} to ${fmtPts(t.b + 1)}`],
    [clsBadge('b', { short: true }), `${fmtPts(t.b)} or fewer`]
  ], [false, true]));
  a.appendChild(h('p', 'Losses and gains each have their own rubric, in five sections. The sections cover what the region contains, whether it overlaps genes or regions known to be dosage sensitive or known to be benign, how many genes it holds, what has been reported in other patients and in controls, and the patient’s own inheritance and family history.'));
  a.appendChild(site('On a CNV’s page the site scores each item with you and adds up the points as you go. It also suggests what the data support, from ClinGen’s dosage curations, the genes in the region and their predicted dosage sensitivity, and overlapping CNVs in ClinVar and in the population.'));

  // dosage sensitivity
  a.appendChild(h('h2', 'Dosage sensitivity'));
  a.appendChild(h('p', 'ClinGen curates whether losing a copy of a gene or region causes disease (haploinsufficiency, HI) and whether gaining one does (triplosensitivity, TS). These are its scores:'));
  a.appendChild(table(['Score', 'Meaning'], Object.entries(DOSAGE).map(([k, v]) => [h('b', k), v.text]), [true, false]));
  a.appendChild(h('p', `If a gene hasn’t been curated, predictions can help, and section 2H of the loss rubric asks for two or more of them. These are a pHaplo of ${THRESH.pHaplo} or more and a pTriplo of ${THRESH.pTriplo} or more (Collins et al. 2022), a LOEUF below ${THRESH.loeuf} in gnomAD v4, and a pLI of ${THRESH.pLI} or more. At the Collins et al. thresholds, the predicted genes are as likely to be dosage sensitive as ClinGen’s curated ones.`));

  // the rubric
  a.appendChild(h('h2', 'The points, item by item'));
  const holder = h('div');
  const draw = (type) => {
    holder.innerHTML = '';
    for (const s of RUBRIC[type]) {
      holder.appendChild(h('h3', `Section ${s.key}: ${s.title}`));
      if (s.note) holder.appendChild(h('p.small.muted', s.note));
      holder.appendChild(table(['Item', 'Evidence', 'Points'], s.items.map((it) => [h('b.mono', it.code), itemText(it), itemPoints(it)]), [false, false, false]));
    }
  };
  a.appendChild(h('div.row', { style: { margin: '6px 0 4px' } }, h('span.small.muted', 'Show the rubric for'), seg([['loss', 'Losses'], ['gain', 'Gains']], 'loss', draw, 'Rubric')));
  a.appendChild(holder);
  draw('loss');

  a.appendChild(h('h2', 'Corrections and differences'));
  a.appendChild(h('ul', [
    h('li', 'A correction to the standards in 2021 changed the default for losses in item 5H from 0.30 to 0.15 points. Item 5H covers a highly specific phenotype consistent with the reported cases when the inheritance isn’t known. The site uses 0.15.'),
    h('li', 'ClinGen’s online CNV calculator gives −0.90 for item 2F of the gain rubric, which covers a gain larger than an established benign gain with no further protein-coding genes. The paper gives −1.00, and that’s what the site uses.'),
    h('li', 'Items 4A to 4C together give at most 0.90 points. Items in the same group are alternatives, so only one of them is scored. That applies to the two forms of 2C, and to 5A to 5H.')
  ]));
  a.appendChild(h('p.small', ref('riggs2020'), '. ', h('a', { href: 'https://doi.org/10.1038/s41436-021-01150-9', target: '_blank', rel: 'noopener' }, 'Riggs ER et al. (2021) Correction. Genet Med 23:2230'), '.'));
}
function itemText(it) {
  const parts = [h('span', it.text)];
  if (it.options) parts.push(h('ul.rub-opts', it.options.map((o) => h('li', o.label, ': ', h('b', fmtPts(o.pts)), o.min != null && o.max != null && o.min !== o.max ? h('span.muted', ` (${fmtPts(o.min)} to ${fmtPts(o.max)})`) : null))));
  if (it.note) parts.push(h('div.small.muted', it.note));
  if (it.cap) parts.push(h('div.small.muted', `4A, 4B and 4C together give at most ${fmtPts(it.cap.max)}.`));
  return h('div', parts);
}
function itemPoints(it) {
  const line = (...x) => h('div', ...x);
  const range = (a, b) => (a != null && b != null && a !== b ? line(h('span.small.muted', `${fmtPts(a)} to ${fmtPts(b)}`)) : null);
  if (it.options) return h('span.muted', 'depends on the option');
  if (it.kind === 'case') {
    const each = it.unit ? ` per ${it.unit}` : ' each';
    const out = [];
    if (it.perConfirmed != null) out.push(line(h('b', fmtPts(it.perConfirmed)), each, ' if confirmed'), line(h('b', fmtPts(it.perAssumed)), ' if assumed'));
    else out.push(line(h('b', fmtPts(it.per)), each));
    if (it.perMin != null && it.perMax != null && it.perMin !== it.perMax) out.push(line(h('span.small.muted', `${fmtPts(it.perMin)} to ${fmtPts(it.perMax)} each`)));
    if (it.max != null) out.push(line(h('span.small.muted', it.max < 0 ? `down to ${fmtPts(it.max)} in total` : `at most ${fmtPts(it.max)} in total`)));
    return h('div.rub-pts', out);
  }
  return h('div.rub-pts', line(h('b', fmtPts(it.pts))), range(it.min, it.max));
}

/* ====================================================================
   Using this site
   ==================================================================== */
function usingSite(a) {
  a.append(
    h('h1', 'Using this site'),
    h('p.learn-lede', 'Everything you enter stays in this browser, on this computer. The site asks public databases about variants and genes, but never sends them anything about the patient.'));
  const S = [
    ['patient', 'Patients', [
      ['Make a patient with ', go('/patient/new', 'New patient'), '. Give them a reference of your own (not a real name), and record their sex, age, the stage of life when the condition began, and their ancestry, so that frequencies can be compared with their gnomAD group. Also record whether the parents are related, the reason for testing and the test done, with its gene panel from Genomics England PanelApp if it had one.'],
      ['Or open a case from ', go('/data', 'Cases and data'), '. Each case is a fictional patient with their phenotype, family and variants, ready for you to interpret.']]],
    ['phenotype', 'Phenotypes', [
      ['Search the Human Phenotype Ontology by name, synonym or ID, or paste a clinical note and pick the terms the site finds in it. Mark each term as observed or excluded. The diseases that best fit the patient’s terms are listed beside them, with their genes. Each variant’s Gene and disease section also compares the patient with the gene’s diseases, to help you judge PP4.'],
      [go('/match', 'Phenotype match'), ' ranks diseases and genes against any set of terms, shows which features matched which, and finds the patients in this browser with similar features.']]],
    ['pedigree', 'Family and pedigree', [
      ['Draw the family in Pedigree Studio, the Hearn lab’s pedigree editor, or start by answering a few questions about parents, siblings and children. Shade the affected people and name the condition in the drawing’s key. Then give each relative’s genotype for each variant, because the Patient and family section of the variant’s page uses them for co-segregation.']]],
    ['dna', 'Variants', [
      ['You can add a sequence variant as HGVS on a transcript (NM_000546.6:c.818G>A), as a genomic position (17-7673802-C-T, on GRCh38 or GRCh37), as an rsID or as a protein change. For a protein change, the site lists the DNA changes that could cause it. You can also read a VCF file and choose its variants. The search box at the top takes all of these too, and you can press / to jump to it.'],
      ['Add a copy-number variant as a region with its type (del 22:18900000-21500000, or chr7:72700000-74100000 gain) or in ISCN (arr[GRCh38] 22q11.21(18912231_21465672)x1).']]],
    ['microscope', 'A variant’s page', [
      ['The evidence runs down the middle of the page, section by section. The classification panel is on the right, or above on a narrow screen, and holds the evidence scale, the class so far and every criterion. The same criteria also appear beside their evidence in each section, and marking one in either place marks it in both. Your work is saved as you go.'],
      ['To use another transcript, choose Transcript at the top. You can open the variant in the genome browser from the menu beside it.']]],
    ['badgeCheck', 'Signing', [
      ['When you choose Sign the classification, the site records it with your name, the date, the criteria and a summary of the evidence. The class is calculated for you, but you may choose another if you give a reason, as ClinGen’s curation interface allows. Each signing is kept in the variant’s history, and the latest one goes on the report.']]],
    ['chromosome', 'Copy-number variants', [
      ['A CNV’s page lists the genes and ClinGen dosage-sensitive regions it overlaps, CNVs in ClinVar and in the population that overlap it, and the points of Riggs et al. (2020), item by item.']]],
    ['genome', 'The genome browser', [
      ['The genome browser is igv.js, with tracks for genes, ClinVar, ClinGen’s dosage curations and DGV’s population CNVs. On a patient’s Genome browser tab it also shows their own variants, coloured by class. From the top bar you can open any region on either build.']]],
    ['report', 'The report', [
      ['The report is laid out like a laboratory’s report. It starts with the result and what it means, then gives each variant’s classification with its evidence, criterion by criterion. After that come the phenotype and family it was weighed against, the methods and limitations, and who classified it. You write the summary and recommendations in your own words. A variant that isn’t signed yet is reported with its class so far, and the report says so. You can print it, or save it as a PDF from the browser.']]],
    ['database', 'Keeping your work', [
      ['The site keeps everything in this browser’s storage for its address. Shared and university computers often clear that storage when you log out, so download your work at the end of each session with Download all patients on ', go('/data', 'Cases and data'), '. The file opens again here or on any other computer, and it’s how you hand work in. You can also remove everything from the same page.']]],
    ['import', 'Cases from your tutor', [
      ['To open a tutor’s case file, go to Cases and data and use Choose a file. Its patients are added beside yours, and nothing is replaced. Some cases carry the answer, and once you’ve signed your own classification, the Conclusion section lets you compare the two.']]]
  ];
  for (const [ic, title, paras] of S) {
    a.appendChild(h('h2.with-ic', h('span.st-ic', { html: icon(ic) }), title));
    for (const p of paras) a.appendChild(h('p', ...p));
  }
}

/* ====================================================================
   Glossary
   ==================================================================== */
const GLOSSARY = [
  ['ACGS', 'The Association for Clinical Genomic Science, the UK’s professional body for clinical genomics, whose Best Practice Guidelines for Variant Classification (2024) NHS laboratories follow.'],
  ['ACMG/AMP criteria', 'The 28 criteria for classifying sequence variants published in 2015 by the American College of Medical Genetics and Genomics and the Association for Molecular Pathology (Richards et al.).'],
  ['Allele frequency', 'The share of all copies of a position in a population that carry the variant, worked out as allele count ÷ allele number. A heterozygous person carries one copy and a homozygous person two.'],
  ['AlphaMissense', 'A predictor of the effect of missense variants from Google DeepMind (2023), calibrated for PP3 and BP4 by Bergquist et al. (2025).'],
  ['BayesDel', 'A meta-predictor that combines several tools. The version without allele frequency is used, so that frequency isn’t counted twice.'],
  ['CADD', 'Combined Annotation Dependent Depletion, a score for any variant based on how strongly natural selection has removed variants like it. It’s given as a phred-like score, where 20 means the top 1%.'],
  ['ClinGen', 'The Clinical Genome Resource, funded by the US National Human Genome Research Institute. It curates gene–disease validity and dosage sensitivity, and its expert panels classify variants and adapt the ACMG/AMP criteria for their genes.'],
  ['ClinVar', 'NCBI’s public archive of variant classifications submitted by laboratories and expert panels, with a review status of zero to four stars.'],
  ['Co-segregation', 'Whether a variant travels with a disease through a family, so that affected relatives carry it and unaffected ones don’t (if penetrance is high). PP1 counts it in favour of pathogenicity, and BS4 counts its absence against.'],
  ['Copy-number variant (CNV)', 'A loss (deletion) or gain (duplication) of a stretch of DNA, usually over 1,000 bases, changing the number of copies of what it contains.'],
  ['De novo', 'Present in the patient but in neither parent, so a new mutation. It’s confirmed when maternity and paternity have been confirmed (PS2), and assumed when they haven’t (PM6).'],
  ['Dosage sensitivity', 'Whether a change in the number of copies of a gene causes disease. Haploinsufficiency is when one copy isn’t enough, and triplosensitivity is when three copies are too many.'],
  ['Expert panel (VCEP)', 'A ClinGen Variant Curation Expert Panel, made up of specialists in a gene or disease who write rules for applying the criteria to it and classify its variants. Their classifications have three stars in ClinVar.'],
  ['Filtering allele frequency (FAF)', 'The highest true frequency in a population that the observed allele count is still consistent with, at 95% confidence. gnomAD gives it for each genetic ancestry group. The grpmax FAF is the highest among the large continental groups, and it’s the one compared with the thresholds for BA1 and BS1.'],
  ['gnomAD', 'The Genome Aggregation Database, with allele frequencies from about 800,000 people in version 4. They were sequenced for studies of other conditions, so they aren’t free of disease, but they weren’t chosen for it either.'],
  ['grpmax', 'gnomAD’s genetic ancestry group with the highest frequency for a variant, among the groups not shaped by population bottlenecks. It leaves out the Amish, Ashkenazi Jewish, Finnish and unassigned groups.'],
  ['Hemizygous', 'Having only one copy of a region, so that a variant allele has no partner. This is the case for most of the X chromosome in males.'],
  ['Heterozygous, homozygous', 'Carrying the variant on one of the two copies (heterozygous) or on both (homozygous).'],
  ['HGVS', 'The Human Genome Variation Society’s nomenclature for describing variants on a named reference sequence, with c. for coding DNA, p. for protein and g. for genomic, as in NM_000546.6:c.818G>A or p.(Arg273His).'],
  ['HPO', 'The Human Phenotype Ontology, a structured vocabulary of human phenotypic abnormalities such as HP:0001250 Seizure. It’s used to record patients’ features and to compare them with diseases.'],
  ['In cis, in trans', 'Two variants on the same copy of a chromosome (in cis) or on different copies (in trans). For a recessive disorder, a pathogenic variant in trans supports PM3. Testing the parents usually shows the phase.'],
  ['Informative meiosis', 'A transmission in a family that could show whether a variant and a disease travel together. Each one makes coincidence half as likely, and the number of them sets the strength of PP1 (Jarvik and Browning 2016).'],
  ['Likelihood ratio', 'How much more likely the observations are under one explanation than another. For co-segregation, it compares the variant causing the disease with it not causing the disease.'],
  ['LOEUF', 'gnomAD’s loss-of-function observed/expected upper bound fraction. It’s the upper end of the confidence interval for how many loss-of-function variants a gene has, compared with how many it would be expected to have. Low values (below 0.6 in gnomAD v4) mean the gene doesn’t tolerate loss of function.'],
  ['MANE Select', 'Matched Annotation from NCBI and EMBL-EBI, which picks one transcript for each protein-coding gene. The transcript is identical in RefSeq (NM_) and Ensembl (ENST), and is agreed for reporting variants.'],
  ['Missense', 'A single-nucleotide change that swaps one amino acid for another.'],
  ['Mosaicism', 'The presence of the variant in only some of a person’s cells, from a mutation after conception. It can lower the allele fraction in sequencing reads.'],
  ['Nonsense-mediated decay (NMD)', 'The cell’s destruction of transcripts with a premature stop codon. A stop more than 50 to 55 bases before the last exon–exon junction usually triggers it. A stop in the last exon escapes it, which matters for PVS1.'],
  ['OddsPath', 'The odds of pathogenicity that a functional assay gives, worked out from how well it sorted known pathogenic and benign controls (Brnich et al. 2019). It sets the strength of PS3 or BS3.'],
  ['Penetrance', 'The chance that a person with a pathogenic genotype shows the disease. Incomplete penetrance weakens arguments from healthy carriers (BS2) and from families.'],
  ['Phenocopy', 'A person who has the disease, or one like it, for a reason other than the family’s variant. Phenocopies weaken arguments from co-segregation.'],
  ['pHaplo, pTriplo', 'Predicted probabilities that a gene is haploinsufficient or triplosensitive, from patterns of CNVs in nearly a million people (Collins et al. 2022).'],
  ['pLI', 'gnomAD’s probability that a gene is intolerant of loss of function. A pLI of 0.9 or more is usually taken to mean the gene is intolerant. LOEUF has largely replaced it.'],
  ['Points', 'The Bayesian scoring of the criteria (Tavtigian et al. 2018, 2020). Supporting evidence scores 1, moderate 2, strong 4 and very strong 8, with negative points for benign evidence. The total gives the class.'],
  ['Proband', 'The person through whom a family came to attention, usually the patient tested first.'],
  ['REVEL', 'A meta-predictor for missense variants that combines 13 tools (Ioannidis et al. 2016). It’s the predictor the ACGS 2024 guidelines use for PP3 and BP4.'],
  ['Segregation', 'See co-segregation.'],
  ['SpliceAI', 'A deep-learning tool (Jaganathan et al. 2019) that predicts how a variant changes the chance that nearby bases are used as splice acceptors or donors, as four scores from 0 to 1.'],
  ['Splice site, canonical', 'The two bases at each end of an intron (GT at the 5′ end, AG at the 3′ end). These are the ±1 and ±2 positions, which PVS1 covers.'],
  ['VUS', 'A variant of uncertain significance, meaning there isn’t enough evidence to call it pathogenic or benign. It shouldn’t be used to make clinical decisions.'],
  ['VUS bands', 'A grading of a VUS by its points, from ice cold (0) to hot (5), as NHS England’s GeNotes names them. It shows how near the variant is to likely pathogenic. The ACGS divides the same points into three groups.'],
  ['Zygosity', 'How many copies of the variant a person has: heterozygous, homozygous or hemizygous (or mosaic).']
];
function glossary(a) {
  a.append(h('h1', 'Glossary'), h('p.learn-lede', 'Short explanations of the words and numbers used in variant interpretation. The criteria have their own pages, which you’ll find under ', go('/learn/criteria', 'the 28 criteria'), '.'));
  const letters = [...new Set(GLOSSARY.map(([t]) => t[0].toUpperCase()))].sort();
  const jump = h('nav.gl-jump', { 'aria-label': 'Letters' }, letters.map((L) => h('button', { type: 'button', onclick: () => document.getElementById('gl-' + L).scrollIntoView({ behavior: smooth(), block: 'start' }) }, L)));
  a.appendChild(jump);
  const dl = h('dl.learn-dl.gloss');
  let last = '';
  for (const [term, text] of GLOSSARY.slice().sort((x, y) => x[0].localeCompare(y[0], 'en'))) {
    const L = term[0].toUpperCase();
    dl.append(h('dt', { id: L !== last ? 'gl-' + L : null }, term), h('dd', text));
    last = L;
  }
  a.appendChild(dl);
}

/* ====================================================================
   References
   ==================================================================== */
const MORE_REFS = [
  { text: 'Bergquist T et al. (2025) Calibration of additional computational tools expands ClinGen recommendation options for variant classification with PP3/BP4 criteria. Genet Med 27:101402', url: 'https://doi.org/10.1016/j.gim.2025.101402' },
  { text: 'Collins RL et al. (2022) A cross-disorder dosage sensitivity map of the human genome. Cell 185:3041 (pHaplo and pTriplo)', url: 'https://zenodo.org/records/6347673' },
  { text: 'Gargano MA et al. (2024) The Human Phenotype Ontology in 2024: phenotypes around the world. Nucleic Acids Res 52:D1333–D1346', url: 'https://doi.org/10.1093/nar/gkad1005' },
  { text: 'Riggs ER et al. (2021) Correction: Technical standards for the interpretation and reporting of constitutional copy-number variants. Genet Med 23:2230', url: 'https://doi.org/10.1038/s41436-021-01150-9' },
  { text: 'Thompson D, Easton DF and Goldgar DE (2003) A full-likelihood method for the evaluation of causality of sequence variants from family data. Am J Hum Genet 73:652–655', url: 'https://pmc.ncbi.nlm.nih.gov/articles/PMC1180690/' }
];
function references(a) {
  a.append(h('h1', 'References'), h('p.learn-lede', 'The guidelines and papers that the site’s rules, calculators and this guide follow.'));
  const all = Object.values(REFS).concat(MORE_REFS);
  // ClinGen's own recommendations after the papers
  const papers = all.filter((r) => !/^ClinGen/.test(r.text)).sort((x, y) => x.text.localeCompare(y.text, 'en'));
  const clingen = all.filter((r) => /^ClinGen/.test(r.text));
  a.appendChild(h('h2', 'Papers and guidelines'));
  a.appendChild(h('ul.learn-refs', papers.map((r) => h('li', h('a', { href: r.url, target: '_blank', rel: 'noopener' }, r.text)))));
  a.appendChild(h('h2', 'ClinGen’s recommendations'));
  a.appendChild(h('p', 'These were written by ClinGen’s Sequence Variant Interpretation working group, which was retired in April 2025. Its recommendations continue as ClinGen’s Variant Classification Guidance.'));
  a.appendChild(h('ul.learn-refs', clingen.map((r) => h('li', h('a', { href: r.url, target: '_blank', rel: 'noopener' }, r.text)))));
  a.appendChild(h('h2', 'Data'));
  a.appendChild(h('p', 'The databases the site reads, with their versions and licences, are listed on ', go('/about/sources', 'Sources and licences'), '.'));
}

export const TOPIC_PAGES = {
  workflow,
  frameworks,
  combining,
  cnv,
  site: usingSite,
  glossary,
  references
};
export { BY_CODE };
