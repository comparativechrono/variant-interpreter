/* =====================================================================
   The guide's pages on the criteria: the chart of all 28 (as Figure 1 of
   Richards et al. 2015 lays them out), the index, and a page for each
   criterion, made from acmg/criteria.js and the modules that hold its
   numbers (frameworks, thresholds, calculators, the PVS1 tree,
   co-segregation), so that the guide and the site agree.
   ===================================================================== */
import { h, icon, fmtAF } from '../core.js';
import { link } from '../router.js';
import { CRITERIA, BY_CODE, GROUPS, REFS, BA1_EXCEPTIONS } from '../acmg/criteria.js';
import { FRAMEWORKS, FRAMEWORK_LIST, fw, defaultFor, strengthsFor, labelFor, baseDefault } from '../acmg/frameworks.js';
import { PREDICTORS, SPLICEAI, PHYLOP_BP7 } from '../acmg/thresholds.js';
import { DENOVO_PHENO, PM3_ROWS, strengthOfPoints, strengthOfOdds, maxCredibleAF } from '../acmg/calculators.js';
import { TREE, RESULT_TEXT } from '../acmg/pvs1.js';
import { MEIOSES, BAYES_ODDS } from '../acmg/segregation.js';
import { POINTS, classify } from '../acmg/engine.js';
import { strengthKind } from '../ui.js';

/* scroll smoothly, unless the reader has asked for less motion */
const smooth = () => { try { return window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth'; } catch (e) { return 'auto'; } };

export const SW = { VS: 'Very strong', S: 'Strong', M: 'Moderate', P: 'Supporting', SA: 'Stand-alone' };
const ORDER = ['SA', 'VS', 'S', 'M', 'P'];

/* the evidence sections of a variant's page, and what each holds */
export const SECTIONS = {
  population: ['Population', 'gnomAD v4.1’s allele counts and frequencies (exomes, genomes and both together), by genetic ancestry group, with the grpmax filtering allele frequency that BA1 and BS1 are judged by, and a calculator for the highest frequency a pathogenic variant could credibly have.'],
  type: ['Variant type and PVS1', 'the consequence on the chosen transcript, the exon or intron, whether nonsense-mediated decay is expected, and the PVS1 decision tree, one question at a time.'],
  predictions: ['Predictions', 'REVEL, BayesDel, AlphaMissense, CADD, PrimateAI and phyloP, each drawn against its calibrated thresholds for PP3 and BP4.'],
  splicing: ['Splicing', 'SpliceAI’s four scores (acceptor and donor, gained and lost), with where each change would be.'],
  protein: ['Protein', 'the protein’s domains with ClinVar’s variants along it, pathogenic above the line and benign below, counts of each near the variant’s residue, and AlphaFold’s model in 3D.'],
  clinvar: ['ClinVar and literature', 'the variant’s ClinVar record, the other variants at the same residue and position (for PS1 and PM5), papers that cite it, and links to other databases.'],
  gene: ['Gene and disease', 'the gene’s constraint, ClinGen’s dosage sensitivity and gene–disease validity, Gene2Phenotype, any ClinGen expert panel’s rules for the gene, PanelApp, and the gene’s diseases set against the patient’s phenotype.'],
  family: ['Patient and family', 'the patient’s zygosity and how they got the variant, ClinGen’s de novo and in-trans points calculators, and co-segregation in the patient’s pedigree.'],
  functional: ['Functional data', 'the OddsPath calculator, which weighs an assay by how well it sorted its pathogenic and benign controls.']
};

/* criteria that are read together */
const RELATED = {
  PVS1: ['PM4', 'PP3', 'PM2'], PS1: ['PM5', 'PP3'], PS2: ['PM6', 'PP4'], PS3: ['BS3', 'PVS1'], PS4: ['PM3', 'PP4'],
  PM1: ['PP3', 'PM5', 'PP2'], PM2: ['BS1', 'BA1'], PM3: ['PS4', 'BP2'], PM4: ['PVS1', 'BP3'], PM5: ['PS1', 'PM1'], PM6: ['PS2'],
  PP1: ['BS4'], PP2: ['BP1', 'PM1'], PP3: ['BP4', 'PVS1', 'PM1'], PP4: ['PS2', 'PS4'], PP5: ['BP6'],
  BA1: ['BS1', 'PM2'], BS1: ['BA1', 'PM2'], BS2: ['BS1'], BS3: ['PS3'], BS4: ['PP1'], BP1: ['PP2'], BP2: ['PM3'],
  BP3: ['PM4'], BP4: ['PP3', 'BP7'], BP5: [], BP6: ['PP5'], BP7: ['BP4']
};

/** a criterion's code as a link to its page, coloured by its strength */
export function critLink(code, strength, opts = {}) {
  const c = BY_CODE[code];
  const s = strength || baseDefault(code);
  return h('a.crit.' + strengthKind(code, s) + (c && c.deprecated ? '.retired' : ''), {
    href: link('/learn/' + code), title: c ? `${code}: ${c.name}` : code, 'aria-label': c ? `${opts.label || code}: ${c.name}` : code
  }, opts.label || code);
}

/* ---------------- the chart ---------------- */
const COLS = [
  { side: 'B', s: 'SA', label: 'Stand-alone' },
  { side: 'B', s: 'S', label: 'Strong' },
  { side: 'B', s: 'P', label: 'Supporting' },
  { side: 'P', s: 'P', label: 'Supporting' },
  { side: 'P', s: 'M', label: 'Moderate' },
  { side: 'P', s: 'S', label: 'Strong' },
  { side: 'P', s: 'VS', label: 'Very strong' }
];
/** the 28 criteria by kind of evidence and default strength */
export function evidenceChart() {
  const t = h('table.ev-chart');
  t.appendChild(h('caption.visually-hidden', 'The 28 ACMG/AMP criteria by the kind of evidence and their default strength: benign on the left, pathogenic on the right'));
  t.appendChild(h('thead',
    h('tr', h('td'), h('th.side-b', { scope: 'colgroup', colspan: 3 }, 'Benign'), h('th.side-p', { scope: 'colgroup', colspan: 4 }, 'Pathogenic')),
    h('tr', h('th', { scope: 'col' }, h('span.visually-hidden', 'Kind of evidence')), COLS.map((c) => h('th', { scope: 'col', class: `col-${c.side}${c.s}` }, c.label)))));
  const body = h('tbody');
  for (const g of GROUPS) {
    const tr = h('tr', h('th', { scope: 'row' }, g.label));
    for (const col of COLS) {
      const cs = CRITERIA.filter((c) => c.group === g.key && c.dir === col.side && baseDefault(c.code) === col.s);
      tr.appendChild(h('td', { class: `col-${col.side}${col.s}` }, cs.length ? h('div.ev-cell', cs.map((c) => critLink(c.code))) : null));
    }
    body.appendChild(tr);
  }
  t.appendChild(body);
  return h('div.ev-scroll', { role: 'region', 'aria-label': 'Chart of the criteria', tabindex: '0' }, t);
}

/* ---------------- the index ---------------- */
export function criteriaIndex(article) {
  const nP = CRITERIA.filter((c) => c.dir === 'P').length;
  const nB = CRITERIA.filter((c) => c.dir === 'B').length;
  article.append(
    h('h1', 'The 28 criteria'),
    h('p.learn-lede', `Richards et al. (2015) set out ${CRITERIA.length} criteria for weighing the evidence about a sequence variant: ${nP} for pathogenicity and ${nB} for a benign impact. Each is a kind of evidence with a strength.`),
    h('p', 'Pathogenic evidence is very strong (only PVS1), strong (PS), moderate (PM) or supporting (PP). Benign evidence is stand-alone (only BA1), strong (BS) or supporting (BP). The letters give a criterion’s strength by default; since 2015 ClinGen has shown how many of them can be used at other strengths when the evidence is stronger or weaker than usual, and the code is then written with the strength used: PM2_Supporting, or, as the ACGS 2024 guidelines write it, PM2_sup.'),
    evidenceChart(),
    h('p.small.muted', 'Struck through: PP5 and BP6, which ClinGen and the ACGS no longer use.'));
  for (const [dir, title] of [['P', 'Pathogenic criteria'], ['B', 'Benign criteria']]) {
    article.appendChild(h('h2', title));
    const dl = h('dl.crit-index');
    for (const c of CRITERIA.filter((x) => x.dir === dir)) {
      dl.append(h('dt', critLink(c.code), h('a', { href: link('/learn/' + c.code) }, c.name), c.deprecated ? h('span.tag', 'Retired') : null), h('dd', c.short));
    }
    article.appendChild(dl);
  }
}

/* ---------------- one criterion ---------------- */
export function criterionPage(article, code) {
  const c = BY_CODE[code];
  const def = baseDefault(code);
  const sec = SECTIONS[c.section];
  const group = GROUPS.find((g) => g.key === c.group);
  article.append(
    h('div.crit-head', critLink(code, def, { label: code }), h('h1', c.name)),
    h('p.learn-lede', c.short),
    h('dl.facts',
      h('div', h('dt', 'Evidence for'), h('dd', c.dir === 'P' ? 'Pathogenicity' : 'A benign impact')),
      h('div', h('dt', 'Strength by default'), h('dd', SW[def])),
      h('div', h('dt', 'Kind of evidence'), h('dd', group ? group.label : '')),
      sec ? h('div', h('dt', 'On a variant’s page'), h('dd', sec[0])) : null));
  if (c.deprecated) {
    article.appendChild(h('div.note.warn', h('p', `${code} is retired: ClinGen’s Sequence Variant Interpretation group advised against it in 2018 (Biesecker and Harrison), and the ACGS 2024 guidelines leave it out. The site hides it unless “Show retired criteria” is on in Settings, and offers it only with the 2015 rules.`)));
  }

  // the strengths each set of guidelines allows
  article.appendChild(h('h2', 'Its strengths in each set of guidelines'));
  article.appendChild(strengthMatrix(c));
  const notes = [];
  if (fw('acgs2024').defaults[code] && fw('acgs2024').defaults[code] !== defaultFor(code, 'clingen')) notes.push(`${code} starts at ${SW[defaultFor(code, 'acgs2024')].toLowerCase()} with the ACGS 2024 guidelines and at ${SW[defaultFor(code, 'clingen')].toLowerCase()} with ClinGen’s.`);
  if (fw('acgs2024').allowed[code]) notes.push(`The ACGS 2024 guidelines allow ${code} only at ${fw('acgs2024').allowed[code].map((s) => SW[s].toLowerCase()).join(', ').replace(/, ([^,]*)$/, ' or $1')}.`);
  notes.push('The ACGS writes the strength on every criterion (_vstr, _str, _mod, _sup); ClinGen only when it is not the default. With the 2015 rules a strength may be changed by judgement, and the site offers the same strengths as ClinGen’s guidance.');
  article.appendChild(h('p.small.muted', notes.join(' ')));

  // how to use it
  article.appendChild(h('h2', 'How to use it'));
  article.appendChild(h('ul', c.guide.map((g) => h('li', g))));

  // the numbers behind some criteria
  const extra = EXTRAS[code];
  if (extra) extra(article);

  // where the evidence is
  if (sec) {
    article.appendChild(h('h2', 'Where to find the evidence'));
    article.appendChild(h('div.learn-site', h('span.ls-ic', { html: icon('microscope') }), h('p', 'On a variant’s page, the ', h('b', sec[0]), ` section: ${sec[1]} Mark ${code} there, beside its evidence, or in the classification panel; both are the same criterion.`)));
  }
  const rel = (RELATED[code] || []).filter((x) => BY_CODE[x]);
  if (rel.length) article.appendChild(h('p', 'Read it with ', rel.map((x, i) => [i ? (i === rel.length - 1 ? ' and ' : ', ') : '', critLink(x), ' ', h('span.small.muted', BY_CODE[x].name.toLowerCase())]), '.'));

  // sources
  const refs = (c.refs || []).map((r) => REFS[r]).filter(Boolean);
  if (refs.length) {
    article.appendChild(h('h2', 'Sources'));
    article.appendChild(h('ul.learn-refs', refs.map((r) => h('li', h('a', { href: r.url, target: '_blank', rel: 'noopener' }, r.text)))));
  }
}

/** frameworks × strengths: the label of each strength a framework allows, the default marked */
function strengthMatrix(c) {
  const all = new Set();
  for (const k of FRAMEWORK_LIST) for (const s of strengthsFor(c, k)) all.add(s);
  for (const k of FRAMEWORK_LIST) all.add(defaultFor(c.code, k));
  const cols = ORDER.filter((s) => all.has(s));
  const t = h('table.str-matrix');
  t.appendChild(h('caption.visually-hidden', `The strengths at which ${c.code} may be used in each set of guidelines, as each writes them`));
  t.appendChild(h('thead', h('tr', h('th', { scope: 'col' }, 'Guidelines'), cols.map((s) => h('th', { scope: 'col' }, SW[s])))));
  const body = h('tbody');
  for (const k of FRAMEWORK_LIST) {
    const allowed = strengthsFor(c, k);
    const d = defaultFor(c.code, k);
    body.appendChild(h('tr',
      h('th', { scope: 'row' }, fw(k).label),
      cols.map((s) => {
        if (!allowed.includes(s) && s !== d) return h('td.no', h('span', { 'aria-hidden': 'true' }, '–'), h('span.visually-hidden', 'not used'));
        const label = labelFor(c.code, s, k);
        return h('td' + (s === d ? '.def' : ''), h('span.crit.' + strengthKind(c.code, s), label), s === d ? h('span.def-mark', 'default') : null);
      })));
  }
  t.appendChild(body);
  return h('div.str-scroll', t);
}

/* ---------------- the numbers behind some criteria ---------------- */
const num = (x) => String(x);
const strengthWord = (s) => (s ? SW[s].toLowerCase() : 'none');

function pointsSteps() {
  // the points at which each strength is reached, from the calculators' own function
  const steps = [0.5, 1, 2, 4].map((p) => [p, strengthOfPoints(p)]);
  return h('p', 'The points add up across occurrences: ', steps.map(([p, s], i) => [i ? (i === steps.length - 1 ? ' and ' : ', ') : '', h('b', `${num(p)} ${p === 1 ? 'point' : 'points'}`), ` ${strengthWord(s)}`]), '.');
}

function pvs1Tree(article) {
  article.appendChild(h('h2', 'The PVS1 decision tree'));
  article.appendChild(h('p', 'ClinGen’s tree (Abou Tayoun et al. 2018), as the PVS1 section of a variant’s page asks it. Start at question 1; each answer leads to another question or to a strength.'));
  // number the questions in the order they are first reached
  const order = [];
  const seen = new Set();
  const visit = (key) => {
    if (seen.has(key) || !TREE[key]) return;
    seen.add(key);
    order.push(key);
    for (const o of TREE[key].options) if (o.next) visit(o.next);
  };
  visit('start');
  const numOf = Object.fromEntries(order.map((k, i) => [k, i + 1]));
  const ol = h('ol.tree-qs');
  for (const key of order) {
    const node = TREE[key];
    const li = h('li', { id: 'pvs1-q' + numOf[key] },
      h('p.tq', node.q),
      node.help ? h('p.small.muted', node.help) : null,
      h('ul.tq-a', node.options.map((o) => h('li',
        h('span', o.label),
        ' ',
        o.result
          ? h('span.tq-r' + (o.result === 'NA' ? '.na' : ''), o.result === 'NA' ? RESULT_TEXT.NA : h('span.crit.' + strengthKind('PVS1', o.result), labelFor('PVS1', o.result, 'clingen')))
          : h('button.tq-go', { type: 'button', onclick: () => document.getElementById('pvs1-q' + numOf[o.next]).scrollIntoView({ behavior: smooth(), block: 'center' }) }, `question ${numOf[o.next]}`)))));
    ol.appendChild(li);
  }
  article.appendChild(ol);
}

function denovoTable(article) {
  article.appendChild(h('h2', 'ClinGen’s points for each de novo occurrence'));
  article.appendChild(table(['The person’s phenotype', 'Confirmed', 'Assumed'], DENOVO_PHENO.map((r) => [r.label, num(r.confirmed), num(r.assumed)]), [false, true, true]));
  article.appendChild(pointsSteps());
  article.appendChild(h('p.small.muted', 'Occurrences with a non-specific, very heterogeneous phenotype add at most 1 point between them. The de novo calculator in the Patient and family section adds the points; the code is PS2 if any occurrence is confirmed and PM6 if none is.'));
}

function pm3Table(article) {
  article.appendChild(h('h2', 'ClinGen’s points for each affected person'));
  article.appendChild(table(['The variant was found', 'Points', 'At most, in all'], PM3_ROWS.map((r) => [r.label, num(r.points), r.cap != null ? num(r.cap) : '']), [false, true, true]));
  article.appendChild(pointsSteps());
}

function segregationTables(article) {
  article.appendChild(h('h2', 'Counting meioses, or weighing the pedigree'));
  article.appendChild(h('p', 'Jarvik and Browning (2016), as the ACGS 2024 guidelines use them: the strength comes from the number of informative meioses, each halving the chance that the segregation is coincidence.'));
  article.appendChild(table(['Strength', 'In one family', 'Across two or more families'], ['P', 'M', 'S'].map((s) => [SW[s], `${MEIOSES.one[s]} meioses (1 in ${Math.pow(2, MEIOSES.one[s])})`, `${MEIOSES.several[s]} meioses (1 in ${Math.pow(2, MEIOSES.several[s])})`]), [false, false, false]));
  article.appendChild(h('p', 'Or, with the whole pedigree, a likelihood ratio: how much more likely the relatives’ genotypes are, given everyone’s phenotypes, if the variant causes the disease than if it does not (the full-likelihood method of Thompson et al. 2003, which ClinGen’s expert panels use). The Patient and family section works it out exactly from the pedigree you draw, with the penetrance and phenocopy rate you give. On Tavtigian’s scale the ratio reaches:'));
  article.appendChild(table(['Strength', 'Likelihood ratio at least'], ['P', 'M', 'S', 'VS'].map((s) => [SW[s], num(BAYES_ODDS[s])]), [false, true]));
  article.appendChild(h('p.small.muted', 'For BS4 the same ratios apply the other way: a ratio of 1 in 18.7 or less against co-segregation is strong evidence that the variant is not the cause.'));
}

function oddsTable(article) {
  article.appendChild(h('h2', 'How strong an assay is: OddsPath'));
  article.appendChild(h('p', 'Brnich et al. (2019): from the pathogenic and benign controls an assay has been tested with, the odds that a variant with an abnormal (or a normal) result is pathogenic. The functional section’s calculator works it out.'));
  const pRows = [['VS', 350], ['S', 18.7], ['M', 4.3], ['P', 2.1]];
  const bRows = [['S', 0.053], ['M', 0.23], ['P', 0.48]];
  // the table is checked against the site's own function, so that the two cannot drift apart
  for (const [s, v] of pRows) if ((strengthOfOdds(v * 1.0001) || {}).strength !== s || (strengthOfOdds(v) || {}).strength === s) console.warn('The OddsPath table differs from calculators.js at', v);
  for (const [s, v] of bRows) if ((strengthOfOdds(v * 0.9999) || {}).strength !== s || (strengthOfOdds(v) || {}).strength === s) console.warn('The OddsPath table differs from calculators.js at', v);
  article.appendChild(table(['OddsPath', 'Evidence'], [
    ...pRows.map(([s, v]) => [`above ${num(v)}`, `PS3 ${SW[s].toLowerCase()}`]),
    [`from ${num(bRows[bRows.length - 1][1])} to ${num(pRows[pRows.length - 1][1])}`, 'indeterminate: neither'],
    ...bRows.slice().reverse().map(([s, v]) => [`below ${num(v)}`, `BS3 ${SW[s].toLowerCase()}`])
  ], [false, false]));
  article.appendChild(h('p.small.muted', 'Without a formal OddsPath, Brnich et al. allow supporting strength with 10 controls or fewer and moderate with 11 or more.'));
}

function predictorTable(article, code) {
  article.appendChild(h('h2', 'The thresholds'));
  const isPP3 = code === 'PP3';
  const levels = isPP3 ? ['P', 'M', 'S'] : ['P', 'M', 'S', 'VS'];
  const key = isPP3 ? 'pp3' : 'bp4';
  article.appendChild(h('p', `ClinGen’s calibrated thresholds (Pejaver et al. 2022; AlphaMissense, Bergquist et al. 2025): a score ${isPP3 ? 'at or above' : 'at or below'} each value reaches that strength of ${code}. Choose one tool before looking at the scores, and use it for every variant.`));
  article.appendChild(table(['Tool'].concat(levels.map((s) => SW[s])), Object.values(PREDICTORS).map((p) => [p.label].concat(levels.map((s) => (p[key][s] != null ? `${isPP3 ? '≥' : '≤'} ${num(p[key][s])}` : '–')))), [false].concat(levels.map(() => true))));
  const acgs = fw('acgs2024').predictor.REVEL;
  article.appendChild(h('p', `The ACGS 2024 guidelines use ${code} at supporting strength only, with REVEL ${isPP3 ? '≥ ' + acgs.pp3.P : '< ' + acgs.bp4.P}; with them, other tools are read at ClinGen’s supporting thresholds.`));
  const sp = fw('clingen').splice;
  const spA = fw('acgs2024').splice;
  article.appendChild(h('p', `For splicing (Walker et al. 2023), the highest SpliceAI score: ${isPP3 ? `${num(sp.pp3)} or more meets PP3 (the ACGS writes more than ${num(spA.pp3)})` : `${num(sp.bp4)} or less meets BP4 (the ACGS writes less than ${num(spA.bp4)})`}, at supporting strength.`));
}

function bp7Notes(article) {
  article.appendChild(h('h2', 'The thresholds'));
  article.appendChild(h('p', `SpliceAI ${num(SPLICEAI.bp7)} or less (no predicted effect on splicing), and, with the ACGS 2024 guidelines, a phyloP score below ${num(PHYLOP_BP7)} (the nucleotide is not highly conserved).`));
}

function ba1List(article) {
  article.appendChild(h('h2', 'ClinGen’s exceptions'));
  article.appendChild(h('p', `Common in some populations and yet pathogenic: BA1 is not used for these ${BA1_EXCEPTIONS.length} variants (Ghosh et al. 2018), and the site does not suggest it for them.`));
  article.appendChild(table(['Gene', 'Variant (MANE Select)', 'ClinGen allele'], BA1_EXCEPTIONS.map(([g, v, ca, old]) => [h('i.gene', g), h('span', h('span.hgvs', v), old ? h('span.small.muted', ` (${old} on the older transcript the paper used)`) : null), h('span.hgvs', ca)]), [false, false, false]));
}

function bs1Formula(article) {
  article.appendChild(h('h2', 'The highest credible allele frequency'));
  article.appendChild(h('p', 'Whiffin et al. (2017): from the prevalence of the disorder, the share of cases this gene causes (genetic heterogeneity), the largest share any one variant causes (allelic heterogeneity) and the penetrance.'));
  article.appendChild(h('div.formula', h('div', 'Dominant: AF = prevalence × genetic × allelic ÷ (2 × penetrance)'), h('div', 'Recessive: AF = √(prevalence × genetic ÷ penetrance) × allelic')));
  const ex = maxCredibleAF({ inheritance: 'dominant', prevalence: 1 / 500, allelic: 0.02, genetic: 1, penetrance: 0.5 });
  article.appendChild(h('p', 'For example, hypertrophic cardiomyopathy (prevalence 1 in 500, at most 2% of cases from one variant, penetrance 0.5) gives ', h('b', fmtAF(ex)), ': a variant whose grpmax filtering allele frequency is higher is too common to cause it. The calculator in the Population section does the sum; for recessive disorders the CardioDB calculator of Whiffin et al. is more exact.'));
}

function pm2Notes(article) {
  article.appendChild(h('h2', 'Its strength depends on the guidelines'));
  // PVS1 with PM2 at each framework's own default strength, classified by the site's engine
  const res = (k) => classify({ criteria: { PVS1: { met: true, strength: 'VS' }, PM2: { met: true, strength: defaultFor('PM2', k) } } }, { framework: k });
  const a = res('acgs2024'), c = res('clingen');
  article.appendChild(h('p', FRAMEWORK_LIST.map((k) => `${fw(k).label}: ${SW[defaultFor('PM2', k)].toLowerCase()}`).join('; ') + `. This one difference can decide the class: PVS1 with PM2 is ${a.points} points with the ACGS (${CLS[a.cls].toLowerCase()}) and ${c.points} with ClinGen (${CLS[c.cls].toLowerCase()}). `, h('a', { href: link('/learn/combining') }, 'Combining the evidence'), ' works through more examples.'));
}
const CLS = { p: 'Pathogenic', lp: 'Likely pathogenic', vus: 'Uncertain significance', lb: 'Likely benign', b: 'Benign' };

const EXTRAS = {
  PVS1: pvs1Tree,
  PS2: denovoTable,
  PM6: denovoTable,
  PM3: pm3Table,
  PP1: segregationTables,
  BS4: segregationTables,
  PS3: oddsTable,
  BS3: oddsTable,
  PP3: (a) => predictorTable(a, 'PP3'),
  BP4: (a) => predictorTable(a, 'BP4'),
  BP7: bp7Notes,
  BA1: ba1List,
  BS1: bs1Formula,
  PM2: pm2Notes
};

/** a small table: header labels, rows of cells (strings or nodes), and which columns are numbers */
export function table(heads, rows, numeric = []) {
  const t = h('table.data.compact.learn-table');
  t.appendChild(h('thead', h('tr', heads.map((x, i) => h('th', { scope: 'col', class: numeric[i] ? 'num' : null }, x)))));
  t.appendChild(h('tbody', rows.map((r) => h('tr', r.map((x, i) => h('td', { class: numeric[i] ? 'num' : null }, x))))));
  return h('div.table-wrap.learn-tw', t);
}
export { POINTS, FRAMEWORKS };
