#!/usr/bin/env python3
"""E7.1b — rótulos dos QIDs referenciados (vizinhos, distritos, cidades-irmãs, países,
moeda, idiomas, instituições, setores), para o painel conseguir escrever no idioma da página.

Só lê Wikidata em lote (50 QIDs por chamada, 1,2 s de intervalo, retomável). Não cria nada:
se um QID não tem rótulo no idioma, o gerador cai para o inglês e, sem inglês, omite o item.

Saída: data/labels7.jsonl  -> {"qid": "Q174", "lab": {"pt": "...", "en": "...", ...}}
Uso: python3 bin/labels7.py [--langs pt,pt-br,en,fr,it,es,de]
"""
import argparse
import json
import re
import threading
from concurrent.futures import ThreadPoolExecutor
import os
import time
import urllib.error
import urllib.parse
import urllib.request

WORK = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
D = f'{WORK}/data'
OUT = f'{D}/labels7.jsonl'
UA = {'User-Agent': 'etapa7-labels/1.0 (painel de cidades; dados abertos)'}
def e_qid(x):
    """QID de verdade: 'QA' (código da Qatar) e 'Québec' (rótulo) começavam com Q e
    iam para a URL — non-ASCII na query derrubava o processo inteiro (InvalidURL)."""
    return isinstance(x, str) and bool(re.fullmatch(r'Q\d+', x))


DE_FACHADA = ['P17', 'P131', 'P47', 'P150', 'P190', 'P37', 'P42', 'P138', 'P31', 'P1376', 'P361',
              'P463', 'P1343']
DE_PAIS = ['P36', 'P38', 'P30', 'P37', 'P42', 'P1448', 'P297', 'P300', 'P474', 'P1622', 'P2886',
           'P530', 'P547', 'P190']
DE_ENT = ['q', 'P452', 'P127', 'P118', 'P1619', 'P636', 'P1435', 'P198', 'P162']


def qids_exibidos(n_por_classe=8):
    """Só os QIDs que o painel pode chegar a mostrar (top N por grupo por cidade).

    Colher rótulo dos ~300 mil itens que o Wikidata devolve por planeta é desperdício: o
    gerador mostra 4 por grupo. Este filtro mantém o cache de rótulos do tamanho do que é lido.
    """
    alvos = set()
    ep = f'{D}/entidades.jsonl'
    if not os.path.exists(ep):
        return alvos
    for ln in open(ep, encoding='utf-8'):
        try:
            d = json.loads(ln)
        except json.JSONDecodeError:
            continue
        for _, lst in (d.get('grupos') or {}).items():
            for it in lst[:n_por_classe]:
                for k in DE_ENT:
                    x = it.get(k)
                    if isinstance(x, str) and x.startswith('Q'):
                        alvos.add(x)
                if e_qid(it.get('q')):
                    alvos.add(it['q'])
    return alvos


def qids_referenciados():
    alvos = set()
    for fn, campos in (('fachada.jsonl', DE_FACHADA), ('fachada_paises.jsonl', DE_PAIS)):
        p = f'{D}/{fn}'
        if not os.path.exists(p):
            continue
        for ln in open(p, encoding='utf-8'):
            try:
                d = json.loads(ln)
            except json.JSONDecodeError:
                continue
            for cp in campos:
                for v in d.get(cp, []):
                    x = v.get('v') if isinstance(v, dict) else v
                    if e_qid(x):
                        alvos.add(x)
    ep = f'{D}/entidades.jsonl'
    if os.path.exists(ep):
        for ln in open(ep, encoding='utf-8'):
            try:
                d = json.loads(ln)
            except json.JSONDecodeError:
                continue
            for _, lst in (d.get('grupos') or {}).items():
                for it in lst:
                    for k in DE_ENT:
                        if e_qid(it.get(k)):
                            alvos.add(it[k])
    qp = f'{D}/qids.jsonl'
    if os.path.exists(qp):
        for ln in open(qp, encoding='utf-8'):
            if not ln.strip():
                continue
            try:
                qq = json.loads(ln).get('qid')
            except json.JSONDecodeError:
                continue
            if e_qid(qq):
                alvos.add(qq)
    return sorted(alvos)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--langs', default='pt,pt-br,en,fr,it,es,de,ru,zh,ja,ar,hi')
    ap.add_argument('--paralelo', type=int, default=1)
    ap.add_argument('--descanso', type=float, default=1.2)
    ap.add_argument('--so', default='', choices=['', 'inst'],
                    help="inst = só os QIDs exibíveis do painel de instituições (cache menor)")
    a = ap.parse_args()
    langs = a.langs.split(',')
    tem = set()
    if os.path.exists(OUT):
        for ln in open(OUT, encoding='utf-8'):
            try:
                tem.add(json.loads(ln)['qid'])
            except Exception:                                            # noqa: BLE001
                pass
    base = qids_exibidos() if a.so == 'inst' else set(qids_referenciados())
    alvos = [q for q in sorted(base) if q not in tem]
    print(f'{len(alvos)} QIDs para rotular ({len(tem)} no cache)', flush=True)
    fh = open(OUT, 'a', encoding='utf-8')
    trava = threading.Lock()
    prog = {'feitos': 0, 'guardados': 0}

    def um_lote(i):
        ch = alvos[i:i + 50]
        url = (f'https://www.wikidata.org/w/api.php?action=wbgetentities&format=json'
               f'&props=labels&languages={"|".join(langs)}&ids={"|".join(ch)}')
        r = {}
        for n in range(5):
            try:
                r = json.loads(urllib.request.urlopen(urllib.request.Request(url, headers=UA),
                                                      timeout=90).read().decode())
                if not (r.get('entities') or {}):
                    raise ValueError('resposta sem entities')
                break
            except urllib.error.HTTPError as e:
                if e.code in (429, 503, 500, 502) and n < 4:
                    ra = (e.headers.get('Retry-After') if e.headers else '') or ''
                    time.sleep(float(ra) if ra.isdigit() else 5 * (n + 1) ** 2)
                    continue
                print(f'  lote {i//50+1}: HTTP {e.code} (fica para a próxima passada)', flush=True)
                break
            except Exception as e:                                        # noqa: BLE001
                # antes só HTTPError era tratada: um lote ruim derrubava a corrida inteira
                print(f'  lote {i//50+1}: {type(e).__name__} {str(e)[:70]} (re-tento na próxima)',
                      flush=True)
                time.sleep(3 * (n + 1))
        linhas = []
        for q, e in (r.get('entities') or {}).items():
            lab = {k: v['value'] for k, v in (e.get('labels') or {}).items()}
            if lab:
                linhas.append(json.dumps({'qid': q, 'lab': lab}, ensure_ascii=False))
        with trava:      # um escriba por vez; o cache é append-only e retomável
            for ln in linhas:
                fh.write(ln + '\n')
            fh.flush()
            prog['feitos'] += len(ch)
            prog['guardados'] += len(linhas)
            if (prog['feitos'] // 500) != ((prog['feitos'] - len(ch)) // 500):
                print(f'  {prog["feitos"]}/{len(alvos)}  ({prog["guardados"]} gravados)', flush=True)
        if a.descanso:
            time.sleep(a.descanso)

    lotes = list(range(0, len(alvos), 50))
    if a.paralelo > 1:
        with ThreadPoolExecutor(max_workers=a.paralelo) as pool:
            list(pool.map(um_lote, lotes))
    else:
        for i in lotes:
            um_lote(i)
    fh.close()
    print('rótulos ok:', os.path.getsize(OUT) // 1024, 'KB', flush=True)


if __name__ == '__main__':
    main()
