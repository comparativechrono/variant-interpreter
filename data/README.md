# The site's data

Copies of public data that the site keeps so that genes and phenotypes can be
searched and compared in the browser, without asking a service for each. They
are made by the scripts in [`../build/`](../build/README.md); each file starts
with a `meta` object that says where it came from, its version and its licence,
and the site's *About → Sources and licences* page reads those.

Everything else – frequencies, consequences, predictions, ClinVar, proteins,
structures – is asked for as students work (see the main
[README](../README.md#the-data)).

## `hpo/terms.json` – the Human Phenotype Ontology

Every current term of the HPO (release 2026-09-01: 19,894 terms), made by
`build/make_hpo.py` from `hp.json`.

```
{ "meta":  { source, version, licence, made_by, fields },
  "terms": [ [number, name, [synonyms], [parent numbers], definition], … ],
  "alt":   { "replaced number": current number, … } }
```

A term's number is its id without the prefix and leading zeros
(`HP:0001250` is `1250`); parents are its `is_a` parents. `alt` maps the
3,974 retired ids (`alt_id`) to the terms that replace them. The names,
synonyms and definitions are the HPO's own, unchanged.

**Licence**: the HPO's terms of use ([hpo.jax.org/license](https://hpo.jax.org/license)),
which ask that the version used be shown.

## `hpo/diseases.json` – the HPO's disease annotations

Each disease that the HPO annotates with phenotype terms (12,867: 8,465 from
OMIM, 4,355 from Orphanet and 47 from DECIPHER), made by `build/make_hpo.py`
from `phenotype.hpoa` and `genes_to_disease.txt` of the same release.

```
{ "meta":      { source, version, licence, made_by, fields, diseases_with_phenotypes },
  "diseases":  [ [id, name, [gene symbols], [term, frequency, term, frequency, …], [inheritance terms], [onset terms]], … ],
  "ic":        { "term number": information content, … },
  "ic_unseen": information content of a term no disease is annotated with }
```

Frequencies are whole percentages – the HPO's frequency terms as one value
each (obligate 100, very frequent 90, frequent 55, occasional 17, very rare
2, excluded 0), and `n/m` fractions and percentages as given – or `-1` when
the annotation gives none. Phenotypes
annotated with `NOT` are left out. Genes are those `genes_to_disease.txt`
links to the disease as Mendelian or polygenic. A term's information content
is −ln of the share of diseases annotated with it or a term below it; the
site compares a patient's terms with a disease's by the information content
of their most informative common ancestors.

**Licence**: the HPO's terms of use, as above.

## `genes/genes.json` – the table of genes

One row for each of 19,372 genes: every protein-coding gene approved by HGNC,
and any other gene that ClinGen, Gene2Phenotype or the HPO's annotations
name. Made by `build/make_genes.py` on 2026-10-20.

```
{ "meta":          { made, made_by, sources: {name: "what, version, licence"}, hpo_version, genes },
  "fields":        [ names of the columns below ],
  "genes":         [ [one value for each field, in order; trailing empty values left off], … ],
  "validity":      { symbol: [[disease, MONDO id, inheritance, classification, date, report id, expert panel], …] },
  "g2p":           { symbol: [[disease, confidence, allelic requirement, mechanism, panels, G2P id, variant consequence, disease id], …] },
  "regions":       [ [ISCA id, name, cytoband, chromosome, start, end (GRCh38), start, end (GRCh37), HI score, TS score, date], … ],
  "region_fields": [ names of the region columns ] }
```

| Field | What it is | From |
|---|---|---|
| `symbol`, `hgnc`, `name`, `cyto` | approved symbol, HGNC id, name, cytogenetic band | HGNC |
| `locus` | `pc` protein-coding, `nc` non-coding RNA, `ps` pseudogene, `o` other | HGNC |
| `ensembl`, `omim`, `uniprot` | Ensembl gene, OMIM gene and UniProt ids | HGNC |
| `aliases`, `prev` | other and previous symbols, for searching | HGNC |
| `mane`, `manePlus` | the MANE Select RefSeq transcript, and any MANE Plus Clinical ones | MANE v1.5 |
| `chrom`, `start`, `end`, `strand` | where the MANE Select transcript is on GRCh38 (1-based) | MANE v1.5 |
| `pLI`, `loeuf`, `loeufDecile` | probability of loss-of-function intolerance; the upper bound of the observed/expected loss-of-function ratio, and its decile (0 to 9, 0 the most constrained) | gnomAD v4.1 |
| `lofObs`, `lofExp` | loss-of-function variants observed and expected | gnomAD v4.1 |
| `misZ`, `misOE` | missense constraint: Z score and observed/expected | gnomAD v4.1 |
| `pHaplo`, `pTriplo` | predicted probabilities of haploinsufficiency and triplosensitivity | Collins et al. (2022) |
| `hi`, `ts` | ClinGen's haploinsufficiency and triplosensitivity scores: 0, 1, 2, 3, 30 (autosomal recessive) or 40 (unlikely) | ClinGen |
| `dosageDate`, `hiDisease`, `tsDisease` | when ClinGen last evaluated the gene's dosage, and the diseases (MONDO) | ClinGen |

Constraint is the MANE Select transcript's (the Ensembl canonical one's when
there is none). ClinGen's regions are its curated dosage-sensitive (and
benign) regions, such as the 22q11.2 deletion region, on both builds.

**Licences**, as recorded in `meta.sources`: HGNC CC0; MANE public domain;
gnomAD CC0; ClinGen's dosage and validity curations CC0; Collins et al.'s
scores CC BY 4.0 ([zenodo.org/records/6347673](https://zenodo.org/records/6347673));
Gene2Phenotype CC0 (the Cancer, Cardiac, DD, Ear, Eye, Skeletal and Skin
panels).

## `cases/` – the example cases

`index.json` lists the cases offered on the home page and on *Cases and
data*:

```
{ "cases": [ { "id", "title", "teaser", "tags": [], "file": "data/cases/….json" }, … ] }
```

Each case is a file in the site's own export format
(`"format": "variant-interpreter"`), with a `case` object (`id`, `title`,
`brief` in HTML, `tasks`, `source`), the patient (details, phenotypes,
pedigree) and the variants, some with an `expected` answer (`cls`,
`criteria`, `source`, `notes`) that students can compare with once they have
signed their own classification. The patients are fictional; the variants
are real, and each case's `source` names the public classifications it draws
on. The main [README](../README.md#cases-for-a-course) says how to make more.

## Bringing it up to date

See [`../build/README.md`](../build/README.md): download the newer public
files, run `make_hpo.py` and then `make_genes.py`, and commit the new files.
