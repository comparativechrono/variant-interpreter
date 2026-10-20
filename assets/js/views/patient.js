/* A patient's page: the frame (heading, tabs) and the tab on show */
import { h, bus, esc, toast, confirmBox, popmenu, dateStr, icon } from '../core.js';
import { go, link } from '../router.js';
import * as db from '../db.js';
import { page, crumbs, pageHead, tabs, btn, linkBtn, note, factList } from '../ui.js';
import { patientFacts } from '../summary.js';
import { exportAll } from './data.js';

const TABS = {
  overview: () => import('./patient-overview.js'),
  phenotypes: () => import('./patient-phenotypes.js'),
  variants: () => import('./patient-variants.js'),
  family: () => import('./patient-family.js'),
  browser: () => import('./patient-browser.js'),
  report: () => import('./patient-report.js'),
  history: () => import('./patient-history.js')
};

let cleanupTab = null;

export async function render(root, params, query = {}) {
  const pt = await db.getPatient(params.id);
  if (!pt) {
    const p = page('narrow');
    p.appendChild(h('h1', `Patient ${params.id} isn’t in this browser`));
    p.appendChild(note('warn', h('p', 'Patients are kept in the browser they were created in. If you made this one on another computer, download it there from Cases and data, then open the file here.')));
    p.appendChild(h('div.btn-row', linkBtn('Your patients', '/patients', { cls: 'primary' })));
    root.appendChild(p);
    return;
  }
  const tab = TABS[params.tab] ? params.tab : 'overview';
  const vs = await db.variantsOf(pt.id);
  const p = page();
  root.appendChild(p);
  p.appendChild(crumbs([['Patients', '/patients'], ['Patient ' + pt.id]]));
  const facts = patientFacts(pt);
  const more = btn('', (e) => popmenu(e.currentTarget, [
    ['download', 'Download this patient', () => exportAll([pt.id])],
    ['copy', 'Make a copy', async () => {
      const doc = await db.exportData([pt.id]);
      doc.patients[0].ref = (doc.patients[0].ref || 'Patient ' + pt.id) + ' (copy)';
      const res = await db.importData(doc, { renumber: true });
      toast(`The copy is saved as Patient ${res.patients[0]}.`, 'ok');
      go('/patient/' + res.patients[0]);
    }],
    null,
    ['trash', 'Delete this patient…', async () => {
      const ok = await confirmBox(`Delete Patient ${pt.id}?`, `This deletes the patient from this browser, along with their ${vs.length} ${vs.length === 1 ? 'variant' : 'variants'} and all of their classifications. If you might want them again, download the patient first.`, { yes: 'Delete', danger: true });
      if (!ok) return;
      await db.deletePatient(pt.id);
      toast(`Patient ${pt.id} deleted.`, 'ok');
      go('/patients');
    }]
  ]), { icon: 'dots', cls: 'icon-only', aria: 'More actions for this patient' });
  p.appendChild(pageHead({
    titleNode: [h('span', 'Patient ' + pt.id), pt.ref ? h('span.title-ref', pt.ref) : null, pt.caseId || pt.case ? h('a.tag.accent', { href: link(`/patient/${pt.id}?case=open`), title: 'Opened from a case file. Its brief and tasks are on the Overview tab.' }, 'Case') : null],
    facts: facts.pairs,
    actions: [
      linkBtn('Details', `/patient/${pt.id}/edit`, { icon: 'pencil' }),
      linkBtn('Report', `/patient/${pt.id}/report`, { icon: 'report' }),
      more
    ]
  }));
  const obsOf = (x) => (x.phenotypes || []).filter((t) => t.observed !== false).length;
  const famOf = (x) => (x.family || []).length || (x.pedigree && Array.isArray(x.pedigree.persons) ? x.pedigree.persons.length : 0);
  const nav = tabs([
    ['overview', 'Overview', `/patient/${pt.id}`],
    ['phenotypes', 'Phenotypes', `/patient/${pt.id}/phenotypes`, obsOf(pt), 'phenotype'],
    ['variants', 'Variants', `/patient/${pt.id}/variants`, vs.length, 'dna'],
    ['family', 'Family and pedigree', `/patient/${pt.id}/family`, famOf(pt) || null, 'pedigree'],
    ['browser', 'Genome browser', `/patient/${pt.id}/browser`, null, 'genome'],
    ['report', 'Report', `/patient/${pt.id}/report`, null, 'report'],
    ['history', 'History', `/patient/${pt.id}/history`, null, 'history']
  ], tab, 'Patient ' + pt.id);
  p.appendChild(nav);
  // the counts follow what the tabs change (phenotypes added, a pedigree drawn, variants added)
  const setCount = (key, n) => {
    const a = nav.querySelector(`a[data-key="${key}"]`);
    if (!a) return;
    let c = a.querySelector('.count');
    if (!n) return c && c.remove();
    if (!c) {
      c = h('span.count');
      a.append(' ', c);
    }
    c.textContent = String(n);
  };
  const recount = async () => {
    const [fresh, vs2] = await Promise.all([db.getPatient(pt.id), db.variantsOf(pt.id)]);
    if (!fresh || !nav.isConnected) return;
    setCount('phenotypes', obsOf(fresh));
    setCount('variants', vs2.length);
    setCount('family', famOf(fresh));
  };
  const offP = bus.on('db:patients', (e) => e && String(e.id) === String(pt.id) && recount());
  const offV = bus.on('db:variants', (e) => e && String(e.patientId) === String(pt.id) && recount());
  const body = h('div.tab-body');
  p.appendChild(body);
  const mod = await TABS[tab]();
  if (cleanupTab) {
    try { cleanupTab(); } catch (e) { /* ignore */ }
  }
  const r = await mod.render(body, { patient: pt, variants: vs, query, refresh: () => go(`/patient/${pt.id}/${tab}`, true) });
  cleanupTab = typeof r === 'function' ? r : null;
  return () => {
    offP();
    offV();
    if (cleanupTab) {
      try { cleanupTab(); } catch (e) { /* ignore */ }
      cleanupTab = null;
    }
  };
}
