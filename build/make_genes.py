#!/usr/bin/env python3
"""Make the site's table of genes, data/genes/genes.json, from public files.

usage:  python3 build/make_genes.py FOLDER

FOLDER holds (the names the script expects, then where each comes from):
  hgnc_complete_set.txt          https://storage.googleapis.com/public-download-files/hgnc/tsv/tsv/hgnc_complete_set.txt
  MANE.GRCh38.vX.summary.txt.gz  https://ftp.ncbi.nlm.nih.gov/refseq/MANE/MANE_human/current/
  gnomad_constraint.tsv          https://storage.googleapis.com/gcp-public-data--gnomad/release/4.1/constraint/gnomad.v4.1.constraint_metrics.tsv
  clingen_dosage_genes.tsv       https://ftp.clinicalgenome.org/ClinGen_gene_curation_list_GRCh38.tsv
  clingen_dosage_regions.tsv     https://ftp.clinicalgenome.org/ClinGen_region_curation_list_GRCh38.tsv
  clingen_dosage_regions_37.tsv  https://ftp.clinicalgenome.org/ClinGen_region_curation_list_GRCh37.tsv
  clingen_validity.csv           https://search.clinicalgenome.org/kb/gene-validity/download
  pHaplo.tsv.gz                  https://zenodo.org/records/6347673/files/Collins_rCNV_2022.dosage_sensitivity_scores.tsv.gz
  g2p_*.csv                      https://www.ebi.ac.uk/gene2phenotype/api/panel/<PANEL>/download/ (one file per panel)

Genes: every protein-coding gene approved by HGNC, and any other gene that
ClinGen, Gene2Phenotype or the HPO's annotations name (data/hpo/diseases.json
must have been made first, by build/make_hpo.py)."""
import csv
import glob
import gzip
import io
import json
import os
import re
import sys
from datetime import date

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, '..', 'data', 'genes')


def fnum(x, nd=3):
    try:
        v = float(x)
    except (TypeError, ValueError):
        return None
    if v != v:  # NaN
        return None
    return round(v, nd)


def main(folder):
    os.makedirs(OUT, exist_ok=True)
    F = lambda n: os.path.join(folder, n)

    # ---------- HGNC ----------
    genes = {}
    for r in csv.DictReader(open(F('hgnc_complete_set.txt'), encoding='utf-8'), delimiter='\t'):
        if r['status'] != 'Approved':
            continue
        mane = (r.get('mane_select') or '').split('|')
        genes[r['symbol']] = {
            'symbol': r['symbol'], 'hgnc': r['hgnc_id'], 'name': r['name'], 'locus': r['locus_group'],
            'cyto': r['location'], 'ensembl': r['ensembl_gene_id'] or None, 'entrez': r['entrez_id'] or None,
            'omim': (r['omim_id'] or '').split('|')[0] or None,
            'uniprot': (r['uniprot_ids'] or '').split('|')[0] or None,
            'aliases': [a for a in (r['alias_symbol'] or '').split('|') if a],
            'prev': [a for a in (r['prev_symbol'] or '').split('|') if a],
            'maneEnst': next((m for m in mane if m.startswith('ENST')), None),
            'mane': next((m for m in mane if m.startswith('NM_') or m.startswith('NR_')), None),
        }
    by_hgnc = {g['hgnc']: s for s, g in genes.items()}
    by_ens = {g['ensembl']: s for s, g in genes.items() if g['ensembl']}
    alias_of = {}
    for s, g in genes.items():
        for a in g['prev'] + g['aliases']:
            alias_of.setdefault(a, s)

    def find(sym, hgnc=None, ens=None):
        if hgnc and hgnc in by_hgnc:
            return by_hgnc[hgnc]
        if ens and ens.split('.')[0] in by_ens:
            return by_ens[ens.split('.')[0]]
        if sym in genes:
            return sym
        return alias_of.get(sym)

    wanted = {s for s, g in genes.items() if g['locus'] == 'protein-coding gene'}

    # ---------- MANE: transcripts and where each gene is on GRCh38 ----------
    mane_file = sorted(glob.glob(F('MANE.GRCh38.v*.summary.txt.gz')))[-1]
    mane_version = re.search(r'(v[\d.]+)\.summary', mane_file).group(1)
    with gzip.open(mane_file, 'rt', encoding='utf-8') as fh:
        rdr = csv.DictReader(fh, delimiter='\t')
        for r in rdr:
            s = find(r['symbol'], r['HGNC_ID'], r['Ensembl_Gene'])
            if not s:
                continue
            g = genes[s]
            chrom = re.sub(r'^NC_0+(\d+)\..*$', r'\1', r['GRCh38_chr'])
            chrom = {'23': 'X', '24': 'Y'}.get(chrom, chrom)
            if r['MANE_status'] == 'MANE Select':
                g.update({'mane': r['RefSeq_nuc'], 'maneNp': r['RefSeq_prot'], 'maneEnst': r['Ensembl_nuc'], 'maneEnsp': r['Ensembl_prot'],
                          'chrom': chrom, 'start': int(r['chr_start']), 'end': int(r['chr_end']), 'strand': r['chr_strand']})
            else:
                g.setdefault('manePlus', []).append(r['RefSeq_nuc'])

    # ---------- gnomAD v4.1 constraint (the MANE Select transcript's, else the canonical one's) ----------
    best = {}
    for r in csv.DictReader(open(F('gnomad_constraint.tsv'), encoding='utf-8'), delimiter='\t'):
        if not r['transcript'].startswith('ENST'):
            continue
        s = find(r['gene'], None, r['gene_id'])
        if not s:
            continue
        rank = 2 if r['mane_select'] == 'true' else 1 if r['canonical'] == 'true' else 0
        if rank == 0:
            continue
        if s in best and best[s][0] >= rank:
            continue
        best[s] = (rank, r)
    for s, (rank, r) in best.items():
        genes[s].update({
            'pLI': fnum(r['lof.pLI']), 'loeuf': fnum(r['lof.oe_ci.upper']), 'lofOE': fnum(r['lof.oe']),
            'lofObs': int(float(r['lof.obs'])) if r['lof.obs'] not in ('', 'NA') else None, 'lofExp': fnum(r['lof.exp'], 1),
            'loeufDecile': int(r['lof.oe_ci.upper_bin_decile']) if r['lof.oe_ci.upper_bin_decile'] not in ('', 'NA') else None,
            'misZ': fnum(r['mis.z_score']), 'misOE': fnum(r['mis.oe']), 'misOEupper': fnum(r['mis.oe_ci.upper']),
            'misObs': int(float(r['mis.obs'])) if r['mis.obs'] not in ('', 'NA') else None, 'misExp': fnum(r['mis.exp'], 1),
            'synZ': fnum(r['syn.z_score']), 'constraintFlags': r['constraint_flags'] if r['constraint_flags'] not in ('', '[]', 'NA') else None,
        })

    # ---------- ClinGen dosage sensitivity ----------
    def rows_after_hash(path):
        lines = [l for l in open(path, encoding='utf-8')]
        head_i = max(i for i, l in enumerate(lines) if l.startswith('#'))
        header = lines[head_i].lstrip('#').rstrip('\n').split('\t')
        for l in lines[head_i + 1:]:
            f = l.rstrip('\n').split('\t')
            yield dict(zip(header, f))
    def score(x):
        x = (x or '').strip()
        return int(x) if re.match(r'^\d+$', x) else None
    for r in rows_after_hash(F('clingen_dosage_genes.tsv')):
        s = find(r['Gene Symbol'])
        if not s:
            continue
        genes[s].update({'hi': score(r.get('Haploinsufficiency Score')), 'ts': score(r.get('Triplosensitivity Score')),
                         'dosageDate': (r.get('Date Last Evaluated') or '')[:10] or None,
                         'hiDisease': r.get('Haploinsufficiency Disease ID') or None, 'tsDisease': r.get('Triplosensitivity Disease ID') or None})
        wanted.add(s)
    regions = []
    reg37 = {}
    for r in rows_after_hash(F('clingen_dosage_regions_37.tsv')):
        reg37[r.get('ISCA ID')] = r.get('Genomic Location')
    for r in rows_after_hash(F('clingen_dosage_regions.tsv')):
        loc = r.get('Genomic Location') or ''
        m = re.match(r'chr(\w+):(\d+)-(\d+)', loc.replace(' ', ''))
        m37 = re.match(r'chr(\w+):(\d+)-(\d+)', (reg37.get(r.get('ISCA ID')) or '').replace(' ', ''))
        regions.append([r.get('ISCA ID'), r.get('ISCA Region Name'), r.get('cytoBand'),
                        m.group(1) if m else None, int(m.group(2)) if m else None, int(m.group(3)) if m else None,
                        int(m37.group(2)) if m37 else None, int(m37.group(3)) if m37 else None,
                        score(r.get('Haploinsufficiency Score')), score(r.get('Triplosensitivity Score')),
                        (r.get('Date Last Evaluated') or '')[:10]])

    # ---------- ClinGen gene–disease validity ----------
    validity = {}
    raw = open(F('clingen_validity.csv'), encoding='utf-8').read().splitlines()
    head_i = next(i for i, l in enumerate(raw) if l.startswith('"GENE SYMBOL"'))
    rdr = csv.reader(raw[head_i:])
    header = next(rdr)
    for f in rdr:
        if not f or f[0].startswith('+'):
            continue
        r = dict(zip(header, f))
        s = find(r['GENE SYMBOL'], r['GENE ID (HGNC)'])
        if not s:
            continue
        report = r['ONLINE REPORT'].replace('https://search.clinicalgenome.org/kb/gene-validity/', '')
        validity.setdefault(s, []).append([r['DISEASE LABEL'], r['DISEASE ID (MONDO)'], r['MOI'], r['CLASSIFICATION'], r['CLASSIFICATION DATE'][:10], report, r['GCEP']])
        wanted.add(s)

    # ---------- Collins et al. 2022: pHaplo and pTriplo ----------
    with gzip.open(F('pHaplo.tsv.gz'), 'rt', encoding='utf-8') as fh:
        for l in fh:
            if l.startswith('#'):
                continue
            sym, ph, pt = l.rstrip('\n').split('\t')[:3]
            s = find(sym)
            if s:
                genes[s].update({'pHaplo': fnum(ph), 'pTriplo': fnum(pt)})

    # ---------- Gene2Phenotype ----------
    g2p = {}
    for path in sorted(glob.glob(F('g2p_*.csv'))):
        for r in csv.DictReader(open(path, encoding='utf-8')):
            s = find(r['gene symbol'], 'HGNC:' + r['hgnc id'] if r.get('hgnc id') else None)
            if not s:
                continue
            key = r['g2p id']
            lst = g2p.setdefault(s, [])
            if any(x[5] == key for x in lst):
                continue
            lst.append([r['disease name'], r['confidence'], r['allelic requirement'], r['molecular mechanism'], r['panel'],
                        key, r.get('variant consequence', ''), r.get('disease mim') or r.get('disease MONDO') or ''])
            wanted.add(s)

    # ---------- the HPO's genes ----------
    try:
        d = json.load(open(os.path.join(HERE, '..', 'data', 'hpo', 'diseases.json'), encoding='utf-8'))
        for row in d['diseases']:
            for sym in row[2]:
                s = find(sym)
                if s:
                    wanted.add(s)
        hpo_version = d['meta']['version']
    except FileNotFoundError:
        hpo_version = None

    fields = ['symbol', 'hgnc', 'name', 'locus', 'cyto', 'ensembl', 'omim', 'uniprot', 'aliases', 'prev',
              'mane', 'manePlus', 'chrom', 'start', 'end', 'strand',
              'pLI', 'loeuf', 'lofObs', 'lofExp', 'loeufDecile', 'misZ', 'misOE',
              'pHaplo', 'pTriplo', 'hi', 'ts', 'dosageDate', 'hiDisease', 'tsDisease']
    LOCUS = {'protein-coding gene': 'pc', 'non-coding RNA': 'nc', 'pseudogene': 'ps', 'other': 'o'}
    for g in genes.values():
        g['locus'] = LOCUS.get(g['locus'], 'o')
    rows = []
    for s in sorted(wanted):
        g = genes[s]
        rows.append([g.get(f) for f in fields])
    # trim trailing nulls to keep the file small
    for r in rows:
        while r and r[-1] is None:
            r.pop()
    meta = {
        'made': date.today().isoformat(),
        'made_by': 'build/make_genes.py',
        'sources': {
            'HGNC': 'HUGO Gene Nomenclature Committee, complete set (genenames.org), CC0',
            'MANE': 'MANE ' + mane_version + ' (NCBI and EMBL-EBI), public domain',
            'gnomAD': 'gnomAD v4.1 gene constraint (MANE Select transcripts), CC0',
            'ClinGen dosage': 'ClinGen Dosage Sensitivity curations (genes and regions, GRCh38 and GRCh37), CC0',
            'ClinGen validity': 'ClinGen gene–disease validity curations, CC0',
            'Collins 2022': 'pHaplo and pTriplo, Collins et al. (2022) Cell 185:3041 (zenodo.org/records/6347673), CC BY 4.0',
            'G2P': 'Gene2Phenotype (EMBL-EBI), panels ' + ', '.join(os.path.basename(p)[4:-4] for p in sorted(glob.glob(F('g2p_*.csv')))) + ', CC0',
        },
        'hpo_version': hpo_version,
        'genes': len(rows),
    }
    out = {'meta': meta, 'fields': fields, 'genes': rows, 'validity': validity, 'g2p': g2p, 'regions': regions,
           'region_fields': ['id', 'name', 'cytoband', 'chrom', 'start38', 'end38', 'start37', 'end37', 'hi', 'ts', 'date']}
    with open(os.path.join(OUT, 'genes.json'), 'w', encoding='utf-8') as fh:
        json.dump(out, fh, ensure_ascii=False, separators=(',', ':'))
    print(f"{len(rows)} genes ({sum(1 for r in rows if len(r) > 17 and r[17] is not None)} with constraint), "
          f"{len(validity)} with ClinGen validity, {len(g2p)} with G2P, {len(regions)} ClinGen regions; "
          f"{os.path.getsize(os.path.join(OUT, 'genes.json')) // 1024} KB")


if __name__ == '__main__':
    if len(sys.argv) != 2:
        sys.exit(__doc__)
    main(sys.argv[1])
