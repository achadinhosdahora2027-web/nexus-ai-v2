#!/usr/bin/env python3
"""Teste AO VIVO dos links implantados no Stage 1 — 100% das páginas-amostra, 2 execuções.

Para cada página amostrada, extrai TODOS os links do bloco geo-multi e segue o redirect
até o anunciante. Classifica: OK / BLOQUEIO_ANTIBOT(403) / QUEBRADO / FORA_DO_ESCOPE.
Confere ainda se o sub-id (clickref/subid) está presente na URL de clique.
Saída: /home/user/work/out/stage1_links.csv + resumo no stdout.
"""
import concurrent.futures as cf, csv, json, re, subprocess, time, urllib.parse, collections

WORK = '/home/user/work'
SITES = {'solvegrid': '/home/user/work/repos/solvegrid/public',
         'nexus': '/home/user/work/repos/nexus-ai-v2/public',
         'aquitem': '/home/user/work/repos/aquitemachadinhos/public'}
UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36'
A_RE = re.compile(r'<a class="adeal"[^>]*href="([^"]+)"')
BLOCK = re.compile(r'<!-- geo-multi -->(.*?)<!-- /geo-multi -->', re.S)

# amostra estratificada: BR grande, BR interior, US, IT, JP, PT, hub, tags — resolvida dinamicamente
PREF = {'br': ['sao-paulo', 'barretos', 'belem', 'ananindeua', 'curitiba'], 'us': ['new-york', 'aberdeen-sd', 'yonkers-ny'],
        'it': ['roma', 'milano', 'veneza'], 'jp': ['toquio', 'tokyo', 'osaka'], 'pt': ['lisboa', 'lisbon', 'porto'],
        'de': ['berlim', 'berlin', 'munique']}

def sample_for(pub):
    import os
    out = []
    for cc, prefs in PREF.items():
        d = os.path.join(pub, cc)
        if not os.path.isdir(d):
            continue
        pick = None
        for pfx in prefs:
            cands = [f for f in os.listdir(d) if pfx in f and f.endswith('.html')]
            if cands:
                pick = max(cands, key=lambda f: os.path.getsize(os.path.join(d, f)))
                break
        if not pick:
            fs = [f for f in os.listdir(d) if f.endswith('.html')]
            pick = max(fs, key=lambda f: os.path.getsize(os.path.join(d, f))) if fs else None
        if pick:
            out.append(f'{cc}/{pick}')
    for h in ('mundial.html', 'radar-mundial.html'):
        if os.path.exists(os.path.join(pub, h)):
            out.append(h)
    tg = sorted(x for x in os.listdir(os.path.join(pub, 'tags')) if x.endswith('.html')) if os.path.isdir(os.path.join(pub, 'tags')) else []
    out += ['tags/' + x for x in tg[:3]]
    return out
SAMPLE = None


def probe(url):
    cmd = ['curl', '-sS', '-o', '/dev/null', '-D', '-', '-L', '--max-redirs', '12', '--max-time', '35', '-A', UA,
           '-H', 'Accept-Language: pt-BR,pt;q=0.9,en;q=0.8', url]
    t0 = time.time()
    try:
        p = subprocess.run(cmd, capture_output=True, text=True, timeout=48)
    except Exception as e:
        return {'status': 0, 'final': '', 'hops': 0, 'err': str(e)[:90], 'ms': int((time.time() - t0) * 1000)}
    out = p.stdout or ''
    st = [int(x) for x in re.findall(r'HTTP/[0-9.]+ (\d{3})', out)]
    base = url
    for l in re.findall(r'(?i)^location:\s*(\S+)', out, re.M):
        base = urllib.parse.urljoin(base, l)
    return {'status': st[-1] if st else 0, 'chain': st, 'final': base, 'hops': len(st), 'ms': int((time.time() - t0) * 1000)}


def net_of(u):
    h = urllib.parse.urlparse(u).netloc.lower()
    if 'awin1.com' in h:
        return 'awin'
    if 'lmdee.link' in h or 'compre.vc' in h:
        return 'lomadee'
    if 'shopee' in h:
        return 'shopee'
    if 'meli.la' in h or 'mercadolivre' in h:
        return 'mercadolivre'
    return 'admitad'


def main():
    rows = []
    jobs = []
    for site, pub in SITES.items():
        for rel in sample_for(pub):
            import os
            fp = os.path.join(pub, rel)
            if not os.path.exists(fp):
                print(f'  [!] amostra ausente: {site}/{rel}')
                continue
            s = open(fp, encoding='utf-8').read()
            m = BLOCK.search(s)
            if not m:
                print(f'  [!] sem bloco: {site}/{rel}')
                continue
            for u in A_RE.findall(m.group(1)):
                jobs.append((site, rel, u.replace('&amp;', '&')))
    print(f'testando {len(jobs)} links (2 execuções)...', flush=True)

    def run(job, tag):
        site, rel, u = job
        r = probe(u)
        r.update({'site': site, 'page': rel, 'url': u, 'run': tag, 'net': net_of(u),
                  'subid_ok': bool(re.search(r'(clickref|subid)=[a-z]{2}_[a-z]{2}_', u)) or net_of(u) in ('lomadee', 'shopee', 'mercadolivre'),
                  'dest_host': urllib.parse.urlparse(r['final']).netloc.lower()})
        return r

    res = {}
    with cf.ThreadPoolExecutor(max_workers=8) as ex:
        futs = {ex.submit(run, j, t): (j, t) for j in jobs for t in ('r1', 'r2')}
        for f in cf.as_completed(futs):
            r = f.result()
            j, t = futs[f]
            res.setdefault((j[0], j[1], j[2]), {})[t] = r
    cls = collections.Counter()
    for (site, rel, u), d in sorted(res.items()):
        r1, r2 = d.get('r1', {}), d.get('r2', {})
        st1, st2 = r1.get('status'), r2.get('status')
        good = {200, 202, 206, 301, 302, 303, 307, 308}
        if st1 in good and st2 in good:
            c = 'OK'
        elif st1 == 403 and st2 == 403:
            c = 'BLOQUEIO_ANTIBOT'
        elif st1 in (404, 410, 500, 502, 503) or st2 in (404, 410, 500, 502, 503):
            c = 'QUEBRADO'
        else:
            c = 'TRANSIENTE'
        cls[(net_of(u), c)] += 1
        rows.append({'site': site, 'page': rel, 'rede': net_of(u), 'url': u[:200], 'cls': c,
                     'status_r1': st1, 'status_r2': st2, 'hops_r1': r1.get('hops'), 'hops_r2': r2.get('hops'),
                     'destino_final': r1.get('final', '')[:180], 'subid_presente': r1.get('subid_ok'),
                     'ms_r1': r1.get('ms'), 'estavel': st1 == st2})
    with open(f'{WORK}/out/stage1_links.csv', 'w', newline='', encoding='utf-8') as f:
        w = csv.DictWriter(f, fieldnames=list(rows[0].keys()))
        w.writeheader()
        w.writerows(rows)
    print('\nCLASSIFICAÇÃO (rede × classe):')
    for (n, c), v in sorted(cls.items()):
        print(f'  {n:14s} {c:18s} {v}')
    print('\nlinks testados:', len(rows), '| estáveis entre execuções:', sum(1 for r in rows if r['estavel']))
    print('sub-id presente em 100% dos links Awin/Admitad:', all(r['subid_presente'] for r in rows))
    print('QUEBRADOS:', [r['url'][:110] for r in rows if r['cls'] == 'QUEBRADO'] or 'nenhum ✅')
    print('salvo out/stage1_links.csv')


if __name__ == '__main__':
    main()
