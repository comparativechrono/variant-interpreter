/* =====================================================================
   A patient's family: the pedigree, drawn in Pedigree Studio (a copy of
   the Pedigree workbench's, in a frame: assets/studio), and the
   relatives' results for each of the patient's variants, which the
   variant pages' segregation analysis uses.

   The drawing is the patient's (pt.pedigree), saved as it changes. The
   people in it are read with the Pedigree workbench's reader (risk-
   read.js): their relationship to the proband, sex and status.
   Genotypes are kept on each variant (v.familyGenotypes: person id →
   'het' | 'hom' | 'hemi' | 'ref' | 'untested').
   ===================================================================== */
import { h, icon, toast, debounce, beforeLeaving, modal, dateStr } from '../core.js';
import { link } from '../router.js';
import * as db from '../db.js';
import { btn, field, select, note, checkbox } from '../ui.js';
import { summariseVariant } from '../summary.js';

const GT_SEQ = [['untested', 'Not tested'], ['het', 'Has it (heterozygous)'], ['hom', 'Has it (homozygous)'], ['hemi', 'Has it (hemizygous)'], ['ref', 'Does not have it']];
const GT_CNV = [['untested', 'Not tested'], ['het', 'Has it'], ['ref', 'Does not have it']];
const STATUS = { affected: 'Affected', unaffected: 'Unaffected', carrier: 'Carrier', unknown: 'Not known' };

export async function render(body, { patient: pt, variants: vs }) {
  const seg = await import('../acmg/segregation.js');
  const state = h('span.small.muted', { 'aria-live': 'polite' }, pt.pedigree ? `Saved ${dateStr(pt.updated, true)}` : '');
  const frame = h('iframe.fam-frame', { src: 'assets/studio/index.html', title: 'Pedigree Studio: the patient’s pedigree' });
  const cover = h('div.fam-cover', h('span.spinner'), h('span', 'Opening Pedigree Studio…'));
  let api = null;
  const bar = h('div.fam-bar',
    btn('Start from a few questions…', () => quickDialog(), { cls: 'primary small', icon: 'wand', title: 'Draw the proband, parents, siblings and children from a few answers, then add to the drawing in the Studio' }),
    btn('Tidy', () => api && api.tidy(), { cls: 'small', icon: 'align', title: 'Lay out the pedigree again. You can undo this in the Studio.' }),
    btn('Fit', () => api && api.fit(), { cls: 'small', icon: 'maximize', title: 'Fit the drawing to the frame' }),
    h('span.grow'),
    state);
  body.append(
    h('p.small.muted.fam-help', 'Draw the family in the Studio below. Add relatives from a person’s menu, shade those who are affected, name the condition in the key and mark the proband. The drawing is saved with the patient as you go. Then enter each relative’s results for the patient’s variants in the table underneath. The variant pages use these results for segregation (PP1, BS4) and for de novo and in-trans evidence.'),
    bar,
    h('div.fam-stage', frame, cover));
  const tableBox = h('div.fam-table', { 'aria-live': 'polite' });
  body.append(h('h2.fam-h', 'Relatives and their results'), tableBox);

  let firstSave = true;
  let pending = false;
  const saveDrawing = async () => {
    if (!api) return;
    pending = false;
    let data;
    try {
      data = api.data();
    } catch (e) {
      return;
    }
    pt.pedigree = data && (data.persons || []).length ? data : null;
    const fam = readFamily(seg, pt);
    pt.family = fam ? fam.list : [];
    pt.probandPerson = fam ? fam.proband : null;
    await db.savePatient(pt, firstSave ? 'Pedigree changed' : null);
    firstSave = false;
    state.textContent = 'Saved ' + new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
    drawTable();
  };
  const saveSoon = debounce(saveDrawing, 900);
  const offLeave = beforeLeaving(() => {
    saveSoon.cancel();
    if (pending) saveDrawing();
  });

  frame.addEventListener('load', () => {
    const win = frame.contentWindow;
    api = win && win.pedwbStudio;
    if (!api) {
      cover.innerHTML = '';
      cover.appendChild(h('span', 'Pedigree Studio could not start in this browser. Reload the page to try again.'));
      return;
    }
    try {
      if (pt.pedigree && (pt.pedigree.persons || []).length) api.load(pt.pedigree, { message: `Patient ${pt.id}’s family` });
      else {
        api.clear();
        api.status('There’s no pedigree yet, so start from a few questions or draw it');
      }
    } catch (e) {
      toast('The pedigree could not be shown: ' + e.message, 'error', 8000);
    }
    api.onChange(() => {
      pending = true;
      state.textContent = 'Saving…';
      saveSoon();
    });
    cover.hidden = true;
    if (!pt.pedigree) setTimeout(() => frame.isConnected && !pt.pedigree && quickDialog(true), 300);
  });

  /* ---------- the people, and their results ---------- */
  const drawTable = () => {
    tableBox.innerHTML = '';
    const fam = readFamily(seg, pt);
    if (!fam || !fam.people.length) {
      tableBox.appendChild(h('p.muted', 'The relatives will appear here once you’ve drawn the pedigree.'));
      return;
    }
    if (!fam.proband) tableBox.appendChild(note('warn', h('p', 'Mark the proband in the drawing so that relationships and segregation can be worked out. To do this, select the patient and choose “Proband” in the Studio’s menu.')));
    if (!fam.conditions.length) tableBox.appendChild(note('', h('p', 'Shade the affected relatives and name the condition in the drawing’s key, because segregation needs to know who is affected.')));
    const seqs = vs;
    const tbl = h('table.data.compact.fam-gt');
    const head = h('tr', h('th', { scope: 'col' }, 'Person'), h('th', { scope: 'col' }, 'Relationship'), h('th', { scope: 'col' }, fam.conditions.length ? `Status (${fam.conditions[0].label})` : 'Status'));
    for (const v of seqs) {
      const s = summariseVariant(v);
      head.appendChild(h('th', { scope: 'col' }, h('a', { href: link(`/patient/${pt.id}/variant/${v.id}/family`) }, s.gene ? h('i.gene', s.gene + ' ') : '', h('span.hgvs.small', s.short))));
    }
    head.appendChild(h('th', { scope: 'col' }, 'Notes'));
    tbl.appendChild(h('thead', head));
    const tb = h('tbody');
    pt.relatives = pt.relatives || {};
    for (const p of fam.people) {
      const isProband = p.id === fam.proband;
      const st = fam.conditions.length ? (p.status || {})[fam.conditions[0].key] || 'unknown' : 'unknown';
      const tr = h('tr' + (isProband ? '.fam-proband' : ''),
        h('td', h('span', h('b', p.label), p.name ? h('span.small.muted', ' ' + p.name) : null, p.deceased ? h('span.small.muted', ' (died)') : null)),
        h('td', isProband ? 'Proband (the patient)' : cap(fam.rel[p.id] || 'relative')),
        h('td', STATUS[st] || st));
      for (const v of seqs) {
        if (isProband) {
          tr.appendChild(h('td.small', v.kind === 'cnv' ? 'Has it' : cap(v.zygosity || 'heterozygous')));
          continue;
        }
        const opts = v.kind === 'cnv' ? GT_CNV : GT_SEQ.filter(([k]) => k !== 'hemi' || p.sex === 'M');
        const sel = select(opts, (v.familyGenotypes || {})[p.id] || 'untested', { 'aria-label': `${p.label}’s result for ${summariseVariant(v).short}` });
        sel.addEventListener('change', async () => {
          v.familyGenotypes = Object.assign({}, v.familyGenotypes || {}, { [p.id]: sel.value });
          if (sel.value === 'untested') delete v.familyGenotypes[p.id];
          await db.saveVariant(v, `${p.label} (${fam.rel[p.id] || 'relative'}): ${sel.options[sel.selectedIndex].text.toLowerCase()}`);
          state.textContent = 'Saved ' + new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
          checkInheritance(v, fam);
        });
        tr.appendChild(h('td', sel));
      }
      const ni = h('input', { type: 'text', value: (pt.relatives[p.id] || {}).note || '', placeholder: isProband ? '' : 'e.g. breast cancer at 38', 'aria-label': `Notes on ${p.label}` });
      ni.addEventListener('change', async () => {
        pt.relatives[p.id] = Object.assign({}, pt.relatives[p.id] || {}, { note: ni.value.trim() });
        await db.savePatient(pt, null);
        state.textContent = 'Saved';
      });
      tr.appendChild(h('td', isProband ? h('span.faint.small', '–') : ni));
      tb.appendChild(tr);
    }
    tbl.appendChild(tb);
    // on a phone each relative becomes a card, the cells labelled by their columns (as the variants table does)
    const heads = Array.from(head.children).map((th) => th.textContent.trim());
    tb.querySelectorAll('tr').forEach((tr) => Array.from(tr.children).forEach((td, i) => td.setAttribute('data-label', heads[i] || '')));
    tableBox.appendChild(h('div.table-wrap.vtable', tbl));
    if (!vs.length) tableBox.appendChild(h('p.small.muted', 'Add the patient’s variants on the Variants tab to record who else has them.'));
    const hints = h('div.fam-hints', { 'aria-live': 'polite' });
    tableBox.appendChild(hints);
    for (const v of vs) checkInheritance(v, fam, hints);
  };

  /** what the parents' results say about how the patient got the variant (a nudge, not a change) */
  const checkInheritance = (v, fam, into) => {
    const hints = into || tableBox.querySelector('.fam-hints');
    if (!hints || !fam.proband) return;
    const P = fam.people.find((x) => x.id === fam.proband);
    if (!P) return;
    const g = v.familyGenotypes || {};
    const m = P.mother ? g[P.mother] : null, f = P.father ? g[P.father] : null;
    const has = (x) => x && x !== 'ref' && x !== 'untested';
    let guess = null;
    if (m === 'ref' && f === 'ref') guess = 'denovo-assumed';
    else if (has(m) && has(f)) guess = 'biparental';
    else if (has(m) && (f === 'ref' || !f)) guess = f === 'ref' ? 'maternal' : null;
    else if (has(f) && (m === 'ref' || !m)) guess = m === 'ref' ? 'paternal' : null;
    const id = 'hint-' + v.id;
    const old = hints.querySelector('#' + id);
    if (old) old.remove();
    if (!guess || guess === v.inheritance || (guess === 'denovo-assumed' && v.inheritance === 'denovo-confirmed')) return;
    const words = { 'denovo-assumed': 'de novo, as neither parent has it (confirm parentage before you call it confirmed)', maternal: 'inherited from the mother', paternal: 'inherited from the father', biparental: 'inherited from both parents' };
    const s = summariseVariant(v);
    const fix = btn('Update the inheritance', async () => {
      v.inheritance = guess;
      await db.saveVariant(v, `Inheritance from the parents’ results: ${words[guess]}`);
      toast('Inheritance updated.', 'ok');
      hints.querySelector('#' + id)?.remove();
    }, { cls: 'small' });
    hints.appendChild(h('div.note', { id }, h('p', `The parents’ results suggest that ${s.gene ? s.gene + ' ' : ''}${s.short} is ${words[guess]}. The variant’s page says otherwise. `, fix)));
  };

  /* ---------- a pedigree from a few answers ---------- */
  const quickDialog = (first) => {
    const pSex = select([['female', 'Female'], ['male', 'Male'], ['unknown', 'Not known']], pt.sex === 'female' || pt.sex === 'male' ? pt.sex : 'unknown');
    const pAff = checkbox('The proband is affected', true);
    const parents = checkbox('Draw the parents', true);
    const mAff = checkbox('The mother is affected', false);
    const fAff = checkbox('The father is affected', false);
    const cons = checkbox('The parents are related (consanguineous)', pt.consanguinity === 'yes');
    const gp = checkbox('Draw the grandparents', false);
    const num = (v) => h('input', { type: 'number', min: 0, max: 8, step: 1, value: v, style: { width: '5em' } });
    const bro = num(0), broA = num(0), sis = num(0), sisA = num(0), son = num(0), sonA = num(0), dau = num(0), dauA = num(0);
    const cond = h('input', { type: 'text', value: (pt.assessment && pt.assessment.disease) || ((pt.phenotypes || []).find((t) => t.observed !== false) || {}).name || 'Affected', placeholder: 'The condition, for the key' });
    const row = (label, n, a) => h('div.qp-row', h('span', label), n, h('span.small.muted', 'number affected'), a);
    const bodyEl = h('div.stack',
      first ? h('p', `Patient ${pt.id} doesn’t have a pedigree yet. Answer a few questions to start one, and then add more relatives in the Studio.`) : note('warn', h('p', 'This replaces the drawing in the Studio. You can get it back with Undo there.')),
      h('div.fields', field('The proband’s sex', pSex), field('The condition (for the key)', cond)),
      h('div.qp-checks', pAff.el, parents.el, mAff.el, fAff.el, cons.el, gp.el),
      h('div.qp-rows', row('Brothers', bro, broA), row('Sisters', sis, sisA), row('Sons', son, sonA), row('Daughters', dau, dauA)));
    modal('Start a pedigree', bodyEl, {
      wide: true,
      actions: [['Cancel', null, 'ghost'], ['Draw it', () => {
        const kids = (n, a, sex) => Array.from({ length: Math.min(8, Math.max(0, +n.value || 0)) }, (_, i) => ({ sex, affected: i < (+a.value || 0) }));
        const spec = {
          proband: { sex: pSex.value, affected: pAff.box.checked },
          parents: parents.box.checked, motherAffected: mAff.box.checked, fatherAffected: fAff.box.checked,
          consanguineous: cons.box.checked, grandparents: gp.box.checked && parents.box.checked,
          siblings: kids(bro, broA, 'male').concat(kids(sis, sisA, 'female')),
          children: kids(son, sonA, 'male').concat(kids(dau, dauA, 'female')),
          condition: cond.value.trim() || 'Affected'
        };
        const data = seg.quickPedigree(spec);
        if (!api) return true;
        try {
          api.load(data, { tidy: true, message: 'Pedigree drawn from your answers' });
        } catch (e) {
          toast('The pedigree could not be drawn: ' + e.message, 'error');
          return true;
        }
        saveDrawing();
      }, 'primary']]
    });
  };

  drawTable();
  // leaving the tab: a change not yet saved is saved now
  return () => {
    offLeave();
    saveSoon.cancel();
    if (pending) saveDrawing();
  };
}

/** the drawing as people with relationships to the proband: { people, conditions, proband, rel, list } */
export function readFamily(seg, pt) {
  if (!pt.pedigree || !(pt.pedigree.persons || []).length) return null;
  let fam;
  try {
    fam = seg.readDrawing(pt.pedigree);
  } catch (e) {
    return null;
  }
  const proband = (fam.people.find((p) => p.proband) || {}).id || (fam.people.some((p) => p.id === pt.probandPerson) ? pt.probandPerson : null);
  const rel = proband ? seg.relationships(fam, proband) : {};
  const cond = fam.conditions[0];
  const list = fam.people.map((p) => ({
    id: p.id, label: p.label, name: p.name || '', relation: rel[p.id] || 'relative', sex: p.sex,
    affected: cond ? (p.status || {})[cond.key] || 'unknown' : 'unknown', deceased: !!p.deceased
  }));
  return Object.assign({}, fam, { proband, rel, list });
}
const cap = (s) => (s ? s[0].toUpperCase() + s.slice(1) : s);
export { icon };

/** the relatives as a list (relationship, sex, status), from the drawing; [] when there is none */
export async function familyList(pt) {
  if (!pt.pedigree || !(pt.pedigree.persons || []).length) return [];
  const seg = await import('../acmg/segregation.js');
  const fam = readFamily(seg, pt);
  return fam ? fam.list : [];
}
