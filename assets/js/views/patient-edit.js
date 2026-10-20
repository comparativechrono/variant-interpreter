/* A patient's details: a new patient, or changing one */
import { h, toast } from '../core.js';
import { go, setLeaveGuard } from '../router.js';
import * as db from '../db.js';
import { page, crumbs, pageHead, field, select, input, textarea, btn, note, checkbox } from '../ui.js';
import { SEX } from '../summary.js';
import { PanelPicker } from '../panels.js';

export const ONSETS = [
  ['', 'Not recorded'],
  { group: 'Before birth', options: [['HP:0030674', 'Antenatal onset'], ['HP:0011460', 'Embryonal onset'], ['HP:0011461', 'Fetal onset']] },
  { group: 'At birth', options: [['HP:0003577', 'Congenital onset'], ['HP:0003623', 'Neonatal onset (first 28 days)']] },
  { group: 'Childhood', options: [['HP:0003593', 'Infantile onset (1 to 12 months)'], ['HP:0011463', 'Childhood onset (1 to 5 years)'], ['HP:0003621', 'Juvenile onset (5 to 15 years)']] },
  { group: 'Adulthood', options: [['HP:0003581', 'Adult onset'], ['HP:0011462', 'Young adult onset (16 to 40 years)'], ['HP:0003596', 'Middle age onset (40 to 60 years)'], ['HP:0003584', 'Late onset (after 60 years)']] }
];
const onsetName = (id) => {
  for (const o of ONSETS) if (o.group) for (const [v, l] of o.options) if (v === id) return l.replace(/ \(.*\)$/, '');
  return '';
};
/* gnomAD's genetic ancestry groups, for comparing frequencies with the patient's own group */
export const ANCESTRY = [
  ['', 'Not recorded'],
  ['afr', 'African or African American'],
  ['amr', 'Admixed American'],
  ['asj', 'Ashkenazi Jewish'],
  ['eas', 'East Asian'],
  ['fin', 'European (Finnish)'],
  ['nfe', 'European (non-Finnish)'],
  ['mid', 'Middle Eastern'],
  ['sas', 'South Asian'],
  ['remaining', 'Other or mixed']
];
export const TESTS = ['', 'Exome sequencing', 'Genome sequencing', 'Gene panel', 'Single gene', 'Chromosomal microarray', 'Karyotype', 'Familial variant testing', 'Other'];

export async function render(root, params) {
  const isNew = !params.id;
  const pt = isNew ? db.blankPatient() : await db.getPatient(params.id);
  if (!pt) {
    root.appendChild(h('div.page.narrow', note('bad', h('p', `Patient ${params.id} isn’t in this browser.`))));
    return;
  }
  const p = page('narrow');
  root.appendChild(p);
  p.appendChild(crumbs(isNew ? [['Patients', '/patients'], ['New patient']] : [['Patients', '/patients'], ['Patient ' + pt.id, '/patient/' + pt.id], ['Details']]));
  p.appendChild(pageHead({ title: isNew ? 'New patient' : `Patient ${pt.id}: details`, lede: isNew ? 'Record what the referral and the clinical assessment say. You can change any of it later, and add the phenotypes, family and variants on the patient’s page.' : null }));
  if (isNew) p.appendChild(note('warn', h('p', h('b', 'Use made-up or teaching cases only. '), 'Don’t enter anything that could identify a real person, such as a name, date of birth, or NHS or hospital number. Use your own reference instead, such as “Case 3”.')));

  const ref = input(pt.ref, { placeholder: 'e.g. Case 3, or Workshop 2 – trio', maxlength: 80 });
  const sex = select(Object.entries(SEX), pt.sex);
  const kary = input(pt.karyotype, { placeholder: 'e.g. 46,XX', list: 'karyos' });
  const karyList = h('datalist#karyos', ['46,XX', '46,XY', '45,X', '47,XXY', '47,XXX', '47,XYY'].map((k) => h('option', { value: k })));
  const prenatal = checkbox('Prenatal (a pregnancy or a fetus)', pt.prenatal);
  const gest = input(pt.gestation, { type: 'number', min: 4, max: 44, step: 1, placeholder: 'weeks' });
  const years = input(pt.age && pt.age.years, { type: 'number', min: 0, max: 120, step: 1, placeholder: 'years' });
  const months = input(pt.age && pt.age.months, { type: 'number', min: 0, max: 11, step: 1, placeholder: 'months' });
  const onset = select(ONSETS, pt.onset);
  const anc = select(ANCESTRY, pt.ancestryGroup || '');
  const ancText = input(pt.ancestry, { placeholder: 'as recorded, e.g. British Pakistani' });
  const cons = select([['unknown', 'Not known'], ['no', 'No'], ['yes', 'Yes']], pt.consanguinity);
  const referral = textarea(pt.referral, { rows: 2, placeholder: 'e.g. Global developmental delay and seizures from 4 months; ?genetic cause' });
  const summary = textarea(pt.summary, { rows: 4, placeholder: 'The clinical findings in a few sentences' });
  const famhx = textarea(pt.familyHistory, { rows: 3, placeholder: 'Who else is affected and how, and anything else the family tells you' });
  const ttype = select(TESTS.map((t) => [t, t || 'Not recorded']), pt.test && pt.test.type);
  const lab = input(pt.test && pt.test.lab, { placeholder: 'e.g. a regional genomics laboratory' });
  const tdate = input(pt.test && pt.test.date, { type: 'date' });
  const panel = new PanelPicker(pt.test && pt.test.panel);
  const notes = textarea(pt.notes, { rows: 3 });

  const ageRow = h('div.fields', field('Age at the last assessment (years)', years), field('and months', months, 'For a child under 2, give the months too'));
  const gestRow = h('div.fields', field('Gestation', gest, 'Completed weeks'));
  const syncPre = () => {
    ageRow.hidden = prenatal.box.checked;
    gestRow.hidden = !prenatal.box.checked;
  };
  prenatal.box.addEventListener('change', syncPre);
  syncPre();

  const form = h('form.stack', { onsubmit: (e) => e.preventDefault() },
    h('div.panel.stack',
      h('h2', 'The patient'),
      h('div.fields', field('Your reference', ref, 'Shown beside the patient’s number'), field('Sex', sex), field('Karyotype or chromosomal sex', kary, 'If it is known')),
      karyList,
      prenatal.el,
      ageRow, gestRow,
      h('div.fields', field('Age at onset', onset), field('Parents related to each other', cons)),
      h('div.fields', field('Genetic ancestry group', anc, 'These are gnomAD’s groups. The frequency in the patient’s own group is shown beside the others.'), field('Ancestry as recorded', ancText))),
    h('div.panel.stack',
      h('h2', 'Why they were tested'),
      field('Reason for referral', referral),
      field('Clinical summary', summary),
      field('Family history', famhx, 'You can add relatives and draw the pedigree on the Family tab.')),
    h('div.panel.stack',
      h('h2', 'The test'),
      h('div.fields', field('Test', ttype), field('Laboratory', lab), field('Date reported', tdate)),
      field('Gene panel (Genomics England PanelApp)', panel.el, 'Choose the panel that was applied to the exome or genome. Its genes are then marked in the patient’s variant table.')),
    h('div.panel.stack', h('h2', 'Notes'), field('Your notes', notes, 'Anything else you want to record. Your notes appear on the patient’s page but not on the report.')));
  p.appendChild(form);

  let dirty = false;
  form.addEventListener('input', () => (dirty = true));
  form.addEventListener('change', () => (dirty = true));
  setLeaveGuard(async () => {
    if (!dirty) return false;
    return !window.confirm('Leave without saving the changes to this patient?');
  });

  const save = async () => {
    const num = (el) => (el.value === '' ? null : Math.max(0, Math.round(+el.value)));
    Object.assign(pt, {
      ref: ref.value.trim(),
      sex: sex.value,
      karyotype: kary.value.trim(),
      prenatal: prenatal.box.checked,
      gestation: prenatal.box.checked ? num(gest) : null,
      age: prenatal.box.checked ? { years: null, months: null } : { years: num(years), months: num(months) },
      onset: onset.value,
      onsetName: onsetName(onset.value),
      ancestryGroup: anc.value,
      ancestry: ancText.value.trim(),
      consanguinity: cons.value,
      referral: referral.value.trim(),
      summary: summary.value.trim(),
      familyHistory: famhx.value.trim(),
      test: { type: ttype.value, lab: lab.value.trim(), date: tdate.value, panel: panel.value() },
      notes: notes.value.trim()
    });
    await db.savePatient(pt, isNew ? 'Patient created' : 'Details changed');
    dirty = false;
    setLeaveGuard(null);
    toast(isNew ? `Patient ${pt.id} created.` : 'Saved.', 'ok');
    go('/patient/' + pt.id + (isNew ? '/phenotypes' : ''));
  };
  p.appendChild(h('div.btn-row', { style: { marginTop: '16px' } },
    btn(isNew ? 'Create the patient' : 'Save', save, { cls: 'primary', icon: 'save' }),
    btn('Cancel', () => {
      dirty = false;
      setLeaveGuard(null);
      go(isNew ? '/patients' : '/patient/' + pt.id);
    }, { cls: 'ghost' })));
  return () => setLeaveGuard(null);
}
