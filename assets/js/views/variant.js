/* =====================================================================
   A variant's page: its evidence, section by section, beside the
   classification panel. For a patient's variant (saved as it is
   worked on), or for any variant looked up from the search box (which
   can then be added to a patient).
   ===================================================================== */
import { h, bus, esc, icon, toast, debounce, beforeLeaving, modal, popmenu, copyText, dateStr, nowISO, confirmBox } from '../core.js';
import { go, link, setLeaveGuard } from '../router.js';
import * as db from '../db.js';
import * as settings from '../settings.js';
import { page, crumbs, btn, linkBtn, note, loading, clsBadge, select, field, factList } from '../ui.js';
import { resolveInput, annotate, describe, chooseTranscript, transcriptRows, niceConsequence } from '../annotate.js';
import { loadGenes, gene as geneInfo, validity, g2p } from '../genes.js';
import { Classification, acmgPanel, framework } from '../widgets/acmg-panel.js';
import { suggest } from '../acmg/suggest.js';
import { ZYGOSITY, INHERITANCE, CONTRIBUTION, inheritanceText, variantLong, patientFacts, signerName } from '../summary.js';
import { readQuery, vcfKey } from '../parse.js';
import { SECTIONS } from './variant-evidence.js';
import { drawSectionInto } from './evidence-common.js';

let current = null;

export function sameAs(p) {
  if (!current || !p.params) return false;
  if (p.params.vid) return p.params.vid === current.vid;
  // a looked-up variant is the same page only on the same genome build
  const asm = (p.query && p.query.assembly) || settings.get('assembly');
  return !!p.params.q && p.params.q === current.q && asm === current.asm;
}
export function update(params) {
  if (current && params.section) current.scrollTo(params.section);
}

export async function render(root, params, query) {
  current = null;
  const isCNVRoute = location.hash.startsWith('#/cnv/');
  if (params.vid) {
    const v = await db.getVariant(params.vid);
    const pt = await db.getPatient(params.id);
    if (!v || !pt || v.patientId !== pt.id) {
      root.appendChild(h('div.page.narrow', note('bad', h('p', 'This variant isn’t saved for this patient in this browser.')), linkBtn('Back to the patient', '/patient/' + params.id)));
      return;
    }
    if (v.kind === 'cnv') return (await import('./cnv.js')).render(root, { patient: pt, variant: v, section: params.section });
    return variantPage(root, { v, pt, section: params.section });
  }
  // looked up: work out what the text is
  const q = params.q;
  if (isCNVRoute || (readQuery(q).kind === 'cnv')) return (await import('./cnv.js')).render(root, { query: q });
  const asm = query.assembly || settings.get('assembly');
  const p = page();
  root.appendChild(p);
  p.appendChild(crumbs([['Home', '/'], ['Variant']]));
  p.appendChild(h('h1', h('span.hgvs', q)));
  const box = h('div', loading(`Finding ${q} on ${asm}…`));
  if (readQuery(q).ref === 'protein') box.appendChild(h('p.small.muted', 'Ensembl’s variant recoder is looking up this protein change, which can take a minute.'));
  p.appendChild(box);
  const res = await resolveInput(q, asm);
  box.innerHTML = '';
  if (!res.ok) {
    box.appendChild(note('bad', h('p', res.message)));
    box.appendChild(assemblySwitch(q, asm));
    return;
  }
  if (res.candidates.length > 1 && !query.pick) {
    box.appendChild(h('p', res.note || 'This matches more than one variant. Which do you mean?'));
    const list = h('div.btn-row', { style: { flexDirection: 'column', alignItems: 'flex-start' } });
    for (const c of res.candidates) list.appendChild(linkBtn(`${c.chrom}-${c.pos}-${c.ref}-${c.alt || '-'}${c.hgvsc ? `  (${c.gene ? c.gene + ' ' : ''}${c.hgvsc.split(':').pop()}${c.hgvsp ? ' ' + c.hgvsp : ''})` : ''}`, `/variant/${encodeURIComponent(c.vcf)}?assembly=${asm}`, { cls: 'small' }));
    box.appendChild(list);
    return;
  }
  const c = res.candidates[Number(query.pick) || 0];
  root.innerHTML = '';
  const v = {
    id: null, patientId: null, kind: 'sequence', assembly: asm, input: q,
    chrom: c.chrom, pos: c.pos, ref: c.ref, alt: c.alt, transcript: transcriptOf(q),
    zygosity: 'heterozygous', inheritance: 'unknown', classification: { criteria: {} }, calc: {}
  };
  return variantPage(root, { v, pt: null, q });
}

/** the transcript named in what was typed, if any */
function transcriptOf(q) {
  const m = /^(N[MR]_\d+(?:\.\d+)?|ENST\d+(?:\.\d+)?)[(:]/i.exec(String(q || ''));
  return m ? m[1] : null;
}
function assemblySwitch(q, asm) {
  const other = asm === 'GRCh38' ? 'GRCh37' : 'GRCh38';
  return h('p', 'Is the variant on the other build? ', h('a', { href: link(`/variant/${encodeURIComponent(q)}?assembly=${other}`) }, `Look it up on ${other}`), '.');
}

/* ---------------------------------------------------------------- */
async function variantPage(root, { v, pt, section, q }) {
  const asm = v.assembly || 'GRCh38';
  v.calc = v.calc || {};
  v.classification = v.classification || { criteria: {} };
  const saved = !!v.id;
  const p = page('full.vpage');
  root.appendChild(p);
  await loadGenes().catch(() => null);

  const cls = new Classification(v.classification, { showSuggestions: settings.get('suggestions') === 'show' });
  const ctx = { v, pt, asm, cls, calc: v.calc, ev: null, gene: null, clinvarGene: null, sections: {} };
  // a patient's variant already knows its gene: its curations are there before VEP answers
  if (v.gene) {
    ctx.gene = geneInfo(v.gene);
    if (ctx.gene) {
      ctx.gene.validity = validity(ctx.gene);
      ctx.gene.g2p = g2p(ctx.gene);
    }
  }

  /* ---------- saving: a patient's variant is saved as it is worked on ---------- */
  let dirty = false;
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
  cls.on((code, quiet) => {
    if (quiet) return;
    v.classification = cls.state;
    ctx.save();
  });
  setLeaveGuard(async () => {
    if (!v.patientId && dirty && Object.keys(cls.state.criteria).length) return !window.confirm('Leave without adding this variant to a patient? Its classification will be lost.');
    return false;
  });

  /* ---------- the heading ---------- */
  const stateEl = h('span.small.muted', { 'aria-live': 'polite' }, saved ? '' : 'Not saved until you add it to a patient');
  const head = h('div.vhead');
  const crumbItems = pt ? [['Patients', '/patients'], [`Patient ${pt.id}`, `/patient/${pt.id}`], ['Variants', `/patient/${pt.id}/variants`], ['Variant']] : [['Home', '/'], ['Variant']];
  p.appendChild(crumbs(crumbItems));
  p.appendChild(head);

  /* ---------- the three columns ---------- */
  const nav = h('nav.vnav', { 'aria-label': 'Evidence sections' });
  const main = h('div.vmain');
  const side = h('aside.vside');
  p.appendChild(h('div.vgrid', nav, main, side));

  // the sections (each draws itself from ctx, and again when its data arrive)
  for (const S of SECTIONS) {
    const el = h('section.vsec', { id: 'sec-' + S.key, 'aria-labelledby': 'h-' + S.key });
    const body = h('div.vsec-b');
    el.append(h('div.vsec-h', h('h2', { id: 'h-' + S.key, html: icon(S.icon) + esc(S.title) }), h('span.vsec-status')), body);
    main.appendChild(el);
    ctx.sections[S.key] = { S, el, body, drawn: null };
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
  ctx.redraw = (keys) => (keys || Object.keys(ctx.sections)).forEach((k) => drawSection(k));
  const scrollTo = (key) => {
    const s = ctx.sections[key];
    if (s) s.el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };
  // the section in view, marked in the list
  const io = new IntersectionObserver((entries) => {
    for (const e of entries) if (e.isIntersecting) {
      nav.querySelectorAll('a').forEach((a) => a.classList.toggle('active', a.dataset.key === e.target.id.slice(4)));
    }
  }, { rootMargin: '-20% 0px -70% 0px' });
  Object.values(ctx.sections).forEach((s) => io.observe(s.el));

  /* ---------- the classification panel ---------- */
  const saveBox = h('div.acmg-save');
  let drawSaveBox = null;
  const panel = acmgPanel(cls, { footer: saveBox, onChange: () => drawSaveBox && drawSaveBox() });
  side.appendChild(panel);
  drawSaveBox = () => {
    saveBox.innerHTML = '';
    const r = cls.result();
    const s = v.classification.saved;
    if (!v.patientId) {
      saveBox.appendChild(h('p.small.muted', 'You’ve looked this variant up, but it isn’t saved to a patient yet.'));
      saveBox.appendChild(btn('Add to a patient…', () => addToPatient(v, cls), { cls: 'primary', icon: 'plus' }));
      return;
    }
    if (s) saveBox.appendChild(h('p.small', 'Last signed as ', clsBadge(s.cls, { short: true }), `${signerName(s.by) ? ' by ' + s.by : ''} on ${dateStr(s.at, true)}`, s.cls !== r.cls ? h('span.res-differ', ' (the calculated class has changed since)') : null));
    saveBox.appendChild(btn(s ? 'Sign the classification again' : 'Sign the classification', () => signOff(ctx, r), { cls: 'primary', icon: 'badgeCheck', title: 'Record this classification in the variant’s history, with your name, the date and the criteria' }));
    saveBox.appendChild(h('p.small.muted', { style: { marginTop: '6px' } }, 'Your work is saved as you go. Signing adds the classification to the variant’s history and to the report.'));
  };
  drawSaveBox();
  ctx.drawSaveBox = drawSaveBox;

  /* ---------- the heading, drawn again when VEP has answered ---------- */
  const drawHead = () => {
    const d = ctx.ev && ctx.ev.d;
    head.innerHTML = '';
    const g = d && d.gene;
    const title = h('h1.vtitle',
      g ? h('a.gene', { href: link('/gene/' + g + (pt ? '?patient=' + pt.id : '')), title: pt ? `Open the gene’s page, compared with Patient ${pt.id}` : 'Open the gene’s page' }, g) : null,
      h('span.hgvs', d && d.hgvsc ? d.hgvsc.split(':')[1] : `${v.chrom}-${v.pos}-${v.ref}-${v.alt || '-'}`),
      d && d.hgvsp ? h('span.hgvs.vp', d.hgvsp.replace(/^p\.\(?/, 'p.(').replace(/\)?$/, ')')) : null);
    const facts = factList([
      ['Genomic', h('span.hgvs', `${asm} ${v.chrom}-${v.pos}-${v.ref}-${v.alt || '-'}`)],
      ['Transcript', d ? h('span', h('span.hgvs', d.refseq || d.transcriptVersioned), d.mane ? h('span.tag.accent', { style: { marginLeft: '6px' } }, d.mane.replace(/_/g, ' ')) : d.canonical ? h('span.tag', { style: { marginLeft: '6px' } }, 'Ensembl canonical') : null) : '…'],
      ['Consequence', d ? niceConsequence(d.consequence) + (d.exon ? `, exon ${d.exon.n} of ${d.exon.of}` : d.intron ? `, intron ${d.intron.n} of ${d.intron.of}` : '') : '…'],
      ['dbSNP', d && d.rsid ? h('a', { href: `https://www.ncbi.nlm.nih.gov/snp/${d.rsid}`, target: '_blank', rel: 'noopener' }, d.rsid) : d ? 'None' : '…'],
      pt ? ['Genotype', `${cap(v.zygosity || 'not known')}, ${inheritanceText(v.inheritance).toLowerCase()}`] : null
    ].filter(Boolean));
    const r = cls.result();
    head.append(
      h('div.vhead-l', title, facts),
      h('div.vhead-r',
        h('div.vhead-cls', clsBadge(r.cls, { big: true, band: r.band }), h('span.small.muted', criteriaShort(cls))),
        h('div.btn-row',
          btn('Transcript', (e) => chooseTx(e.currentTarget), { cls: 'small', icon: 'list', title: 'Describe the variant on another transcript' }),
          btn('', (e) => moreMenu(e.currentTarget), { cls: 'small icon-only', icon: 'dots', aria: 'More actions' })),
        stateEl));
  };
  const criteriaShort = (c) => {
    const s = c.criteriaString();
    return s ? s : 'No criteria applied yet';
  };
  // another set of guidelines (or the VUS bands switched): the class is worked out again everywhere it is shown
  const offSettings = bus.on('settings', (e) => {
    if (e && (e.key === 'framework' || e.key === 'vusBands')) cls.changed(null, true);
  });
  cls.on(() => {
    const el = head.querySelector('.vhead-cls');
    if (el) {
      const r = cls.result();
      el.innerHTML = '';
      el.append(clsBadge(r.cls, { big: true, band: r.band }), h('span.small.muted', criteriaShort(cls)));
    }
  });
  const chooseTx = (anchor) => {
    const rows = transcriptRows(ctx.ev && ctx.ev.vep);
    if (!rows.length) return toast('The transcripts will be listed once VEP has answered. Try again in a moment.');
    const items = rows.slice(0, 30).map((t) => ['dna', `${t.refseq ? t.refseq + ' / ' : ''}${t.id}${t.mane ? ' (' + t.mane + ')' : t.canonical ? ' (canonical)' : ''}: ${t.hgvsc || t.consequence}`, () => {
      v.transcript = t.id;
      ctx.ev.t = chooseTranscript(ctx.ev.vep, t.id);
      ctx.ev.d = describe(ctx.ev.vep, ctx.ev.t, v);
      syncFromEvidence();
      ctx.save('Transcript changed to ' + (t.refseq || t.id));
      drawHead();
      ctx.redraw();
      refreshSuggestions();
    }]);
    popmenu(anchor, items);
  };
  const moreMenu = (anchor) => popmenu(anchor, [
    ['copy', 'Copy the variant’s HGVS', () => copyText(ctx.ev && ctx.ev.d ? `${ctx.ev.d.hgvsc}${ctx.ev.d.hgvsp ? ' ' + ctx.ev.d.hgvsp : ''}` : `${v.chrom}-${v.pos}-${v.ref}-${v.alt}`).then(() => toast('Copied to the clipboard.'))],
    ['refresh', 'Fetch the annotation again', () => start(true)],
    ['genome', 'Show in the genome browser', () => go(`/browser?locus=chr${v.chrom}:${Math.max(1, v.pos - 40)}-${v.pos + 40}&assembly=${asm}${pt ? '&patient=' + pt.id : ''}`)],
    v.patientId ? ['report', 'Open the patient’s report', () => go(`/patient/${v.patientId}/report`)] : null,
    v.patientId ? null : ['plus', 'Add to a patient…', () => addToPatient(v, cls)],
    v.patientId ? ['trash', 'Remove this variant from the patient…', async () => {
      if (await confirmBox('Remove this variant?', 'Its classification and notes will be removed too, and you can’t undo this.', { yes: 'Remove', danger: true })) {
        await db.deleteVariant(v.id);
        toast('Variant removed.', 'ok');
        go(`/patient/${v.patientId}/variants`);
      }
    }] : null
  ].filter(Boolean));

  /* ---------- annotation ---------- */
  const syncFromEvidence = () => {
    const d = ctx.ev && ctx.ev.d;
    if (!d) return;
    Object.assign(v, { gene: d.gene, hgvsc: d.hgvsc, hgvsp: d.hgvsp, consequence: d.consequence, transcriptShown: d.refseq || d.transcriptVersioned });
    ctx.gene = d.gene ? geneInfo(d.gene) : null;
    if (ctx.gene) {
      ctx.gene.validity = validity(ctx.gene);
      ctx.gene.g2p = g2p(ctx.gene);
    }
  };
  const refreshSuggestions = () => {
    try {
      cls.setSuggestions(suggest({ ev: ctx.ev, gene: ctx.gene, clinvarGene: ctx.clinvarGene, variant: v, calc: v.calc, settings: { framework: framework(), predictor: settings.get('predictor') } }));
    } catch (e) {
      console.error('suggestions', e);
    }
  };
  ctx.refreshSuggestions = refreshSuggestions;
  let lastStatus = {};
  const start = async (fresh) => {
    lastStatus = {};
    const ev = await annotate(v, (e) => {
      ctx.ev = e;
      if (e.status.vep !== lastStatus.vep) {
        syncFromEvidence();
        drawHead();
      }
      const changed = Object.keys(e.status).filter((k) => e.status[k] !== lastStatus[k]);
      lastStatus = Object.assign({}, e.status);
      const keys = Object.values(ctx.sections).filter((s) => !s.S.deps || s.S.deps.some((d) => changed.includes(d))).map((s) => s.S.key);
      ctx.redraw(keys);
      refreshSuggestions();
    }, { fresh });
    ctx.ev = ev;
    v.annotatedAt = ev.at;
    if (v.patientId && !v.gene && ev.d) {
      syncFromEvidence();
      ctx.save(null);
    }
    if (section) setTimeout(() => scrollTo(section), 200);
  };
  ctx.scrollTo = scrollTo;
  current = { vid: v.id, q, asm, scrollTo };
  drawHead();
  ctx.redraw();
  start(false);
  if (section) setTimeout(() => scrollTo(section), 300);
  return () => {
    saveSoon.flush();
    offLeave();
    if (typeof offSettings === 'function') offSettings();
    io.disconnect();
    setLeaveGuard(null);
    current = null;
  };
}

const cap = (s) => (s ? s[0].toUpperCase() + s.slice(1) : s);

/** sign a classification: it goes into the variant's history, with the name, the date and the evidence */
function signOff(ctx, r) {
  const { v, cls } = ctx;
  const name = settings.get('name');
  const nameIn = h('input', { type: 'text', value: name || '', placeholder: 'Your name' });
  const finalSel = select([['', `${{ p: 'Pathogenic', lp: 'Likely pathogenic', vus: 'Uncertain significance', lb: 'Likely benign', b: 'Benign' }[r.cls]} (as calculated)`], ['p', 'Pathogenic'], ['lp', 'Likely pathogenic'], ['vus', 'Uncertain significance'], ['lb', 'Likely benign'], ['b', 'Benign']], '');
  const reason = h('textarea', { rows: 2, placeholder: 'Required if you choose a different class from the calculated one' });
  const summary = h('textarea', { rows: 4, placeholder: 'Summarise the evidence as you would on a report' });
  summary.value = (v.classification.saved && v.classification.saved.summary) || autoSummary(ctx, r);
  const contrib = select([['', 'Not decided']].concat(CONTRIBUTION.filter(([k]) => k)), v.contribution || ''); // the same words as the lists and the report
  const body = h('div.stack',
    h('p', 'The calculated class is ', clsBadge(r.cls, { band: r.band }), ` (${r.points > 0 ? '+' : ''}${r.points} points), with `, h('span.hgvs', cls.criteriaString() || 'no criteria applied'), '.'),
    field('Classifier', nameIn),
    field('Classification', finalSel, 'You can choose a different class from the calculated one if you give a reason, as ClinGen’s curation interface asks'),
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
        at: nowISO(), by: nameIn.value.trim() || 'not named', cls: chosen, calculated: r.cls, points: r.points, band: r.band,
        framework: r.framework, criteria: cls.criteriaString(), reason: reason.value.trim(), summary: summary.value.trim(),
        state: JSON.parse(JSON.stringify(cls.state.criteria))
      };
      v.classification.saved = rec;
      v.classification.history = [rec].concat(v.classification.history || []).slice(0, 50);
      v.contribution = contrib.value;
      await ctx.save(`Classification signed: ${chosen.toUpperCase()} (${rec.criteria || 'no criteria'})${signerName(rec.by) ? ' by ' + rec.by : ''}`);
      toast('Signed. The classification is now in the variant’s history.', 'ok');
      // the same page: draw again what the signature changes (the panel's footer and the conclusion)
      if (ctx.drawSaveBox) ctx.drawSaveBox();
      if (ctx.redraw) ctx.redraw(['conclusion']);
    }, 'primary']]
  });
}

/** a first draft of the evidence summary, from the criteria and their notes */
function autoSummary(ctx, r) {
  const { cls, ev } = ctx;
  const d = ev && ev.d;
  const parts = [];
  const cons = d ? niceConsequence(d.consequence) : '';
  if (d) parts.push(`${d.gene ? d.gene + ' ' : ''}${d.hgvsc ? d.hgvsc.split(':')[1] : ''}${d.hgvsp ? ' ' + d.hgvsp : ''} is ${/^[aeiou]/i.test(cons) ? 'an' : 'a'} ${cons} variant.`);
  for (const m of r.met) {
    const n = cls.get(m.code).note;
    if (n) parts.push(n.replace(/\.?$/, '.'));
  }
  return parts.join(' ');
}

/** add a looked-up variant to a patient (an existing one, or a new one) */
async function addToPatient(v, cls) {
  const ps = await db.listPatients();
  const pick = select([['new', 'A new patient']].concat(ps.map((x) => [x.id, `Patient ${x.id}${x.ref ? ' – ' + x.ref : ''}`])), ps[0] ? ps[0].id : 'new');
  const zyg = select(ZYGOSITY, v.zygosity || 'heterozygous');
  const inh = select(INHERITANCE, v.inheritance || 'unknown');
  modal('Add the variant to a patient', h('div.stack', field('Patient', pick), h('div.fields', field('Zygosity', zyg), field('Inheritance', inh))), {
    actions: [['Cancel', null, 'ghost'], ['Add', async () => {
      let pid = pick.value;
      if (pid === 'new') {
        const np = await db.savePatient(db.blankPatient(), 'Patient created');
        pid = np.id;
      }
      const rec = Object.assign({}, v, { id: null, patientId: pid, zygosity: zyg.value, inheritance: inh.value, classification: cls.state });
      const saved = await db.saveVariant(rec, 'Variant added from a look-up');
      setLeaveGuard(null);
      toast(`Added to Patient ${pid}.`, 'ok');
      go(`/patient/${pid}/variant/${saved.id}`);
    }, 'primary']]
  });
}
