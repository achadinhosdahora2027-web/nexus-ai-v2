#!/usr/bin/env python3
"""E7.4b — DEMANDA REAL por cidade (medições, não suposições).

Para cada cidade com artigo na Wikipédia, série mensal de 13 meses do contador público de
pageviews — no idioma da página E em inglês (que é o idioma do visitante) — de
`wikimedia.org/api/rest_v1/metrics/pageviews`. Daí saem “quantas pessoas procuram esta cidade”
e “em alta” (média dos 3 meses recentes × 3 anteriores).

Por que é serial: a medição desta sessão (36 pedidos) devolveu **26 × HTTP 429** com espaçamento
de 0,45 s — o gargalo é o limite por IP do REST da Wikimedia, não o título do artigo. Então:
um pedido por vez, `Retry-After` obedecido quando existe, e uma pausa adaptativa que cresce a
cada 429 e encolhe devagar quando estabiliza. Títulos que deram 404 não são re-tentados.

Cache: data/pageviews.jsonl (retomável por ckey). Erros ficam contados por tipo no fim da rodada.
Uso: python3 bin/harvest_pageviews.py [--limit N] [--pausa 1.1] [--projetos nativo+en|nativo]
"""
import argparse
import json
import os
import random
import time
import urllib.error
import urllib.parse
import urllib.request

WORK = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
D = f'{WORK}/data'
SL = f'{D}/sitelinks.jsonl'
PV = f'{D}/pageviews.jsonl'
UA = {'User-Agent': 'aquitemachadinhos-etapa7/2.0 (leitura pontual de metricas publicas da '
                    'Wikimedia para painel de cidades; contato: admin@aquitemachadinhos.com.br)'}


class Freio:
    """Pausa adaptativa: obedece Retry-After, cresce no 429, alivia quando acalma."""

    def __init__(self, base=1.1, minimo=0.8, maximo=25.0):
        self.p = base
        self.min, self.max = minimo, maximo
        self.segosos = 0
        self.pedidos = 0
        self.limitados = 0

    def esperar(self):
        time.sleep(self.p + random.random() * 0.25)

    def ok(self):
        self.pedidos += 1
        self.segosos = 0
        if self.pedidos % 40 == 0:
            self.p = max(self.min, self.p * 0.85)

    def lento(self, retry_after=None):
        self.pedidos += 1
        self.limitados += 1
        self.segosos += 1
        if retry_after and retry_after.isdigit():
            self.p = min(self.max, max(self.p, float(retry_after)))
        else:
            self.p = min(self.max, max(self.p * 1.7, 3.0))

    def duro(self):
        """429 atrás de 429: recuo longo, o IP precisa sair da janela."""
        self.p = self.max
        time.sleep(45 + random.random() * 30)


def get(url, freio, timeout=45, tries=6):
    """devolve (json|None, motivo). motivos: '', '404', '429', 'erro'."""
    motivo = ''
    for n in range(tries):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=timeout) as r:
                corpo = json.loads(r.read().decode('utf-8', 'ignore'))
            freio.ok()
            return corpo, ''
        except urllib.error.HTTPError as e:
            if e.code == 404:
                return None, '404'
            if e.code in (429, 500, 502, 503, 504):
                ra = (e.headers.get('Retry-After') if e.headers else '') or ''
                freio.lento(ra)
                motivo = '429' if e.code == 429 else 'erro'
                if n == 4:
                    freio.duro()
                time.sleep(float(ra) if ra.isdigit() else min(30.0, 2.0 * (n + 1) ** 2))
                continue
            return None, 'erro'
        except Exception:                                                # noqa: BLE001
            motivo = 'erro'
            time.sleep(2.0 * (n + 1))
    return None, motivo or 'erro'


def colhe_sitelinks(qids):
    tem = {}
    if os.path.exists(SL):
        for ln in open(SL, encoding='utf-8'):
            try:
                d = json.loads(ln)
                tem[d['qid']] = d.get('links') or {}
            except Exception:                                            # noqa: BLE001
                pass
    falta = sorted(q for q in set(qids) if q not in tem)
    if not falta:
        print(f'sitelinks: {len(tem)} no cache', flush=True)
        return tem
    print(f'sitelinks: buscando {len(falta)} itens', flush=True)
    fh = open(SL, 'a', encoding='utf-8')
    for i in range(0, len(falta), 50):
        ch = falta[i:i + 50]
        url = ('https://www.wikidata.org/w/api.php?action=wbgetentities&format=json&props=sitelinks'
               '&sitefilter=ptwiki|enwiki|frwiki|itwiki|eswiki|dewiki&ids=' + '|'.join(ch))
        d, motivo = get(url, FREIO, timeout=90)
        if not d:
            print('  lote falhou', motivo, flush=True)
            continue
        for q, e in (d.get('entities') or {}).items():
            links = {s[:-4]: v.get('title') for s, v in (e.get('sitelinks') or {}).items()
                     if s.endswith('wiki')}
            fh.write(json.dumps({'qid': q, 'links': links}, ensure_ascii=False) + '\n')
            tem[q] = links
        fh.flush()
        print(f'  {min(i+50,len(falta))}/{len(falta)}', end='\r', flush=True)
        FREIO.esperar()
    fh.close()
    print(flush=True)
    return tem


def serie(proj, title, ini, fim):
    u = (f'https://wikimedia.org/api/rest_v1/metrics/pageviews/per-article/{proj}.wikipedia/'
         f'all-access/user/{urllib.parse.quote(title, safe="")}/monthly/{ini}/{fim}')
    d, motivo = get(u, FREIO, timeout=45)
    if not d:
        return None, motivo
    return {x['timestamp'][:6]: x['views'] for x in d.get('items', [])}, ''


FREIO = Freio()


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--limit', type=int, default=0)
    ap.add_argument('--pausa', type=float, default=1.1)
    ap.add_argument('--projetos', default='nativo+en', choices=['nativo+en', 'nativo'])
    ap.add_argument('--so', default='')
    a = ap.parse_args()
    FREIO.p = a.pausa

    ent = {}
    for ln in open(f'{D}/qids.jsonl', encoding='utf-8'):
        d = json.loads(ln)
        if d.get('qid'):
            ent[d['ckey']] = d['qid']
    lang = {}
    for ln in open(f'{D}/cities.jsonl', encoding='utf-8'):
        d = json.loads(ln)
        if d.get('slug'):
            lang[d['ckey']] = str(d.get('lang', 'pt-BR')).split('-')[0]

    sl = colhe_sitelinks(list(ent.values()))
    if a.so == 'sitelinks':
        return
    # granularidade mensal: a API só olha AAAAMM, mas formatamos direito (13 meses fechados)
    ini = time.strftime('%Y%m01', time.gmtime(time.time() - 400 * 86400))
    fim = time.strftime('%Y%m01', time.gmtime())
    feito = set()
    if os.path.exists(PV):
        for ln in open(PV, encoding='utf-8'):
            try:
                d = json.loads(ln)
                if d.get('s'):
                    feito.add(d['ckey'])
            except Exception:                                            # noqa: BLE001
                pass
    alvos = []
    semartigo = 0
    for ck, q in sorted(ent.items()):
        if ck in feito:
            continue
        lk = sl.get(q) or {}
        pag = lang.get(ck, 'pt')
        pref = [p for p in ((pag, 'en') if a.projetos == 'nativo+en' else (pag,)) if lk.get(p)]
        if not pref:
            if lk.get('en'):
                pref = ['en']
            else:
                semartigo += 1
                continue
        alvos.append((ck, q, [(p, lk[p]) for p in pref]))
    if a.limit:
        alvos = alvos[:a.limit]
    print(f'{len(alvos)} cidades para pageviews (cache {len(feito)}, sem artigo {semartigo})',
          flush=True)
    estat = {'ok': 0, '404': 0, '429': 0, 'erro': 0, 'vazio': 0}
    fh = open(PV, 'a', encoding='utf-8')
    ini_ts = time.time()
    for n, (ck, q, title) in enumerate(alvos, 1):
        out = {'ckey': ck, 'qid': q, 'ts': int(time.time()), 's': {}}
        for proj, tt in title:
            sv, motivo = serie(proj, tt, ini, fim)
            if motivo:
                estat[motivo if motivo in estat else 'erro'] += 1
                continue
            if not sv:
                estat['vazio'] += 1
                continue
            vals = [sv[k] for k in sorted(sv) if k >= ini[:6]]   # 'AAAA-MM' >= 'AAAAMM'
            if len(vals) >= 6:
                rec, ant = sum(vals[-3:]) / 3, sum(vals[-6:-3]) / 3
                delta = round(100 * (rec - ant) / ant, 1) if ant else None
            else:
                delta = None
            out['s'][proj] = {'t': tt, 'views': {k: v for k, v in sorted(sv.items())},
                              'total12': sum(vals[-12:]), 'delta': delta}
            estat['ok'] += 1
            FREIO.esperar()
        if out['s']:
            fh.write(json.dumps(out, ensure_ascii=False) + '\n')
            fh.flush()
        if n % 25 == 0:
            vel = n / max(1.0, time.time() - ini_ts)
            resta = (len(alvos) - n) / vel / 60 if vel else 0
            print(f'  {n}/{len(alvos)}  {estat}  pausa={FREIO.p:.1f}s  '
                  f'{vel*60:.0f} cid/min  restam ~{resta:.0f} min', flush=True)
    fh.close()
    print('pageviews fim.', estat, f'limitações totais {FREIO.limitados}',
          f'{os.path.getsize(PV)//1024} KB', flush=True)


if __name__ == '__main__':
    main()
