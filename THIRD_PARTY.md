# Third-party software, data and provenance

The Variant interpreter's own code, text and example cases are under the MIT
licence ([LICENSE](LICENSE)). What it includes from elsewhere, and what it
loads or asks for as it runs, keeps its own licence or terms. Keep each
component's notices and licence files when copying or redistributing its
files. The site's *About → Sources and licences* page (`#/about/sources`)
shows the same lists, with the versions read from the data files themselves.

## Included in the site

| Component | Version | Licence | Where | Origin |
|---|---|---|---|---|
| Pedigree Studio (Timothy J Hearn), with `bridge.js` | Studio commit `81dbf79` (`81dbf796c56b8ae698f7facb6402bccfb916b145`) | MIT | `assets/studio/index.html`, `assets/studio/bridge.js` | [comparativechrono/PedigreeStudio](https://github.com/comparativechrono/PedigreeStudio), copied from the [Pedigree workbench](https://github.com/comparativechrono/pedigree-workbench)'s `assets/studio/` at its commit `2d76e97`. One change, recorded in `assets/studio/SOURCE.json`: the name under which the Studio keeps its drawing in the browser, `pedwb:studio-session`, became `varint:studio-session` (three places), so that the two sites keep their drawings apart when they share an address. `bridge.js` is the Pedigree workbench's, unchanged. `SOURCE.json` records the SHA-256 of the workbench's copy. |
| PedRisk and PedRead (`risk-engine.js`, `risk-read.js`) | Pedigree workbench commit `2d76e97` | MIT | `assets/js/` | The Pedigree workbench's `assets/js/`. `risk-engine.js` has one function added, `logLikelihood` (the log-likelihood of a pedigree's phenotypes and test results), for the co-segregation likelihood ratio; both have a note of their origin in their headers. |
| igv.js (the genome browser; includes pako, MIT and zlib licences) | 3.8.9 | MIT, © 2014–2025 Broad Institute of MIT and Harvard and the Regents of the University of California | `assets/vendor/igv/` (with its `LICENSE`) | The [Bioinformatics workbench](https://github.com/comparativechrono/bioinformatics-workbench)'s copy, unchanged; upstream [igvteam/igv.js](https://github.com/igvteam/igv.js). |
| Atkinson Hyperlegible Next and Atkinson Hyperlegible Mono (variable WOFF2, Latin and Latin Extended subsets, roman and italic) | as on genomics.tel | SIL Open Font Licence 1.1, © 2020–2024 The Atkinson Hyperlegible Next Project Authors and The Atkinson Hyperlegible Mono Project Authors | `assets/fonts/` (with `OFL-atkinson-hyperlegible-next.txt` and `OFL-atkinson-hyperlegible-mono.txt`) | [genomics.tel](https://www.genomics.tel/)'s `assets/fonts/`, unchanged; upstream [googlefonts/atkinson-hyperlegible-next](https://github.com/googlefonts/atkinson-hyperlegible-next) and [googlefonts/atkinson-hyperlegible-next-mono](https://github.com/googlefonts/atkinson-hyperlegible-next-mono). |
| The icons (`assets/js/icons.js`) | | MIT | `assets/js/icons.js` | The Pedigree workbench's `icons.js`, with icons added for this site. |
| Page helpers (`assets/js/core.js`) and the local server (`serve.py`) | | MIT | `assets/js/core.js`, `serve.py` | Adapted from the Hearn lab's [variant practicals](https://github.com/comparativechrono/variant-practicals) (`core.js`); `serve.py` is the practicals' own, unchanged. |

The rest of `assets/` – the pages, the classification engine, the
calculators, the CNV points, the clients of the online services, the styles
and the site's mark – was written for this site.

## Data included in the site

Made by the scripts in `build/` ([build/README.md](build/README.md)) from
the public files named there; [data/README.md](data/README.md) describes
each file.

| Data | Version | Licence or terms | Where |
|---|---|---|---|
| The Human Phenotype Ontology: every current term, with its synonyms, parents, definition and the ids it replaces | release 2026-09-01 | The HPO's terms of use ([hpo.jax.org/license](https://hpo.jax.org/license)), which ask that the version used be shown: the site shows it (*About → Sources and licences*) | `data/hpo/terms.json` |
| The HPO's disease annotations (`phenotype.hpoa`, `genes_to_disease.txt`): each disease's phenotype terms and their frequencies, its genes, its inheritance and onset, with the terms' information content | release 2026-09-01 | The HPO's terms of use; disease names as the annotations give them (OMIM, Orphanet and DECIPHER identifiers) | `data/hpo/diseases.json` |
| HGNC: approved gene symbols, names, previous symbols, aliases and identifiers | the complete set, 2026-10-20 | CC0 | `data/genes/genes.json` |
| MANE: each gene's MANE Select (and Plus Clinical) transcript, and its position on GRCh38 | v1.5 | public domain (NCBI and EMBL-EBI) | the same |
| gnomAD gene constraint (pLI, LOEUF and its decile, missense Z and observed/expected) | v4.1 | CC0 | the same |
| ClinGen Dosage Sensitivity curations: genes, and regions on GRCh38 and GRCh37 | 2026-10-20 | CC0 | the same |
| ClinGen gene–disease validity curations | 2026-10-20 | CC0 | the same |
| pHaplo and pTriplo (Collins RL et al. 2022, *Cell* 185:3041, [zenodo.org/records/6347673](https://zenodo.org/records/6347673)) | the published scores | CC BY 4.0 | the same |
| Gene2Phenotype (EMBL-EBI): the gene–disease records of the Cancer, Cardiac, DD, Ear, Eye, Skeletal and Skin panels | 2026-10-20 | CC0 | the same |

The licences in this table are those recorded by `build/make_genes.py` in
`genes.json`'s `meta`, and by `build/make_hpo.py` in the HPO files' `meta`.

The ACMG/AMP criteria are described in the site's own words
(`assets/js/acmg/criteria.js`), and their thresholds, points and rules
(`assets/js/acmg/`, `assets/js/cnv/rubric.js`) are taken from the published
guidelines and recommendations cited beside them – Richards et al. (2015),
the ACGS 2024 guidelines, ClinGen's recommendations, Tavtigian et al. (2018,
2020), Pejaver et al. (2022), Bergquist et al. (2025), Walker et al. (2023),
Abou Tayoun et al. (2018), Brnich et al. (2019), Whiffin et al. (2017),
Jarvik and Browning (2016), Ghosh et al. (2018) and Riggs et al. (2020, and
its 2021 correction). No text of theirs is copied. Nothing here is endorsed
by the ACMG, the AMP, ClinGen or the ACGS.

The example cases (`data/cases/`) are fictional patients. Their variants are
real, and each case names the public classifications it draws on (ClinVar,
ClinGen's expert panels).

## Loaded or asked for as the site runs

Nothing in this section is part of the site; each user's browser fetches it.

- **Mol\* 5.12.0** (MIT) – the 3D structure viewer – from
  `cdn.jsdelivr.net/npm/molstar@5.12.0/build/viewer/` the first time a
  structure is shown, checked against the published hashes
  (subresource integrity; the hashes are in `assets/js/widgets/structure.js`).
- **UCSC's files** – from its copy on Amazon,
  `genome-browser.s3.us-east-1.amazonaws.com` (the same files as
  `hgdownload.soe.ucsc.edu`), read a piece at a time: the reference genomes
  (hg38 and hg19 `.2bit`, chromosome sizes and bands), NCBI's RefSeq Select
  genes, and the tracks of ClinVar (`clinvarMain.bb`, `clinvarCnv.bb`),
  ClinGen (`clinGenHaplo.bb`, `clinGenTriplo.bb`, `clinGenGeneDisease.bb`)
  and the Database of Genomic Variants' gold standard set (`dgvGold.bb`),
  for the genome browser and for the tables of a CNV's region. Each is under
  its provider's terms, as [UCSC describes them](https://genome.ucsc.edu/conditions.html).
- **Web services**, each under its own terms:
  - Ensembl's REST API (`rest.ensembl.org`, `grch37.rest.ensembl.org`):
    the Variant Effect Predictor, with its CADD, REVEL, SpliceAI,
    AlphaMissense, dbNSFP (BayesDel, PrimateAI, MetaRNN, phyloP, GERP++),
    Conservation, BLOSUM62, NMD and LOFTEE plugins, and genes by region.
    Ensembl's own data have no restrictions on use; the prediction tools'
    scores keep their authors' terms, which for several allow non-commercial
    use only.
  - gnomAD's API (`gnomad.broadinstitute.org/api`): frequencies (v4.1 on
    GRCh38, v2.1.1 on GRCh37), constraint, its copy of ClinVar's variants in
    a gene, and structural variants. CC0.
  - NCBI's E-utilities (`eutils.ncbi.nlm.nih.gov`): ClinVar.
  - UniProt (`rest.uniprot.org`, CC BY 4.0) and the AlphaFold Protein
    Structure Database (`alphafold.ebi.ac.uk`, CC BY 4.0).
  - Genomics England's PanelApp (`panelapp.genomicsengland.co.uk`).
  - ClinGen's Criteria Specification Registry (`cspec.clinicalgenome.org`)
    and Evidence Repository (`erepo.clinicalgenome.org`).
  - Europe PMC (`www.ebi.ac.uk/europepmc/webservices/rest`).

  Only variant descriptions, gene symbols, protein accessions, regions and
  identifiers are sent; nothing about a patient. `assets/js/config.js`
  holds their addresses.
- **Links** to other sites (VarSome, Franklin, DECIPHER, LOVD, OMIM,
  Mastermind, Monarch, GTEx, Open Targets and others) open in a new tab,
  and only when followed.
