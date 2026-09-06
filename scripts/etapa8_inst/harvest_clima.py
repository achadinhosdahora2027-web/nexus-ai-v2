#!/usr/bin/env python3
"""E7.2 — CLIMA: médias mensais REAIS por cidade, calculadas fora do navegador.

Fonte: Open-Meteo `archive-api` (reanálise ERA5/COODRT, domínio aberto), com **multi-localização
na mesma chamada** — até 60 cidades por requisição, então o mundo inteiro fecha em ~60 chamadas.
Agregação é aritmética simples sobre dados diários (nada é escrito por mim):

  temperatura média do mês (max e min), chuva acumulada média do mês, dias com chuva (>=1 mm),
  insolacão média (se a série existir), e um índice "melhor época" com fórmula explícita:

      score = -((tmax_mes - 24)^2)/10 - (dias_chuva_mes / 9) + (sol_mes - sol_medio)/2.5

  entram na "melhor época" os meses com score >= 0 e, se nenhum tiver, os 2 melhores.

O clima "agora" (temperatura, sensação, chuva, umidade, vento, pressão, UV, nascer/pôr do sol,
próximos 14 dias) é **dinâmico no navegador** (js/clima.js), porque texto estático mentiria em
menos de um dia.

Cache: data/clima.jsonl  (retomável por ckey)
Uso: python3 bin/harvest_clima.py [--anos 2023,2024,2025] [--lote 55] [--limit N]
"""
import argparse
import json
import os
import time
import urllib.error
import urllib.parse
import urllib.request

WORK = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
D = f'{WORK}/data'
CACHE = f'{D}/clima.jsonl'
UA = {'User-Agent': 'etapa7-clima/1.0 (painel de cidades; dados abertos Open-Meteo)'}
MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez']
DAILY = 'temperature_2m_max,temperature_2m_min,precipitation_sum,sunshine_duration'


def get(url, timeout=240, tries=2):
    for n in range(tries):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=timeout) as r:
                return r.read().decode('utf-8', 'ignore')
        except urllib.error.HTTPError as e:
            if e.code in (429, 502, 503, 504) and n < tries - 1:
                time.sleep(5 * (n + 1) ** 2)
                continue
            raise
        except Exception:                                                # noqa: BLE001
            if n < tries - 1:
                time.sleep(3 * (n + 1))
                continue
            raise
    raise RuntimeError('falhou')


def coords_por_cidade():
    out = {}
    for ln in open(f'{D}/fachada.jsonl', encoding='utf-8'):
        try:
            d = json.loads(ln)
        except json.JSONDecodeError:
            continue
        cc = (d.get('P625') or [{}])[0].get('v')
        if isinstance(cc, list) and len(cc) == 2 and all(isinstance(x, (int, float)) for x in cc):
            if abs(cc[0]) <= 90 and abs(cc[1]) <= 180:
                out[d['ckey']] = (cc[0], cc[1], d.get('qid'))
    return out


def agrega(anos, d1, pai=None):
    """d1: bloco 'daily' da localização (time + listas diárias) -> médias mensais + derivados."""
    pai = pai or {}
    t = d1.get('time') or []
    series = {k: (d1.get(k) or []) for k in ('temperature_2m_max', 'temperature_2m_min',
                                            'precipitation_sum', 'sunshine_duration')}
    n = len(t)
    if not n:
        return None
    anos_ok = len({x[:4] for x in t if len(x) >= 4}) or 1
    acc = {k: [[0.0, 0] for _ in range(12)] for k in series if any(x is not None for x in series[k])}
    wet = [0] * 12
    tot = [0] * 12
    for i in range(n):
        try:
            m = int(t[i][5:7]) - 1
        except Exception:                                                # noqa: BLE001
            continue
        tot[m] += 1
        pr = (series.get('precipitation_sum') or [None] * n)[i]
        if pr is not None:
            acc.setdefault('precipitation_sum', [[0.0, 0] for _ in range(12)])
            acc['precipitation_sum'][m][0] += pr
            acc['precipitation_sum'][m][1] += 1
            if pr >= 1.0:
                wet[m] += 1
        for k in ('temperature_2m_max', 'temperature_2m_min', 'sunshine_duration'):
            v = (series.get(k) or [None] * n)[i]
            if v is not None and k in acc:
                acc[k][m][0] += v
                acc[k][m][1] += 1
    med = lambda k: [round(acc[k][m][0] / acc[k][m][1], 2) if acc.get(k) and acc[k][m][1] else None
                     for m in range(12)]
    tmax, tmin = med('temperature_2m_max'), med('temperature_2m_min')
    # chuva e dias de chuva são TOTAIS mensais médios (soma de todos os anos / nº de anos),
    # não média diária — é o que o visitante lê como "chove 90 mm em janeiro"
    chu = [round(acc['precipitation_sum'][m][0] / anos_ok, 1) if acc.get('precipitation_sum') and acc['precipitation_sum'][m][1] else None for m in range(12)]
    sol = med('sunshine_duration') if 'sunshine_duration' in acc else [None] * 12
    if not any(x is not None for x in tmax):
        return None
    smed = [s for s in sol if s]
    sol_med = sum(smed) / len(smed) if smed else None
    score = []
    for m in range(12):
        if tmax[m] is None:
            score.append(None)
            continue
        dias_mes = (tot[m] / anos_ok) if tot[m] else 30.4
        v = -((tmax[m] - 24) ** 2) / 10 - ((wet[m] / anos_ok) / max(1.0, dias_mes * 0.45)) / 9
        if sol[m] is not None and sol_med:
            v += (sol[m] - sol_med) / 2.5
        score.append(round(v, 2))
    valid = [(i, s) for i, s in enumerate(score) if s is not None]
    melhor = sorted([i for i, s in valid if s >= 0], key=lambda i: -score[i])
    if not melhor:
        melhor = [i for i, _ in sorted(valid, key=lambda x: -x[1])[:2]]
    quentes = sorted(valid, key=lambda x: -(tmax[x[0]] or -99))[:3]
    frios = sorted(valid, key=lambda x: (tmax[x[0]] or 99))[:3]
    chuv = sorted([(i, c) for i, c in enumerate(chu) if c is not None], key=lambda x: -x[1])[:3]
    sec = sorted([(i, c) for i, c in enumerate(chu) if c is not None], key=lambda x: x[1])[:3]
    return {'anos': anos, 'tmax': tmax, 'tmin': tmin, 'chuva': chu, 'sol': sol,
            'molhado': [round(w / anos_ok, 1) for w in wet], 'score': score,
            'n_anos': anos_ok,
            'melhor': sorted(melhor), 'quentes': sorted(i for i, _ in quentes),
            'frios': sorted(i for i, _ in frios), 'chanosos': sorted(i for i, _ in chuv),
            'secos': sorted(i for i, _ in sec),
            'elev_om': pai.get('elevation'), 'tz': pai.get('timezone'),
            'utc': pai.get('utc_offset_seconds')}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--anos', default='2023,2024,2025')
    ap.add_argument('--lote', type=int, default=55)
    ap.add_argument('--limit', type=int, default=0)
    a = ap.parse_args()
    anos = [int(x) for x in a.anos.split(',')]
    ini, fim = f'{min(anos)}-01-01', f'{max(anos)}-12-31'
    cs = coords_por_cidade()
    feito = set()
    if os.path.exists(CACHE):
        for ln in open(CACHE, encoding='utf-8'):
            try:
                feito.add(json.loads(ln)['ckey'])
            except Exception:                                            # noqa: BLE001
                pass
    alvos = [(c, v) for c, v in sorted(cs.items()) if c not in feito]
    if a.limit:
        alvos = alvos[:a.limit]
    print(f'{len(alvos)} cidades (sem clima); {len(feito)} já no cache', flush=True)
    fh = open(CACHE, 'a', encoding='utf-8')
    # controle adaptativo: o archive-api limita requisições pesadas por minuto; reduzimos o
    # lote e aumentamos a pausa a cada 429 e voltamos a crescer quando estabiliza.
    lote, lote_max, pausa, seguidos, falhas = min(a.lote, 14), a.lote, 3.0, 0, 0
    teias = 0            # 429 seguidos: o IP compartilhado sai da cota e precisa de calma
    i = 0
    while i < len(alvos):
        ch = alvos[i:i + lote]
        lat = ','.join(f'{v[0]:.4f}' for _, v in ch)
        lon = ','.join(f'{v[1]:.4f}' for _, v in ch)
        base = (f'https://archive-api.open-meteo.com/v1/archive?latitude={lat}&longitude={lon}'
                f'&start_date={ini}&end_date={fim}&timezone=auto')
        r = None
        for var in (DAILY, 'temperature_2m_max,temperature_2m_min,precipitation_sum'):
            try:
                r = json.loads(get(base + f'&daily={var}'))
                break
            except Exception as e:                                        # noqa: BLE001
                print('\n  ' + type(e).__name__ + ' ' + str(e)[:44] + f' (lote={lote}) ', end='', flush=True)
                if isinstance(e, urllib.error.HTTPError) and e.code == 429:
                    pausa = min(600.0, max(pausa, 20.0) * 2.0)
                    lote = max(6, lote // 2)
                    seguidos = 0
                    falhas += 1
                    teias += 1
                    if teias >= 6:      # castigo longo: espera o reabastecimento da cota do IP
                        print(f'\n  cota estourada: aguardo 900 s e volto com lote 10', flush=True)
                        time.sleep(900)
                        teias, pausa, lote = 0, 30.0, min(10, lote_max)
        if r is None:
            time.sleep(pausa)
            i += lote                      # segue; cidades sem dados voltam numa nova passada
            continue
        arr = r if isinstance(r, list) else [r]
        grav = 0
        for (ck, meta), d1 in zip(ch, arr):
            try:
                rec = agrega(a.anos, (d1 or {}).get('daily') or {}, d1)
            except Exception as e:                                        # noqa: BLE001
                print('  agrega falhou', ck, str(e)[:60], flush=True)
                rec = None
            if rec:
                rec.update({'ckey': ck, 'qid': meta[2], 'ts': int(time.time())})
                fh.write(json.dumps(rec, ensure_ascii=False) + '\n')
                grav += 1
        fh.flush()
        if grav == 0:
            falhas += 1
        else:
            teias = 0
            seguidos += 1
            if seguidos >= 8:
                pausa = max(1.2, pausa * 0.7)
                lote = min(lote_max, lote + 3)
                seguidos = 0
        print(f'  {i + grav}/{len(alvos)}  (lote {lote}, pausa {pausa:.1f}s, falhas {falhas})',
              end='\r', flush=True)
        i += lote
        time.sleep(pausa)
    print(f'\nclima ok: {os.path.getsize(CACHE)//1024} KB; {falhas} lotes com falha (re-rodar repõe)', flush=True)


if __name__ == '__main__':
    main()
