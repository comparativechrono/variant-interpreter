/* =====================================================================
   Phenotype match (#/match, #/match?patient=1001,
   #/match?terms=HP:0001250,HP:0001263&not=HP:0000365): the diseases
   and genes whose HPO annotations best explain a set of features, and
   the patients in this browser with similar features.

   The scores are hpo.js's (rankDiseases, rankGenes, similarity,
   scoreContext); this page shows why each ranks where it does: which of
   the features matched which of the disease's, through which shared
   term, and how much each counted.
   ===================================================================== */
import { h, fmt, debounce, icon, nowISO, toast, modal, ordinal } from '../core.js';
import { link } from '../router.js';
import * as db from '../db.js';
import * as H from '../hpo.js';
import { page, crumbs, pageHead, note, loading, table, btn, linkBtn, select, field, seg, clsBadge, empty } from '../ui.js';
import { matchRows, coverage, diseaseCoverage, excludedHits, unseenFeatures, ranksWithTies, freqWord } from '../pheno-explain.js';
import { diseaseLink, inhWords } from './gene-parts.js';
import { summariseVariant, patientFacts } from '../summary.js';

const yieldUI = () => new Promise((r) => setTimeout(r, 30));
const KIND_TEXT = { exact: 'the same', specific: 'more specific in the disease', general: 'more general in the disease', related: 'related', none: 'not explained' };

export async function render(root, params, query) {
  const p = page();
  root.appendChild(p);
  p.appendChild(crumbs([['Home', '/'], ['Phenotype match']]));
  p.appendChild(pageHead({
    title: 'Phenotype match',
    lede: 'Rank the diseases and genes whose features in the HPO’s annotations best explain a patient’s, and find the patients in this browser who look alike. The page shows why each one ranks where it does.'
  }));
  const ps = await db.listPatients();
  const withTerms = ps.filter((x) => (x.phenotypes || []).some((t) => t.observed !== false));
  const asked = query.patient && ps.some((x) => x.id === query.patient) ? query.patient : null;
  const st = {
    mode: query.terms ? 'adhoc' : asked || withTerms.length ? 'patient' : 'adhoc',
    patientId: asked || (withTerms[0] ? withTerms[0].id : ps[0] ? ps[0].id : ''),
    adhoc: { obs: splitIds(query.terms), exc: splitIds(query.not) },
    token: 0
  };
  if (query.patient && !asked) p.appendChild(note('warn', h('p', `There’s no Patient ${query.patient} in this browser${ps.length ? ', so choose another below' : ''}.`)));
  const srcBox = h('div.match-src');
  const termsBox = h('div.match-terms');
  const resBox = h('div.match-res');
  p.append(h('section.section.match-input', h('div.section-h', h('h2', 'The features to match')), srcBox, termsBox), resBox);

  const status = loading('Loading the Human Phenotype Ontology…');
  termsBox.appendChild(status);
  try {
    await H.loadTerms();
  } catch (e) {
    termsBox.innerHTML = '';
    termsBox.appendChild(note('bad', h('p', 'The HPO couldn’t be loaded. Try reloading the page. The error was: ' + e.message)));
    return;
  }
  // ids from the address that the HPO doesn't know (or knows by a newer id)
  for (const k of ['obs', 'exc']) st.adhoc[k] = Array.from(new Set(st.adhoc[k].map((id) => (H.term(id) || {}).id).filter(Boolean)));

  /* ---------- where the features come from ---------- */
  const drawSource = () => {
    srcBox.innerHTML = '';
    const modeSeg = seg([['patient', 'A patient’s features'], ['adhoc', 'Features typed here']], st.mode, (v) => {
      if (v === 'adhoc' && !st.adhoc.obs.length && !st.adhoc.exc.length) {
        // start from the patient's features, to try variations on them
        const pt = ps.find((x) => x.id === st.patientId);
        if (pt) {
          st.adhoc.obs = (pt.phenotypes || []).filter((t) => t.observed !== false).map((t) => t.id);
          st.adhoc.exc = (pt.phenotypes || []).filter((t) => t.observed === false).map((t) => t.id);
        }
      }
      st.mode = v;
      drawSource();
      drawTerms();
      changed();
    }, 'Where the features come from');
    srcBox.appendChild(h('div.row', modeSeg));
    if (st.mode === 'patient') {
      if (!ps.length) {
        srcBox.appendChild(h('p.small.muted', 'There are no patients in this browser yet, so type features instead, or make a patient first.'));
        return;
      }
      const sel = select(ps.map((x) => {
        const n = (x.phenotypes || []).filter((t) => t.observed !== false).length;
        return [x.id, `Patient ${x.id}${x.ref ? ' – ' + x.ref : ''} (${n} ${n === 1 ? 'feature' : 'features'})`];
      }), st.patientId);
      sel.addEventListener('change', () => {
        st.patientId = sel.value;
        drawTerms();
        changed();
      });
      srcBox.appendChild(h('div.match-pick', field('Patient', sel)));
    }
  };

  /* ---------- the features, and adding them ---------- */
  const terms = () => {
    if (st.mode === 'patient') {
      const pt = ps.find((x) => x.id === st.patientId);
      const ph = pt ? pt.phenotypes || [] : [];
      return { obs: ph.filter((t) => t.observed !== false).map((t) => t.id), exc: ph.filter((t) => t.observed === false).map((t) => t.id), pt };
    }
    return { obs: st.adhoc.obs.slice(), exc: st.adhoc.exc.slice(), pt: null };
  };
  let addAs = 'observed';
  const q = h('input', { type: 'search', placeholder: 'Type a feature, e.g. seizures, or an HPO id', 'aria-label': 'Search the HPO for a feature', autocomplete: 'off', spellcheck: 'false' });
  const hits = h('div.hpo-hits', { role: 'listbox', 'aria-label': 'Matching HPO terms' });
  const addTerm = (t) => {
    const k = addAs === 'observed' ? 'obs' : 'exc';
    const other = k === 'obs' ? 'exc' : 'obs';
    st.adhoc[other] = st.adhoc[other].filter((x) => x !== t.id);
    if (!st.adhoc[k].includes(t.id)) st.adhoc[k].push(t.id);
    q.value = '';
    hits.innerHTML = '';
    drawTerms();
    changed();
    q.focus();
  };
  const search = debounce(() => {
    hits.innerHTML = '';
    const ms = H.search(q.value, { limit: 10 });
    if (!ms.length && q.value.trim().length >= 3) hits.appendChild(h('p.muted.small', 'No term matches. Try another word for it, or fewer words.'));
    for (const m of ms) {
      const t = m.term;
      const b = h('button.hpo-hit', { type: 'button', role: 'option' },
        h('span.hpo-hit-name', t.name, m.via ? h('span.muted', ` (${m.via})`) : null), h('span.hpo-id', t.id),
        h('span.hpo-hit-def', t.def ? t.def.slice(0, 150) + (t.def.length > 150 ? '…' : '') : ''));
      b.addEventListener('click', () => addTerm(t));
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
  const picker = h('div.match-add',
    h('div.row', { style: { alignItems: 'flex-start' } }, h('div.grow', q), h('div', h('span.small.muted', { style: { marginRight: '6px' } }, 'Add as'), seg([['observed', 'Observed'], ['excluded', 'Excluded']], addAs, (v) => (addAs = v), 'Add features as'))),
    hits);

  const chip = (id, observed, removable) => {
    const t = H.term(id);
    const el = h('li.mchip' + (observed ? '' : '.exc'), h('a', { href: link('/phenotype/' + id), title: t && t.def ? t.def : '' }, t ? t.name : id), h('span.visually-hidden', observed ? ' (observed)' : ' (excluded)'));
    if (removable) {
      const flip = h('button.mchip-b', { type: 'button', title: observed ? 'Move it to excluded (looked for, and absent)' : 'Move it to observed', 'aria-label': `${t ? t.name : id}: move it to ${observed ? 'excluded' : 'observed'}` }, observed ? 'rule out' : 'seen');
      flip.addEventListener('click', () => {
        const from = observed ? 'obs' : 'exc', to = observed ? 'exc' : 'obs';
        st.adhoc[from] = st.adhoc[from].filter((x) => x !== id);
        st.adhoc[to].push(id);
        drawTerms();
        changed();
      });
      const del = h('button.mchip-x', { type: 'button', 'aria-label': `Remove ${t ? t.name : id}`, html: icon('x') });
      del.addEventListener('click', () => {
        st.adhoc.obs = st.adhoc.obs.filter((x) => x !== id);
        st.adhoc.exc = st.adhoc.exc.filter((x) => x !== id);
        drawTerms();
        changed();
      });
      el.append(flip, del);
    }
    return el;
  };
  const drawTerms = () => {
    termsBox.innerHTML = '';
    const { obs, exc, pt } = terms();
    const edit = st.mode === 'adhoc';
    if (edit) termsBox.appendChild(picker);
    if (!obs.length && !exc.length) {
      termsBox.appendChild(h('p.muted', edit ? 'Add two or more of the features you see, and any you looked for and found absent.' : pt ? `Patient ${pt.id} has no features recorded yet. ` : 'Choose a patient.', pt ? h('a', { href: link(`/patient/${pt.id}/phenotypes`) }, 'Record their features') : null));
      return;
    }
    termsBox.appendChild(h('div.mchips',
      obs.length ? h('div', h('h3.vsub', `Observed (${obs.length})`), h('ul.mchip-list', obs.map((id) => chip(id, true, edit)))) : null,
      exc.length ? h('div', h('h3.vsub', `Excluded (${exc.length})`), h('ul.mchip-list', exc.map((id) => chip(id, false, edit)))) : null));
    const tools = h('div.btn-row');
    if (pt) tools.appendChild(linkBtn(`Change Patient ${pt.id}’s features`, `/patient/${pt.id}/phenotypes`, { cls: 'small', icon: 'pencil' }));
    if (edit && (obs.length || exc.length)) {
      tools.appendChild(btn('Clear', () => {
        st.adhoc = { obs: [], exc: [] };
        drawTerms();
        changed();
      }, { cls: 'small ghost' }));
      if (ps.length) tools.appendChild(btn('Save them to a patient…', () => saveToPatient(ps, st.adhoc), { cls: 'small', icon: 'save' }));
    }
    termsBox.appendChild(tools);
  };

  /* ---------- running the match ---------- */
  const keepAddress = () => {
    const qs = st.mode === 'patient' ? (st.patientId ? `?patient=${encodeURIComponent(st.patientId)}` : '')
      : st.adhoc.obs.length || st.adhoc.exc.length ? `?terms=${st.adhoc.obs.join(',')}${st.adhoc.exc.length ? '&not=' + st.adhoc.exc.join(',') : ''}` : '';
    history.replaceState(null, '', '#/match' + qs);
  };
  const run = async () => {
    const token = ++st.token;
    const { obs, exc, pt } = terms();
    keepAddress();
    resBox.innerHTML = '';
    if (!obs.length) {
      resBox.appendChild(empty('Nothing to match yet', st.mode === 'patient' ? 'The patient needs observed features (HPO terms) first.' : 'Add the features you see above.'));
      return;
    }
    const prog = h('div.loading', { 'aria-live': 'polite' }, h('span.spinner'), h('span', 'Loading the disease annotations…'));
    resBox.appendChild(prog);
    const say = (t) => (prog.lastChild.textContent = t);
    try {
      const D = await H.loadDiseases();
      if (token !== st.token) return;
      say(`Comparing ${obs.length} ${obs.length === 1 ? 'feature' : 'features'} with ${fmt(D.length)} diseases…`);
      await yieldUI();
      if (token !== st.token) return;
      const ranked = await H.rankDiseases(obs, exc, { limit: 300 });
      if (token !== st.token) return;
      // the patient's variants, and everyone's (for marking genes and finding similar patients)
      const all = await db.allVariants();
      const varsOf = (pid) => all.filter((v) => v.patientId === pid).map((v) => ({ v, s: summariseVariant(v) }));
      const mine = pt ? varsOf(pt.id) : [];
      const myGenes = new Map();
      for (const x of mine) if (x.s.gene && x.v.kind !== 'cnv') (myGenes.get(x.s.gene) || myGenes.set(x.s.gene, []).get(x.s.gene)).push(x);
      prog.remove();
      const dzSec = h('section.section');
      const geneSec = h('section.section');
      const ptSec = h('section.section');
      resBox.append(howItWorks(), dzSec, geneSec, ptSec);
      drawDiseases(dzSec, ranked, obs, exc, myGenes, pt, D.length);
      // the genes: every gene, so that the patient's own genes can be placed
      geneSec.appendChild(loading('Ranking the genes by their best disease…'));
      await yieldUI();
      if (token !== st.token) return;
      const genes = await H.rankGenes(obs, exc, { limit: 100000 });
      if (token !== st.token) return;
      geneSec.innerHTML = '';
      drawGenes(geneSec, genes, obs, myGenes, pt);
      // patients who look alike
      await yieldUI();
      if (token !== st.token) return;
      drawSimilar(ptSec, ps, obs, pt, varsOf, myGenes);
      // how unusual the best score is, against random features
      if (ranked.length) {
        const ctx = await H.scoreContext(obs, ranked[0].score, 200);
        if (token !== st.token || !ctx) return;
        const box = dzSec.querySelector('.match-context');
        if (box) box.textContent = `For comparison, ${obs.length} ${obs.length === 1 ? 'feature' : 'features'} drawn at random score ${fmt(ctx.median, 2)} against a random disease (the median of 200 tries). The best fit here, ${fmt(ranked[0].score, 2)}, is higher than ${ctx.p < 0.01 ? 'more than 99%' : Math.round((1 - ctx.p) * 100) + '%'} of those tries.`;
      }
    } catch (e) {
      if (token !== st.token) return;
      resBox.innerHTML = '';
      resBox.appendChild(note('bad', h('p', 'The match couldn’t be made. Try reloading the page. The error was: ' + e.message)));
    }
  };
  // the features changed: match again, once the typing or clicking has paused
  const changed = debounce(run, 350);
  drawSource();
  drawTerms();
  run();
}

const splitIds = (s) => String(s || '').split(/[\s,;]+/).map((x) => x.trim()).filter((x) => /^HP[:_]?\d{7}$/i.test(x)).map((x) => 'HP:' + x.slice(-7));

/** how the scores are made, for students */
function howItWorks() {
  return h('details.match-how',
    h('summary', 'How the ranking works'),
    h('div.small',
      h('p', 'Every HPO term has an information content (IC), which is higher the rarer a feature is among the annotated diseases. Each of the features is matched with the disease feature it shares the most specific term with in the ontology, and it scores that shared term’s IC. The match might be the same feature, a more specific or more general form of it, or a related one. A disease’s score is the average over the features, as in the Phenomizer, so it’s highest when the disease has every feature, especially the rare ones.'),
      h('p', 'Excluded features, which were looked for and found absent, count against a disease that has them, and more so if they’re frequent in it. Genes are scored by their best-fitting disease. Patients are compared both ways round, by how well each one’s features explain the other’s, and the two scores are averaged.'),
      h('p', 'That fit is often the same for many diseases, because each has all the features. They’re then ordered by the score both ways round, which also takes the same average over the disease’s own features. This favours a disease that the features account for more of. Only diseases equal on both scores share a rank (=1). More specific features, and features ruled out, separate them better still.'),
      h('p', 'The annotations are incomplete and uneven. Some diseases have hundreds of features and others only a handful, so treat this as a list to think with rather than a diagnosis.')));
}

/* ---------- the diseases ---------- */
/** the score both ways round (how well the features and the disease's features explain each other), kept per disease */
function bothWays(obs) {
  const memo = new Map();
  return (d) => {
    if (!memo.has(d.id)) memo.set(d.id, H.similarity(obs, d.pheno.keys(), { symmetric: true }).score);
    return memo.get(d.id);
  };
}
const EPS = 0.005;
const byFitThenBoth = (both, dOf) => (a, b) => (Math.abs(b.score - a.score) > EPS ? b.score - a.score : both(dOf(b)) - both(dOf(a)));

function drawDiseases(sec, ranked, obs, exc, myGenes, pt, nAll) {
  sec.appendChild(h('div.section-h', h('h2', 'Diseases that fit'), h('span.small.muted', `the best of the HPO’s ${fmt(nAll)} annotated diseases`)));
  sec.appendChild(h('p.small.muted.match-context', { 'aria-live': 'polite' }));
  if (!ranked.length) {
    sec.appendChild(h('p.muted', 'No disease shares a feature with these.'));
    return;
  }
  const both = bothWays(obs);
  const list = ranked.slice().sort(byFitThenBoth(both, (r) => r.disease));
  const ranks = ranksWithTies(list, (r) => [r.score, both(r.disease)]);
  const ol = h('ol.match-list');
  let shown = 0;
  const more = h('div.btn-row');
  const add = (n) => {
    for (const [i, r] of list.slice(shown, shown + n).entries()) ol.appendChild(diseaseItem(r, ranks[shown + i], both(r.disease), obs, exc, myGenes));
    shown = Math.min(list.length, shown + n);
    more.innerHTML = '';
    if (shown < list.length && shown < 100) more.appendChild(btn('Show 20 more', () => add(20), { cls: 'small' }));
  };
  sec.append(ol, more);
  add(20);
  const tiedFit = list.filter((r) => Math.abs(r.score - list[0].score) <= EPS).length;
  if (tiedFit > 1) sec.insertBefore(h('p.small.muted', `${tiedFit >= list.length ? 'All' : fmt(tiedFit)} of these diseases fit the features equally well, because each has them all or near enough. So they’re ordered by the score both ways round, which shows how much of each disease the features account for.`), ol);
  if (pt && myGenes.size) {
    const placed = Array.from(myGenes.keys()).map((g) => ({ g, i: list.findIndex((r) => r.disease.genes.includes(g)) })).filter((x) => x.i >= 0);
    if (placed.length) sec.appendChild(note('', h('p', `Patient ${pt.id}’s variant genes among these diseases: `, placed.map((x, k) => [k ? '; ' : '', h('i', x.g), ` (its best disease is number ${ranks[x.i].label} here)`]), '. The Genes section below places every gene.')));
  }
}

function diseaseItem(r, rk, bw, obs, exc, myGenes) {
  const d = r.disease;
  const cov = coverage(r.matches);
  const dcov = diseaseCoverage(obs, d);
  const flagged = d.genes.filter((g) => myGenes.has(g));
  const rows = matchRows(r.matches);
  const ex = excludedHits(exc, d);
  const unseen = unseenFeatures(obs, exc, d, 6);
  const why = h('details.match-why',
    h('summary', 'Why it ranks here'),
    table([
      { key: 'p', label: 'Feature', fmt: (x) => h('a', { href: link('/phenotype/' + H.hpId(x.patient)) }, H.name(x.patient)) },
      { key: 't', label: 'In the disease', fmt: (x) => (x.target != null && x.kind !== 'none' ? h('span', x.kind === 'exact' ? h('span.muted', 'the same') : h('a', { href: link('/phenotype/' + H.hpId(x.target)) }, H.name(x.target)), x.kind !== 'exact' ? h('span.small.muted', ` (${KIND_TEXT[x.kind]}${x.kind === 'related' ? ', as both are ' + H.name(x.via) : ''})`) : null, freqOf(d, x.target)) : h('span.faint', 'not explained')) },
      { key: 'ic', label: 'Counts for', num: true, fmt: (x) => h('span.ic-cell', h('span.ic-bar', { style: { width: Math.min(60, x.ic * 7) + 'px' } }), fmt(x.ic, 2)) }
    ], rows, { compact: true, caption: `How ${d.name} explains the features` }),
    h('p.small.muted', `The fit, ${fmt(r.score, 2)}, is the average of the right-hand column${ex.length ? ', less a penalty for the excluded features it has' : ''}. Both ways round, the score is ${fmt(bw, 2)}, which takes the same average over the disease’s ${dcov.total} features as well.`),
    ex.length ? h('p.small', h('b', 'Ruled out but in the disease: '), ex.map((x, i) => [i ? '; ' : '', H.name(x.term), x.diseaseTerm !== x.term ? ` (as ${H.name(x.diseaseTerm)})` : '', ` – ${freqWord(x.freq)}`]), '. These count against it.') : null,
    unseen.length ? h('p.small', h('b', 'Common in the disease but not recorded: '), unseen.map((x, i) => [i ? '; ' : '', h('a', { href: link('/phenotype/' + H.hpId(x.term)) }, H.name(x.term)), h('span.muted', `, ${freqWord(x.freq)}`)]), '. Look for them, or record them as excluded.') : null);
  return h('li.match-item' + (flagged.length ? '.hasvar' : ''),
    h('div.match-h',
      h('span.match-rank', { title: rk.tied ? 'Shares this rank with others of the same scores' : null }, rk.label),
      h('span.match-name', diseaseLink(d), ' ', h('span.hpo-id', d.id)),
      h('span.match-score', h('span', { title: 'The fit shows how well the disease explains the features, as the average information content of their best matches' }, fmt(r.score, 2)), h('span.match-both', { title: 'Both ways round also counts how well the features account for the disease’s own' }, `${fmt(bw, 2)} both ways`))),
    h('div.small.muted.match-meta',
      d.inh.length ? inhWords(d.inh, H) + '. ' : '',
      d.genes.length ? [d.genes.length === 1 ? 'Gene ' : 'Genes ', d.genes.slice(0, 6).map((g, i) => [i ? ', ' : '', h('a', { href: link('/gene/' + g) }, h('i', g)), myGenes.has(g) ? h('b.fit-flag', ' (a variant in this patient)') : null]), d.genes.length > 6 ? ` and ${d.genes.length - 6} more` : '', '.'] : 'No gene known.'),
    h('div.small.match-meta', `It explains ${cov.explained} of the ${cov.total} ${cov.total === 1 ? 'feature' : 'features'}${cov.related ? ` (${cov.related} more loosely)` : ''}, and ${dcov.total === 1 ? (dcov.seen ? 'its only feature is matched' : 'its only feature isn’t matched') : dcov.seen === dcov.total ? `all ${dcov.total} of its own features are matched` : `${dcov.seen} of its own ${dcov.total} features ${dcov.seen === 1 ? 'is' : 'are'} matched`}.`),
    why);
}
function freqOf(d, n) {
  if (n == null || !d.pheno.has(n)) return null;
  const f = d.pheno.get(n);
  return f == null ? null : h('span.small.muted', `, ${freqWord(f)}`);
}

/* ---------- the genes ---------- */
function drawGenes(sec, genes, obs, myGenes, pt) {
  sec.appendChild(h('div.section-h', h('h2', 'Genes'), h('span.small.muted', `scored by their best-fitting disease, of ${fmt(genes.length)} genes with an annotated disease`)));
  if (!genes.length) {
    sec.appendChild(h('p.muted', 'No gene’s diseases share a feature with these.'));
    return;
  }
  const both = bothWays(obs);
  // the order within equal fits needs the score both ways round: worked out for the leading genes only (it is slower)
  const head = genes.slice(0, 300).sort(byFitThenBoth(both, (r) => r.disease));
  const list = head.concat(genes.slice(300));
  const ranks = ranksWithTies(head, (r) => [r.score, both(r.disease)]);
  // where a gene of the patient's variants comes: one more than the number of genes that do better (fit, then both ways)
  const placeOf = (r) => {
    const b = both(r.disease);
    const better = list.filter((x) => x.score > r.score + EPS || (Math.abs(x.score - r.score) <= EPS && both(x.disease) > b + EPS)).length;
    const level = list.filter((x) => Math.abs(x.score - r.score) <= EPS && Math.abs(both(x.disease) - b) <= EPS).length;
    return (level > 1 ? 'joint ' : '') + ordinal(better + 1);
  };
  if (pt && myGenes.size) {
    const items = Array.from(myGenes).map(([g, vs]) => {
      const r = list.find((x) => x.gene === g);
      const v = vs.map((x, i) => [i ? ', ' : '', clsBadge(x.s.cls, { short: true, empty: 'not classified' }), ' ', h('span.hgvs', x.s.short)]);
      if (!r) return h('li', h('a', { href: link('/gene/' + g) }, h('i', g)), ': ', v, h('span.muted', '. No disease of this gene in the HPO’s annotations shares a feature with these, so it can’t be placed.'));
      return h('li', h('a', { href: link('/gene/' + g) }, h('i', g)), ': ', v, `. It ranks ${placeOf(r)} of ${fmt(list.length)} genes, fitting best through ${r.disease.name} with a score of ${fmt(r.score, 2)}.`);
    });
    sec.appendChild(h('div.note', h('p', h('b', `Patient ${pt.id}’s variant genes`)), h('ul.small', items),
      h('p.small.muted', 'A gene near the top fits the phenotype. One far down may still be the cause, because the annotations are incomplete, or it may not explain the phenotype at all. This is the sort of evidence PP4 weighs when the phenotype is specific.')));
  }
  const rows = list.slice(0, 25).map((r, i) => Object.assign({ rk: ranks[i] }, r));
  sec.appendChild(table([
    { key: 'rk', label: 'Rank', fmt: (r) => h('span.match-rank', r.rk.label) },
    { key: 'gene', label: 'Gene', fmt: (r) => h('span', h('a', { href: link('/gene/' + r.gene) }, h('i.gene', r.gene)), myGenes.has(r.gene) ? h('span.tag.accent', { style: { marginLeft: '6px' } }, 'variant in the patient') : null) },
    { key: 'score', label: 'Fit', num: true, fmt: (r) => fmt(r.score, 2) },
    { key: 'both', label: 'Both ways', num: true, fmt: (r) => fmt(both(r.disease), 2) },
    { key: 'd', label: 'Best-fitting disease', fmt: (r) => h('span', diseaseLink(r.disease), h('span.small.muted', ` – explains ${coverage(r.matches).explained} of ${obs.length}`)) }
  ], rows, { compact: true, caption: 'Genes ranked by their best-fitting disease' }));
}

/* ---------- patients who look alike ---------- */
const PATIENT_KIND = (k, who) => ({ exact: 'the same', specific: `more specific in ${who}`, general: `more general in ${who}`, related: 'related' })[k] || '';
function drawSimilar(sec, ps, obs, pt, varsOf, myGenes) {
  sec.appendChild(h('div.section-h', h('h2', 'Patients in this browser who look alike')));
  const others = ps.filter((x) => (!pt || x.id !== pt.id) && (x.phenotypes || []).some((t) => t.observed !== false));
  if (!others.length) {
    sec.appendChild(h('p.small.muted', pt ? 'No other patient in this browser has features recorded.' : 'No patient in this browser has features recorded.'));
    return;
  }
  const mine = obs.map((t) => (H.term(t) || {}).n).filter((x) => x != null);
  const rows = others.map((x) => {
    const theirs = (x.phenotypes || []).filter((t) => t.observed !== false).map((t) => (H.term(t.id) || {}).n).filter((n) => n != null);
    const both = H.similarity(mine, theirs, { symmetric: true });
    const one = H.similarity(mine, theirs);
    const vs = varsOf(x.id);
    const genes = Array.from(new Set(vs.map((y) => y.s.gene).filter(Boolean)));
    const matched = matchRows(one.matches).filter((m) => m.kind !== 'none');
    return { x, score: both.score, strong: matched.filter((m) => m.ic >= 1.5), weak: matched.filter((m) => m.ic < 1.5).length, genes, shared: genes.filter((g) => myGenes.has(g)) };
  }).filter((r) => r.score > 0).sort((a, b) => b.score - a.score || b.shared.length - a.shared.length).slice(0, 10);
  if (!rows.length) {
    sec.appendChild(h('p.small.muted', 'None of them shares an informative feature.'));
    return;
  }
  sec.appendChild(h('p.small.muted', 'Patients are compared both ways round, by how well each one’s features explain the other’s, and the features that match best are listed. Shared genes are marked.'));
  const top = rows[0].score || 1;
  const ol = h('ol.match-list');
  for (const r of rows) {
    const who = 'Patient ' + r.x.id;
    ol.appendChild(h('li.match-item' + (r.shared.length ? '.hasvar' : ''),
      h('div.match-h',
        h('span.match-name', h('a', { href: link('/patient/' + r.x.id) }, who), r.x.ref ? h('span.muted', ' ' + r.x.ref) : null, h('span.small.muted', ' ' + (patientFacts(r.x).short || ''))),
        h('span.match-score', { title: 'Similarity, both ways round' }, fmt(r.score, 2))),
      h('div.fit-bar', h('span', { style: { width: Math.max(3, (r.score / top) * 100) + '%' } })),
      r.strong.length
        ? h('div.small', 'In common: ', r.strong.slice(0, 5).map((m, i) => [i ? '; ' : '', h('b', H.name(m.patient)), m.kind === 'exact' ? h('span.muted', ' (the same)') : m.kind === 'related' ? h('span.muted', ` and ${H.name(m.target)} (both are ${H.name(m.via)})`) : h('span.muted', ` as ${H.name(m.target)} (${PATIENT_KIND(m.kind, who)})`)]), r.weak ? h('span.muted', `; and ${r.weak} looser ${r.weak === 1 ? 'link' : 'links'}`) : null)
        : h('div.small.muted', 'They have only very general features in common.'),
      r.genes.length ? h('div.small.muted', 'Variants in: ', r.genes.map((g, i) => [i ? ', ' : '', h('a', { href: link('/gene/' + g) }, h('i', g)), r.shared.includes(g) ? h('b.fit-flag', ' (a gene of this patient’s too)') : null])) : h('div.small.faint', 'No variants yet.')));
  }
  sec.appendChild(ol);
}

/** put typed features into a patient's phenotype */
function saveToPatient(ps, adhoc) {
  const sel = select(ps.map((x) => [x.id, `Patient ${x.id}${x.ref ? ' – ' + x.ref : ''}`]), ps[0].id);
  modal('Save the features to a patient', h('div.stack', field('Patient', sel), h('p.small.muted', `${adhoc.obs.length} observed and ${adhoc.exc.length} excluded features will be added to the patient’s. Any that the patient already has will take the state given here.`)), {
    actions: [['Cancel', null, 'ghost'], ['Save', async () => {
      const pt = await db.getPatient(sel.value);
      if (!pt) return;
      pt.phenotypes = pt.phenotypes || [];
      for (const [ids, observed] of [[adhoc.obs, true], [adhoc.exc, false]]) {
        for (const id of ids) {
          const t = H.term(id);
          if (!t) continue;
          const ex = pt.phenotypes.find((x) => x.id === t.id);
          if (ex) ex.observed = observed;
          else pt.phenotypes.push({ id: t.id, name: t.name, observed, onset: '', note: '', added: nowISO() });
        }
      }
      await db.savePatient(pt, `${adhoc.obs.length + adhoc.exc.length} phenotypes added from Phenotype match`);
      toast(`Saved to Patient ${pt.id}.`, 'ok');
    }, 'primary']]
  });
}

