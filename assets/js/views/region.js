/* =====================================================================
   A region's page: its genes, with their dosage sensitivity and
   constraint; ClinGen's curated regions; ClinVar's losses and gains
   over it; the CNVs of people without a disorder; and the genome
   browser. From here a loss or a gain of the region can be classified.
     #/region/22:18900000-21500000?assembly=GRCh38
   ===================================================================== */
import { h, esc, icon, fmt } from '../core.js';
import { link } from '../router.js';
import * as settings from '../settings.js';
import { page, crumbs, pageHead, linkBtn, note, loading, ext, select } from '../ui.js';
import { readRegion, readCNV, fmtRegion, fmtSize, normChrom, chromOK } from '../parse.js';
import { regionGenes, dosageRegions, clinvarCNVs, dgvGold, gnomadSVs, cytobands, GNOMAD_SV_MAX } from '../api/cnv-sources.js';
import { geneCount } from '../cnv/suggest.js';
import { genesTable, regionsTable, popTable, clinvarTable, clinvarCounts, dosageSummary } from '../cnv/tables.js';
import { genomeBrowser } from '../widgets/genome.js';

const BIG = 50000000;

export async function render(root, params, query) {
  const where = String(params.where || '');
  const r = readRegion(where) || (() => {
    const c = readCNV(where);
    return c ? { chrom: c.chrom, start: c.start, end: c.end } : null;
  })();
  const p = page('wide.regionpage');
  root.appendChild(p);
  p.appendChild(crumbs([['Home', '/'], ['Region']]));
  if (!r || !chromOK(r.chrom) || !(r.end > r.start)) {
    p.appendChild(h('h1', 'The page can’t read this as a region'));
    p.appendChild(note('warn', h('p', 'Write it as a chromosome and positions, for example ', h('code', '22:18900000-21500000'), ' or ', h('code', 'chr22:18,900,000-21,500,000'), '.')));
    return;
  }
  const asm = query.assembly === 'GRCh37' ? 'GRCh37' : query.assembly === 'GRCh38' ? 'GRCh38' : settings.get('assembly');
  const chrom = normChrom(r.chrom), start = r.start, end = r.end;
  const size = end - start + 1;
  const plain = `${chrom}:${start}-${end}`;
  const other = asm === 'GRCh38' ? 'GRCh37' : 'GRCh38';
  const titleBands = h('span.muted', { style: { fontWeight: 400 } });
  const facts = h('div');
  p.appendChild(pageHead({
    titleNode: [h('span.hgvs', fmtRegion(chrom, start, end)), titleBands],
    lede: `The region spans ${fmtSize(size)} of chromosome ${chrom} on ${asm}. Here you can see what it contains, what is known of its dosage sensitivity and the copy-number variants seen over it.`,
    extra: facts,
    actions: [
      linkBtn('Classify a loss', `/cnv/${encodeURIComponent('del ' + plain)}?assembly=${asm}`, { cls: 'primary', icon: 'minus', title: 'Score a deletion of exactly this region' }),
      linkBtn('Classify a gain', `/cnv/${encodeURIComponent('dup ' + plain)}?assembly=${asm}`, { cls: 'primary', icon: 'plus', title: 'Score a duplication of exactly this region' }),
      linkBtn('Genome browser', `/browser?locus=${encodeURIComponent(`chr${plain}`)}&assembly=${asm}`, { icon: 'genome' })
    ]
  }));
  p.appendChild(h('p.small.muted', 'Positions are on ', h('b', asm), '. ', h('a', { href: link(`/region/${encodeURIComponent(plain)}?assembly=${other}`) }, `The same numbers on ${other}`), ' point to a different place, so convert positions between builds before you switch.'));
  if (size > BIG) p.appendChild(note('warn', h('p', `The region is ${fmtSize(size)} long, so its tables may take a while to load. gnomAD’s structural variants aren’t shown for regions over ${fmtSize(GNOMAD_SV_MAX)}.`)));

  const card = (key, title, ic) => {
    const body = h('div');
    p.appendChild(h('section.region-sec', { id: 'reg-' + key, 'aria-labelledby': 'rh-' + key }, h('h2', { id: 'rh-' + key, html: icon(ic) + esc(title) }), body));
    return body;
  };
  const genesBox = card('genes', 'Genes', 'dna');
  const dosageBox = card('dosage', 'ClinGen’s curated regions', 'scale');
  const cvBox = card('clinvar', 'ClinVar’s copy-number variants', 'clinvar');
  const popBox = card('population', 'Copy-number variants in people without a disorder', 'population');
  const brBox = card('browser', 'Genome browser', 'genome');
  genesBox.appendChild(loading(asm === 'GRCh37' ? 'Asking Ensembl for the genes on GRCh37…' : 'Finding the genes…'));
  dosageBox.appendChild(loading('Looking for ClinGen’s curated regions…'));
  cvBox.appendChild(loading('Reading ClinVar’s copy-number variants…'));
  popBox.appendChild(loading('Reading gnomAD and the Database of Genomic Variants…'));

  // the bands
  cytobands(chrom, start, end, asm).then((b) => {
    if (b) titleBands.textContent = ` ${b.text}`;
  }).catch(() => null);

  // the genes and the curated regions
  let regions = [];
  const regP = dosageRegions(chrom, start, end, asm).then((rs) => {
    regions = rs;
    dosageBox.innerHTML = '';
    dosageBox.appendChild(regionsTable(rs, { of: 'Overlap with this region', chrom }));
    dosageBox.appendChild(h('p.small.muted', 'ClinGen’s experts curate recurrent CNV regions and other stretches for haploinsufficiency (loss) and triplosensitivity (gain). A score of 3 means sufficient evidence, and 40 means dosage sensitivity is unlikely (a benign region). See ', ext('https://search.clinicalgenome.org/kb/gene-dosage', 'ClinGen’s dosage curations'), ' for more.'));
    return rs;
  }).catch((e) => {
    dosageBox.innerHTML = '';
    dosageBox.appendChild(note('bad', h('p', 'ClinGen’s curated regions couldn’t be read. Try reloading the page. The error was: ' + e.message)));
    return [];
  });
  regionGenes(chrom, start, end, asm).then(async (gs) => {
    await regP;
    genesBox.innerHTML = '';
    const pc = gs.filter((g) => g.pc);
    const n = geneCount(pc);
    facts.innerHTML = '';
    const eg = pc.filter((g) => g.hi === 3 || g.ts === 3).length, er = regions.filter((x) => x.hi === 3 || x.ts === 3).length;
    facts.appendChild(h('dl.facts', h('div', h('dt', 'Size'), h('dd', fmtSize(size))), h('div', h('dt', 'Protein-coding genes'), h('dd', fmt(n.counted))), h('div', h('dt', 'Established dosage-sensitive'), h('dd', `${eg} ${eg === 1 ? 'gene' : 'genes'}, ${er} ${er === 1 ? 'region' : 'regions'}`))));
    genesBox.appendChild(h('ul.cnv-sumlist', dosageSummary(gs, regions).map((t) => h('li', t))));
    const tbl = genesTable(gs, { caption: 'Genes in the region' });
    genesBox.appendChild(tbl);
    genesBox.appendChild(h('p.small.muted', 'Whole genes lie entirely within the region, and the others are cut by its ends. The dosage columns show ClinGen’s haploinsufficiency and triplosensitivity scores (3 sufficient evidence, 2 some, 1 little, 0 none, 30 a recessive gene, 40 unlikely). pHaplo and pTriplo come from Collins et al. (2022), and LOEUF and pLI from gnomAD v4.1.'));
    // HPO's diseases for the filters
    import('../hpo.js').then(async (H) => {
      await H.loadDiseases();
      for (const g of gs) {
        const ds = await H.diseasesOfGene(g.symbol);
        g.hpoDiseases = ds.length;
        if (!g.monoallelic && ds.some((d) => (d.inh || []).some((x) => /dominant|x-linked/i.test(x)))) g.monoallelic = true;
      }
      if (tbl.isConnected) tbl.update(gs);
    }).catch(() => null);
  }).catch((e) => {
    genesBox.innerHTML = '';
    genesBox.appendChild(note('bad', h('p', 'The genes couldn’t be found. Try reloading the page. The error was: ' + e.message)));
  });

  // ClinVar
  clinvarCNVs(chrom, start, end, asm).then((cv) => {
    cvBox.innerHTML = '';
    if (cv.note) cvBox.appendChild(note('warn', h('p', cv.note)));
    const kinds = [['loss', 'Losses'], ['gain', 'Gains']];
    cvBox.appendChild(h('div', kinds.map(([k, label]) => {
      const c = clinvarCounts(cv.list.filter((x) => x.type === k));
      return h('div.cnv-cvcounts', h('span.small.muted', `${label}:`), c.length ? c.map(([key, n, t]) => h('span.cnv-cv.cv-' + key, `${n} ${t.toLowerCase()}`)) : h('span.small', 'none'));
    })));
    const state = { kind: 'all' };
    const kindSel = select([['all', 'Losses and gains'], ['loss', 'Losses'], ['gain', 'Gains']], 'all', { 'aria-label': 'Kind' });
    const FIRST = 20;
    let all = false;
    const view = () => cv.list.filter((x) => state.kind === 'all' || x.type === state.kind).sort((a, b) => b.reciprocal - a.reciprocal);
    const t = clinvarTable(view().slice(0, FIRST), { caption: 'ClinVar’s copy-number variants over the region', labels: ['Covers the region', 'Of theirs in the region'] });
    const shown = h('span.small.muted', { 'aria-live': 'polite' });
    const more = h('button.btn.small', { type: 'button' });
    const redraw = () => {
      const list = view();
      t.redraw(all ? list.slice(0, 500) : list.slice(0, FIRST));
      shown.textContent = list.length > FIRST && !all ? `the ${FIRST} most like the region, out of ${list.length}` : `${list.length} shown`;
      more.hidden = list.length <= FIRST;
      more.textContent = all ? `Show the ${FIRST} most like the region` : `Show all ${Math.min(500, list.length)}`;
    };
    more.addEventListener('click', () => {
      all = !all;
      redraw();
    });
    kindSel.addEventListener('change', () => {
      state.kind = kindSel.value;
      redraw();
    });
    cvBox.append(h('div.cnv-filters', kindSel, shown), t, h('div.btn-row', { style: { marginTop: '6px' } }, more));
    redraw();
    cvBox.appendChild(h('p.small.muted', `${cv.source}. “Covers the region” is how much of the region each CNV covers, and “Of theirs in the region” is how much of each CNV lies in the region.`));
  }).catch((e) => {
    cvBox.innerHTML = '';
    cvBox.appendChild(note('bad', h('p', 'ClinVar’s CNVs couldn’t be read. Try reloading the page. The error was: ' + e.message)));
  });

  // population CNVs: the common ones (1% or more) over at least half of the region
  Promise.allSettled([gnomadSVs(chrom, start, end, asm), dgvGold(chrom, start, end, asm)]).then(([g, d]) => {
    popBox.innerHTML = '';
    const list = [];
    if (g.status === 'fulfilled' && !g.value.skipped) list.push(...g.value.list.filter((x) => !(x.filters || []).length));
    if (d.status === 'fulfilled') list.push(...d.value);
    const common = list.filter((x) => x.af >= 0.01 && x.coverOfCnv >= 0.5).sort((a, b) => b.coverOfCnv - a.coverOfCnv);
    const notes = [];
    if (g.status === 'rejected') notes.push(`gnomAD didn’t answer (${g.reason && g.reason.message})`);
    else if (g.value.skipped) notes.push(`the region is too large to ask gnomAD for its structural variants (over ${fmtSize(GNOMAD_SV_MAX)})`);
    if (d.status === 'rejected') notes.push(`the Database of Genomic Variants couldn’t be read (${d.reason && d.reason.message})`);
    popBox.appendChild(h('p', common.length
      ? `${common.length} ${common.length === 1 ? 'CNV seen' : 'CNVs seen'} in 1% of people or more ${common.length === 1 ? 'covers' : 'cover'} at least half of the region.`
      : 'No CNV seen in 1% of people or more covers half of the region.'));
    if (common.length) {
      const gn = common.filter((x) => !x.tested), dg = common.filter((x) => x.tested);
      const labels = ['Covers the region', 'Of theirs in the region'];
      if (gn.length) popBox.appendChild(popTable(gn.slice(0, 30), { caption: 'Common CNVs in gnomAD', labels }));
      if (dg.length) popBox.appendChild(popTable(dg.slice(0, 30), { kind: 'dgv', caption: 'Common CNVs in the DGV gold standard set', labels }));
    }
    if (notes.length) popBox.appendChild(note('warn', h('p', 'Not everything could be checked: ' + notes.join('; ') + '.')));
    popBox.appendChild(h('p.small.muted', `The data come from ${g.status === 'fulfilled' && !g.value.skipped ? g.value.dataset + ' (variants passing its filters)' : 'gnomAD'} and the Database of Genomic Variants’ gold standard set. To weigh a loss or gain of exactly this region, use “Classify a loss” or “Classify a gain” above. Its CNV page shows all of these CNVs, rare ones included.`));
  });

  // the genome browser, when it comes into view
  const holder = h('div.igv-holder');
  brBox.appendChild(holder);
  let handle = null;
  const io = new IntersectionObserver((es) => {
    if (!es.some((e) => e.isIntersecting)) return;
    io.disconnect();
    const pad = Math.max(1000, Math.round(size * 0.05));
    handle = genomeBrowser(holder, {
      assembly: asm,
      locus: `chr${chrom}:${Math.max(1, start - pad)}-${end + pad}`,
      tracks: ['genes', 'clinvarCnv', 'haplo', 'triplo', 'dgvGold'],
      roi: [{ chrom, start, end, colour: 'rgba(31, 111, 126, 0.10)', name: 'The region' }]
    });
    handle.ready.catch(() => null);
  }, { rootMargin: '300px 0px' });
  io.observe(holder);
  return () => {
    io.disconnect();
    if (handle) handle.destroy();
  };
}
