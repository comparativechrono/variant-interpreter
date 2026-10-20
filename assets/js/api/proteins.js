/* =====================================================================
   Proteins: UniProt's record (domains, sites, the sequence) and the
   AlphaFold model, for the protein view and the 3D view.
   ===================================================================== */
import { fetchJSON, limiter } from '../core.js';
import { CFG } from '../settings.js';
import { cacheGet, cachePut } from '../db.js';

const UNI = () => (CFG.services && CFG.services.uniprot) || 'https://rest.uniprot.org';
const AF = () => (CFG.services && CFG.services.alphafold) || 'https://alphafold.ebi.ac.uk/api';
const queue = limiter(3, 100);

/* the kinds of feature drawn on the protein, and how */
export const FEATURE_KINDS = {
  Domain: { track: 'domain', label: 'Domain' },
  Region: { track: 'region', label: 'Region' },
  'Zinc finger': { track: 'domain', label: 'Zinc finger' },
  'DNA binding': { track: 'domain', label: 'DNA binding' },
  Repeat: { track: 'region', label: 'Repeat' },
  Motif: { track: 'site', label: 'Motif' },
  'Topological domain': { track: 'topo', label: 'Topology' },
  Transmembrane: { track: 'topo', label: 'Transmembrane' },
  Intramembrane: { track: 'topo', label: 'Intramembrane' },
  Signal: { track: 'topo', label: 'Signal peptide' },
  'Transit peptide': { track: 'topo', label: 'Transit peptide' },
  'Active site': { track: 'site', label: 'Active site' },
  'Binding site': { track: 'site', label: 'Binding site' },
  Site: { track: 'site', label: 'Site' },
  'Modified residue': { track: 'ptm', label: 'Modified residue' },
  Glycosylation: { track: 'ptm', label: 'Glycosylation' },
  'Disulfide bond': { track: 'ptm', label: 'Disulfide bond' },
  'Cross-link': { track: 'ptm', label: 'Cross-link' },
  'Compositional bias': { track: 'region', label: 'Compositional bias' },
  'Coiled coil': { track: 'region', label: 'Coiled coil' }
};

/** a UniProt entry (the reviewed human one for a gene, or an accession) */
export async function uniprot(acc) {
  const id = String(acc || '').replace(/-\d+$/, '').replace(/\.\d+$/, '');
  const key = 'uniprot:' + id;
  const c = await cacheGet(key, 60);
  if (c) return c.value;
  const d = await queue(() => fetchJSON(`${UNI()}/uniprotkb/${encodeURIComponent(id)}.json`, {}, 30000));
  const fn = (d.comments || []).find((x) => x.commentType === 'FUNCTION');
  const out = {
    accession: d.primaryAccession,
    name: (((d.proteinDescription || {}).recommendedName || {}).fullName || {}).value || '',
    gene: (((d.genes || [])[0] || {}).geneName || {}).value || '',
    length: d.sequence ? d.sequence.length : null,
    sequence: d.sequence ? d.sequence.value : '',
    function: fn && fn.texts && fn.texts[0] ? fn.texts[0].value : '',
    features: (d.features || []).filter((f) => FEATURE_KINDS[f.type]).map((f) => ({
      type: f.type, kind: FEATURE_KINDS[f.type].track, description: f.description || FEATURE_KINDS[f.type].label,
      start: f.location && f.location.start ? f.location.start.value : null, end: f.location && f.location.end ? f.location.end.value : null
    })).filter((f) => f.start != null && f.end != null)
  };
  await cachePut(key, out);
  return out;
}

/** the AlphaFold model of a UniProt accession: [{ entryId, bcifUrl, cifUrl, pdbUrl, paeImageUrl, plddtDocUrl, … }] */
export async function alphafold(acc) {
  const id = String(acc || '').replace(/\.\d+$/, '');
  const key = 'alphafold:' + id;
  const c = await cacheGet(key, 30);
  if (c) return c.value;
  const d = await queue(() => fetchJSON(`${AF()}/prediction/${encodeURIComponent(id)}`, {}, 30000));
  const m = (d || []).find((x) => x.uniprotAccession === id.replace(/-1$/, '') || x.uniprotAccession === id) || (d || [])[0] || null;
  await cachePut(key, m);
  return m;
}
