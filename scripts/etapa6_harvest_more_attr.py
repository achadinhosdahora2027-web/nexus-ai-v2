#!/usr/bin/env python3
"""Amplia a coleta de atrações para as cidades que ficaram com <3 itens, relaxando o
critério de sitelinks (10 -> 3) e aceitando netos diretos. Grava NO MESMO cache
(data/attractions.jsonl, append: para o mesmo ckey vale a última linha lida).

  python3 bin/harvest_more_attr.py            # roda a fase inteira
  python3 bin/harvest_more_attr.py --dry      # só diz quantas cidades entrariam
"""
import importlib.util, json, os, sys, urllib.parse

WORK = '/home/user/work'
DATA = f'{WORK}/data'
MIN_SL = 3
MIN_HAS = 3


def load(name, path):
    sp = importlib.util.spec_from_file_location(name, path)
    m = importlib.util.module_from_spec(sp)
    sp.loader.exec_module(m)
    return m


def main():
    H = load('harvest2', f'{WORK}/bin/harvest2.py')
    cities = [json.loads(l) for l in open(f'{DATA}/cities.jsonl', encoding='utf-8')]
    qids = {}
    for l in open(f'{DATA}/qids.jsonl', encoding='utf-8'):
        r = json.loads(l)
        qids[r['ckey']] = r
    have = {}
    p = f'{DATA}/attractions.jsonl'
    if os.path.exists(p):
        for l in open(p, encoding='utf-8'):
            r = json.loads(l)
            have[r['ckey']] = len(r.get('items', []))
    todo = [c for c in cities if (qids.get(c['ckey']) or {}).get('qid') and have.get(c['ckey'], 0) < MIN_HAS]
    print(f'[ampliar] cidades com <{MIN_HAS} atrações e QID resolvido: {len(todo)}', flush=True)
    if '--dry' in sys.argv:
        return
    out = open(p, 'a', encoding='utf-8')
    per = 30
    batches = [todo[i:i + per] for i in range(0, len(todo), per)]
    gained = 0
    for bi, batch in enumerate(batches):
        vals = ' '.join(f'wd:{qids[c["ckey"]]["qid"]}' for c in batch)
        q = f"""
SELECT ?city ?a ?aLabEn ?coord ?sl ?typeLab WHERE {{
  VALUES ?city {{ {vals} }}
  {{ ?a wdt:P131 ?city }} UNION {{ ?x wdt:P131 ?city . ?a wdt:P131 ?x }}
  ?a wdt:P31 ?t ; wikibase:sitelinks ?sl .
  FILTER(?sl >= {MIN_SL})
  SERVICE wikibase:label {{ bd:serviceParam wikibase:language "en,de,fr,es,it,pt,ja,zh,ru,ar". ?a rdfs:label ?aLabEn . ?t rdfs:label ?typeLab }}
  OPTIONAL {{ ?a wdt:P625 ?coord }}
}} ORDER BY ?city DESC(?sl) LIMIT 9000"""
        by = {}
        try:
            j = H.http_json(f'{H.SPARQL}?{urllib.parse.urlencode({"query": q, "format": "json"})}')
            rows = j['results']['bindings']
        except Exception as e:
            print(f'  [!] lote {bi+1}: {str(e)[:90]}', flush=True)
            continue
        for b in rows:
            city = b['city']['value'].rsplit('/', 1)[-1]
            ckey = next((c['ckey'] for c in batch if qids[c['ckey']]['qid'] == city), None)
            if not ckey:
                continue
            a = b['a']['value'].rsplit('/', 1)[-1]
            lab = (b.get('aLabEn') or {}).get('value', '')
            typ = (b.get('typeLab') or {}).get('value', '')
            if H.BAD_TYPE.search(typ) or H.BAD_TYPE.search(lab):
                continue
            if not (H.KEEP_TYPE.search(typ) or H.KEEP_TYPE.search(lab)):
                continue
            it = {'a': a, 'en': lab, 'sl': int(b['sl']['value']), 'type': typ,
                  'coord': (b.get('coord') or {}).get('value', '')}
            if a not in [x['a'] for x in by.get(ckey, [])]:
                by.setdefault(ckey, []).append(it)
        for c in batch:
            novos = by.get(c['ckey'], [])[:40]
            if len(novos) > have.get(c['ckey'], 0):
                out.write(json.dumps({'ckey': c['ckey'], 'items': novos}, ensure_ascii=False) + '\n')
                gained += 1
        out.flush()
        print(f'  [ampliar] lote {bi+1}/{len(batches)} (novos registros: {gained})', flush=True)
    out.close()
    print(f'[ampliar] cidades ampliadas: {gained}', flush=True)


if __name__ == '__main__':
    main()
