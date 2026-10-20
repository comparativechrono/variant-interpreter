/* =====================================================================
   What a patient's tabs share: the table of their variants (location,
   type, genes, the change, inheritance and genotype, pathogenicity and
   contribution: the columns clinical genomics databases use), and the
   short words for inheritance.
   ===================================================================== */
import { h, icon, toast, confirmBox, popmenu, dateStr } from '../core.js';
import { go, link } from '../router.js';
import * as db from '../db.js';
import { table, clsBadge } from '../ui.js';
import { summariseVariant, contributionText, signerName } from '../summary.js';
import { niceConsequence } from '../annotate.js';
import { fmtRegion, fmtSize } from '../parse.js';

export const INH_SHORT = {
  'denovo-confirmed': 'De novo (parentage confirmed)',
  'denovo-assumed': 'De novo (parentage not confirmed)',
  'denovo-mosaic': 'De novo, mosaic',
  maternal: 'Maternal',
  'maternal-mosaic': 'Maternal (mother mosaic)',
  paternal: 'Paternal',
  'paternal-mosaic': 'Paternal (father mosaic)',
  biparental: 'Biparental',
  balanced: 'From a balanced parental rearrangement',
  notmaternal: 'Not maternal (father not tested)',
  notpaternal: 'Not paternal (mother not tested)',
  unknown: 'Not known'
};
export const inhShort = (k) => INH_SHORT[k] || 'Not known';
const ZYG = { heterozygous: 'Heterozygous', homozygous: 'Homozygous', hemizygous: 'Hemizygous', mosaic: 'Mosaic', heteroplasmic: 'Heteroplasmic', homoplasmic: 'Homoplasmic', unknown: 'Zygosity not known' };
export const zygText = (z) => ZYG[z] || 'Zygosity not known';
export const variantPath = (pt, v) => `/patient/${pt.id || v.patientId}/variant/${v.id}`;

/** where a variant is, as a genomic position or region */
export function locationText(v) {
  if (v.kind === 'cnv') return fmtRegion(v.chrom, v.start, v.end);
  if (!v.chrom) return '';
  return `chr${v.chrom}:${Number(v.pos).toLocaleString('en-GB')}`;
}
/** what kind of change */
export function typeText(v) {
  if (v.kind === 'cnv') {
    const cn = v.copyNumber != null ? ` (${v.copyNumber} ${v.copyNumber === 1 ? 'copy' : 'copies'})` : '';
    return `${v.cnvType === 'gain' ? 'Gain' : v.cnvType === 'loss' ? 'Loss' : 'Copy-number change'}, ${fmtSize(v.end - v.start + 1)}${cn}`;
  }
  if (v.consequence) return cap(niceConsequence(v.consequence));
  const r = (v.ref || '').length, a = (v.alt || '').length;
  return r === 1 && a === 1 ? 'Substitution' : r > a ? 'Deletion' : r < a ? 'Insertion' : 'Change';
}
const cap = (s) => (s ? s[0].toUpperCase() + s.slice(1) : s);

/** the class cell: the signed class, or the class so far (marked as such), with its points */
export function classCell(s) {
  if (!s.cls) return h('span.muted.small', 'Not classified');
  if (!s.final && s.assessed === false) return h('span.muted.small', 'Not assessed yet');
  return h('div.cls-cell',
    h('span.row', { style: { gap: '4px', display: 'inline-flex', flexWrap: 'wrap' } }, clsBadge(s.cls, { short: false, band: s.final ? (s.signed && s.signed.band) : s.band })),
    h('span.small' + (s.final ? '' : '.muted'), s.final ? `Signed${s.signed && signerName(s.signed.by) ? ' by ' + s.signed.by : ''}` : `${s.pointsText} ${s.kind !== 'cnv' && Math.abs(s.points) === 1 ? 'point' : 'points'} so far`));
}

/**
 * the table of a patient's variants
 *   opts: { compact, onChanged }
 */
export function variantTable(pt, vs, opts = {}) {
  const rows = vs.map((v) => Object.assign({ v }, summariseVariant(v)));
  const cols = [
    { key: 'loc', label: 'Location', fmt: (r) => h('div', h('span.hgvs.small.loc', locationText(r.v).split(/(?<=[:\-–])/).map((part, i) => [i ? h('wbr') : null, h('span.nw', part)])), h('div.small.faint', r.v.assembly || 'GRCh38')), sort: (r) => (r.v.chrom || '') + String(r.v.pos || r.v.start || 0).padStart(10, '0') },
    { key: 'type', label: 'Type', fmt: (r) => typeText(r.v) },
    { key: 'gene', label: 'Genes', fmt: (r) => (r.v.kind === 'cnv' ? h('span.small', r.gene || '–') : r.gene ? h('span.gene-cell', { dataset: { gene: r.gene } }, h('a', { href: link('/gene/' + r.gene) }, h('i.gene', r.gene))) : '–') },
    { key: 'short', label: 'Variant', fmt: (r) => h('a.hgvs', { href: link(variantPath(pt, r.v)) }, r.short) },
    { key: 'inh', label: 'Inheritance / genotype', fmt: (r) => h('div', h('div', inhShort(r.v.inheritance)), h('div.small.muted', r.v.kind === 'cnv' ? (r.v.copyNumber != null ? `${r.v.copyNumber} ${r.v.copyNumber === 1 ? 'copy' : 'copies'}` : 'Copy number not given') : zygText(r.v.zygosity))), sort: (r) => r.v.inheritance || '' },
    { key: 'cls', label: 'Pathogenicity / contribution', fmt: (r) => h('div', classCell(r), h('div.small', r.contribution ? contributionText(r.contribution) : h('span.faint', 'Contribution not decided'))), sort: (r) => ['p', 'lp', 'vus', 'lb', 'b'].indexOf(r.cls) }
  ];
  if (!opts.compact) {
    cols.push({ key: 'updated', label: 'Changed', fmt: (r) => h('span.small.muted', dateStr(r.v.updated)), sort: (r) => r.v.updated || '' });
    cols.push({ key: 'menu', label: '', sort: false, fmt: (r) => {
      const b = h('button.icon-btn', { type: 'button', 'aria-label': `More actions for ${r.short}`, html: icon('dots') });
      b.addEventListener('click', (e) => popmenu(e.currentTarget, [
        ['eye', 'Open', () => go(variantPath(pt, r.v))],
        ['genome', 'Show in the genome browser', () => go(`/browser?patient=${pt.id}&assembly=${r.v.assembly || 'GRCh38'}&locus=${encodeURIComponent(browserLocus(r.v))}`)],
        null,
        ['trash', 'Remove…', async () => {
          if (!(await confirmBox('Remove this variant?', `This removes ${r.long}, along with its classification, notes and relatives’ genotypes. It can’t be undone.`, { yes: 'Remove', danger: true }))) return;
          await db.deleteVariant(r.v.id);
          toast('Variant removed.', 'ok');
          if (opts.onChanged) opts.onChanged();
        }]
      ]));
      return b;
    } });
  }
  const t = table(cols, rows, {
    sortable: !opts.compact,
    compact: !!opts.compact,
    caption: `Patient ${pt.id}’s variants`,
    empty: 'No variants have been added yet.',
    onRow: (r) => go(variantPath(pt, r.v))
  });
  // on a phone each row becomes a card, its cells labelled by their columns
  t.classList.add('vtable');
  const label = (tbl) => {
    const heads = Array.from(tbl.querySelectorAll('thead th')).map((th) => th.textContent.replace(/[▲▼]/g, '').trim());
    tbl.querySelectorAll('tbody tr').forEach((tr) => Array.from(tr.children).forEach((td, i) => td.setAttribute('data-label', heads[i] || '')));
  };
  // the genes on the patient's panel (PanelApp), marked when the panel's list arrives (and again after a sort)
  let onPanel = null;
  const mark = () => {
    if (!onPanel) return;
    t.querySelectorAll('.gene-cell').forEach((el) => {
      if (el.querySelector('.tag') || !onPanel.genes.has(el.dataset.gene)) return;
      const r = onPanel.genes.get(el.dataset.gene);
      el.append(' ', h('span.tag' + (r >= 3 ? '.ok' : r === 2 ? '.warn' : ''), { title: `On the patient’s panel (${onPanel.name}): ${r >= 3 ? 'green, diagnostic grade' : r === 2 ? 'amber' : 'red'}` }, 'panel'));
    });
  };
  label(t);
  new MutationObserver((ms) => {
    if (ms.some((m) => m.target.tagName === 'TBODY')) {
      label(t);
      mark();
    }
  }).observe(t, { childList: true, subtree: true });
  const panel = pt.test && pt.test.panel && pt.test.panel.id;
  if (panel) {
    import('../panels.js').then((P) => P.panelGenes(panel)).then((pg) => {
      onPanel = { name: pg.name, genes: new Map((pg.genes || []).map((g) => [g.symbol, g.rating])) };
      mark();
    }).catch(() => null);
  }
  return t;
}

/** a locus for the genome browser, a little wider than the variant */
export function browserLocus(v) {
  if (v.kind === 'cnv') {
    const pad = Math.round((v.end - v.start) * 0.2);
    return `chr${v.chrom}:${Math.max(1, v.start - pad)}-${v.end + pad}`;
  }
  return `chr${v.chrom}:${Math.max(1, v.pos - 40)}-${v.pos + 40}`;
}
