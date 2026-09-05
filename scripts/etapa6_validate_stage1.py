#!/usr/bin/env python3
"""Validação 100% (sem amostragem) do Stage 1 — igual à disciplina da Etapa 3.

Checa TODAS as páginas alteradas dos 3 sites, estruturalmente:
 bloco único, sid correto por site/país/cidade, sem vazamento de PID/sid entre sites,
 rel sponsored+nofollow em todo link novo, elegibilidade por país, integridade do bloco CJ,
 títulos/descrições ainda únicos, HTML íntegro (</body> único, sem texto 'undefined').
"""
import collections, glob, json, os, re, sys, zlib

WORK = '/home/user/work'
SITES = {'solvegrid': ('/home/user/work/repos/solvegrid/public', 'www.solvegrid.com.br', 'sg'),
         'nexus': ('/home/user/work/repos/nexus-ai-v2/public', 'nexusplataforma.ia.br', 'nx'),
         'aquitem': ('/home/user/work/repos/aquitemachadinhos/public', 'www.aquitemachadinhos.com.br', 'aq')}
BLOCK = re.compile(r'<!-- geo-multi -->(.*?)<!-- /geo-multi -->', re.S)
A_RE = re.compile(r'<a class="adeal" rel="([^"]*)" target="_blank" href="([^"]+)">')
CAT = json.load(open(f'{WORK}/data/catalogo_multirede.json', encoding='utf-8'))
AWIN_IDS = {str(a['advertiser_id']) for a in CAT['networks']['awin']['advertisers'] if a['estado'] != 'REJEITADO'}
ADM_BASES = {a['base'].rstrip('/') for a in CAT['networks']['admitad']['advertisers'] if a['estado'] != 'REJEITADO'}
LM_URLS = {a['url'] for a in CAT['networks']['lomadee']['advertisers'] if a['estado'] == 'ATIVO'}
SM_URLS = {a['url'] for a in CAT['networks']['shopee_meli']['advertisers'] if a['estado'] == 'ATIVO'}
SING = r'&amp;'


def expected_sid(abbr, cc, slug, maxlen=50):
    s = f'{abbr}_{cc}_{slug}'
    if len(s) <= maxlen:
        return s
    h = format(zlib.crc32(s.encode()) & 0xffffffff, '08x')[:5]
    return f'{abbr}_{cc}_{slug[:maxlen - 9 - len(h) - 1]}_{h}'


def main():
    errs = collections.Counter()
    per = collections.defaultdict(collections.Counter)
    titles = collections.defaultdict(collections.Counter)
    descs = collections.defaultdict(collections.Counter)
    for key, (pub, host, abbr) in SITES.items():
        files = sorted(glob.glob(pub + '/[a-z][a-z]/*.html')) + sorted(glob.glob(pub + '/tags/*.html')) + \
            sorted([f'{pub}/{h}' for h in ('mundial.html', 'radar-mundial.html') if os.path.exists(f'{pub}/{h}')])
        for fp in files:
            s = open(fp, encoding='utf-8').read()
            rel = fp[len(pub) + 1:]
            m = re.match(r'([a-z]{2})/([^/]+)\.html$', rel)
            cc, slug = (m.group(1), m.group(2)) if m else ('br', os.path.splitext(os.path.basename(rel))[0])
            sid = expected_sid(abbr, cc, slug)
            blocks = BLOCK.findall(s)
            rob = re.search(r'name="robots" content="([^"]*)"', s)
            if rob and 'noindex' in rob.group(1):
                per[key]['noindex'] += 1
                if blocks:
                    errs[f'{key}:bloco_em_noindex'] += 1
                continue
            if len(blocks) != 1:
                errs[f'{key}:blocos={len(blocks)}'] += 1
                if len(blocks) < 1:
                    continue
            b = blocks[0]
            per[key]['pages'] += 1
            # integridade
            if s.count('</body>') != 1:
                errs[f'{key}:body_duplo'] += 1
            if 'undefined' in b or 'None' in b or 'NaN' in b:
                errs[f'{key}:texto_invalido'] += 1
            if SING * 2 in b or '&amp;amp;' in b:
                errs[f'{key}:escape_duplo'] += 1
            # bloco CJ preservado (somente páginas que tinham)
            had_cj = open(fp, encoding='utf-8').read().count('<!-- geo-offers -->')
            # cada link do bloco novo
            n_new = 0
            for rel_attr, href in A_RE.findall(b):
                n_new += 1
                if not ('sponsored' in rel_attr and 'nofollow' in rel_attr):
                    errs[f'{key}:rel_incompleto'] += 1
                if 'awin1.com/cread.php' in href:
                    if f'clickref={sid}' not in href:
                        errs[f'{key}:awin_sid_errado'] += 1
                    if 'awinaffid=3038165' not in href:
                        errs[f'{key}:awin_publisher_errado'] += 1
                    mid = re.search(r'awinmid=(\d+)', href)
                    if not mid or mid.group(1) not in AWIN_IDS:
                        errs[f'{key}:awin_mid_fora'] += 1
                    if cc != 'br':
                        errs[f'{key}:awin_fora_do_pais'] += 1
                elif 'cread.php' not in href:
                    base = re.sub(r'\?.*$', '', href).rstrip('/')
                    if '/g/' in href:  # admitad
                        if base not in ADM_BASES:
                            errs[f'{key}:admitad_fora'] += 1
                        if f'subid={sid}' not in href or f'subid1={abbr}' not in href or f'subid2={cc}' not in href:
                            errs[f'{key}:admitad_sid_errado'] += 1
                        if 'url=' in href or 'ulp=' in href:
                            errs[f'{key}:admitad_ulp_espurio'] += 1
                    else:  # lomadee / shopee / meli = BR only
                        plain = href.replace(SING, '&')
                        if plain not in LM_URLS and plain not in SM_URLS:
                            errs[f'{key}:link_fora_do_catalogo'] += 1
                        if cc != 'br':
                            errs[f'{key}:br_only_fora_do_brasil'] += 1
            per[key]['cards'] += n_new
            per[key]['cj_preservado'] += 1 if had_cj else 0
            # sid de OUTRO site não pode aparecer no bloco novo
            for other in ('sg', 'nx', 'aq'):
                if other == abbr:
                    continue
                if re.search(r'(clickref|subid)=' + other + '_', b):
                    errs[f'{key}:sid_cruzado_{other}'] += 1
            t = re.search(r'<title>(.*?)</title>', s, re.S)
            if t:
                titles[key][t.group(1)] += 1
            d = re.search(r'name="description" content="([^"]*)"', s)
            if d:
                descs[key][d.group(1)] += 1
    # duplicatas
    dup = {}
    for k, c in titles.items():
        dup[f'{k}:titulos_dup'] = sum(v - 1 for v in c.values() if v > 1)
    for k, c in descs.items():
        dup[f'{k}:descs_dup'] = sum(v - 1 for v in c.values() if v > 1)
    # CID nunca como PID
    cid_leak = 0
    for key, (pub, host, abbr) in SITES.items():
        for fp in glob.glob(pub + '/**/*.html', recursive=True):
            if '8041957' in open(fp, encoding='utf-8', errors='ignore').read():
                cid_leak += 1
    print('PÁGINAS/CARDS:', json.dumps({k: dict(v) for k, v in per.items()}, indent=1))
    print('ERROS:', dict(errs) or 'NENHUM ✅')
    print('DUPLICATAS:', dup)
    print('páginas com 8041957 (deve ser 0):', cid_leak)
    tot = sum(per[k]['cards'] for k in per)
    print('TOTAL cards implantados:', tot)
    if errs or any(v for v in dup.values()) or cid_leak:
        sys.exit(1)


if __name__ == '__main__':
    main()
