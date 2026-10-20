/* =====================================================================
   About the site (#/about/:topic?): what it is and is not; the data it
   holds and the services it asks, with their versions and licences;
   privacy; and how to run a copy for a course.
   ===================================================================== */
import { h, icon, fetchJSON, fmt } from '../core.js';
import { link } from '../router.js';
import { CFG } from '../settings.js';
import { page, pageHead, tabs, note, linkBtn } from '../ui.js';

const TOPICS = [
  ['', 'About', 'info'],
  ['sources', 'Sources and licences', 'book'],
  ['privacy', 'Privacy', 'shield'],
  ['hosting', 'Your own copy', 'globe']
];
const REPO = 'https://github.com/comparativechrono/variant-interpreter';

export async function render(root, params) {
  const key = TOPICS.some(([k]) => k === (params.topic || '')) ? params.topic || '' : null;
  const p = page('narrow.about-page');
  root.appendChild(p);
  if (key == null) {
    p.append(h('h1', 'There is no such page'), h('p', h('a', { href: link('/about') }, 'About the site'), '.'));
    return;
  }
  p.appendChild(pageHead({
    title: key === 'privacy' ? 'Privacy' : key === 'sources' ? 'Sources and licences' : key === 'hosting' ? 'Running your own copy' : 'About the Variant interpreter',
    lede: key === '' ? 'A teaching site for clinical variant interpretation, in your browser.' : null
  }));
  p.appendChild(tabs(TOPICS.map(([k, label, ic]) => [k, label, k ? '/about/' + k : '/about', null, ic]), key, 'About the site'));
  const body = h('div.about-body');
  p.appendChild(body);
  if (key === '') about(body);
  else if (key === 'sources') await sources(body);
  else if (key === 'privacy') privacy(body);
  else hosting(body);
}

/* ---------------- about ---------------- */
function about(b) {
  b.append(
    h('p', 'The Variant interpreter is where students practise what a clinical scientist does with a patient’s genetic test: record the patient’s phenotype and family, add the variants found, look at the evidence for each in the public databases, and classify each one with the ACMG/AMP criteria, as UK laboratories do under the ACGS 2024 guidelines, or as ClinGen does.'),
    h('p', 'It is modelled on the workflow of the platforms used in clinical genomics, such as DECIPHER, so that what students learn here carries over. It has no affiliation with DECIPHER, VarSome, Franklin or any other platform, and carries none of their branding; where it links to them, it says so.'),
    note('warn', h('p', h('b', 'For teaching, not for clinical use. '), 'Its annotations come from public services as they answer on the day, some of its rules are simplified, and it has not been validated for diagnosis. Keep real patients’ details out of it: use the example cases, your tutor’s, or fictional patients.')));
  b.append(h('h2', 'What it does as the clinical platforms do'));
  b.appendChild(h('ul', [
    'A patient record with HPO terms, each present or absent, and the diseases that fit them best.',
    'A table of each patient’s variants, with zygosity, inheritance, classification and contribution to the phenotype.',
    'An evidence interface that takes the criteria one by one, with suggestions from the data that are never applied automatically.',
    'Scoring of copy-number variants with the points of the ACMG/ClinGen standards (Riggs et al. 2020).',
    'A genome browser with ClinVar, ClinGen’s dosage sensitivity and population CNV tracks; gene pages; phenotype matching.'
  ].map((t) => h('li', t))));
  b.append(h('h2', 'What it adds for students'));
  b.appendChild(h('ul', [
    'No account, and no real patients: everything stays in the browser.',
    'A pedigree editor (Pedigree Studio) with relatives’ genotypes, and a co-segregation likelihood ratio for PP1 and BS4.',
    'Calculators for ClinGen’s de novo (PS2, PM6) and in-trans (PM3) points, for OddsPath (PS3, BS3) and for the highest credible allele frequency (BS1).',
    'The ACGS 2024 points, with the bands of uncertain significance, beside the 2015 rules and the Bayesian probability of pathogenicity.',
    'A view of the SpliceAI scores.',
    'Comparison with a case’s answer, and with ClinGen expert panels’ classifications, once your own is signed.',
    'Signed classifications with their history, and a printable report.',
    'A guide to every criterion, the guidelines, and how evidence is combined.'
  ].map((t) => h('li', t))));
  b.appendChild(h('div.btn-row', { style: { margin: '14px 0 6px' } },
    linkBtn('Read the guide', '/learn', { cls: 'primary', icon: 'graduation' }),
    linkBtn('Open a case', '/data', { icon: 'import' })));
  b.append(h('h2', 'Who made it'));
  b.append(
    h('p', 'The Hearn lab, for its clinical genomics teaching, as one of the sites of ', h('a', { href: 'https://www.genomics.tel/' }, 'genomics.tel'), '. It is built on the lab’s other workbenches: Pedigree Studio and the pedigree risk engine come from the Pedigree workbench, the genome browser (igv.js) from the Bioinformatics workbench, and the fonts from genomics.tel.'),
    h('p', 'The code is on ', h('a', { href: REPO }, 'GitHub'), ', under the MIT licence. The data and programs it uses keep their own licences: see ', h('a', { href: link('/about/sources') }, 'Sources and licences'), '.'));
}

/* ---------------- sources and licences ---------------- */
/** the "meta" object at the start of one of the site's data files, without downloading the rest of the file */
export async function readMeta(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error('HTTP ' + r.status);
  if (!r.body || !r.body.getReader) return (await r.json()).meta;
  const reader = r.body.getReader();
  const dec = new TextDecoder();
  let text = '';
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (value) text += dec.decode(value, { stream: true });
      const m = metaIn(text);
      if (m) return m;
      if (done || text.length > 400000) break;
    }
  } finally {
    reader.cancel().catch(() => {});
  }
  throw new Error('the file has no description at its start');
}
function metaIn(text) {
  const i = text.indexOf('"meta"');
  if (i < 0) return null;
  const start = text.indexOf('{', i);
  if (start < 0) return null;
  let depth = 0, inStr = false, esc = false;
  for (let j = start; j < text.length; j++) {
    const ch = text[j];
    if (inStr) {
      if (esc) esc = false;
      else if (ch === '\\') esc = true;
      else if (ch === '"') inStr = false;
    } else if (ch === '"') inStr = true;
    else if (ch === '{') depth++;
    else if (ch === '}' && --depth === 0) return JSON.parse(text.slice(start, j + 1));
  }
  return null;
}

/* what each part of the gene table is used for */
const GENE_USE = {
  HGNC: 'Gene symbols, names, previous symbols and identifiers',
  MANE: 'The transcript each variant is described on, and where each gene is on GRCh38',
  gnomAD: 'Loss-of-function and missense constraint (LOEUF, pLI, missense Z)',
  'ClinGen dosage': 'Haploinsufficiency and triplosensitivity scores of genes and regions (CNVs, PVS1)',
  'ClinGen validity': 'How well established each gene–disease relationship is',
  'Collins 2022': 'Predicted dosage sensitivity (pHaplo, pTriplo) for CNVs',
  G2P: 'Gene2Phenotype’s gene–disease records: allelic requirement and mechanism'
};

/* the services the browser asks as people work; key: the site setting in assets/js/config.js, if any */
const SERVICES = [
  { key: 'ensembl', name: 'Ensembl REST API (EMBL-EBI)', sends: 'A variant (its HGVS description, or its position and alleles), a gene symbol or a region', gets: 'The Variant Effect Predictor’s annotation: the consequence on each transcript, HGVS, MANE, scores from CADD, REVEL, SpliceAI, AlphaMissense and others, conservation, dbSNP identifiers and papers; the genes in a region', terms: ['Ensembl’s data have no restrictions on use; each prediction tool’s scores keep their authors’ terms, which for several allow non-commercial use only', 'https://www.ensembl.org/info/about/legal/index.html'] },
  { key: 'gnomad', name: 'gnomAD (Broad Institute)', sends: 'A variant’s position and alleles, a gene symbol or a region', gets: 'Allele counts and frequencies by genetic ancestry group, filtering allele frequencies, gene constraint, ClinVar’s variants in the gene, structural variants', terms: ['CC0 (public domain)', 'https://gnomad.broadinstitute.org/terms'] },
  { key: 'eutils', name: 'NCBI E-utilities: ClinVar', sends: 'A variant’s position, or HGVS', gets: 'ClinVar’s records at and around the variant: classifications, review status and conditions', terms: ['NCBI’s policies on its public data', 'https://www.ncbi.nlm.nih.gov/home/about/policies/'] },
  { key: 'uniprot', name: 'UniProt', sends: 'A protein’s accession', gets: 'The protein’s domains, regions and function', terms: ['CC BY 4.0', 'https://www.uniprot.org/help/license'] },
  { key: 'alphafold', name: 'AlphaFold Protein Structure Database', sends: 'A protein’s accession', gets: 'The predicted structure, and its confidence at each residue', terms: ['CC BY 4.0', 'https://alphafold.ebi.ac.uk/faq'] },
  { key: 'panelapp', name: 'Genomics England PanelApp', sends: 'A gene symbol, or words to search panels for', gets: 'Gene panels and their ratings of the gene', terms: ['PanelApp’s terms of use', 'https://panelapp.genomicsengland.co.uk/'] },
  { key: 'ucsc', name: 'UCSC Genome Browser files (its copy on Amazon)', sends: 'Requests for the pieces of its files that cover the region on show, or a CNV’s region', gets: 'The reference genome, and the tracks: RefSeq genes, ClinVar, ClinGen’s curations, the DGV gold standard CNVs', terms: ['Each track’s own terms, as UCSC describes them', 'https://genome.ucsc.edu/conditions.html'] },
  { key: 'ucscApi', idle: true, name: 'the UCSC Genome Browser REST API', sends: 'A region', gets: 'Tables of what overlaps it: ClinGen’s dosage regions, ClinVar’s CNVs, population CNVs', terms: ['Each track’s own terms, as UCSC describes them', 'https://genome.ucsc.edu/conditions.html'] },
  { key: 'europepmc', name: 'Europe PMC', sends: 'Words to search for: a gene and a variant', gets: 'Papers that mention them', terms: ['EMBL-EBI’s terms of use', 'https://www.ebi.ac.uk/about/terms-of-use/'] },
  { key: 'spliceai', idle: true, name: 'SpliceAI-lookup', sends: 'A variant’s position and alleles', gets: 'SpliceAI’s and Pangolin’s scores on each transcript', terms: ['Its own terms', 'https://spliceailookup.broadinstitute.org/'] },
  { key: 'myvariant', idle: true, name: 'MyVariant.info', sends: 'A variant’s genomic HGVS', gets: 'Annotations gathered from dbNSFP, ClinVar and other sources', terms: ['Each source’s own terms', 'https://myvariant.info/terms/'] },
  { key: null, name: 'ClinGen Criteria Specification Registry (CSpec)', sends: 'Nothing about a patient: the list of expert panels’ specifications, then the one for the variant’s gene', gets: 'An expert panel’s rules for applying the criteria to its genes', terms: ['ClinGen’s terms of use', 'https://clinicalgenome.org/docs/terms-of-use/'] },
  { key: null, name: 'ClinGen Evidence Repository', sends: 'The variant’s ClinGen allele identifier', gets: 'Expert panels’ classifications of the variant, with the criteria they applied and why', terms: ['ClinGen’s terms of use', 'https://clinicalgenome.org/docs/terms-of-use/'] },
  { key: null, name: 'jsDelivr', sends: 'A request for the Mol* viewer, the first time a 3D structure is shown', gets: 'Mol* 5.12.0, checked against its published hash', terms: ['jsDelivr’s terms', 'https://www.jsdelivr.com/terms'] }
];

async function sources(b) {
  b.appendChild(h('p', 'What the site holds, what it asks for as you work, and the software it is built from, with their versions and licences. The site’s own code is under the MIT licence; everything listed here keeps its own. The repository’s ', h('a', { href: REPO + '/blob/main/THIRD_PARTY.md' }, 'THIRD_PARTY.md'), ' has the same lists, with where each file came from.'));

  // ---- data in the site
  b.appendChild(h('h2', 'Data in the site'));
  b.appendChild(h('p.small.muted', 'Copies made by the scripts in build/, so that genes and phenotypes can be searched and compared without asking a service for each.'));
  const dataBox = h('div', h('p.muted', 'Reading the data files’ descriptions…'));
  b.appendChild(dataBox);
  const [genes, terms, dis, studio] = await Promise.all([
    readMeta('data/genes/genes.json').catch(() => null),
    readMeta('data/hpo/terms.json').catch(() => null),
    readMeta('data/hpo/diseases.json').catch(() => null),
    fetchJSON('assets/studio/SOURCE.json').catch(() => null)
  ]);
  dataBox.innerHTML = '';
  const rows = [];
  if (terms) rows.push(['The Human Phenotype Ontology', `release ${terms.version}`, licenceLink(terms.licence), 'Phenotype terms: search, the patient’s features, comparing them with diseases', 'data/hpo/terms.json']);
  if (dis) rows.push(['The HPO’s disease annotations', `release ${dis.version}${dis.diseases_with_phenotypes ? `, ${fmt(dis.diseases_with_phenotypes)} diseases` : ''}`, licenceLink(dis.licence), 'Diseases, their features and their genes: the diseases that fit a patient', 'data/hpo/diseases.json']);
  if (genes) {
    for (const [k, v] of Object.entries(genes.sources || {})) {
      const parts = String(v).split(', ');
      const lic = parts.length > 1 ? parts.pop() : '';
      rows.push([k === 'Collins 2022' ? 'Collins et al. (2022)' : k, parts.join(', '), lic, GENE_USE[k] || '', 'data/genes/genes.json']);
    }
  }
  if (rows.length) {
    dataBox.appendChild(simpleTable(['Data', 'Version', 'Licence', 'Used for', 'File'], rows.map((r) => [h('b', r[0]), r[1], r[2], r[3], h('code', r[4])])));
    if (genes) dataBox.appendChild(h('p.small.muted', `The gene table was made on ${genes.made}, with ${fmt(genes.genes)} genes${genes.hpo_version ? ` and the HPO release ${genes.hpo_version}` : ''}.`));
  } else dataBox.appendChild(note('warn', h('p', 'The data files’ descriptions could not be read. They are listed in the repository’s data/README.md.')));

  // ---- the services
  b.appendChild(h('h2', 'Asked as you work'));
  b.appendChild(h('p', 'To show the evidence for a variant, your browser asks these public services directly. They are sent what is listed, never anything about the patient; they see your address, as any website does. Their answers are kept in your browser, so that a variant opens quickly the next time. ', h('a', { href: link('/about/privacy') }, 'Privacy'), ' has more.'));
  const cfg = CFG.services || {};
  const svc = SERVICES.filter((s) => !s.idle && (!s.key || cfg[s.key] != null));
  // a service the site's settings name that this list doesn't describe
  for (const [k, v] of Object.entries(cfg)) if (!SERVICES.some((s) => s.key === k)) svc.push({ key: k, name: k, sends: '–', gets: '–', terms: null });
  const idle = SERVICES.filter((s) => s.idle && cfg[s.key] != null);
  b.appendChild(simpleTable(['Service', 'Sent', 'Received', 'Terms'], svc.map((s) => [
    h('div', h('b', s.name), s.key && cfg[s.key] ? h('div.small.muted.svc-url', urlsOf(cfg[s.key])) : null),
    s.sends, s.gets,
    s.terms ? h('a', { href: s.terms[1], target: '_blank', rel: 'noopener' }, s.terms[0]) : ''
  ])));
  if (idle.length) {
    const names = idle.map((s) => s.name);
    const list = names.length > 1 ? names.slice(0, -1).join(', ') + ' and ' + names[names.length - 1] : names[0];
    b.appendChild(h('p.small.muted', `The site’s settings also name ${list}, which the site does not ask at present.${idle.some((s) => s.key === 'spliceai') ? ' (The Splicing section links to SpliceAI-lookup; the SpliceAI scores it shows come from Ensembl.)' : ''}`));
  }
  b.appendChild(h('p.small.muted', 'Some pages also link to other sites (VarSome, Franklin, LOVD, OMIM and others): those open in a new tab, and only if you follow the link.'));

  // ---- software
  b.appendChild(h('h2', 'Software in the site'));
  const sha = studio && studio.studio_commit ? studio.studio_commit.slice(0, 7) : null;
  b.appendChild(simpleTable(['Component', 'Version', 'Licence', 'From'], [
    [h('div', h('b', 'Pedigree Studio'), h('div.small.muted', 'The family tab’s pedigree editor (assets/studio/)')), sha ? `commit ${sha}` : '', 'MIT', h('span', h('a', { href: 'https://github.com/comparativechrono/PedigreeStudio' }, 'PedigreeStudio'), ', by way of the Pedigree workbench; only the name it keeps its drawing under in the browser is changed')],
    [h('div', h('b', 'PedRisk and PedRead'), h('div.small.muted', 'Exact pedigree likelihoods, for co-segregation (risk-engine.js, risk-read.js)')), 'Pedigree workbench, commit 2d76e97', 'MIT', 'the Pedigree workbench, with one function added (logLikelihood)'],
    [h('div', h('b', 'igv.js'), h('div.small.muted', 'The genome browser (assets/vendor/igv/)')), '3.8.9', h('span', 'MIT, © Broad Institute and the Regents of the University of California'), 'the Bioinformatics workbench’s copy, unchanged'],
    [h('div', h('b', 'Mol*'), h('div.small.muted', 'The 3D structure viewer')), '5.12.0', 'MIT', 'loaded from cdn.jsdelivr.net when first used, with subresource integrity'],
    [h('div', h('b', 'Atkinson Hyperlegible Next and Mono'), h('div.small.muted', 'The fonts (assets/fonts/)')), 'from genomics.tel', 'SIL Open Font Licence 1.1', 'genomics.tel, with their licences beside them'],
    [h('div', h('b', 'The lab’s helpers'), h('div.small.muted', 'Icons, page helpers and the local server')), '', 'MIT', 'the Pedigree workbench (icons) and the variant practicals (core.js, adapted; serve.py)']
  ]));
  b.append(h('h2', 'The guidelines'));
  b.appendChild(h('p', 'The criteria are described in the site’s own words, from the published guidelines and ClinGen’s recommendations, which are cited where they are used and listed in the ', h('a', { href: link('/learn/references') }, 'guide’s references'), '. Nothing here is endorsed by the ACMG, the AMP, ClinGen or the ACGS.'));
}
const urlsOf = (v) => (typeof v === 'string' ? v : Array.isArray(v) ? v.join(', ') : Object.values(v).join(', '));
function licenceLink(text) {
  const m = /(https?:\/\/\S+?)(?:[;,)]|$)/.exec(String(text || ''));
  if (!m) return text || '';
  return h('a', { href: m[1], target: '_blank', rel: 'noopener' }, 'HPO terms of use');
}
function simpleTable(heads, rows) {
  const t = h('table.data.compact.about-table');
  t.appendChild(h('thead', h('tr', heads.map((x) => h('th', { scope: 'col' }, x)))));
  t.appendChild(h('tbody', rows.map((r) => h('tr', r.map((x) => h('td', x))))));
  return h('div.table-wrap', t);
}

/* ---------------- privacy ---------------- */
function privacy(b) {
  b.append(
    note('', h('p', h('b', 'In short: '), 'what you type stays in this browser, on this computer. The site has no server of its own, no accounts, no cookies and no analytics. To show the evidence for a variant, your browser asks public databases about the variant, its gene or its region; nothing about the patient is sent.')),
    h('h2', 'What is kept, and where'),
    h('p', 'Patients, their phenotypes, families and pedigrees, variants, classifications and notes are kept in this browser’s storage for the site’s address: an IndexedDB database called varint, with the answers from the online services kept beside them so that variants open quickly the next time. Your settings, the genome browser’s tracks and the drawing open in Pedigree Studio are kept in the browser’s local storage, under names beginning varint:.'),
    h('p', 'Nobody else can see them: not your tutor, not the site’s owner, and not other people using the same site. Another browser, or another computer, has its own (empty) storage.'),
    h('h2', 'What is sent, and to whom'),
    h('p', 'Your browser asks the services listed under ', h('a', { href: link('/about/sources') }, 'Sources and licences'), ' directly: Ensembl, gnomAD, NCBI (ClinVar), UniProt, AlphaFold DB, ClinGen, PanelApp and UCSC’s files on Amazon, among others. They are sent variant descriptions (HGVS, or positions and alleles), gene symbols, protein accessions, regions and identifiers such as ClinGen allele numbers, and, where a page compares phenotypes with an online service, HPO terms. They are never sent a patient’s reference, age, sex, notes or family.'),
    h('p', 'Like any website, each service sees your computer’s internet address and what it was asked, under its own privacy policy. The site itself is a set of files served by GitHub Pages; GitHub records visits as web servers do, under ', h('a', { href: 'https://docs.github.com/site-policy/privacy-policies/github-general-privacy-statement' }, 'GitHub’s privacy statement'), '. The 3D viewer is fetched from jsDelivr the first time a structure is shown.'),
    h('h2', 'Real patients'),
    h('p', 'The site is for teaching. Use the example cases, your tutor’s, or patients you make up. Don’t enter a real patient’s name, date of birth, hospital number or anything else that could identify them, even though it would stay on your computer.'),
    h('h2', 'Keeping, moving and removing your work'),
    h('ul', [
      h('li', h('b', 'Keep it: '), 'shared and university computers often clear browsers’ storage when you log out, so download your work at the end of each session: ', h('a', { href: link('/data') }, 'Cases and data'), ', Download all patients. The file is yours: hand it in, or open it again on another computer.'),
      h('li', h('b', 'Remove it: '), h('a', { href: link('/data') }, 'Cases and data'), ', Remove everything, deletes every patient, classification and setting kept by this browser for the site. Clearing the site’s data in your browser’s settings does the same.'),
      h('li', h('b', 'Private windows: '), 'a private or incognito window may keep nothing once it is closed; the top bar says so when the browser won’t let the site keep anything.')
    ]));
}

/* ---------------- your own copy ---------------- */
const CONFIG_ROWS = [
  ['title', 'The name in the top bar and the browser’s tab.'],
  ['subtitle', 'The line under the name.'],
  ['defaultAssembly', 'The genome build for new look-ups: GRCh38 or GRCh37 (each variant keeps its own).'],
  ['framework', 'The guidelines new users follow: acgs2024, clingen or acmg2015. Each user can change it.'],
  ['suggestions', 'Suggestions from the evidence: show (from the start), button (hidden until asked for) or never (for assessments).'],
  ['allowCompare', 'Whether students may compare a signed classification with the answer in a case file.'],
  ['services', 'The addresses of the online services (to use a mirror, or a server of your own).'],
  ['cases', 'The list of cases on the Cases and data page.']
];
function hosting(b) {
  b.append(
    h('p', 'The site is a folder of files with no build step and no server-side code, so it can be hosted for free on GitHub Pages or on any web server. A course can have its own copy, with its own settings and cases.'),
    h('h2', 'On GitHub Pages'),
    h('ol', [
      h('li', 'Fork the repository (', h('a', { href: REPO }, 'comparativechrono/variant-interpreter'), '), or copy its files into one of yours.'),
      h('li', 'In the repository’s Settings, Pages: Deploy from a branch, the branch main, the folder / (root).'),
      h('li', 'After a minute the site is at https://YOUR-NAME.github.io/variant-interpreter/.')
    ]),
    h('p.small.muted', 'The empty file .nojekyll stops GitHub processing the site. Students’ work is kept by each browser for the site’s address, so it survives updates to the site; a copy at another address starts empty.'),
    h('h2', 'Settings'),
    h('p', 'Edit assets/js/config.js (never put a password or a key in it: anyone can read a public site’s files). On this site they are:'));
  b.appendChild(simpleTable(['Setting', 'What it does', 'Here'], CONFIG_ROWS.map(([k, what]) => [h('code', k), what, h('span.small', valueText(CFG[k]))])));
  b.append(
    h('h2', 'Cases'),
    h('p', 'A case is a file of patients in the site’s own format, with a brief and, if you like, the answers. To make one:'),
    h('ol', [
      h('li', 'Make the patient here: details, phenotype, family and variants. Classify the variants yourself if the case is to carry the answers.'),
      h('li', 'Download it from Cases and data (Download some). The file has "format": "variant-interpreter".'),
      h('li', 'Add a "case" object: its title, a brief (HTML), tasks (a list) and a source line. To give the answer for a variant, add "expected" to it: the class (p, lp, vus, lb or b), the criteria (as ClinGen writes them, e.g. PM2_Supporting), the source, and notes on each criterion if you wish.'),
      h('li', 'Put the file in data/cases/ and list it in data/cases/index.json, with an id, a title, a teaser, tags and the file’s path. It then appears on the home page and on Cases and data.')
    ]),
    h('p.small.muted', 'Students can see a case file’s answers if they look inside it: for assessed work, give out the answers later, or set allowCompare to false.'),
    h('h2', 'Bringing the data up to date'),
    h('p', 'The HPO and the gene table are copies, made by two scripts from the public files they name (see build/README.md in the repository): python3 build/make_hpo.py, then python3 build/make_genes.py, each with the folder of downloaded files. Everything else is asked for as students work, so it is always current.'),
    h('h2', 'On your own computer'),
    h('p', 'Browsers won’t run the site from files opened directly. In the site’s folder, run python3 serve.py and open http://localhost:8000/ (serve.py is a small web server that also answers the range requests the genome browser makes).'));
}
const valueText = (v) => (v == null ? '–' : typeof v === 'object' ? (Array.isArray(v) ? v.join(', ') : `${Object.keys(v).length} services`) : String(v));
export { icon };
