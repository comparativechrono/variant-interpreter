// Checks of the example case files (data/cases): node tests/cases.test.mjs
// Each case must open in the site as it is: a patient whose fields use the site's own
// vocabularies, phenotypes that are current HPO terms, a pedigree the segregation calculator
// can read, variants linked to the patient, genotypes that obey Mendel, and an expected
// answer whose criteria (or CNV points) give the class it claims.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
globalThis.window = globalThis;
globalThis.self = globalThis;
const { readDrawing, relationships } = await import('../assets/js/acmg/segregation.js');
const { classify } = await import('../assets/js/acmg/engine.js');
const { BY_CODE } = await import('../assets/js/acmg/criteria.js');
const { RUBRIC, score } = await import('../assets/js/cnv/rubric.js');

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
let n = 0;
const ok = (cond, msg) => {
  assert.ok(cond, msg);
  n++;
};

/* ---------- the site's vocabularies, read from its source so that they stay in step ---------- */
const block = (src, name) => {
  const m = new RegExp(`export const ${name} = \\[([\\s\\S]*?)\\n\\];`).exec(src) || new RegExp(`export const ${name} = \\[([^\\n]*)\\];`).exec(src);
  if (!m) throw new Error(`no ${name} in the source`);
  return m[1];
};
const firsts = (text) => Array.from(text.matchAll(/\[\s*'([^']*)'\s*,/g)).map((m) => m[1]);
const editSrc = read('assets/js/views/patient-edit.js');
const summarySrc = read('assets/js/summary.js');
const ONSETS = new Set([''].concat(Array.from(block(editSrc, 'ONSETS').matchAll(/'(HP:\d{7})'/g)).map((m) => m[1])));
const ANCESTRY = new Set(firsts(block(editSrc, 'ANCESTRY')));
const TESTS = new Set(Array.from(block(editSrc, 'TESTS').matchAll(/'([^']*)'/g)).map((m) => m[1]));
const ZYGOSITY = new Set(firsts(block(summarySrc, 'ZYGOSITY')));
const INHERITANCE = new Set(firsts(block(summarySrc, 'INHERITANCE')));
const COPIES = new Set(Array.from(block(summarySrc, 'CNV_COPIES').matchAll(/\[\s*(\d+)\s*,/g)).map((m) => +m[1]));
const SEXES = new Set(['female', 'male', 'other', 'unknown']);
assert.ok(ONSETS.size > 5 && ANCESTRY.has('nfe') && TESTS.has('Gene panel') && ZYGOSITY.has('heterozygous') && INHERITANCE.has('denovo-confirmed') && COPIES.has(1), 'the vocabularies were read');

/* ---------- HPO terms, with their alternative ids ---------- */
const HPO = JSON.parse(read('data/hpo/terms.json'));
const TERM = new Map(HPO.terms.map((t) => [t[0], t[1]]));
const ALT = HPO.alt || {};

/* ---------- criteria labels as the cases write them (ClinGen's style: PM2_Supporting) ---------- */
const W = { VeryStrong: 'VS', Strong: 'S', Moderate: 'M', Supporting: 'P', StandAlone: 'SA' };
const parseCode = (label) => {
  const m = /^([PB](?:VS|S|M|P|A)\d)(?:_(VeryStrong|Strong|Moderate|Supporting|StandAlone))?$/.exec(label);
  if (!m || !BY_CODE[m[1]]) return null;
  return { code: m[1], strength: m[2] ? W[m[2]] : BY_CODE[m[1]].def };
};
const GT = new Set(['het', 'hom', 'hemi', 'ref', 'untested']);
const carries = (g) => g === 'het' || g === 'hom' || g === 'hemi';
const CLASSES = new Set(['p', 'lp', 'vus', 'lb', 'b']);
const beyond = [];

/* ---------- the index ---------- */
const index = JSON.parse(read('data/cases/index.json'));
ok(Array.isArray(index.cases) && index.cases.length >= 1, 'the index lists cases');
const ids = new Set();
for (const entry of index.cases) {
  for (const k of ['id', 'title', 'teaser', 'file']) ok(typeof entry[k] === 'string' && entry[k].trim(), `${entry.id}: index entry has ${k}`);
  ok(!ids.has(entry.id), `${entry.id}: case ids are unique`);
  ids.add(entry.id);
  ok(entry.file === `data/cases/${entry.id}.json`, `${entry.id}: the file is named after the case`);
  ok(Array.isArray(entry.tags) && entry.tags.length, `${entry.id}: has tags`);
  ok(fs.existsSync(path.join(ROOT, entry.file)), `${entry.id}: its file exists`);

  const doc = JSON.parse(read(entry.file));
  const where = entry.id;
  ok(doc.format === 'variant-interpreter' && doc.version === 1, `${where}: format and version`);
  ok(doc.case && doc.case.id === entry.id && doc.case.title === entry.title, `${where}: the case's id and title match the index`);
  ok(typeof doc.case.brief === 'string' && /<p>/.test(doc.case.brief) && !/<script|on\w+=/i.test(doc.case.brief), `${where}: a brief in plain HTML`);
  ok(Array.isArray(doc.case.tasks) && doc.case.tasks.length >= 2, `${where}: tasks`);
  ok(typeof doc.case.source === 'string' && /fictional/i.test(doc.case.source), `${where}: the source says the patient is fictional`);
  ok(Array.isArray(doc.patients) && doc.patients.length === 1, `${where}: one patient`);
  ok(Array.isArray(doc.variants) && doc.variants.length >= 1, `${where}: variants`);

  /* ---------- the patient ---------- */
  const pt = doc.patients[0];
  ok(typeof pt.id === 'string' && pt.id, `${where}: the patient has an id`);
  ok(SEXES.has(pt.sex), `${where}: sex is one the site knows (${pt.sex})`);
  ok(pt.age && (pt.age.years == null || Number.isInteger(pt.age.years)) && (pt.age.months == null || Number.isInteger(pt.age.months)), `${where}: age`);
  ok(ONSETS.has(pt.onset), `${where}: onset ${pt.onset} is in the form's list`);
  ok(ANCESTRY.has(pt.ancestryGroup), `${where}: ancestry group ${pt.ancestryGroup} is in the form's list`);
  ok(['unknown', 'no', 'yes'].includes(pt.consanguinity), `${where}: consanguinity`);
  ok(pt.test && TESTS.has(pt.test.type), `${where}: test type ${pt.test && pt.test.type}`);
  if (pt.test.panel) ok(pt.test.panel.name && (pt.test.panel.source === 'typed' || (Number.isInteger(pt.test.panel.id) && pt.test.panel.version)), `${where}: the panel`);
  for (const k of ['ref', 'referral', 'summary', 'familyHistory']) ok(typeof pt[k] === 'string' && pt[k].trim(), `${where}: the patient has ${k}`);
  ok(pt.caseId == null, `${where}: caseId is left to the site to set`);

  /* phenotypes: current HPO terms, with their current names */
  ok(Array.isArray(pt.phenotypes) && pt.phenotypes.some((t) => t.observed), `${where}: observed phenotypes`);
  const seenHp = new Set();
  for (const t of pt.phenotypes) {
    const m = /^HP:(\d{7})$/.exec(t.id);
    ok(m, `${where}: ${t.id} is an HPO id`);
    const num = +m[1];
    ok(!(String(num) in ALT), `${where}: ${t.id} is not an obsolete or alternative id`);
    ok(TERM.get(num) === t.name, `${where}: ${t.id} is called “${TERM.get(num)}”, not “${t.name}”`);
    ok(typeof t.observed === 'boolean', `${where}: ${t.id} observed or excluded`);
    ok(!seenHp.has(t.id), `${where}: ${t.id} listed once`);
    seenHp.add(t.id);
  }

  /* the pedigree, read as the segregation calculator reads it */
  ok(pt.pedigree && Array.isArray(pt.pedigree.persons), `${where}: a pedigree drawing`);
  const fam = readDrawing(pt.pedigree);
  const people = new Map(fam.people.map((p) => [p.id, p]));
  const probands = fam.people.filter((p) => p.proband);
  ok(probands.length === 1 && probands[0].id === pt.probandPerson, `${where}: one proband, the patient's probandPerson`);
  ok(fam.conditions.length >= 1 && fam.conditions.every((c) => !c.unnamed), `${where}: the condition is named in the drawing's key`);
  const cond = fam.conditions[0].key;
  ok(probands[0].status[cond] === 'affected', `${where}: the proband is shaded as affected`);
  const labels = new Set(fam.people.map((p) => p.label));
  ok(labels.size === fam.people.length, `${where}: every symbol has its own label (I-1, II-2…)`);
  const persons = new Set(pt.pedigree.persons.map((p) => p.id));
  const ships = new Set(pt.pedigree.partnerships.map((s) => s.id));
  for (const s of pt.pedigree.partnerships) ok(persons.has(s.fromId) && persons.has(s.toId), `${where}: partnership ${s.id} joins people in the drawing`);
  for (const c of pt.pedigree.childLinks) ok(ships.has(c.partnershipId) && persons.has(c.childId), `${where}: child link ${c.id}`);
  if (pt.consanguinity === 'yes') ok(pt.pedigree.partnerships.some((s) => s.type === 'consanguineous'), `${where}: the consanguineous couple is drawn with a double line`);
  /* the family list matches the drawing */
  const rel = relationships(fam, pt.probandPerson);
  ok(Array.isArray(pt.family) && pt.family.length === fam.people.length - 1, `${where}: the family lists every relative in the drawing`);
  for (const r of pt.family) {
    const p = people.get(r.id);
    ok(p && r.relation === rel[r.id] && r.label === p.label && r.affected === (p.status[cond] === 'affected') && r.deceased === !!p.deceased, `${where}: ${r.id} in the family list matches the drawing`);
  }

  /* ---------- the variants ---------- */
  for (const v of doc.variants) {
    const vw = `${where} ${v.input}`;
    ok(v.patientId === pt.id, `${vw}: linked to the patient (or the import drops it)`);
    ok(v.assembly === 'GRCh38' || v.assembly === 'GRCh37', `${vw}: assembly`);
    ok(INHERITANCE.has(v.inheritance), `${vw}: inheritance ${v.inheritance} is in the site's list`);
    ok(/^([1-9]|1\d|2[0-2]|X|Y|MT)$/.test(v.chrom), `${vw}: chromosome`);
    if (v.kind === 'sequence') {
      ok(Number.isInteger(v.pos) && v.pos > 0, `${vw}: position`);
      ok(/^[ACGT]+$/.test(v.ref) && /^[ACGT]+$/.test(v.alt) && v.ref !== v.alt, `${vw}: alleles`);
      if (v.ref.length !== v.alt.length) ok(v.ref[0] === v.alt[0], `${vw}: an indel keeps VCF's padding base`);
      ok(v.hgvsc === v.input && v.hgvsc.startsWith(v.transcript + ':c.'), `${vw}: the transcript and the HGVS agree`);
      ok(ZYGOSITY.has(v.zygosity), `${vw}: zygosity`);
      ok(v.classification && v.classification.criteria && !Object.keys(v.classification.criteria).length, `${vw}: no criteria filled in for the student`);
      // the calculators' inputs may be set up (the segregation model), but not their answers
      ok(v.calc && typeof v.calc === 'object' && !v.calc.seg && !(v.calc.af && v.calc.af.userSet), `${vw}: no calculator answers filled in`);
      if (v.calc.segModel) ok(['AD', 'AR', 'XLR', 'XLD'].includes(v.calc.segModel.mode) && v.calc.segModel.penetrance > v.calc.segModel.phenocopy, `${vw}: the segregation model`);
    } else {
      ok(v.kind === 'cnv', `${vw}: kind`);
      ok(Number.isInteger(v.start) && Number.isInteger(v.end) && v.start < v.end, `${vw}: start and end`);
      ok(v.cnvType === 'loss' || v.cnvType === 'gain', `${vw}: loss or gain`);
      ok(COPIES.has(v.copyNumber) && (v.cnvType === 'loss' ? v.copyNumber < 2 : v.copyNumber > 2), `${vw}: copy number fits the type`);
      ok(v.cnv && v.cnv.items && !Object.keys(v.cnv.items).length, `${vw}: no CNV points filled in for the student`);
    }
    /* genotypes in the family */
    const g = v.familyGenotypes || {};
    for (const [id, x] of Object.entries(g)) {
      ok(people.has(id), `${vw}: genotype for ${id}, who is in the drawing`);
      ok(GT.has(x), `${vw}: genotype ${x}`);
    }
    if (v.kind === 'sequence' && g[pt.probandPerson]) {
      const want = { heterozygous: 'het', homozygous: 'hom', hemizygous: 'hemi' }[v.zygosity];
      ok(!want || g[pt.probandPerson] === want, `${vw}: the proband's genotype matches the zygosity`);
    }
    const denovo = /^denovo/.test(v.inheritance);
    for (const child of fam.people) {
      const gc = g[child.id];
      if (!gc || gc === 'untested') continue;
      const gf = g[child.father], gm = g[child.mother];
      const tested = (x) => x && x !== 'untested';
      if (gc === 'hom' && !denovo) {
        if (tested(gf)) ok(carries(gf), `${vw}: ${child.id} is homozygous, so the father carries it`);
        if (tested(gm)) ok(carries(gm), `${vw}: ${child.id} is homozygous, so the mother carries it`);
      }
      if (gc === 'het' && tested(gf) && tested(gm) && !(denovo && child.id === pt.probandPerson)) ok(carries(gf) || carries(gm), `${vw}: ${child.id} is heterozygous, so a parent carries it`);
      if (gc === 'ref') ok(gf !== 'hom' && gm !== 'hom', `${vw}: ${child.id} has no copy, so neither parent is homozygous`);
    }
    if (denovo) {
      const p = people.get(pt.probandPerson);
      for (const par of [p.father, p.mother]) if (par && g[par] && g[par] !== 'untested') ok(g[par] === 'ref', `${vw}: de novo, so the tested parents don't carry it`);
    }
    if (v.inheritance === 'maternal' || v.inheritance === 'paternal') {
      const p = people.get(pt.probandPerson);
      const par = v.inheritance === 'maternal' ? p.mother : p.father;
      if (g[par] && g[par] !== 'untested') ok(carries(g[par]), `${vw}: inherited from the ${v.inheritance === 'maternal' ? 'mother' : 'father'}, who carries it`);
    }

    /* the expected answer */
    const e = v.expected;
    if (!e) continue;
    ok(CLASSES.has(e.cls), `${vw}: expected class ${e.cls}`);
    ok(typeof e.source === 'string' && e.source.length > 20, `${vw}: the answer's source`);
    if (v.kind === 'sequence') {
      ok(Array.isArray(e.criteria) && e.criteria.length, `${vw}: expected criteria`);
      const state = { criteria: {} };
      for (const label of e.criteria) {
        const c = parseCode(label);
        ok(c, `${vw}: “${label}” is a criterion, written as ClinGen writes them`);
        ok(!state.criteria[c.code], `${vw}: ${c.code} listed once`);
        // an expert panel may use a strength the general guidance doesn't (the TP53 panel's PS4_VeryStrong): allowed,
        // as long as it is a strength at all, and listed at the end
        ok((c.code[0] === 'P' ? ['VS', 'S', 'M', 'P'] : c.code === 'BA1' ? ['SA'] : ['VS', 'S', 'M', 'P']).includes(c.strength), `${vw}: ${label} is a strength`);
        if (!BY_CODE[c.code].strengths.includes(c.strength)) beyond.push(`${where}: ${label}`);
        state.criteria[c.code] = { met: true, evaluated: true, strength: c.strength };
      }
      const r = classify(state, { framework: 'clingen' });
      ok(r.cls === e.cls, `${vw}: the expected criteria give ${r.cls} (${r.points} points), not ${e.cls}`);
      for (const k of Object.keys(e.notes || {})) ok(BY_CODE[k], `${vw}: a note for ${k}, a criterion`);
      for (const label of e.criteria) ok(e.notes && e.notes[parseCode(label).code], `${vw}: the answer explains ${label}`);
    } else {
      ok(Array.isArray(e.items) && e.items.length, `${vw}: expected CNV items`);
      const codes = new Set(RUBRIC[v.cnvType].flatMap((s) => s.items.map((it) => it.code)));
      const items = {};
      for (const code of e.items) {
        ok(codes.has(code), `${vw}: ${code} is an item of the ${v.cnvType} rubric`);
        items[code] = { on: true };
      }
      const s = score(v.cnvType, { items });
      ok(s.cls === e.cls, `${vw}: the expected items give ${s.cls} (${s.total / 100}), not ${e.cls}`);
      for (const code of e.items) ok(e.notes && e.notes[code], `${vw}: the answer explains ${code}`);
    }
  }
}
if (beyond.length) console.log(`expert panels' strengths that the classification panel doesn't offer: ${beyond.join('; ')}`);
console.log(`cases: ${index.cases.length} cases, ${n} checks passed`);
