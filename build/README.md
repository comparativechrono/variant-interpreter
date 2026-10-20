# Making the site's data

Two scripts make the data files the site keeps (`data/hpo/` and
`data/genes/`, described in [`../data/README.md`](../data/README.md)) from
the public files of each source. They need Python 3 and nothing else (only
its standard library). Run them when a newer release is worth having – the
HPO and ClinGen's curations are updated regularly – then check the site and
commit the new files.

Make the HPO files first: the gene table takes the HPO's genes and its
version from `data/hpo/diseases.json`.

## 1. The HPO: `make_hpo.py`

From the HPO's [releases](https://github.com/obophenotype/human-phenotype-ontology/releases),
download three files of one release into a folder of their own:

| File | What it is |
|---|---|
| `hp.json` | the ontology |
| `phenotype.hpoa` | the diseases' phenotype annotations |
| `genes_to_disease.txt` | the diseases' genes |

Then, from the top of the repository:

```bash
python3 build/make_hpo.py ~/downloads/hpo
```

It writes `data/hpo/terms.json` (about 4.4 MB) and `data/hpo/diseases.json`
(about 3.3 MB), and prints the release and the numbers of terms and
diseases. The terms, names and definitions are the HPO's own, unchanged; the
HPO's terms of use ask that the version used be shown, which the site does.

## 2. The genes: `make_genes.py`

Download these into another folder, under the names in the first column
(the script looks for exactly these names):

| Save as | Download from |
|---|---|
| `hgnc_complete_set.txt` | https://storage.googleapis.com/public-download-files/hgnc/tsv/tsv/hgnc_complete_set.txt |
| `MANE.GRCh38.vX.summary.txt.gz` (keep the version in the name) | https://ftp.ncbi.nlm.nih.gov/refseq/MANE/MANE_human/current/ |
| `gnomad_constraint.tsv` | https://storage.googleapis.com/gcp-public-data--gnomad/release/4.1/constraint/gnomad.v4.1.constraint_metrics.tsv |
| `clingen_dosage_genes.tsv` | https://ftp.clinicalgenome.org/ClinGen_gene_curation_list_GRCh38.tsv |
| `clingen_dosage_regions.tsv` | https://ftp.clinicalgenome.org/ClinGen_region_curation_list_GRCh38.tsv |
| `clingen_dosage_regions_37.tsv` | https://ftp.clinicalgenome.org/ClinGen_region_curation_list_GRCh37.tsv |
| `clingen_validity.csv` | https://search.clinicalgenome.org/kb/gene-validity/download |
| `pHaplo.tsv.gz` | https://zenodo.org/records/6347673/files/Collins_rCNV_2022.dosage_sensitivity_scores.tsv.gz |
| `g2p_PANEL.csv`, one for each Gene2Phenotype panel wanted (`g2p_DD.csv`, `g2p_Cancer.csv` …) | https://www.ebi.ac.uk/gene2phenotype/api/panel/PANEL/download/ |

For example:

```bash
mkdir -p ~/downloads/genes && cd ~/downloads/genes
curl -L -o hgnc_complete_set.txt https://storage.googleapis.com/public-download-files/hgnc/tsv/tsv/hgnc_complete_set.txt
curl -L -o gnomad_constraint.tsv https://storage.googleapis.com/gcp-public-data--gnomad/release/4.1/constraint/gnomad.v4.1.constraint_metrics.tsv
curl -L -o clingen_dosage_genes.tsv https://ftp.clinicalgenome.org/ClinGen_gene_curation_list_GRCh38.tsv
curl -L -o clingen_dosage_regions.tsv https://ftp.clinicalgenome.org/ClinGen_region_curation_list_GRCh38.tsv
curl -L -o clingen_dosage_regions_37.tsv https://ftp.clinicalgenome.org/ClinGen_region_curation_list_GRCh37.tsv
curl -L -o clingen_validity.csv https://search.clinicalgenome.org/kb/gene-validity/download
curl -L -o pHaplo.tsv.gz https://zenodo.org/records/6347673/files/Collins_rCNV_2022.dosage_sensitivity_scores.tsv.gz
for p in Cancer Cardiac DD Ear Eye Skeletal Skin; do
  curl -L -o g2p_$p.csv https://www.ebi.ac.uk/gene2phenotype/api/panel/$p/download/
done
# and the MANE summary from the NCBI folder above, e.g. MANE.GRCh38.v1.5.summary.txt.gz
cd -
python3 build/make_genes.py ~/downloads/genes
```

It writes `data/genes/genes.json` (about 6 MB) and prints the numbers of
genes, of genes with constraint, ClinGen validity and Gene2Phenotype records,
and of ClinGen regions. The sources, their versions and licences go into the
file's `meta`, which the site's *Sources and licences* page shows.

The genes are every protein-coding gene approved by HGNC, and any other gene
that ClinGen, Gene2Phenotype or the HPO's annotations name. Constraint is the
MANE Select transcript's (the canonical transcript's when there is none);
positions are the MANE Select transcript's on GRCh38.

## Then

```bash
npm test                 # the site's tests
python3 serve.py         # and look: a gene page, a CNV, a patient's phenotypes
```

and commit `data/hpo/` and `data/genes/`. Variants already classified keep
their annotations; the new data are used the next time a page needs them.

## The logo: `make_logo.py`

The home page's logo (`assets/img/logo.svg`) is the site's small mark
(`assets/img/mark.svg`, also its favicon) drawn larger and in more detail: a
double helix above the five classes of the ACMG/AMP scale, with the pointer
on likely pathogenic. The script draws it, so the shapes and colours can be
changed in one place:

```bash
python3 build/make_logo.py
```
