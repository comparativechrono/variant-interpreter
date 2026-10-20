/* A patient's variants in the genome browser, with the clinical databases' tracks beside them */
import { h } from '../core.js';
import { link } from '../router.js';
import * as settings from '../settings.js';
import { select, field, note, linkBtn } from '../ui.js';
import { genomeBrowser, variantTrack, DEFAULT_TRACKS } from '../widgets/genome.js';
import { patientFeatures } from './browser.js';
import { summariseVariant } from '../summary.js';
import { browserLocus } from './patient-common.js';

export function render(body, { patient: pt, variants: vs }) {
  const builds = vs.reduce((m, v) => ((m[v.assembly || 'GRCh38'] = (m[v.assembly || 'GRCh38'] || 0) + 1), m), {});
  let asm = Object.keys(builds).sort((a, b) => builds[b] - builds[a])[0] || settings.get('assembly');
  const onBuild = (a) => vs.filter((v) => (v.assembly || 'GRCh38') === a && v.chrom);
  const wrap = h('div.pb-grid');
  const list = h('nav.pb-list', { 'aria-label': 'The patient’s variants' });
  const holder = h('div.pb-browser');
  wrap.append(list, holder);
  let handle = null;
  const open = () => {
    if (handle) handle.destroy();
    holder.innerHTML = '';
    list.innerHTML = '';
    const mine = onBuild(asm);
    const feats = patientFeatures(mine, asm);
    list.appendChild(h('h2.pb-h', `Variants on ${asm}`));
    if (!mine.length) list.appendChild(h('p.small.muted', 'There are no variants on this build.'));
    for (const v of mine) {
      const s = summariseVariant(v);
      const b = h('button.pb-item', { type: 'button', title: s.long },
        h('span.pb-dot', { dataset: { cls: s.cls || 'none' }, 'aria-hidden': 'true' }),
        h('span', s.gene ? h('i.gene', s.gene + ' ') : '', h('span.hgvs.small', s.short)));
      b.addEventListener('click', () => handle && handle.goTo(browserLocus(v)));
      list.appendChild(b);
    }
    const first = mine[0];
    handle = genomeBrowser(holder, {
      assembly: asm,
      locus: first ? browserLocus(first) : undefined,
      tracks: DEFAULT_TRACKS,
      extra: feats.length ? [variantTrack(`Patient ${pt.id}`, feats)] : [],
      roi: mine.filter((v) => v.kind === 'cnv').map((v) => ({ chrom: v.chrom, start: v.start, end: v.end, colour: v.cnvType === 'gain' ? 'rgba(47, 111, 168, 0.12)' : 'rgba(196, 67, 47, 0.12)' }))
    });
  };
  const builtOn = Object.keys(builds);
  if (builtOn.length > 1) {
    const sel = select(builtOn.map((b) => [b, `${b} (${builds[b]} ${builds[b] === 1 ? 'variant' : 'variants'})`]), asm);
    sel.addEventListener('change', () => {
      asm = sel.value;
      open();
    });
    body.appendChild(h('div.browser-bar', field('Genome build', sel)));
  }
  if (!vs.length) body.appendChild(note('', h('p', 'The patient doesn’t have any variants yet, so the browser shows TP53 until they do. ', h('a', { href: link(`/patient/${pt.id}/variants`) }, 'Add variants'), '.')));
  body.appendChild(wrap);
  body.appendChild(h('p.small.muted', 'The patient’s variants are coloured by their signed class, or by their class so far. Click one in the list to go to it. To move around, drag the view or type a location in the browser. ',
    linkBtn('Open the full genome browser', `/browser?patient=${pt.id}&assembly=${asm}`, { cls: 'small', icon: 'genome' })));
  open();
  return () => handle && handle.destroy();
}
