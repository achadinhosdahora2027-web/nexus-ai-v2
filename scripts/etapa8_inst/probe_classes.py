#!/usr/bin/env python3
"""Prova ampliada de classes: as que a amostra de 40 cidades não confirmou merecem uma
segunda chance com mais cidades e mais candidatos — porque amostra pequena dá falso negativo
(uma classe real pode simplesmente não ter entidade naquelas 40 cidades).

Candidatos: rótulos alternativos no `wbsearchentities` + QIDs que a própria consulta de prova
aponta (ex.: 'theatre' devolve a disciplina Q11635, mas o prédio é outro item).
Só entra no cache de classes o candidato que DEVOLVE LINHA — nada de chute.

Uso: python3 bin/probe_classes.py [--cidades 400]
"""
import argparse
import json
import time
import urllib.error
import urllib.parse
import urllib.request

W = '/home/user/work'
D = f'{W}/data'
CLS = f'{D}/etapa7_classes.json'
UA = {'User-Agent': 'aquitemachadinhos-etapa7/2.0 (prova de classes para painel de cidades; '
                    'contato: admin@aquitemachadinhos.com.br)'}
QS = 'https://query.wikidata.org/sparql'
WAPI = 'https://www.wikidata.org/w/api.php'

# o que falta: chave -> rótulos alternativos para buscar (além do óbvio)
FALTANDO = {
    'theatre': ['theatre building', 'theater', 'opera house'],
    'shopping mall': ['shopping centre', 'shopping center', 'mall'],
    'market building': ['market hall', 'marketplace', 'public market'],
    'aquarium': ['public aquarium', 'oceanarium'],
}
LOC = 'P131'


def http(url, timeout=240, tries=4):
    for n in range(tries):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=timeout) as r:
                return r.read()
        except urllib.error.HTTPError as e:
            if e.code in (429, 500, 502, 503, 504) and n < tries - 1:
                time.sleep(min(120, 8 * (n + 1) ** 2))
                continue
            raise
        except Exception:                                                # noqa: BLE001
            if n < tries - 1:
                time.sleep(4 * (n + 1))
                continue
            raise
    raise RuntimeError('falhou')


def sparql(q):
    url = QS + '?' + urllib.parse.urlencode({'query': q, 'format': 'json'})
    return json.loads(http(url).decode('utf-8', 'ignore'))


def busca(lbl):
    u = WAPI + '?' + urllib.parse.urlencode({'action': 'wbsearchentities', 'search': lbl,
                                             'language': 'en', 'type': 'item', 'limit': 8,
                                             'format': 'json'})
    try:
        return [x['id'] for x in json.loads(http(u, timeout=60).decode()).get('search', [])
                if x.get('id', '').startswith('Q')]
    except Exception:                                                    # noqa: BLE001
        return []


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--cidades', type=int, default=400)
    a = ap.parse_args()
    ent = {}
    for ln in open(f'{D}/qids.jsonl', encoding='utf-8'):
        d = json.loads(ln)
        if d.get('qid'):
            ent[d['ckey']] = d['qid']
    todos = sorted(ent.values())
    passo = max(1, len(todos) // a.cidades)
    amostra = todos[::passo][:a.cidades]
    print(f'{len(amostra)} cidades na prova', flush=True)
    cache = json.load(open(CLS, encoding='utf-8')) if __import__('os').path.exists(CLS) else {}
    ganho = 0
    for lbl, alternativos in FALTANDO.items():
        if lbl in cache:
            continue
        cand = []
        for termo in [lbl] + alternativos:
            for q in busca(termo):
                if q not in cand:
                    cand.append(q)
            time.sleep(1.0)
        # rótulo exato primeiro
        try:
            labs = json.loads(http(WAPI + '?' + urllib.parse.urlencode(
                {'action': 'wbgetentities', 'ids': '|'.join(cand[:50]), 'props': 'labels',
                 'languages': 'en', 'format': 'json'}), timeout=90).decode()).get('entities') or {}
        except Exception:                                                # noqa: BLE001
            labs = {}
        def exacto(q):
            v = ((labs.get(q) or {}).get('labels') or {}).get('en') or {}
            return (v.get('value') or '').lower()
        preferidos = sorted(cand, key=lambda q: 0 if exacto(q) in {lbl.lower(), *alternativos} else 1)
        print(f'\n{lbl}: {len(cand)} candidatos ({[f"{q}:{exacto(q)[:18]}" for q in preferidos[:6]]})',
              flush=True)
        for q in preferidos[:10]:
            qry = (f'SELECT (COUNT(*) AS ?n) WHERE {{ VALUES ?city {{ {" ".join("wd:" + x for x in amostra)} }} '
                   f'?x wdt:{LOC} ?city ; wdt:P31 wd:{q} . }}')
            try:
                b = sparql(qry)['results']['bindings']
                n = int(b[0]['n']['value']) if b else 0
            except Exception as e:                                        # noqa: BLE001
                print(f'   {q}: erro {str(e)[:90]}', flush=True)
                continue
            print(f'   {q} ({exacto(q)[:22]!r}): {n} entidades', flush=True)
            time.sleep(1.5)
            if n > 0:
                cache[lbl] = q
                ganho += 1
                print(f'   ✓ {lbl} := {q} ({exacto(q)})', flush=True)
                break
        json.dump(cache, open(CLS, 'w', encoding='utf-8'), indent=1)
    print(f'\nclasses no cache: {len(cache)} (+{ganho})', flush=True)


if __name__ == '__main__':
    main()
