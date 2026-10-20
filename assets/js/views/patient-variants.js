/* A patient's variants: the table of them, and the ways to add more */
import { h, icon } from '../core.js';
import { go, link } from '../router.js';
import { btn, note, empty } from '../ui.js';
import { variantTable } from './patient-common.js';
import { addSequenceDialog, addCnvDialog, pasteListDialog, importVcfDialog } from './patient-add.js';
import { summariseVariant } from '../summary.js';

export function render(body, { patient: pt, variants: vs, refresh }, query = {}) {
  const tools = h('div.btn-row',
    btn('Add a sequence variant', () => addSequenceDialog(pt, vs), { cls: 'primary', icon: 'plus' }),
    btn('Add a copy-number variant', () => addCnvDialog(pt), { icon: 'region' }),
    btn('Paste a list…', () => pasteListDialog(pt, vs, refresh), { icon: 'list' }),
    btn('Import a VCF file…', () => importVcfDialog(pt, vs, refresh), { icon: 'upload', title: 'Read the variants in a VCF or .vcf.gz file, annotate them and choose the ones to interpret' }));
  body.appendChild(tools);
  if (!vs.length) {
    body.appendChild(empty('No variants yet', 'Add the variants the patient’s test found. You can enter a change on a transcript (NM_…:c.…), a chromosome position (17-7673802-C-T), an rsID or a copy-number variant, or import the variants from a VCF file. Each variant opens on its own page with its evidence and the criteria.'));
    return;
  }
  const S = vs.map(summariseVariant);
  body.appendChild(h('p.small.muted.var-sum', countText(S)));
  body.appendChild(variantTable(pt, vs, { onChanged: refresh }));
  const cnvs = vs.filter((v) => v.kind === 'cnv').length;
  body.appendChild(h('p.small.muted', 'Click a variant to open its evidence and classify it. ',
    h('a', { href: link(`/browser?patient=${pt.id}`) }, 'See them all in the genome browser'), '.',
    cnvs ? ' Copy-number variants are scored with the ACMG/ClinGen points for CNVs (Riggs et al. 2020).' : ''));
  // a second variant in a gene with a recessive disorder: a reminder about phase
  const byGene = {};
  for (const v of vs) if (v.gene && v.kind !== 'cnv') (byGene[v.gene] = byGene[v.gene] || []).push(v);
  const pairs = Object.entries(byGene).filter(([, l]) => l.length > 1);
  if (pairs.length) body.appendChild(note('', h('p', `This patient has two or more variants in ${pairs.map(([g]) => g).join(', ')}. If the disorder is recessive, it matters whether they’re in trans (on different copies of the gene). The parents’ results on the Family tab show this, and the in-trans calculator (PM3) on the variant pages uses it.`)));
}
/** how many variants there are, how many are signed, and their classes so far (signed, or as calculated) */
function countText(S) {
  const WORD = { p: 'pathogenic', lp: 'likely pathogenic', vus: 'of uncertain significance', lb: 'likely benign', b: 'benign' };
  const and = (xs) => (xs.length < 2 ? xs.join('') : xs.slice(0, -1).join(', ') + ' and ' + xs[xs.length - 1]);
  const n = S.length;
  const signed = S.filter((s) => s.final).length;
  const looked = S.filter((s) => s.assessed);
  if (n === 1) {
    const s = S[0];
    if (s.final) return `The patient’s variant has been signed as ${WORD[s.cls]}.`;
    return s.assessed ? `The patient’s variant is ${WORD[s.cls]} so far, and it hasn’t been signed yet.` : 'The patient’s variant hasn’t been assessed yet.';
  }
  if (!looked.length) return n === 2 ? 'Neither of the patient’s variants has been assessed yet.' : `None of the patient’s ${n} variants has been assessed yet.`;
  const first = !signed ? (n === 2 ? 'Neither of the patient’s variants has been signed yet.' : `None of the patient’s ${n} variants has been signed yet.`)
    : signed === n ? (n === 2 ? 'Both of the patient’s variants have been signed.' : `All ${n} of the patient’s variants have been signed.`)
    : `${signed} of the patient’s ${n} variants ${signed === 1 ? 'has' : 'have'} been signed.`;
  const items = ['p', 'lp', 'vus', 'lb', 'b'].map((k) => [k, looked.filter((s) => s.cls === k).length]).filter(([, c]) => c).map(([k, c]) => `${c} ${c === 1 ? 'is' : 'are'} ${WORD[k]}`);
  const not = n - looked.length;
  if (not) items.push(`${not} ${not === 1 ? 'hasn’t' : 'haven’t'} been assessed`);
  return items.length ? `${first} ${signed === n ? 'Of these' : 'So far'}, ${and(items)}.` : first;
}
export { icon, go };
