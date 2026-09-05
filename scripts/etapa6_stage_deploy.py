#!/usr/bin/env python3
"""
ETAPA 6 — Implantação multi-rede (igual à do CJ) + enriquecimento de atrações reais.

Uso:
  python3 stage_deploy.py --stage1          # bloqueos de afiliados (Awin/Admitad/Lomadee/Shopee/Meli)
  python3 stage_deploy.py --stage2          # atrações reais (Wikidata) + keywords + idiomas de turistas
  python3 stage_deploy.py --stage1 --stage2
  python3 stage_deploy.py --stage1 --limit 20 --dry   # amostra de teste

Idempotente: remove qualquer bloco com os nossos marcadores antes de inserir, então
reexecutar nunca duplica. Só toca em páginas de cidade (public/<cc>/<slug>.html) e nos hubs.
"""
import argparse, collections, glob, zlib, hashlib, json, os, re, sys, time, unicodedata, urllib.parse

WORK = '/home/user/work'
import importlib

CAT = f'{WORK}/data/catalogo_multirede.json'
ATTR = f'{WORK}/data/attractions.jsonl'
QIDS = f'{WORK}/data/qids.jsonl'
CITIES = f'{WORK}/data/cities.jsonl'
COUNTRIES = f'{WORK}/out/countries.json'
LAB = f'{WORK}/data/labels.jsonl'

SITES_OVERRIDE = os.environ.get('SITES_JSON')
SITES = {
    'solvegrid': {'dir': f'{WORK}/repos/solvegrid/public', 'host': 'https://www.solvegrid.com.br', 'abbr': 'sg', 'brand': 'SolveGrid'},
    'nexus': {'dir': f'{WORK}/repos/nexus-ai-v2/public', 'host': 'https://nexusplataforma.ia.br', 'abbr': 'nx', 'brand': 'Nexus IA'},
    'aquitem': {'dir': f'{WORK}/repos/aquitemachadinhos/public', 'host': 'https://www.aquitemachadinhos.com.br', 'abbr': 'aq', 'brand': 'Aqui Tem Achadinhos'},
}
HUBS = {'mundial.html': 'hub_mundial', 'radar-mundial.html': 'hub_radar'}
GEO_RE = re.compile(r'<!-- geo-multi -->.*?<!-- /geo-multi -->\s*', re.S)
ATTR_RE = re.compile(r'<!-- city-attractions -->.*?<!-- /city-attractions -->\s*', re.S)


def norm(s):
    s = unicodedata.normalize('NFKD', s or '').encode('ascii', 'ignore').decode().lower()
    return re.sub(r'[^a-z0-9]+', ' ', s).strip()


def sid(site_abbr, cc, slug, maxlen=50):
    s = f'{site_abbr}_{cc}_{slug}'
    if len(s) <= maxlen:
        return s
    h = format(zlib.crc32(s.encode()) & 0xffffffff, "08x")[:5]
    return f'{site_abbr}_{cc}_{slug[:maxlen - 9 - len(h) - 1]}_{h}'


def esc(s):
    return (s or '').replace('&', '&amp;').replace('<', '&lt;').replace('>', '&gt;').replace('"', '&quot;')


# --------------------------------------------------------------- catálogo → cartões
def build_cards(cat, cc, slug, site_key, site_abbr):
    """Retorna lista de dicts {name, sub, href} elegíveis para este país/cidade."""
    s = sid(site_abbr, cc, slug)
    out = []
    # AWIN (BR)
    for a in cat['networks']['awin']['advertisers']:
        if a.get('estado') == 'REJEITADO':
            continue
        if a['countries'] and cc not in a['countries']:
            continue
        href = ('https://www.awin1.com/cread.php?' +
                urllib.parse.urlencode({'awinmid': a['advertiser_id'], 'awinaffid': cat['networks']['awin']['publisher_id'],
                                        'clickref': s, 'ued': a['ued']}))
        out.append({'name': a['name'], 'sub': f"{a['segment']} · Awin BR", 'href': href, 'net': 'awin'})
    # ADMITAD (global / latam / asia)
    for a in cat['networks']['admitad']['advertisers']:
        if a.get('estado') == 'REJEITADO':
            continue
        if a['countries'] and cc not in a['countries']:
            continue
        p = {'subid': s, 'subid1': site_abbr, 'subid2': cc, 'subid3': 'geo-multi'}
        href = a['base'].rstrip('/') + '/?' + urllib.parse.urlencode(p)
        out.append({'name': a['name'], 'sub': f"{a['segment']} · Admitad", 'href': href, 'net': 'admitad'})
    # LOMADEE (BR)
    for a in cat['networks']['lomadee']['advertisers']:
        if a.get('estado') != 'ATIVO' or cc not in a['countries']:
            continue
        out.append({'name': a['name'], 'sub': f"Lomadee · {a['offers']} ofertas no ar", 'href': a['url'], 'net': 'lomadee'})
    # SHOPEE / MELI (BR)
    for a in cat['networks']['shopee_meli']['advertisers']:
        if a.get('estado') != 'ATIVO' or cc not in a['countries']:
            continue
        out.append({'name': a['name'], 'sub': a['segment'], 'href': a['url'], 'net': a['network']})
    return out


L10N = {
    'pt-BR': {'h2': 'Parceiros de ofertas verificados para {city}',
              'intro': 'Programas de afiliados independentes (Awin, Admitad, Lomadee, Shopee e Mercado Livre) com ofertas ativas para {city}. Verificados em {date}. Se você comprar por um link, recebemos comissão sem custo extra para você.',
              'cta': 'Ver oferta'},
    'fr': {'h2': 'Partenaires offers vérifiés pour {city}',
           'intro': "Programmes d'affiliés indépendants (Awin, Admitad, Lomadee, Shopee et Mercado Livre) avec des offres actives pour {city}. Vérifiés le {date}. Si vous achetez via un lien, nous touchons une commission sans frais supplémentaires.",
           'cta': 'Voir l’offre'},
    'it': {'h2': 'Partner di offerte verificati per {city}',
           'intro': "Programmi di affiliazione indipendenti (Awin, Admitad, Lomadee, Shopee e Mercado Livre) con offerte attive per {city}. Verificati il {date}. Se acquisti da un link, riceviamo una commissione senza costi extra per te.",
           'cta': 'Vedi offerta'},
    'en': {'h2': 'Verified offer partners for {city}',
           'intro': 'Independent affiliate programs (Awin, Admitad, Lomadee, Shopee and Mercado Livre) with live offers for {city}. Checked on {date}. If you buy through a link we earn a commission at no extra cost to you.',
           'cta': 'See offer'},
}


def block_html(cards, city, lang, date_str, host, path):
    L = L10N.get(lang) or L10N['pt-BR']
    items = []
    for c in cards:
        items.append(f'    <a class="adeal" rel="sponsored noopener nofollow" target="_blank" '
                     f'href="{esc(c["href"])}">{esc(c["name"])}<br><small>{esc(c["sub"])}</small></a>')
    n = len({c['net'] for c in cards})
    return (
        '<!-- geo-multi -->\n'
        '  <div style="margin-top:26px;background:#101c33;border:1px solid #1e293b;border-radius:16px;padding:22px 18px">\n'
        f'    <h2 style="color:#34d399;border-bottom:1px solid #1e293b;padding-bottom:6px;margin:0 0 6px;font-size:1.35rem">🤝 {esc(L["h2"].format(city=city))}</h2>\n'
        f'    <p style="color:#94a3b8;font-size:.9rem;margin:0 0 14px">{esc(L["intro"].format(city=city, date=date_str))} '
        '</p>\n'
        '    <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:10px">\n'
        + '\n'.join(items) + '\n'
        '    </div>\n'
        f'    <p class="sub" style="margin:14px 0 0;font-size:.8rem;color:#64748b">{n} redes · {len(cards)} anunciantes ativos · '
        f'rastreio por cidade nos sub-IDs (Awin: clickref · Admitad: subid)</p>\n'
        '  </div>\n<!-- /geo-multi -->\n'
    )


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--stage1', action='store_true')
    ap.add_argument('--stage2', action='store_true')
    ap.add_argument('--limit', type=int, default=0)
    ap.add_argument('--dry', action='store_true')
    ap.add_argument('--sites', default=None)
    args = ap.parse_args()
    cat = json.load(open(CAT, encoding='utf-8'))
    date_str = time.strftime('%d/%m/%Y')
    stats = collections.defaultdict(collections.Counter)

    keys = args.sites.split(',') if args.sites else list(SITES)
    for site_key in [s for s in keys if s in SITES]:
        cfg = SITES[site_key]
        files = sorted(glob.glob(f"{cfg['dir']}/[a-z][a-z]/*.html")) + sorted(
            [f"{cfg['dir']}/{h}" for h in HUBS if os.path.exists(f"{cfg['dir']}/{h}")]) + \
            sorted(glob.glob(f"{cfg['dir']}/tags/*.html"))
        if args.limit:
            files = files[:args.limit]
        for fp in files:
            s = open(fp, encoding='utf-8').read()
            m = re.match(r'.*/([a-z]{2})/([^/]+)\.html$', fp)
            cc, slug = (m.group(1), m.group(2)) if m else ('br', os.path.splitext(os.path.basename(fp))[0])
            lang = (re.search(r'<html lang="([^"]+)"', s) or [None, 'pt-BR'])[1]
            rob = re.search(r'name="robots" content="([^"]*)"', s)
            if rob and 'noindex' in rob.group(1):
                stats[site_key]['noindex pulado'] += 1
                continue        # página noindex: não recebe bloqueios de afiliado
            city_t = re.search(r'<title>Passagens para (.+?), (.+?) 2026', s)
            if city_t:
                city = city_t.group(1)
            elif m:
                city = slug.replace('-', ' ').title()
            else:
                city = 'todas as cidades'
            path = f"/{cc}/{slug}" if m else '/' + os.path.basename(fp)
            # remove blocos anteriores (idempotência)
            new = GEO_RE.sub('', s)
            cards = build_cards(cat, cc, slug, site_key, cfg['abbr'])
            if cards:
                block = block_html(cards, city, lang, date_str, cfg['host'], path)
                if '</body>' in new:
                    new = new.replace('</body>', block + '</body>', 1)
            if args.dry:
                print(f"--- {site_key}{path}: {len(cards)} cards, delta={len(new)-len(s)}")
                if args.limit and args.limit <= 2:
                    print(new[-2500:])
            else:
                if new != s:
                    open(fp, 'w', encoding='utf-8').write(new)
            st = stats[site_key]
            st['paginas'] += 1
            st['cards'] += len(cards)
            for c in cards:
                st['net_' + c['net']] += 1
            st['com_bloco'] += 1 if '<!-- geo-multi -->' in new else 0
            st['bytes'] += len(new)
        print(f"[{site_key}] {dict(stats[site_key])}", flush=True)
    print('STATS', json.dumps({k: dict(v) for k, v in stats.items()}, indent=1))


if __name__ == '__main__':
    import os
    if os.environ.get('SITE_DIR_OVERRIDE'):
        SITES = {'test': {'dir': os.environ['SITE_DIR_OVERRIDE'], 'host': 'https://test.example', 'abbr': 'ts', 'brand': 'Test'}}
    main()
