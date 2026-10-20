/* =====================================================================
   The second half of a variant's evidence sections: the gene and its
   diseases, the patient and family, functional evidence, and the
   conclusion (signed classifications, and comparing them with the
   case's answer and ClinGen's expert panels).
   ===================================================================== */
import { h, esc, icon, fmt, fmtAF, dateStr, toast } from '../core.js';
import { link, go } from '../router.js';
import * as settings from '../settings.js';
import * as db from '../db.js';
import { framework } from '../widgets/acmg-panel.js';
import { loading, note, select, field, table, btn, linkBtn, clsBadge, critChip } from '../ui.js';
import { crits, waiting, sectionNote, stars, ext, kv } from './evidence-common.js';
import { DOSAGE, dosageText, hiPredicted, tsPredicted, THRESH } from '../genes.js';
import { geneMOI, lofMechanism } from '../acmg/suggest.js';
import { denovoPoints, DENOVO_PHENO, pm3Points, PM3_ROWS, oddsPath, strengthOfPoints } from '../acmg/calculators.js';
import { labelFor, fw } from '../acmg/frameworks.js';
import { criteriaString } from '../acmg/engine.js';
import { INHERITANCE, ZYGOSITY, inheritanceText } from '../summary.js';
import { BY_CODE } from '../acmg/criteria.js';

const SW = { VS: 'very strong', S: 'strong', M: 'moderate', P: 'supporting', SA: 'stand-alone' };

/* ================================================================
   The gene and its diseases (with the patient's phenotype)
   ================================================================ */
async function drawGene(ctx, body) {
  const d = ctx.ev && ctx.ev.d;
  if (!d) {
    const w = waiting(ctx, 'vep', 'Ensembl’s VEP');
    if (w) body.appendChild(w);
    return;
  }
  const g = ctx.gene;
  if (!g) {
    body.appendChild(h('p.muted', d.gene ? `${d.gene} is not in the site’s gene table.` : 'Not in a gene.'));
    body.appendChild(crits(ctx, ['PP2', 'BP1', 'PP4']));
    return;
  }
  const moi = geneMOI(g);
  body.appendChild(h('div.gene-head', h('a.gene-big', { href: link('/gene/' + g.symbol) }, h('i', g.symbol)), h('span', g.name), h('span.muted', g.cyto || ''), moi ? h('span.tag', 'Inheritance: ' + moi) : null));
  // constraint and dosage
  body.appendChild(kv([
    ['Loss-of-function constraint (gnomAD v4.1)', g.loeuf != null ? h('span', `LOEUF ${g.loeuf.toFixed(2)}`, g.loeufDecile != null ? h('span.muted', ` (decile ${g.loeufDecile + 1} of 10)`) : null, `, pLI ${g.pLI != null ? g.pLI.toFixed(2) : '–'}`, g.lofObs != null ? h('span.muted', `; ${g.lofObs} loss-of-function variants seen, ${g.lofExp} expected`) : null) : null],
    ['Missense constraint', g.misZ != null ? `Z ${g.misZ.toFixed(2)}${g.misZ > THRESH.misZ ? ' (above 3.09: few missense variants tolerated)' : ''}; observed/expected ${g.misOE != null ? g.misOE.toFixed(2) : '–'}` : null],
    ['ClinGen dosage', `Haploinsufficiency ${g.hi != null ? g.hi + ' (' + dosageText(g.hi).toLowerCase() + ')' : 'not curated'}; triplosensitivity ${g.ts != null ? g.ts + ' (' + dosageText(g.ts).toLowerCase() + ')' : 'not curated'}`],
    ['Predicted dosage sensitivity', g.pHaplo != null ? `pHaplo ${g.pHaplo.toFixed(2)}${g.pHaplo >= THRESH.pHaplo ? ' (likely haploinsufficient)' : ''}, pTriplo ${g.pTriplo != null ? g.pTriplo.toFixed(2) : '–'} (Collins et al. 2022)` : null]
  ]));
  // gene–disease curations
  if ((g.validity || []).length) {
    body.appendChild(h('h3.vsub', 'ClinGen gene–disease validity'));
    body.appendChild(table([
      { key: 'disease', label: 'Disease', fmt: (r) => ext(r.url, r.disease) },
      { key: 'moi', label: 'Inheritance' },
      { key: 'classification', label: 'Validity', fmt: (r) => h('span.tag' + (/Definitive|Strong/.test(r.classification) ? '.ok' : /Moderate/.test(r.classification) ? '' : '.warn'), r.classification) },
      { key: 'date', label: 'Date' }
    ], g.validity, { compact: true }));
  }
  if ((g.g2p || []).length) {
    body.appendChild(h('h3.vsub', 'Gene2Phenotype'));
    body.appendChild(table([
      { key: 'disease', label: 'Disease', fmt: (r) => ext(r.url, r.disease) },
      { key: 'allelic', label: 'Allelic requirement', fmt: (r) => String(r.allelic || '').replace(/_/g, ' ') },
      { key: 'mechanism', label: 'Mechanism' },
      { key: 'confidence', label: 'Confidence' },
      { key: 'panels', label: 'Panels' }
    ], g.g2p, { compact: true }));
  }
  // PanelApp, the HPO's diseases and the expert panel's rules arrive from elsewhere
  const live = h('div');
  body.appendChild(live);
  const phenoBox = h('div');
  body.appendChild(phenoBox);
  const matchBox = h('div');
  body.appendChild(matchBox);
  body.appendChild(crits(ctx, ['PP2', 'BP1', 'PP4']));
  body.appendChild(sectionNote(ctx, 'gene'));
  const [panels, hpo, cspec] = await Promise.all([import('../panels.js'), import('../hpo.js'), import('../api/cspec.js')]);
  // ClinGen expert panel rules for the gene
  cspec.forGene(g.symbol).then((sets) => {
    ctx.vcep = sets;
    if (!sets.length) return;
    const box = h('div.note.ok', h('p', h('b', `ClinGen expert panel rules for ${g.symbol}: `), sets.map((s, i) => [i ? '; ' : '', ext(s.url, `${s.panel}, version ${s.version}`)]), '. They change some criteria for this gene (thresholds, strengths); the criteria’s guides show them.'));
    live.prepend(box);
    cspec.ruleSet(sets[0].id).then((rs) => {
      ctx.vcepRules = rs;
      ctx.cls.vcep = rs;
      ctx.cls.changed(null, true);
    }).catch(() => null);
  }).catch(() => null);
  // PanelApp
  const pa = h('div', loading('Asking PanelApp…'));
  live.appendChild(h('h3.vsub', 'Genomics England PanelApp'));
  live.appendChild(pa);
  panels.panelsOfGene(g.symbol).then((list) => {
    pa.innerHTML = '';
    if (!list.length) {
      pa.appendChild(h('p.muted', 'Not on any PanelApp panel.'));
      return;
    }
    const mine = ctx.pt && ctx.pt.test && ctx.pt.test.panel ? ctx.pt.test.panel.id : null;
    const sorted = list.slice().sort((a, b) => (b.id === mine) - (a.id === mine) || b.rating - a.rating);
    pa.appendChild(table([
      { key: 'panel', label: 'Panel', fmt: (r) => h('span', ext(`https://panelapp.genomicsengland.co.uk/panels/${r.id}/gene/${g.symbol}/`, r.panel), r.id === mine ? h('span.tag.accent', { style: { marginLeft: '6px' } }, 'the patient’s test') : null) },
      { key: 'rating', label: 'Rating', fmt: (r) => h('span.tag.' + (r.rating >= 3 ? 'ok' : r.rating === 2 ? 'warn' : 'bad'), panels.RATING[Math.min(3, r.rating)].word) },
      { key: 'moi', label: 'Inheritance', fmt: (r) => String(r.moi || '').replace(/^([^,]+).*/, '$1') }
    ], sorted.slice(0, 12), { compact: true }));
    if (sorted.length > 12) pa.appendChild(h('p.small.muted', `and ${sorted.length - 12} more panels.`));
  }).catch((e) => {
    pa.innerHTML = '';
    pa.appendChild(h('p.small.muted', 'PanelApp did not answer: ' + e.message));
  });
  // the HPO's diseases of the gene, and the patient's phenotype
  try {
    await hpo.loadDiseases();
    const ds = await hpo.diseasesOfGene(g.symbol);
    phenoBox.appendChild(h('h3.vsub', 'Diseases of the gene (HPO annotations)'));
    if (!ds.length) phenoBox.appendChild(h('p.muted', 'The HPO has no diseases annotated to this gene.'));
    const obs = ctx.pt ? (ctx.pt.phenotypes || []).filter((t) => t.observed !== false).map((t) => t.id) : [];
    const rows = ds.map((dz) => {
      const sim = obs.length ? hpo.similarity(obs, dz.pheno.keys()) : null;
      return { dz, sim, inh: dz.inh.map((n) => hpo.name(n)).join(', ') };
    }).sort((a, b) => (b.sim ? b.sim.score : 0) - (a.sim ? a.sim.score : 0));
    phenoBox.appendChild(table([
      { key: 'name', label: 'Disease', fmt: (r) => h('span', r.dz.id.startsWith('OMIM') ? ext(`https://omim.org/entry/${r.dz.id.slice(5)}`, r.dz.name) : r.dz.id.startsWith('ORPHA') ? ext(`https://www.orpha.net/en/disease/detail/${r.dz.id.slice(6)}`, r.dz.name) : r.dz.name, h('span.hpo-id', ' ' + r.dz.id)) },
      { key: 'inh', label: 'Inheritance' },
      { key: 'n', label: 'Features', num: true, fmt: (r) => fmt(r.dz.pheno.size) },
      obs.length ? { key: 'sim', label: 'Fit to the patient', num: true, fmt: (r) => (r.sim ? r.sim.score.toFixed(1) : '–') } : null
    ].filter(Boolean), rows, { compact: true }));
    if (obs.length && rows.length) {
      const best = rows[0];
      const ranked = await hpo.rankDiseases(obs, (ctx.pt.phenotypes || []).filter((t) => t.observed === false).map((t) => t.id), { limit: 300 });
      const rank = ranked.findIndex((r) => r.disease.id === best.dz.id);
      ctx.calc.pheno = { disease: best.dz.name, rank: rank >= 0 ? rank + 1 : null, score: best.sim.score, specific: false };
      const m = best.sim.matches.slice().sort((a, b) => b.ic - a.ic);
      phenoBox.appendChild(h('div.pheno-fit',
        h('p', `The patient’s ${obs.length} observed features fit `, h('b', best.dz.name), ` best (score ${best.sim.score.toFixed(1)}${rank >= 0 ? `; ranked ${rank + 1} of all ${fmt((await hpo.loadDiseases()).length)} diseases for this phenotype` : ''}).`),
        h('ul.small', m.map((x) => h('li', h('b', hpo.name(x.patient)), x.exact ? ' – in the disease' : x.via && x.via !== 118 ? ` – shares “${hpo.name(x.via)}” with the disease` : ' – not in the disease')))));
      phenoBox.appendChild(h('p.small.muted', 'PP4 is for a phenotype highly specific for the gene: a close fit to a recognisable disease, with other causes looked for. A non-specific phenotype (e.g. developmental delay alone) fits many genes and is not evidence.'));
      ctx.refreshSuggestions();
    } else if (!ctx.pt) phenoBox.appendChild(h('p.small.muted', 'Open the variant from a patient to compare their phenotype with these diseases.'));
    else phenoBox.appendChild(h('p.small.muted', 'Add the patient’s phenotypes (HPO terms) to compare them with these diseases.'));
  } catch (e) {
    phenoBox.appendChild(h('p.small.muted', 'The HPO’s annotations could not be loaded: ' + e.message));
  }
  // the other patients in this browser with a variant in the gene (the same variant first), and the phenotypes they share
  try {
    const all = (await db.allVariants()).filter((x) => x.gene === g.symbol && x.id !== ctx.v.id && x.patientId && x.patientId !== (ctx.pt && ctx.pt.id));
    if (all.length) {
      const pts = new Map((await db.listPatients()).map((p) => [p.id, p]));
      const mine = new Set(ctx.pt ? (ctx.pt.phenotypes || []).filter((t) => t.observed !== false).map((t) => t.id) : []);
      const key = (x) => `${x.assembly || 'GRCh38'}:${x.chrom}-${x.pos}-${x.ref}-${x.alt}`;
      const here = key(ctx.v);
      const { summariseVariant } = await import('../summary.js');
      const rows = all.filter((x) => pts.has(x.patientId)).map((x) => {
        const p = pts.get(x.patientId);
        const terms = (p.phenotypes || []).filter((t) => t.observed !== false);
        return { x, p, s: summariseVariant(x), same: key(x) === here, terms, shared: terms.filter((t) => mine.has(t.id)).length };
      }).sort((a, b) => b.same - a.same || b.shared - a.shared);
      matchBox.appendChild(h('h3.vsub', `Other patients in this browser with a variant in ${g.symbol}`));
      matchBox.appendChild(table([
        { key: 'p', label: 'Patient', fmt: (r) => h('a', { href: link('/patient/' + r.p.id) }, `Patient ${r.p.id}`, r.p.ref ? h('span.small.muted', ' ' + r.p.ref) : null) },
        { key: 'v', label: 'Variant', fmt: (r) => h('span', h('a.hgvs', { href: link(`/patient/${r.p.id}/variant/${r.x.id}`) }, r.s.short), r.same ? h('span.tag.accent', { style: { marginLeft: '6px' } }, 'the same variant') : null) },
        { key: 'c', label: 'Class', fmt: (r) => clsBadge(r.s.cls, { short: true, empty: '–' }) },
        { key: 'i', label: 'Inheritance', fmt: (r) => inheritanceText(r.x.inheritance) },
        { key: 't', label: 'Phenotypes (shared in bold)', fmt: (r) => (r.terms.length ? h('span.small', r.terms.slice(0, 8).map((t, i) => [i ? ', ' : '', mine.has(t.id) ? h('b', t.name) : t.name]), r.terms.length > 8 ? '…' : '') : h('span.faint', 'none recorded')) }
      ], rows.slice(0, 20), { compact: true, caption: `Other patients with ${g.symbol} variants` }));
    }
  } catch (e) {
    /* the other patients are a help, not a need */
  }
}

/* ================================================================
   The patient and the family: inheritance, de novo, in trans, segregation
   ================================================================ */
async function drawFamily(ctx, body) {
  const { v, pt } = ctx;
  const calc = ctx.calc;
  if (pt) {
    const zyg = select(ZYGOSITY, v.zygosity || 'heterozygous', { 'aria-label': 'Zygosity' });
    const inh = select(INHERITANCE, v.inheritance || 'unknown', { 'aria-label': 'Inheritance' });
    const vaf = h('input', { type: 'number', min: 0, max: 100, step: 1, placeholder: '%', value: v.vaf != null ? v.vaf : '' });
    const upd = () => {
      v.zygosity = zyg.value;
      v.inheritance = inh.value;
      v.vaf = vaf.value === '' ? null : +vaf.value;
      syncDenovo();
      ctx.save(`Genotype: ${v.zygosity}, ${inheritanceText(v.inheritance).toLowerCase()}`);
      drawDenovo();
      ctx.refreshSuggestions();
    };
    [zyg, inh, vaf].forEach((el) => el.addEventListener('change', upd));
    body.appendChild(h('div.fields', field('Zygosity in the patient', zyg), field('How the patient got it', inh), field('Variant allele fraction', vaf, 'From the reads, if known (mosaicism)')));
  } else body.appendChild(note('', h('p', 'Looked up, not a patient’s variant: the calculators below work with published cases. Add the variant to a patient to use their family.')));

  /* ---------- de novo ---------- */
  calc.denovo = calc.denovo || { cases: [] };
  const syncDenovo = () => {
    const own = calc.denovo.cases.find((c) => c.own);
    const isDn = v.inheritance === 'denovo-confirmed' || v.inheritance === 'denovo-assumed' || v.inheritance === 'denovo-mosaic';
    if (pt && isDn && !own) calc.denovo.cases.unshift({ own: true, label: `Patient ${pt.id}`, confirmed: v.inheritance === 'denovo-confirmed', pheno: 'consistent' });
    if (own && !isDn) calc.denovo.cases = calc.denovo.cases.filter((c) => !c.own);
    if (own && isDn) own.confirmed = v.inheritance === 'denovo-confirmed';
  };
  syncDenovo();
  const dnBox = h('div');
  const drawDenovo = () => {
    dnBox.innerHTML = '';
    const rows = calc.denovo.cases;
    const list = h('div.calc-rows');
    rows.forEach((c, i) => {
      const conf = select([['1', 'Confirmed (parentage confirmed)'], ['0', 'Assumed (parentage not confirmed)']], c.confirmed ? '1' : '0', { 'aria-label': 'Confirmed or assumed' });
      const ph = select(DENOVO_PHENO.map((r) => [r.key, r.label]), c.pheno || 'consistent', { 'aria-label': 'Phenotype' });
      const lab = h('input', { type: 'text', value: c.label || '', placeholder: 'Who (e.g. PMID 12345678, patient 2)', disabled: c.own || null });
      const del = c.own ? null : h('button.icon-btn', { type: 'button', 'aria-label': 'Remove', html: icon('x') });
      const sync = () => {
        c.confirmed = conf.value === '1';
        c.pheno = ph.value;
        c.label = lab.value;
        commit();
      };
      [conf, ph, lab].forEach((el) => el.addEventListener('change', sync));
      if (del) del.addEventListener('click', () => { rows.splice(i, 1); commit(); drawDenovo(); });
      list.appendChild(h('div.calc-row', lab, conf, ph, del));
    });
    const add = btn('Add a published or other case', () => {
      rows.push({ label: '', confirmed: true, pheno: 'consistent' });
      drawDenovo();
    }, { cls: 'small', icon: 'plus' });
    const res = denovoPoints(rows);
    calc.denovo.points = res.points;
    calc.denovo.anyConfirmed = res.anyConfirmed;
    calc.denovo.summary = rows.map((r) => `${r.label || 'a case'}: ${r.confirmed ? 'confirmed' : 'assumed'}`).join('; ');
    const code = res.anyConfirmed ? 'PS2' : 'PM6';
    dnBox.append(rows.length ? list : h('p.small.muted', 'No de novo occurrences. If the patient’s variant is de novo, say so above; add published de novo cases here.'), h('div.btn-row', add),
      h('p.calc-result', `${res.points} ${res.points === 1 ? 'point' : 'points'}`, res.strength ? [': ', critChip(code, res.strength), ` (${SW[res.strength]})`] : rows.length ? ': not enough for PS2 or PM6' : ''));
  };
  const commit = () => {
    const res = denovoPoints(calc.denovo.cases);
    calc.denovo.points = res.points;
    calc.denovo.anyConfirmed = res.anyConfirmed;
    ctx.save();
    ctx.refreshSuggestions();
    const r = dnBox.querySelector('.calc-result');
    if (r) {
      r.innerHTML = '';
      const code = res.anyConfirmed ? 'PS2' : 'PM6';
      r.append(`${res.points} ${res.points === 1 ? 'point' : 'points'}`, res.strength ? ': ' : '', res.strength ? critChip(code, res.strength) : '', res.strength ? ` (${SW[res.strength]})` : '');
    }
  };
  drawDenovo();
  body.appendChild(h('details.calc', { open: calc.denovo.cases.length ? true : null }, h('summary', h('span', { html: icon('calc') }), 'De novo occurrences: ClinGen’s points (PS2, PM6)'),
    h('p.small.muted', 'Each de novo occurrence earns points by how well the person’s phenotype fits the gene, and whether parentage was confirmed (ClinGen SVI recommendation 1.1). 0.5 points is supporting, 1 moderate, 2 strong, 4 very strong. The code is PS2 if any occurrence is confirmed, PM6 if none is.'), dnBox));

  /* ---------- in trans ---------- */
  calc.pm3 = calc.pm3 || { obs: [] };
  const pmBox = h('div');
  let others = [];
  if (pt) {
    const vs = await db.variantsOf(pt.id);
    others = vs.filter((x) => x.id !== v.id && x.gene && x.gene === v.gene && x.kind !== 'cnv');
  }
  const drawPm3 = () => {
    pmBox.innerHTML = '';
    if (others.length) pmBox.appendChild(note('', h('p', `The patient has ${others.length === 1 ? 'another variant' : others.length + ' other variants'} in ${v.gene}: `, others.map((o, i) => [i ? ', ' : '', h('a', { href: link(`/patient/${pt.id}/variant/${o.id}`) }, h('span.hgvs', (o.hgvsc || '').split(':').pop() || o.input)), o.classification && o.classification.saved ? [' (', clsBadge(o.classification.saved.cls, { short: true }), ')'] : '']), '. If the parents’ results show the two are on different copies, that is “in trans”.')));
    const list = h('div.calc-rows');
    calc.pm3.obs.forEach((o, i) => {
      const k = select(PM3_ROWS.map((r) => [r.key, `${r.label} (${r.points})`]), o.key || 'P-trans', { 'aria-label': 'Observation' });
      const lab = h('input', { type: 'text', value: o.label || '', placeholder: 'Who (e.g. this patient, PMID 12345678)' });
      const del = h('button.icon-btn', { type: 'button', 'aria-label': 'Remove', html: icon('x') });
      k.addEventListener('change', () => { o.key = k.value; commitPm3(); });
      lab.addEventListener('change', () => { o.label = lab.value; commitPm3(); });
      del.addEventListener('click', () => { calc.pm3.obs.splice(i, 1); commitPm3(); drawPm3(); });
      list.appendChild(h('div.calc-row', lab, k, del));
    });
    pmBox.appendChild(calc.pm3.obs.length ? list : h('p.small.muted', 'For recessive disorders: add each affected person in whom the variant was found with another variant.'));
    pmBox.appendChild(h('div.btn-row', btn('Add an observation', () => { calc.pm3.obs.push({ key: 'P-trans', label: calc.pm3.obs.length ? '' : (pt ? `Patient ${pt.id}` : '') }); drawPm3(); commitPm3(); }, { cls: 'small', icon: 'plus' })));
    const r = pm3Points(calc.pm3.obs);
    pmBox.appendChild(h('p.calc-result', `${r.points} ${r.points === 1 ? 'point' : 'points'}`, r.strength ? [': ', critChip('PM3', r.strength), ` (${SW[r.strength]})`] : ''));
  };
  const commitPm3 = () => {
    const r = pm3Points(calc.pm3.obs);
    calc.pm3.points = r.points;
    ctx.save();
    ctx.refreshSuggestions();
    const el = pmBox.querySelector('.calc-result');
    if (el) {
      el.innerHTML = '';
      el.append(`${r.points} ${r.points === 1 ? 'point' : 'points'}`, r.strength ? ': ' : '', r.strength ? critChip('PM3', r.strength) : '', r.strength ? ` (${SW[r.strength]})` : '');
    }
  };
  drawPm3();
  body.appendChild(h('details.calc', { open: calc.pm3.obs.length || others.length ? true : null }, h('summary', h('span', { html: icon('calc') }), 'In trans with another variant: ClinGen’s points (PM3)'),
    h('p.small.muted', 'For recessive disorders (ClinGen SVI recommendation 1.0). Both variants must be rare. 0.5 points is supporting, 1 moderate, 2 strong, 4 very strong.'), pmBox));

  /* ---------- segregation ---------- */
  const segBox = h('div');
  body.appendChild(h('details.calc', { open: true }, h('summary', h('span', { html: icon('segregation') }), 'Segregation in the family (PP1, BS4)'), segBox));
  if (!pt) segBox.appendChild(h('p.small.muted', 'Segregation needs the patient’s family: add the variant to a patient, then draw the pedigree and give relatives’ genotypes on the Family tab.'));
  else if (!pt.pedigree || !(pt.pedigree.persons || []).length) segBox.appendChild(h('p', 'No pedigree yet. ', h('a', { href: link(`/patient/${pt.id}/family`) }, 'Draw the family'), ' and give relatives’ genotypes for this variant; the likelihood ratio appears here.'));
  else {
    const seg = await import('../acmg/segregation.js');
    let fam;
    try {
      fam = seg.readDrawing(pt.pedigree);
    } catch (e) {
      segBox.appendChild(note('bad', h('p', 'The pedigree could not be read: ' + e.message)));
    }
    if (fam) {
      const proband = (fam.people.find((p) => p.proband) || {}).id || pt.probandPerson;
      const gts = Object.assign({}, v.familyGenotypes || {});
      if (proband && !gts[proband]) gts[proband] = v.zygosity === 'homozygous' ? 'hom' : v.zygosity === 'hemizygous' ? 'hemi' : 'het';
      const tested = Object.entries(gts).filter(([k, g]) => g && g !== 'untested' && k !== proband);
      const cond = fam.conditions[0];
      calc.segModel = calc.segModel || { mode: startMode(ctx, others), penetrance: 0.9, phenocopy: 0.001, families: 'one' };
      const mm = calc.segModel;
      const mode = select([['AD', 'Autosomal dominant'], ['AR', 'Autosomal recessive'], ['XLR', 'X-linked recessive'], ['XLD', 'X-linked dominant']], mm.mode);
      const pen = h('input', { type: 'number', min: 0.05, max: 1, step: 0.05, value: mm.penetrance });
      const phc = h('input', { type: 'number', min: 0, max: 0.5, step: 0.001, value: mm.phenocopy });
      const res = h('div');
      const run = () => {
        Object.assign(mm, { mode: mode.value, penetrance: Math.min(1, Math.max(0.05, +pen.value || 0.9)), phenocopy: Math.max(0, +phc.value || 0) });
        if (mm.phenocopy >= mm.penetrance) mm.phenocopy = mm.penetrance / 10;
        const af = ctx.ev && ctx.ev.gnomad && ctx.ev.gnomad.found ? ((ctx.ev.gnomad.joint || ctx.ev.gnomad.exome || ctx.ev.gnomad.genome || {}).af || 0) : 0;
        const q = Math.max(1e-6, Math.min(0.05, af || 1e-5));
        res.innerHTML = '';
        if (!cond) {
          res.appendChild(note('warn', h('p', 'Shade the affected people in the pedigree (and name the condition in its key), so that the analysis knows who is affected.')));
          return;
        }
        const r = seg.cosegregation({ family: fam, conditionKey: cond.key, probandId: proband, genotypes: gts, model: { mode: mm.mode, penetrance: mm.penetrance, phenocopy: mm.phenocopy, q, families: mm.families }, unrecorded: 'unknown' });
        calc.seg = r.ok ? { ok: true, lr: r.lr, lod: r.lod, meioses: r.meioses, direction: r.direction, strength: r.strength, counts: r.counts } : { ok: false };
        if (!r.ok) {
          res.appendChild(h('p', r.message));
          ctx.save();
          ctx.refreshSuggestions();
          return;
        }
        const st = r.strength || {};
        res.append(
          h('p.calc-result', `Likelihood ratio ${r.lr >= 1000 ? fmt(r.lr, 0) : r.lr >= 1 ? r.lr.toFixed(2) : r.lr.toExponential(1)}`, isFinite(r.lod) ? `, LOD ${r.lod.toFixed(2)}` : '', isFinite(r.meioses) && r.lr >= 1 ? ` (as many as ${r.meioses.toFixed(1)} informative meioses)` : ''),
          r.direction === 'for'
            ? h('p', st.jarvik || st.bayes ? ['The family supports co-segregation: ', st.jarvik ? [critChip('PP1', st.jarvik), ' by meiosis counting (Jarvik and Browning)'] : 'not enough meioses for PP1 by counting', st.bayes ? ['; ', critChip('PP1', st.bayes === 'VS' ? 'S' : st.bayes), ' by Tavtigian’s odds'] : ''] : 'The family fits co-segregation, but too weakly for PP1.')
            : h('p', 'The family argues against the variant causing the disease: ', st.bayes ? critChip('BS4', st.bayes === 'M' ? 'P' : st.bayes) : 'weakly', '.'),
          h('p.small.muted', segCounts(r.counts), `${r.counts.untestedAffected ? ` ${r.counts.untestedAffected} affected relatives were not tested.` : ''} The ratio compares the chance of the relatives’ genotypes, given everyone’s phenotypes, if the variant causes the disease (with the penetrance and phenocopy rate above) and if it doesn’t, starting from the proband having it. The variant’s frequency (${fmtAF(q)}) is from gnomAD.`));
        ctx.save();
        ctx.refreshSuggestions();
      };
      [mode, pen, phc].forEach((el) => el.addEventListener('change', run));
      segBox.append(
        h('p', `${tested.length} relative${tested.length === 1 ? '' : 's'} with a genotype for this variant. `, h('a', { href: link(`/patient/${pt.id}/family`) }, 'Give genotypes on the Family tab'), '.'),
        h('div.fields', field('Inheritance', mode), field('Penetrance', pen, 'chance a carrier is affected'), field('Phenocopy rate', phc, 'chance a non-carrier is affected')),
        res);
      run();
    }
  }
  body.appendChild(crits(ctx, ['PS2', 'PM6', 'PM3', 'PP1', 'BS4', 'BP2', 'BP5']));
  body.appendChild(sectionNote(ctx, 'family'));
}
const moiMode = (moi) => (moi === 'AR' ? 'AR' : moi === 'XL' ? 'XLR' : 'AD');
/** the inheritance to start the segregation model with: the gene's, and for a gene with both dominant and recessive
    disorders, recessive when the patient has two copies, got it from both parents, or has another variant in the gene */
export function startMode(ctx, others = []) {
  const moi = geneMOI(ctx.gene) || '';
  if (!/\//.test(moi)) return moiMode(moi);
  const v = ctx.v || {};
  if (/AR/.test(moi) && (v.zygosity === 'homozygous' || v.inheritance === 'biparental' || others.length)) return 'AR';
  return /AD/.test(moi) ? 'AD' : /XL/.test(moi) ? 'XLR' : 'AR';
}
/** who in the family fits and who doesn't, in words that suit the model */
function segCounts(c) {
  const n = (k) => c[k] || 0;
  if (c.mode === 'AR' || c.mode === 'XLR') {
    const two = c.mode === 'AR' ? 'have both copies affected' : 'have the disease genotype (a man with it, or a woman with two copies)';
    return `${n('affectedCarriers')} affected relatives ${two}, and ${n('unaffectedNonCarriers')} unaffected relatives don’t (one copy or none: carriers are expected to be well); ${n('affectedNonCarriers')} affected relatives lack it and ${n('unaffectedCarriers')} unaffected ones have it.`;
  }
  return `${n('affectedCarriers')} affected relatives carry it, ${n('unaffectedNonCarriers')} unaffected relatives don’t; ${n('affectedNonCarriers')} affected relatives don’t carry it and ${n('unaffectedCarriers')} unaffected ones do.`;
}

/* ================================================================
   Functional evidence
   ================================================================ */
function drawFunctional(ctx, body) {
  const calc = (ctx.calc.func = ctx.calc.func || { assay: '', readout: 'abnormal', path: '', benign: '' });
  const assay = h('input', { type: 'text', value: calc.assay, placeholder: 'e.g. yeast transactivation assay (PMID 12826609)' });
  const readout = select([['abnormal', 'Abnormal: shows a damaging effect'], ['normal', 'Normal: no damaging effect']], calc.readout);
  const pc = h('input', { type: 'number', min: 0, step: 1, value: calc.path, placeholder: 'e.g. 12' });
  const bc = h('input', { type: 'number', min: 0, step: 1, value: calc.benign, placeholder: 'e.g. 15' });
  const out = h('div');
  const run = () => {
    Object.assign(calc, { assay: assay.value.trim(), readout: readout.value, path: pc.value, benign: bc.value });
    out.innerHTML = '';
    if (!pc.value && !bc.value) {
      calc.result = null;
      out.appendChild(h('p.small.muted', 'Give the numbers of pathogenic and benign control variants the assay was validated with, as the paper reports them.'));
    } else {
      const r = oddsPath({ pathControls: +pc.value, benignControls: +bc.value, readout: readout.value });
      if (!r.odds) {
        calc.result = null;
        out.appendChild(h('p', r.message));
      } else {
        calc.result = r.strength ? { code: r.strength.code, strength: r.strength.strength, odds: r.odds } : null;
        out.append(h('p.calc-result', `OddsPath ${r.odds.toFixed(2)}`, r.strength ? [': ', critChip(r.strength.code, r.strength.strength), ` (${SW[r.strength.strength]})`] : ': indeterminate (between 0.48 and 2.1)'),
          r.strength && r.strength.capped ? h('p.small', 'With 10 controls or fewer, Brnich et al. allow supporting strength at most.') : null,
          h('p.small.muted', `From ${r.controls} controls: the chance that a variant is pathogenic before the assay (${(r.P1 * 100).toFixed(0)}% of the controls) and after this readout (${(r.P2 * 100).toFixed(0)}%), assuming one control misclassified so the odds are finite (Brnich et al. 2019).`));
      }
    }
    ctx.save();
    ctx.refreshSuggestions();
  };
  [assay, readout, pc, bc].forEach((el) => el.addEventListener('change', run));
  body.appendChild(h('p', 'Functional evidence comes from the literature: an assay that tests the function the disease depends on, validated with variants already known to be pathogenic and benign. Patient-derived RNA showing aberrant splicing goes under PVS1 or PS3 for splicing (Walker et al. 2023).'));
  body.appendChild(h('details.calc', { open: calc.path || calc.benign ? true : null }, h('summary', h('span', { html: icon('calc') }), 'How strong is the assay? The OddsPath calculator (PS3, BS3)'),
    h('div.fields', field('Assay', assay, null, { span: true }), field('Readout for this variant', readout), field('Pathogenic controls', pc), field('Benign controls', bc)), out));
  run();
  body.appendChild(crits(ctx, ['PS3', 'BS3']));
  body.appendChild(sectionNote(ctx, 'functional'));
}

/* ================================================================
   Conclusion: signed classifications, and comparing them
   ================================================================ */
async function drawConclusion(ctx, body) {
  const { v, cls } = ctx;
  // the class so far, kept up to date as criteria are marked
  const top = h('div.concl', { 'aria-live': 'polite' });
  const drawTop = () => {
    const r = cls.result();
    const F = framework();
    const met = r.met;
    const evaluated = Object.entries(cls.state.criteria).filter(([, c]) => c.evaluated && !c.met).map(([k]) => k);
    top.innerHTML = '';
    top.append(
      h('div.row', clsBadge(r.cls, { big: true, band: r.band }), h('span.res-pts', `${r.points > 0 ? '+' : ''}${r.points} ${Math.abs(r.points) === 1 ? 'point' : 'points'}`), h('span.small.muted', `${fw(F).label}`)),
      h('p', met.length ? h('span.hgvs', criteriaString(met, F)) : h('span.muted', 'No criteria met yet.')),
      evaluated.length ? h('p.small.muted', 'Looked at and not met: ', evaluated.sort().join(', ')) : null);
  };
  drawTop();
  let seen = false;
  const off = cls.on(() => {
    if (top.isConnected) {
      seen = true;
      drawTop();
    } else if (seen) off();
  });
  body.appendChild(top);
  const hist = (v.classification && v.classification.history) || [];
  if (hist.length) {
    body.appendChild(h('h3.vsub', 'Signed classifications'));
    body.appendChild(table([
      { key: 'at', label: 'When', fmt: (x) => dateStr(x.at, true) },
      { key: 'by', label: 'Who' },
      { key: 'cls', label: 'Class', fmt: (x) => h('span', clsBadge(x.cls, { short: true }), x.calculated && x.calculated !== x.cls ? h('span.small.muted', ` (calculated ${x.calculated.toUpperCase()})`) : null) },
      { key: 'criteria', label: 'Criteria', fmt: (x) => h('span.hgvs.small', x.criteria || '–') },
      { key: 'reason', label: 'Reason for a change', fmt: (x) => x.reason || '' }
    ], hist, { compact: true }));
  } else if (v.patientId) body.appendChild(h('p.small.muted', 'Not signed yet: “Sign the classification”, beside the criteria, records it with your name and the date.'));

  // the case's answer
  const exp = v.expected;
  if (exp) {
    const box = h('div.compare');
    body.appendChild(h('h3.vsub', 'The case’s answer'));
    body.appendChild(box);
    if (!(settings.CFG.allowCompare !== false)) box.appendChild(h('p.muted', 'Comparing with the answer is switched off on this site.'));
    else if (!hist.length) box.appendChild(h('p.muted', 'Sign your classification first; then you can compare it with the answer the case’s author gave.'));
    else {
      const showBtn = btn('Compare with the case’s answer', () => {
        showBtn.remove();
        box.appendChild(compareTable(cls, exp.criteria || [], exp.cls, exp.source || 'the case’s author', exp.notes || {}));
      }, { cls: 'primary small', icon: 'scale' });
      box.appendChild(showBtn);
    }
  }
  // ClinGen's expert panels
  const caid = ctx.ev && ctx.ev.gnomad && ctx.ev.gnomad.caid;
  if (caid) {
    const box = h('div', loading('Looking for an expert panel’s classification in ClinGen’s Evidence Repository…'));
    body.appendChild(h('h3.vsub', 'ClinGen expert panels'));
    body.appendChild(box);
    const er = await import('../api/erepo.js');
    er.byCaid(caid).then((list) => {
      box.innerHTML = '';
      if (!list.length) {
        box.appendChild(h('p.muted', `No ClinGen expert panel has classified this variant (ClinGen allele ${er.normCaid(caid) || caid}).`));
        return;
      }
      for (const x of list) {
        const panelBox = h('div.compare');
        const metCodes = x.codes.filter((c) => c.status === 'Met').map((c) => c.label);
        panelBox.appendChild(h('p', h('b', x.panel), `: ${x.outcome} for ${x.condition}. `, h('span.small.muted', x.guideline)));
        const reveal = btn(hist.length ? 'Compare with the expert panel' : 'Show the expert panel’s criteria', async () => {
          reveal.remove();
          const why = await er.reasons(x.uuid).catch(() => ({}));
          const exp = metCodes.map((l) => er.parseCode(l));
          panelBox.appendChild(compareTable(cls, exp.map((e) => (e.strength ? `${e.code}_${{ VS: 'VeryStrong', S: 'Strong', M: 'Moderate', P: 'Supporting', SA: 'StandAlone' }[e.strength]}` : e.code)), outcomeKey(x.outcome), x.panel, why, x.codes.filter((c) => c.status !== 'Met').map((c) => er.parseCode(c.label).code)));
        }, { cls: 'small', icon: 'scale' });
        if (!hist.length) panelBox.appendChild(h('p.small.muted', 'Try it yourself first: sign your classification, then compare.'));
        panelBox.appendChild(reveal);
        box.appendChild(panelBox);
      }
    }).catch((e) => {
      box.innerHTML = '';
      box.appendChild(h('p.small.muted', 'ClinGen’s Evidence Repository did not answer: ' + e.message));
    });
  }
}
const outcomeKey = (s) => ({ 'Pathogenic': 'p', 'Likely Pathogenic': 'lp', 'Likely pathogenic': 'lp', 'Uncertain Significance': 'vus', 'Uncertain significance': 'vus', 'Likely Benign': 'lb', 'Likely benign': 'lb', 'Benign': 'b' })[s] || null;

/** the student's criteria beside someone else's: which agree, which differ in strength, which are missing */
function compareTable(cls, theirs, theirCls, who, why = {}, theirNotMet = []) {
  const W = { VeryStrong: 'VS', Strong: 'S', Moderate: 'M', Supporting: 'P', StandAlone: 'SA' };
  const parse = (s) => {
    const m = /^([PB](?:VS|S|M|P|A)\d)(?:_(\w+))?$/.exec(s);
    return m ? { code: m[1], strength: m[2] ? W[m[2]] || m[2] : BY_CODE[m[1]] ? BY_CODE[m[1]].def : null } : null;
  };
  const T = new Map(theirs.map(parse).filter(Boolean).map((x) => [x.code, x.strength]));
  const mine = new Map(cls.result().met.map((m) => [m.code, m.strength]));
  const codes = Array.from(new Set([...T.keys(), ...mine.keys()])).sort((a, b) => Object.keys(BY_CODE).indexOf(a) - Object.keys(BY_CODE).indexOf(b));
  const rows = codes.map((c) => {
    const t = T.get(c), m = mine.get(c);
    const status = t && m ? (t === m ? 'Agree' : 'Different strength') : t ? 'You did not apply it' : theirNotMet.includes(c) ? 'They found it not met' : 'They did not apply it';
    return { c, t, m, status, why: why[c] || '' };
  });
  const r = cls.result();
  const agree = rows.filter((x) => x.status === 'Agree').length;
  return h('div',
    h('p', 'Your class: ', clsBadge(r.cls, { short: true }), `; ${who}’s: `, theirCls ? clsBadge(theirCls, { short: true }) : 'not given', `. ${agree} of ${rows.length} criteria agree.`),
    table([
      { key: 'c', label: 'Criterion', fmt: (x) => h('b.hgvs', x.c) },
      { key: 'm', label: 'Yours', fmt: (x) => (x.m ? critChip(x.c, x.m) : h('span.faint', '–')) },
      { key: 't', label: who, fmt: (x) => (x.t ? critChip(x.c, x.t) : h('span.faint', '–')) },
      { key: 'status', label: '', fmt: (x) => h('span.tag' + (x.status === 'Agree' ? '.ok' : x.status === 'Different strength' ? '.warn' : '.bad'), x.status) },
      { key: 'why', label: 'Their reason', fmt: (x) => h('span.small', x.why) }
    ], rows, { compact: true }));
}

export const MORE_SECTIONS = [
  { key: 'gene', title: 'Gene and disease', icon: 'book', deps: ['vep'], draw: drawGene },
  { key: 'family', title: 'Patient and family', icon: 'pedigree', deps: ['vep', 'gnomad'], draw: drawFamily },
  { key: 'functional', title: 'Functional data', icon: 'beaker', deps: [], draw: drawFunctional },
  { key: 'conclusion', title: 'Conclusion', icon: 'badgeCheck', deps: ['gnomad'], draw: drawConclusion }
];
