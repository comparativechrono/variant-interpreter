#!/usr/bin/env python3
"""Make the site's compact copies of the Human Phenotype Ontology (HPO) and
its annotations, from the files of an HPO release.

usage:  python3 build/make_hpo.py FOLDER
        FOLDER holds hp.json, phenotype.hpoa and genes_to_disease.txt from
        https://github.com/obophenotype/human-phenotype-ontology/releases

writes  data/hpo/terms.json     every current term: id, name, synonyms,
                                parents (is_a), definition, and the ids it
                                replaces (alt_id)
        data/hpo/diseases.json  each disease of phenotype.hpoa (OMIM,
                                ORPHA, DECIPHER ids): its name, its genes
                                (genes_to_disease.txt) and its phenotype
                                terms with their frequencies, and the
                                information content of every term

The terms and names are the HPO's own, unchanged: the files are only
smaller, so that the site can search and compare phenotypes in the
browser. The HPO's terms of use ask that the version be shown, which the
site does (meta.version in each file)."""
import json
import math
import os
import re
import sys
from collections import defaultdict

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, '..', 'data', 'hpo')


def hp_id(iri):
    m = re.search(r'HP_(\d{7})$', iri)
    return 'HP:' + m.group(1) if m else None


def main(folder):
    os.makedirs(OUT, exist_ok=True)
    g = json.load(open(os.path.join(folder, 'hp.json'), encoding='utf-8'))['graphs'][0]
    version = g.get('meta', {}).get('version', '')
    m = re.search(r'releases/(\d{4}-\d{2}-\d{2})/', version)
    release = m.group(1) if m else version

    terms = {}
    alt = {}
    for n in g['nodes']:
        tid = hp_id(n.get('id', ''))
        if not tid or n.get('type') != 'CLASS':
            continue
        meta = n.get('meta', {}) or {}
        if meta.get('deprecated'):
            continue
        syns = []
        for s in meta.get('synonyms', []) or []:
            v = (s.get('val') or '').strip()
            if v and v.lower() != (n.get('lbl') or '').lower() and v not in syns:
                syns.append(v)
        alts = [b['val'] for b in meta.get('basicPropertyValues', []) or []
                if b.get('pred', '').endswith('hasAlternativeId') and str(b.get('val', '')).startswith('HP:')]
        for a in alts:
            alt[a] = tid
        terms[tid] = {
            'name': n.get('lbl') or tid,
            'syn': syns,
            'def': ((meta.get('definition') or {}).get('val') or '').strip(),
            'parents': [],
        }
    for e in g['edges']:
        if e.get('pred') != 'is_a':
            continue
        a, b = hp_id(e['sub']), hp_id(e['obj'])
        if a in terms and b in terms and b not in terms[a]['parents']:
            terms[a]['parents'].append(b)

    # ancestors, for the branch of each term and for information content
    anc_cache = {}

    def ancestors(t):
        if t in anc_cache:
            return anc_cache[t]
        out = {t}
        for p in terms[t]['parents']:
            out |= ancestors(p)
        anc_cache[t] = out
        return out

    sys.setrecursionlimit(10000)
    for t in terms:
        ancestors(t)

    # ---------------- diseases ----------------
    diseases = {}
    for line in open(os.path.join(folder, 'phenotype.hpoa'), encoding='utf-8'):
        if line.startswith('#') or line.startswith('database_id'):
            continue
        f = line.rstrip('\n').split('\t')
        if len(f) < 11:
            continue
        did, name, qual, hpo, ref, ev, onset, freq, sex, mod, aspect = f[:11]
        hpo = alt.get(hpo, hpo)
        if hpo not in terms:
            continue
        d = diseases.setdefault(did, {'name': name, 'pheno': {}, 'inh': [], 'onset': [], 'genes': []})
        if aspect == 'P':
            if qual == 'NOT':
                continue
            d['pheno'][hpo] = freq_value(freq) if freq else None
        elif aspect == 'I':
            if hpo not in d['inh']:
                d['inh'].append(hpo)
        elif aspect == 'C':
            if hpo not in d['onset']:
                d['onset'].append(hpo)
    for line in open(os.path.join(folder, 'genes_to_disease.txt'), encoding='utf-8'):
        if line.startswith('ncbi_gene_id'):
            continue
        f = line.rstrip('\n').split('\t')
        if len(f) < 4:
            continue
        sym, assoc, did = f[1], f[2], f[3]
        if did in diseases and assoc in ('MENDELIAN', 'POLYGENIC') and sym not in diseases[did]['genes']:
            diseases[did]['genes'].append(sym)

    # information content of each term: -log(fraction of diseases annotated with it or a descendant)
    count = defaultdict(int)
    for d in diseases.values():
        seen = set()
        for t in d['pheno']:
            seen |= anc_cache[t]
        for t in seen:
            count[t] += 1
    nd = max(1, sum(1 for d in diseases.values() if d['pheno']))
    ic = {t: round(-math.log((count[t] if count[t] else 0.5) / nd), 3) for t in terms}

    # ---------------- write ----------------
    ids = sorted(terms)
    tout = {
        'meta': {
            'source': 'Human Phenotype Ontology (https://hpo.jax.org)',
            'version': release,
            'licence': 'The HPO terms of use: https://hpo.jax.org/license',
            'made_by': 'build/make_hpo.py',
            'fields': ['id (the number of HP:nnnnnnn)', 'name', 'synonyms', 'parents (is_a)', 'definition'],
        },
        'terms': [[num(t), terms[t]['name'], terms[t]['syn'], [num(x) for x in terms[t]['parents']], terms[t]['def']] for t in ids],
        'alt': {num(a): num(b) for a, b in alt.items()},
    }
    with open(os.path.join(OUT, 'terms.json'), 'w', encoding='utf-8') as fh:
        json.dump(tout, fh, ensure_ascii=False, separators=(',', ':'))

    dout = {
        'meta': {
            'source': 'HPO annotations (phenotype.hpoa, genes_to_disease.txt), https://hpo.jax.org',
            'version': release,
            'licence': 'The HPO terms of use: https://hpo.jax.org/license; disease names as the HPO annotations give them',
            'made_by': 'build/make_hpo.py',
            'fields': ['id', 'name', 'genes', 'phenotypes: term, frequency in % (-1 when not given), term, ...', 'inheritance terms', 'onset terms'],
            'diseases_with_phenotypes': nd,
        },
        'diseases': [[did, d['name'], d['genes'], flat(d['pheno']), [num(x) for x in d['inh']], [num(x) for x in d['onset']]]
                     for did, d in sorted(diseases.items()) if d['pheno']],
        'ic': {num(t): v for t, v in ic.items() if count[t]},
        'ic_unseen': round(-math.log(0.5 / nd), 3),
    }
    with open(os.path.join(OUT, 'diseases.json'), 'w', encoding='utf-8') as fh:
        json.dump(dout, fh, ensure_ascii=False, separators=(',', ':'))
    print(f'HPO {release}: {len(terms)} terms, {len(alt)} alternative ids; {len(dout["diseases"])} diseases')
    for f in ('terms.json', 'diseases.json'):
        print(f, os.path.getsize(os.path.join(OUT, f)) // 1024, 'KB')


def num(t):
    return int(t[3:])


def flat(pheno):
    out = []
    for t, v in pheno.items():
        out += [num(t), -1 if v is None else round(v * 100)]
    return out


FREQ = {
    'HP:0040280': 1.0,    # Obligate (100%)
    'HP:0040281': 0.9,    # Very frequent (80-99%)
    'HP:0040282': 0.55,   # Frequent (30-79%)
    'HP:0040283': 0.17,   # Occasional (5-29%)
    'HP:0040284': 0.025,  # Very rare (1-4%)
    'HP:0040285': 0.0,    # Excluded (0%)
}


def freq_value(s):
    """the HPO's frequencies as one number: an HPO frequency term, n/m, or a percentage"""
    s = s.strip()
    if s in FREQ:
        return FREQ[s]
    m = re.match(r'^(\d+)/(\d+)$', s)
    if m and int(m.group(2)):
        return round(int(m.group(1)) / int(m.group(2)), 3)
    m = re.match(r'^([\d.]+)%$', s)
    if m:
        return round(float(m.group(1)) / 100, 3)
    return None


if __name__ == '__main__':
    if len(sys.argv) != 2:
        sys.exit(__doc__)
    main(sys.argv[1])
