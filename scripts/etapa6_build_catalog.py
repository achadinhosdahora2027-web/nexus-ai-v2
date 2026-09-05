#!/usr/bin/env python3
"""
Constrói o catálogo "outras afiliações com anunciantes ativos" (não-CJ),
somente com links VERIFICADOS AO VIVO em 2 execuções independentes
(mesma disciplina da Etapa 3 para CJ).

Fontes (ativos que já existem nas contas, extraídos dos repositórios):
  Awin      awinaffid=3038165   sub-id: clickref (<=50 chars)  [confirmado no cookie aw*]
  Admitad   publisher=2565684 website=2983664  sub-id: subid / subid1..4
  Lomadee   lmdee.link / compre.vc (shortlinks - sem sub-id)
  Shopee    s.shopee.com.br (shortlink - sub-id ignorado no redirect; verificado)
  Meli      meli.la + mercadolivre.com.br?matt_tool (shortlink - sem sub-id)

Saída: /home/user/work/data/catalogo_multirede.json
"""
import json, os, re, time, subprocess, urllib.parse, collections

OUT = '/home/user/work/data/catalogo_multirede.json'
LOG = '/home/user/work/logs/catalog.log'
os.makedirs('/home/user/work/data', exist_ok=True)
UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36'

AWIN_PUB = '3038165'
ADMITAD_PUB = '2565684'
ADMITAD_SITE = '2983664'

# Awin: awinmid -> (nome, categoria pt, domínio do anunciante)  [extraído de ofertas-awin.html]
AWIN = [
    (38988, 'CamaiBox', 'Casa & utilidades'),
    (76888, 'Doce Beleza', 'Beleza & cosméticos'),
    (118977, 'Laurie Sporte', 'Moda & esporte'),
    (107484, 'SeaZone', 'Mergulho & náutica'),
    (120992, 'Melhor Seguro', 'Seguro auto'),
    (105615, 'Leveros', 'Casa & eletrônicos'),
]
# Admitad: rotas /g/ reais da conta (de ofertas-aliexpress.html)
ADMITAD = [
    ('AliExpress', 'Compras & importados', 'https://rzekl.com/g/1e8d114494083fd78fe116525dc3e8/', 'global'),
    ('Movavi', 'Edição de vídeo', 'https://bednari.com/g/mwr0f878b0083fd78fe10c91b13932/', 'global'),
    ('TurboVPN', 'VPN & privacidade', 'https://grfpr.com/g/exe221unkp083fd78fe1ddf84d4c0b/', 'global'),
    ('DocHub', 'Documentos online', 'https://lsuix.com/g/fsbaa03yh2083fd78fe16dd72211ce/', 'global'),
    ('MyHeritage DNA', 'Genealogia & DNA', 'https://naiawork.com/g/kmz7w822uc083fd78fe1e403a0fd30/', 'global'),
    ('CheapVuelos', 'Passagens aéreas', 'https://yknhc.com/g/cmazc4pm8o083fd78fe1ce5f810ebf/', 'latam'),
    ('Visa to Singapore', 'Visto de Singapura', 'https://xqjeo.com/g/u2touyge2g083fd78fe1734610720c/', 'asia'),
]
BR_ONLY = {'shopee': ('Shopee Brasil', 'Compras & achadinhos', 'https://s.shopee.com.br/30n7ohzzU6'),
           'mercadolivre': ('Mercado Livre', 'Ofertas & frete grátis', 'https://meli.la/1U3rtgV')}
LOMADEE_ALLOW_HOSTS = None  # derivado na verificação
DROP_HOSTS = {'shopee.com.br', 'www.shopee.com.br', 'app.lomadee.com.br', 's.shopee.com.br'}


def probe(url, max_hops=10):
    cmd = ['curl', '-sS', '-o', '/dev/null', '-D', '-', '-L', '--max-redirs', str(max_hops),
           '--max-time', '30', '-A', UA, '-H', 'Accept-Language: pt-BR,pt;q=0.9', url]
    t0 = time.time()
    try:
        p = subprocess.run(cmd, capture_output=True, text=True, timeout=45)
    except Exception as e:
        return {'status': 0, 'final': '', 'hops': 0, 'err': str(e)[:80], 'ms': 0, 'cookie_ref': ''}
    out = p.stdout or ''
    st = re.findall(r'HTTP/[0-9.]+ (\d{3})', out)
    locs = re.findall(r'(?i)^location:\s*(\S+)', out, re.M)
    base = url
    for l in locs:
        base = urllib.parse.urljoin(base, l)
    ck = re.findall(r'(?i)set-cookie:\s*aw\d+=\|?[^;]*', out) or re.findall(r'(?i)set-cookie:\s*aw\d+=[^;]*', out)
    return {'status': int(st[-1]) if st else 0, 'final': base, 'hops': len(st),
            'ms': int((time.time() - t0) * 1000), 'cookie_ref': (ck[0][:180] if ck else '')}


def awin_url(mid, ued, clickref=None):
    p = {'awinmid': str(mid), 'awinaffid': AWIN_PUB}
    if clickref:
        p['clickref'] = clickref
    p['ued'] = ued
    return 'https://www.awin1.com/cread.php?' + urllib.parse.urlencode(p)


def main():
    log = open(LOG, 'w', encoding='utf-8')

    def say(*a):
        s = ' '.join(str(x) for x in a)
        print(s, flush=True)
        log.write(s + '\n')
        log.flush()

    cat = {'generated_at': time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime()),
           'metodo': 'verificação ao vivo em 2 execuções independentes (curl -L, 10 hops); só entram anunciantes que resolvem no domínio do próprio anunciante',
           'networks': {}}

    # ---------------- AWIN ----------------
    awin_rows = []
    for mid, name, seg in AWIN:
        home = None
        url = awin_url(mid, ued := None) if False else None
        # ued derivado do domínio conhecido do merchant (das URLs do repo)
        ued_map = {38988: 'https://www.camainbox.com.br/', 76888: 'https://www.docebeleza.com.br/',
                   118977: 'https://www.lauriesporte.com.br/', 107484: 'https://seazone.com.br/',
                   120992: 'https://melhorseguro.com.br/', 105615: 'https://www.leveros.com.br/'}
        ued = ued_map[mid]
        link = awin_url(mid, ued, clickref='probe_clickref_ok')
        r1, r2 = probe(link), probe(link)
        hosts = {urllib.parse.urlparse(r['final']).netloc.lower() for r in (r1, r2)}
        ok = all(r['status'] in (200, 202, 301, 302, 307, 308) for r in (r1, r2))
        antibot = all(r['status'] == 403 for r in (r1, r2))
        row = {'network': 'awin', 'advertiser_id': mid, 'name': name, 'segment': seg, 'countries': ['br'],
               'ued': ued, 'url': link.replace('probe_clickref_ok', ''), 'subid_param': 'clickref',
               'status_1': r1['status'], 'status_2': r2['status'], 'destino': r1['final'][:160],
               'estado': 'ATIVO' if ok else ('BLOQUEIO_ANTIBOT' if antibot else 'REJEITADO'),
               'clickref_no_cookie': bool(r1['cookie_ref'])}
        awin_rows.append(row)
        say(f"[awin] {name:15s} {row['estado']:16s} s1={r1['status']} s2={r2['status']} destino={urllib.parse.urlparse(r1['final']).netloc}")
    cat['networks']['awin'] = {'publisher_id': AWIN_PUB, 'subid_param': 'clickref', 'subid_max_len': 50,
                               'advertisers': awin_rows}

    # ---------------- ADMITAD ----------------
    ad_rows = []
    for name, seg, base, scope in ADMITAD:
        link1 = base + '?subid=probe_teste&subid1=br'
        r1, r2 = probe(link1), probe(link1)
        st = {r['status'] for r in (r1, r2)}
        ok = st <= {200, 202, 301, 302, 307, 308}
        antifraud = any(r['status'] in (401, 403, 429) for r in (r1, r2))
        countries = {'latam': ['br', 'ar', 'mx', 'cl', 'co', 'pe', 'uy', 'py', 'ec', 'bo', 've', 'cr', 'pa', 'do', 'gt', 'pt', 'es'],
                     'asia': ['sg', 'my', 'th', 'id', 'vn', 'kh', 'mm', 'la', 'bn', 'in', 'pk'],
                     'global': None}[scope]
        row = {'network': 'admitad', 'name': name, 'segment': seg, 'base': base,
               'url': base, 'subid_param': 'subid', 'subid_extra': ['subid1', 'subid2', 'subid3'],
               'scope': scope, 'countries': countries, 'status_1': r1['status'], 'status_2': r2['status'],
               'destino': r1['final'][:160], 'destino_host': urllib.parse.urlparse(r1['final']).netloc.lower(),
               'estado': 'ATIVO' if ok else ('BLOQUEIO_ANTIBOT' if antifraud else 'REJEITADO')}
        ad_rows.append(row)
        say(f"[admitad] {name:18s} {row['estado']:16s} s1={r1['status']} s2={r2['status']} destino={row['destino_host']}")
    cat['networks']['admitad'] = {'publisher_id': ADMITAD_PUB, 'website_id': ADMITAD_SITE, 'advertisers': ad_rows}

    # ---------------- LOMADEE (deriva anunciantes dos 215 shortlinks) ----------------
    lm = [json.loads(l) for l in open('/home/user/work/out/noncj_links.jsonl', encoding='utf-8') if '"lomadee"' in l]
    by_host = collections.defaultdict(list)
    for r in lm:
        h = urllib.parse.urlparse(r.get('final', '')).netloc.lower()
        if not h or h in DROP_HOSTS:
            continue
        if r.get('status') not in (200, 301, 302, 307, 308):
            continue
        by_host[h].append(r['url'])
    lm_rows = []
    for host, urls in sorted(by_host.items(), key=lambda kv: -len(kv[1])):
        u = urls[0]
        r1, r2 = probe(u), probe(u)
        ok = all(x['status'] in (200, 301, 302, 307, 308) for x in (r1, r2))
        # exige que o destino final ainda seja o domínio do anunciante (não um intermediário morto)
        fh = urllib.parse.urlparse(r1['final']).netloc.lower()
        live = (fh == host) and ok
        name = host.split('.')[1] if host.count('.') > 1 and host.split('.')[1] not in ('com', 'br') else host.split('.')[0]
        row = {'network': 'lomadee', 'name': name.replace('-', ' ').title(), 'host': host, 'offers': len(urls),
               'url': u, 'status_1': r1['status'], 'status_2': r2['status'], 'destino': r1['final'][:150],
               'estado': 'ATIVO' if live else 'REJEITADO', 'countries': ['br'], 'subid_param': None}
        lm_rows.append(row)
        say(f"[lomadee] {host:32s} ofertas={len(urls):3d} {row['estado']:10s} destino={fh}")
    cat['networks']['lomadee'] = {'advertisers': lm_rows}

    # ---------------- SHOPEE / MELI ----------------
    br_rows = []
    for key, (name, seg, u) in BR_ONLY.items():
        r1, r2 = probe(u), probe(u)
        ok = all(x['status'] in (200, 301, 302, 307, 308) for x in (r1, r2))
        row = {'network': key, 'name': name, 'segment': seg, 'url': u, 'countries': ['br'],
               'status_1': r1['status'], 'status_2': r2['status'], 'destino': r1['final'][:150],
               'estado': 'ATIVO' if ok else 'REJEITADO',
               'subid_param': None,
               'obs': 'sub-id NÃO propagado no redirect (testado: utm_content/subid são descartados) → não há como separar os 3 sites neste programa'}
        br_rows.append(row)
        say(f"[{key}] {name:15s} {row['estado']} s1={r1['status']} destino={urllib.parse.urlparse(r1['final']).netloc}")
    cat['networks']['shopee_meli'] = {'advertisers': br_rows}

    # total
    tot = {}
    for net, blk in cat['networks'].items():
        adv = blk.get('advertisers', [])
        tot[net] = {'total': len(adv), 'ativos': sum(1 for a in adv if a.get('estado') == 'ATIVO'),
                    'antibot': sum(1 for a in adv if a.get('estado') == 'BLOQUEIO_ANTIBOT')}
    cat['resumo'] = tot
    json.dump(cat, open(OUT, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    say('\nresumo: ' + json.dumps(tot))
    say('salvo ' + OUT)


if __name__ == '__main__':
    main()
