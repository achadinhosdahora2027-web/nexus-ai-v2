#!/usr/bin/env python3
"""E7.3/E7.5 — ENTIDADES DA CIDADE: o que realmente existe lá (nomes, endereços, sites).

Duas fontes, ambas comprováveis e baratas em lote:

1. **Wikidata Query Service** com `VALUES ?city {…}` — uma consulta resolve até 200 cidades de uma
   vez (por isso dá para cobrir o planeta: ~15 lotes por classe, e não 3.047×18).
2. **OurAirports** (domínio público) — 12 MB num arquivo, guardados para o painel de mobilidade.

Resolução de classe (o que estava quebrado antes): em vez de chutar QID ou exigir um `P31`
específico da classe (o teste antigo só passaria para instituição acadêmica, e engolia o erro do
QS — daí “0 classes resolvidas”), cada rótulo é resolvido assim:
  a) `wbsearchentities` traz candidatos;  b) `wbgetentities` confirma que o **rótulo en é exatamente
  o rótulo** (sem isso, "market" casava com Q37654, o sentido econômico, não o lugar físico);
  c) uma **consulta de prova** em 40 cidades-amostra exige que `?x wdt:P131 ?city ; wdt:P31 wd:C`
  devolva linha — só entra no cache a classe que *produce dado nas nossas cidades*.
Erros do QS são impressos com um trecho do corpo (antes viravam “não resolvida” em silêncio).

Saída: `data/entidades.jsonl` (1 linha por ckey). Retomável por dois níveis: o cache de classes
(`data/etapa7_classes.json`) e o acúmulo por classe (`data/entidades.parcial.jsonl`), que é
gravado a cada lote — se o processo morrer no meio, nada se perde.
Uso: python3 bin/harvest_entidades.py [--limit-cidades N] [--so aeroportos|classes|mesclar]
"""
import argparse
import csv
import re
import io
import json
import os
import time
import urllib.error
import urllib.parse
import urllib.request

WORK = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
D = f'{WORK}/data'
CLS_CACHE = f'{D}/etapa7_classes.json'
ENT = f'{D}/entidades.jsonl'
PARC = f'{D}/entidades.parcial.jsonl'
AERO = f'{D}/etapa7_aeroportos.json'
UA = {'User-Agent': 'aquitemachadinhos-etapa7/2.0 (painel operacional de cidades; dados abertos; '
                    'contato: admin@aquitemachadinhos.com.br)'}
QS = 'https://query.wikidata.org/sparql'
WAPI = 'https://www.wikidata.org/w/api.php'

# classe -> (rótulo EN para resolver, propriedade de localização, campos extras)
CLASSES = {
    'universidade': ('university', 'P131', ['P856', 'P571', 'P1128', 'P2131']),
    'escola': ('school', 'P131', ['P856']),
    'museu': ('museum', 'P131', ['P856', 'P571', 'P1435']),
    'biblioteca': ('library', 'P131', ['P856']),
    'estadio': ('stadium', 'P131', ['P856', 'P571', 'P118']),
    'teatro': ('theatre', 'P131', ['P571', 'P856']),
    'hospital': ('hospital', 'P131', ['P856', 'P571', 'P636']),
    'estacao_trem': ('railway station', 'P131', ['P856', 'P571', 'P1619']),
    'rodoviaria': ('bus station', 'P131', ['P571', 'P856']),
    'metro': ('rapid transit', 'P131', ['P127', 'P571', 'P856', 'P2994', 'P198']),
    'empresa': ('company', 'P159', ['P1128', 'P452', 'P856', 'P571']),   # sede
    'zoo': ('zoo', 'P131', ['P856', 'P571']),
    'aqua': ('aquarium', 'P131', ['P856']),
    'shopping': ('shopping mall', 'P131', ['P856', 'P571', 'P2048']),
    'mercado': ('market building', 'P131', ['P571', 'P856']),
    'park': ('urban park', 'P131', ['P571']),
    'palacio': ('city hall', 'P131', ['P856']),
    'igreja_cat': ('cathedral', 'P131', ['P571', 'P1435', 'P162']),
}
CHUNK = 200
MAX_POR_CLASSE = 8    # a página mostra 4 por grupo; 8 dá folga e limita o cache


def http(url, data=None, timeout=180, tries=4):
    for n in range(tries):
        try:
            req = urllib.request.Request(url, data=data, headers=UA)
            with urllib.request.urlopen(req, timeout=timeout) as r:
                return r.read()
        except urllib.error.HTTPError as e:
            if e.code in (429, 500, 502, 503, 504) and n < tries - 1:
                ra = e.headers.get('Retry-After') if e.headers else None
                time.sleep(min(120, int(ra)) if (ra or '').isdigit() else 6 * (n + 1) ** 2)
                continue
            raise
        except Exception:                                                # noqa: BLE001
            if n < tries - 1:
                time.sleep(3 * (n + 1))
                continue
            raise
    raise RuntimeError('falhou')


def sparql(qry, timeout=240, tentativas=4):
    """QS com erro VISÍVEL *e* com retry do parse.

    O corpo desta rodada mostrou 'JSONDecodeError … line 11378': resposta grande chega
    truncada pela conexão, e isso é transitório. Antes o parse ficava fora do loop de retry,
    então um lote quebrado descartava 200 cidades de uma classe inteira.
    """
    url = QS + '?' + urllib.parse.urlencode({'query': qry, 'format': 'json'})
    ultimo = ''
    for n in range(tentativas):
        try:
            bruto = http(url, timeout=timeout)
            if not bruto or bruto[:1] not in (b'{', b'['):
                raise ValueError(f'resposta não-JSON: {str(bruto[:80])[:80]}')
            return json.loads(bruto.decode('utf-8', 'ignore'))
        except Exception as e:                                            # noqa: BLE001
            corpo = ''
            try:
                if isinstance(e, urllib.error.HTTPError):
                    corpo = e.read(240).decode('utf-8', 'ignore').replace('\n', ' ')
            except Exception:                                             # noqa: BLE001
                pass
            ultimo = f'{type(e).__name__} {str(e)[:70]} {corpo[:90]}'.strip()
            time.sleep(min(90, 5 * (n + 1) ** 2))
    raise RuntimeError(ultimo)


def uri(v):
    return (v or {}).get('value', '').rsplit('/', 1)[-1]


def cidades_qid(n=0):
    ent = {}
    for ln in open(f'{D}/qids.jsonl', encoding='utf-8'):
        d = json.loads(ln)
        if d.get('qid'):
            ent[d['ckey']] = d['qid']
    ks = sorted(ent)
    return {k: ent[k] for k in (ks[:n] if n else ks)}


def _labels_en(qids):
    """wbgetentities em lote: {qid: rótulo en} (e só — nada de assumir)."""
    out = {}
    for i in range(0, len(qids), 50):
        ch = qids[i:i + 50]
        u = (WAPI + '?' + urllib.parse.urlencode({'action': 'wbgetentities', 'ids': '|'.join(ch),
                                                  'props': 'labels|claims', 'languages': 'en',
                                                  'format': 'json'}))
        try:
            r = json.loads(http(u, timeout=90).decode('utf-8', 'ignore'))
        except Exception as e:                                            # noqa: BLE001
            print(f'    wbgetentities falhou: {str(e)[:90]}', flush=True)
            time.sleep(8)
            continue
        ents = r.get('entities') or {}          # id inválido vem SEM 'entities': era um dos buracos
        for q in ch:
            e = ents.get(q)
            if not e or 'labels' not in e:
                continue
            lab = (e.get('labels') or {}).get('en') or {}
            out[q] = lab.get('value')
        time.sleep(1.2)
    return out


def resolve_classes(amostra=40):
    if os.path.exists(CLS_CACHE):
        c = json.load(open(CLS_CACHE, encoding='utf-8'))
        if len(c) >= len({lbl for lbl, _, _ in CLASSES.values()}):
            print(f'classes: cache com {len(c)} → pulando resolução', flush=True)
            return c
    need = sorted({lbl for lbl, _, _ in CLASSES.values()})
    ent = cidades_qid()
    qids_amo = sorted(ent.values())[:2400:60][:amostra]
    out = {}
    for lbl in need:
        try:
            r = json.loads(http(WAPI + '?' + urllib.parse.urlencode(
                {'action': 'wbsearchentities', 'search': lbl, 'language': 'en', 'uselang': 'en',
                 'type': 'item', 'limit': 10, 'format': 'json'}), timeout=60).decode('utf-8', 'ignore'))
            cand = [x['id'] for x in r.get('search', []) if re.fullmatch(r'Q\d+', x.get('id') or '')]
        except Exception as e:                                            # noqa: BLE001
            print(f'  {lbl}: busca falhou {str(e)[:80]}', flush=True)
            cand = []
        time.sleep(1.2)
        if not cand:
            print(f'  {lbl}: 0 candidatos', flush=True)
            continue
        labs = _labels_en(cand)
        exatos = [q for q in cand if (labs.get(q) or '').strip().lower() == lbl.lower()]
        achado = None
        for q in exatos or cand:                      # rótulo exato primeiro; senão testa na prova
            qry = (f'SELECT (COUNT(*) AS ?n) WHERE {{ VALUES ?city {{ {" ".join("wd:" + x for x in qids_amo)} }} '
                   f'?x wdt:P131 ?city ; wdt:P31 wd:{q} . }}')
            try:
                d = sparql(qry)
                n = int(d['results']['bindings'][0]['n']['value']) if d['results']['bindings'] else 0
            except Exception as e:                                        # noqa: BLE001
                print(f'  {lbl} ({q}): prova erro → {str(e)[:120]}', flush=True)
                n = -1
            time.sleep(1.6)
            if n > 0:
                achado = (q, n, labs.get(q) or '')
                break
        if achado:
            out[lbl] = achado[0]
            print(f'  {lbl:16s} → {achado[0]} ({achado[2][:26]!r}) — {achado[1]} entidades nas '
                  f'{len(qids_amo)} cidades-amostra', flush=True)
        else:
            print(f'  {lbl:16s} → SEM PROVA (candidatos {exatos or cand} não devolveram linha; '
                  f'rótulos {[labs.get(q) for q in cand[:4]]})', flush=True)
    json.dump(out, open(CLS_CACHE, 'w', encoding='utf-8'), indent=1)
    print(f'classes resolvidas: {len(out)}/{len(need)} (cache {CLS_CACHE})', flush=True)
    return out


def _ja_colhido():
    """{(ckey, classe)} já no acúmulo, para não repetir lote."""
    feito = set()
    if os.path.exists(PARC):
        for ln in open(PARC, encoding='utf-8'):
            try:
                d = json.loads(ln)
                feito.add((d['ckey'], d['cls']))
            except Exception:                                            # noqa: BLE001
                pass
    return feito


def _colhe_lote(cls, spec, cq, ch, fh, feito, rotulo_lote=''):
    """Um lote (cidade→QID) de uma classe: consulta, grava no acúmulo, e em falha divide ao meio.

    A subdivisão existe porque a falha real observada foi resposta do QS truncada em lote de 200
    cidades (~9 mil linhas). Metades de 100/50/25 costumam passar; desiste só abaixo de 25.
    """
    lbl, loc, extra = spec
    ch = [(c, q) for (c, q) in ch if (c, cls) not in feito]
    if not ch:
        return 0
    q2c = {q: c for c, q in ch}
    opts = ''.join(f'OPTIONAL{{?x wdt:{p} ?{p} .}} ' for p in extra)
    qry = (f'SELECT ?city ?x {" ".join("?" + p for p in extra)} WHERE {{ '
           f'VALUES ?city {{ {" ".join("wd:" + q for _, q in ch)} }} '
           f'?x wdt:{loc} ?city ; wdt:P31 wd:{cq} . {opts} }} LIMIT 9000')
    try:
        d = sparql(qry)
    except Exception as e:                                                # noqa: BLE001
        print(f'  {cls}{rotulo_lote}: ERRO {str(e)[:110]}', flush=True)
        if len(ch) >= 50:
            m = len(ch) // 2
            print(f'    → subdividindo {len(ch)} cidades em {m}+{len(ch)-m}', flush=True)
            return (_colhe_lote(cls, spec, cq, ch[:m], fh, feito, rotulo_lote + '½')
                    + _colhe_lote(cls, spec, cq, ch[m:], fh, feito, rotulo_lote + '¼'))
        return -1
    linhas = d['results']['bindings']
    n = 0
    for r in linhas:
        c = q2c.get(uri(r.get('city')))
        if not c:
            continue
        rec = {'q': uri(r.get('x'))}
        for pr in extra:
            v = r.get(pr)
            if not v:
                continue
            rec[pr] = v['value'][:120] if v.get('type') == 'literal' else uri(v)
        fh.write(json.dumps({'ckey': c, 'cls': cls, 'q': rec, 'ts': int(time.time())},
                            ensure_ascii=False) + '\n')
        feito.add((c, cls))
        n += 1
    if linhas and not n:
        return 0
    if n:
        fh.flush()
    if len(linhas) >= 9000:
        print(f'  ⚠ {cls}{rotulo_lote}: LIMIT 9000 atingido (cidades perdem itens)', flush=True)
    return n


def colher(classe_map, qids, limite, so_classes=None, feito=None):
    if limite:
        qids = {k: v for k, v in list(qids.items())[:limite]}
    print(f'{len(qids)} cidades a colher entidades', flush=True)
    if feito is None:
        feito = _ja_colhido()   # o auxiliar já existia mas nunca era chamado: sem ele a segunda
    if feito:                   # passada repetiría 100% das consultas
        print(f'  acúmulo tem {len(feito)} (ckey,classe) → pulados', flush=True)
    fh = open(PARC, 'a', encoding='utf-8')
    perdidos = 0
    ini = time.time()
    for cls, (lbl, loc, extra) in sorted(CLASSES.items()):
        if so_classes and cls not in so_classes:
            continue
        cq = classe_map.get(lbl)
        if not cq:
            print(f'  {cls:14s}: sem classe resolvida → pulada', flush=True)
            continue
        itens = 0
        for k, i in enumerate(range(0, len(qids), CHUNK), 1):
            ch = list(qids.items())[i:i + CHUNK]
            n = _colhe_lote(cls, (lbl, loc, extra), cq, ch, fh, feito, f' lote {k}')
            if n < 0:
                perdidos += 1
            elif n:
                itens += n
        print(f'  {cls:14s} {cq:9s}: {itens} linhas  ({time.time()-ini:.0f}s no total)', flush=True)
        time.sleep(1.2)
    fh.close()
    print(f'acúmulo: {PARC} ({os.path.getsize(PARC)//1024} KB); {perdidos} lotes perdidos', flush=True)


def mesclar():
    """parcial (1 linha por ckey+classe) → entidades.jsonl (1 linha por ckey).

    Por que ordenar antes de cortar: São Paulo tem 8.436 escolas registradas no Wikidata e
    Nova York, 620 empresas. Cortar os 14 primeiros da resposta do serviço é escolher ao acaso
    — e o acaso enche a lista de stub sem nome nem site. Então cada grupo é ordenado por
    riqueza de dado (site oficial, fundação, setor, liga) e o corte guarda os 8 melhores;
    o total continuou sendo contado, porque a página precisa dizer "8 de 8.436".
    """
    grupos, vistos, rep = {}, set(), 0
    totais = {}
    for ln in open(PARC, encoding='utf-8'):
        try:
            d = json.loads(ln)
        except Exception:                                                # noqa: BLE001
            continue
        k = (d['ckey'], d['cls'], (d['q'] or {}).get('q'))
        if k in vistos:      # append-only: sem dedupe a mesma instituição sairia 2× na página
            rep += 1
            continue
        vistos.add(k)
        grupos.setdefault(d['ckey'], {}).setdefault(d['cls'], []).append(d['q'])
        totais[(d['ckey'], d['cls'])] = totais.get((d['ckey'], d['cls']), 0) + 1
    if rep:
        print(f'  dedupe: {rep} linhas repetidas descartadas', flush=True)

    def forca(it):
        sc = 0
        for k in ('P856', 'P571', 'P1619', 'P452', 'P1128', 'P118', 'P1435', 'P2048'):
            if it.get(k):
                sc += 1
        return sc

    tmp = ENT + '.tmp'
    with open(tmp, 'w', encoding='utf-8') as fh:
        for c in sorted(grupos):
            g, tt_ = {}, {}
            for k, v in grupos[c].items():
                v.sort(key=lambda it: (-forca(it), it.get('q') or ''))
                g[k] = v[:MAX_POR_CLASSE]
                if totais.get((c, k), 0) > len(g[k]):
                    tt_[k] = totais[(c, k)]
            fh.write(json.dumps({'ckey': c, 'ts': int(time.time()), 'grupos': g, 'totais': tt_},
                                ensure_ascii=False) + '\n')
    os.replace(tmp, ENT)
    tot = sum(len(x) for v in grupos.values() for x in v.values())   # itens, não grupos
    amo = sum(1 for c in grupos for k in grupos[c] if totais.get((c, k), 0) > MAX_POR_CLASSE)
    print(f'mesclado: {len(grupos)} cidades, {tot} entidades guardadas; {amo} grupos são amostra '
          f'de um total maior (a página vai dizer "8 de N")', flush=True)


def airports_index():
    """OurAirports: dados abertos; guarda aeroportos com voo regular + vizinhança."""
    if os.path.exists(AERO):
        return json.load(open(AERO, encoding='utf-8'))
    print('baixando OurAirports…', flush=True)
    raw = http('https://ourairports.com/data/airports.csv', timeout=600).decode('utf-8', 'ignore')
    keep = {'large_airport', 'medium_airport', 'small_airport'}
    out = []
    for row in csv.DictReader(io.StringIO(raw)):
        if row['type'] not in keep:
            continue
        try:
            la, lo = float(row['latitude_deg']), float(row['longitude_deg'])
        except ValueError:
            continue
        out.append({'n': row['name'], 't': row['type'], 'la': round(la, 4), 'lo': round(lo, 4),
                    'iata': row.get('iata_code') or '', 'ident': row.get('ident') or '',
                    'cc': row.get('iso_country') or '', 'muni': row.get('municipality') or '',
                    'sched': (row.get('scheduled_service') or '') == 'yes',
                    'elev_ft': row.get('elevation_ft') or ''})
    json.dump(out, open(AERO, 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
    print(f'aeroportos: {len(out)} guardados ({os.path.getsize(AERO)//1024} KB)', flush=True)
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--limit-cidades', type=int, default=0)
    ap.add_argument('--so', choices=['aeroportos', 'classes', 'mesclar'], default='')
    a = ap.parse_args()
    airports_index()
    if a.so == 'aeroportos':
        return
    if a.so == 'mesclar':
        return mesclar()
    print('resolvendo classes…', flush=True)
    cmap = resolve_classes()
    if not cmap:
        print('nenhuma classe resolvida; nada a colher', flush=True)
        return
    if a.so == 'classes':
        return
    colher(cmap, cidades_qid(), a.limit_cidades)
    mesclar()


if __name__ == '__main__':
    main()
