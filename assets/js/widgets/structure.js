/* =====================================================================
   The variant's residue on AlphaFold's model of the protein, in Mol*
   (loaded from jsDelivr the first time it is needed, at the version and
   with the integrity hashes that genomics.tel's examples use), with
   ClinVar's pathogenic missense residues beside it for comparison.
   ===================================================================== */
import { h, esc, fetchJSON } from '../core.js';
import { alphafold } from '../api/proteins.js';

const MOLSTAR = {
  css: { href: 'https://cdn.jsdelivr.net/npm/molstar@5.12.0/build/viewer/molstar.css', integrity: 'sha384-RIontCdJN53gEl2fmiHN+4bscIBvaUaOiCeeGktXqmFqdEBF+COnSdt9O4IKFSvq' },
  js: { src: 'https://cdn.jsdelivr.net/npm/molstar@5.12.0/build/viewer/molstar.js', integrity: 'sha384-Mx9hwknXam3/nCj5WsEpyvr6nqiUp8vVLEh0ZG9OXpFepTFhVKTdEOJ4JG0XjMLf' }
};
let loading = null;
function loadMolstar() {
  if (window.molstar) return Promise.resolve(window.molstar);
  if (!loading) {
    loading = new Promise((resolve, reject) => {
      const link = document.createElement('link');
      Object.assign(link, { rel: 'stylesheet', href: MOLSTAR.css.href, integrity: MOLSTAR.css.integrity, crossOrigin: 'anonymous' });
      document.head.appendChild(link);
      const s = document.createElement('script');
      Object.assign(s, { src: MOLSTAR.js.src, integrity: MOLSTAR.js.integrity, crossOrigin: 'anonymous' });
      s.onload = () => resolve(window.molstar);
      s.onerror = () => {
        loading = null;
        reject(new Error('the 3D viewer (Mol*) couldn’t be loaded from cdn.jsdelivr.net'));
      };
      document.head.appendChild(s);
    });
  }
  return loading;
}

const BANDS = [[90, 'very high'], [70, 'confident'], [50, 'low'], [0, 'very low']];
const band = (v) => (BANDS.find(([t]) => v >= t) || [0, 'very low'])[1];

/** showStructure(holder, { accession, residue, label, gene, clinvar, what }) – what: the words for the marked residue */
export async function showStructure(holder, opts) {
  holder.innerHTML = '';
  const status = h('p.small.muted', { 'aria-live': 'polite' }, 'Asking AlphaFold DB for the model…');
  const view = h('div.struct-view', { role: 'region', 'aria-label': `3D model of ${opts.gene || 'the protein'} from AlphaFold, with residue ${opts.residue} marked` });
  const info = h('div.small');
  holder.append(status, view, info);
  const entry = await alphafold(opts.accession);
  if (!entry) throw new Error(`AlphaFold DB has no model of ${opts.accession}`);
  const molstar = await loadMolstar();
  status.textContent = 'Loading the model…';
  // the confidence at the variant's residue
  let conf = null;
  try {
    const pl = await fetchJSON(entry.plddtDocUrl, {}, 30000);
    const i = (pl.residueNumber || []).indexOf(opts.residue);
    if (i >= 0) conf = pl.confidenceScore[i];
  } catch (e) {
    /* the model still shows */
  }
  const viewer = await molstar.Viewer.create(view, {
    layoutIsExpanded: false, layoutShowControls: false, layoutShowLeftPanel: false, collapseRightPanel: true,
    layoutShowLog: false, layoutShowRemoteState: false, viewportShowAnimation: false, viewportShowSelectionMode: false, viewportShowExpand: true
  });
  const mvs = molstar.PluginExtensions.mvs;
  const builder = mvs.MVSData.createBuilder();
  const structure = builder.download({ url: entry.bcifUrl }).parse({ format: 'bcif' }).modelStructure();
  structure.component({ selector: 'polymer' }).representation({ type: 'cartoon' }).color({ color: '#b9c4d2' });
  // ClinVar's pathogenic missense residues, small and red
  const pRes = Array.from(new Set((opts.clinvar || []).filter((c) => /missense/.test(c.major_consequence || '') && /^(Pathogenic|Likely pathogenic|Pathogenic\/Likely pathogenic)/.test(c.clinical_significance) && c.gold_stars >= 1)
    .map((c) => { const m = /^p\.[A-Z][a-z]{2}(\d+)/.exec(c.hgvsp || ''); return m ? +m[1] : null; }).filter((x) => x && x !== opts.residue)));
  if (pRes.length) structure.component({ selector: pRes.slice(0, 400).map((n) => ({ auth_seq_id: n })) }).representation({ type: 'ball_and_stick' }).color({ color: '#c4432f' });
  const here = { auth_seq_id: opts.residue };
  structure.component({ selector: here }).representation({ type: 'spacefill' }).color({ color: '#1c2b3a' });
  structure.primitives({ label_background_color: '#ffffff', label_show_tether: true, label_tether_length: 3, label_attachment: 'bottom-center' })
    .label({ position: here, text: opts.label || `residue ${opts.residue}`, label_size: 3, label_color: '#000000' });
  structure.component({ selector: here }).focus({ radius_extent: 14 });
  await mvs.loadMVS(viewer.plugin, builder.getState());
  if (viewer.plugin.managers.structure.hierarchy.current.structures.length === 0) throw new Error('the model didn’t arrive from AlphaFold DB');
  viewer.plugin.managers.snapshot.clear();
  status.textContent = '';
  info.append(
    h('p', `AlphaFold model ${entry.modelEntityId || entry.entryId} of ${entry.uniprotDescription || opts.accession} (version ${entry.latestVersion}). `,
      `${opts.what || 'The variant’s residue'} is dark. `, pRes.length ? `The ${pRes.length} residues with pathogenic missense variants in ClinVar are red. ` : '',
      conf != null ? h('b', `AlphaFold’s confidence at residue ${opts.residue} is ${conf.toFixed(0)} (${band(conf)}).`) : ''),
    h('p.muted', 'This is a predicted model, not an experimental structure, so its shape is unreliable where the confidence is low. Drag to turn it and scroll to zoom. ', h('a', { href: `https://alphafold.ebi.ac.uk/entry/${opts.accession}`, target: '_blank', rel: 'noopener' }, 'Open in AlphaFold DB'), '.'));
  return viewer;
}
