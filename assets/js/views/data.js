/* Cases and data: the example cases, files from a tutor, exporting and importing work, and clearing it */
import { h, esc, fetchJSON, toast, downloadText, pickFiles, confirmBox, modal, dateStr, fmt, icon, safeHTML } from '../core.js';
import { go } from '../router.js';
import * as db from '../db.js';
import { CFG } from '../settings.js';
import * as settings from '../settings.js';
import { page, pageHead, section, btn, linkBtn, note, table } from '../ui.js';

export async function render(root) {
  const p = page();
  root.appendChild(p);
  p.appendChild(pageHead({
    title: 'Cases and data',
    lede: 'Open a practice case or a case file from your tutor. You can also save your work as a file, to keep a copy or to move it to another computer.'
  }));

  // ---- cases
  const casesBox = h('div', h('p.muted', 'Loading the cases…'));
  p.appendChild(section('Cases', { icon: 'book' }, casesBox));
  try {
    const idx = await fetchJSON(CFG.cases || 'data/cases/index.json');
    const have = await db.listPatients();
    casesBox.innerHTML = '';
    const rows = (idx.cases || []).map((c) => Object.assign({}, c, { _copies: have.filter((x) => x.caseId === c.id) }));
    casesBox.appendChild(table([
      { key: 'title', label: 'Case', fmt: (r) => h('div', h('b', r.title), h('div.small.muted', r.teaser || '')) },
      { key: 'tags', label: 'Covers', fmt: (r) => h('div.row', { style: { gap: '4px' } }, (r.tags || []).map((t) => h('span.tag', t))) },
      { key: 'open', label: '', fmt: (r) => h('div.row', { style: { justifyContent: 'flex-end' } },
        r._copies.length ? linkBtn('Your copy', '/patient/' + r._copies[0].id, { cls: 'small' }) : null,
        btn(r._copies.length ? 'Open again' : 'Open', () => openCase(r), { cls: 'small' + (r._copies.length ? '' : ' primary') })) }
    ], rows, { caption: 'Cases' }));
  } catch (e) {
    casesBox.innerHTML = '';
    casesBox.appendChild(note('warn', h('p', `The list of cases couldn’t be loaded: ${e.message}. Reload the page to try again.`)));
  }

  // ---- files
  p.appendChild(section('Open a file', { icon: 'import' },
    h('p', 'Open a case file from your tutor, or work you downloaded earlier. Both are ', h('code', '.json'), ' files saved by the Variant interpreter. The file’s patients are added to the ones already in this browser, and nothing is replaced.'),
    h('div.btn-row', btn('Choose a file…', () => importFile(), { cls: 'primary', icon: 'openfolder' }))));

  // ---- export
  const ps = await db.listPatients();
  const exportBox = h('div');
  p.appendChild(section('Keep or hand in your work', { icon: 'export' }, exportBox));
  exportBox.appendChild(h('p', 'Your patients are kept in this browser, on this computer. Shared computers often clear their browsers when you log out, so download your work at the end of each session. You can open the file here again, or on any other computer.'));
  exportBox.appendChild(h('div.btn-row',
    btn(`Download all patients${ps.length ? ` (${fmt(ps.length)})` : ''}`, () => exportAll(), { cls: 'primary', icon: 'download', disabled: !ps.length }),
    btn('Download some…', () => exportSome(ps), { icon: 'list', disabled: !ps.length })));

  // ---- storage
  const est = await db.usage();
  const cached = await db.cacheSize();
  const store = h('div');
  p.appendChild(section('What this browser keeps', { icon: 'database' }, store));
  store.appendChild(h('p', `This browser holds ${fmt(ps.length)} ${ps.length === 1 ? 'patient' : 'patients'} and ${fmt(cached)} saved ${cached === 1 ? 'answer' : 'answers'} from the online databases, which help variants open quickly the second time.` +
    (est && est.usage != null ? ` In all, the site uses about ${fmt(est.usage / 1048576, 1)} MB of this browser’s storage.` : '')));
  store.appendChild(h('div.btn-row',
    btn('Forget the saved answers', async () => {
      await db.cacheClear();
      toast('The saved answers have been forgotten. They’ll be fetched again when you next need them.', 'ok');
      go('/data', true);
    }, { icon: 'refresh', title: 'Annotations are fetched again the next time each variant is opened' }),
    btn('Remove everything…', async () => {
      const ok = await confirmBox('Remove everything?', 'This removes every patient, variant and classification kept in this browser, as well as your settings, and it can’t be undone. If you want to keep your work, download it first.', { yes: 'Remove everything', danger: true });
      if (!ok) return;
      await db.wipeAll();
      settings.reset();
      toast('Everything has been removed from this browser.', 'ok');
      go('/', true);
    }, { cls: 'danger', icon: 'trash' })));
}

export async function exportAll(ids) {
  const doc = await db.exportData(ids || null);
  const who = (settings.get('name') || '').trim().replace(/[^\w-]+/g, '-');
  const day = new Date().toISOString().slice(0, 10);
  downloadText(JSON.stringify(doc, null, 1), `variant-interpreter-${who ? who + '-' : ''}${day}.json`, 'application/json');
  toast(`Downloaded ${doc.patients.length} ${doc.patients.length === 1 ? 'patient' : 'patients'}.`, 'ok');
}

function exportSome(ps) {
  const boxes = ps.map((x) => {
    const b = h('input', { type: 'checkbox', value: x.id });
    b.checked = true;
    return [b, h('label.check', b, h('span', `Patient ${x.id}${x.ref ? ' – ' + x.ref : ''}`))];
  });
  modal('Download some patients', h('div', { style: { display: 'flex', flexDirection: 'column', gap: '6px' } }, boxes.map((b) => b[1])), {
    actions: [['Cancel', null, 'ghost'], ['Download', () => exportAll(boxes.filter((b) => b[0].checked).map((b) => b[0].value)), 'primary']]
  });
}

export async function importFile() {
  const [file] = await pickFiles('.json,application/json');
  if (!file) return;
  let doc;
  try {
    doc = JSON.parse(await file.text());
  } catch (e) {
    toast('That file isn’t JSON, so it can’t be from the Variant interpreter. Check that you chose the right file.', 'error');
    return;
  }
  await importDoc(doc, file.name);
}

export async function importDoc(doc, name, opts = {}) {
  const chk = db.checkImport(doc);
  if (!chk.ok) {
    toast(chk.message, 'error', 9000);
    return null;
  }
  const res = await db.importData(doc, opts);
  toast(`Opened ${res.patients.length} ${res.patients.length === 1 ? 'patient' : 'patients'}${name ? ' from ' + name : ''}.`, 'ok');
  if (res.patients.length === 1) go('/patient/' + res.patients[0]);
  else go('/patients');
  return res;
}

/** a case from the site's list: show its brief, then add it as a patient */
export async function openCase(c) {
  let doc;
  try {
    doc = await fetchJSON(c.file);
  } catch (e) {
    toast(`The case couldn’t be loaded: ${e.message}. Reload the page to try again.`, 'error');
    return;
  }
  const info = doc.case || {};
  const have = (await db.listPatients()).filter((x) => x.caseId === c.id);
  const body = h('div',
    info.brief ? h('div.case-brief', safeHTML(info.brief)) : h('p', c.teaser || ''),
    info.tasks && info.tasks.length ? h('div', h('h3', { style: { margin: '10px 0 4px' } }, 'What to do'), h('ol', info.tasks.map((t) => h('li', t)))) : null,
    info.source ? h('p.small.muted', info.source) : null,
    have.length ? note('warn', h('p', `You already have ${have.length === 1 ? 'a copy' : have.length + ' copies'} of this case (Patient ${have.map((x) => x.id).join(', ')}). Opening it again makes a fresh copy beside ${have.length === 1 ? 'it' : 'them'}.`)) : null);
  modal(c.title, body, {
    wide: true,
    actions: [
      ['Cancel', null, 'ghost'],
      // with a copy already, going back to it is the usual wish; a fresh copy is the other choice
      have.length ? ['Open a fresh copy', () => importDoc(doc, null, { caseId: c.id })] : null,
      have.length ? ['Go to your copy', () => go('/patient/' + have[0].id), 'primary'] : ['Open the case', () => importDoc(doc, null, { caseId: c.id }), 'primary']
    ].filter(Boolean)
  });
}
