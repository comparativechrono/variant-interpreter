/* =====================================================================
   The report: what a clinical genomics laboratory sends back, in the
   order such reports keep (the result and its meaning first; then each
   variant's classification with its evidence, criterion by criterion;
   the phenotype and family it was weighed against; methods and
   limitations; who classified it). To print, or to save as a PDF.

   The summary and recommendations are the student's own words, kept
   with the patient (pt.report). Classes are the signed ones; a variant
   not yet signed is reported with its class so far, and says so.
   ===================================================================== */
import { h, toast, dateStr, nowISO, copyText } from '../core.js';
import { link } from '../router.js';
import * as db from '../db.js';
import * as settings from '../settings.js';
import { btn, note, clsBadge, field } from '../ui.js';
import { summariseVariant, variantLong, genomicText, patientFacts, inheritanceText, signerName } from '../summary.js';
import { CRITERIA, BY_CODE } from '../acmg/criteria.js';
import { classify, criteriaString, POINTS } from '../acmg/engine.js';
import { fw, labelFor } from '../acmg/frameworks.js';
import { itemOf, score as cnvScore, fmtPts } from '../cnv/rubric.js';
import { inhShort, zygText } from './patient-common.js';
import { ASSESS_ROWS, ASSESS_LEVELS, conclusionText } from './patient-overview.js';
import { bands, iscnOf } from '../widgets/karyogram.js';
import { familyList } from './patient-family.js';

const CLS_WORD = { p: 'Pathogenic', lp: 'Likely pathogenic', vus: 'Uncertain significance', lb: 'Likely benign', b: 'Benign' };
const SW = { VS: 'Very strong', S: 'Strong', M: 'Moderate', P: 'Supporting', SA: 'Stand-alone' };
const ORDER = { p: 0, lp: 1, vus: 2, lb: 3, b: 4 };

export async function render(body, { patient: pt, variants: vs }) {
  const F = settings.get('framework');
  pt.report = pt.report || {};
  const S = vs.map((v) => ({ v, s: summariseVariant(v) })).sort((a, b) => (ORDER[a.s.cls] ?? 9) - (ORDER[b.s.cls] ?? 9));
  const unsigned = S.filter((x) => !x.s.final);
  // the chromosome bands, for describing copy-number variants as a laboratory does (ISCN)
  const B = {};
  for (const a of new Set(vs.filter((v) => v.kind === 'cnv').map((v) => v.assembly || 'GRCh38'))) B[a] = await bands(a).catch(() => null);
  const iscn = (v) => iscnOf(v, B[v.assembly || 'GRCh38']);

  /* ---------- the tools (not printed) ---------- */
  const summaryIn = h('textarea', { rows: 4, placeholder: 'Summarise the result in a few sentences. It’s the first thing the clinician reads.' });
  summaryIn.value = pt.report.summary || draftSummary(pt, S, B[(vs.find((v) => v.kind === 'cnv') || {}).assembly || 'GRCh38']);
  const recIn = h('textarea', { rows: 3, placeholder: 'e.g. Testing of the parents is recommended. Referral to… Cascade testing is available to relatives.' });
  recIn.value = pt.report.recommendations || '';
  const saveWords = async () => {
    pt.report = Object.assign({}, pt.report, { summary: summaryIn.value.trim(), recommendations: recIn.value.trim(), at: nowISO() });
    await db.savePatient(pt, null);
    sumOut.textContent = pt.report.summary || '';
    recOut.textContent = pt.report.recommendations || 'None.';
  };
  summaryIn.addEventListener('change', saveWords);
  recIn.addEventListener('change', saveWords);
  const tools = h('div.report-tools.no-print',
    h('div.btn-row', btn('Print or save as PDF', () => window.print(), { cls: 'primary', icon: 'print' }),
      btn('Copy the text', async () => {
        await copyText(paper.innerText);
        toast('The report’s text has been copied.', 'ok');
      }, { icon: 'copy' })),
    unsigned.length ? note('warn', h('p', `${S.length === 1 ? 'The variant isn’t' : unsigned.length === S.length ? (S.length === 2 ? 'Neither variant is' : `None of the ${S.length} variants is`) : `${unsigned.length} of the ${S.length} variants ${unsigned.length === 1 ? 'isn’t' : 'aren’t'}`} signed yet, so the report gives ${unsigned.length === 1 ? 'its class' : 'their classes'} as calculated so far and marks ${unsigned.length === 1 ? 'it' : 'them'} “not signed yet”. You can sign each classification on the variant’s page.`)) : null,
    h('details.report-edit', { open: !pt.report.summary || null },
      h('summary', 'Your summary and recommendations'),
      field('Result summary', summaryIn, 'A draft is written for you from the variants and the assessment. Edit it to make it your own.'),
      field('Recommendations', recIn)));
  body.appendChild(tools);

  /* ---------- the report ---------- */
  const paper = h('article.report', { 'aria-label': `Report for Patient ${pt.id}` });
  body.appendChild(paper);
  const facts = patientFacts(pt);
  const today = new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
  paper.appendChild(h('header.rp-head',
    h('div', h('p.rp-kicker', 'Genomic test report'), h('h1.rp-title', `Patient ${pt.id}${pt.ref ? ' – ' + pt.ref : ''}`)),
    h('p.rp-teaching', 'For teaching only. This is not a clinical report, and the patient is fictional or anonymised.')));
  paper.appendChild(h('dl.rp-facts',
    pair('Sex', facts.pairs[0][1]), pair(facts.pairs[1][0], facts.pairs[1][1]),
    pt.karyotype ? pair('Karyotype', pt.karyotype) : null,
    pair('Reason for testing', pt.referral || 'Not recorded'),
    pair('Test', pt.test && pt.test.type ? [pt.test.type, pt.test.panel && pt.test.panel.name ? `${pt.test.panel.name}${pt.test.panel.version ? ' (v' + pt.test.panel.version + ')' : ''}` : ''].filter(Boolean).join(': ') : 'Not recorded'),
    pair('Report date', today)));

  // the result
  const sumOut = h('p.rp-summary', pt.report.summary || summaryIn.value);
  paper.appendChild(h('section.rp-sec.rp-result', h('h2', 'Result'), sumOut));
  if (pt.assessment && pt.assessment.conclusion) {
    paper.appendChild(h('p.rp-concl', h('b', 'Conclusion: '), conclusionText(pt.assessment.conclusion), pt.assessment.disease ? ` (${pt.assessment.disease})` : '', '.'));
  }

  // the variants, in a table
  const resTable = h('table.rp-table');
  resTable.appendChild(h('thead', h('tr', ['Gene', 'Variant', 'Zygosity', 'Inheritance', 'Classification'].map((x) => h('th', { scope: 'col' }, x)))));
  const tb = h('tbody');
  for (const { v, s } of S) {
    tb.appendChild(h('tr',
      h('td', v.kind === 'cnv' ? (v.genesSummary ? h('span.small', v.genesSummary) : '–') : s.gene ? h('i', s.gene) : '–'),
      h('td', v.kind === 'cnv' ? [h('span.hgvs', iscn(v)), h('div.small.muted', variantLong(v))] : [h('span.hgvs', variantLong(v)), h('div.small.muted', genomicText(v))]),
      h('td', v.kind === 'cnv' ? (v.copyNumber != null ? `${v.copyNumber} ${v.copyNumber === 1 ? 'copy' : 'copies'}` : '–') : zygText(v.zygosity)),
      h('td', inhShort(v.inheritance)),
      h('td', !s.final && s.assessed === false ? h('span.muted', 'Not assessed yet') : [clsBadge(s.cls, { empty: 'Not classified' }), s.final ? null : h('div.small.muted', 'not signed yet')])));
  }
  if (!S.length) tb.appendChild(h('tr', h('td', { colspan: 5 }, 'No variants were recorded.')));
  resTable.appendChild(tb);
  paper.appendChild(h('section.rp-sec', h('h2', 'Variants'), resTable));

  // each variant's interpretation
  for (const { v, s } of S) paper.appendChild(v.kind === 'cnv' ? cnvBlock(pt, v, s, iscn(v)) : seqBlock(pt, v, s, F));

  // the clinical assessment
  if (pt.assessment && Object.values(pt.assessment.rows || {}).some(Boolean)) {
    const a = pt.assessment;
    paper.appendChild(h('section.rp-sec', h('h2', 'Clinical assessment'),
      h('p', 'How well the genotype explains the phenotype', a.disease ? ` (${a.disease})` : '', ':'),
      h('table.rp-table.rp-small', h('tbody', ASSESS_ROWS.filter(([k]) => a.rows[k]).map(([k, label]) => h('tr', h('th', { scope: 'row' }, label), h('td', (ASSESS_LEVELS.find((x) => x[0] === a.rows[k]) || [null, ''])[1]))))),
      a.note ? h('p', a.note) : null,
      h('p.small.muted', `Assessed${signerName(a.by) ? ' by ' + a.by : ''} on ${dateStr(a.at)}.`)));
  }

  // the phenotype
  const obs = (pt.phenotypes || []).filter((t) => t.observed !== false);
  const exc = (pt.phenotypes || []).filter((t) => t.observed === false);
  paper.appendChild(h('section.rp-sec', h('h2', 'Clinical features (HPO)'),
    obs.length ? h('p', h('b', 'Present: '), obs.map((t) => `${t.name} (${t.id})`).join('; '), '.') : h('p', 'No features recorded.'),
    exc.length ? h('p', h('b', 'Looked for and absent: '), exc.map((t) => `${t.name} (${t.id})`).join('; '), '.') : null,
    pt.summary ? h('p', pt.summary) : null,
    pt.familyHistory ? h('p', h('b', 'Family history: '), pt.familyHistory) : null));

  // the family's results
  const fam = (await familyList(pt)).filter((r) => r.relation !== 'proband');
  const resultOf = (v, id) => {
    const g = (v.familyGenotypes || {})[id];
    return g && g !== 'untested' ? g : null;
  };
  const withResults = fam.filter((r) => vs.some((v) => resultOf(v, r.id)));
  if (withResults.length) {
    const GT = { het: 'detected (heterozygous)', hom: 'detected (homozygous)', hemi: 'detected (hemizygous)', ref: 'not detected' };
    const GT_CNV = { het: 'detected', hom: 'detected on both copies', hemi: 'detected', ref: 'not detected' };
    paper.appendChild(h('section.rp-sec', h('h2', 'Relatives tested'),
      h('ul', withResults.map((r) => h('li', `${cap(r.relation)} (${r.label}, ${r.affected === 'affected' ? 'affected' : r.affected === 'unaffected' ? 'unaffected' : 'status not known'}): `,
        vs.filter((v) => resultOf(v, r.id)).map((v) => {
          const g = resultOf(v, r.id);
          return v.kind === 'cnv' ? `${iscn(v)} ${GT_CNV[g] || g}` : `${summariseVariant(v).short} ${GT[g] || g}`;
        }).join('; '))))));
  }

  // recommendations
  const recOut = h('p', pt.report.recommendations || 'None.');
  paper.appendChild(h('section.rp-sec', h('h2', 'Recommendations'), recOut));

  // methods
  // the guidelines the sequence variants were classified with: those each was signed with (else the current ones)
  const seqS = S.filter((x) => x.v.kind !== 'cnv');
  const used = Array.from(new Set(seqS.map((x) => (x.s.final && x.s.signed.framework) || F)));
  const HOW = {
    acgs2024: 'following the ACGS Best Practice Guidelines for Variant Classification in Rare Disease 2024 (Durkie et al.), with the evidence combined as points (Tavtigian et al. 2018, 2020)',
    clingen: 'following ClinGen’s guidance for applying them, with the evidence combined as points (Tavtigian et al. 2018, 2020)',
    acmg2015: 'combining the evidence by the rules of the 2015 paper'
  };
  const how = used.length === 1 ? HOW[used[0]] || HOW.acgs2024 : `${used.map((k) => HOW[k] || HOW.acgs2024).join('; or ')}, as recorded in each variant’s classification`;
  paper.appendChild(h('section.rp-sec.rp-methods', h('h2', 'Methods and limitations'),
    h('p', `${seqS.length ? `Sequence variants were classified with the ACMG/AMP criteria (Richards et al. 2015), ${how}. ` : ''}${S.length > seqS.length ? 'Copy-number variants were scored with the ACMG/ClinGen technical standards (Riggs et al. 2020). ' : ''}Evidence was gathered from Ensembl VEP, gnomAD, ClinVar, ClinGen, UniProt, AlphaFold DB and SpliceAI on the dates the variants were annotated, as listed on each variant’s page.`),
    h('p', 'Variants are described with HGVS nomenclature on the MANE Select transcript unless otherwise stated. The classification of a variant can change as evidence accumulates. Variants of uncertain significance should not be used for clinical decisions. This report was produced in a teaching tool and is not validated for clinical use.')));

  // sign-off
  const signers = Array.from(new Set(S.filter((x) => x.s.final).map((x) => signerName(x.s.signed.by)).filter(Boolean)));
  paper.appendChild(h('footer.rp-sign',
    h('div', h('span.rp-sign-l', 'Classified by'), h('span.rp-sign-v', signers.join(', ') || '…………………………')),
    h('div', h('span.rp-sign-l', 'Checked by'), h('span.rp-sign-v', '…………………………')),
    h('div', h('span.rp-sign-l', 'Date'), h('span.rp-sign-v', today))));
}

const pair = (k, v) => [h('dt', k), h('dd', v)];
const cap = (s) => (s ? s[0].toUpperCase() + s.slice(1) : s);

/** a first draft of the result, from the variants and the assessment */
function draftSummary(pt, S, B) {
  const looked = S.filter(({ s }) => s.final || s.assessed !== false);
  const notYet = S.length - looked.length;
  const key = looked.filter(({ s }) => s.cls === 'p' || s.cls === 'lp');
  const vus = looked.filter(({ s }) => s.cls === 'vus');
  const parts = [];
  const inhWords = (v) => {
    const k = v.inheritance || 'unknown';
    if (k === 'unknown') return '';
    if (k === 'maternal') return ', inherited from the mother';
    if (k === 'paternal') return ', inherited from the father';
    if (k === 'biparental') return ', inherited from both parents';
    return ', ' + inhShort(k).replace(/^De novo/, 'de novo').replace(/^Maternal/, 'maternal').replace(/^Paternal/, 'paternal').replace(/^Not /, 'not ').replace(/^From /, 'from ');
  };
  const one = ({ v, s }) => {
    const cls = CLS_WORD[s.cls].toLowerCase();
    if (v.kind === 'cnv') return `A ${cls} copy-number ${v.cnvType === 'gain' ? 'gain' : 'loss'}, ${iscnOf(v, B)}${v.genesSummary ? ` (${v.genesSummary})` : ''}${inhWords(v)}, was identified.`;
    const zyg = v.zygosity && v.zygosity !== 'unknown' ? v.zygosity + ' ' : '';
    const an = /^[aeiou]/i.test(zyg || cls) ? 'An' : 'A';
    return `${an} ${zyg}${cls} variant${s.gene ? ' in ' + s.gene : ''}, ${variantLong(v)}${inhWords(v)}, was identified.`;
  };
  if (key.length) {
    parts.push(key.map(one).join(' '));
    if (pt.assessment && pt.assessment.disease) parts.push(`${key.length === 1 ? 'This is' : 'These are'} consistent with a diagnosis of ${pt.assessment.disease}.`);
  } else if (looked.length) parts.push('No pathogenic or likely pathogenic variant was found to explain the patient’s features.');
  if (vus.length) parts.push(`${vus.length === 1 ? 'A variant' : vus.length + ' variants'} of uncertain significance ${vus.length === 1 ? 'was' : 'were'}${key.length ? ' also' : ''} identified (${vus.map(({ v }) => summariseVariant(v).short).join('; ')}). ${vus.length === 1 ? 'It' : 'They'} should not be used for clinical decisions.`);
  if (notYet) parts.push(`${notYet === 1 ? 'One variant has' : notYet + ' variants have'} not been assessed yet.`);
  return parts.join(' ');
}

/** a sequence variant's interpretation: its class, the evidence summary, and the criteria met, not met and not weighed */
function seqBlock(pt, v, s, F) {
  const c = v.classification || {};
  const signed = c.saved || null;
  const crit = (signed && signed.state) || c.criteria || {};
  const r = classify({ criteria: crit }, { framework: signed ? signed.framework || F : F });
  const met = r.met.slice().sort((a, b) => ORDER_CODES.indexOf(a.code) - ORDER_CODES.indexOf(b.code));
  const notMet = Object.entries(crit).filter(([, x]) => x && !x.met && x.evaluated).map(([k, x]) => ({ code: k, note: x.note || '' }));
  const weighed = new Set(Object.keys(crit).filter((k) => crit[k] && (crit[k].met || crit[k].evaluated)));
  const fk = signed ? signed.framework || F : F;
  const notWeighed = CRITERIA.filter((x) => !weighed.has(x.code) && !(x.deprecated && fw(fk).retired.includes(x.code))).map((x) => x.code);
  return h('section.rp-sec.rp-var',
    h('h3', s.gene ? h('i', s.gene + ' ') : '', h('span.hgvs', variantLong(v))),
    h('p.rp-var-cls', clsBadge(s.cls, { band: signed ? signed.band : r.band }), h('span', `${r.points > 0 ? '+' : ''}${r.points} points under ${fw(fk).label}`), signed ? h('span.small.muted', `, signed${signerName(signed.by) ? ' by ' + signed.by : ''} on ${dateStr(signed.at)}`) : h('span.small.muted', ', not signed yet'),
      signed && signed.calculated && signed.calculated !== signed.cls ? h('span.small', `. The calculated class was ${CLS_WORD[signed.calculated].toLowerCase()}, and it was changed for this reason: ${String(signed.reason || '').replace(/\.?$/, '.')}`) : null),
    h('p.small.muted', `${genomicText(v)}, ${zygText(v.zygosity).toLowerCase()}, ${!v.inheritance || v.inheritance === 'unknown' ? 'inheritance ' : ''}${inheritanceText(v.inheritance).toLowerCase()}.${v.contribution && CONTRIB_SAYS[v.contribution] ? ' ' + CONTRIB_SAYS[v.contribution] : ''}`),
    signed && signed.summary ? h('p', signed.summary) : null,
    met.length ? h('table.rp-table.rp-small', h('thead', h('tr', h('th', { scope: 'col' }, 'Criterion met'), h('th', { scope: 'col' }, 'Strength'), h('th', { scope: 'col' }, 'Evidence'))),
      h('tbody', met.map((m) => h('tr', h('td', h('b', labelFor(m.code, m.strength, fk)), h('div.small.muted', (BY_CODE[m.code] || {}).name || '')), h('td', `${SW[m.strength] || m.strength}${m.strength === 'SA' ? '' : ` (${m.dir === 'B' ? '−' : '+'}${POINTS[m.strength]})`}`), h('td', (crit[m.code] || {}).note || h('span.muted', 'No note')))))) : h('p', 'No criteria were met.'),
    notMet.length ? h('p.small', h('b', 'Weighed and not met: '), notMet.map((x) => `${x.code}${x.note ? ' (' + x.note + ')' : ''}`).join('; '), '.') : null,
    h('p.small.muted', `Not weighed: ${notWeighed.length ? notWeighed.join(', ') : 'none'}.`));
}
const ORDER_CODES = CRITERIA.map((c) => c.code);
/* what the classifier decided the variant contributes to the phenotype, as a sentence */
const CONTRIB_SAYS = {
  full: 'It explains the patient’s phenotype.',
  partial: 'It explains some of the patient’s phenotype.',
  uncertain: 'Whether it explains the patient’s phenotype is uncertain.',
  none: 'It doesn’t explain the patient’s phenotype.'
};

/** a CNV's interpretation: its class and the scored items */
function cnvBlock(pt, v, s, iscnText) {
  const type = v.cnvType === 'gain' ? 'gain' : 'loss';
  const signed = (v.classification || {}).saved || null;
  const sc = cnvScore(type, v.cnv || {});
  const notes = (v.cnv && v.cnv.notes) || {};
  return h('section.rp-sec.rp-var',
    h('h3', h('span.hgvs', iscnText)),
    h('p.small.muted', variantLong(v)),
    h('p.rp-var-cls', clsBadge(s.cls), h('span', `${fmtPts(sc.total)} points under the ACMG/ClinGen CNV standards (Riggs et al. 2020)`), signed ? h('span.small.muted', `, signed${signerName(signed.by) ? ' by ' + signed.by : ''} on ${dateStr(signed.at)}`) : h('span.small.muted', ', not signed yet')),
    v.genesSummary ? h('p.small.muted', `Genes: ${v.genesSummary}.`) : null,
    signed && signed.summary ? h('p', signed.summary) : null,
    sc.rows.length ? h('table.rp-table.rp-small', h('thead', h('tr', h('th', { scope: 'col' }, 'Item'), h('th', { scope: 'col' }, 'Points'), h('th', { scope: 'col' }, 'Evidence'))),
      h('tbody', sc.rows.map((r) => h('tr', h('td', h('b', r.code), h('div.small.muted', (itemOf(type, r.code) || {}).text || '')), h('td', fmtPts(r.pts)), h('td', notes[r.code] || h('span.muted', 'No note')))))) : h('p', 'No items were scored.'));
}
export { link };
