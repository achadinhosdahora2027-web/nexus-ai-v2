#!/usr/bin/env python3
"""HIGIENE (correções de pontos cegos encontrados na auditoria desta etapa):
 1. Branding vazado: páginas /tags/* do solvegrid e nexus com título/og:site_name
    "Aqui Tem Achadinhos" → marca do próprio site (o Google via 3 domínios com o
    mesmo título = conteúdo escalado/qualidade).
 2. hreflang falso: <link rel="alternate" hreflang="en|es" href="...?lang=en"> no
    index.html (solvegrid/nexus) e tech-pulse/entertainment — a URL com ?lang= não
    entrega idioma alternativo algum → removido (mantém-se pt-br + x-default canônicos).
 3. Link/URL absoluta para outro domínio do próprio grupo dentro de páginas de um site
    (vazamento de atribuição/branding) → reescrito para o host do próprio site.
Idempotente e auditável (--report só lista, sem escrever).
"""
import argparse, collections, glob, os, re, sys

SITES = {
    'solvegrid': {'dir': '/home/user/work/repos/solvegrid/public', 'host': 'www.solvegrid.com.br',
                  'brand': 'SolveGrid', 'own': ('SolveGrid', 'Solvegrid', 'solvegrid')},
    'nexus': {'dir': '/home/user/work/repos/nexus-ai-v2/public', 'host': 'nexusplataforma.ia.br',
              'brand': 'Nexus', 'own': ('Nexus', 'nexus')},
    'aquitem': {'dir': '/home/user/work/repos/aquitemachadinhos/public', 'host': 'www.aquitemachadinhos.com.br',
                'brand': 'Aqui Tem Achadinhos', 'own': ('Aqui Tem Achadinhos', 'AQUIT', 'aquitem')},
}
ALL_BRANDS = ('SolveGrid', 'Solvegrid', 'Nexus IA', 'Nexus', 'Aqui Tem Achadinhos', 'Aquitém', 'AQUITÉM & Achadinhos da Hora')
# marca "estrangeira" = marca de outro site do grupo que NÃO contém nenhum token próprio
FOREIGN = {k: [b for b in ALL_BRANDS if not any(o.lower() in b.lower() for o in v['own'])] for k, v in SITES.items()}
HOSTS = {'solvegrid.com.br': 'solvegrid', 'nexusplataforma.ia.br': 'nexus', 'aquitemachadinhos.com.br': 'aquitem'}
HL_FAKE = re.compile(r'\s*<link[^>]+hreflang="(?!x-default|pt)[^"]*"[^>]*\?lang=[^"]*"\s*/?>', re.I)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--report', action='store_true')
    a = ap.parse_args()
    total = collections.Counter()
    for key, cfg in SITES.items():
        files = sorted(glob.glob(cfg['dir'] + '/**/*.html', recursive=True))
        for fp in files:
            s = open(fp, encoding='utf-8').read()
            orig = s
            rep = collections.Counter()
            # 1) branding no <title>/<h1>/og:site_name/json-ld
            t = re.search(r'<title>(.*?)</title>', s, re.S)
            if t:
                for b in FOREIGN[key]:
                    if b.lower() in t.group(1).lower() and b not in cfg['brand']:
                        new = re.sub(re.escape(b), cfg['brand'], t.group(1), flags=re.I)
                        s = s.replace(t.group(0), f'<title>{new}</title>')
                        rep['titulo_marca'] += 1
                        break
            for fld in ('og:site_name', 'twitter:data1'):
                m = re.search(r'<meta[^>]+name="' + fld + r'"[^>]+content="([^"]*)"', s)
                if m and any(b.lower() in m.group(1).lower() for b in FOREIGN[key]):
                    s = s.replace('content="' + m.group(1) + '"', 'content="' + cfg['brand'] + '"', 1)
                    rep['og_site_name'] += 1
            # 2) hreflang falso ?lang=
            n = len(HL_FAKE.findall(s))
            if n:
                s = HL_FAKE.sub('', s)
                rep['hreflang_falso'] += n
            # 3) host de outro site do grupo referenciado em URL absoluta
            for h, owner in HOSTS.items():
                if owner == key:
                    continue
                rx = re.compile(r"https?://(?:www\.)?" + re.escape(h) + r"(/[^\s\"'<>]*)?")
                for m in set(x.group(1) or '' for x in rx.finditer(s)):
                    path = m.split('?')[0]
                    if path in ('', '/'):
                        continue  # cortesia para a outra propriedade: mantido
                    cand = [cfg['dir'] + path, cfg['dir'] + path + '.html', cfg['dir'] + path + '/index.html']
                    if not any(os.path.exists(c) for c in cand):
                        rep['host_cruzado_sem_destino'] += 1
                        continue
                    for pre in ('https://' + h, 'https://www.' + h):
                        s = s.replace(pre + m, 'https://' + cfg['host'] + m)
                    rep['host_cruzado'] += 1
            if s != orig:
                total.update(rep)
                print(f"  [{key}] {os.path.relpath(fp, cfg['dir'])}: {dict(rep)}")
                if not a.report:
                    open(fp, 'w', encoding='utf-8').write(s)
    print('TOTAL', dict(total), 'arquivos alterados' if not a.report else '(report apenas)')


if __name__ == '__main__':
    main()
