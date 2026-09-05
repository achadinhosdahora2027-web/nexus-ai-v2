#!/usr/bin/env python3
"""Complemento da coleta: cidades cuja página de cidade NÃO segue o padrão de título
'Passagens para X, Y 2026' (52 guias em italiano do aquitem + Lyon em francês), que o
harvest2 deixou de fora. Reaproveita os resolveadores do harvest2 e grava nos mesmos caches.

Rode DEPOIS de o harvest2 terminar (os ficheiros são abertos em append).
"""
import importlib.util, json, os, sys, glob, re

sys.path.insert(0, '/home/user/work/bin')
WORK = '/home/user/work'
DATA = f'{WORK}/data'
REPOS = {'solvegrid': f'{WORK}/repos/solvegrid/public', 'nexus': f'{WORK}/repos/nexus-ai-v2/public',
         'aquitem': f'{WORK}/repos/aquitemachadinhos/public'}


def load(name, path):
    sp = importlib.util.spec_from_file_location(name, path)
    m = importlib.util.module_from_spec(sp)
    sp.loader.exec_module(m)
    return m


def main():
    H = load('harvest2', f'{WORK}/bin/harvest2.py')
    S2 = load('s2', f'{WORK}/bin/stage2_attractions.py')
    known = set()
    if os.path.exists(f'{DATA}/cities.jsonl'):
        for l in open(f'{DATA}/cities.jsonl', encoding='utf-8'):
            try:
                known.add(json.loads(l)['ckey'])
            except Exception:
                pass
    print(f'[extra] ckeys já coletados: {len(known)}', flush=True)
    extras = {}
    for site, root in REPOS.items():
        for fp in sorted(glob.glob(root + '/[a-z][a-z]/*.html')):
            pi = S2.parse_city_page(fp)
            if not pi or pi['ckey'] in known:
                continue
            extras[pi['ckey']] = {'cc': pi['cc'], 'slug': pi['slug'], 'city': pi['city'],
                                  'country': pi['country'], 'region': pi['region'], 'lang': pi['lang'],
                                  'sites': [site], 'ckey': pi['ckey']}
    print(f'[extra] cidades novas: {len(extras)}', flush=True)
    if not extras:
        return
    with open(f'{DATA}/cities.jsonl', 'a', encoding='utf-8') as f:
        for r in extras.values():
            f.write(json.dumps(r, ensure_ascii=False) + '\n')
    countries = json.load(open(f'{WORK}/out/countries.json'))
    cities = list(extras.values())
    H.resolve_qids(cities, countries)
    qids = H.load_cache(f'{DATA}/qids.jsonl', 'ckey')
    H.harvest_attractions(cities, qids)
    ok = sum(1 for c in cities if (qids.get(c['ckey']) or {}).get('qid'))
    print(f'[extra] resolvidas: {ok}/{len(cities)}', flush=True)


if __name__ == '__main__':
    main()
