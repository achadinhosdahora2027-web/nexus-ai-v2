#!/usr/bin/env python3
"""Validador da ETAPA 6 / STAGE 2 — confere 100% das páginas tocadas (sem amostragem).

Checa: JSON-LD parseável, marcadores exatamente 1x, lista de atrações íntegra e com rel
correto, deep-links de hospedagem com site/slot, append único em description/keywords,
FAQ visível sincronizado com o JSON-LD, box de idiomas bem formado, equilíbrio de tags,
tamanho da página, e que os blocos da Etapa 5/Stage 1 (CJ + geo-multi) continuam lá.

  python3 validate_stage2.py            # todos os sites
  python3 validate_stage2.py solvegrid  # um site
"""
import collections, glob, json, os, re, sys
from html.parser import HTMLParser

WORK = '/home/user/work'
SITES = {'solvegrid': f'{WORK}/repos/solvegrid/public', 'nexus': f'{WORK}/repos/nexus-ai-v2/public',
         'aquitem': f'{WORK}/repos/aquitemachadinhos/public'}
MARKS = ['city-attractions', '/city-attractions', 'visitor-langs', '/visitor-langs',
         'faq-attractions', '/faq-attractions', 'ld-attractions', '/ld-attractions']
errs = []
THIN = {}


class Bal(HTMLParser):
    __slots__ = ('stack', 'bad')
    VOID = {'area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'param', 'source', 'track', 'wbr'}

    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.stack, self.bad = [], 0

    def handle_starttag(self, t, a):
        if t not in self.VOID:
            self.stack.append(t)

    def handle_endtag(self, t):
        if t in self.VOID:
            return
        if self.stack and self.stack[-1] == t:
            self.stack.pop()
        elif t in self.stack:
            while self.stack and self.stack.pop() != t:
                self.bad += 1
        else:
            self.bad += 1


def check(fp, site, s):
    def E(msg):
        errs.append(f'{site}:{os.path.relpath(fp, SITES[site])}: {msg}')
    touched = '<!-- city-attractions -->' in s
    n_ao = s.count('name="robots" content="noindex')
    if n_ao and touched:
        E('página noindex FOI tocada')
    if not touched:
        return None
    for m in MARKS:
        c = s.count(f'<!-- {m} -->')
        lim = 1 if m in ('city-attractions', '/city-attractions', 'ld-attractions', '/ld-attractions') else 1
        if c > lim or (m in ('city-attractions', 'ld-attractions') and c != 1):
            E(f'marcador {m} x{c}')
    # lista de atrações
    ol = re.search(r'<ol class="attrlist">(.*?)</ol>', s, re.S)
    if not ol:
        E('sem <ol class="attrlist">')
        return
    lis = re.findall(r'<li>(.*?)</li>', ol.group(1), re.S)
    if len(lis) < 1:
        E('lista de atrações vazia')
    if len(lis) < 3:
        THIN[os.path.relpath(fp, SITES[site])] = len(lis)
    for li in lis:
        a = re.search(r'<a [^>]*href="([^"]+)"[^>]*>', li)
        if not a:
            E('item sem link de mapa')
        elif 'google.com/maps' not in a.group(1):
            E(f'link de mapa inesperado: {a.group(1)[:60]}')
        if 'rel="noopener nofollow"' not in li and 'nofollow' not in li:
            E('link de atração sem nofollow')
        if 'target="_blank"' not in li:
            E('link de atração sem target=_blank')
        for h in re.findall(r'href="(https://achadinhos-ad-engine[^"]+)"', li):
            if 'site=' not in h or 'slot=city_' not in h or '_attraction_' not in h:
                E(f'link de hospedagem sem site/slot: {h[:90]}')
            if 'rel="sponsored noopener nofollow"' not in li:
                E('link de hospedagem sem rel=sponsored nofollow')
    # head
    for nome in ('description', 'keywords'):
        for ln in (l for l in s.splitlines() if f'<meta name="{nome}"' in l):
            if not re.fullmatch(r'\s*<meta name="' + nome + r'" content="[^"]*"\s*/?>\s*', ln):
                E(f'meta {nome} malformada: {ln.strip()[:70]}')
    dm = re.findall(r'<meta name="description" content="([^"]*)"', s)
    if len(dm) != 1:
        E(f'{len(dm)} metas de description')
    elif not re.search(r'(Imperdíveis:|À ne pas manquer|Da non perdere|Do not miss)', dm[0]):
        E('description sem append de atrações')
    elif dm[0].count('Imperdíveis:') > 1 or dm[0].count('À ne pas') > 1:
        E('description com append duplicado')
    km = re.findall(r'<meta name="keywords" content="([^"]*)"', s)
    if len(km) != 1:
        E(f'{len(km)} metas de keywords')
    elif not re.search(r'(pontos turísticos|attractions|touristiques|turistiche|turistici)', km[0]):
        E('keywords sem cauda longa de atrações')
    # JSON-LD
    lds = re.findall(r'<script type="application/ld\+json">(.*?)</script>', s, re.S)
    if not lds:
        E('sem JSON-LD')
    faq_vis = len(re.findall(r'O que não posso deixar de ver em', s)) if '<!-- faq-attractions -->' in s else 0
    seen_q = 0
    for i, raw in enumerate(lds):
        try:
            d = json.loads(raw)
        except Exception as e:
            E(f'JSON-LD #{i} INVÁLIDO: {str(e)[:70]}')
            continue
        if isinstance(d, dict) and d.get('@type') == 'ItemList':
            els = d.get('itemListElement') or []
            if len(els) < 1:
                E('ItemList sem itens')
            elif len(els) < 3:
                pass
            if d.get('numberOfItems') != len(els):
                E('numberOfItems ≠ tamanho da lista')
            for el in els:
                it = el.get('item') or {}
                if it.get('@type') != 'TouristAttraction' or not it.get('name'):
                    E('ItemList item malformado')
                g = it.get('geo')
                if g and not (-90 <= float(g.get('latitude', 0)) <= 90 and -180 <= float(g.get('longitude', 0)) <= 180):
                    E(f'geo fora do range: {g}')
            if faq_vis and len(els) != len(lis):
                E('ItemList ≠ lista visível')
        if isinstance(d, dict) and d.get('@type') == 'FAQPage':
            qs = [q.get('name') for q in (d.get('mainEntity') or [])]
            seen_q = len([q for q in qs if q and q.startswith('O que não posso deixar de ver')])
            if len(qs) != len(set(qs)):
                E('FAQPage com pergunta duplicada')
    if faq_vis and faq_vis - 1 != seen_q:      # a pergunta conta 1x no HTML visível + 1x no LD
        E(f'FAQ visível ({faq_vis - 1}) ≠ JSON-LD ({seen_q})')
    # box de idiomas
    lb = re.search(r'<!-- visitor-langs -->(.*?)</div>\s*<!-- /visitor-langs -->', s, re.S)
    if lb:
        if '<table' not in lb.group(1) or lb.group(1).count('<tr>') < 2:
            E('langbox sem tabela/linhas')
        th = len(re.findall(r'<th>', lb.group(1)))
        for row in re.findall(r'<tr><th scope="row">([^<]+)</th>(.*?)</tr>', lb.group(1), re.S):
            if len(re.findall(r'<td>', row[1])) != th:
                E(f'langbox colunas desencontradas em {row[0]}')
    # blocos anteriores preservados
    if 'geo-offers' not in s:
        E('bloco geo-multi (stage 1) sumiu')
    if 'kqzyfj.com' not in s and 'cj.com' not in s:
        E('bloco CJ (etapa 5) sumiu')
    # integridade HTML + tamanho
    b = Bal()
    try:
        b.feed(s)
    except Exception as e:
        E(f'parser HTML falhou: {str(e)[:60]}')
    if b.bad > 0:
        E(f'{b.bad} tags desbalanceadas')
    if len(b.stack) > 2:
        E(f'{len(b.stack)} tags não fechadas')
    if os.path.getsize(fp) > 460000:
        E(f'página grande demais ({os.path.getsize(fp)})')
    return len(lis)


def main():
    only = sys.argv[1] if len(sys.argv) > 1 else None
    per = {}
    desc = collections.defaultdict(set)
    for site, pub in SITES.items():
        if only and site != only:
            continue
        c = collections.Counter()
        for fp in sorted(glob.glob(pub + '/[a-z][a-z]/*.html')) + sorted(glob.glob(pub + '/tags/*.html')):
            s = open(fp, encoding='utf-8', errors='ignore').read()
            n = check(fp, site, s)
            if n:
                c['paginas_com_atracoes'] += 1
                c['atracoes'] += n
            if 'name="robots" content="' in s[:6000] and 'noindex' in s[:6000].split('name="robots" content="')[1][:60]:
                pass
            else:
                d = re.search(r'<meta name="description" content="([^"]*)"', s)
                if d:
                    desc[site].add((d.group(1), os.path.basename(fp)))
            c['total'] += 1
        per[site] = dict(c)
        print(f'[{site}] {dict(c)}', flush=True)
    for site, d in desc.items():
        dup = len(d) - len({t for t, _ in d})
        if dup:
            errs.append(f'{site}: {dup} descriptions duplicadas')
    print(f'listas com 1-2 atrações (dados reais escassos, não é erro): {len(THIN)}')
    print('\nERROS:', 'NENHUM' if not errs else len(errs))
    for e in errs[:25]:
        print('  ✗', e)
    return 1 if errs else 0


if __name__ == '__main__':
    sys.exit(main())
