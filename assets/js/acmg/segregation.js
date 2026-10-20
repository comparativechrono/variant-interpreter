/* =====================================================================
   Co-segregation: how much more likely the family's genotypes and
   phenotypes are if the variant causes the disease than if it doesn't.

   The likelihood ratio is that of the "full-likelihood" method of
   Thompson et al. (2003), as the co-segregation analyses of ClinGen's
   expert panels use it: the chance of the relatives' genotypes given
   everyone's phenotypes, if the variant is causal, over their chance if
   it is not, both given the proband's own genotype (the family was found
   through the proband). The chances are summed over every possible
   genotype exactly, by PedRisk (risk-engine.js, from the Pedigree
   workbench).

     LR = [P(G, Ph | causal) / P(Gp, Ph | causal)] / [P(G) / P(Gp)]

   G: all the genotypes; Gp: the proband's; Ph: the phenotypes.
   ===================================================================== */
import '../risk-engine.js';
import '../risk-read.js';

const PedRisk = () => window.PedRisk;
const PedRead = () => window.PedRead;
export const readDrawing = (data) => PedRead().fromStudio(data);

/* Tavtigian et al.'s odds for each strength (O_PVSt = 350, exponent 2): the Bayesian route to PP1 and BS4 */
export const BAYES_ODDS = { P: 2.08, M: 4.33, S: 18.7, VS: 350 };
/* Jarvik and Browning (2016), as the ACGS 2024 guidelines use it: the chance of the segregation by chance alone,
   (1/2) to the number of informative meioses. In one family: 1/8 (3 meioses) supporting, 1/16 (4) moderate,
   1/32 (5) strong; across two or more families: 1/4, 1/8 and 1/16 */
export const MEIOSES = { one: { P: 3, M: 4, S: 5 }, several: { P: 2, M: 3, S: 4 } };

/** a genotype as PedRisk's test result, for the mode of inheritance */
function testOf(g, mode, sex) {
  if (!g || g === 'untested') return null;
  if (g === 'ref') return 'none';
  if (mode === 'AD' || mode === 'XLD') return 'variant';
  if (mode === 'AR') return g === 'hom' ? 'homozygous' : 'carrier';
  // X-linked recessive: a man with the variant has his one copy; a woman may be a carrier or homozygous
  if (sex === 'M') return 'variant';
  return g === 'hom' ? 'homozygous' : 'carrier';
}

/**
 * cosegregation({ family, conditionKey, probandId, genotypes, model })
 *   family: from readDrawing (people with ids, parents, sexes and statuses)
 *   genotypes: { personId: 'het' | 'hom' | 'hemi' | 'ref' | 'untested' }
 *   model: { mode: 'AD'|'AR'|'XLR'|'XLD', penetrance, phenocopy, q }
 * → { ok, lr, lod, meioses, strength: {bayes, jarvik}, direction, counts, message }
 */
export function cosegregation({ family, conditionKey, probandId, genotypes, model, unrecorded }) {
  const R = PedRisk();
  const mode = model.mode || 'AD';
  const m = { mode, penetrance: model.penetrance ?? 0.9, phenocopy: model.phenocopy ?? 0.001, q: model.q ?? 0.0001, mutation: 0 };
  const base = PedRead().forEngine(family, conditionKey, null, unrecorded || 'unknown');
  const byId = new Map(base.map((p) => [p.id, p]));
  if (!probandId || !byId.has(probandId)) return { ok: false, message: 'First mark the proband in the pedigree, using Pedigree Studio’s “Proband” option.' };
  const pg = genotypes[probandId];
  if (!pg || pg === 'untested' || pg === 'ref') return { ok: false, message: 'Give the proband’s genotype first, because the analysis starts from the proband having the variant.' };
  // a variant both parents were tested for and lack arose in the proband: there is no segregation to measure
  const pb = byId.get(probandId);
  const xMale = (mode === 'XLR' || mode === 'XLD') && pb.sex === 'M';
  if (pb.mother && genotypes[pb.mother] === 'ref' && (xMale || (pb.father && genotypes[pb.father] === 'ref'))) {
    return { ok: false, denovo: true, message: `${xMale ? 'The proband’s mother was tested and does not have it' : 'Both of the proband’s parents were tested and neither has it'}, so the variant arose in the proband (de novo) or a parent is mosaic. A new variant hasn’t been passed down the family, which means co-segregation can’t be measured. Weigh it as de novo evidence (PS2 or PM6) instead.` };
  }
  const tests = {};
  for (const p of base) tests[p.id] = testOf(genotypes[p.id], mode, p.sex);
  const tested = base.filter((p) => tests[p.id] && p.id !== probandId);
  if (!tested.length) return { ok: false, message: 'Give the genotypes of the relatives who were tested. With only the proband tested, the family can’t tell you anything about co-segregation.' };
  const people = (withTests, withPheno) => base.map((p) => ({
    id: p.id, label: p.label, sex: p.sex, father: p.father, mother: p.mother, twin: p.twin,
    affected: withPheno ? p.affected : null,
    test: withTests === 'all' ? tests[p.id] : withTests === 'proband' && p.id === probandId ? tests[p.id] : null
  }));
  let A, B, C, D;
  try {
    A = R.logLikelihood(people('all', true), m);
    B = R.logLikelihood(people('proband', true), m);
    C = R.logLikelihood(people('all', false), m);
    D = R.logLikelihood(people('proband', false), m);
  } catch (e) {
    return { ok: false, message: e.message };
  }
  if (!isFinite(C)) return { ok: false, message: 'These genotypes can’t all be right, because they break Mendel’s laws. Check the parents’ and children’s results, and the mode of inheritance. A variant that is new in the family, or a parent who is mosaic, can’t be analysed this way.' };
  if (!isFinite(B)) return { ok: false, message: 'The proband’s phenotype and genotype aren’t possible together under this model, so check the model.' };
  const logLR = (A - B) - (C - D);
  const lr = isFinite(logLR) ? Math.exp(logLR) : 0;
  const lod = lr > 0 ? Math.log10(lr) : -Infinity;
  const meioses = lr > 0 ? Math.log2(lr) : -Infinity;
  const strengthBayes = (x) => (x >= BAYES_ODDS.VS ? 'VS' : x >= BAYES_ODDS.S ? 'S' : x >= BAYES_ODDS.M ? 'M' : x >= BAYES_ODDS.P ? 'P' : null);
  const out = { ok: true, lr, lod, meioses, model: m, A, B, C, D };
  if (lr >= 1) {
    out.direction = 'for';
    const J = MEIOSES[model.families === 'several' ? 'several' : 'one'];
    // (a hair below a whole number of meioses, from rounding, still counts)
    const mm = meioses + 1e-6;
    out.strength = {
      bayes: strengthBayes(lr),
      jarvik: mm >= J.S ? 'S' : mm >= J.M ? 'M' : mm >= J.P ? 'P' : null
    };
  } else {
    out.direction = 'against';
    out.strength = { bayes: lr === 0 ? 'S' : strengthBayes(1 / lr), jarvik: null };
    if (out.strength.bayes === 'VS') out.strength.bayes = 'S';
  }
  // who tells us what. "Carriers" here are those with the genotype that causes the disease under the model: one copy
  // for a dominant disorder; two for a recessive one (one copy for a man with an X-linked recessive disorder)
  const counts = { affectedCarriers: 0, unaffectedCarriers: 0, affectedNonCarriers: 0, unaffectedNonCarriers: 0, untestedAffected: 0, mode };
  for (const p of base) {
    if (p.id === probandId) continue;
    const t = tests[p.id];
    if (!t) {
      if (p.affected === true) counts.untestedAffected++;
      continue;
    }
    const carrier = mode === 'AR' ? t === 'homozygous' : mode === 'XLR' ? (p.sex === 'M' ? t === 'variant' : t === 'homozygous') : t !== 'none';
    if (p.affected === true) carrier ? counts.affectedCarriers++ : counts.affectedNonCarriers++;
    else if (p.affected === false) carrier ? counts.unaffectedCarriers++ : counts.unaffectedNonCarriers++;
  }
  out.counts = counts;
  return out;
}

/** the relationships of everyone in a drawing to the proband, in words (mother, paternal aunt …) */
export function relationships(family, probandId) {
  const byId = new Map(family.people.map((p) => [p.id, p]));
  const out = {};
  const P = byId.get(probandId);
  if (!P) return out;
  const parentsOf = (p) => [p.father, p.mother].filter(Boolean);
  const childrenOf = (id) => family.people.filter((x) => x.father === id || x.mother === id);
  const word = (p, m, f, u) => (p.sex === 'M' ? m : p.sex === 'F' ? f : u);
  out[P.id] = 'proband';
  const set = (p, w) => {
    if (p && !out[p.id]) out[p.id] = w;
  };
  const father = byId.get(P.father), mother = byId.get(P.mother);
  set(father, 'father');
  set(mother, 'mother');
  for (const c of childrenOf(P.id)) set(c, word(c, 'son', 'daughter', 'child'));
  for (const c of childrenOf(P.id)) for (const g of childrenOf(c.id)) set(g, word(g, 'grandson', 'granddaughter', 'grandchild'));
  // siblings: full or half
  const sibs = family.people.filter((x) => x.id !== P.id && ((P.father && x.father === P.father) || (P.mother && x.mother === P.mother)));
  for (const s of sibs) {
    const full = P.father && P.mother && s.father === P.father && s.mother === P.mother;
    set(s, (full ? '' : 'half-') + word(s, 'brother', 'sister', 'sibling'));
    if (s.twin === P.id || P.twin === s.id) out[s.id] = 'identical twin';
  }
  for (const s of sibs) for (const c of childrenOf(s.id)) set(c, word(c, 'nephew', 'niece', 'nephew or niece'));
  for (const [par, side] of [[father, 'paternal'], [mother, 'maternal']]) {
    if (!par) continue;
    for (const gp of parentsOf(par).map((id) => byId.get(id)).filter(Boolean)) set(gp, `${side} ${word(gp, 'grandfather', 'grandmother', 'grandparent')}`);
    const auncles = family.people.filter((x) => x.id !== par.id && ((par.father && x.father === par.father) || (par.mother && x.mother === par.mother)));
    for (const a of auncles) {
      set(a, `${side} ${word(a, 'uncle', 'aunt', 'aunt or uncle')}`);
      for (const c of childrenOf(a.id)) set(c, `${side} first cousin`);
    }
    for (const gp of parentsOf(par).map((id) => byId.get(id)).filter(Boolean)) for (const ggp of parentsOf(gp).map((id) => byId.get(id)).filter(Boolean)) set(ggp, `${side} great-grandparent`);
  }
  // partners of the proband and of relatives
  for (const [a, b] of family.partners || []) {
    if (a === P.id) set(byId.get(b), 'partner');
    if (b === P.id) set(byId.get(a), 'partner');
  }
  for (const p of family.people) if (!out[p.id]) out[p.id] = 'relative';
  return out;
}

/* ---------------- a pedigree from a few answers ---------------- */
/**
 * quickPedigree({ proband: {sex, affected}, parents: true, consanguineous, siblings: [{sex, affected}],
 *                 children: [{sex, affected}], grandparents: true })
 * → a Pedigree Studio drawing (laid out roughly; the Studio's Tidy lays it out properly)
 */
export function quickPedigree(spec) {
  const persons = [], partnerships = [], childLinks = [];
  let n = 0, line = 0;
  const shape = (sex) => (sex === 'male' || sex === 'M' ? 'male' : sex === 'female' || sex === 'F' ? 'female' : 'unknown');
  const FILL = '#1a2332';
  const person = (id, sex, x, y, opts = {}) => {
    persons.push({
      id, shape: shape(sex), x, y, text: opts.text || '', deceased: !!opts.deceased, proband: !!opts.proband, centerText: '', miscarriageSex: 'unknown',
      noSnap: false, siblingFixed: false, customLabel: 'Lbl', fillMode: opts.affected ? 'solid' : 'none', fillColor: FILL,
      quarters: [null, null, null, null], halves: [null, null], shadingPattern: 'stripes', shadingCoverage: 'full'
    });
    return id;
  };
  const couple = (a, b, type) => {
    const id = 'pship-' + ++line;
    partnerships.push({ id, fromId: a, toId: b, type: type || 'normal' });
    return id;
  };
  const child = (ps, c) => childLinks.push({ id: 'child-' + ++line, partnershipId: ps, childId: c, branchYOffset: 0, dashed: false });
  const G1 = 160, G2 = 320, G3 = 480, G4 = 640;
  const pr = spec.proband || {};
  let fa = null, mo = null, pc = null;
  const x0 = 520;
  if (spec.grandparents) {
    const pgf = person('p-pgf', 'male', x0 - 260, G1), pgm = person('p-pgm', 'female', x0 - 160, G1);
    const mgf = person('p-mgf', 'male', x0 + 160, G1), mgm = person('p-mgm', 'female', x0 + 260, G1);
    spec._gp = [couple(pgf, pgm), couple(mgf, mgm)];
  }
  if (spec.parents !== false) {
    fa = person('p-father', 'male', x0 - 70, spec.grandparents ? G2 : G1, { affected: spec.fatherAffected });
    mo = person('p-mother', 'female', x0 + 70, spec.grandparents ? G2 : G1, { affected: spec.motherAffected });
    pc = couple(fa, mo, spec.consanguineous ? 'consanguineous' : 'normal');
    if (spec._gp) {
      child(spec._gp[0], fa);
      child(spec._gp[1], mo);
    }
  }
  const gy = spec.grandparents ? G3 : G2;
  const kids = [{ id: 'p-proband', sex: pr.sex, affected: pr.affected !== false, proband: true }].concat((spec.siblings || []).map((s, i) => ({ id: 'p-sib' + (i + 1), sex: s.sex, affected: s.affected })));
  kids.forEach((k, i) => {
    person(k.id, k.sex, x0 - (kids.length - 1) * 55 + i * 110, spec.parents === false ? G1 : gy, { affected: k.affected, proband: k.proband });
    if (pc) child(pc, k.id);
  });
  if ((spec.children || []).length) {
    const partner = person('p-partner', pr.sex === 'male' ? 'female' : 'male', x0 + 300, spec.parents === false ? G1 : gy);
    const ps = couple('p-proband', partner);
    spec.children.forEach((c, i) => {
      const id = 'p-child' + (i + 1);
      person(id, c.sex, x0 + 60 + i * 110, (spec.parents === false ? G1 : gy) + 160, { affected: c.affected });
      child(ps, id);
    });
  }
  return {
    version: 5, personIdCounter: 0, labelIdCounter: 0, lineIdCounter: line, persons, labels: [], partnerships, childLinks, twinLinks: [],
    legendLabels: spec.condition ? { [FILL]: spec.condition } : {}, legendVisible: !!spec.condition, legendX: x0 + 420, legendY: G1,
    numberingMode: 'numbers', partnerGapMultiplier: 2, childHeightMultiplier: 2.5, drawStrokes: []
  };
}
