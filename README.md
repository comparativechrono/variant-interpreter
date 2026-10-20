# Variant interpreter

A website for learning clinical variant interpretation. Students record a
patient's phenotype and family, add the variants from their genetic test,
look at the evidence for each variant in the public databases, and classify
it with the ACMG/AMP criteria. They can follow the ACGS 2024 guidelines, as
UK laboratories do, ClinGen's guidance, as its expert panels do, or the
original 2015 rules. Copy-number variants are scored with the ACMG/ClinGen
points (Riggs et al. 2020). Everything runs in the student's browser, so
there is nothing to install, no account to make and no server-side code,
and the patients a student enters stay on their own computer.

The site is modelled on the workflow of the platforms used in clinical
genomics, such as DECIPHER, so that students can carry on interpreting
variants after a workshop's access to such a platform ends. It has no
affiliation with DECIPHER, VarSome, Franklin or any other platform, and
uses none of their branding.

**It is for teaching, not for clinical use.** The annotations come from
public services as they stand on the day, some rules are simplified, and
nothing has been validated for diagnosis. Please keep real patients'
details out of it.

## Contents

1. [What is in it](#what-is-in-it)
2. [How students use it](#how-students-use-it)
3. [Cases for a course](#cases-for-a-course)
4. [Put it on GitHub Pages](#put-it-on-github-pages)
5. [Try it on your own computer](#try-it-on-your-own-computer)
6. [Settings in `config.js`](#settings-in-configjs)
7. [The data](#the-data)
8. [Tests](#tests)
9. [Privacy](#privacy)
10. [Files](#files)
11. [Credits and licences](#credits-and-licences)

## What is in it

The whole site is one page, `index.html`, and each part of it has an
address after the `#`:

| Page | Address | What it is for |
|---|---|---|
| **Home** | `#/` | The logo and name, where to start, the patients in this browser, and the cases to practise on. |
| **Patients** | `#/patients`, `#/patient/1001` | A patient's record, in tabs: *Overview*; *Phenotypes* (HPO terms, observed or excluded, found by search or in a clinical note, with the diseases that fit them best); *Variants* (sequence variants and CNVs, with zygosity, inheritance, class and contribution to the phenotype; added one at a time or from a VCF file); *Family and pedigree* (Pedigree Studio, with each relative's genotype for each variant); *Genome browser*; *Report* (laid out as a laboratory's report, to print or save as a PDF); *History*. |
| **A variant** | `#/variant/NM_000546.6:c.818G>A`, or a patient's variant | The evidence, section by section – population (gnomAD v4.1), variant type and the PVS1 decision tree, predictions, splicing (SpliceAI), the protein (domains, ClinVar's variants along it, AlphaFold's model in 3D), ClinVar and the literature, the gene and its diseases, the patient and family, functional data – beside the classification panel: each criterion met or not met at a chosen strength, the evidence scale, and the class as it stands. |
| **A CNV** | `#/cnv/del 22:18900000-21500000` | The genes and ClinGen dosage-sensitive regions in a gain or loss, overlapping CNVs in ClinVar and in the population, and the Riggs et al. (2020) points, item by item. |
| **Gene, region, phenotype** | `#/gene/TP53`, `#/region/22:18900000-21500000`, `#/phenotype/HP:0001250` | A gene's constraint, dosage sensitivity, gene–disease validity and diseases; what lies in a region; a phenotype term, its diseases and genes. |
| **Phenotype match** | `#/match` | The diseases and genes that best explain a set of HPO terms (a patient's, or any), with why each ranks where it does, and the patients in this browser with similar features. |
| **Genome browser** | `#/browser` | igv.js on GRCh38 or GRCh37, with genes, ClinVar, ClinGen's dosage curations and population CNVs, and a patient's own variants. |
| **Guide** | `#/learn` | How to interpret a variant, a page for each of the 28 criteria (`#/learn/PVS1`), the three sets of guidelines, how evidence is combined, CNVs, using the site, a glossary and the references. |
| **Cases and data** | `#/data` | Opening cases and files, downloading work, and removing it. |
| **Settings, About** | `#/settings`, `#/about` | The user's name, guidelines and display choices; the site's sources, licences and privacy. |

Like the clinical platforms, it has a patient record with HPO terms
marked present or absent, a table of the patient's variants with their
inheritance, genotype, pathogenicity and contribution, and an evidence
interface that takes the criteria one by one. Its suggestions from the data
are never applied automatically. It also scores CNVs, and has a genome
browser with ClinVar, ClinGen dosage and DGV tracks, gene pages and
phenotype matching.

On top of that, it adds things that help students learn:

- no accounts and no real patients;
- a pedigree editor that records relatives' genotypes and works out an
  exact co-segregation likelihood ratio for PP1 and BS4;
- calculators for ClinGen's de novo (PS2, PM6) and in-trans (PM3) points,
  for OddsPath (PS3, BS3) and for the highest credible allele frequency
  (BS1);
- the ACGS 2024 points with the bands of uncertain significance (hot to ice
  cold, as NHS England's GeNotes names them), shown beside the 2015 rules
  and the Bayesian probability of pathogenicity;
- once a classification is signed, a comparison with the case's answer and
  with ClinGen expert panels' classifications from their Evidence
  Repository;
- signed classifications with their history, and a printable report.

The three sets of guidelines (`assets/js/acmg/frameworks.js`):

| | ACGS 2024 (UK) | ClinGen | ACMG/AMP 2015 |
|---|---|---|---|
| Combining | points (Tavtigian et al.) | points | the rules of Richards et al., Table 5 |
| PM2 starts at | moderate | supporting | moderate |
| PP3 and BP4 | supporting only (REVEL ≥ 0.7, < 0.4) | calibrated, up to strong (Pejaver et al. 2022) | by judgement |
| Two or more criteria for any class but uncertain | yes (BA1 apart, and BS1_Strong for a highly penetrant dominant disorder) | no | no |
| PM1 and PP3 together | no cap | at most 4 points (Pejaver et al. 2022) | no cap |
| Strengths written | `PM2_mod`, `PVS1_vstr` | `PM2_Supporting` | as ClinGen |

## How students use it

1. **Open a case** from the home page or *Cases and data*, or make a new
   patient (*Patients*, *New patient*) with a made-up reference.
2. **Phenotypes**: add HPO terms, marking those the patient does not have
   as excluded.
3. **Family**: draw the pedigree in Pedigree Studio, or answer a few
   questions about parents, siblings and children; shade the affected.
4. **Variants**: add each variant – HGVS on a transcript
   (`NM_000546.6:c.818G>A`), a position (`17-7673802-C-T`), an rsID, a
   protein change, a VCF file, or a CNV (`del 22:18900000-21500000`,
   `arr[GRCh38] 22q11.21(18912231_21465672)x1`). The search box at the top
   takes all of these (press `/` to reach it).
5. **Evidence and criteria**: on each variant's page, work down the
   sections and mark each criterion met or not met, with a note of the
   evidence. If the course allows suggestions, they appear only when the
   student asks for them, and they are never applied automatically.
6. **Sign** the classification (with a reason if it differs from the
   calculated class), then compare it with the case's answer or an expert
   panel's.
7. **Report**: print the patient's report, or save it as a PDF.
8. **Download** the work at the end of the session (*Cases and data*,
   *Download all patients*), because shared computers often clear the
   browser's storage when a student logs out. The file opens again on any
   computer, and it is also how work is handed in.

The guide (`#/learn`) explains each step and each criterion.

## Cases for a course

A case is a file of patients in the site's own format, with a brief and,
optionally, the answers. The example cases in `data/cases/` are fictional
patients with real variants from the public databases.

To make one:

1. Make the patient in the site: details, phenotypes, family and variants.
   Classify the variants if the case is to carry answers.
2. Download it (*Cases and data*, *Download some…*). The file is JSON, with
   `"format": "variant-interpreter"`.
3. Add a `case` object: `id`, `title`, `brief` (HTML), `tasks` (a list) and
   `source`. To give the answer for a variant, add `expected` to it:
   ```json
   "expected": {
     "cls": "p",
     "criteria": ["PS4_VeryStrong", "PS3", "PM1", "PM2_Supporting", "PP3"],
     "source": "ClinGen TP53 expert panel, Evidence Repository",
     "notes": { "PM1": "Codon 273 is one of the panel's hotspots." }
   }
   ```
   `cls` is one of `p`, `lp`, `vus`, `lb`, `b`; criteria are written as
   ClinGen writes them.
4. Put the file in `data/cases/` and list it in `data/cases/index.json`:
   ```json
   { "id": "tp53-lfs", "title": "A family with early cancers", "teaser": "…",
     "tags": ["TP53", "Segregation (PP1)"], "file": "data/cases/tp53-lfs.json" }
   ```

A tutor can also hand out a case file directly, and students open it with
*Cases and data*, *Choose a file…*. The answers are in the file, so a
determined student could read them. For assessed work, give out the
answers later, or set `allowCompare` to `false`.

## Put it on GitHub Pages

The site is the repository as it is: `index.html` at the top, with
`assets/` and `data/` beside it. It needs no build step.

1. In the repository's **Settings → Pages**, choose *Deploy from a branch*,
   the branch `main` and the folder `/ (root)`.
2. After a minute the site is at
   `https://comparativechrono.github.io/variant-interpreter/`.

The empty file `.nojekyll` stops GitHub processing the site. The site does
not need `build/` or `tests/`. Students' work is kept by each browser for the
site's address (IndexedDB, under the name `varint`, with each save first
copied to localStorage so that a reload or a closed tab cannot lose it), so it
survives updates to the site; a copy at another address starts empty.

## Try it on your own computer

Browsers do not run the site from files opened directly (`file://…`).
Serve the folder instead:

```bash
python3 serve.py          # then open http://localhost:8000/
python3 serve.py 8820     # another port
```

`serve.py` is a small web server that also answers the range requests the
genome browser makes.

## Settings in `config.js`

`assets/js/config.js` holds the site's settings. Never put a password or an
API key in it: anyone can read a public site's files.

| Setting | What it does |
|---|---|
| `title`, `subtitle` | The name in the top bar, and the line under it. |
| `defaultAssembly` | The genome build for new look-ups: `GRCh38` or `GRCh37` (each variant keeps its own). |
| `framework` | The guidelines new users follow: `acgs2024`, `clingen` or `acmg2015`. Each user can change theirs in Settings. |
| `suggestions` | Suggestions from the evidence: `show` (from the start), `button` (hidden until asked for; the default) or `never` (for assessments). |
| `allowCompare` | Whether students may compare a signed classification with the answer in a case file. |
| `services` | The addresses of the online services (to use a mirror). |
| `cases` | The list of cases, normally `data/cases/index.json`. |

Each user's own choices (their name, guidelines, the predictor for PP3 and
BP4, the bands of uncertain significance, retired criteria, the genome
build) are kept by their browser and changed on the Settings page.

## The data

The site uses two kinds of data.

- **Copies in the site** (`data/`), made by the scripts in `build/`: the
  Human Phenotype Ontology and its disease annotations (`data/hpo/`), and a
  table of genes (`data/genes/genes.json`) with their identifiers, MANE
  transcripts, positions on GRCh38, gnomAD v4.1 constraint, ClinGen dosage
  sensitivity (genes and regions) and gene–disease validity, Collins et
  al.'s pHaplo and pTriplo, and Gene2Phenotype's records. They let genes
  and phenotypes be searched and compared without asking a service for each.
  [data/README.md](data/README.md) describes the files, and
  [build/README.md](build/README.md) how to make them again from newer
  releases.
- **Asked for as students work**, by each student's browser: Ensembl's
  Variant Effect Predictor (consequences, HGVS, MANE, and scores from CADD,
  REVEL, SpliceAI, AlphaMissense and others), gnomAD (frequencies,
  constraint, structural variants), NCBI's E-utilities (ClinVar), UniProt
  and AlphaFold DB, Genomics England's PanelApp, ClinGen's Criteria
  Specification Registry and Evidence Repository, Europe PMC, and UCSC's
  track files on Amazon (the genome browser, and ClinVar's CNVs, DGV and
  ClinGen's curations for a region). Only variant descriptions, gene
  symbols, regions and identifiers are sent. The answers are kept in the
  browser, so a variant opens quickly a second time.

*About → Sources and licences* (`#/about/sources`) lists them all with their
versions and licences, as does [THIRD_PARTY.md](THIRD_PARTY.md).

## Tests

```bash
npm test
```

runs the tests in `tests/` with Node (version 18 or later, no packages to
install): the classification engine (the 2015 rules, the points and the
probabilities), the suggestion rules (each one a point of the guidelines
the site must keep), the co-segregation likelihood ratio, the CNV points,
and the site's other modules and example cases. Each file says what it checks,
and can be run on its own (`node tests/acmg-engine.test.mjs`).

## Privacy

Everything a student enters stays in their browser. The site has no server
of its own, no accounts, no cookies and no analytics. To show the evidence,
the browser asks the public services above about variants, genes and
regions; it never sends anything about the patient. GitHub, which serves
the files, records visits as any web server does. *About → Privacy*
(`#/about/privacy`) says more.

## Files

```
index.html                 the page
assets/
  js/                      the site: main.js (the frame and search), router.js, db.js (IndexedDB), settings.js,
                           config.js (the site's settings)
    acmg/                  the criteria, the three sets of guidelines, combining, thresholds, calculators,
                           the PVS1 tree, co-segregation and suggestions
    cnv/                   the Riggs et al. (2020) points
    api/                   the online services
    views/                 the pages
    widgets/               the classification panel, the evidence scale, the protein plot, the 3D view,
                           the genome browser
    risk-engine.js, risk-read.js   PedRisk and PedRead, from the Pedigree workbench
  css/                     the styles
  studio/                  Pedigree Studio, with SOURCE.json (where it came from) and bridge.js
  vendor/igv/              igv.js
  fonts/                   Atkinson Hyperlegible Next and Mono
data/
  hpo/                     the HPO and its annotations
  genes/                   the table of genes
  cases/                   the example cases, and index.json
build/                     make_hpo.py and make_genes.py, which make data/hpo and data/genes
tests/                     the tests (npm test)
serve.py                   a small web server for trying it locally
```

## Credits and licences

The Variant interpreter is © 2026 Chronomic Medicine Group. It was made for
the Hearn lab's clinical genomics teaching and is one of the sites of
[genomics.tel](https://www.genomics.tel/). Its code is under the MIT licence
([LICENSE](LICENSE)). It is built on the
lab's other workbenches: Pedigree Studio and PedRisk come from the
[Pedigree workbench](https://github.com/comparativechrono/pedigree-workbench),
igv.js from the
[Bioinformatics workbench](https://github.com/comparativechrono/bioinformatics-workbench),
and the fonts from genomics.tel. The components and data it includes or
loads keep their own licences, which **[THIRD_PARTY.md](THIRD_PARTY.md)**
lists. The criteria are described in the site's own words, drawing on the
published guidelines and ClinGen's recommendations, which are cited where
they are used. Nothing here is endorsed by the ACMG, the AMP, ClinGen or
the ACGS.
