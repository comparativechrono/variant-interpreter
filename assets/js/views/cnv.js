/* =====================================================================
   A copy-number variant's page: what the region holds, its dosage-
   sensitive genes and regions, how common such a CNV is, ClinVar's
   CNVs over it, the patient's inheritance, and the genome browser,
   beside the scoring panel of the ACMG/ClinGen standards (Riggs et al.
   2020). For a patient's CNV (saved as it is worked on), or for one
   looked up from the search box (which can then be added to a patient).

   Its record (db.saveVariant):
     { kind: 'cnv', assembly, input, chrom, start, end, cnvType: 'loss'|'gain',
       copyNumber, inheritance, genesSummary, cnv: { items, notes },
       classification: { saved, history }, contribution, notes, expected? }
   ===================================================================== */
import { h, esc, icon, toast, debounce, beforeLeaving, modal, popmenu, copyText, dateStr, nowISO, confirmBox, fmt, fmtAF } from '../core.js';
import { go, link, setLeaveGuard } from '../router.js';
import * as db from '../db.js';
import * as settings from '../settings.js';
import { page, crumbs, btn, linkBtn, note, loading, clsBadge, select, field, factList, table, ext, answerBy } from '../ui.js';
import { readCNV, readRegion, fmtRegion, fmtSize, normChrom, chromOK } from '../parse.js';
import { INHERITANCE, inheritanceText, CNV_COPIES, CONTRIBUTION, signerName } from '../summary.js';
import { regionGenes, dosageRegions, clinvarCNVs, dgvGold, gnomadSVs, cytobands, iscn, GNOMAD_SV_MAX, clingenGeneUrl } from '../api/cnv-sources.js';
import { suggestCNV, geneCount, hiSources } from '../cnv/suggest.js';
import { CNVScore, cnvPanel, itemsBox, pts2, CLS_WORD, SECTION_TITLES } from '../cnv/panel.js';
import { genesTable, regionsTable, popTable, clinvarTable, clinvarCounts, dosageSummary, placeText, dsBadge, pct, diseaseName } from '../cnv/tables.js';
import { RUBRIC, itemOf } from '../cnv/rubric.js';
import { genomeBrowser } from '../widgets/genome.js';
import { sectionNote, drawSectionInto } from './evidence-common.js';
import { THRESH } from '../genes.js';

const KIND = { loss: 'Loss', gain: 'Gain' };
const kindWord = (type, n) => (type === 'loss' ? (n === 1 ? 'deletion' : 'deletions') : n === 1 ? 'duplication' : 'duplications');
/** how common: 'is in 0.35% of people' or 'has a frequency of 1.9 × 10⁻⁴' */
const afPhrase = (af) => (af == null ? 'has no frequency given' : af >= 0.001 ? `is in ${(af * 100).toFixed(af >= 0.1 ? 0 : 2)}% of people` : `has a frequency of ${fmtAF(af)}`);
const signed = (x) => `${x > 0 ? '+' : x < 0 ? '−' : ''}${pts2(x)}`;
const hashQuery = () => new URLSearchParams((location.hash.split('?')[1]) || '');

export async function render(root, params = {}) {
  if (params.variant) return cnvPage(root, { v: params.variant, pt: params.patient, section: params.section });
  return lookedUp(root, String(params.query || ''));
}

/* ---------------- a CNV typed into the search box ---------------- */
async function lookedUp(root, q) {
  const hq = hashQuery();
  const text = q.replace(/\?.*$/, '').trim();
  const r = readCNV(text) || (() => {
    const g = readRegion(text);
    return g ? Object.assign({ kind: 'cnv', type: null }, g) : null;
  })();
  const p = page('narrow');
  if (!r || !chromOK(r.chrom) || !(r.end > r.start)) {
    root.appendChild(p);
    p.appendChild(crumbs([['Home', '/'], ['Copy-number variant']]));
    p.appendChild(h('h1', 'The page can’t read this as a copy-number variant'));
    p.appendChild(note('warn', h('p', 'Try writing it as a region with “del” or “dup”, for example ', h('code', 'del 22:18912231-21465672'), ', ', h('code', 'dup chr17:16,800,000-20,500,000'), ' or ', h('code', 'arr[GRCh38] 22q11.21(18912231_21465672)x1'), '.')));
    return;
  }
  const asm = r.assembly || (hq.get('assembly') === 'GRCh37' ? 'GRCh37' : hq.get('assembly') === 'GRCh38' ? 'GRCh38' : settings.get('assembly'));
  let type = r.type || (hq.get('type') === 'gain' || hq.get('type') === 'loss' ? hq.get('type') : null);
  if (!type) {
    // a region without a direction: ask which
    root.appendChild(p);
    p.appendChild(crumbs([['Home', '/'], ['Copy-number variant']]));
    p.appendChild(h('h1', `A copy-number change of ${fmtRegion(r.chrom, r.start, r.end)}`));
    p.appendChild(h('p', `The region spans ${fmtSize(r.end - r.start + 1)} on ${asm}. Is it a loss or a gain?`));
    const where = `${normChrom(r.chrom)}:${r.start}-${r.end}`;
    p.appendChild(h('div.btn-row',
      linkBtn('A loss (deletion)', `/cnv/${encodeURIComponent('del ' + where)}?assembly=${asm}`, { cls: 'primary', icon: 'minus' }),
      linkBtn('A gain (duplication)', `/cnv/${encodeURIComponent('dup ' + where)}?assembly=${asm}`, { cls: 'primary', icon: 'plus' }),
      linkBtn('Just look at the region', `/region/${encodeURIComponent(where)}?assembly=${asm}`, { icon: 'region' })));
    return;
  }
  const cn = r.copyNumber != null ? r.copyNumber : hq.get('cn') != null && hq.get('cn') !== '' ? +hq.get('cn') : type === 'loss' ? 1 : 3;
  const v = {
    id: null, patientId: null, kind: 'cnv', assembly: asm, input: text,
    chrom: normChrom(r.chrom), start: r.start, end: r.end, cnvType: type, copyNumber: cn,
    inheritance: 'unknown', genesSummary: '', cnv: { items: {}, notes: {} }, classification: {}, contribution: ''
  };
  return cnvPage(root, { v, pt: null, q: text });
}

/* ---------------- the page ---------------- */
async function cnvPage(root, { v, pt, section }) {
  const asm = v.assembly || 'GRCh38';
  v.cnvType = v.cnvType === 'gain' ? 'gain' : 'loss';
  v.cnv = v.cnv || { items: {}, notes: {} };
  v.classification = v.classification || {};
  v.notes = v.notes || {};
  const type = v.cnvType;
  const p = page('full.vpage.cnvpage');
  root.appendChild(p);
  const sc = new CNVScore(v, { showSuggestions: settings.get('suggestions') === 'show' });
  const ctx = { v, pt, asm, sc, type, data: {}, status: {}, errors: {}, sections: {}, cleanups: [] };

  /* ---------- saving: a patient's CNV is saved as it is worked on ---------- */
  let dirty = false;
  const stateEl = h('span.small.muted', { 'aria-live': 'polite' }, v.id ? '' : 'Not saved until you add it to a patient');
  const saveNow = async (what) => {
    if (!v.patientId) {
      dirty = true;
      return;
    }
    await db.saveVariant(v, what);
    dirty = false;
    stateEl.textContent = 'Saved ' + new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
  };
  const saveSoon = debounce(() => saveNow(null), 700);
  ctx.save = (what) => (what ? saveNow(what) : saveSoon());
  const offLeave = beforeLeaving(() => saveSoon.flush());
  sc.on((code, quiet) => {
    if (quiet) return;
    ctx.save();
  });
  setLeaveGuard(async () => {
    if (!v.patientId && dirty && Object.keys(v.cnv.items).length) return !window.confirm('Leave without adding this CNV to a patient? Its scoring will be lost.');
    return false;
  });

  /* ---------- the frame ---------- */
  p.appendChild(crumbs(pt ? [['Patients', '/patients'], [`Patient ${pt.id}`, `/patient/${pt.id}`], ['Variants', `/patient/${pt.id}/variants`], ['Copy-number variant']] : [['Home', '/'], ['Copy-number variant']]));
  const head = h('div.vhead');
  p.appendChild(head);
  const nav = h('nav.vnav', { 'aria-label': 'Evidence sections' });
  const main = h('div.vmain');
  const side = h('aside.vside');
  p.appendChild(h('div.vgrid', nav, main, side));

  for (const S of SECTIONS) {
    const el = h('section.vsec', { id: 'sec-' + S.key, 'aria-labelledby': 'h-' + S.key });
    const body = h('div.vsec-b');
    el.append(h('div.vsec-h', h('h2', { id: 'h-' + S.key, html: icon(S.icon) + esc(S.title) }), h('span.vsec-status')), body);
    main.appendChild(el);
    ctx.sections[S.key] = { S, el, body };
    const a = h('a', { href: '#sec-' + S.key, dataset: { key: S.key } }, h('span', { html: icon(S.icon) }), S.title);
    a.addEventListener('click', (e) => {
      e.preventDefault();
      scrollTo(S.key);
    });
    nav.appendChild(a);
  }
  const drawSection = (key) => {
    const s = ctx.sections[key];
    if (s) drawSectionInto(s, ctx);
  };
  ctx.redraw = (keys) => (keys || Object.keys(ctx.sections)).forEach(drawSection);
  const scrollTo = (key) => {
    const s = ctx.sections[key];
    if (s) s.el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };
  ctx.scrollTo = scrollTo;
  const io = new IntersectionObserver((entries) => {
    for (const e of entries) if (e.isIntersecting) nav.querySelectorAll('a').forEach((a) => a.classList.toggle('active', a.dataset.key === e.target.id.slice(4)));
  }, { rootMargin: '-20% 0px -70% 0px' });
  Object.values(ctx.sections).forEach((s) => io.observe(s.el));

  /* ---------- the panel ---------- */
  const saveBox = h('div.acmg-save');
  let drawSaveBox = null;
  const panel = cnvPanel(sc, { footer: saveBox, onChange: () => drawSaveBox && drawSaveBox() });
  side.appendChild(panel);
  drawSaveBox = () => {
    saveBox.innerHTML = '';
    const r = sc.result();
    const s = v.classification.saved;
    if (!v.patientId) {
      saveBox.append(h('p.small.muted', 'You’ve looked this CNV up, but it isn’t saved to a patient yet.'), btn('Add to a patient…', () => addToPatient(ctx), { cls: 'primary', icon: 'plus' }));
      return;
    }
    if (s) saveBox.appendChild(h('p.small', 'Last signed as ', clsBadge(s.cls, { short: true }), `${signerName(s.by) ? ' by ' + s.by : ''} on ${dateStr(s.at, true)}`, s.cls !== r.cls ? h('span.res-differ', ' (the calculated class has changed since)') : null));
    saveBox.appendChild(btn(s ? 'Sign the classification again' : 'Sign the classification', () => signOff(ctx), { cls: 'primary', icon: 'badgeCheck', title: 'Record this classification in the CNV’s history, with your name, the date and the points' }));
    saveBox.appendChild(h('p.small.muted', { style: { marginTop: '6px' } }, 'Your work is saved as you go. Signing adds the classification to the CNV’s history and to the report.'));
  };
  drawSaveBox();
  ctx.drawSaveBox = drawSaveBox;

  /* ---------- the heading ---------- */
  const drawHead = () => {
    const d = ctx.data;
    head.innerHTML = '';
    const where = d.bands ? d.bands.text : `chromosome ${v.chrom}`;
    const n = d.genes ? geneCount(d.genes.filter((g) => g.pc)) : null;
    const cnText = (CNV_COPIES.find(([k]) => +k === +v.copyNumber) || [null, v.copyNumber != null ? `${v.copyNumber} copies` : 'not given'])[1];
    const isc = iscn(v, d.bands);
    const title = h('h1.vtitle', h('span.cnv-kw.' + type, KIND[type]), ' ', h('span', `of ${where}`), ' ', h('span.hgvs.vp', fmtSize(v.end - v.start + 1)));
    const copyIscn = h('button.icon-btn.cnv-copy', { type: 'button', title: 'Copy the ISCN description', 'aria-label': 'Copy the ISCN description', html: icon('copy') });
    copyIscn.addEventListener('click', () => copyText(isc).then(() => toast('Copied: ' + isc)));
    const facts = factList([
      ['Region', h('span.hgvs', `${asm} ${fmtRegion(v.chrom, v.start, v.end)}`)],
      ['Copy number', cnText],
      ['Genes', n ? `${n.counted} protein-coding${n.counted !== n.all ? ` (${n.all} before families are counted once)` : ''}` : d.genes ? 'No protein-coding genes' : '…'],
      ['ISCN', h('span.row', { style: { gap: '4px', flexWrap: 'nowrap' } }, h('span.hgvs', isc), copyIscn)],
      pt ? ['Inheritance', inheritanceText(v.inheritance)] : null
    ].filter(Boolean));
    const r = sc.result();
    const clsEl = h('div.vhead-cls', clsBadge(r.cls, { big: true }), h('span.small.muted', r.rows.length ? `${signed(r.total)} points: ${sc.summary(r)}` : 'Nothing scored yet'));
    head.append(
      h('div.vhead-l', title, facts),
      h('div.vhead-r', clsEl,
        h('div.btn-row',
          linkBtn('Region', `/region/${encodeURIComponent(`${v.chrom}:${v.start}-${v.end}`)}?assembly=${asm}`, { cls: 'small', icon: 'region', title: 'Open the region’s page, with its genes and curations but no scoring' }),
          btn('', (e) => moreMenu(e.currentTarget), { cls: 'small icon-only', icon: 'dots', aria: 'More' })),
        stateEl));
  };
  sc.on(() => {
    const el = head.querySelector('.vhead-cls');
    if (!el) return;
    const r = sc.result();
    el.innerHTML = '';
    el.append(clsBadge(r.cls, { big: true }), h('span.small.muted', r.rows.length ? `${signed(r.total)} points: ${sc.summary(r)}` : 'Nothing scored yet'));
  });
  const moreMenu = (anchor) => popmenu(anchor, [
    ['copy', 'Copy the ISCN description', () => copyText(iscn(v, ctx.data.bands)).then(() => toast('Copied.'))],
    ['copy', 'Copy the region', () => copyText(`${fmtRegion(v.chrom, v.start, v.end)} (${asm})`).then(() => toast('Copied.'))],
    ['genome', 'Open in the genome browser', () => go(`/browser?locus=chr${v.chrom}:${v.start}-${v.end}&assembly=${asm}${pt ? '&patient=' + pt.id : ''}`)],
    ['refresh', 'Fetch the data again', () => load(true)],
    v.patientId ? ['report', 'Open the patient’s report', () => go(`/patient/${v.patientId}/report`)] : null,
    v.patientId ? null : ['plus', 'Add to a patient…', () => addToPatient(ctx)],
    v.patientId ? ['trash', 'Remove this CNV from the patient…', async () => {
      if (await confirmBox('Remove this CNV?', 'Its scoring and notes will go too, and you can’t undo this.', { yes: 'Remove', danger: true })) {
        await db.deleteVariant(v.id);
        toast('Removed.', 'ok');
        go(`/patient/${v.patientId}/variants`);
      }
    }] : null
  ].filter(Boolean));
  ctx.drawHead = drawHead;

  /* ---------- the data ---------- */
  const refreshSuggestions = () => {
    const d = ctx.data;
    try {
      const pop = [];
      for (const x of (d.gnomad && d.gnomad.list) || []) if (!(x.filters || []).length) pop.push({ source: d.gnomad.dataset, id: x.id, type: x.type === 'both' ? type : x.type, af: x.af, coverOfCnv: x.coverOfCnv });
      for (const x of d.dgv || []) pop.push({ source: 'The DGV gold standard set', id: x.id, type: x.type, af: x.af, coverOfCnv: x.coverOfCnv });
      const fam = d.family || {};
      const parentAffected = /^maternal/.test(v.inheritance) ? fam.mother : /^paternal/.test(v.inheritance) ? fam.father : null;
      sc.setSuggestions(suggestCNV({ type, start: v.start, end: v.end, genes: d.genes || [], regions: d.regions || [], pop, inheritance: pt ? v.inheritance || 'unknown' : null, parentAffected: parentAffected == null ? null : parentAffected }));
    } catch (e) {
      console.error('suggestions', e);
    }
  };
  ctx.refreshSuggestions = refreshSuggestions;
  const DEPS = Object.fromEntries(SECTIONS.map((S) => [S.key, S.deps || []]));
  const arrived = (key) => {
    const keys = Object.keys(DEPS).filter((k) => DEPS[k].includes(key));
    if (key === 'genes' || key === 'bands') drawHead();
    ctx.redraw(keys);
    refreshSuggestions();
  };
  const fetchOne = async (key, fn) => {
    ctx.status[key] = 'loading';
    try {
      ctx.data[key] = await fn();
      ctx.status[key] = 'ok';
    } catch (e) {
      console.warn(key, e);
      ctx.status[key] = 'error';
      ctx.errors[key] = e.message || String(e);
    }
    arrived(key);
  };
  const load = (fresh) => {
    if (fresh) {
      ctx.data = { family: ctx.data.family };
      ctx.redraw(['summary', 'genes', 'dosage', 'population', 'clinvar']);
    }
    const { chrom, start, end } = v;
    // the CNV in a few words for the lists and the report: a dosage-sensitive ClinGen region it holds, named, then
    // its dosage-sensitive genes first (ClinGen's score 3 for this kind of CNV) and the rest in order
    const summarise = () => {
      const gs = ctx.data.genes;
      if (!gs) return;
      const key = v.cnvType === 'gain' ? 'ts' : 'hi';
      const pc = gs.filter((g) => g.pc);
      const n = geneCount(pc);
      const names = pc.filter((g) => g[key] === 3).concat(pc.filter((g) => g[key] !== 3)).map((g) => g.symbol);
      const genes = names.length ? `${names.slice(0, 6).join(', ')}${names.length > 6 ? ', …' : ''} (${n.counted} protein-coding ${n.counted === 1 ? 'gene' : 'genes'})` : 'No protein-coding genes';
      const reg = (ctx.data.regions || []).filter((r) => r[key] === 3 && (r.whole || r.coverOfRegion >= 0.9)).sort((a, b) => b.end - b.start - (a.end - a.start))[0];
      const summary = reg && reg.name ? `${reg.name}: ${genes}` : genes;
      if (v.genesSummary !== summary) {
        v.genesSummary = summary;
        if (v.patientId) ctx.save();
      }
    };
    return Promise.all([
      fetchOne('genes', async () => {
        const gs = await regionGenes(chrom, start, end, asm);
        return gs;
      }).then(summarise),
      fetchOne('regions', () => dosageRegions(chrom, start, end, asm)).then(summarise),
      fetchOne('bands', () => cytobands(chrom, start, end, asm)),
      fetchOne('clinvar', () => clinvarCNVs(chrom, start, end, asm, { fresh })),
      fetchOne('gnomad', () => gnomadSVs(chrom, start, end, asm)),
      fetchOne('dgv', () => dgvGold(chrom, start, end, asm, { fresh })),
      fetchOne('family', () => parentsOf(pt))
    ]);
  };
  drawHead();
  ctx.redraw();
  load(false).then(() => {
    if (section) scrollTo(section);
  });
  if (section) setTimeout(() => scrollTo(section), 300);
  return () => {
    saveSoon.flush();
    offLeave();
    io.disconnect();
    setLeaveGuard(null);
    for (const fn of ctx.cleanups) {
      try {
        fn();
      } catch (e) {
        /* gone already */
      }
    }
  };
}

/** whether the patient's parents are affected, from the pedigree: { mother, father } (true, false or null) */
async function parentsOf(pt) {
  if (!pt || !pt.pedigree || !(pt.pedigree.persons || []).length) return { mother: null, father: null, drawn: false };
  const seg = await import('../acmg/segregation.js');
  const fam = seg.readDrawing(pt.pedigree);
  const proband = fam.people.find((x) => x.proband) || fam.people.find((x) => x.id === pt.probandPerson);
  if (!proband) return { mother: null, father: null, drawn: true, noProband: true };
  const status = (id) => {
    const x = fam.people.find((y) => y.id === id);
    if (!x || !fam.conditions.length) return null;
    const s = Object.values(x.status || {});
    if (s.includes('affected')) return true;
    if (s.length && s.every((k) => k === 'unaffected')) return false;
    return null;
  };
  return { mother: status(proband.mother), father: status(proband.father), drawn: true, hasMother: !!proband.mother, hasFather: !!proband.father };
}

/* ================================================================
   The sections
   ================================================================ */
function waitingFor(ctx, key, text) {
  const st = ctx.status[key];
  if (st === 'error') return note('bad', h('p', `Asking ${text} didn’t work (${ctx.errors[key]}). The rest of the page still works, and you can try “Fetch the data again” from the ⋯ menu in a minute.`));
  if (st !== 'ok') return loading(`Asking ${text}…`);
  return null;
}

function drawSummary(ctx, body) {
  const d = ctx.data, v = ctx.v, type = ctx.type;
  const rows = [];
  if (d.genes) {
    const pc = d.genes.filter((g) => g.pc);
    const n = geneCount(pc);
    const whole = pc.filter((g) => g.whole).length;
    // section 3 counts a family of genes (olfactory receptors, say) once; the whole/part split is of every gene
    rows.push(['Genes', `${n.counted} protein-coding ${n.counted === 1 ? 'gene' : 'genes'}${n.all !== n.counted ? ` as section 3 counts them (${n.all} before each family of genes is counted once)` : ''}${pc.length ? `, and ${whole === pc.length ? (pc.length === 1 ? 'it lies' : 'all of them lie') : `${whole} of the ${pc.length} lie`} wholly inside the CNV` : ''}`, 'genes']);
    const key = type === 'loss' ? 'hi' : 'ts';
    const est = pc.filter((g) => g[key] === 3);
    const reg = (d.regions || []).filter((r) => r[key] === 3);
    const benign = (d.regions || []).filter((r) => r[key] === 40);
    const bits = [];
    const sens = type === 'loss' ? 'haploinsufficient' : 'triplosensitive';
    const and = (xs) => (xs.length < 2 ? xs.join('') : xs.slice(0, -1).join(', ') + ' and ' + xs[xs.length - 1]);
    const share = (r) => `${r.whole ? 'all' : pct(r.coverOfRegion)} of the ${r.name || r.id}`;
    if (reg.length === 1) bits.push(`It covers ${reg[0].whole ? 'all' : pct(reg[0].coverOfRegion)} of an established ${sens} region, the ${reg[0].name || reg[0].id}`);
    else if (reg.length) bits.push(`It overlaps ${reg.length} established ${sens} regions, covering ${and(reg.map(share))}`);
    if (est.length) {
      const names = est.slice(0, 4).map((g) => g.symbol + (g.whole ? '' : ' (in part)'));
      if (est.length > 4) names.push(`${est.length - 4} more`);
      bits.push(`It contains ${est.length === 1 ? `an established ${sens} gene` : `${est.length} established ${sens} genes`}, ${and(names)}`);
    }
    if (benign.length) bits.push(benign.length === 1 ? `It overlaps ClinGen’s established benign region ${benign[0].name || benign[0].id}` : `It overlaps ${benign.length} of ClinGen’s established benign regions, such as ${benign[0].name || benign[0].id}`);
    if (!bits.length) {
      const pred = pc.filter((g) => (type === 'loss' ? hiSources(g.hiWhy || []) >= 2 : (g.tsWhy || []).length >= 1)); // pLI and LOEUF count as one, as for 2H
      const names = pred.slice(0, 4).map((g) => g.symbol);
      if (pred.length > 4) names.push(`${pred.length - 4} more`);
      bits.push(`It contains no established ${sens} gene or region${pred.length ? `, but ${pred.length === 1 ? 'one gene is' : pred.length + ' genes are'} predicted to be ${sens} (${and(names)})` : ''}`);
    }
    rows.push(['Dosage', bits.length > 1 ? bits.join('. ') + '.' : bits[0], 'dosage']);
  } else rows.push(['Genes', ctx.status.genes === 'error' ? 'Could not be fetched' : '…', 'genes']);
  // population
  const g = d.gnomad;
  if (g && !g.skipped) {
    const same = g.list.filter((x) => (x.type === type || x.type === 'both') && x.coverOfCnv >= 0.5).sort((a, b) => (b.af || 0) - (a.af || 0));
    rows.push(['Population', same.length ? `${same.length} ${kindWord(type, same.length)} in ${g.dataset} ${same.length === 1 ? 'covers' : 'cover'} at least half of it, and ${same.length === 1 ? 'it' : 'the most frequent'} ${afPhrase(same[0].af)}` : `No ${kindWord(type, 1)} in ${g.dataset} covers half of it`, 'population']);
  } else rows.push(['Population', g && g.skipped ? 'Too large to compare with gnomAD’s structural variants here' : ctx.status.gnomad === 'error' ? 'Could not be fetched' : '…', 'population']);
  // ClinVar
  const cv = d.clinvar;
  if (cv) {
    const same = cv.list.filter((x) => x.type === type);
    const similar = same.filter((x) => x.reciprocal >= 0.5);
    const c = clinvarCounts(same);
    rows.push(['ClinVar', same.length ? `${same.length} ${type === 'loss' ? (same.length === 1 ? 'loss' : 'losses') : same.length === 1 ? 'gain' : 'gains'} ${same.length === 1 ? 'overlaps' : 'overlap'} it (${c.map(([, n, t]) => `${n} ${t.toLowerCase()}`).join(', ')}), ${similar.length} of them of a similar extent` : `No ${type === 'loss' ? 'losses' : 'gains'} overlap it`, 'clinvar']);
  } else rows.push(['ClinVar', ctx.status.clinvar === 'error' ? 'Could not be fetched' : '…', 'clinvar']);
  rows.push(['Inheritance', ctx.pt ? inheritanceText(v.inheritance) : 'Looked up, with no patient', 'patient']);
  const t = h('table.glance', h('tbody', rows.map(([k, val, key]) => h('tr', h('th', { scope: 'row' }, k), h('td', val), h('td.num', h('a', { href: '#sec-' + key, onclick: (e) => { e.preventDefault(); ctx.scrollTo(key); } }, 'Evidence'))))));
  body.appendChild(t);
  if (!ctx.pt) body.appendChild(note('', h('p', 'This CNV was looked up rather than opened from a patient, so there’s no inheritance or phenotype to weigh in section 5. ', h('b', 'Add it to a patient'), ' with the button beside the classification if you want to use them.')));
}

function drawGenes(ctx, body) {
  const w = waitingFor(ctx, 'genes', ctx.asm === 'GRCh37' ? 'Ensembl for the genes on GRCh37' : 'the gene table');
  if (w) {
    body.appendChild(w);
    body.appendChild(itemsBox(ctx.sc, ['1A', '1B', '3A', '3B', '3C']));
    return;
  }
  const genes = ctx.data.genes;
  const pc = genes.filter((g) => g.pc);
  body.appendChild(h('ul.cnv-sumlist', dosageSummary(genes, ctx.data.regions || [], ctx.type).map((t) => h('li', t))));
  const tbl = genesTable(genes, { caption: 'Genes in the CNV' });
  body.appendChild(tbl);
  const n = geneCount(pc);
  body.appendChild(h('p.small.muted', `Section 3 counts the protein-coding genes that lie wholly or partly in the CNV, which comes to ${n.counted} here${n.families.length ? `, counting ${n.families.map((f) => `${f.n} ${f.name}`).join(', ').replace(/, ([^,]*)$/, ' and $1')} as one gene per family, since these families have no known clinical relevance` : ''}. ${ctx.asm === 'GRCh37' ? 'The genes are Ensembl’s on GRCh37, with what is known of each from the site’s gene table.' : 'The genes are those in HGNC that have a MANE transcript, on GRCh38.'} pHaplo and pTriplo are Collins et al.’s (2022) predictions, and LOEUF and pLI are gnomAD v4.1’s constraint scores.`));
  body.appendChild(itemsBox(ctx.sc, ['1A', '1B', '3A', '3B', '3C']));
  body.appendChild(sectionNote(ctx, 'genes'));
  // HPO's diseases, for the filters (a larger file: loaded once it is needed)
  if (!ctx.data.hpoDone) {
    import('../hpo.js').then(async (H) => {
      await H.loadDiseases();
      const DOM = /dominant|x-linked/i;
      for (const g of genes) {
        const ds = await H.diseasesOfGene(g.symbol);
        g.hpoDiseases = ds.length;
        if (!g.monoallelic && ds.some((d) => (d.inh || []).some((x) => DOM.test(x)))) g.monoallelic = true;
      }
      ctx.data.hpoDone = true;
      if (tbl.isConnected) tbl.update(genes);
    }).catch(() => null);
  }
}

function drawDosage(ctx, body) {
  const type = ctx.type;
  const codes = RUBRIC[type].find((s) => s.key === '2').items.map((it) => it.code);
  const w = waitingFor(ctx, 'genes', 'the gene table');
  const regions = ctx.data.regions || [];
  body.appendChild(h('h3.vsub', 'ClinGen’s curated regions'));
  body.appendChild(regionsTable(regions, { chrom: ctx.v.chrom }));
  if (w) {
    body.appendChild(w);
    body.appendChild(itemsBox(ctx.sc, codes));
    return;
  }
  const genes = ctx.data.genes.filter((g) => g.pc);
  const curated = genes.filter((g) => g.hi != null || g.ts != null).sort((a, b) => rankDs(b, type) - rankDs(a, type));
  body.appendChild(h('h3.vsub', 'ClinGen’s curated genes'));
  body.appendChild(table([
    { key: 'symbol', label: 'Gene', fmt: (g) => h('span', h('a.gene', { href: link('/gene/' + encodeURIComponent(g.symbol)) }, g.symbol), g.hgnc ? h('span.small', ' ', ext(clingenGeneUrl(g.hgnc), 'ClinGen')) : null) },
    { key: 'place', label: 'In the CNV', fmt: (g) => h('span' + (g.whole ? '' : '.cnv-part'), placeText(g)) },
    { key: 'hi', label: 'Haploinsufficiency', fmt: (g) => dsBadge(g.hi, 'hi') },
    { key: 'ts', label: 'Triplosensitivity', fmt: (g) => dsBadge(g.ts, 'ts') },
    { key: 'dis', label: 'Disease', fmt: (g) => h('span.small', diseaseName(g)) }
  ], curated, { compact: true, caption: 'ClinGen’s curated genes in the CNV', empty: 'ClinGen hasn’t curated any of the genes in the CNV for dosage.' }));
  const cut = curated.filter((g) => !g.whole && (type === 'loss' ? g.hi === 3 : g.hi === 3 || g.ts === 3));
  if (cut.length) body.appendChild(note('warn', h('p', `A breakpoint falls within ${cut.map((g) => `${g.symbol} (${placeText(g).toLowerCase()})`).join(', ')}, so ${type === 'loss' ? 'score the partial loss with 2C to 2E' : 'score it with 2I to 2K'}. You can see which exons are in the CNV in the genome browser below.`)));
  // predictions
  const predHi = genes.filter((g) => hiSources(g.hiWhy || []) >= 2 && g.hi !== 3); // pLI and LOEUF count as one
  const predTs = genes.filter((g) => (g.tsWhy || []).length && g.ts !== 3);
  body.appendChild(h('h3.vsub', 'Predicted dosage sensitivity'));
  body.appendChild(h('p', predHi.length ? [`${predHi.length} ${predHi.length === 1 ? 'gene meets' : 'genes meet'} two or more independent predictors of haploinsufficiency: `, h('span', predHi.slice(0, 12).map((g, i) => [i ? ', ' : '', h('i.gene', g.symbol), h('span.small.muted', ` (${g.hiWhy.join('; ')})`)])), predHi.length > 12 ? '…' : '', '.'] : 'No gene in the CNV meets two or more independent predictors of haploinsufficiency.'));
  if (type === 'gain') body.appendChild(h('p', predTs.length ? `${predTs.length} predicted triplosensitive (pTriplo ≥ ${THRESH.pTriplo}): ${predTs.slice(0, 12).map((g) => g.symbol).join(', ')}${predTs.length > 12 ? '…' : ''}. Predictions aren’t part of the scoring for a gain, but they point to genes worth reading about.` : `No gene in the CNV has pTriplo ≥ ${THRESH.pTriplo}.`));
  body.appendChild(h('p.small.muted', `The predictors are pHaplo ≥ ${THRESH.pHaplo} and pTriplo ≥ ${THRESH.pTriplo} (Collins et al. 2022), and LOEUF < ${THRESH.loeuf} and pLI ≥ ${THRESH.pLI} (gnomAD v4.1). 2H needs two of them for at least one gene, but pLI and LOEUF come from the same gnomAD data, so they count as one. It doesn’t apply when the CNV holds an established haploinsufficient gene or region.`));
  body.appendChild(itemsBox(ctx.sc, codes));
  body.appendChild(sectionNote(ctx, 'dosage'));
}
const rankDs = (g, type) => {
  const k = type === 'loss' ? g.hi : g.ts;
  return k === 3 ? 6 : k === 2 ? 5 : k === 1 ? 4 : k === 30 ? 2 : k === 40 ? 1 : 0;
};

function drawPopulation(ctx, body) {
  const type = ctx.type;
  const kindWord = type === 'loss' ? 'deletions' : 'duplications';
  // gnomAD
  body.appendChild(h('h3.vsub', 'gnomAD’s structural variants'));
  const w = waitingFor(ctx, 'gnomad', 'gnomAD');
  const g = ctx.data.gnomad;
  if (w) body.appendChild(w);
  else if (g.skipped) body.appendChild(note('', h('p', `The CNV is larger than ${fmtSize(GNOMAD_SV_MAX)}, so the page doesn’t compare it with gnomAD’s structural variants. A CNV this large isn’t seen in people without a disorder. `, ext(`https://gnomad.broadinstitute.org/region/${ctx.v.chrom}-${ctx.v.start}-${ctx.v.end}?dataset=${ctx.asm === 'GRCh37' ? 'gnomad_sv_r2_1' : 'gnomad_sv_r4'}`, 'Open the region in gnomAD'), '.')));
  else body.appendChild(popBlock(ctx, g.list, g.dataset, 'gnomad'));
  // DGV
  body.appendChild(h('h3.vsub', 'The Database of Genomic Variants’ gold standard'));
  const w2 = waitingFor(ctx, 'dgv', 'the Database of Genomic Variants');
  if (w2) body.appendChild(w2);
  else body.appendChild(popBlock(ctx, ctx.data.dgv, 'DGV', 'dgv'));
  body.appendChild(h('p.small.muted', `4O applies when ${kindWord} like this one are common in the population. That means those covering it reach at least 1% in a large study such as gnomAD, or in the DGV gold standard set. Below 1%, 4O gets less weight. The gold standard merges the CNVs of healthy people across studies, and “Covers this CNV” uses its inner boundaries, where the CNVs were seen in all the studies. 4O doesn’t apply when the region holds a well-known recessive gene whose loss causes disease.`));
  body.appendChild(itemsBox(ctx.sc, ['4O']));
  body.appendChild(sectionNote(ctx, 'population'));
}
/** population CNVs of the same kind: those covering at least half of ours first, the rest on request */
function popBlock(ctx, list, name, kind) {
  const type = ctx.type;
  // those that passed the study's filters first, then by how much of this CNV they cover
  const failed = (x) => ((x.filters || []).length ? 1 : 0);
  const same = list.filter((x) => x.type === type || x.type === 'both').sort((a, b) => failed(a) - failed(b) || b.coverOfCnv - a.coverOfCnv || (b.af || 0) - (a.af || 0));
  const big = same.filter((x) => x.coverOfCnv >= 0.5 || x.reciprocal >= 0.5);
  const box = h('div');
  const common = big.filter((x) => x.af >= 0.01);
  box.appendChild(h('p', same.length
    ? `${same.length} ${kindWord(type, same.length)} ${same.length === 1 ? 'overlaps' : 'overlap'} it, and ${big.length} ${big.length === 1 ? 'covers' : 'cover'} at least half of it${common.length ? `, ${common.length} of them in 1% of people or more` : ''}.${same.some(failed) ? ` Those that failed ${name}’s quality filters are marked and listed last.` : ''}`
    : `No ${kindWord(type, 1)} in ${name} overlaps it.`));
  if (!same.length) return box;
  let all = false;
  const first = big.length ? big.slice(0, 25) : same.slice(0, 5);
  const MAX = 300;
  if (!big.length) box.appendChild(h('p.small.muted', 'The five that cover most of it:'));
  const t = popTable(first, { kind, caption: `${name}: ${type === 'loss' ? 'deletions' : 'duplications'}`, empty: 'None cover half of it.' });
  box.appendChild(t);
  if (same.length > first.length) {
    const label = () => (all ? 'Show fewer' : `Show ${same.length > MAX ? `the ${MAX} that cover most of it` : `all ${same.length} overlapping`}`);
    const more = btn(label(), () => {
      all = !all;
      t.redraw(all ? same.slice(0, MAX) : first);
      more.querySelector('span').textContent = label();
    }, { cls: 'small' });
    box.appendChild(h('div.btn-row', { style: { marginTop: '6px' } }, more));
  }
  return box;
}

function drawClinvar(ctx, body) {
  const type = ctx.type, v = ctx.v;
  const w = waitingFor(ctx, 'clinvar', 'ClinVar');
  const links = h('div.ext-links',
    ext(`https://www.ncbi.nlm.nih.gov/clinvar/?term=${encodeURIComponent(`${v.chrom}[chr] AND ${v.start}:${v.end}[${ctx.asm === 'GRCh37' ? 'chrpos37' : 'chrpos38'}]`)}`, 'ClinVar'),
    ext(`https://www.deciphergenomics.org/search?q=${encodeURIComponent(`${v.chrom}:${v.start}-${v.end}`)}`, 'DECIPHER'),
    ext(`https://www.ncbi.nlm.nih.gov/dbvar/?term=${encodeURIComponent(`${v.chrom}[chr] AND ${v.start}:${v.end}[chrpos${ctx.asm === 'GRCh37' ? '37' : '38'}]`)}`, 'dbVar'),
    ext(`https://europepmc.org/search?query=${encodeURIComponent(`"${ctx.data.bands ? ctx.data.bands.iscn.replace(/^(\d+|X|Y)/, '$1') : 'chromosome ' + v.chrom}" AND (${type === 'loss' ? 'deletion OR microdeletion' : 'duplication OR microduplication'})`)}`, 'Europe PMC'),
    ext(`https://genome.ucsc.edu/cgi-bin/hgTracks?db=${ctx.asm === 'GRCh37' ? 'hg19' : 'hg38'}&position=${encodeURIComponent(`chr${v.chrom}:${v.start}-${v.end}`)}`, 'UCSC'));
  if (w) {
    body.appendChild(w);
  } else {
    const cv = ctx.data.clinvar;
    if (cv.note) body.appendChild(note('warn', h('p', cv.note)));
    const state = { same: true, cls: 'all', similar: false };
    const view = () => cv.list.filter((x) => (!state.same || x.type === type) && (!state.similar || x.reciprocal >= 0.5)
      && (state.cls === 'all' || (state.cls === 'plp' ? ['p', 'lp'].includes(x.cls) : state.cls === 'blb' ? ['b', 'lb'].includes(x.cls) : state.cls === 'vus' ? ['vus', 'conflict'].includes(x.cls) : true)))
      .sort((a, b) => b.reciprocal - a.reciprocal);
    const counts = clinvarCounts(cv.list.filter((x) => x.type === type));
    body.appendChild(h('div.cnv-cvcounts', { 'aria-label': 'ClinVar’s classifications of overlapping CNVs of the same kind' },
      h('span.small.muted', `${type === 'loss' ? 'Losses' : 'Gains'} overlapping it:`),
      counts.length ? counts.map(([k, n, t]) => h('span.cnv-cv.cv-' + k, `${n} ${t.toLowerCase()}`)) : h('span.small', 'none')));
    const shown = h('span.small.muted', { 'aria-live': 'polite' });
    const FIRST = 15;
    let all = false;
    const t = clinvarTable(view().slice(0, FIRST), { caption: 'ClinVar’s CNVs overlapping it' });
    const moreBtn = btn('', () => {
      all = !all;
      redraw();
    }, { cls: 'small' });
    const redraw = () => {
      const list = view();
      t.redraw(all ? list.slice(0, 500) : list.slice(0, FIRST));
      shown.textContent = list.length > FIRST && !all ? `the ${FIRST} most like it, out of ${list.length}` : `${list.length} shown`;
      moreBtn.hidden = list.length <= FIRST;
      moreBtn.innerHTML = `<span>${all ? `Show the ${FIRST} most like it` : `Show all ${Math.min(500, list.length)}`}</span>`;
    };
    const sameB = h('input', { type: 'checkbox', checked: true });
    sameB.addEventListener('change', () => { state.same = sameB.checked; redraw(); });
    const simB = h('input', { type: 'checkbox' });
    simB.addEventListener('change', () => { state.similar = simB.checked; redraw(); });
    const clsSel = select([['all', 'Any classification'], ['plp', 'Pathogenic or likely pathogenic'], ['vus', 'Uncertain or conflicting'], ['blb', 'Benign or likely benign']], 'all', { 'aria-label': 'Classification' });
    clsSel.addEventListener('change', () => { state.cls = clsSel.value; redraw(); });
    body.appendChild(h('div.cnv-filters', h('label.check.cnv-filter', sameB, h('span', `${type === 'loss' ? 'Losses' : 'Gains'} only`)), h('label.check.cnv-filter', { title: 'Each covers at least half of the other' }, simB, h('span', 'Similar extent')), clsSel, shown));
    body.appendChild(t);
    body.appendChild(h('div.btn-row', { style: { marginTop: '6px' } }, moreBtn));
    redraw();
    body.appendChild(h('p.small.muted', `${cv.source}. Other laboratories’ classifications are about their patients’ CNVs rather than this one. For section 4, read the cases behind them and the literature, and score each reported proband whose CNV holds the same genes. “Covers this CNV” is how much of this CNV theirs covers, and “Of theirs within it” is how much of theirs lies within this one.`));
  }
  body.appendChild(h('h3.vsub', 'Look further'));
  body.appendChild(links);
  const codes = RUBRIC[type].find((s) => s.key === '4').items.map((it) => it.code).filter((c) => c !== '4O');
  body.appendChild(itemsBox(ctx.sc, codes, 'Points from reported cases and families'));
  body.appendChild(sectionNote(ctx, 'cases'));
}

async function drawPatient(ctx, body) {
  const { v, pt, sc } = ctx;
  const codes = RUBRIC[ctx.type].find((s) => s.key === '5').items.map((it) => it.code);
  if (pt) {
    const copies = CNV_COPIES.filter(([k]) => (ctx.type === 'loss' ? +k < 2 : +k > 2));
    const cn = select(copies, v.copyNumber, { 'aria-label': 'Copy number' });
    const inh = select(INHERITANCE, v.inheritance || 'unknown', { 'aria-label': 'Inheritance' });
    const upd = () => {
      v.copyNumber = +cn.value;
      v.inheritance = inh.value;
      ctx.save(`Copy number ${v.copyNumber}; ${inheritanceText(v.inheritance).toLowerCase()}`);
      ctx.drawHead();
      ctx.refreshSuggestions();
      ctx.redraw(['summary', 'patient']);
    };
    cn.addEventListener('change', upd);
    inh.addEventListener('change', upd);
    body.appendChild(h('div.fields', field('Copy number in the patient', cn), field('How the patient got it', inh)));
    const fam = ctx.data.family;
    if (ctx.status.family === 'ok' && fam) {
      const word = (x) => (x === true ? 'affected' : x === false ? 'unaffected' : 'not recorded as affected or unaffected');
      if (!fam.drawn) body.appendChild(h('p', 'There’s no pedigree yet. ', h('a', { href: link(`/patient/${pt.id}/family`) }, 'Draw the family'), ' and shade the affected members, so that the parents’ phenotypes can be weighed in 5B to 5E.'));
      else if (fam.noProband) body.appendChild(h('p', 'The pedigree has no proband marked, so mark the patient as the proband on the ', h('a', { href: link(`/patient/${pt.id}/family`) }, 'Family tab'), '.'));
      else body.appendChild(h('p', `In the pedigree, the mother is ${fam.hasMother ? word(fam.mother) : 'not drawn'} and the father ${fam.hasFather ? word(fam.father) : 'not drawn'}. You can change this on the `, h('a', { href: link(`/patient/${pt.id}/family`) }, 'Family tab'), '.'));
    }
    // the patient's phenotype against the diseases of the genes in the CNV (filled in when it is worked out)
    const obs = (pt.phenotypes || []).filter((t) => t.observed !== false).map((t) => t.id);
    const exc = (pt.phenotypes || []).filter((t) => t.observed === false).map((t) => t.id);
    const fit = h('div', { 'aria-live': 'polite' });
    body.appendChild(h('h3.vsub', 'The patient’s phenotype and the genes’ diseases'));
    body.appendChild(fit);
    body.appendChild(itemsBox(ctx.sc, codes, 'Points from the patient and family'));
    body.appendChild(sectionNote(ctx, 'patient'));
    if (!obs.length) fit.appendChild(h('p.muted', 'No phenotype recorded yet. ', h('a', { href: link(`/patient/${pt.id}/phenotypes`) }, 'Add the patient’s features'), ' to see which of the genes’ diseases they fit.'));
    else if (!ctx.data.genes) fit.appendChild(loading('Waiting for the genes…'));
    else {
      const symbols = ctx.data.genes.filter((g) => g.pc).map((g) => g.symbol);
      fit.appendChild(loading('Comparing the phenotype with the genes’ diseases…'));
      try {
        const H = await import('../hpo.js');
        const ranked = await H.rankDiseases(obs, exc, { genes: symbols, limit: 6 });
        fit.innerHTML = '';
        if (!ranked.length) fit.appendChild(h('p.muted', 'None of the genes in the CNV has a disease in HPO’s annotations.'));
        else {
          fit.appendChild(h('ul.fit-list', ranked.map((x) => {
            const g = x.disease.genes.filter((s) => symbols.includes(s));
            const pctFit = Math.min(1, x.score / 8);
            return h('li', h('div.fit-h', h('span', x.disease.name, h('span.small.muted', ` (${g.join(', ')})`)), h('span.fit-score', `${x.matches.filter((m) => m.ic >= 2).length} of ${obs.length} features matched`)), h('div.fit-bar', h('span', { style: { width: (pctFit * 100).toFixed(0) + '%' } })));
          })));
          fit.appendChild(h('p.small.muted', 'This shows how well the patient’s features fit each disease, judged by how specific the shared features are, as Phenomizer does. A highly specific fit supports the higher options of 5A, or 5H. A fit that isn’t specific supports 5A’s lower options, or 5G.'));
        }
      } catch (e) {
        fit.innerHTML = '';
        fit.appendChild(note('warn', h('p', 'The phenotype couldn’t be compared, and reloading the page may help. The error was: ' + e.message)));
      }
    }
  } else {
    body.appendChild(note('', h('p', 'Section 5 is about the patient, such as whether the CNV is de novo or inherited and whether it segregates in the family. To record that, add the CNV to a patient with the button beside the classification.')));
    body.appendChild(itemsBox(ctx.sc, codes, 'Points from the patient and family'));
    body.appendChild(sectionNote(ctx, 'patient'));
  }
}

function drawBrowser(ctx, body) {
  if (ctx.browserHolder) {
    body.appendChild(ctx.browserHolder);
    return;
  }
  const holder = h('div.igv-holder');
  ctx.browserHolder = holder;
  body.appendChild(holder);
  const v = ctx.v;
  const pad = Math.max(2000, Math.round((v.end - v.start + 1) * 0.15));
  const start = () => {
    if (ctx.browser) return;
    ctx.browser = genomeBrowser(holder, {
      assembly: ctx.asm,
      locus: `chr${v.chrom}:${Math.max(1, v.start - pad)}-${v.end + pad}`,
      tracks: ['genes', 'clinvarCnv', 'haplo', 'triplo', 'dgvGold'],
      roi: [{ chrom: v.chrom, start: v.start, end: v.end, colour: ctx.type === 'loss' ? 'rgba(175, 114, 114, 0.22)' : 'rgba(114, 114, 175, 0.22)', name: `This ${ctx.type}` }]
    });
    ctx.browser.ready.catch(() => null);
    ctx.cleanups.push(() => ctx.browser && ctx.browser.destroy());
  };
  // the browser reads a good deal: it opens when the section comes into view
  const io = new IntersectionObserver((es) => {
    if (es.some((e) => e.isIntersecting)) {
      io.disconnect();
      start();
    }
  }, { rootMargin: '300px 0px' });
  io.observe(holder);
  ctx.cleanups.push(() => io.disconnect());
  body.appendChild(h('p.small.muted', `The CNV is shaded ${ctx.type === 'loss' ? 'red' : 'blue'}. ClinVar’s CNVs and the DGV gold standard set are coloured by kind, with losses in red and gains in blue. ClinGen’s tracks show its dosage curations of genes and regions. Point at a feature to see its details.`));
}

function drawConclusion(ctx, body) {
  const { v, sc } = ctx;
  const top = h('div.concl', { 'aria-live': 'polite' });
  const drawTop = () => {
    const r = sc.result();
    top.innerHTML = '';
    top.append(h('div.row', clsBadge(r.cls, { big: true }), h('span.res-pts', `${signed(r.total)} points`), h('span.small.muted', 'ACMG/ClinGen CNV standards (Riggs et al. 2020)')));
    if (!r.rows.length) top.appendChild(h('p.muted', 'Nothing has been scored yet.'));
    else {
      const secs = RUBRIC[ctx.type].map((S) => {
        const rows = r.rows.filter((x) => x.section === S.key);
        return { S, rows, total: rows.reduce((a, x) => a + x.pts, 0) };
      }).filter((x) => x.rows.length);
      top.appendChild(table([
        { key: 'sec', label: 'Section', fmt: (x) => `${x.S.key}. ${SECTION_TITLES[ctx.type][x.S.key]}` },
        { key: 'items', label: 'Items', fmt: (x) => h('span.hgvs', x.rows.map((y) => `${y.code} ${signed(y.pts)}`).join(', ')) },
        { key: 'total', label: 'Points', num: true, fmt: (x) => signed(x.total) }
      ], secs, { compact: true, caption: 'The points by section' }));
    }
  };
  drawTop();
  let seen = false;
  const off = sc.on(() => {
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
      { key: 'by', label: 'Who', fmt: (x) => signerName(x.by) || h('span.muted', 'Not named') },
      { key: 'cls', label: 'Class', fmt: (x) => h('span', clsBadge(x.cls, { short: true }), x.calculated && x.calculated !== x.cls ? h('span.small.muted', ` (calculated ${x.calculated.toUpperCase()})`) : null) },
      { key: 'points', label: 'Points', num: true, fmt: (x) => (x.points != null ? signed(Math.round(x.points * 100)) : '–') },
      { key: 'criteria', label: 'Items', fmt: (x) => h('span.hgvs.small', x.criteria || '–') },
      { key: 'reason', label: 'Reason for a change', fmt: (x) => x.reason || '' }
    ], hist, { compact: true }));
  } else if (v.patientId) body.appendChild(h('p.small.muted', 'You haven’t signed a classification yet. The “Sign the classification” button beside the points records it with your name and the date.'));
  // ClinGen's own curation of the same region
  const reg = (ctx.data.regions || []).filter((r) => (ctx.type === 'loss' ? r.hi === 3 || r.hi === 40 : r.ts === 3 || r.ts === 40) && Math.min(r.coverOfRegion, r.coverOfCnv) >= 0.8);
  if (reg.length) {
    body.appendChild(h('h3.vsub', 'ClinGen’s curation of this region'));
    for (const r of reg) {
      const s = ctx.type === 'loss' ? r.hi : r.ts;
      body.appendChild(h('p', ext(r.url, r.name || r.id), ` has a ${ctx.type === 'loss' ? 'haploinsufficiency' : 'triplosensitivity'} score of ${s} (${s === 3 ? 'sufficient evidence' : 'dosage sensitivity unlikely'}). The CNV covers ${pct(r.coverOfRegion)} of the region, and the region covers ${pct(r.coverOfCnv)} of the CNV. ClinGen’s expert curators judged the dosage sensitivity of the region itself, so compare their score with your points for section 2.`));
    }
  }
  // the case's answer
  const exp = v.expected;
  if (exp) {
    const box = h('div.compare');
    body.appendChild(h('h3.vsub', 'The case’s answer'));
    body.appendChild(box);
    if (settings.CFG.allowCompare === false) box.appendChild(h('p.muted', 'Comparing with the answer is switched off on this site.'));
    else if (!hist.length) box.appendChild(h('p.muted', 'Sign your classification first, and then you can compare it with the answer the case’s author gave.'));
    else {
      const showBtn = btn('Compare with the case’s answer', () => {
        showBtn.remove();
        box.appendChild(compareItems(ctx, exp));
      }, { cls: 'primary small', icon: 'scale' });
      box.appendChild(showBtn);
    }
  }
  body.appendChild(sectionNote(ctx, 'conclusion'));
}

/** the student's items beside the case's answer */
function compareItems(ctx, exp) {
  const r = ctx.sc.result();
  const mine = new Map(r.rows.map((x) => [x.code, x.pts]));
  const theirs = new Map();
  for (const s of exp.items || []) {
    const m = /^([1-5][A-O](?:-\d)?)(?::\s*([+−-]?[\d.]+))?$/.exec(String(s).trim());
    if (m) theirs.set(m[1], m[2] != null ? Math.round(parseFloat(m[2].replace('−', '-')) * 100) : null);
  }
  const order = RUBRIC[ctx.type].flatMap((S) => S.items.map((it) => it.code));
  const codes = Array.from(new Set([...mine.keys(), ...theirs.keys()])).sort((a, b) => order.indexOf(a) - order.indexOf(b));
  const rows = codes.map((c) => {
    const m = mine.has(c), t = theirs.has(c);
    const tp = theirs.get(c);
    const status = m && t ? (tp == null || tp === mine.get(c) ? 'Agree' : 'Different points') : t ? 'You didn’t use it' : 'They didn’t use it';
    return { c, m: m ? signed(mine.get(c)) : '', t: t ? (tp != null ? signed(tp) : 'used') : '', status, why: (exp.notes || {})[c] || '' };
  });
  const agree = rows.filter((x) => x.status === 'Agree').length;
  const who = answerBy(exp.source);
  return h('div',
    h('p', 'Your class: ', clsBadge(r.cls, { short: true }), `. ${who}: `, exp.cls ? clsBadge(exp.cls, { short: true }) : 'not given', `. ${agree} of ${rows.length} items agree.`),
    table([
      { key: 'c', label: 'Item', fmt: (x) => h('b.hgvs', x.c) },
      { key: 'm', label: 'Yours', fmt: (x) => x.m || h('span.faint', '–') },
      { key: 't', label: 'Theirs', fmt: (x) => x.t || h('span.faint', '–') },
      { key: 'status', label: '', fmt: (x) => h('span.tag' + (x.status === 'Agree' ? '.ok' : x.status === 'Different points' ? '.warn' : '.bad'), x.status) }
    ], rows, { compact: true, detail: (x) => x.why || null }),
    exp.source ? h('p.small.muted', 'Source: ', exp.source) : null);
}

const SECTIONS = [
  { key: 'summary', title: 'Summary', icon: 'list', deps: ['genes', 'regions', 'clinvar', 'gnomad', 'dgv'], draw: drawSummary },
  { key: 'genes', title: 'Genes in the CNV', icon: 'dna', deps: ['genes', 'regions'], draw: drawGenes },
  { key: 'dosage', title: 'Dosage sensitivity', icon: 'scale', deps: ['genes', 'regions'], draw: drawDosage },
  { key: 'population', title: 'Population', icon: 'population', deps: ['gnomad', 'dgv'], draw: drawPopulation },
  { key: 'clinvar', title: 'ClinVar and reported cases', icon: 'clinvar', deps: ['clinvar', 'bands'], draw: drawClinvar },
  { key: 'patient', title: 'Patient and inheritance', icon: 'pedigree', deps: ['genes', 'family'], draw: drawPatient },
  { key: 'browser', title: 'Genome browser', icon: 'genome', deps: [], draw: drawBrowser },
  { key: 'conclusion', title: 'Conclusion', icon: 'badgeCheck', deps: ['regions'], draw: drawConclusion }
];

/* ================================================================
   Signing, and adding to a patient
   ================================================================ */
function signOff(ctx) {
  const { v, sc } = ctx;
  const r = sc.result();
  const name = settings.get('name');
  const nameIn = h('input', { type: 'text', value: name || '', placeholder: 'Your name' });
  const finalSel = select([['', `${CLS_WORD[r.cls]} (as calculated)`], ['p', 'Pathogenic'], ['lp', 'Likely pathogenic'], ['vus', 'Uncertain significance'], ['lb', 'Likely benign'], ['b', 'Benign']], '');
  const reason = h('textarea', { rows: 2, placeholder: 'Required if you choose a different class from the calculated one' });
  const summary = h('textarea', { rows: 4, placeholder: 'Summarise the evidence as you would on a report' });
  summary.value = (v.classification.saved && v.classification.saved.summary) || autoSummary(ctx, r);
  const contrib = select([['', 'Not decided']].concat(CONTRIBUTION.filter(([k]) => k)), v.contribution || ''); // as on the variant page
  const body = h('div.stack',
    h('p', 'The calculated class is ', clsBadge(r.cls), ` (${signed(r.total)} points), with `, h('span.hgvs', sc.summary(r) || 'nothing scored'), '.'),
    field('Classifier', nameIn),
    field('Classification', finalSel, 'You can choose a different class from the calculated one if you give a reason'),
    field('Reason for the change', reason),
    field('Evidence summary', summary, 'The key evidence in a few sentences, written as you would for a report'),
    v.patientId ? field('Contribution to the patient’s phenotype', contrib) : null);
  modal('Sign the classification', body, {
    wide: true,
    actions: [['Cancel', null, 'ghost'], ['Sign', async () => {
      const chosen = finalSel.value || r.cls;
      if (chosen !== r.cls && !reason.value.trim()) {
        toast('You need to give a reason for changing the calculated classification.', 'error');
        reason.focus();
        return true;
      }
      if (nameIn.value.trim() && nameIn.value.trim() !== name) settings.set('name', nameIn.value.trim());
      const rec = {
        at: nowISO(), by: nameIn.value.trim() || 'not named', cls: chosen, calculated: r.cls, points: r.total / 100,
        framework: 'cnv2020', criteria: r.rows.map((x) => `${x.code}${x.pts ? ' ' + signed(x.pts) : ''}`).join(', '),
        reason: reason.value.trim(), summary: summary.value.trim(),
        state: JSON.parse(JSON.stringify(v.cnv))
      };
      v.classification.saved = rec;
      v.classification.history = [rec].concat(v.classification.history || []).slice(0, 50);
      v.contribution = contrib.value;
      await ctx.save(`Classification signed: ${chosen.toUpperCase()} (${signed(r.total)} points)${signerName(rec.by) ? ' by ' + rec.by : ''}`);
      toast('Signed. The classification is now in the CNV’s history.', 'ok');
      // the same page: draw again what the signature changes (the panel's footer and the conclusion)
      if (ctx.drawSaveBox) ctx.drawSaveBox();
      if (ctx.redraw) ctx.redraw(['conclusion']);
    }, 'primary']]
  });
}

/** a first draft of the evidence summary */
function autoSummary(ctx, r) {
  const { v, sc, data } = ctx;
  const gs = (data.genes || []).filter((g) => g.pc);
  const n = geneCount(gs);
  const size = fmtSize(v.end - v.start + 1);
  const parts = [`This is ${/^(8|1[18](?!\d))/.test(size) ? 'an' : 'a'} ${size} ${v.cnvType} of ${data.bands ? data.bands.text : 'chromosome ' + v.chrom} (${fmtRegion(v.chrom, v.start, v.end)}, ${v.assembly || 'GRCh38'})${data.genes ? ` that contains ${n.counted} protein-coding ${n.counted === 1 ? 'gene' : 'genes'}` : ''}.`];
  for (const x of r.rows) {
    const t = v.cnv.notes[x.code];
    if (t) parts.push(t.replace(/\.?$/, '.'));
  }
  return parts.join(' ');
}

async function addToPatient(ctx) {
  const { v, sc } = ctx;
  const ps = await db.listPatients();
  const pick = select([['new', 'A new patient']].concat(ps.map((x) => [x.id, `Patient ${x.id}${x.ref ? ' – ' + x.ref : ''}`])), ps[0] ? ps[0].id : 'new');
  const copies = CNV_COPIES.filter(([k]) => (v.cnvType === 'loss' ? +k < 2 : +k > 2));
  const cn = select(copies, v.copyNumber);
  const inh = select(INHERITANCE, v.inheritance || 'unknown');
  modal('Add the CNV to a patient', h('div.stack', field('Patient', pick), h('div.fields', field('Copy number', cn), field('Inheritance', inh))), {
    actions: [['Cancel', null, 'ghost'], ['Add', async () => {
      let pid = pick.value;
      if (pid === 'new') {
        const np = await db.savePatient(db.blankPatient(), 'Patient created');
        pid = np.id;
      }
      const rec = Object.assign({}, v, { id: null, patientId: pid, copyNumber: +cn.value, inheritance: inh.value, cnv: sc.v.cnv, classification: v.classification || {} });
      const saved = await db.saveVariant(rec, 'CNV added from a look-up');
      setLeaveGuard(null);
      toast(`Added to Patient ${pid}.`, 'ok');
      go(`/patient/${pid}/variant/${saved.id}`);
    }, 'primary']]
  });
}
