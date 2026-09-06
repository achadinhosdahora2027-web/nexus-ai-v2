#!/usr/bin/env python3
"""ETAPA 7 — PAINEL OPERACIONAL DA CIDADE (stage 3). Só dados colhidos, nada inventado.

Blocos (marcados e idempotentes; removidos e reescritados a cada execução):

  <!-- city-fachada -->      🏙️ números reais da cidade (Wikidata + fuso/DST por zoneinfo)
  <!-- city-nomes -->        🗣️ a cidade em todos os idiomas + alcunhas/nomes históricos
  <!-- city-clima -->         🌦️ tabela mensal média 2023–2025 + "melhor época" calculada +
                             contêiner do widget ao-vivo (js/clima.js, Open-Meteo)
  <!-- city-mobilidade -->   🚗 aeroporto mais próximo, trem/metrô/rodoviária, distâncias e
                             "para onde ir daqui" em 1h/2h/3h/5h (calculado das coordenadas)
  <!-- city-busca -->        🔎 buscas reais (autocompletar Google, quando colhido) + demanda
                             medida (pageviews Wikimedia, variação 3m × 3m)
  <!-- city-instituicoes --> 🏛️ universidades, escolas, museus, hospitais, estádios, redes de
                             transporte, shoppings, mercados, sedes de empresa (Wikidata + site)
  <!-- painel-osm -->         🧭 categorias do OpenStreetMap carregadas no navegador, com
                             endereço/telefone/site/horário/acessibilidade/distância/rota
  <!-- ld-city -->            schema.org/City (população, área, elevação, fundação, endereço,
                             geo, alternateName por idioma, containsPlace, sameAs)

Reaproveita o parser, o `set_meta` (com `data-base`) e os dados da Etapa 6 — mesma fonte de
verdade, mesma idempotência. Uso:

  python3 bin/stage3_panel.py --report              # estatísticas, não escreve
  python3 bin/stage3_panel.py                        # aplica nos 3 sites
  python3 bin/stage3_panel.py --only br/sao-paulo.html --dump
"""
import argparse
import collections
import glob
import importlib.util
import json
import math
import os
import re
import time
import urllib.parse
import zoneinfo
from datetime import datetime, timedelta

WORK = '/home/user/work'
import sys
sys.path.insert(0, f'{WORK}/bin')
_sp = importlib.util.spec_from_file_location('s2', f'{WORK}/bin/stage2_attractions.py')
S2 = importlib.util.module_from_spec(_sp)
_sp.loader.exec_module(S2)

import osm_cats  # noqa: E402  (fonte única das categorias: bin/osm_cats.py)

CATS7 = osm_cats.as_list()
CAT_LABEL = {c['k']: c['l'] for c in CATS7}
ORDEM_CATS = [c['k'] for c in CATS7]

D = f'{WORK}/data'
FACHADA, PAISES, CLIMA, SUG, PV, ENT, LABS = (f'{D}/fachada.jsonl', f'{D}/fachada_paises.jsonl',
                                              f'{D}/clima.jsonl', f'{D}/suggest.jsonl',
                                              f'{D}/pageviews.jsonl', f'{D}/entidades.jsonl',
                                              f'{D}/labels7.jsonl')
AERO = f'{D}/etapa7_aeroportos.json'
COLHIDO = '05-06/09/2026'   # janela real da colheita (UTC): 5 e 6 de setembro
BLOCOS = ['city-fachada', 'city-nomes', 'city-clima', 'city-mobilidade', 'city-busca',
          'city-instituicoes', 'painel-osm', 'ld-city', 'p7-css', 'p7-js']

MESES = {
    'pt': ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto',
           'setembro', 'outubro', 'novembro', 'dezembro'],
    'fr': ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre',
           'octobre', 'novembre', 'décembre'],
    'it': ['gennaio', 'febbraio', 'marzo', 'aprile', 'maggio', 'giugno', 'luglio', 'agosto',
           'settembre', 'ottobre', 'novembre', 'dicembre'],
    'en': ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September',
           'October', 'November', 'December'],
    'es': ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre',
           'octubre', 'noviembre', 'diciembre'],
    'de': ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September',
           'Oktober', 'November', 'Dezember'],
}
TIT = {
    'pt': {'fachada': 'A cidade em números', 'nomes': 'Como ela se chama em cada idioma',
           'clima': 'Clima mês a mês (média real 2023–2025)', 'mobilidade': 'Como chegar e se mover',
           'busca': 'O que as pessoas procuram sobre esta cidade',
           'instituicoes': 'Instituições e serviços registrados', 'painel': 'Painel de serviços ao vivo'},
    'fr': {'fachada': 'La ville en chiffres', 'nomes': 'Son nom dans chaque langue',
           'clima': 'Climat mois par mois (moyenne réelle 2023–2025)',
           'mobilidade': 'Y arriver et s’y déplacer', 'busca': 'Ce qu’on cherche sur cette ville',
           'instituicoes': 'Institutions et services recensés', 'painel': 'Services en direct'},
    'it': {'fachada': 'La città in numeri', 'nomes': 'Come si chiama in ogni lingua',
           'clima': 'Clima mese per mese (media reale 2023–2025)',
           'mobilidade': 'Come arrivare e muoversi', 'busca': 'Cosa cercano su questa città',
           'instituicoes': 'Istituzioni e servizi censiti', 'painel': 'Servizi in diretta'},
    'en': {'fachada': 'The city in numbers', 'nomes': 'What it is called in each language',
           'clima': 'Climate month by month (real 2023–2025 mean)',
           'mobilidade': 'How to get there and get around',
           'busca': 'What people search about this city',
           'instituicoes': 'Institutions and services on record', 'painel': 'Live services panel'},
}
ICON = {'city-fachada': '🏙️', 'city-nomes': '🗣️', 'city-clima': '🌦️', 'city-mobilidade': '🚗',
        'city-busca': '🔎', 'city-instituicoes': '🏛️', 'painel-osm': '🧭'}
CHAVE_TIT = {'city-fachada': 'fachada', 'city-nomes': 'nomes', 'city-clima': 'clima',
             'city-mobilidade': 'mobilidade', 'city-busca': 'busca',
             'city-instituicoes': 'instituicoes', 'painel-osm': 'painel'}
LORDEM = {'pt': 0, 'fr': 2, 'it': 3, 'en': 1}


# ---------------------------------------------------------------------------- base -----------
P7_CSS = """<style>.p7{margin:24px 0;padding:15px 17px;border:1px solid #1e293b;border-radius:14px}
.p7 h2{margin:0 0 11px;font-size:1.13rem}
.p7 .p7sub{margin:0 0 4px;color:#a78bfa;font-size:.8rem;text-transform:uppercase;letter-spacing:.04em}
.p7 ul.p7chips{display:flex;flex-wrap:wrap;gap:5px;margin:0;padding:0;list-style:none}
.p7 ul.p7chips li{border:1px solid #334155;border-radius:999px;padding:2px 10px;font-size:.83rem}
.p7 .p7tabs{margin:0 0 10px}
.p7 .p7tab{border:1px solid #334155;background:#0f172a;color:#cbd5e1;border-radius:999px;padding:4px 11px;margin:0 5px 6px 0;cursor:pointer;font-size:.85rem}
.p7 .p7tab[aria-pressed=\"true\"]{border-color:#a78bfa;color:#fff}
.p7 .p7geo{display:grid;grid-template-columns:repeat(auto-fit,minmax(290px,1fr));gap:2px 26px}
.p7 .p7mut{color:#94a3b8;font-size:.78rem}
.p7 ul.p7lista{margin:0;padding-left:18px;font-size:.92rem}
.p7 .p7out{min-height:40px;font-size:.9rem}
.p7 .p7lin{display:flex;justify-content:space-between;gap:8px;border-bottom:1px dotted #334155;padding:2px 0}
.p7 .p7nota{margin:8px 0 0;font-size:.78rem;color:#94a3b8}</style>"""



def jl(path, key='ckey'):
    out = {}
    if not os.path.exists(path):
        return out
    for ln in open(path, encoding='utf-8'):
        try:
            d = json.loads(ln)
        except json.JSONDecodeError:
            continue
        k = d.get(key)
        if k:
            out[k] = d
    return out


def nfmt(x, lang='pt', dec=0):
    """Número com separador por idioma: pt/es/it/de '.' de milhar e ',' decimal, fr U+202F, resto IEEE."""
    if x is None or x == '':
        return ''
    try:
        f = float(x)
    except (TypeError, ValueError):
        return ''
    base = f'{abs(f):,.{dec}f}'
    inteiro, sep, frag = base.partition('.')
    decsep = {'pt': ',', 'es': ',', 'it': ',', 'de': ',', 'fr': ','}.get(lang, '.')
    grou = {'pt': '.', 'es': '.', 'it': '.', 'de': '.', 'fr': '\u202f'}.get(lang, ',')
    s = inteiro.replace(',', grou) + (decsep + frag if sep else '')
    return ('-' if f < 0 else '') + s


def haversine(a, b):
    if not a or not b or None in a or None in b:
        return None
    R = 6371.0088
    p1, p2 = math.radians(a[0]), math.radians(b[0])
    dp, dl = p2 - p1, math.radians(b[1] - a[1])
    h = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return round(2 * R * math.asin(math.sqrt(h)), 1)


def drive_est(km):
    """tempo de carro estimado (1,25× a distância em linha reta a 80 km/h); None quando a
    estimativa não significaria nada (mesma região, menos de ~700 m)."""
    if not km or km < 0.7:
        return None
    horas = km * 1.25 / 80
    hh, mm = int(horas), int(round((horas - int(horas)) * 60))
    if mm == 60:
        hh, mm = hh + 1, 0
    if not hh and not mm:
        return '1 min'
    return f'{hh} h {mm:02d} min' if hh else f'{mm} min'


def esc(t):
    return S2.esc(str(t))


_TZ = {}


def tz_info(tzid, ano=2026):
    """offset/UTC e transições de horário de verão, lidos da base IANA local (zoneinfo)."""
    if not tzid:
        return None
    if tzid in _TZ:
        return _TZ[tzid]
    try:
        z = zoneinfo.ZoneInfo(tzid)
    except Exception:                                                    # noqa: BLE001
        _TZ[tzid] = None
        return None
    jan = datetime(ano, 1, 15, 12, tzinfo=z)
    jul = datetime(ano, 7, 15, 12, tzinfo=z)
    o1 = jan.utcoffset().total_seconds() / 3600
    o2 = jul.utcoffset().total_seconds() / 3600
    tr = []
    if o1 != o2:
        d = datetime(ano, 1, 1, tzinfo=z)
        while d.year == ano:
            n = d + timedelta(hours=23, minutes=59)
            if d.utcoffset() != n.utcoffset():
                tr.append(d.astimezone(zoneinfo.ZoneInfo('UTC')).strftime('%d/%m'))
            d = d + timedelta(days=1)
    _TZ[tzid] = {'tz': tzid, 'ano': ano, 'inverno': o1, 'verao': o2, 'dst': o1 != o2,
                 'tr': sorted(set(tr))[:2]}
    return _TZ[tzid]


def restaura_out():
    """`out/` é diretório gerado e não entra no snapshot do workspace; os insumos que o
    stage 2 lê de lá têm cópia permanente em `data/etapa7_*.json`. Repõe o que faltar."""
    for f in ('countries.json', 'lang_codes.json', 'country_langs.json', 'concepts.json'):
        alvo, fonte = f'{WORK}/out/{f}', f'{D}/etapa7_{f}'
        if not os.path.exists(alvo) and os.path.exists(fonte):
            os.makedirs(os.path.dirname(alvo), exist_ok=True)
            import shutil
            shutil.copyfile(fonte, alvo)
            print(f'  restaurado out/{f} de data/etapa7_{f}', flush=True)


def load():
    ctx = {}
    ctx['fac'] = jl(FACHADA)
    ctx['pai'] = jl(PAISES, key='qid')
    ctx['cli'] = jl(CLIMA)
    ctx['sug'] = jl(SUG)
    ctx['pv'] = jl(PV)
    ctx['ent'] = jl(ENT)
    # o cache guarda 8 por grupo; o gerador mostra 4 *com nome resolvido*. Carregar tudo era RAM
    # de graça, cortar em 4 jogaria fora itens utilizáveis — 10 é o meio-termo.
    for d in ctx['ent'].values():
        g = d.get('grupos') or {}
        for k in list(g):
            if len(g[k]) > 10:
                g[k] = g[k][:10]
    # jl devolve o registro inteiro ({'qid','lab'}); lab_of espera o mapa idioma→texto.
    # Sem este desencape, lab_of retornava None para TUDO que não é cidade (instituições,
    # setor de empresa, vizinho fora da base) e o bloco novo nasceria vazio em todo o planeta.
    ctx['lab'] = {q: (d.get('lab') or {}) for q, d in jl(LABS, key='qid').items()}
    ctx['fac_q'] = {}
    for ck, d in ctx['fac'].items():
        if d.get('qid'):
            ctx['fac_q'][d['qid']] = d
    ctx['pai_q_lab'] = {q: (d.get('labels') or {}) for q, d in ctx['pai'].items()}
    ctx['aero'] = []
    ctx['aero_grid'] = {}
    if os.path.exists(AERO):
        ctx['aero'] = json.load(open(AERO, encoding='utf-8'))
        for i, a in enumerate(ctx['aero']):
            ctx['aero_grid'].setdefault((int(a['la']), int(a['lo'])), []).append(i)
    cities, per_site, by_qid = {}, {}, {}
    for ln in open(f'{D}/cities.jsonl', encoding='utf-8'):
        try:
            d = json.loads(ln)
        except json.JSONDecodeError:
            continue
        if d.get('ckey') and d.get('slug'):
            cities[d['ckey']] = d
            for site in (d.get('sites') or []):
                alvos = {site}
                for k, (_pu, _ho, repo) in S2.SITES.items():   # aceita o nome do repo também
                    if k == site or repo == site:
                        alvos.update((k, repo))
                for nome in alvos:
                    per_site.setdefault(nome, set()).add((d['cc'], d['slug']))
    for ck, dd in jl(f'{D}/qids.jsonl').items():
        if dd.get('qid'):
            by_qid.setdefault(dd['qid'], []).append(ck)
    ctx['cities'], ctx['per_site'], ctx['by_qid'] = cities, per_site, by_qid
    restaura_out()
    ctx['s2'] = S2.load()
    return ctx


def lab_of(ctx, qid, langs):
    """rótulo de qualquer QID no idioma da página > idioma nativo > inglês (sem inventar)."""
    if not qid:
        return None
    for fonte in (ctx['lab'].get(qid), (ctx['fac_q'].get(qid) or {}).get('labels'),
                  ctx['pai_q_lab'].get(qid)):
        if not fonte:
            continue
        for L in langs:
            v = fonte.get(L)
            if v and not S2.looks_technical(v):
                return v
    return None


def coord_of(fac):
    v = (fac or {}).get('P625')
    if v and isinstance(v[0].get('v'), list) and len(v[0]['v']) == 2:
        return tuple(v[0]['v'])
    return None


def one(fac, prop):
    for v in (fac or {}).get(prop, []):
        if isinstance(v, dict) and v.get('v') not in (None, ''):
            return v
    return None


def nearest_airports(ctx, coord, raio_km=420, n=4):
    if not coord or not ctx['aero']:
        return []
    r = int(math.ceil(raio_km / 111.0))
    la, lo = coord
    cand = []
    for dla in range(-r, r + 1):
        for dlo in range(-r, r + 1):
            cand.extend(ctx['aero_grid'].get((int(la) + dla, int(lo) + dlo), ()))
    out, seen = [], set()
    for i in cand:
        a = ctx['aero'][i]
        km = haversine(coord, (a['la'], a['lo']))
        if km is None or km > raio_km:
            continue
        k = (a['ident'] or a['n']) + a['iata']
        if k in seen:
            continue
        seen.add(k)
        out.append((km, a))
    out.sort(key=lambda x: (not x[1]['sched'], x[0]))
    return out[:n]


# ---------------------------------------------------------------------------- blocos ---------
def sec(ctx_key, titulo, corpo, pag):
    if not corpo:
        return ''
    return (f'<section class="p7 p7-{ctx_key}" style="margin:24px 0;padding:15px 17px;'
            f'border:1px solid #1e293b;border-radius:14px">'
            f'<h2 style="margin:0 0 11px;font-size:1.13rem">{ICON[ctx_key]} {esc(titulo)}</h2>{corpo}</section>')


TRAD = {
  'GeoNames': ('GeoNames', 'GeoNames', 'GeoNames'),
  'Código ISO 3166-2': ('Code ISO 3166-2', 'Codice ISO 3166-2', 'ISO 3166-2 code'),
  'Código IBGE': ('Code IBGE', 'Codice IBGE', 'IBGE code'),
  'População': ('Population', 'Popolazione', 'Population'),
  'Área': ('Superficie', 'Superficie', 'Area'),
  'Densidade': ('Densité', 'Densità', 'Population density'),
  'Altitude': ('Altitude', 'Altitudine', 'Elevation'),
  'Altitude (modelo de relevo)': ('Altitude (modèle de relief)', 'Altitudine (modello di rilievo)', 'Elevation (terrain model)'),
  'Fundação': ('Fondation', 'Fondazione', 'Founded'),
  'Gentílico': ('Gentilé', 'Gentilizio', 'Demonym'),
  'Nome oficial': ('Nom officiel', 'Nome ufficiale', 'Official name'),
  'Nome popular': ('Nom courant', 'Nome comune', 'Common name'),
  'País': ('Pays', 'Paese', 'Country'),
  'Continente': ('Continent', 'Continente', 'Continent'),
  'Região/estado': ('Région / État', 'Regione / Stato', 'Region / state'),
  'Moeda': ('Devise', 'Valuta', 'Currency'),
  'Idiomas oficiais/usados': ('Langues officielles/utilisées', 'Lingue ufficiali/parlate', 'Official and used languages'),
  'Site oficial': ('Site officiel', 'Sito ufficiale', 'Official website'),
  'Coordenadas': ('Coordonnées', 'Coordinate', 'Coordinates'),
  'Fuso horário': ('Fuseau horaire', 'Fuso orario', 'Time zone'),
  'Faixa de código postal': ('Code postal', 'CAP', 'Postal code range'),
  'Código de área (DDD)': ('Indicatif téléphonique', 'Prefisso telefonico', 'Area code'),
  'Código do país no telefone': ('Indicatif pays', 'Prefisso internazionale', 'Country dialling code'),
  'Fotos e brasão': ('Photos et blason', 'Foto e stemma', 'Photos and coat of arms'),
  'Volante/mão de direção': ('Sens de conduite', 'Senso di marcia', 'Driving side'),
  'Distância até ': ('Distance jusqu’à ', 'Distanza fino a ', 'Distance to '),
  'onde ficar': ('hébergement', 'dove alloggiare', 'where to stay'),
  'comer': ('manger', 'mangiare', 'eating'),
  'Código telefônico': ('Indicatif téléphonique', 'Prefisso telefonico', 'Dialling code'),
  'Idiomas oficiais': ('Langues officielles', 'Lingue ufficiali', 'Official languages'),
  'Cidades vizinhas (da sua base)': ('Villes voisines (de notre base)', 'Città vicine (della nostra base)', 'Neighbouring cities (in our base)'),
  'Aeroportos mais próximos': ('Aéroports les plus proches', 'Aeroporti più vicini', 'Nearest airports'),
  'Rede de transporte de massa': ('Réseau de transports collectifs', 'Rete di trasporto pubblico', 'Public transport network'),
  'Estações de trem': ('Gares ferroviaires', 'Stazioni ferroviarie', 'Railway stations'),
  'Rodoviária/terminal': ('Gare routière', 'Autostazione', 'Bus terminal'),
  'Aeródromo cadastrado': ('Aérodrome recensé', 'Aeroporto censito', 'Registered airfield'),
  'Para onde ir daqui': ('Où aller d’ici', 'Dove andare da qui', 'Where to go from here'),
  'chuva (mm)': ('pluie (mm)', 'pioggia (mm)', 'rain (mm)'),
  'dias com chuva': ('jours de pluie', 'giorni di pioggia', 'rain days'),
  'sol (h/dia)': ('soleil (h/jour)', 'sole (h/giorno)', 'sun (h/day)'),
  'máx.': ('max.', 'max.', 'max.'),
  'mín.': ('min.', 'min.', 'min.'),
  'turista': ('à visiter', 'da vedere', 'things to do'),
  'hospedagem': ('où loger', 'dove dormire', 'where to stay'),
  'comida': ('manger', 'mangiare', 'where to eat'),
  'transporte': ('transports', 'trasporti', 'transport'),
  'compras': ('courses', 'shopping', 'shopping'),
  'serviços': ('services', 'servizi', 'services'),
  'emergência': ('urgences', 'emergenze', 'emergency'),
  'morar': ('habiter', 'vivere', 'moving here'),
  'emprego': ('emploi', 'lavoro', 'jobs'),
  'empresas': ('entreprises', 'aziende', 'companies'),
  'clima': ('climat', 'clima', 'weather'),
  'eventos': ('événements', 'eventi', 'events'),
  'cultura': ('culture', 'cultura', 'culture'),
  'esporte': ('sport', 'sport', 'sports'),
  'família': ('en famille', 'in famiglia', 'with kids'),
  'acessível': ('accessibilité', 'accessibilità', 'accessibility'),
  'pets': ('animaux', 'animali', 'pets'),
  'arredores': ('alentours', 'dintorni', 'nearby'),
  'perguntas': ('questions', 'domande', 'questions'),
  'à noite': ('la vie nocturne', 'vita notturna', 'nightlife')}


TIT_INST = {  # título de cada classe de instituição, por idioma (pt é o da chave ORDEM)
 'universidade': {'fr': 'Universités et écoles supérieures', 'it': 'Università e facoltà', 'en': 'Universities and colleges'},
 'escola': {'fr': 'Écoles', 'it': 'Scuole', 'en': 'Schools'},
 'biblioteca': {'fr': 'Bibliothèques', 'it': 'Biblioteche', 'en': 'Libraries'},
 'museu': {'fr': 'Musées', 'it': 'Musei', 'en': 'Museums'},
 'hospital': {'fr': 'Hôpitaux', 'it': 'Ospedali', 'en': 'Hospitals'},
 'teatro': {'fr': 'Théâtres', 'it': 'Teatri', 'en': 'Theatres'},
 'estadio': {'fr': 'Stades et arenas', 'it': 'Stadi e arene', 'en': 'Stadiums and arenas'},
 'metro': {'fr': 'Réseaux de transport', 'it': 'Reti di trasporto', 'en': 'Transit networks'},
 'estacao_trem': {'fr': 'Gares', 'it': 'Stazioni ferroviarie', 'en': 'Railway stations'},
 'rodoviaria': {'fr': 'Gares routières', 'it': 'Stazioni autobus', 'en': 'Bus stations'},
 'shopping': {'fr': 'Centres commerciaux', 'it': 'Centri commerciali', 'en': 'Shopping malls'},
 'mercado': {'fr': 'Marchés couverts', 'it': 'Mercati coperti', 'en': 'Market halls'},
 'zoo': {'fr': 'Zoo', 'it': 'Giardini zoologici', 'en': 'Zoos'},
 'aqua': {'fr': 'Aquariums', 'it': 'Acquari', 'en': 'Aquariums'},
 'park': {'fr': 'Parcs urbains', 'it': 'Parchi urbani', 'en': 'Urban parks'},
 'palacio': {'fr': 'Hôtels de ville', 'it': 'Municipi', 'en': 'City halls'},
 'igreja_cat': {'fr': 'Cathédrales', 'it': 'Cattedrali', 'en': 'Cathedrals'},
 'empresa': {'fr': 'Sièges sociaux', 'it': 'Sedi di aziende', 'en': 'Companies headquartered here'},
}

FRASES = {'dado de': ('donnée de', 'dato del', 'data from'),
         'área de': ('superficie de', 'superficie di', 'area of'),
         'melhor época: ': ('meilleure saison : ', 'periodo migliore: ', 'best season: '),
         'de carro': ('en voiture', 'in auto', 'by car'),
         'visitas/mês': ('visites/mois', 'visite/mese', 'views/month'),
         'nos 3 meses recentes': ('sur les 3 derniers mois', 'negli ultimi 3 mesi', 'over the last 3 months'),
         'Medição pública da API de pageviews da Wikimedia (13 meses).': (
             'Mesure publique de l\u2019API de pageviews de Wikimedia (13 mois).',
             'Misurazione pubblica dall\u2019API pageviews di Wikimedia (13 mesi).',
             'Public measurement from the Wikimedia pageviews API (13 months).'),
         'sugestões autênticas do autocompletar do Google': (
             'suggestions authentiques de l\u2019autocomplétion de Google',
             'suggerimenti autentici dell\u2019autocomplete di Google',
             'genuine Google autocomplete suggestions'),
         'idioma': ('langue', 'lingua', 'language'),
         'coletadas em': ('collectées le', 'raccolte il', 'collected on'),
         'a ordem é a do Google e nada foi acrescentado. Sugestão que não existe não aparece.': (
             'l\u2019ordre est celui de Google et rien n\u2019a été ajouté. Une suggestion qui n\u2019existe pas n\u2019apparaît pas.',
             'l\u2019ordine è quello di Google e non è stato aggiunto nulla. Un suggerimento che non esiste non appare.',
             'the order is Google\u2019s and nothing was added. A suggestion that does not exist does not appear.'),
         'Fatos do Wikidata, fuso da base IANA e relevo/clima do Open-Meteo — consultados em': (
             'Faits issus de Wikidata, fuseau de la base IANA et relief/climat d\u2019Open-Meteo \u2014 consultés le',
             'Dati da Wikidata, fuso orario dalla base IANA e rilievo/clima da Open-Meteo \u2014 consultati il',
             'Facts from Wikidata, time zone from the IANA database, elevation/climate from Open-Meteo \u2014 consulted on'),
         'Onde a fonte não tem o dado, a linha não aparece.': (
             'Là où la source n\u2019a pas la donnée, la ligne n\u2019apparaît pas.',
             'Dove la fonte non ha il dato, la riga non appare.',
             'Where the source has no value, the line does not appear.'),
         'empregados': ('salariés', 'dipendenti', 'employees'), 'site': ('site', 'sito', 'website'),
         'em linha reta': ('en ligne droite', 'in linea d’aria', 'in a straight line'), 'Distâncias em linha reta sobre as coordenadas do Wikidata; o tempo de carro é estimativa (1,25× a distância a 80 km/h). O link abre a rota real no mapa.': ('Distances en ligne droite calculées sur les coordonnées Wikidata ; le temps de trajet est une estimation (1,25× la distance à 80 km/h). Le lien ouvre l’itinéraire réel sur la carte.', 'Distanze in linea d’aria calcolate sulle coordinate Wikidata; il tempo in auto è una stima (1,25× la distanza a 80 km/h). Il link apre il percorso reale sulla mappa.', 'Straight-line distances from the Wikidata coordinates; the driving time is an estimate (1.25× the distance at 80 km/h). The link opens the real route on the map.'), 'Sem JavaScript: procure no mapa —': ('Sans JavaScript : cherchez sur la carte —', 'Senza JavaScript: cerca sulla mappa —', 'Without JavaScript: search on the map —'), '© contribuidores OpenStreetMap (ODbL); a consulta é feita pelo seu navegador com cache local de 6 h.': ('© contributeurs OpenStreetMap (ODbL)\xa0; la requête est faite par votre navigateur, avec un cache local de 6 h.', '© contributori OpenStreetMap (ODbL); la consulta è fatta dal tuo browser con cache locale di 6 h.', '© OpenStreetMap contributors (ODbL); the query runs in your browser with a 6-hour local cache.'), 'Entidades registradas no Wikidata para esta cidade — o Wikidata é incompleto de propósito; para a lista viva por bairro, use o painel abaixo.': ('Entités enregistrées dans Wikidata pour cette ville — Wikidata est volontairement incomplet ; pour la liste vivante par quartier, utilisez le panneau plus bas.', 'Entità registrate su Wikidata per questa città — Wikidata è incompleto di proposito; per la lista viva per quartiere usa il pannello più sotto.', 'Entities recorded on Wikidata for this city — Wikidata is deliberately incomplete; for the live list by neighbourhood, use the panel below.'), 'Médias calculadas por este projeto de': ('Moyennes calculées par ce projet à partir de', 'Medie calcolate da questo progetto su', 'Means computed by this project from'), 'anos de reanálise diária (Open-Meteo ERA5/best-match, grade ≈ 1–25 km).': ('ans de réanalyse quotidienne (Open-Meteo ERA5/best-match, grille ≈ 1–25 km).', 'anni di rianalisi giornaliera (Open-Meteo ERA5/best-match, griglia ≈ 1–25 km).', 'years of daily reanalysis (Open-Meteo ERA5/best-match, grid ≈ 1–25 km).'), 'O bloco “agora” é lido ao vivo no seu navegador — por isso ele nunca fica desatualizado.': ('Le bloc\xa0« maintenant » est lu en direct dans votre navigateur\xa0: il ne peut donc pas dater.', 'Il blocco “adesso” è letto in diretta nel tuo browser: per questo non diventa mai obsoleto.', 'The “now” box is read live in your browser — that is why it never goes stale.'), 'sem voo regular': ('sans vol régulier', 'senza voli regolari', 'no scheduled flights'), 'desde': ('depuis', 'dal', 'since'), 'aqui,': ('ici,', 'qui,', 'here,')}


def tt(pag, frase):
    """traduz uma frase do painel (fr/it/en); sem par, deixa a original."""
    if pag not in ('fr', 'it', 'en'):
        return frase
    tr = FRASES.get(frase)
    return tr[{'fr': 0, 'it': 1, 'en': 2}[pag]] if tr else frase


def rotulo(k, pag):
    """traduz o rótulo da linha (fr/it/en); sem tradução, deixa como está — nunca inventa."""
    if pag not in ('fr', 'it', 'en'):
        return k
    ix = {'fr': 0, 'it': 1, 'en': 2}[pag]
    if k in TRAD:
        return TRAD[k][ix]
    for base, tr in TRAD.items():
        if base.endswith(' ') and k.startswith(base):
            return tr[ix] + k[len(base):]
    return k


def dl(rows, pag='pt'):
    if not rows:
        return ''
    o = ['<dl class="p7num" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(300px,1fr));'
         'gap:0 22px;margin:0;font-size:.9rem">']
    for k, v in rows:
        o.append('<div style="display:flex;gap:10px;justify-content:space-between;align-items:baseline;'
                 'border-bottom:1px dotted #334155;padding:3px 0">'
                 f'<dt style="color:#94a3b8;margin:0">{esc(rotulo(k, pag))}</dt>'
                 f'<dd style="margin:0;text-align:right"><strong>{v}</strong></dd></div>')
    o.append('</dl>')
    return ''.join(o)


def bloco_fachada(ctx, pi, fac, cli, pag, nat):
    if not fac:
        return '', {}, None
    langs = [x for x in dict.fromkeys([pag, 'pt' if pag == 'pt-BR' else pag, nat, 'en']) if x]
    cc = pi['cc'].upper()
    pQ = (one(fac, 'P17') or {}).get('v')
    p = ctx['pai'].get(pQ) or {}
    rows = []
    v = one(fac, 'P1448')
    if v:
        rows.append(('Nome oficial', esc(v['v'])))
    v = one(fac, 'P1449')
    if v:
        rows.append(('Nome popular', esc(v['v'])))
    v = one(fac, 'P1549')
    if v:
        rows.append(('Gentílico', esc(v['v'])))
    v = one(fac, 'P571')
    if v and str(v['v'])[:4] != '0000':
        t = str(v['v'])
        txt = t[:4]
        if t[5:7] != '00':
            txt = f'{t[8:10]}/{t[5:7]}/{t[:4]}'
        rows.append(('Fundação', esc(txt)))
    if p:
        iso = (p.get('P297') or [{}])[0].get('v')
        nome_pais = lab_of(ctx, pQ, langs) or pi['country']
        rows.append(('País', esc(nome_pais + (f' [{iso}]' if iso else ''))))
        moe = (p.get('P38') or [{}])[0].get('v')
        if moe:
            m = lab_of(ctx, moe, langs)
            if m:
                rows.append(('Moeda', esc(m)))
        ddi = (p.get('P474') or [{}])[0].get('v')
        if ddi:
            rows.append(('Código do país no telefone', esc(ddi)))
        v2 = one(fac, 'P2051')
        if v2:
            rows.append(('Código de área (DDD)', esc(str(v2['v'])[:16])))
        cont = (p.get('P30') or [{}])[0].get('v')
        if cont:
            m = lab_of(ctx, cont, langs)
            if m:
                rows.append(('Continente', esc(m)))
        lado = (p.get('P1622') or [{}])[0].get('v')
        if lado:
            m = {'Q21018443': 'esquerda', 'Q106692244': 'direita'}.get(lado)
            if m:
                rows.append(('Volante/mão de direção', esc('dirige-se pela ' + m if pag.startswith('pt')
                                                            else 'drive on the ' + m)))
        cap = (p.get('P36') or [{}])[0].get('v')
        if cap and coord_of(fac) and cap != (fac or {}).get('qid'):
            cn = lab_of(ctx, cap, langs) or ''
            km = haversine(coord_of(fac), coord_of(ctx['fac_q'].get(cap)))
            if cn and km:
                rows.append((f'Distância até {cn}', esc(f'{nfmt(km, pag, 0)} km ' + tt(pag, 'em linha reta'))))
    v = one(fac, 'P131')
    if v:
        rn = lab_of(ctx, v['v'], langs)
        if rn:
            rows.append(('Região/estado', esc(rn)))
    for prop, lbl in (('P300', 'Código ISO 3166-2'), ('P1585', 'Código IBGE'), ('P374', 'Código municipal'),
                      ('P439', 'Código de municipalidade')):
        x = one(fac, prop)
        if x:
            rows.append((lbl, esc(str(x['v'])[:16])))
    co = coord_of(fac)
    if co:
        la, lo = round(co[0], 5), round(co[1], 5)
        rows.append(('Coordenadas',
                     f'<a href="https://www.openstreetmap.org/?mlat={la}&amp;mlon={lo}#map=12/{la}/{lo}" '
                     f'target="_blank" rel="noopener nofollow">{la}, {lo}</a>'))
    x = one(fac, 'P2044')
    if x and x.get('v'):
        rows.append(('Altitude', esc(f'{nfmt(x["v"], pag, 0)} m')))
    elif cli and cli.get('elev_om'):
        rows.append(('Altitude (modelo de relevo)', esc(f'{nfmt(cli["elev_om"], pag, 0)} m')))
    pop, ar = one(fac, 'P1082'), one(fac, 'P2046')
    if pop and pop.get('v'):
        rows.append(('População', esc(nfmt(pop['v'], pag) + (f' ({pop["y"]})' if pop.get('y') else ''))))
    if ar and ar.get('v'):
        rows.append(('Área', esc(f'{nfmt(ar["v"], pag, 0)} km²')))
        if pop and pop.get('v'):
            rows.append(('Densidade', esc(f'{nfmt(pop["v"] / max(ar["v"], 0.01), pag)} hab/km² '
                                         '<small>(calculada)</small>')))
    for prop, lbl, div, suf in (('P2131', 'PIB nominal', 1e9, ' bi US$'), ('P2132', 'PIB per capita', 1, ' US$')):
        x = one(fac, prop)
        if x and x.get('v'):
            rows.append((lbl, esc(nfmt(x['v'] / div, pag, 1 if div > 1 else 0) + suf
                                 + (f' ({x["y"]})' if x.get('y') else ''))))
    x = one(fac, 'P281')
    if x:
        rows.append(('Faixa de código postal', esc(str(x['v'])[:30])))
    tzr = tz_info((cli or {}).get('tz'))
    if tzr:
        s = f'UTC{"+" if tzr["inverno"] >= 0 else "−"}{abs(tzr["inverno"]):g}'
        if tzr['dst']:
            s += f' · UTC+{tzr["verao"]:g} no verão'
            if tzr['tr']:
                septr = {'pt': ' e ', 'fr': ' et ', 'it': ' e ', 'en': ' and '}.get(pag, ' e ')
                s += f' (virou {septr.join(tzr["tr"])} em {tzr["ano"]})'
        else:
            s += ' · sem horário de verão'
        rows.append(('Fuso horário', esc(s)))
    ids = []
    for prop in ('P37', 'P42'):
        for z in (fac.get(prop) or [])[:4]:
            m = lab_of(ctx, z.get('v'), langs)
            if m and m not in ids:
                ids.append(m)
    if ids:
        rows.append(('Idiomas oficiais/usados', esc(', '.join(ids[:7]))))
    x = one(fac, 'P856')
    if x and str(x['v']).startswith('http'):
        rows.append(('Site oficial', f'<a href="{esc(x["v"])}" target="_blank" rel="noopener nofollow">'
                                    f'{esc(x["v"].replace("https://", "").replace("http://", "").split("/")[0])}</a>'))
    x = one(fac, 'P1566')
    if x:
        rows.append(('GeoNames', f'<a href="https://www.geonames.org/{esc(str(x["v"]))}" target="_blank" '
                                f'rel="noopener nofollow">{esc(str(x["v"]))}</a>'))
    x = one(fac, 'P373')
    if x:
        rows.append(('Fotos e brasão', f'<a href="https://commons.wikimedia.org/wiki/Category:'
                                       f'{urllib.parse.quote(str(x["v"]).replace(" ", "_"))}" '
                                       'target="_blank" rel="noopener nofollow">Wikimedia Commons</a>'))
    corpo = dl(rows, pag)

    def lista_ent(prop, titulo, maxn=12):
        itens = []
        for z in (fac.get(prop) or []):
            q = z.get('v')
            if not isinstance(q, str) or not q.startswith('Q'):
                continue
            nm = None
            href = None
            for ck in ctx['by_qid'].get(q, []):
                cdd = ctx['cities'].get(ck)
                if cdd:
                    nm = cdd['city']
                    if (cdd['cc'], cdd['slug']) in ctx['per_site'].get(pi['_site'] or '', set()):
                        href = f'/{cdd["cc"]}/{cdd["slug"]}.html'
                    break
            nm = nm or lab_of(ctx, q, langs)
            if not nm or S2.looks_technical(nm):
                continue
            km = haversine(co, coord_of(ctx['fac_q'].get(q))) if co else None
            txt = esc(nm) + (f' <span style="color:#94a3b8">{nfmt(km, pag, 0)} km</span>' if km else '')
            itens.append(f'<a href="{href}">{txt}</a>' if href else txt)
            if len(itens) >= maxn:
                break
        if not itens:
            return ''
        return (f'<p class="sub" style="margin:11px 0 4px;color:#94a3b8;font-size:.86rem">{esc(titulo)}</p>'
                '<ul style="list-style:none;display:flex;flex-wrap:wrap;gap:6px;margin:0;padding:0">'
                + ''.join(f'<li style="border:1px solid #334155;border-radius:999px;padding:2px 10px;'
                          f'font-size:.85rem">{x}</li>' for x in itens) + '</ul>')

    corpo += lista_ent('P47', {'pt': 'Vizinhas', 'fr': 'Voisines', 'it': 'Confinanti', 'en': 'Neighbours'}
                      .get(pag, 'Vizinhas'))
    corpo += lista_ent('P150', {'pt': f'{len(fac.get("P150") or [])} subdivisões cadastradas (bairros, distritos, regiões)',
                                'fr': 'subdivisions recensées (quartiers, districts)',
                                'it': 'suddivisioni censite (quartieri, distretti)',
                                'en': 'recorded subdivisions (neighbourhoods, districts)'}
                       .get(pag, 'subdivisões cadastradas'))
    corpo += lista_ent('P190', {'pt': 'Cidades-irmãs', 'fr': 'Villes jumelées', 'it': 'Gemellaggi',
                                'en': 'Sister cities'}.get(pag, 'Cidades-irmãs'), 10)
    fr = []
    if pop and pop.get('v'):
        fr.append(esc(f'{pi["city"]} tem {nfmt(pop["v"], pag)} habitantes'
                      + (f' ({tt(pag, "dado de")} {pop["y"]})' if pop.get('y') else '')))
    if ar and ar.get('v'):
        fr.append(esc(f'{tt(pag, "área de")} {nfmt(ar["v"], pag, 0)} km²'))
    if x and x.get('v'):
        pass
    if cli and cli.get('melhor'):
        M = MESES.get(pag if pag in MESES else 'pt')
        fr.append(esc(tt(pag, 'melhor época: ') + ', '.join(M[i] for i in cli['melhor'][:3])))
    if fr:
        corpo += f'<p style="margin:12px 0 0;font-size:.95rem">{"; ".join(fr)}.</p>'
    corpo += (f'<p style="margin:7px 0 0;color:#94a3b8;font-size:.78rem">'
              f'{esc(tt(pag, "Fatos do Wikidata, fuso da base IANA e relevo/clima do Open-Meteo — consultados em"))}'
              f' {COLHIDO}. {esc(tt(pag, "Onde a fonte não tem o dado, a linha não aparece."))}</p>')
    st = {'fachada_linhas': len(rows)}
    return corpo, st, co


def bloco_nomes(ctx, fac, pi, pag, nat):
    if not fac:
        return '', {}
    lab = fac.get('labels') or {}
    pares = [(L, v) for L, v in lab.items() if v and len(v) < 48 and not S2.looks_technical(v)]
    if len(pares) < 3:
        return '', {}
    langs = [x for x in dict.fromkeys([pag, 'pt' if pag == 'pt-BR' else pag, nat, 'en']) if x]
    PRI = set(langs) | {'en', 'es', 'de', 'fr', 'it', 'ru', 'zh', 'ja', 'ar', 'hi', 'nl', 'pl', 'tr',
                        'sv', 'uk', 'he', 'ca', 'gl', 'eu', 'ko', 'fa', 'th', 'vi', 'id', 'ms', 'el',
                        'cs', 'da', 'fi', 'no', 'nb', 'hu', 'ro', 'bg', 'sr', 'hr', 'sk', 'sl', 'lt',
                        'lv', 'et', 'ga', 'mt', 'is', 'mk', 'sq', 'hy', 'ka', 'az', 'kk', 'uz', 'bn',
                        'ta', 'te', 'ml', 'kn', 'mr', 'gu', 'pa', 'ur', 'ne', 'si', 'km', 'lo', 'my',
                        'am', 'ti', 'sw', 'yo', 'ig', 'ha', 'zu', 'xh', 'af', 'st', 'so', 'rw', 'lg'}
    def ordem(x):
        return (langs.index(x[0]) if x[0] in langs else (0 if x[0] in PRI else 1), x[0])
    pares.sort(key=ordem)
    idx_pri = {i for i, x in enumerate(pares) if x[0] in PRI}
    pri = [x for i, x in enumerate(pares) if i in idx_pri][:28]
    primeiros = {id(x) for x in pri}
    resto = [x for x in pares if id(x) not in primeiros]
    cab = {'pt': ('Idioma', 'Como se chama', 'Outros nomes e formas registradas'),
           'fr': ('Langue', 'Nom', 'Autres noms et formes relevés'),
           'it': ('Lingua', 'Nome', 'Altri nomi e forme rilevate'),
           'en': ('Language', 'Name', 'Other recorded names')}[pag if pag in ('pt', 'fr', 'it', 'en') else 'pt']
    celulas = ''.join(f'<tr><th scope="row" style="text-align:left;color:#94a3b8;font-weight:600;'
                      f'padding-right:12px">{esc(L.upper())}</th><td>{esc(v)}</td></tr>' for L, v in pri)
    alc = []
    for L, arr in (fac.get('aliases') or {}).items():
        for a in arr[:4]:
            if a and a not in alc and len(a) < 64 and not S2.looks_technical(a):
                alc.append(a)
    corpo = ('<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(230px,1fr));gap:0 26px">'
             f'<table style="font-size:.88rem;border-collapse:collapse;width:100%"><thead><tr>'
             f'<th scope="col" style="text-align:left;color:#94a3b8">{esc(cab[0])}</th>'
             f'<th scope="col" style="text-align:left;color:#94a3b8">{esc(cab[1])}</th></tr></thead>'
             f'<tbody>{celulas}</tbody></table>')
    if alc:
        corpo += (f'<div><p class="sub" style="margin:0 0 5px;color:#94a3b8;font-size:.86rem">{esc(cab[2])}</p>'
                  '<ul style="margin:0;padding-left:18px;font-size:.9rem">'
                  + ''.join(f'<li>{esc(x)}</li>' for x in alc[:12]) + '</ul></div>')
    corpo += '</div>'
    if resto:
        corpo += ('<details style="margin-top:9px"><summary style="cursor:pointer;color:#a78bfa;font-size:.86rem">'
                  f'+ {len(resto)} idiomas no registro</summary><p style="font-size:.84rem;color:#cbd5e1;'
                  'margin:8px 0 0">' + ' · '.join(f'<b>{esc(L.upper())}</b> {esc(v)}' for L, v in resto[:60])
                  + '</p></details>')
    return corpo, {'nomes_idiomas': len(pares)}


def bloco_clima(ctx, cli, pi, pag, co):
    if not cli or not cli.get('tmax'):
        return '', {}
    M = MESES.get(pag if pag in MESES else 'pt')
    def linha(nome, arr, fmt=None):
        fmt = fmt or (lambda x: nfmt(x, pag, 0))
        cells = ''.join(f'<td style="text-align:right;padding:2px 5px">{fmt(v) if v is not None else "—"}</td>'
                        for v in arr)
        return (f'<tr><th scope="row" style="text-align:left;color:#94a3b8;font-weight:600;'
                f'padding-right:10px;white-space:nowrap">{esc(rotulo(nome, pag))}</th>{cells}</tr>')
    cab = ''.join(f'<th scope="col">{esc(m[:3].capitalize())}</th>' for m in M)
    t = ('<div style="overflow-x:auto"><table class="p7clima" style="font-size:.84rem;border-collapse:collapse;'
         f'width:100%"><thead><tr><th></th>{cab}</tr></thead><tbody>'
         + linha('máx.', cli['tmax'], lambda x: nfmt(x, pag, 1) + '°')
         + linha('mín.', cli['tmin'] or [], lambda x: nfmt(x, pag, 1) + '°'))
    if cli.get('chuva'):
        t += linha('chuva (mm)', cli['chuva'])
    if cli.get('molhado'):
        t += linha('dias com chuva', cli['molhado'])
    if cli.get('sol') and any(x for x in cli['sol'] if x):
        t += linha('sol (h/dia)', cli['sol'], lambda x: nfmt(x, pag, 1))
    t += '</tbody></table></div>'
    rod = []
    EXT = {'quentes': ('mais quentes', 'les plus chauds', 'i più caldi', 'the warmest'),
           'frios': ('mais frios', 'les plus froids', 'i più freddi', 'the coldest'),
           'chanosos': ('mais chuvosos', 'les plus pluvieux', 'i più piovosi', 'the wettest'),
           'secos': ('mais secos', 'les plus secs', 'i più secchi', 'the driest')}
    ix4 = {'fr': 1, 'it': 2, 'en': 3}.get(pag, 0)
    for k in EXT:
        v = cli.get(k)
        if v:
            rod.append(esc(EXT[k][ix4]) + ': <b>' + ', '.join(M[i] for i in v[:3]) + '</b>')
    if rod:
        t += '<p style="margin:9px 0 0;font-size:.9rem">' + ' · '.join(rod) + '</p>'
    if cli.get('melhor'):
        t += ('<p style="margin:8px 0 0"><strong>'
              + {'pt': 'Melhor época para ir: ', 'fr': 'Meilleure période : ', 'it': 'Periodo migliore: ',
                 'en': 'Best time to go: '}.get(pag, 'Melhor época para ir: ')
              + esc(', '.join(M[i] for i in cli['melhor'][:4])) + '.</strong></p>')
    la, lo = (co if co else ('', ''))
    if la != '' and lo != '':
        aguarda = {'pt': 'Consultando o tempo agora…', 'fr': 'Lecture de la meteo en cours…',
                   'it': 'Lettura del meteo in corso…', 'en': 'Reading the live weather…'}.get(pag, 'Consultando o tempo agora…')
        t += (f'<div class="p7-agora" data-lat="{la}" data-lon="{lo}" data-tz="{esc(cli.get("tz") or "")}"'
              ' data-city="' + esc(pi['city']) + '" data-lang="' + esc(pag) + '"'
              ' style="margin:11px 0 0;padding:11px 13px;border:1px solid #334155;border-radius:12px;'
              f'font-size:.9rem"><span style="color:#94a3b8">{esc(aguarda)}</span></div>')
    t += (f'<p style="margin:8px 0 0;font-size:.78rem;color:#94a3b8">{esc(tt(pag, "Médias calculadas por este projeto de"))} '
          f'{cli.get("n_anos", 3)} {esc(tt(pag, "anos de reanálise diária (Open-Meteo ERA5/best-match, grade \u2248 1\u201325 km)."))} '
          f'{esc(tt(pag, "O bloco \u201cagora\u201d é lido ao vivo no seu navegador \u2014 por isso ele nunca fica desatualizado."))}</p>')
    return t, {'clima_tabela': 1}


def bloco_mob(ctx, pi, fac, ent, pag, nat, co, site):
    if not co and not ent:
        return '', {}
    langs = [x for x in dict.fromkeys([pag, 'pt' if pag == 'pt-BR' else pag, nat, 'en']) if x]
    rows, st = [], {}
    aers = nearest_airports(ctx, co)
    if aers:
        itens = []
        for km, a in aers[:3]:
            nm = a['n'] if len(a['n']) < 58 else a['n'][:55] + '…'
            dv = drive_est(km)
            txt = (f'<a href="https://www.google.com/maps/dir/?api=1&amp;destination={a["la"]},{a["lo"]}"'
                   f' target="_blank" rel="noopener nofollow">{esc(nm + (f" ({a["iata"]})" if a["iata"] else ""))}</a> '
                   f'<span style="color:#94a3b8">{nfmt(km, pag, 0)} km'
                   + (f' · ≈ {dv} {tt(pag, "de carro")}' if dv else '')
                   + ('' if a['sched'] else ' · ' + tt(pag, 'sem voo regular')) + '</span>')
            itens.append(txt)
        rows.append(('Aeroportos mais próximos', '<br>'.join(itens)))
        st['aeroportos'] = len(aers)
    grupos = (ent or {}).get('grupos') or {}
    for k, lbl in (('metro', 'Rede de transporte de massa'), ('estacao_trem', 'Estações de trem'),
                   ('rodoviaria', 'Rodoviária/terminal'), ('aeroporto', 'Aeródromo cadastrado')):
        lst = grupos.get(k) or []
        if not lst:
            continue
        nomez = []
        for it in lst[:3]:
            nm = lab_of(ctx, it.get('q'), langs)
            if not nm:
                continue
            s = esc(nm)
            if it.get('P856') and str(it['P856']).startswith('http'):
                s = f'<a href="{esc(it["P856"])}" target="_blank" rel="noopener nofollow">{s}</a>'
            if it.get('P571'):
                s += f' <span style="color:#94a3b8">{esc(tt(pag, "desde"))} {str(it["P571"])[:4]}</span>'
            nomez.append(s)
        if nomez:
            rows.append((lbl, '<br>'.join(nomez)))
    if co:
        prox = []
        for z in (fac or {}).get('P47', []):
            q = z.get('v')
            if not isinstance(q, str):
                continue
            cf = ctx['fac_q'].get(q)
            km = haversine(co, coord_of(cf)) if cf else None
            if not km:
                continue
            nm = None
            href = None
            for ck in ctx['by_qid'].get(q, []):
                cdd = ctx['cities'].get(ck)
                if cdd:
                    nm = cdd['city']
                    if (cdd['cc'], cdd['slug']) in ctx['per_site'].get(site, set()):
                        href = f'/{cdd["cc"]}/{cdd["slug"]}.html'
                    break
            nm = nm or lab_of(ctx, q, langs)
            if nm:
                prox.append((km, nm, href))
        prox.sort()
        if prox:
            cells = []
            for km, nm, href in prox[:6]:
                dv = drive_est(km)
                txt = f'{esc(nm)} · {nfmt(km, pag, 0)} km' + (f' · ≈ {dv}' if dv else '')
                cells.append(f'<a href="{href}">{txt}</a>' if href else txt)
            rows.append(('Cidades vizinhas (da sua base)', '<br>'.join(cells)))
        # para onde ir a partir daqui (só destinos que têm página neste site)
        buck = {}
        for ck, cdd in ctx['cities'].items():
            if cdd['cc'] != pi['cc'] or (cdd['cc'], cdd['slug']) not in ctx['per_site'].get(site, set()):
                continue
            if ck == pi['_ckey']:
                continue
            km = haversine(co, coord_of(ctx['fac'].get(ck)))
            if not km or km < 25:
                continue
            hh = km * 1.25 / 80
            b = 1 if hh <= 1.2 else 2 if hh <= 2.2 else 3 if hh <= 3.5 else 5
            buck.setdefault(b, []).append((km, cdd))
        blocos = []
        for b in (1, 2, 3, 5):
            lst = sorted(buck.get(b, []), key=lambda x: x[0])[:6]
            if not lst:
                continue
            T = {'pt': f'a até {b} h de carro', 'fr': f"jusqu’à {b} h de voiture",
                 'it': f'fino a {b} h in auto', 'en': f'within {b} h by car'}
            def nome_cidade(c):
                qq = next((x for x in ctx['by_qid'].get((ctx['fac'].get(c['ckey']) or {}).get('qid') or '', [])), None)
                return (lab_of(ctx, (ctx['fac'].get(c['ckey']) or {}).get('qid'), langs)
                        or c.get('city') or c['slug'].replace('-', ' '))
            links = ', '.join(f'<a href="/{c["cc"]}/{c["slug"]}.html">{esc(nome_cidade(c))}</a>' for km2, c in lst)
            blocos.append(f'<p style="margin:5px 0;font-size:.9rem"><b>{esc(T.get(pag, T["pt"]))}</b>: {links}</p>')
            st['proximos'] = st.get('proximos', 0) + len(lst)
        if blocos:
            rows.append(('Para onde ir daqui', ''.join(blocos)))
    if not rows:
        return '', {}
    corpo = dl(rows, pag) + ('<p style="margin:8px 0 0;font-size:.78rem;color:#94a3b8">'
                             + tt(pag, 'Distâncias em linha reta sobre as coordenadas do Wikidata; o tempo de '
                                       'carro é estimativa (1,25× a distância a 80 km/h). O link abre a rota '
                                       'real no mapa.') + '</p>')
    return corpo, st


def bloco_busca(ctx, pi, sug, pv, pag):
    partes, st = [], {}
    if sug and sug.get('cats'):
        CT = {'turista': 'turista', 'hospedagem': 'onde ficar', 'comida': 'comer', 'transporte': 'transporte',
              'compras': 'compras', 'servicos': 'serviços', 'emergencia': 'emergência', 'moradia': 'morar',
              'emprego': 'emprego', 'empresa': 'empresas', 'clima': 'clima', 'eventos': 'eventos',
              'cultura': 'cultura', 'esporte': 'esporte', 'familia': 'família', 'acessibilidade': 'acessível',
              'pets': 'pets', 'perto': 'arredores', 'perguntas': 'perguntas', 'vida_noturna': 'à noite'}
        blocos, total, vistas = [], 0, 0
        for cat, items in sorted(sug['cats'].items())[:12]:
            chips = []
            for it in items[:6]:
                qq = it['q'] if isinstance(it, dict) else it
                total += 1
                chips.append(f'<li>{esc(qq)}</li>')
            vistas += len(chips)
            if chips:
                blocos.append('<div style="margin:0 0 9px"><p class="p7sub">' + esc(rotulo(CT.get(cat, cat), pag))
                              + '</p><ul class="p7chips">' + ''.join(chips) + '</ul></div>')
        total_disp = total
        if blocos:
            corpo = ('<div class="p7geo">' + ''.join(blocos) + '</div>'
                     f'<p class="p7nota">{nfmt(total_disp, pag)} {esc(tt(pag, "sugestões autênticas do autocompletar do Google"))} '
                     f'({esc(tt(pag, "idioma"))} {esc(sug.get("lang") or pag)}), {esc(tt(pag, "coletadas em"))} {COLHIDO}; '
                     f'{esc(tt(pag, "a ordem é a do Google e nada foi acrescentado. Sugestão que não existe não aparece."))}</p>')
            partes.append(corpo)
            st['chips'] = total
    if pv and pv.get('s'):
        T = {'pt': 'Wikipedia em português', 'en': 'Wikipedia em inglês', 'fr': 'Wikipédia em francês',
             'it': 'Wikipedia em italiano', 'es': 'Wikipedia em espanhol', 'de': 'Wikipedia em alemão'}
        lin = []
        for proj, d in sorted(pv['s'].items()):
            vw = d.get('views') or {}
            if not vw:
                continue
            vals = [vw[k] for k in sorted(vw)][-12:]
            med = sum(vals) // max(1, len(vals))
            txt = (f'{esc(T.get(proj, proj))} ({esc(d.get("t") or "")}): <b>{nfmt(med, pag)}</b> '
                   f'{esc(tt(pag, "visitas/mês"))}')
            if d.get('delta') is not None:
                txt += f' · {d["delta"]:+g}% {esc(tt(pag, "nos 3 meses recentes"))}'
            lin.append(txt)
        if lin:
            partes.append('<p style="margin:10px 0 0;font-size:.9rem">' + '<br>'.join(lin) +
                          f'<br><span style="color:#94a3b8;font-size:.78rem">'
                          f'{esc(tt(pag, "Medição pública da API de pageviews da Wikimedia (13 meses)."))}</span></p>')
            st['pageviews'] = 1
    return ''.join(partes), st


def bloco_inst(ctx, pi, ent, pag, nat):
    grupos = (ent or {}).get('grupos') or {}
    if not grupos:
        return '', {}
    totais = (ent or {}).get('totais') or {}
    # "8 de 8.436" — São Paulo tem escolas demais para uma lista; dizer o total é o que
    # transforma uma amostra em informação honesta.
    TDE = {'pt': 'de {} registrados', 'fr': 'sur {} recensés', 'it': 'su {} censiti',
           'en': 'of {} recorded'}
    langs = [x for x in dict.fromkeys([pag, 'pt' if pag == 'pt-BR' else pag, nat, 'en']) if x]
    ORDEM = [('universidade', 'Universidades e faculdades'), ('escola', 'Escolas'),
             ('biblioteca', 'Bibliotecas'), ('museu', 'Museus'), ('hospital', 'Hospitais'),
             ('teatro', 'Teatros'), ('estadio', 'Estádios e arenas'), ('metro', 'Redes de transporte'),
             ('estacao_trem', 'Estações de trem'), ('rodoviaria', 'Rodoviárias'), ('shopping', 'Shoppings'),
             ('mercado', 'Mercados'), ('zoo', 'Zoológicos'), ('aqua', 'Aquários'), ('park', 'Parques urbanos'),
             ('palacio', 'Prefeituras'), ('igreja_cat', 'Catedrais'), ('empresa', 'Empresas com sede aqui')]
    blocos, total = [], 0
    MAX_AGRUP, POR_AGRUP = 8, 4      # teto de peso: 8 grupos × 4 itens (~4 KB na maior cidade)
    for k, titulo in ORDEM:
        if len(blocos) >= MAX_AGRUP:
            break
        lst = grupos.get(k) or []
        linhas = []
        for it in lst:
            if len(linhas) >= POR_AGRUP:
                break
            nm = lab_of(ctx, it.get('q'), langs)
            if not nm:
                continue          # sem rótulo no idioma: item fora, mas a lista segue
            ex = []
            if it.get('P1128'):
                try:
                    ex.append(f'{nfmt(float(it["P1128"]), pag)} {tt(pag, "empregados")}')
                except (TypeError, ValueError):
                    pass
            desde = it.get('P571') or it.get('P1619')
            if desde:
                ex.append(tt(pag, 'desde') + ' ' + str(desde)[:4])
            sec_lbl = lab_of(ctx, it.get('P452'), langs) if it.get('P452') else None
            if sec_lbl:
                ex.append(sec_lbl)   # rótulo como está: baixar a primeira letra estragaria 'Microsoft'
            s = esc(nm) + (f' <span style="color:#94a3b8;font-size:.85rem">({esc(", ".join(ex[:3]))})</span>'
                           if ex else '')
            if it.get('P856') and str(it['P856']).startswith('http'):
                s += (f' <a href="{esc(it["P856"])}" target="_blank" rel="noopener nofollow" '
                      f'style="font-size:.82rem">{esc(tt(pag, "site"))}</a>')
            linhas.append(f'<li>{s}</li>')
            total += 1
        if linhas:
            tn = totais.get(k) or 0
            pos = ''
            if tn > len(linhas):      # amostra declarada: "4 de 8.436 registrados"
                pos = (' <span style="color:#64748b;font-weight:400">(' + str(len(linhas)) + ' '
                       + TDE.get(pag, TDE['pt']).format(nfmt(tn, pag)) + ')</span>')
            blocos.append('<div style="margin:0 0 9px"><p class="sub" style="margin:0 0 3px;color:#a78bfa;'
                          'font-size:.8rem;text-transform:uppercase;letter-spacing:.04em">'
                          + esc(TIT_INST.get(k, {}).get(pag, titulo)) + pos
                          + '</p><ul style="margin:0;padding-left:18px;font-size:.92rem">'
                          + ''.join(linhas) + '</ul></div>')
    if not blocos:
        return '', {}
    corpo = ('<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(290px,1fr));gap:2px 26px">'
             + ''.join(blocos) + '</div>'
             f'<p style="margin:8px 0 0;font-size:.78rem;color:#94a3b8">{esc(tt(pag, "Entidades registradas no Wikidata para esta cidade — o Wikidata é incompleto de propósito; para a lista viva por bairro, use o painel abaixo."))}</p>')
    return corpo, {'instituicoes': total}


def bloco_painel(ctx, pi, fac, co, pag):
    if not co:
        return '', {}
    raio = 9000
    ar = one(fac, 'P2046')
    if ar and ar.get('v'):
        raio = int(min(26000, max(4500, math.sqrt(ar['v'] * 1e6 / math.pi))))
    ix = LORDEM.get(pag if pag in LORDEM else 'pt', 0)
    abas = []
    for k in ORDEM_CATS:
        lab = list(CAT_LABEL[k].values())[ix]
        abas.append(f'<button type="button" class="p7tab" data-cat="{k}" aria-pressed="false">'
                    + esc(lab) + '</button>')
    nosc = ' · '.join(f'<a rel="noopener nofollow" target="_blank" href="https://www.openstreetmap.org/search?query='
                      + urllib.parse.quote(list(CAT_LABEL[k].values())[ix] + ' ' + pi['city']) + f'">{esc(list(CAT_LABEL[k].values())[ix])}</a>'
                      for k in ORDEM_CATS[:10])
    intro = {'pt': 'Escolha uma categoria: os pontos chegam do OpenStreetMap neste instante, com endereço, '
                   'telefone, site, horário e acessibilidade quando estiverem cadastrados, ordenados por '
                   'distância do centro.',
             'fr': 'Choisissez une catégorie : points venant d’OpenStreetMap à l’instant, avec adresse, '
                   'téléphone, site, horaires et accessibilité quand ils sont renseignés.',
             'it': 'Scegli una categoria: i punti arrivano da OpenStreetMap in tempo reale, con indirizzo, '
                   'telefono, sito, orari e accessibilità quando presenti.',
             'en': 'Pick a category: points come from OpenStreetMap right now, with address, phone, website, '
                   'opening hours and accessibility where mapped.'}[pag if pag in ('pt', 'fr', 'it', 'en') else 'pt']
    corpo = (f'<div class="p7-osm" data-lat="{round(co[0], 5)}" data-lon="{round(co[1], 5)}" data-r="{raio}" '
             f'data-city="{esc(pi["city"])}" data-lang="{esc(pag)}">'
             f'<p class="p7mut" style="margin:0 0 9px;font-size:.9rem">{esc(intro)}</p>'
             '<div class="p7tabs">' + ''.join(abas) + '</div>'
             '<div class="p7out" role="region" aria-live="polite"></div>'
             f'<noscript><p style="margin:8px 0 0;font-size:.86rem">{esc(tt(pag, "Sem JavaScript: procure no mapa —"))} {nosc}.'
             '</p></noscript>'
             f'<p style="margin:8px 0 0;font-size:.76rem;color:#94a3b8">{esc(tt(pag, "© contribuidores OpenStreetMap (ODbL); a consulta é feita pelo seu navegador com cache local de 6 h."))}</p></div>')
    return corpo, {'painel_abas': len(ORDEM_CATS)}


def bloco_ld(ctx, pi, fac, cli, pag, nat):
    if not fac:
        return '', {}
    langs = [x for x in dict.fromkeys([pag, 'pt' if pag == 'pt-BR' else pag, nat, 'en']) if x]
    node = {'@type': 'City', 'name': pi['city']}
    lab = fac.get('labels') or {}
    alt = [v for L, v in lab.items() if L not in langs and v and len(v) < 44]
    if alt:
        node['alternateName'] = alt[:40]
    co = coord_of(fac)
    if co:
        node['geo'] = {'@type': 'GeoCoordinates', 'latitude': co[0], 'longitude': co[1]}
    pop = one(fac, 'P1082')
    if pop and pop.get('v'):
        node['population'] = {'@type': 'Population', 'value': int(pop['v'])}
        if pop.get('y'):
            node['population']['generated'] = f'{pop["y"]}-01-01'
    ar = one(fac, 'P2046')
    if ar and ar.get('v'):
        node['areaServed'] = {'@type': 'QuantitativeValue', 'value': ar['v'], 'unitText': 'km²'}
    el = one(fac, 'P2044')
    if el and el.get('v'):
        node['elevation'] = {'@type': 'QuantitativeValue', 'value': el['v'], 'unitText': 'm'}
    fz = one(fac, 'P571')
    if fz and str(fz['v'])[:4] != '0000':
        node['foundingDate'] = str(fz['v'])[:10]
    pQ = (one(fac, 'P17') or {}).get('v')
    if pQ:
        node['country'] = {'@type': 'Country', 'name': pi['country'],
                           'sameAs': f'https://www.wikidata.org/wiki/{pQ}'}
    addr = {}
    pos = one(fac, 'P281')
    if pos:
        addr['postalCode'] = str(pos['v'])[:20]
    reg = one(fac, 'P131')
    if reg:
        rn = lab_of(ctx, reg['v'], langs)
        if rn:
            addr['addressRegion'] = rn
    addr.update({'@type': 'PostalAddress', 'addressLocality': pi['city'], 'addressCountry': pi['country']})
    node['address'] = addr
    x = one(fac, 'P856')
    if x and str(x['v']).startswith('http'):
        node['url'] = x['v']
    same = ['https://www.wikidata.org/wiki/' + fac['qid']]
    g = one(fac, 'P1566')
    if g:
        same.append('https://www.geonames.org/' + str(g['v']))
    node['sameAs'] = same
    dist = [z['v'] for z in fac.get('P150', []) if isinstance(z.get('v'), str)][:14]
    cps = [{'@type': 'Place', 'name': lab_of(ctx, q, langs), 'identifier': q} for q in dist]
    cps = [c for c in cps if c['name']]
    if cps:
        node['containsPlace'] = cps
    corpo = ('<script type="application/ld+json">'
             + json.dumps({'@context': 'https://schema.org', **node}, ensure_ascii=False,
                          separators=(',', ':')).replace('</', '<\\/')
             + '</script>')
    return corpo, {'ld_city': 1}


# --------------------------------------------------------------------------- driver ----------
def build(fp, ctx, site, ckey_hint=None):
    pi = S2.parse_city_page(fp)
    if not pi:
        return None, {'pulado': 1}
    s = open(fp, encoding='utf-8').read()
    if 'name="robots" content="noindex' in s[:6000]:
        return None, {'pulado': 1}
    ckey = f'{pi["cc"]}|{S2.norm(pi["city"])}|{S2.norm(pi["region"] or pi["country"] or "")}'
    fac = ctx['fac'].get(ckey)
    if not fac:
        alt = [k for k in ctx['fac'] if S2.core(k) == S2.core(ckey)]
        fac = ctx['fac'].get(alt[0]) if alt else None
    ckey = (fac or {}).get('ckey') or ckey
    cli = ctx['cli'].get(ckey)
    sug = ctx['sug'].get(ckey)
    pv = ctx['pv'].get(ckey)
    ent = ctx['ent'].get(ckey)
    pag = 'pt' if str(pi['lang']).startswith('pt') else str(pi['lang']).split('-')[0]
    cc = pi['cc'].upper()
    clangs = ctx['s2'][7] if len(ctx['s2']) > 7 else {}
    nat = ((clangs.get(cc, {}) or {}).get('langs') or ['en'])[0]
    pi['_ckey'] = ckey
    pi['_site'] = site
    co = coord_of(fac)
    fx, st = {}, collections.Counter()
    b, s1, co = bloco_fachada(ctx, pi, fac, cli, pag, nat)
    fx['city-fachada'] = b
    st.update(s1)
    for k, (b, s1) in (('city-nomes', bloco_nomes(ctx, fac, pi, pag, nat)),
                       ('city-clima', bloco_clima(ctx, cli, pi, pag, co)),
                       ('city-mobilidade', bloco_mob(ctx, pi, fac, ent, pag, nat, co, site)),
                       ('city-busca', bloco_busca(ctx, pi, sug, pv, pag)),
                       ('city-instituicoes', bloco_inst(ctx, pi, ent, pag, nat)),
                       ('painel-osm', bloco_painel(ctx, pi, fac, co, pag)),
                       ('ld-city', bloco_ld(ctx, pi, fac, cli, pag, nat))):
        fx[k] = b
        st.update(s1)
    if not any(fx.values()):
        return None, {'sem_dados': 1}
    T = TIT.get(pag if pag in TIT else 'pt')
    novos = ''
    for mk in ['city-fachada', 'city-nomes', 'city-clima', 'city-mobilidade', 'city-busca',
               'city-instituicoes', 'painel-osm']:
        if not fx.get(mk):
            continue
        if mk == 'painel-osm':
            novos += ('\n<!-- ' + mk + ' -->\n<section class="p7 p7-painel" style="margin:24px 0">'
                      '<h2 style="margin:0 0 11px;font-size:1.13rem">' + ICON[mk] + ' '
                      + esc(T[CHAVE_TIT[mk]]) + '</h2>' + fx[mk] + '</section>\n'
                      f'<!-- /{mk} -->\n')
        else:
            novos += ('\n<!-- ' + mk + ' -->\n<section class="p7 p7-' + mk[5:] + '" style="margin:24px 0;'
                      'padding:15px 17px;border:1px solid #1e293b;border-radius:14px"><h2 style="margin:0 0 11px;'
                      f'font-size:1.13rem">{ICON[mk]} {esc(T[CHAVE_TIT[mk]])}</h2>{fx[mk]}</section>\n'
                      f'<!-- /{mk} -->\n')
    for mk in BLOCOS:
        rx = re.compile(rf'[ \t]*<!-- {re.escape(mk)} -->.*?<!-- /{re.escape(mk)} -->[ \t]*\n?', re.S)
        s = rx.sub('', s)
    if novos:
        meio = '\n' + novos.strip('\n') + '\n'
        m = re.search(r'<!-- city-attractions -->', s)
        if m:
            e = s.find('<!-- /city-attractions -->')
            e = e + len('<!-- /city-attractions -->') if e > 0 else m.start()
            # canônico: um só salto de linha de cada lado, não importa o que a remoção deixou
            s = s[:e].rstrip('\n') + meio + s[e:].lstrip('\n')
        else:
            i = s.rfind('</body>')
            if i < 0:
                i = len(s)
            s = s[:i].rstrip('\n') + meio + s[i:].lstrip('\n')
    cab = ''
    if any(fx.get(k) for k in BLOCOS if k not in ('ld-city', 'p7-css', 'p7-js')):
        cab += '<!-- p7-css -->\n' + P7_CSS + '\n<!-- /p7-css -->\n'
    if fx.get('city-clima') or fx.get('painel-osm'):
        cab += ('<!-- p7-js -->\n'
                + ('<script defer src="/js/clima.js"></script>\n' if fx.get('city-clima') else '')
                + ('<script defer src="/js/painel-osm.js"></script>\n' if fx.get('painel-osm') else '')
                + '<!-- /p7-js -->\n')
    if fx.get('ld-city'):
        cab += '<!-- ld-city -->\n' + fx['ld-city'] + '\n<!-- /ld-city -->\n'
    if cab:
        s = s.replace('</head>', cab + '</head>', 1)

    # meta: anexa números reais sem desfazer o apêndice da Etapa 6
    if fac:
        dtail = []
        pop = one(fac, 'P1082')
        if pop and pop.get('v'):
            dtail.append(f'pop. {nfmt(pop["v"], pag)} hab' + (f'.{pop["y"]}' if pop.get('y') else ''))
        if cli and cli.get('melhor'):
            M = MESES.get(pag if pag in MESES else 'pt')
            dtail.append(tt(pag, 'melhor época: ')
                         + '/'.join(M[i][:3].capitalize() for i in cli['melhor'][:3]))
        co2 = coord_of(fac)
        if co2:
            dtail.append(f'{round(co2[0], 3)}, {round(co2[1], 3)}')
        if dtail:
            s = p7_meta(s, 'description', ' ' + ' · '.join(dtail) + '.', 300)[0]
        if sug and sug.get('cats'):
            kw = []
            for cat in ('turista', 'comida', 'transporte', 'hospedagem', 'compras'):
                for it in (sug['cats'].get(cat) or [])[:2]:
                    qq = (it['q'] if isinstance(it, dict) else it).strip().lower()
                    if qq and qq not in kw:
                        kw.append(qq)
            if kw:
                s = p7_meta(s, 'keywords', ', ' + ', '.join(kw[:6]), 460)[0]
    return s, st


def p7_meta(html_text, name, tail, maxlen=250):
    """Anexa números reais ao meta sem desfazer o trabalho da Etapa 6.

    `data-base` continua sendo a base original (é o que o stage 2 espera se for re-rodado);
    a nossa fração vai para `data-p7` exatamente como sobreviveu ao corte, de modo que
    reprocessar nunca acumula. Se nada do nosso texto couber, a tag volta ao estado anterior
    em vez de ficar com atributo enfeitado.
    """
    import html as _h
    pat = re.compile(r'<meta name="%s" content="([^"]*)"([^>]*)>' % name, re.S)
    m = pat.search(html_text)
    if not m:
        return html_text, False
    cur = _h.unescape(m.group(1))
    extra = m.group(2) or ''
    mb = re.search(r'\s*data-base="([^"]*)"', extra)
    mp = re.search(r'\s*data-p7="([^"]*)"', extra)
    base = _h.unescape(mb.group(1)) if mb else cur
    velho = _h.unescape(mp.group(1)) if mp else ''
    corpo = cur
    if velho and corpo.endswith(velho):
        corpo = corpo[:-len(velho)]
    novo_txt = (tail or '').strip()
    val = (corpo + (' ' if corpo and not corpo.endswith(' ') else '') + novo_txt).strip() if novo_txt else corpo
    if maxlen and len(val) > maxlen:
        val = val[:maxlen].rsplit(' ', 1)[0].rstrip(' ,;:') + '.'
    sob = val[len(corpo):].strip() if novo_txt and val.startswith(corpo) else ''
    if sob.strip(' .,;:\u00b7') == '':
        val, sob = corpo.rstrip(), ''
    resto = re.sub(r'\s*data-(base|p7)="[^"]*"', '', extra)
    if not sob:
        # nada nosso coube: só vale reescrever se havia fração nossa ou se o data-base é
        # cópia da content (adorno que uma execução anterior minha deixou)
        if velho or (mb and base == cur and corpo == cur):
            tag = f'<meta name="{name}" content="{esc(corpo)}"' + (resto or '') + '>'
            return html_text[:m.start()] + tag + html_text[m.end():], bool(velho)
        return html_text, False
    tag = (f'<meta name="{name}" content="{esc(val)}"' + (resto or '')
           + f' data-base="{esc(base)}"' + (f' data-p7="{esc(sob)}"' if sob else '') + '>')
    return html_text[:m.start()] + tag + html_text[m.end():], True


# Marcadores derivados do QID da cidade: se o QID é de outra entidade (time, aeroporto,
# estado...), o conteúdo é falso e TEM que sair da página — não basta "não gerar".
PURGAR = ['city-fachada', 'city-nomes', 'city-busca', 'ld-city', 'city-instituicoes', 'city-clima']


def purgar(pub, ruins, site, dry=False):
    """Remove os blocos marcados nas páginas cujo ckey está em `ruins`. Retorna Counter."""
    st = collections.Counter()
    for fp in sorted(glob.glob(pub + '/[a-z][a-z]/*.html')):
        pi = S2.parse_city_page(fp)
        if not pi:
            st['pulado'] += 1
            continue
        ck = f'{pi["cc"]}|{S2.norm(pi["city"])}|{S2.norm(pi["region"] or pi["country"] or "")}'
        alts = [k for k in ruins if S2.core(k) == S2.core(ck)]
        if ck not in ruins and not alts:
            continue
        s = open(fp, encoding='utf-8').read()
        novo = s
        achos = []
        for mk in PURGAR:
            novo, n1 = re.subn(r'\n?<!-- ' + mk + r' -->.*?<!-- /' + mk + r' -->\n?', '\n', novo, flags=re.S)
            novo, n2 = re.subn(r'\n?<!-- ' + mk + r' -->[^\n]*\n?', '\n', novo, flags=re.S)
            if n1 or n2:
                achos.append(mk)
        # scripts órfãos: sem o bloco, o <script> do marcador p7-js não pode ficar
        # (o validador acusa, e o JS sairia procurando um DOM que não existe)
        if 'city-clima' not in novo:
            novo = re.sub(r'\n?\s*<script[^>]*src="/js/clima\.js"[^>]*></script>', '', novo)
        if 'painel-osm' not in novo:
            novo = re.sub(r'\n?\s*<script[^>]*src="/js/painel-osm\.js"[^>]*></script>', '', novo)
        if novo != s:
            if not dry:
                open(fp, 'w', encoding='utf-8').write(novo)
            st['arquivos_purgados'] += 1
            st['blocos_removidos'] += len(achos)
            print(f'  [{site}] {fp.split("/public/")[1]}: removi {len(achos)} bloco(s) → {", ".join(achos)}', flush=True)
        else:
            st['ja_limpo'] += 1
    return st


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--report', action='store_true')
    ap.add_argument('--dry-run', action='store_true')
    ap.add_argument('--only', default='')
    ap.add_argument('--dump', action='store_true')
    ap.add_argument('--limit', type=int, default=0)
    ap.add_argument('--purgar-ckeys', default='', help='JSON com lista de ckeys cujos dados são falsos: remove os blocos-QID das páginas')
    a = ap.parse_args()
    ctx = load()
    print(f'cache: fachada {len(ctx["fac"])} | clima {len(ctx["cli"])} | busca {len(ctx["sug"])} | '
          f'pageviews {len(ctx["pv"])} | entidades {len(ctx["ent"])} | rótulos {len(ctx["lab"])} | '
          f'aeroportos {len(ctx["aero"])}', flush=True)
    tot = collections.Counter()
    if a.purgar_ckeys:
        ruins = set(json.load(open(a.purgar_ckeys, encoding='utf-8')))
        print(f'purga: {len(ruins)} ckeys com QID errado; marcas afetadas: {', '.join(PURGAR)}', flush=True)
        for site, (pub, host, repo) in S2.SITES.items():
            st = purgar(pub, ruins, site, dry=a.dry_run)
            print(f'[{site}] purga {dict(st)}', flush=True)
            tot.update(st)
        print('TOTAL PURGA', json.dumps({k: v for k, v in tot.items() if isinstance(v, int)}), '(--dry-run: nada escrito)' if a.dry_run else '', flush=True)
        return
    for site, (pub, host, repo) in S2.SITES.items():
        st = collections.Counter()
        files = sorted(glob.glob(pub + '/[a-z][a-z]/*.html'))
        if a.limit:
            files = files[:a.limit]
        for fp in files:
            if a.only and not fp.endswith(a.only):
                continue
            new, s2 = build(fp, ctx, site)
            st.update(s2)
            if new and new != open(fp, encoding='utf-8').read():
                if a.dump:
                    print(new[:60000])
                if not (a.report or a.dry_run):
                    open(fp, 'w', encoding='utf-8').write(new)
                st['arquivos_escritos'] += 1
        print(f'[{site}] {dict(st)}', flush=True)
        tot.update(st)
    print('TOTAL', json.dumps(dict(tot)), '(--report: nada escrito)' if a.report else '', flush=True)


if __name__ == '__main__':
    main()
