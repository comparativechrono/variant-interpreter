/* A patient's page: the frame (heading, tabs) and the tab on show */
import { h, esc, toast, confirmBox, popmenu, dateStr, icon } from '../core.js';
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

export async function render(root, params) {
  const pt = await db.getPatient(params.id);
  if (!pt) {
    const p = page('narrow');
    p.appendChild(h('h1', `There is no patient ${params.id} here`));
    p.appendChild(note('warn', h('p', 'Patients are kept by the browser they were made in. If you made this one on another computer, export it there (Cases and data) and open the file here.')));
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
      toast(`Copied to Patient ${res.patients[0]}.`, 'ok');
      go('/patient/' + res.patients[0]);
    }],
    null,
    ['trash', 'Delete this patient…', async () => {
      const ok = await confirmBox(`Delete Patient ${pt.id}?`, `This deletes the patient, their ${vs.length} ${vs.length === 1 ? 'variant' : 'variants'} and every classification of them from this browser. Download the patient first if you might want them again.`, { yes: 'Delete', danger: true });
      if (!ok) return;
      await db.deletePatient(pt.id);
      toast(`Patient ${pt.id} deleted.`, 'ok');
      go('/patients');
    }]
  ]), { icon: 'dots', cls: 'icon-only', aria: 'More actions for this patient' });
  p.appendChild(pageHead({
    titleNode: [h('span', 'Patient ' + pt.id), pt.ref ? h('span.title-ref', pt.ref) : null, pt.caseId ? h('span.tag.accent', { title: 'Opened from a case file' }, 'Case') : null],
    facts: facts.pairs,
    actions: [
      linkBtn('Details', `/patient/${pt.id}/edit`, { icon: 'pencil' }),
      linkBtn('Report', `/patient/${pt.id}/report`, { icon: 'report' }),
      more
    ]
  }));
  const obs = (pt.phenotypes || []).filter((t) => t.observed !== false).length;
  const fam = (pt.family || []).length || (pt.pedigree && Array.isArray(pt.pedigree.persons) ? pt.pedigree.persons.length : 0);
  p.appendChild(tabs([
    ['overview', 'Overview', `/patient/${pt.id}`],
    ['phenotypes', 'Phenotypes', `/patient/${pt.id}/phenotypes`, obs, 'phenotype'],
    ['variants', 'Variants', `/patient/${pt.id}/variants`, vs.length, 'dna'],
    ['family', 'Family and pedigree', `/patient/${pt.id}/family`, fam || null, 'pedigree'],
    ['browser', 'Genome browser', `/patient/${pt.id}/browser`, null, 'genome'],
    ['report', 'Report', `/patient/${pt.id}/report`, null, 'report'],
    ['history', 'History', `/patient/${pt.id}/history`, null, 'history']
  ], tab, 'Patient ' + pt.id));
  const body = h('div.tab-body');
  p.appendChild(body);
  const mod = await TABS[tab]();
  if (cleanupTab) {
    try { cleanupTab(); } catch (e) { /* ignore */ }
  }
  const r = await mod.render(body, { patient: pt, variants: vs, refresh: () => go(`/patient/${pt.id}/${tab}`, true) });
  cleanupTab = typeof r === 'function' ? r : null;
  return () => {
    if (cleanupTab) {
      try { cleanupTab(); } catch (e) { /* ignore */ }
      cleanupTab = null;
    }
  };
}
