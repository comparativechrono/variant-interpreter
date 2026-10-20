/* A patient's phenotype: HPO terms, observed or excluded, grouped by body system */
import { h, esc, toast, debounce, nowISO, modal, icon } from '../core.js';
import { link } from '../router.js';
import * as db from '../db.js';
import * as HPO from '../hpo.js';
import { section, btn, empty, note, loading, seg } from '../ui.js';

export async function render(root, ctx) {
  const pt = ctx.patient;
  pt.phenotypes = pt.phenotypes || [];
  root.appendChild(loading('Loading the Human Phenotype Ontology…'));
  try {
    await HPO.loadTerms();
  } catch (e) {
    root.innerHTML = '';
    root.appendChild(note('bad', h('p', `The HPO couldn’t be loaded: ${e.message}. Reload the page to try again.`)));
    return;
  }
  root.innerHTML = '';
  const cols = h('div.cols');
  const main = h('div');
  const side = h('aside');
  cols.append(main, side);
  root.appendChild(cols);

  const save = async (what) => {
    await db.savePatient(pt, what);
    drawList();
    drawFit();
  };

  /* ---------- adding terms ---------- */
  let mode = 'observed';
  const q = h('input', { type: 'search', placeholder: 'Type a feature, e.g. seizures, short stature, or an HPO id', 'aria-label': 'Search the HPO', autocomplete: 'off', spellcheck: 'false' });
  const hits = h('div.hpo-hits', { role: 'listbox', 'aria-label': 'Matching HPO terms' });
  const add = async (t) => {
    if (pt.phenotypes.some((x) => x.id === t.id)) {
      const ex = pt.phenotypes.find((x) => x.id === t.id);
      ex.observed = mode === 'observed';
      toast(`${t.name} was already recorded, and it’s now marked ${mode}.`);
    } else {
      // a term and its ancestor are both informative to the patient record only if one is excluded
      const anc = HPO.ancestors(t.id);
      const redundant = pt.phenotypes.filter((x) => x.observed !== false && mode === 'observed' && x.id !== t.id && anc.has(HPO.hpNum(x.id)));
      pt.phenotypes.push({ id: t.id, name: t.name, observed: mode === 'observed', onset: '', note: '', added: nowISO() });
      if (redundant.length) toast(`This term is more specific than ${redundant.map((r) => r.name).join(', ')}, so you could remove the more general one.`, null, 6000);
    }
    q.value = '';
    hits.innerHTML = '';
    await save(`Phenotype ${mode === 'observed' ? 'added' : 'excluded'}: ${t.name} (${t.id})`);
    q.focus();
  };
  const search = debounce(() => {
    hits.innerHTML = '';
    const ms = HPO.search(q.value, { limit: 12 });
    if (!ms.length && q.value.trim().length >= 3) hits.appendChild(h('p.muted.small', 'No term matches that. Try a different word, or fewer words.'));
    for (const m of ms) {
      const t = m.term;
      const b = h('button.hpo-hit', { type: 'button', role: 'option' },
        h('span.hpo-hit-name', t.name, m.via ? h('span.muted', ` (${m.via})`) : null),
        h('span.hpo-id', t.id),
        h('span.hpo-hit-def', t.def ? t.def.slice(0, 160) + (t.def.length > 160 ? '…' : '') : ''));
      b.addEventListener('click', () => add(t));
      hits.appendChild(b);
    }
  }, 120);
  q.addEventListener('input', search);
  q.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      const first = hits.querySelector('button');
      if (first) first.click();
    } else if (e.key === 'ArrowDown') {
      const first = hits.querySelector('button');
      if (first) {
        e.preventDefault();
        first.focus();
      }
    }
  });
  hits.addEventListener('keydown', (e) => {
    const bs = Array.from(hits.querySelectorAll('button'));
    const i = bs.indexOf(document.activeElement);
    if (e.key === 'ArrowDown' && i < bs.length - 1) {
      e.preventDefault();
      bs[i + 1].focus();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      (i > 0 ? bs[i - 1] : q).focus();
    }
  });
  const modeSeg = seg([['observed', 'Observed'], ['excluded', 'Excluded']], mode, (v) => (mode = v), 'Add terms as');
  main.appendChild(section('Add phenotypes', { icon: 'plus', tools: [btn('Find terms in a clinical note…', () => fromText(), { cls: 'small', icon: 'text' })] },
    h('div.row', { style: { alignItems: 'flex-start' } }, h('div.grow', q), h('div', h('span.small.muted', { style: { marginRight: '6px' } }, 'Add as'), modeSeg)),
    h('p.small.muted', { style: { margin: '6px 0' } }, 'Record the most specific term that fits. Features that were looked for and found to be absent should be recorded as excluded. Both help to match the patient with a disease.'),
    hits));

  /* ---------- the patient's terms ---------- */
  const listBox = h('div');
  main.appendChild(listBox);
  function drawList() {
    listBox.innerHTML = '';
    if (!pt.phenotypes.length) {
      listBox.appendChild(empty('No phenotypes yet', 'Search above to add the patient’s features.'));
      return;
    }
    const groups = new Map();
    for (const t of pt.phenotypes) {
      const b = HPO.branch(t.id);
      const key = b ? b.name : 'Other terms';
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(t);
    }
    const obsN = pt.phenotypes.filter((t) => t.observed !== false).length;
    const sec = section(`The patient’s phenotype`, { icon: 'phenotype', tools: [h('span.small.muted', `${obsN} observed, ${pt.phenotypes.length - obsN} excluded`)] });
    for (const [gname, terms] of Array.from(groups).sort((a, b) => a[0].localeCompare(b[0]))) {
      const g = h('div.pheno-group', h('h3', gname));
      for (const t of terms.sort((a, b) => (a.observed === false) - (b.observed === false) || a.name.localeCompare(b.name))) g.appendChild(termRow(t));
      sec.appendChild(g);
    }
    listBox.appendChild(sec);
  }
  function termRow(t) {
    const cur = HPO.term(t.id);
    if (cur && cur.id !== t.id) {
      t.id = cur.id;
      t.name = cur.name;
    }
    const obs = t.observed !== false;
    const toggle = h('button.pheno-state' + (obs ? '.obs' : '.exc'), { type: 'button', title: obs ? 'Observed. Click to mark it as excluded (looked for and absent).' : 'Excluded. Click to mark it as observed.', 'aria-label': `${t.name}: ${obs ? 'observed' : 'excluded'}. Change` }, obs ? 'Observed' : 'Excluded');
    toggle.addEventListener('click', async () => {
      t.observed = !obs;
      await save(`${t.name} marked as ${t.observed ? 'observed' : 'excluded'}`);
    });
    const del = h('button.icon-btn', { type: 'button', title: 'Remove this term', 'aria-label': 'Remove ' + t.name, html: icon('x') });
    del.addEventListener('click', async () => {
      pt.phenotypes = pt.phenotypes.filter((x) => x !== t);
      await save(`Phenotype removed: ${t.name}`);
    });
    const refine = h('button.btn.small.ghost', { type: 'button', title: 'Choose a more specific term under this one' }, 'More specific');
    refine.addEventListener('click', () => chooseChild(t));
    const noteIn = h('input.pheno-note', { type: 'text', placeholder: 'Note (e.g. onset, severity)', 'aria-label': 'Note on ' + t.name, value: t.note || '' });
    noteIn.addEventListener('change', async () => {
      t.note = noteIn.value.trim();
      await save(null);
    });
    return h('div.pheno-row' + (obs ? '' : '.excluded'),
      toggle,
      h('div.pheno-main', h('a', { href: link('/phenotype/' + t.id) }, t.name), ' ', h('span.hpo-id', t.id), cur && cur.def ? h('div.small.muted.pheno-def', cur.def) : null),
      h('div.pheno-tools', cur && cur.children.length ? refine : null, noteIn, del));
  }
  function chooseChild(t) {
    const cur = HPO.term(t.id);
    const box = h('div', h('p.muted', 'Choose a more specific term to put in place of ', h('b', t.name), '.'));
    const list = h('div.hpo-hits');
    for (const n of cur.children) {
      const c = HPO.term(n);
      const b = h('button.hpo-hit', { type: 'button' }, h('span.hpo-hit-name', c.name), h('span.hpo-id', c.id), h('span.hpo-hit-def', (c.def || '').slice(0, 200)));
      b.addEventListener('click', async () => {
        t.id = c.id;
        t.name = c.name;
        m.close();
        await save(`Phenotype made more specific: ${cur.name} → ${c.name}`);
      });
      list.appendChild(b);
    }
    box.appendChild(list);
    const m = modal('More specific terms', box, { wide: true });
  }

  /* ---------- terms from a clinical note ---------- */
  function fromText() {
    const ta = h('textarea', { rows: 6, placeholder: 'Paste a clinic letter or a summary, e.g. “Global developmental delay, hypotonia and seizures from 4 months. No hearing loss.”' });
    const out = h('div');
    const find = () => {
      out.innerHTML = '';
      const found = findTerms(ta.value);
      if (!found.length) {
        out.appendChild(h('p.muted', 'No HPO term names were found in the text. Try searching for the features one at a time instead.'));
        return;
      }
      out.appendChild(h('p.small.muted', 'Untick any that are wrong. Terms that follow “no” or “not” are marked as excluded, so check those too.'));
      for (const f of found) {
        const box = h('input', { type: 'checkbox' });
        box.checked = !pt.phenotypes.some((x) => x.id === f.term.id);
        const sel = h('select', { 'aria-label': 'Observed or excluded' }, h('option', { value: 'observed' }, 'observed'), h('option', { value: 'excluded' }, 'excluded'));
        sel.value = f.negated ? 'excluded' : 'observed';
        f.box = box;
        f.sel = sel;
        out.appendChild(h('label.check.found-term', box, h('span', h('b', f.term.name), ' ', h('span.hpo-id', f.term.id), h('span.muted.small', ` – “${f.text}”`)), sel));
      }
    };
    const m = modal('Find terms in a clinical note', h('div', ta, h('div.btn-row', { style: { margin: '8px 0' } }, btn('Find terms', find, { cls: 'primary small' })), out), {
      wide: true,
      actions: [['Cancel', null, 'ghost'], ['Add the ticked terms', async () => {
        const chosen = Array.from(out.querySelectorAll('.found-term')).map((el, i) => el);
        let n = 0;
        for (const f of lastFound) {
          if (!f.box || !f.box.checked) continue;
          const ex = pt.phenotypes.find((x) => x.id === f.term.id);
          if (ex) ex.observed = f.sel.value === 'observed';
          else pt.phenotypes.push({ id: f.term.id, name: f.term.name, observed: f.sel.value === 'observed', onset: '', note: '', added: nowISO() });
          n++;
        }
        if (n) await save(`${n} phenotypes added from a clinical note`);
      }, 'primary']]
    });
    let lastFound = [];
    const findTerms = (text) => {
      lastFound = textToTerms(text);
      return lastFound;
    };
  }

  /* ---------- what fits ---------- */
  const fitBox = h('div');
  side.appendChild(fitBox);
  let fitToken = 0;
  async function drawFit() {
    const token = ++fitToken;
    fitBox.innerHTML = '';
    const obs = pt.phenotypes.filter((t) => t.observed !== false).map((t) => t.id);
    const exc = pt.phenotypes.filter((t) => t.observed === false).map((t) => t.id);
    const sec = section('Diseases that fit', { level: 'h3', icon: 'target' });
    fitBox.appendChild(sec);
    if (obs.length < 2) {
      sec.appendChild(h('p.muted.small', 'Once the patient has two or more observed terms, the diseases whose HPO annotations best explain them will be listed here.'));
      return;
    }
    sec.appendChild(loading('Comparing with 12,000 diseases…'));
    await new Promise((r) => setTimeout(r, 30));
    const ranked = await HPO.rankDiseases(obs, exc, { limit: 12, withGenesOnly: false });
    if (token !== fitToken) return;
    sec.lastChild.remove();
    const vs = (ctx.variants || []).map((v) => v.gene).filter(Boolean);
    const ol = h('ol.fit-list');
    const top = ranked[0] ? ranked[0].score : 1;
    for (const r of ranked) {
      const d = r.disease;
      const hasVar = d.genes.some((g) => vs.includes(g));
      ol.appendChild(h('li' + (hasVar ? '.hasvar' : ''),
        h('div.fit-h', h('span.fit-name', d.name), h('span.fit-score', { title: 'Average information content of the best matches (higher is better)' }, r.score.toFixed(1))),
        h('div.fit-bar', h('span', { style: { width: Math.max(4, (r.score / top) * 100) + '%' } })),
        h('div.small.muted', d.id.startsWith('OMIM') ? h('a', { href: `https://omim.org/entry/${d.id.slice(5)}`, target: '_blank', rel: 'noopener' }, d.id) : d.id, d.genes.length ? ' – ' : '', d.genes.map((g, i) => [i ? ', ' : '', h('a', { href: link('/gene/' + g) }, h('i', g))]), hasVar ? h('b.fit-flag', ' (a variant in this patient)') : null)));
    }
    sec.appendChild(ol);
    sec.appendChild(h('p.small.muted', 'From the HPO’s disease annotations, version ' + HPO.hpoVersion() + '. Treat it as a list to think with rather than a diagnosis. The annotations are incomplete, and rare features count for more than common ones.'));
    sec.appendChild(h('div.btn-row', h('a.btn.small', { href: link('/match?patient=' + pt.id) }, 'Genes, diseases and similar patients')));
  }

  drawList();
  drawFit();
}

/* find HPO term names (and synonyms) in free text; a "no", "not", "without" or "absent" just before makes it excluded,
   within its own sentence or clause ("No microcephaly. Ataxic gait." excludes only microcephaly) */
function textToTerms(text) {
  const found = new Map();
  for (const clause of String(text || '').split(/[.;:!?\n]+|\bbut\b|\bhowever\b/i)) {
    const words = clause.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().split(' ').filter(Boolean);
    if (words.length) findIn(words, found);
  }
  return Array.from(found.values());
}
function findIn(words, found) {
  // try every run of 1 to 6 words against the HPO's names
  for (let i = 0; i < words.length; i++) {
    for (let n = 6; n >= 1; n--) {
      if (i + n > words.length) continue;
      const phrase = words.slice(i, i + n).join(' ');
      if (phrase.length < 4) continue;
      const ms = HPO.search(phrase, { limit: 3 });
      const exact = ms.find((m) => (m.via || m.term.name).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim() === phrase);
      if (exact) {
        const before = words.slice(Math.max(0, i - 4), i).join(' ');
        const negated = /\b(no|not|without|absent|denies|negative for|nor)\b/.test(before);
        if (!found.has(exact.term.id)) found.set(exact.term.id, { term: exact.term, text: phrase, negated });
        i += n - 1;
        break;
      }
    }
  }
}
