/* =====================================================================
   The evidence sections of a variant's page. Each draws itself from the
   page's ctx (the variant, its patient, the annotation, the gene and the
   classification), and again when the data it depends on arrive. The
   criteria the section bears on are shown at its end, bound to the same
   classification as the panel beside it.
   ===================================================================== */
import { h, esc, icon, fmt, fmtAF, oneIn, pct, toast, debounce, modal } from '../core.js';
import { link } from '../router.js';
import * as settings from '../settings.js';
import { criterionRow, framework } from '../widgets/acmg-panel.js';
import { loading, note, select, field, table, btn, clsBadge } from '../ui.js';
import { niceConsequence, sameResidue, LOF_TERMS } from '../annotate.js';
import { GROUPS as GN_GROUPS, GRPMAX_GROUPS, grpmaxFAF, maxGroupAF, VERSION as GN_VERSION, gene as gnomadGene } from '../api/gnomad.js';
import { PREDICTORS, predictorStrength, thresholdMarks, SPLICEAI } from '../acmg/thresholds.js';
import { maxCredibleAF, maxTolerableAC, denovoPoints, DENOVO_PHENO, pm3Points, PM3_ROWS, oddsPath, strengthOfPoints } from '../acmg/calculators.js';
import { TREE, walk, startAnswer, RESULT_TEXT } from '../acmg/pvs1.js';
import { nmdPrediction, lofMechanism, geneMOI } from '../acmg/suggest.js';
import { labelFor, fw } from '../acmg/frameworks.js';
import { stars as cvStars } from '../api/clinvar.js';
import { DOSAGE, dosageText, hiPredicted, THRESH, bestValidity } from '../genes.js';
import { INHERITANCE, ZYGOSITY, inheritanceText } from '../summary.js';

import { crits, waiting, sectionNote, stars, ext, kv, ancestryOf } from './evidence-common.js';

/* ================================================================
   Summary
   ================================================================ */
function drawSummary(ctx, body) {
  const ev = ctx.ev, d = ev && ev.d;
  if (!d) {
    const w = waiting(ctx, 'vep', 'Ensembl’s VEP');
    if (w) body.appendChild(w);
    return;
  }
  const g = ev.gnomad;
  const s = g && g.found ? g.joint || g.exome || g.genome : null;
  const faf = grpmaxFAF(g);
  const cv = ev.clinvar && ev.clinvar.self;
  const p = d.predictors || {};
  const name = settings.get('predictor') || 'REVEL';
  const P = PREDICTORS[name];
  const score = P ? p[P.key] : null;
  const spl = d.spliceai;
  const rows = [
    ['Effect', h('span', niceConsequence(d.consequence), d.impact ? h('span.tag', { style: { marginLeft: '6px' } }, d.impact.toLowerCase() + ' impact') : null), 'type'],
    ['Population', !g ? '…' : !g.found || !s || !s.ac ? `Not in ${g.dataset}` : `${fmtAF(s.af)} (${fmt(s.ac)} of ${fmt(s.an)} alleles${s.hom ? `, ${fmt(s.hom)} homozygous` : ''})${faf ? `; grpmax FAF ${fmtAF(faf.faf)}` : ''}`, 'population'],
    d.consequence === 'missense_variant' ? ['Missense prediction', score != null ? `${P.label} ${score.toFixed(3)}` + (d.predictors.alphamissense != null && name !== 'AlphaMissense' ? `; AlphaMissense ${d.predictors.alphamissense.toFixed(3)}` : '') : 'No score', 'predictions'] : null,
    ['Splicing', spl ? `SpliceAI ${spl.max.toFixed(2)}${spl.max >= 0.2 ? ' predicts an effect' : spl.max <= 0.1 ? ' predicts no effect' : ' is in the uncertain range'}` : 'No SpliceAI score', 'splicing'],
    ['ClinVar', !ev.clinvar ? '…' : cv ? h('span', cv.classification, ' ', stars(cv.stars), cv.conditions.length ? ` – ${cv.conditions.slice(0, 2).join('; ')}` : '') : 'Not in ClinVar', 'clinvar'],
    ['Gene', ctx.gene ? geneLine(ctx.gene) : d.gene || '–', 'gene']
  ].filter(Boolean);
  const t = h('table.glance', h('tbody', rows.map(([k, v, key]) => h('tr', h('th', { scope: 'row' }, k), h('td', v), h('td.num', h('a', { href: '#sec-' + key, onclick: (e) => { e.preventDefault(); ctx.scrollTo(key); } }, 'Evidence'))))));
  body.appendChild(t);
  if (ctx.pt && (ctx.pt.phenotypes || []).length) body.appendChild(h('p.small.muted', 'The Gene and disease section compares the patient’s phenotype with the gene’s diseases.'));
  if (!ctx.pt) body.appendChild(note('', h('p', 'This variant isn’t linked to a patient, so there’s no family or phenotype to weigh. To use the family and phenotype criteria, ', h('b', 'add it to a patient'), ' with the button beside the classification.')));
}
function geneLine(g) {
  const v = bestValidity(g);
  const bits = [];
  if (v) bits.push(`${v.classification} for ${v.disease} (${v.moi})`);
  if (g.hi != null) bits.push(`haploinsufficiency ${g.hi}`);
  if (g.loeuf != null) bits.push(`LOEUF ${g.loeuf.toFixed(2)}`);
  return h('span', h('i.gene', g.symbol), ': ', bits.join('; ') || g.name);
}

/* ================================================================
   Population
   ================================================================ */
function drawPopulation(ctx, body) {
  const ev = ctx.ev;
  const w = !ev || !ev.gnomad ? waiting(ctx, 'gnomad', 'gnomAD') : null;
  if (w) {
    body.appendChild(w);
    body.appendChild(crits(ctx, ['BA1', 'BS1', 'BS2', 'PM2']));
    return;
  }
  const g = ev.gnomad;
  const asm = ctx.asm;
  const gnLink = `https://gnomad.broadinstitute.org/variant/${ctx.v.chrom}-${ctx.v.pos}-${ctx.v.ref}-${ctx.v.alt}?dataset=${asm === 'GRCh37' ? 'gnomad_r2_1' : 'gnomad_r4'}`;
  if (!g.found) {
    body.appendChild(h('p', h('b', `This variant isn’t in ${g.dataset}. `), 'Either none of the ', asm === 'GRCh37' ? '141,456' : 'roughly 807,000', ' people in the dataset was seen with it, or it didn’t pass quality control. ', ext(gnLink, 'Open in gnomAD'), '.'));
    body.appendChild(note('warn', h('p', 'Before you use absence as evidence for PM2, check that gnomAD sequenced this position well by opening it in gnomAD and looking at the coverage. Absence means little in a poorly covered region, or for complex indels and repeats.')));
  } else {
    const parts = [['Exomes', g.exome], ['Genomes', g.genome], [g.joint && g.joint.combined ? 'Both together' : 'Joint', g.joint]].filter((x) => x[1]);
    // the frequencies first, so that on a phone they are in view without scrolling the table sideways
    const sexChrom = /^(X|Y)$/.test(ctx.v.chrom);
    body.appendChild(table([
      { key: 'k', label: '' },
      { key: 'af', label: 'Frequency', num: true, fmt: (r) => h('span.af2', h('span', fmtAF(r.s.af)), r.s.af ? h('span.muted.small', oneIn(r.s.af)) : null) },
      { key: 'faf', label: 'grpmax FAF', num: true, fmt: (r) => (r.s.faf95 != null ? h('span', fmtAF(r.s.faf95), h('span.muted.small', ' ' + (r.s.faf95Group || ''))) : '–') },
      { key: 'ac', label: 'Allele count', num: true, fmt: (r) => fmt(r.s.ac) },
      { key: 'an', label: 'Allele number', num: true, fmt: (r) => fmt(r.s.an) },
      { key: 'hom', label: 'Homozygotes', num: true, fmt: (r) => fmt(r.s.hom) },
      sexChrom ? { key: 'hemi', label: 'Hemizygotes', num: true, fmt: (r) => fmt(r.s.hemi) } : null,
      { key: 'f', label: 'Filters', fmt: (r) => (r.s.filters && r.s.filters.length ? h('span.tag.warn', r.s.filters.join(', ')) : h('span.tag.ok', 'pass')) }
    ].filter(Boolean), parts.map(([k, s]) => ({ k, s })), { compact: true, caption: 'gnomAD frequencies' }));
    // by genetic ancestry group
    const s = g.joint || g.exome || g.genome;
    const mine = ancestryOf(ctx.pt);
    const groups = Object.entries(s.pops || {}).filter(([k]) => GN_GROUPS[k]).map(([k, p]) => ({ k, name: GN_GROUPS[k], ...p })).sort((a, b) => (b.af || 0) - (a.af || 0));
    const maxAF = Math.max(...groups.map((x) => x.af || 0), 1e-9);
    body.appendChild(h('h3.vsub', 'By genetic ancestry group'));
    body.appendChild(table([
      { key: 'name', label: 'Group', fmt: (r) => h('span', r.name, r.k === mine ? h('span.tag.accent', { style: { marginLeft: '6px' } }, 'the patient’s') : null, !GRPMAX_GROUPS.includes(r.k) ? h('span.muted.small', ' (not in grpmax)') : null) },
      { key: 'af', label: 'Frequency', num: true, fmt: (r) => h('span.afcell', h('span.afbar', { style: { width: Math.max(1, ((r.af || 0) / maxAF) * 60) + 'px' } }), fmtAF(r.af)) },
      { key: 'ac', label: 'Alleles', num: true, fmt: (r) => `${fmt(r.ac)} / ${fmt(r.an)}` },
      { key: 'hom', label: 'Hom.', num: true, fmt: (r) => fmt(r.hom) }
    ], groups, { compact: true, caption: 'Frequency by group' }));
    body.appendChild(h('p.small.muted', `These figures are from ${g.dataset}. The grpmax filtering allele frequency (FAF) is the highest frequency that the counts are consistent with, at 95% confidence, in any of the large continental groups. It’s the figure ClinGen and the ACGS compare with BA1 and BS1. `, ext(gnLink, 'Open in gnomAD'), '.'));
    if (g.flags && g.flags.length) body.appendChild(note('warn', h('p', 'gnomAD flags this variant (' + g.flags.join(', ') + '), so its frequency may be unreliable.')));
  }
  body.appendChild(afCalculator(ctx));
  body.appendChild(crits(ctx, ['BA1', 'BS1', 'BS2', 'PM2']));
  body.appendChild(sectionNote(ctx, 'population'));
}

/** the highest credible allele frequency for the disorder (Whiffin et al. 2017) */
function afCalculator(ctx) {
  // dominant unless the gene's disorders are recessive (or, for a gene with both, the patient has two copies)
  const moi = geneMOI(ctx.gene) || '';
  const rec = moi === 'AR' || (/AR/.test(moi) && /\//.test(moi) && ctx.v && (ctx.v.zygosity === 'homozygous' || ctx.v.inheritance === 'biparental'));
  const calc = (ctx.calc.af = ctx.calc.af || { inheritance: rec ? 'recessive' : 'dominant', prevalence: '1/10000', allelic: 0.1, genetic: 0.5, penetrance: 0.5 });
  // until the student sets the values, the inheritance follows the gene (whose curations may arrive after gnomAD)
  if (!calc.userSet) calc.inheritance = rec ? 'recessive' : 'dominant';
  const out = h('div.calc-out');
  const parseFrac = (x) => {
    const s = String(x).trim();
    const m = /^1\s*\/\s*([\d,]+)$/.exec(s) || /^1\s+in\s+([\d,]+)$/i.exec(s);
    if (m) return 1 / +m[1].replace(/,/g, '');
    return +s;
  };
  const inh = select([['dominant', 'Dominant (one copy)'], ['recessive', 'Recessive (two copies)']], calc.inheritance);
  const prev = h('input', { type: 'text', value: calc.prevalence, 'aria-label': 'Prevalence' });
  const al = h('input', { type: 'number', min: 0, max: 1, step: 0.01, value: calc.allelic });
  const ge = h('input', { type: 'number', min: 0, max: 1, step: 0.01, value: calc.genetic });
  const pe = h('input', { type: 'number', min: 0.01, max: 1, step: 0.05, value: calc.penetrance });
  // the values start as an example; only once the student has set them for the
  // disorder does the answer count (in the suggestions, and in what is saved)
  const run = (byUser) => {
    Object.assign(calc, { inheritance: inh.value, prevalence: prev.value, allelic: +al.value, genetic: +ge.value, penetrance: +pe.value });
    if (byUser === true) calc.userSet = true;
    const max = maxCredibleAF({ inheritance: calc.inheritance, prevalence: parseFrac(calc.prevalence), allelic: calc.allelic, genetic: calc.genetic, penetrance: calc.penetrance });
    calc.max = max;
    out.innerHTML = '';
    if (!max) {
      out.appendChild(h('p.err.small', 'Enter the prevalence as 1/N or a decimal, and the three proportions as numbers between 0 and 1.'));
      return;
    }
    const g = ctx.ev && ctx.ev.gnomad;
    const faf = grpmaxFAF(g);
    const an = g && g.found ? (g.joint || g.exome || g.genome || {}).an : null;
    if (!calc.userSet) out.appendChild(h('p.small.res-differ', 'These are example values. Set the prevalence, heterogeneity and penetrance for this disorder before you use the answer.'));
    out.append(...[h('p', 'The highest credible allele frequency is ', h('b', fmtAF(max)), ` (${oneIn(max)}).`,
      an ? ` Among ${fmt(an)} alleles, a pathogenic variant at that frequency would be seen about ${fmt(maxTolerableAC(max, an))} times at most, with 95% confidence.` : ''),
    faf && calc.userSet ? h('p', faf.faf > max ? h('b.res-differ', `The grpmax FAF (${fmtAF(faf.faf)}) is above this, so the variant is too common for this disorder (BS1).`) : `The grpmax FAF (${fmtAF(faf.faf)}) is below this, so the variant isn’t too common for this disorder.`) : null].filter(Boolean));
    if (byUser === true) {
      ctx.save();
      ctx.refreshSuggestions();
    }
  };
  for (const el of [inh, prev, al, ge, pe]) el.addEventListener('change', () => run(true));
  const box = h('details.calc', { open: calc.userSet ? true : null },
    h('summary', h('span', { html: icon('calc') }), 'Is it too common for the disorder? Use the frequency calculator'),
    h('p.small.muted', 'Whiffin et al. (2017) work out the highest frequency a pathogenic variant could have from the prevalence of the disorder, the share of cases this gene causes (genetic heterogeneity), the largest share of those cases that one variant causes (allelic heterogeneity) and the penetrance. For BS1, compare the result with the grpmax FAF. For PM2 with a recessive disorder, the frequency should be well below it, and the ACGS says ten times below.'),
    h('div.fields', field('Inheritance', inh), field('Prevalence', prev, 'e.g. 1/10000'), field('Allelic heterogeneity', al, 'largest share of cases from one variant'), field('Genetic heterogeneity', ge, 'share of cases from this gene'), field('Penetrance', pe)),
    out,
    h('p.small', ext('https://www.cardiodb.org/allelefrequencyapp/', 'Whiffin et al.’s own calculator'), ' has worked examples.'));
  setTimeout(run, 0);
  return box;
}

/* ================================================================
   Variant type, and the PVS1 decision tree
   ================================================================ */
function drawType(ctx, body) {
  const ev = ctx.ev, d = ev && ev.d;
  if (!d) {
    const w = waiting(ctx, 'vep', 'Ensembl’s VEP');
    if (w) body.appendChild(w);
    return;
  }
  const cons = d.consequences || [];
  body.appendChild(kv([
    ['Consequence', cons.map(niceConsequence).join(', ')],
    ['On the transcript', h('span.hgvs', d.hgvsc || '–')],
    ['On the protein', d.hgvsp ? h('span.hgvs', d.hgvsp) : 'No change to the protein sequence'],
    d.exon ? ['Exon', `${d.exon.n} of ${d.exon.of}`] : d.intron ? ['Intron', `${d.intron.n} of ${d.intron.of}`] : null,
    d.proteinPos ? ['Position in the protein', `${d.proteinPos}${d.aminoAcids ? ` (${d.aminoAcids.replace('/', ' to ')})` : ''}`] : null,
    d.codons ? ['Codon', h('span.hgvs', d.codons.replace('/', ' → '))] : null,
    ['Variant class', d.variantClass]
  ]));
  if (d.lofConsequence) {
    const nmd = nmdPrediction(d);
    const lof = lofMechanism(ctx.gene, ctx.clinvarGene);
    body.appendChild(h('h3.vsub', 'Loss of function'));
    body.appendChild(kv([
      ['Nonsense-mediated decay', nmd.escapes == null ? 'Not known' : nmd.escapes ? h('span', h('b', 'Expected to escape NMD'), `: ${nmd.why}`) : h('span', h('b', 'NMD expected'), `: ${nmd.why}`)],
      nmd.removedPct != null ? ['Protein lost', `About ${nmd.removedPct.toFixed(0)}% of the protein is downstream of the variant`] : null,
      d.lof ? ['LOFTEE', `${d.lof.call === 'HC' ? 'High confidence' : 'Low confidence'} loss of function${d.lof.filter ? ' (' + d.lof.filter + ')' : ''}${d.lof.flags ? '; flags: ' + d.lof.flags : ''}`] : null,
      d.nmd ? ['VEP’s NMD plugin', d.nmd === 'NMD_escaping_variant' ? 'Predicts escape from NMD. Its rules include the first 100 coding bases, where translation may restart, but that rule isn’t part of the PVS1 tree.' : d.nmd] : null,
      ['Is loss of function a cause of disease?', lof.yes ? h('span', h('b', 'Yes: '), lof.why.join('; ')) : h('span', h('b', 'Not shown here. '), 'PVS1 needs loss of function to be an established mechanism of disease. Look for a ClinGen haploinsufficiency score of 3, the mechanism Gene2Phenotype gives, or pathogenic LoF variants in ClinVar.')]
    ]));
  } else if (cons.some((c) => ['inframe_insertion', 'inframe_deletion', 'stop_lost'].includes(c))) {
    body.appendChild(note('', h('p', 'As an in-frame change or a stop-loss, this variant alters the length of the protein. PM4 applies if it’s outside a repeat region, and BP3 if it’s in a repeat with no known function.')));
  }
  body.appendChild(pvs1Tree(ctx));
  body.appendChild(crits(ctx, ['PVS1', 'PM4', 'BP3']));
  body.appendChild(sectionNote(ctx, 'type'));
}

function pvs1Tree(ctx) {
  const d = ctx.ev.d;
  const calc = (ctx.calc.pvs1 = ctx.calc.pvs1 || { answers: [] });
  if (!calc.answers.length) {
    const s = startAnswer(d.consequences);
    if (s != null) calc.answers = [s];
  }
  const box = h('details.calc.pvs1', { open: d.lofConsequence ? true : null }, h('summary', h('span', { html: icon('route') }), 'The PVS1 decision tree (Abou Tayoun et al. 2018)'));
  if (!d.lofConsequence) box.appendChild(h('p.small.res-differ', `PVS1 is for null variants: nonsense, frameshift, canonical ±1 or 2 splice site, start-loss, and exon deletions and duplications. This variant’s consequence is ${niceConsequence(d.consequence)}, so the tree doesn’t apply to it, but you can still explore it here.`));
  const inner = h('div');
  box.appendChild(inner);
  const draw = () => {
    inner.innerHTML = '';
    const w = walk(calc.answers);
    const ol = h('ol.tree-steps');
    w.steps.forEach((st, i) => {
      const back = h('button.btn.small.ghost', { type: 'button', title: 'Change this answer' }, 'Change');
      back.addEventListener('click', () => {
        calc.answers = calc.answers.slice(0, i);
        delete calc.result;
        commit();
      });
      ol.appendChild(h('li', h('span.tree-q', st.q), h('span.tree-a', st.answer), back));
    });
    inner.appendChild(ol);
    if (w.done) {
      calc.result = { strength: w.strength, path: w.path, na: !!w.na };
      inner.appendChild(h('div.tree-result' + (w.na ? '.na' : ''), h('b', RESULT_TEXT[w.na ? 'NA' : w.strength]), w.na ? '. Don’t use it for this variant.' : d.lofConsequence ? '. You can apply it below, where the suggestion says the same.' : ', if this had been a null variant.'));
      if (ctx.gene) {
        const v = bestValidity(ctx.gene);
        if (v && /Moderate/.test(v.classification)) inner.appendChild(note('warn', h('p', `ClinGen rates the gene–disease relationship as “${v.classification}”. The tree assumes a strong or definitive one. For a moderate gene, Abou Tayoun et al. take PVS1 down one level if two or more loss-of-function variants have been reported and a null mouse model has the disease, and down two levels if only one of these is true (their Table 1).`)));
        else if (v && !/Definitive|Strong/.test(v.classification)) inner.appendChild(note('warn', h('p', `ClinGen rates the gene–disease relationship as “${v.classification}”. The tree assumes a strong or definitive relationship, or a moderate one at lower strength, so PVS1 shouldn’t be used.`)));
      }
    } else if (w.node) {
      const q = h('div.tree-node', h('p', h('b', w.node.q)), w.node.help ? h('p.small.muted', w.node.help) : null);
      const opts = h('div.tree-opts');
      w.node.options.forEach((o, i) => {
        const b = h('button.btn.small', { type: 'button' }, o.label);
        b.addEventListener('click', () => {
          calc.answers = calc.answers.concat([i]);
          commit();
        });
        opts.appendChild(b);
      });
      q.appendChild(opts);
      inner.appendChild(q);
    }
  };
  const commit = () => {
    draw();
    ctx.save();
    ctx.refreshSuggestions();
  };
  draw();
  return box;
}

/* ================================================================
   Predictions
   ================================================================ */
function drawPredictions(ctx, body) {
  const ev = ctx.ev, d = ev && ev.d;
  if (!d) {
    const w = waiting(ctx, 'vep', 'Ensembl’s VEP');
    if (w) body.appendChild(w);
    return;
  }
  const p = d.predictors || {};
  const F = framework();
  const chosen = settings.get('predictor') || 'REVEL';
  const pick = select(Object.keys(PREDICTORS).filter((k) => k !== 'phyloP').map((k) => [k, PREDICTORS[k].label]), chosen, { 'aria-label': 'The predictor you use for PP3 and BP4' });
  pick.addEventListener('change', () => {
    settings.set('predictor', pick.value);
    ctx.refreshSuggestions();
    ctx.redraw(['predictions']);
  });
  const isMissense = d.consequence === 'missense_variant' || (d.consequences || []).includes('missense_variant');
  body.appendChild(h('div.row', h('span', 'Choose your predictor for missense variants before you look at the scores:'), pick));
  if (!isMissense) body.appendChild(note('', h('p', `This isn’t a missense variant, so the missense predictors don’t apply to it. ${d.lofConsequence ? 'For a loss-of-function variant, PVS1 covers the effect' : 'For other variants, look at splicing instead (PP3 or BP4 from SpliceAI)'}.`)));
  const bars = h('div.pred-bars');
  for (const [name, P] of Object.entries(PREDICTORS)) {
    const v = p[P.key];
    bars.appendChild(predictorBar(name, v, F, name === chosen));
  }
  body.appendChild(bars);
  const extra = [
    p.sift ? ['SIFT', `${p.sift.score} (${String(p.sift.pred).replace(/_/g, ' ')})`] : null,
    p.polyphen ? ['PolyPhen-2', `${p.polyphen.score} (${String(p.polyphen.pred).replace(/_/g, ' ')})`] : null,
    p.metarnn != null ? ['MetaRNN', p.metarnn.toFixed(3)] : null,
    p.gerp != null ? ['GERP++', p.gerp.toFixed(2)] : null,
    p.blosum62 != null ? ['BLOSUM62', `${p.blosum62} (${p.blosum62 < 0 ? 'a substitution rarely seen in related proteins' : 'a substitution seen in related proteins'})`] : null,
    d.predictors.alphamissenseClass ? ['AlphaMissense’s own class', d.predictors.alphamissenseClass.replace(/_/g, ' ')] : null
  ].filter(Boolean);
  if (extra.length) body.appendChild(h('details', h('summary', 'Other scores'), kv(extra), h('p.small.muted', 'At their developers’ thresholds, SIFT and PolyPhen-2 don’t reach even supporting strength (Pejaver et al. 2022), so they’re shown only for comparison.')));
  body.appendChild(h('p.small.muted', F === 'acgs2024'
    ? 'Under the ACGS 2024 guidelines, PP3 and BP4 are supporting only, with REVEL ≥ 0.7 for PP3 and < 0.4 for BP4. The coloured bands show those thresholds, and the other tools are shown at ClinGen’s supporting thresholds.'
    : 'The bands are ClinGen’s calibrated thresholds (Pejaver et al. 2022, and Bergquist et al. 2025 for AlphaMissense). Choose one predictor in advance, and use its result only once.'));
  body.appendChild(crits(ctx, ['PP3', 'BP4']));
  body.appendChild(sectionNote(ctx, 'predictions'));
}

/** a predictor's range, coloured where each strength is reached, with the variant's score marked */
function predictorBar(name, score, F, chosen) {
  const P = PREDICTORS[name];
  const [lo, hi] = P.range;
  const x = (v) => ((Math.max(lo, Math.min(hi, v)) - lo) / (hi - lo)) * 100;
  const marks = thresholdMarks(name, F);
  const segs = h('div.pbar-track');
  // benign bands from the low end, pathogenic from the high end
  const bp4 = marks.filter((m) => m.code === 'BP4').sort((a, b) => b.at - a.at);
  const pp3 = marks.filter((m) => m.code === 'PP3').sort((a, b) => a.at - b.at);
  for (const m of bp4) segs.appendChild(h('span.pbar-seg.b-' + m.strength, { style: { left: '0%', width: x(m.at) + '%' }, title: `${labelFor('BP4', m.strength, F)}: ${m.at} or below` }));
  for (const m of pp3) segs.appendChild(h('span.pbar-seg.p-' + m.strength, { style: { left: x(m.at) + '%', width: 100 - x(m.at) + '%' }, title: `${labelFor('PP3', m.strength, F)}: ${m.at} or above` }));
  const res = predictorStrength(name, score, F);
  const marker = score != null ? h('span.pbar-mark', { style: { left: x(score) + '%' } }) : null;
  return h('div.pbar' + (chosen ? '.chosen' : ''),
    h('div.pbar-h', h('b', P.label), chosen ? h('span.tag.accent', 'your predictor') : null, h('span.pbar-v', score == null ? 'no score' : (Math.abs(score) < 10 ? score.toFixed(3) : score.toFixed(1))), res ? h('span.crit.' + (res.code === 'PP3' ? { S: 'ps', M: 'pm', P: 'pp' }[res.strength] : { VS: 'ba', S: 'bs', M: 'bs', P: 'bp' }[res.strength]), labelFor(res.code, res.strength, F)) : score != null ? h('span.small.muted', 'between the thresholds') : null),
    h('div.pbar-body', segs, marker),
    h('div.pbar-scale.small.muted', h('span', String(lo)), h('span', String(hi))));
}

/* ================================================================
   Splicing
   ================================================================ */
function drawSplicing(ctx, body) {
  const ev = ctx.ev, d = ev && ev.d;
  if (!d) {
    const w = waiting(ctx, 'vep', 'Ensembl’s VEP');
    if (w) body.appendChild(w);
    return;
  }
  const s = d.spliceai;
  const v = ctx.v;
  const lookup = `https://spliceailookup.broadinstitute.org/#variant=${encodeURIComponent(`chr${v.chrom}-${v.pos}-${v.ref}-${v.alt}`)}&hg=${ctx.asm === 'GRCh37' ? '37' : '38'}&distance=500&mask=1`;
  if (!s) {
    body.appendChild(h('p', 'VEP has no SpliceAI score for this variant. Its scores are precomputed, and cover substitutions and small indels near genes. ', ext(lookup, 'SpliceAI-lookup'), ' can compute the scores for you.'));
  } else {
    const row = (k, label, ds, dp) => ({ k, label, ds, dp });
    const rows = [row('ag', 'Acceptor gain', s.ag, s.pag), row('al', 'Acceptor loss', s.al, s.pal), row('dg', 'Donor gain', s.dg, s.pdg), row('dl', 'Donor loss', s.dl, s.pdl)];
    const grid = h('div.splice-grid');
    for (const r of rows) {
      const cls = r.ds >= 0.5 ? 'high' : r.ds >= 0.2 ? 'mid' : r.ds > 0.1 ? 'low' : 'none';
      grid.appendChild(h('div.splice-cell.' + cls,
        h('div.splice-l', r.label),
        h('div.splice-v', (r.ds || 0).toFixed(2)),
        h('div.splice-bar', h('span', { style: { width: Math.round((r.ds || 0) * 100) + '%' } })),
        h('div.small.muted', r.dp != null ? `${Math.abs(r.dp)} bp ${r.dp < 0 ? 'upstream' : r.dp > 0 ? 'downstream' : 'at the variant'}` : '')));
    }
    body.appendChild(grid);
    const F = framework();
    const sf = fw(F).splice;
    // the same cut-offs as the suggestions: the ACGS 2024 guidelines want above 0.2 and below 0.1
    const high = sf.pp3Strict ? s.max > sf.pp3 : s.max >= sf.pp3;
    const low = sf.bp4Strict ? s.max < sf.bp4 : s.max <= sf.bp4;
    body.appendChild(h('p', 'The highest score is ', h('b', s.max.toFixed(2)), '. ', s.max >= 0.5 ? 'That’s a strong prediction of an effect on splicing.' : high ? `That’s ${sf.pp3Strict ? 'above' : 'at or above'} ${sf.pp3}, so SpliceAI predicts an effect (PP3 for splicing, at supporting strength).` : low ? `That’s ${sf.bp4Strict ? 'below' : 'at or below'} ${sf.bp4}, so no effect is predicted (BP4, and BP7 for a synonymous or deep intronic variant).` : `Scores between ${sf.bp4} and ${sf.pp3} are uninformative (Walker et al. 2023).`));
    body.appendChild(h('p.small.muted', 'Each score, from 0 to 1, is the change in the probability that a base within 500 bases of the variant is used as an acceptor or donor. Positions are relative to the variant. These are masked scores, so gains of sites that are already used and losses of sites that aren’t used are left out. ', ext(lookup, 'Open in SpliceAI-lookup'), ' to see the transcripts, the raw scores and Pangolin’s scores.'));
  }
  const dist = /c\.[*-]?\d+([+-])(\d+)/.exec(d.hgvsc || '');
  if (dist) body.appendChild(h('p', `This variant is intronic, ${dist[2]} ${+dist[2] === 1 ? 'base' : 'bases'} into the intron from its ${dist[1] === '+' ? '5′ end (the donor side)' : '3′ end (the acceptor side)'}. ${+dist[2] <= 2 ? 'It’s at a canonical ±1 or 2 position, so the PVS1 tree applies.' : (dist[1] === '+' && +dist[2] <= 6) || (dist[1] === '-' && +dist[2] <= 20) ? 'It’s within the splice region, where BP7 doesn’t apply.' : 'It’s outside the splice region.'}`));
  body.appendChild(crits(ctx, ['PP3', 'BP4', 'BP7']));
  body.appendChild(sectionNote(ctx, 'splicing'));
}

/* ================================================================
   Protein: domains, ClinVar's variants along it, and the 3D model
   ================================================================ */
async function drawProtein(ctx, body) {
  const ev = ctx.ev, d = ev && ev.d;
  if (!d) {
    const w = waiting(ctx, 'vep', 'Ensembl’s VEP');
    if (w) body.appendChild(w);
    return;
  }
  if (!d.gene || d.biotype !== 'protein_coding') {
    body.appendChild(h('p.muted', 'This variant isn’t in a protein-coding transcript.'));
    return;
  }
  const holder = h('div', loading('Fetching the protein from UniProt and the gene’s ClinVar variants from gnomAD…'));
  body.appendChild(holder);
  const acc = (d.uniprot || (ctx.gene && ctx.gene.uniprot) || '').replace(/-\d+$/, '');
  const [{ uniprot }, plot] = await Promise.all([import('../api/proteins.js'), import('../widgets/protein-plot.js')]);
  let up = null, cvg = ctx.clinvarGene;
  const errs = [];
  await Promise.all([
    acc ? uniprot(acc).then((x) => (up = x)).catch((e) => errs.push('UniProt didn’t answer: ' + e.message)) : Promise.resolve(),
    cvg ? Promise.resolve() : gnomadGene(d.gene, ctx.asm).then((g) => { cvg = ctx.clinvarGene = g ? g.clinvar_variants || [] : []; ctx.gnomadGene = g; ctx.refreshSuggestions(); }).catch((e) => errs.push('gnomAD didn’t send the gene’s ClinVar variants: ' + e.message))
  ]);
  holder.innerHTML = '';
  if (errs.length) holder.appendChild(note('warn', h('p', errs.join('. '))));
  const len = up ? up.length : null;
  if (len && d.proteinPos && d.proteinPos > len) holder.appendChild(note('warn', h('p', `The variant is at residue ${d.proteinPos} of the transcript’s protein, but UniProt’s ${acc} has only ${len} residues. They’re different isoforms, so the positions may not match.`)));
  holder.appendChild(plot.proteinPlot({ length: len || (d.proteinPos ? Math.round(d.proteinPos * 1.2) : 500), features: up ? up.features : [], clinvar: cvg || [], variantPos: d.proteinPos, variantLabel: d.hgvsp || '', gene: d.gene }));
  if (up) {
    holder.appendChild(h('p.small.muted', `${up.name} (UniProt ${up.accession}, ${up.length} residues). `, ext(`https://www.uniprot.org/uniprotkb/${up.accession}/entry`, 'Open in UniProt'), '. The ClinVar variants come from gnomAD’s copy of ClinVar and have one star or more.'));
    if (up.function) holder.appendChild(h('details', h('summary', 'What the protein does (UniProt)'), h('p.small', up.function)));
  }
  // PM1: what is around the variant
  if (d.proteinPos && cvg) {
    const near = (c, w) => {
      const m = /^p\.[A-Z][a-z]{2}(\d+)/.exec(c.hgvsp || '');
      return m && Math.abs(+m[1] - d.proteinPos) <= w;
    };
    const mis = cvg.filter((c) => c.major_consequence === 'missense_variant' && c.gold_stars >= 1);
    const P = (c) => /^(Pathogenic|Likely pathogenic|Pathogenic\/Likely pathogenic)$/.test(c.clinical_significance);
    const B = (c) => /^(Benign|Likely benign|Benign\/Likely benign)$/.test(c.clinical_significance);
    const doms = up ? up.features.filter((f) => f.kind === 'domain' && f.start <= d.proteinPos && f.end >= d.proteinPos) : [];
    holder.appendChild(kv([
      ['Within 12 residues', `${mis.filter((c) => near(c, 12) && P(c)).length} pathogenic or likely pathogenic missense, ${mis.filter((c) => near(c, 12) && B(c)).length} benign or likely benign`],
      ['Within 25 residues', `${mis.filter((c) => near(c, 25) && P(c)).length} pathogenic or likely pathogenic, ${mis.filter((c) => near(c, 25) && B(c)).length} benign or likely benign`],
      ['In a domain', doms.length ? doms.map((f) => `${f.description} (${f.start}–${f.end})`).join('; ') : 'No UniProt domain here']
    ]));
  }
  if (up && d.proteinPos) {
    const b = btn('Show it in 3D (AlphaFold)', async () => {
      b.disabled = true;
      const m = await import('../widgets/structure.js');
      m.showStructure(holder3d, { accession: up.accession, residue: d.proteinPos, label: d.hgvsp, gene: d.gene, clinvar: cvg }).catch((e) => {
        holder3d.innerHTML = '';
        holder3d.appendChild(note('bad', h('p', 'The 3D model couldn’t be shown: ' + e.message)));
      });
    }, { icon: 'cube' });
    const holder3d = h('div.struct-holder');
    holder.appendChild(h('div.btn-row', { style: { margin: '10px 0' } }, b));
    holder.appendChild(holder3d);
  }
  holder.appendChild(crits(ctx, ['PM1', 'PM5', 'PS1']));
  holder.appendChild(sectionNote(ctx, 'protein'));
}

/* ================================================================
   ClinVar and the literature
   ================================================================ */
function drawClinvar(ctx, body) {
  const ev = ctx.ev;
  const w = !ev || !ev.clinvar ? waiting(ctx, 'clinvar', 'ClinVar') : null;
  if (w) {
    body.appendChild(w);
    return;
  }
  const self = ev.clinvar.self;
  if (self) {
    body.appendChild(h('div.cv-self',
      h('div.row', h('b', self.classification), stars(self.stars), h('span.small.muted', self.review)),
      h('div.small', self.conditions.length ? 'Classified for ' + self.conditions.join('; ') : 'No condition given'),
      h('div.small.muted', `${self.submissions} submission${self.submissions === 1 ? '' : 's'}${self.evaluated ? ', last evaluated ' + self.evaluated : ''}. `, ext(self.url, 'Open in ClinVar ' + (self.accession || ''))),
      h('p.small', { style: { marginTop: '6px' } }, 'Other laboratories’ classifications are evidence about the evidence. Read what they found, such as cases (PS4), functional work (PS3) or segregation, and weigh it under those criteria. ClinGen retired PP5 and BP6, which counted the classifications themselves.')));
  } else body.appendChild(h('p', 'NCBI’s search finds no ClinVar record of this variant at its position.'));
  const sr = sameResidue(ev);
  if ((ev.d && ev.d.proteinPos) || sr.others.length) {
    body.appendChild(h('h3.vsub', ev.d && ev.d.proteinPos ? `Other variants at this residue (${ev.d.proteinPos}) and position` : 'Other variants at this position'));
    const rows = sr.ps1.map((r) => Object.assign({ rel: 'Same amino acid change (PS1)' }, r)).concat(sr.pm5.map((r) => Object.assign({ rel: 'Another change at the residue (PM5)' }, r)), sr.others.map((r) => Object.assign({ rel: 'Same position' }, r)));
    body.appendChild(rows.length ? table([
      { key: 'title', label: 'Variant', fmt: (r) => h('span', h('a', { href: r.url, target: '_blank', rel: 'noopener' }, h('span.hgvs', r.hgvsc || r.title)), r.hgvsp ? h('span.hgvs.muted', ' ' + r.hgvsp) : null) },
      { key: 'rel', label: 'Relation' },
      { key: 'classification', label: 'Classification', fmt: (r) => h('span', r.classification, ' ', stars(r.stars)) }
    ], rows, { compact: true }) : h('p.muted', 'ClinVar has no other variants here.'));
  }
  const d = ev.d || {};
  const v = ctx.v;
  const q = encodeURIComponent(d.hgvsc ? d.hgvsc : `${v.chrom}-${v.pos}-${v.ref}-${v.alt}`);
  const links = [
    ['gnomAD', `https://gnomad.broadinstitute.org/variant/${v.chrom}-${v.pos}-${v.ref}-${v.alt}?dataset=${ctx.asm === 'GRCh37' ? 'gnomad_r2_1' : 'gnomad_r4'}`],
    ['ClinVar', `https://www.ncbi.nlm.nih.gov/clinvar/?term=${q}`],
    ['VarSome', `https://varsome.com/variant/${ctx.asm === 'GRCh37' ? 'hg19' : 'hg38'}/${encodeURIComponent(`${v.chrom}-${v.pos}-${v.ref}-${v.alt}`)}`],
    ['Franklin', `https://franklin.genoox.com/clinical-db/variant/snp/chr${v.chrom}-${v.pos}-${v.ref}-${v.alt}${ctx.asm === 'GRCh37' ? '' : '-hg38'}`],
    ['LitVar', d.rsid ? `https://www.ncbi.nlm.nih.gov/research/litvar2/docsum?variant=litvar@${d.rsid}%23%23&query=${d.rsid}` : `https://www.ncbi.nlm.nih.gov/research/litvar2/`],
    ['Europe PMC', `https://europepmc.org/search?query=${encodeURIComponent(`"${d.gene || ''}" AND ("${(d.hgvsc || '').split(':')[1] || ''}"${d.hgvsp ? ` OR "${d.hgvsp.replace(/^p\./, '')}"` : ''}${d.rsid ? ` OR "${d.rsid}"` : ''})`)}`],
    ['Google Scholar', `https://scholar.google.com/scholar?q=${encodeURIComponent(`"${d.gene || ''}" "${(d.hgvsc || '').split(':')[1] || ''}"`)}`],
    ['LOVD', `https://databases.lovd.nl/shared/variants/in_gene?search_geneid=${encodeURIComponent(d.gene || '')}`],
    ['Mastermind', `https://mastermind.genomenon.com/detail?gene=${encodeURIComponent(d.gene || '')}&mutation=${encodeURIComponent(d.hgvsc ? d.hgvsc.split(':')[1] : '')}`]
  ];
  body.appendChild(h('h3.vsub', 'Look further'));
  body.appendChild(h('div.ext-links', links.map(([t, u]) => ext(u, t))));
  if (d.pubmed && d.pubmed.length) {
    body.appendChild(h('details', h('summary', `${d.pubmed.length} ${d.pubmed.length === 1 ? 'paper cites' : 'papers cite'} this variant’s rsID (dbSNP, by way of VEP)`),
      h('p.small', d.pubmed.slice(0, 60).map((id, i) => [i ? ', ' : '', ext(`https://pubmed.ncbi.nlm.nih.gov/${id}/`, String(id))]))));
  }
  // papers that name the variant, from Europe PMC, when asked for (the search sends only the gene and the variant's names)
  const papers = h('div.papers', { 'aria-live': 'polite' });
  const findPapers = async (sort) => {
    const epmc = await import('../api/europepmc.js');
    const q = epmc.variantQuery({ gene: d.gene, hgvsc: d.hgvsc, hgvsp: d.hgvsp, rsid: d.rsid });
    if (!q) return;
    papers.innerHTML = '';
    papers.appendChild(loading('Asking Europe PMC…'));
    try {
      const res = await epmc.search(q, { sort });
      papers.innerHTML = '';
      papers.appendChild(h('p.small', `${fmt(res.count)} papers mention ${d.gene || 'the gene'} with one of the variant’s names (`, h('span.hgvs', q), `). ${res.count > res.papers.length ? `The ${res.papers.length} ${sort === 'recent' ? 'newest' : 'most cited'} are listed below.` : ''} `,
        btn(sort === 'recent' ? 'Most cited first' : 'Newest first', () => findPapers(sort === 'recent' ? 'cited' : 'recent'), { cls: 'small' })));
      papers.appendChild(h('ol.paper-list', res.papers.map((x) => h('li',
        ext(x.pmid ? `https://europepmc.org/article/MED/${x.pmid}` : x.doi ? `https://doi.org/${x.doi}` : `https://europepmc.org/search?query=${encodeURIComponent(x.title)}`, x.title),
        h('div.small.muted', [x.authors.length > 90 ? x.authors.slice(0, 88) + '…' : x.authors, x.journal, x.year].filter(Boolean).map((t) => String(t).replace(/\.+$/, '')).join('. ') + `.${x.cited ? ` Cited by ${fmt(x.cited)}.` : ''}${x.open ? ' Free to read.' : ''}`)))));
      papers.appendChild(h('p.small.muted', 'A mention isn’t evidence in itself. Read each paper for what it shows, such as cases for PS4 or PS2, functional work for PS3 or families for PP1, and watch out for somatic (tumour) findings when the question is about the germline.'));
    } catch (e) {
      papers.innerHTML = '';
      papers.appendChild(note('warn', h('p', 'Europe PMC didn’t answer: ' + e.message)));
    }
  };
  if (d.gene && (d.hgvsc || d.hgvsp || d.rsid)) body.appendChild(h('div', btn('Find papers that name this variant', () => findPapers('cited'), { cls: 'small', icon: 'book', title: 'Search Europe PMC for the gene with the variant’s c., p. and rsID names' }), papers));
  body.appendChild(crits(ctx, ['PS1', 'PM5', 'PS4'].concat(settings.get('showDeprecated') || framework() === 'acmg2015' ? ['PP5', 'BP6'] : [])));
  body.appendChild(sectionNote(ctx, 'clinvar'));
}

export const SECTIONS = [
  { key: 'summary', title: 'Summary', icon: 'list', deps: ['vep', 'gnomad', 'clinvar'], draw: drawSummary },
  { key: 'population', title: 'Population', icon: 'population', deps: ['gnomad', 'vep'], draw: drawPopulation },
  { key: 'type', title: 'Variant type and PVS1', icon: 'dna', deps: ['vep'], draw: drawType },
  { key: 'predictions', title: 'Predictions', icon: 'predict', deps: ['vep'], draw: drawPredictions },
  { key: 'splicing', title: 'Splicing', icon: 'splice', deps: ['vep'], draw: drawSplicing },
  { key: 'protein', title: 'Protein', icon: 'protein', deps: ['vep'], draw: drawProtein },
  { key: 'clinvar', title: 'ClinVar and literature', icon: 'clinvar', deps: ['clinvar', 'vep'], draw: drawClinvar }
];
// the rest of the sections are in variant-evidence2.js (gene, family, functional, conclusion)
import { MORE_SECTIONS } from './variant-evidence2.js';
SECTIONS.push(...MORE_SECTIONS);
