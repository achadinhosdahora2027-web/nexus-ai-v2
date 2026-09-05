#!/usr/bin/env python3
"""ETAPA 6 — STAGE 2: atrações REAIS (Wikidata) + vocabulário dos idiomas nativos/de turistas
+ palavras-chave de cauda longa, injetados em todas as páginas de cidade dos 3 sites.

Idempotente (marcadores), não toca em páginas noindex, e só escreve onde há dados
(0 = deixa a página como está, sem inventar nada).

  python3 stage2_attractions.py            # aplica nos 3 repositórios
  python3 stage2_attractions.py --report     # só mede cobertura, não escreve
"""
import argparse, collections, glob, json, os, re, sys, time, unicodedata, urllib.parse

WORK = '/home/user/work'
SITES = {'solvegrid': (f'{WORK}/repos/solvegrid/public', 'https://www.solvegrid.com.br', 'solvegrid'),
         'nexus': (f'{WORK}/repos/nexus-ai-v2/public', 'https://nexusplataforma.ia.br', 'nexus-ai-v2'),
         'aquitem': (f'{WORK}/repos/aquitemachadinhos/public', 'https://www.aquitemachadinhos.com.br', 'aquitemachadinhos')}
ATTR_RE = re.compile(r'[ \t]*<!-- city-attractions -->.*?<!-- /city-attractions -->[ \t]*\n', re.S)
LANG_RE = re.compile(r'[ \t]*<!-- visitor-langs -->.*?<!-- /visitor-langs -->[ \t]*\n', re.S)
LD_RE = re.compile(r'[ \t]*<!-- ld-attractions -->.*?<!-- /ld-attractions -->[ \t]*\n?', re.S)
FAQVIS_RE = re.compile(r'<!-- faq-attractions -->.*?<!-- /faq-attractions -->\s*', re.S)
IMPERD = 'Imperdíveis:'
# tipos administrativos/eventos que NÃO são atração turística (medido no próprio dataset)
JUNK_TYPE = re.compile(r'(season|edition|diocese|archdiocese|parish|locality|census|municipalit|freguesia|company|hospital|university|college|school|sports team|club|league|political|party|constituency|electoral|newspaper|journal|district|county|province|administrative territorial|prefecture|commune of|village of|town of|seat of|railway line|bus route)', re.I)

TYPE_PT = {
    'museum': 'museu', 'art museum': 'museu de arte', 'natural history museum': 'museu de história natural',
    'cathedral': 'catedral', 'church': 'igreja', 'basilica': 'basílica', 'chapel': 'capela', 'mosque': 'mesquita',
    'synagogue': 'sinagoga', 'park': 'parque', 'urban park': 'parque urbano', 'national park': 'parque nacional',
    'city park': 'parque da cidade', 'garden': 'jardim', 'botanical garden': 'jardim botânico',
    'beach': 'praia', 'stadium': 'estádio', 'multi-purpose stadium': 'estádio', 'arena': 'arena',
    'monument': 'monumento', 'memorial': 'memorial', 'castle': 'castelo', 'palace': 'palácio',
    'bridge': 'ponte', 'square': 'praça', 'public square': 'praça pública', 'market': 'mercado',
    'shopping mall': 'shopping center', 'railway station': 'estação de trem', 'airport': 'aeroporto',
    'international airport': 'aeroporto internacional', 'theatre': 'teatro', 'movie theater': 'cinema',
    'opera house': 'casa de ópera', 'university': 'campus universitário', 'neighborhood': 'bairro',
    'district of a city': 'bairro', 'historic district': 'centro histórico', 'archaeological site': 'sítio arqueológico',
    'mountain': 'montanha', 'lake': 'lago', 'river': 'rio', 'waterfall': 'cachoeira', 'island': 'ilha',
    'tower': 'torre', 'lighthouse': 'farol', 'fountain': 'fonte', 'statue': 'estátua', 'zoo': 'zoológico',
    'aquarium': 'aquário', 'amusement park': 'parque de diversões', 'theme park': 'parque temático',
    'observation deck': 'mirante', 'viewpoint': 'mirante', 'port': 'porto', 'beach resort': 'balneário',
    'mausoleum': 'mausoléu', 'cemetery': 'cemitério', 'monastery': 'mosteiro', 'abbey': 'abadia',
    'temple': 'templo', 'convention center': 'centro de convenções', 'library': 'biblioteca',
    'art gallery': 'galeria de arte', 'landmark': 'marco', 'tourist attraction': 'atração turística',
    'historic house': 'casa histórica', 'fortification': 'fortaleza', 'fort': 'forte', 'harbour': 'porto',
    'ski resort': 'estação de esqui', 'golf course': 'campo de golfe', 'planetarium': 'planetário',
    'observatory': 'observatório', 'night market': 'mercado noturno', 'open-air market': 'mercado ao ar livre',
}
APPEND = {'pt-BR': (' Imperdíveis: {a}.', 'pontos turísticos de {c}, atrações turísticas em {c}, o que fazer em {c} hoje'),
          'fr': (' À ne pas manquer : {a}.', 'à voir à {c}, sites touristiques {c}, que faire à {c}'),
          'it': (' Da non perdere: {a}.', 'cosa vedere a {c}, attrazioni turistiche {c}, cosa fare a {c} oggi'),
          'en': (' Do not miss: {a}.', '{c} tourist attractions, things to do in {c} today, best time to visit {c}')}
VOCAB_WORDS = ['hotel', 'museum', 'airport', 'beach', 'restaurant', 'market', 'tourist attraction', 'cathedral']
VOCAB_PT = {'hotel': 'hotel', 'museum': 'museu', 'airport': 'aeroporto', 'beach': 'praia',
            'restaurant': 'restaurante', 'market': 'mercado', 'tourist attraction': 'atração turística',
            'cathedral': 'catedral'}


def norm(s):
    s = unicodedata.normalize('NFKD', s or '').encode('ascii', 'ignore').decode().lower()
    return re.sub(r'[^a-z0-9]+', ' ', s).strip()


def clean_name(n):
    """nome limpo para texto/atributo: colapsa espaços, tira desambiguações, limita tamanho."""
    n = re.sub(r'\s+', ' ', str(n or '')).strip()
    n = re.sub(r'\((?:wikimedia|disambiguation|title)[^)]*\)', '', n, flags=re.I)
    n = re.sub(r'[<>\x00-\x1f]', '', n).strip(' ,;:.')
    return n[:70]


def esc(t):
    return (t or '').replace('&', '&amp;').replace('<', '&lt;').replace('>', '&gt;').replace('"', '&quot;')


def parse_point(v):
    m = re.match(r'Point\(\s*(-?[\d.]+)\s+(-?[\d.]+)\s*\)', v or '')
    if not m:
        return None
    lon, lat = float(m.group(1)), float(m.group(2))
    if not (-90 <= lat <= 90 and -180 <= lon <= 180):
        return None
    return round(lat, 6), round(lon, 6)


STOP = re.compile(r'\b(and|e|de|da|do|das|dos|du|of|la|le)\b')


def core(ckey):
    cc, city, region = ckey.split('|', 2)
    return f'{cc}|{STOP.sub(" ", city).strip()}|{region}'


def core_noreg(ckey):
    cc, city, region = ckey.split('|', 2)
    return f'{cc}|{STOP.sub(" ", city).strip()}|'


def load():
    cities = {}
    for l in open(f'{WORK}/data/cities.jsonl', encoding='utf-8'):
        r = json.loads(l)
        cities[(r['cc'], norm(r['city']), norm(r.get('region', '')))] = r
    qids = {}
    p = f'{WORK}/data/qids.jsonl'
    if os.path.exists(p):
        for l in open(p, encoding='utf-8'):
            r = json.loads(l)
            qids[r['ckey']] = r
    att = {}
    p = f'{WORK}/data/attractions.jsonl'
    if os.path.exists(p):
        for l in open(p, encoding='utf-8'):
            r = json.loads(l)
            its = [i for i in r.get('items', []) if not JUNK_TYPE.search((i.get('type') or ''))]
            its = [i for i in its if 'dead-end' not in (i.get('type') or '')]
            # no máximo 3 itens do mesmo tipo na lista (evita cidade = só estação de trem)
            seen = collections.Counter(); kept = []
            for i in its:
                ty = (i.get('type') or '').lower()
                if seen[ty] >= 3:
                    continue
                seen[ty] += 1
                kept.append(i)
            att[r['ckey']] = kept
    nat = collections.defaultdict(dict)
    p = f'{WORK}/data/attr_labels.jsonl'
    if os.path.exists(p):
        for l in open(p, encoding='utf-8'):
            r = json.loads(l)
            nat[r['qid']][r['lang']] = r['label']
    countries = json.load(open(f'{WORK}/out/countries.json'))
    codes = json.load(open(f'{WORK}/out/lang_codes.json'))
    clangs = json.load(open(f'{WORK}/out/country_langs.json')) if os.path.exists(f'{WORK}/out/country_langs.json') else {}
    concepts = json.load(open(f'{WORK}/out/concepts.json'))
    # alias: 'Brighton & Hove' == 'Brighton and Hove'; e trocas de região só quando o nome
    # da cidade é único dentro do país (para nunca anexar atração de outra cidade)
    alias = {}
    for k, v in att.items():
        alias.setdefault(core(k), v)
        alias.setdefault(core_noreg(k), v)
    unicas = collections.Counter()
    for c in cities.values():
        unicas[core_noreg(c['ckey'])] += 1
    seguro = {k for k, n in unicas.items() if n == 1}
    alias = {k: v for k, v in alias.items() if not k.endswith('|') or k in seguro}
    return cities, qids, att, nat, countries, codes, concepts, clangs, alias


def lang_list_for(cc, countries, codes, clangs):
    """idioma(s) nativo(s) do país + inglês + idiomas dos países vizinhos (=turistas)."""
    out = list(clangs.get(cc.upper(), {}).get('langs', []))
    c = countries.get(cc, {})
    for l in (c.get('official_langs_en') or []):          # reforço quando faltar ISO no Wikidata
        code = codes.get(l)
        if code and code not in out:
            out.append(code)
    if 'en' not in out:
        out.append('en')
    for l in (c.get('neighbour_langs_en') or []):
        code = codes.get(l)
        if code and code not in out:
            out.append(code)
    return out[:6] or ['en']


def parse_city_page(fp):
    """(cc, slug, city, country, region, lang) de uma página de cidade — ou None.
    Aceita o padrão 'Passagens para X, Y 2026' e os títulos alternativos do aquitem."""
    s = open(fp, encoding='utf-8', errors='ignore').read(9000)
    if 'name="robots" content="noindex' in s[:6000]:
        return None
    m = re.match(r'.*/([a-z]{2})/([^/]+)\.html$', fp)
    if not m:
        return None
    cc, slug = m.group(1), m.group(2)
    t = re.search(r'<title>Passagens para (.+?), (.+?) 2026', s)
    city = country = None
    if t:
        city, country = t.group(1).strip(), t.group(2).strip()
    else:
        for rx in (r'<title>(.+?) - Guida Completa 2026', r'<title>Passagens para (.+?) Baratas 2026',
                   r'<title>Passagens Baratas para (.+?), (.+?) 2026', r'<title>O que fazer em (.+?) \|'):
            g = re.search(rx, s)
            if g:
                city = g.group(1).strip()
                country = (g.group(2).strip() if g.lastindex == 2 else '')
                break
    if not city:
        return None
    rg = re.search(r'a regi\u00e3o de ([A-Z\u00c0-\u00da][^<(,\.]{2,40})', s)
    region = rg.group(1).strip() if rg else ''
    lang = (re.search(r'<html lang="([^"]+)"', s) or [None, 'pt-BR'])[1]
    return {'cc': cc, 'slug': slug, 'city': city, 'country': country, 'region': region, 'lang': lang,
            'ckey': f'{cc}|{norm(city)}|{norm(region)}', 'html_head': s}


def build(fp, ctx, site_key):
    cities, qids, att, nat, countries, codes, concepts, clangs, alias = ctx
    s = open(fp, encoding='utf-8').read()
    pi = parse_city_page(fp)
    if not pi:
        return s, {'pulado': 1}
    cc, slug, city, region, lang, ckey = pi['cc'], pi['slug'], clean_name(pi['city']), pi['region'], pi['lang'], pi['ckey']
    country = pi['country'] or countries.get(cc, {}).get('name_pt', cc.upper())
    L = APPEND.get(lang) or APPEND['pt-BR']
    city = clean_name(city)
    if not city:
        return s, {'cidade_vazia': 1}
    raw = att.get(ckey) or alias.get(core(ckey)) or alias.get(core_noreg(ckey)) or []
    items = list(raw)[:8]
    sem_atracoes = not items
    natlang = (clangs.get(cc.upper(), {}).get('langs') or ['en'])[0]
    cl = clangs.get(cc.upper(), {})
    natname = cl.get('endo', {}).get(natlang) or cl.get('names', {}).get(natlang) or \
        next(iter(countries.get(cc, {}).get('official_langs_en') or [natlang]), natlang)
    stats = collections.Counter()
    # ---------- 1) lista de atrações ----------
    lis = []
    for i, it in enumerate(items, 1):
        nl = (nat.get(it['a']) or {}).get(natlang)
        name = clean_name(nl or it['en'])
        alt = clean_name(it['en']) if (nl and clean_name(nl) != clean_name(it['en'])) else None
        ty = TYPE_PT.get((it.get('type') or '').lower())
        q = urllib.parse.quote(f"{name} {city}")
        maps = f'https://www.google.com/maps/search/?api=1&query={q}'
        seg = f'<li><a href="{maps}" target="_blank" rel="noopener nofollow"><strong>{esc(name)}</strong></a>'
        if alt:
            seg += f' <span class="alt">({esc(alt)})</span>'
        if ty:
            seg += f' — {ty}'
        if i <= 4:
            ss = urllib.parse.quote(f'{name}, {city}, {country}')
            dest = urllib.parse.quote(f'https://www.booking.com/searchresults.pt-br.html?ss={ss}', safe='/')
            seg += (f' · <a rel="sponsored noopener nofollow" target="_blank" '
                    f'href="https://achadinhos-ad-engine.vercel.app/api/ads/go?brand=booking&site={site_key}&slot=city_{slug}_attraction_{i}&dest={dest}">hospedagem perto</a>')
        lis.append(seg + '</li>')
        stats['atracoes'] += 1
    if sem_atracoes:
        block = ''
    else:
        block = ('<!-- city-attractions -->\n  <section class="atra" id="atracoes">\n'
             f'    <h2>🎯 {len(items)} {"atração verificada" if len(items) == 1 else "atrações verificadas"} em {esc(city)}</h2>\n'
             f'    <p class="sub">Nomes conferidos no Wikidata ({esc(natname)} e inglês) em {time.strftime("%d/%m/%Y")} — '
             f'dados abertos CC BY-SA. Toque no nome para abrir no mapa.</p>\n'
               '    <ol class="attrlist">' + ''.join(lis) + '</ol>\n  </section>\n<!-- /city-attractions -->\n')
    if sem_atracoes:
        new = ATTR_RE.sub('', s) if '<!-- city-attractions -->' in s else s
    else:
        new = ATTR_RE.sub('', s)
        lines = new.split('\n')
        idx = next((i for i, l in enumerate(lines) if '🗺️ O que fazer em' in l), None)
        if idx is None:
            idx = next((i for i, l in enumerate(lines) if l.strip() == '</body>'), len(lines) - 1)
        lines.insert(idx, block.rstrip('\n'))
        new = '\n'.join(lines)
    if sem_atracoes:
        names3 = ''
    else:
        names3 = ', '.join([clean_name((nat.get(i['a']) or {}).get(natlang) or i['en']) for i in items[:3]])[:110]
    # ---------- 2) description + keywords (guarda pelo próprio conteúdo => idempotente) ----------
    add_desc = L[0].format(a=names3)
    dm = re.search(r'(<meta name="description" content=")([^"]*)("[^>]*>)', new)
    if dm and add_desc.strip() not in dm.group(2) and not sem_atracoes:
        novo = esc((dm.group(2) + add_desc).strip())
        if len(novo) > 230:
            novo = novo[:230].rsplit(' ', 1)[0].rstrip(',;:') + '.'
        new = new[:dm.start()] + dm.group(1) + novo + dm.group(3) + new[dm.end():]
        stats['desc'] += 1
    add_kw = ', '.join([clean_name((nat.get(i['a']) or {}).get(natlang) or i['en']) for i in items[:4]]) + ', ' + L[1].format(c=clean_name(city))
    km = re.search(r'(<meta name="keywords" content=")([^"]*)("[^>]*>)', new)
    if km and add_kw not in km.group(2) and not sem_atracoes:
        new = new[:km.start()] + km.group(1) + esc((km.group(2).rstrip(' ,') + ', ' + add_kw)) + km.group(3) + new[km.end():]
        stats['keywords'] += 1
    elif not km and not sem_atracoes:
        meta = f'<meta name="keywords" content="{esc(city + ", " + add_kw)}"/>'
        anchor = km or re.search(r'<meta name="description" content="[^"]*"[^>]*>', new)
        if anchor:
            new = new[:anchor.end()] + '\n  ' + meta + new[anchor.end():]
            stats['keywords_nova'] += 1
        else:
            new = new.replace('<head>', '<head>\n  ' + meta, 1)
            stats['keywords_na_cabeca'] += 1
    # ---------- 3) FAQ visível + JSON-LD sincronizados ----------
    faq_html = ('<!-- faq-attractions --><div class="faq-item"><h3>O que não posso deixar de ver em '
                f'{esc(city)}?</h3><p>Os destaques verificados são {esc(names3)}.</p></div><!-- /faq-attractions -->')
    faq_anchor = re.search(r'(<div class="faq-item">.*?</div>\s*)', new, re.S)
    if faq_anchor and 'faq-attractions' not in new and not sem_atracoes:
        pos = faq_anchor.end(1)
        new = new[:pos] + faq_html + new[pos:]
        stats['faq'] += 1
    # JSON-LD: estende FAQPage existente e acrescenta ItemList
    ld_ok = False
    for mld in re.finditer(r'<script type="application/ld\+json">(.*?)</script>', new, re.S):
        try:
            data = json.loads(mld.group(1))
        except Exception:
            stats['ld_existente_invalido'] += 1
            continue
        if sem_atracoes:
            break
        if isinstance(data, dict) and data.get('@type') == 'FAQPage':
            qname = f'O que não posso deixar de ver em {city}?'
            already = any(q.get('name') == qname for q in (data.get('mainEntity') or []) if isinstance(q, dict))
            if not already:
                data['mainEntity'].append({'@type': 'Question', 'name': qname,
                                           'acceptedAnswer': {'@type': 'Answer', 'text': f'Os destaques verificados são {names3}.'}})
                tag = '<script type="application/ld+json">' + json.dumps(data, ensure_ascii=False) + '</script>'
                new = new[:mld.start()] + tag + new[mld.end():]
                stats['faq_ld'] += 1
            break
    items_ld = []
    for i, it in enumerate(items, 1):
        nl = (nat.get(it['a']) or {}).get(natlang)
        nm = nl or it['en']
        e = {'@type': 'TouristAttraction', 'name': nm,
             'address': {'@type': 'PostalAddress', 'addressLocality': city, 'addressCountry': country}}
        if nl and it['en'] and nl != it['en']:
            e['alternateName'] = it['en']
        g = parse_point(it.get('coord'))
        if g:
            e['geo'] = {'@type': 'GeoCoordinates', 'latitude': g[0], 'longitude': g[1]}
        if it.get('a', '').startswith('Q'):
            e['sameAs'] = f'https://www.wikidata.org/wiki/{it["a"]}'
        items_ld.append({'@type': 'ListItem', 'position': i, 'item': e})
    ld = ('<!-- ld-attractions --><script type="application/ld+json">' +
          json.dumps({'@context': 'https://schema.org', '@type': 'ItemList',
                      'name': f'Atrações de {city}, {country}', 'numberOfItems': len(items_ld),
                      'itemListElement': items_ld}, ensure_ascii=False) +
          '</script><!-- /ld-attractions -->')
    new = LD_RE.sub('', new)
    if '</head>' in new and not sem_atracoes:
        new = new.replace('</head>', ld + '\n</head>', 1)
        stats['itemlist_ld'] += 1
    # ---------- 4) caixa de idiomas ----------
    langs = lang_list_for(cc, countries, codes, clangs)
    rows = []
    words_ok0 = [w for w in VOCAB_WORDS if any((concepts.get(w) or {}).get(l) for l in langs)]
    for lg in langs:
        cells = []
        for w in words_ok0:
            v = (concepts.get(w) or {}).get(lg)
            cells.append(f'<td>{esc(v)}</td>' if v else '<td>—</td>')
        if len(cells) >= 3:
            rows.append(f'<tr><th scope="row">{lg.upper()}</th>' + ''.join(cells) + '</tr>')
    if rows and natlang not in ('pt', 'en'):
        head = ''.join(f'<th>{VOCAB_PT[w]}</th>' for w in words_ok0)
        box = ('<!-- visitor-langs --><div class="langbox" style="margin-top:18px;border:1px solid #1e293b;'
               'border-radius:12px;padding:14px"><h3 style="margin:0 0 6px;color:#a78bfa">🗣️ '
               + f'{esc(city)}: o idioma local e os idiomas de quem visita</h3>'
               + '<p class="sub" style="margin:0 0 8px;color:#94a3b8;font-size:.86rem">'
               + f'Aqui o idioma oficial é <strong>{esc(natname)}</strong>. As palavras úteis nos idiomas mais '
               + f'falados por quem visita {esc(city)}, para placas, hotel e apps:</p>'
               + '<table style="font-size:.86rem;border-collapse:collapse"><thead><tr>' + head + '</tr></thead><tbody>'
               + ''.join(rows) + '</tbody></table></div><!-- /visitor-langs -->')
        new = LANG_RE.sub('', new)
        ln = new.split('\n')
        at = next((i for i, l in enumerate(ln) if l.strip() == '<!-- /city-attractions -->'), None)
        if at is None:
            at = next((i for i, l in enumerate(ln) if l.strip() == '</body>'), len(ln) - 1)
        ln.insert(at + 1, '  ' + box)
        new = '\n'.join(ln)
        stats['idiomas'] += 1
    return new, dict(stats)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--report', action='store_true')
    ap.add_argument('--limit', type=int, default=0)
    a = ap.parse_args()
    ctx = load()
    tot = collections.Counter()
    per = {}
    for site, (pub, host, repo) in SITES.items():
        st = collections.Counter()
        files = sorted(glob.glob(pub + '/[a-z][a-z]/*.html'))
        if a.limit:
            files = files[:a.limit]
        repo = SITES[site][2]
        for fp in files:
            new, s2 = build(fp, ctx, repo)
            st.update(s2)
            if not a.report and s2.get('atracoes') and new:
                old = open(fp, encoding='utf-8').read()
                if new != old:
                    open(fp, 'w', encoding='utf-8').write(new)
                    st['arquivos_escritos'] += 1
        per[site] = dict(st)
        tot.update(st)
        print(f'[{site}] {dict(st)}', flush=True)
    print('TOTAL', json.dumps(dict(tot)), '(\x27--report\x27: nada foi escrito)' if a.report else '')


if __name__ == '__main__':
    main()
