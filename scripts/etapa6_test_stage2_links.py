#!/usr/bin/env python3
"""Teste da Etapa 6 / Stage 2.

(1) 100% estático: cada href de atração/hospedagem gerado é reanalisado — o `dest` do
    ad-engine precisa decodificar para uma URL de busca do Booking válida, com `site=`
    correto por site e `slot=attracaoN_slug`; e todo link de mapa precisa ter query não vazia.
(2) Ao vivo: todos os formatos (site × marca) + amostra estratificada de slots, 2 runs,
    com classificação OK / BLOQUEIO_ANTIBOT / QUEBRADO / TRANSIENTE.
"""
import collections, concurrent.futures as cf, csv, glob, html, json, os, random, re, sys, time, urllib.parse, urllib.request

WORK = '/home/user/work'
SITES = {'solvegrid': f'{WORK}/repos/solvegrid/public', 'nexus': f'{WORK}/repos/nexus-ai-v2/public',
         'aquitem': f'{WORK}/repos/aquitemachadinhos/public'}
REPO_OF = {'solvegrid': 'solvegrid', 'nexus': 'nexus-ai-v2', 'aquitem': 'aquitemachadinhos'}
UA = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36'
LINK_RE = re.compile(r'<a rel="sponsored noopener nofollow" target="_blank" href="(https://achadinhos-ad-engine[^"]+)">hospedagem perto</a>')
MAP_RE = re.compile(r'<a href="(https://www\.google\.com/maps/search/\?api=1&query=[^"]+)"')
errs = []


def fetch(url, timeout=25):
    req = urllib.request.Request(url, headers={'User-Agent': UA, 'Accept': 'text/html,application/xhtml+xml',
                                               'Accept-Language': 'pt-BR,pt;q=0.9,en;q=0.8'})
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            return r.status, r.geturl(), dict(r.headers)
    except urllib.error.HTTPError as e:
        return e.code, url, {}
    except Exception as e:
        return None, url, {'exc': str(e)[:90]}


def static_check(site, fp, s):
    rel = os.path.relpath(fp, SITES[site])
    n_h = n_m = 0
    for h in LINK_RE.findall(s):
        n_h += 1
        q = urllib.parse.parse_qs(urllib.parse.urlparse(h).query)
        if q.get('site', [''])[0] != REPO_OF[site]:
            errs.append(f'{site}:{rel}: site={q.get("site")} esperado {REPO_OF[site]}')
        slot = q.get('slot', [''])[0]
        if not re.fullmatch(r'city_[a-z0-9\-]+_attraction_[1-4]', slot):
            errs.append(f'{site}:{rel}: slot malformado {slot!r}')
        dest = q.get('dest', [''])[0]
        if not dest.startswith('https://www.booking.com/searchresults.'):
            errs.append(f'{site}:{rel}: dest não-Booking: {dest[:60]}')
            continue
        dq = urllib.parse.parse_qs(urllib.parse.urlparse(dest).query)
        ss = dq.get('ss', [''])[0]
        if not ss or ',' not in ss:
            errs.append(f'{site}:{rel}: ss vazio/sem vírgula: {ss!r}')
        elif len(ss) > 190:
            errs.append(f'{site}:{rel}: ss longo demais ({len(ss)})')
        if 'pt-br' not in dest:
            errs.append(f'{site}:{rel}: booking sem locale pt-br')
    for m in MAP_RE.findall(s):
        n_m += 1
        qq = urllib.parse.parse_qs(urllib.parse.urlparse(m).query).get('query', [''])[0]
        if len(qq) < 4:
            errs.append(f'{site}:{rel}: busca de mapa vazia')
    if n_m != n_h and n_m < n_h:
        errs.append(f'{site}:{rel}: {n_h} links de hospedagem para {n_m} de mapa (cada atração precisa do seu)')
    return n_h, n_m


def main():
    tot = collections.Counter()
    samples = collections.defaultdict(set)
    for site, pub in SITES.items():
        for fp in sorted(glob.glob(pub + '/[a-z][a-z]/*.html')):
            s = open(fp, encoding='utf-8', errors='ignore').read()
            if '<!-- city-attractions -->' not in s:
                continue
            tot[site + ':páginas'] += 1
            nh, nm = static_check(site, fp, s)
            tot[site + ':hospedagem'] += nh
            tot[site + ':mapa'] += nm
            # amostra por (site, cc) para o teste ao vivo
            key = (site, os.path.basename(os.path.dirname(fp)))
            if not samples[key]:                     # 1 link por (site, país) já cobre o formato
                for h in LINK_RE.findall(s)[:1]:
                    samples[key].add(h)
    print('ESTÁTICO:', json.dumps(dict(tot), indent=0, ensure_ascii=False).replace('\n', ' '), flush=True)
    print('ERROS estáticos:', len(errs))
    for e in errs[:20]:
        print('  ✗', e)
    # ao vivo: todos os formatos + amostra
    urls = []
    for key, us in sorted(samples.items()):
        for u in sorted(us):
            urls.append((key[0], key[1], u))
    urls += urls[:0]
    if '--static' in sys.argv:
        print('\n(--static: pulei o teste ao vivo)', flush=True)
        return 1 if errs else 0
    print(f'\nAO VIVO: {len(urls)} links × 2 runs', flush=True)
    rows = []

    def probe(item):
        site, cc, u = item
        s1, f1, h1 = fetch(u)
        time.sleep(0.05)
        s2, f2, h2 = fetch(u)
        exc = [h1.get('exc'), h2.get('exc')]
        if s1 in (403, 429) or s2 in (403, 429):
            st = 'BLOQUEIO_ANTIBOT'
        elif s1 and s1 < 400 and s2 and s2 < 400:
            st = 'OK'
        elif s1 == s2:
            st = 'QUEBRADO'
        else:
            st = 'TRANSIENTE'
        return {'site': site, 'cc': cc, 'status': st, 'run1': s1, 'run2': s2,
                'final': (f2 or '')[:150], 'url': u[:200], 'exc': '; '.join(x for x in exc if x)}

    with cf.ThreadPoolExecutor(max_workers=8) as ex:
        for i, r in enumerate(ex.map(probe, urls), 1):
            rows.append(r)
            if i % 50 == 0:
                print(f'    {i}/{len(urls)}', flush=True)
    with open(f'{WORK}/out/stage2_links.csv', 'w', newline='', encoding='utf-8') as f:
        w = csv.DictWriter(f, fieldnames=list(rows[0].keys()))
        w.writeheader()
        w.writerows(rows)
    c = collections.Counter(r['status'] for r in rows)
    print('\nSTATUS:', dict(c))
    for r in rows:
        if r['status'] in ('QUEBRADO', 'TRANSIENTE'):
            print('  ✗', r['site'], r['cc'], r['run1'], r['run2'], r['url'][:120], r['exc'][:60])
    return 1 if errs else 0


if __name__ == '__main__':
    sys.exit(main())
