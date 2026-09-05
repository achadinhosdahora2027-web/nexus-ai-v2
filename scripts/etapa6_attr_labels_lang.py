#!/usr/bin/env python3
"""Rótulos das atrações no idioma da PÁGINA (pt / fr / it) e no idioma NATIVO do país
(quando o alfabeto não é latino). Usa só `rdfs:label` real do Wikidata; nada é traduzido
nem inventado. Idempotente: reler o arquivo e pular (qid,lang) já coletados.

  python3 bin/attr_labels_lang.py            # todas as línguas necessárias
  python3 bin/attr_labels_lang.py --langs pt # só um subconjunto
"""
import argparse, collections, importlib.util, json, os, sys, urllib.parse

WORK = '/home/user/work'
DATA = f'{WORK}/data'
OUT = f'{DATA}/attr_labels.jsonl'
NON_LATIN = {'ja', 'zh', 'ko', 'ar', 'ru', 'th', 'hi', 'bn', 'he', 'el', 'uk', 'fa', 'ur', 'ta',
             'mr', 'gu', 'kn', 'ml', 'pa', 'si', 'my', 'km', 'lo', 'ne', 'am', 'ka', 'hy', 'be',
             'bg', 'kk', 'ky', 'mn', 'mk', 'sr', 'tt'}


def load(name, path):
    sp = importlib.util.spec_from_file_location(name, path)
    m = importlib.util.module_from_spec(sp)
    sp.loader.exec_module(m)
    return m


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--langs', default='')
    ap.add_argument('--top', type=int, default=8)
    a = ap.parse_args()
    H = load('harvest2', f'{WORK}/bin/harvest2.py')
    cities = [json.loads(l) for l in open(f'{DATA}/cities.jsonl', encoding='utf-8')]
    att = {}
    for l in open(f'{DATA}/attractions.jsonl', encoding='utf-8'):
        r = json.loads(l)
        att[r['ckey']] = r.get('items', [])
    clangs = json.load(open(f'{WORK}/out/country_langs.json'))
    codes = json.load(open(f'{WORK}/out/lang_codes.json'))
    countries = json.load(open(f'{WORK}/out/countries.json'))

    want = collections.defaultdict(set)   # lang -> {qid}
    for c in cities:
        items = att.get(c['ckey']) or []
        if len(items) < 3:
            continue
        qids = [i['a'] for i in items[:a.top]]
        langs = set(['pt'])
        if c.get('lang', '').startswith('fr'):
            langs.add('fr')
        if c.get('lang', '').startswith('it'):
            langs.add('it')
        nat = (clangs.get(c['cc'].upper(), {}).get('langs') or [])
        for lg in nat:
            if lg in NON_LATIN:
                langs.add(lg)
        for lg in langs:
            want[lg].update(qids)
    if a.langs:
        keep = set(a.langs.split(','))
        want = collections.defaultdict(set, {k: v for k, v in want.items() if k in keep})
    print('a coletar por idioma:', {k: len(v) for k, v in sorted(want.items())}, flush=True)

    have = collections.defaultdict(set)
    if os.path.exists(OUT):
        for l in open(OUT, encoding='utf-8'):
            try:
                r = json.loads(l)
                have[r['lang']].add(r['qid'])
            except Exception:
                pass
    out = open(OUT, 'a', encoding='utf-8')
    total = 0
    for lang, qs in sorted(want.items(), key=lambda kv: -len(kv[1])):
        need = [q for q in sorted(qs) if q not in have.get(lang, set())]
        if not need:
            continue
        for i in range(0, len(need), 50):
            batch = need[i:i + 50]
            params = urllib.parse.urlencode({'action': 'wbgetentities', 'ids': '|'.join(batch),
                                             'props': 'labels', 'languages': lang, 'format': 'json'})
            try:
                j = H.http_json(f'{H.API}?{params}', tries=4)
            except Exception as e:
                print('  [!]', lang, str(e)[:70], flush=True)
                continue
            for qid, ent in (j.get('entities') or {}).items():
                lab = (ent.get('labels') or {}).get(lang, {}).get('value')
                if lab:
                    out.write(json.dumps({'qid': qid, 'lang': lang, 'label': lab}, ensure_ascii=False) + '\n')
                    total += 1
            out.flush()
            if (i // 50) % 20 == 0:
                print(f'  [{lang}] {i+len(batch)}/{len(need)}', flush=True)
        print(f'[{lang}] concluído ({len(need)} pedidos)', flush=True)
    out.close()
    print('linhas novas:', total, flush=True)


if __name__ == '__main__':
    main()
