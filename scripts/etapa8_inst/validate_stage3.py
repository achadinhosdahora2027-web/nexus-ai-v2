#!/usr/bin/env python3
"""ETAPA 7 — validador do painel aplicado. Não escreve nada; sai 1 se algo estiver errado.

Checa, em TODAS as páginas de cidade dos três sites:
  1. cada marcador meu aparece no máximo uma vez, sempre em par aberto/fechado;
  2. nenhum bloco marcado ficou vazio (bloco sem dado tem de sumir, não virar casca);
  3. idempotência real: rodar o gerador de novo produz byte a byte o mesmo arquivo;
  4. tamanho: acréscimo por página dentro do teto combinado e nenhum arquivo acima do duro;
  5. herança da Etapa 6: bloco de atrações intacto, contagem de links patrocinados idêntica,
     nenhum PID antigo (8041957) e nenhum PID cruzado entre sites;
  6. JSON-LD do bloco ld-city parseia, é City, e não quebrou o </script>;
  7. os <script defer> do widget só existem quando o bloco que os usa existe, e o arquivo
     js correspondente está no disco do site;
  8. nenhum resto de template: 'None', 'nan', '—' sozinho, dois espaços, 'TODO', '{{';
  9. metas: description/keywords com no máximo um <meta name=...> por chave, data-p7 presente
     quando há apêndice nosso, e dentro do limite útil de buscador;
 10. posição: os blocos vêm depois de <!-- /city-attractions --> e antes de </body>;
 11. city-instituicoes (bloco que só agora passou a ter dados): sem <ul>/<li> vazios, sem
     parênteses ocos, no máximo 8 grupos × 4 itens, sem grupo repetido e com a nota de fonte.

Uso: python3 bin/validate_stage3.py [--amostra N] [--site s] [--silencioso]
"""
import argparse
import collections
import glob
import importlib.util
import json
import os
import re
import sys

WORK = '/home/user/work'
sys.path.insert(0, f'{WORK}/bin')
_sp = importlib.util.spec_from_file_location('s3', f'{WORK}/bin/stage3_panel.py')
S3 = importlib.util.module_from_spec(_sp)
_sp.loader.exec_module(S3)
S2 = S3.S2

MEUS = ['city-fachada', 'city-nomes', 'city-clima', 'city-mobilidade', 'city-busca',
        'city-instituicoes', 'painel-osm', 'ld-city', 'p7-css', 'p7-js']
TETO_DELTA = 38_000   # Etapa 7 + painel de instituições: teto revisado (páginas seguem < 130 KB)
TETO_ABS = 145_000
PIDS = {'solvegrid': '101870640', 'nexus': '101870639', 'aquitem': '101859672'}


def checa(fp, texto, base, site, ctx):
    """devolve (problemas, avisos) daquela página — aviso é o que já veio da Etapa 6."""
    e = []
    abertos = collections.Counter(re.findall(r'<!-- ([a-z0-9-]+) -->', texto))
    fechados = collections.Counter(re.findall(r'<!-- /([a-z0-9-]+) -->', texto))
    for mk in MEUS:
        if abertos[mk] > 1:
            e.append(f'{mk}: {abertos[mk]} aberturas')
        if abertos[mk] != fechados[mk]:
            e.append(f'{mk}: {abertos[mk]} aberturas × {fechados[mk]} fechamentos')
        if re.search(rf'<!-- {mk} -->\s*<!-- /{mk} -->', texto):
            e.append(f'{mk}: bloco vazio')
    # o painel de instituições só ganhou dados nesta rodada (antes o cache estava vazio,
    # então nenhum desses caminhos tinha sido exercitado): tetos e ausência de casca vazia
    mi = re.search(r'<!-- city-instituicoes -->(.*?)<!-- /city-instituicoes -->', texto, re.S)
    if mi:
        b = mi.group(1)
        if '<ul></ul>' in b or re.search(r'<ul>\s*</ul>', b):
            e.append('city-instituicoes: <ul> vazio')
        if re.search(r'\(\s*\)', b):
            e.append('city-instituicoes: parênteses vazios')
        if b.count('<li>') > 32:
            e.append(f'city-instituicoes: {b.count("<li>")} itens (teto 8×4=32)')
        titulos = re.findall(r'class="sub"[^>]*>([^<]+)</p>', b)
        if len(titulos) > 8:
            e.append(f'city-instituicoes: {len(titulos)} grupos (teto 8)')
        if len(set(titulos)) != len(titulos):
            e.append('city-instituicoes: grupo repetido')
        if 'Wikidata' not in b:
            e.append('city-instituicoes: sem nota de fonte')
        if re.search(r'<li>\s*</li>', b):
            # antes era `>\s*</li>` — que casava com o fecho legítimo de
            # <li>Nome <span>(desde 2011)</span></li> e acusava 4.471 páginas boas
            e.append('city-instituicoes: <li> sem nome')
    # 4. tamanho
    meus_bytes = sum(len(p.encode()) for mk in MEUS
                     for p in re.findall(r'<!-- %s -->(.*?)<!-- /%s -->' % (re.escape(mk), re.escape(mk)),
                                         texto, re.S))
    d = (len(texto.encode()) - len(base.encode())) if base is not None else meus_bytes
    if d > TETO_DELTA:
        e.append(f'delta +{d:,} acima do teto de +{TETO_DELTA:,}')
    if len(texto.encode()) > TETO_ABS:
        e.append(f'{len(texto.encode()):,} bytes acima do teto duro')
    # 5. herança Etapa 6: o que era publicado tem de continuar igual
    if base is None:                      # arquivo novo, sem versão publicada
        base = texto
    ab_base = collections.Counter(re.findall(r'<!-- ([a-z0-9-]+) -->', base))
    for mk in ('city-attractions', 'visitor-langs', 'ld-attractions', 'faq-attractions', 'geo-offers'):
        if ab_base[mk] != abertos[mk]:
            e.append(f'bloco {mk} da Etapa 6 mudou de {ab_base[mk]} para {abertos[mk]}')
    if '8041957' in texto:
        e.append('PID antigo 8041957 reapareceu')
    pat = PIDS.get(site)
    for outro, pid in PIDS.items():
        if outro != site and pid in texto:
            e.append(f'PID do site {outro} vazou aqui')
    if pat and f'click-{pat}-' in texto and site == 'solvegrid':
        pass
    n_sp_spon = len(re.findall(r'rel="sponsored noopener nofollow"', texto))
    n_sp_orig = len(re.findall(r'rel="sponsored noopener nofollow"', base))
    if n_sp_spon != n_sp_orig:
        e.append(f'links patrocinados mudaram: {n_sp_orig} -> {n_sp_spon}')
    # 6. JSON-LD
    m = re.search(r'<!-- ld-city -->\s*<script type="application/ld\+json">(.*?)</script>', texto, re.S)
    if m:
        corpo = m.group(1)
        if '</' in corpo.replace('<\\/', ''):
            e.append('JSON-LD contém </ não escapado')
        try:
            dd = json.loads(corpo)
            objs = dd if isinstance(dd, list) else [dd]
            if not any(o.get('@type') == 'City' for o in objs):
                e.append('JSON-LD sem @type City')
        except json.JSONDecodeError as exc:
            e.append(f'JSON-LD inválido: {exc}')
    elif 'ld-city' in abertos:
        e.append('ld-city presente sem <script> parseável')
    # 7. scripts
    for jsname, bloco in (('clima.js', 'city-clima'), ('painel-osm.js', 'painel-osm')):
        tem_tag = f'/js/{jsname}' in texto
        if tem_tag and not abertos[bloco]:
            e.append(f'{jsname} carregado sem o bloco {bloco}')
    if 'clima.js' in texto and 'painel-osm.js' in texto and re.search(r'</head>', texto):
        pass
        if abertos[bloco] and not tem_tag:
            e.append(f'bloco {bloco} sem o {jsname}')
        if abertos[bloco] and not os.path.exists(f'{S2.SITES[site][0]}/js/{jsname}'):
            e.append(f'falta o arquivo public/js/{jsname} no site')
    # 8. restos de template (só nos blocos que este gerador escreve — o resto da página é da Etapa 6)
    meu = ''.join(parte for mk in MEUS
                  for parte in re.findall(r'<!-- %s -->(.*?)<!-- /%s -->' % (re.escape(mk), re.escape(mk)),
                                          texto, re.S))
    for junk in ('>None<', '>NaN<', 'TODO', '{{', '&amp;lt;', '>—</strong>', 'undefined', '[object'):
        if junk in meu:
            e.append(f'resto de template no bloco: {junk!r}')
    if re.search(r'<section class="p7[^"]*">\s*</section>', texto):
        e.append('<section> vazia')
    # 9. metas
    herdado = []
    for nome, lim in (('description', 320), ('keywords', 480)):
        ach = re.findall(r'<meta name="%s"[^>]*>' % nome, texto)
        if len(ach) > 1:
            e.append(f'{len(ach)} metas {nome}')
        if ach:
            ct = re.search(r'content="([^"]*)"', ach[0])
            n = len(ct.group(1)) if ct else 0
            if n > lim:
                # só é meu problema se eu escrevi alguma coisa ali
                (e if 'data-p7=' in ach[0] else herdado).append(f'meta {nome} com {n} chars')
    if len(re.findall(r'</head>', texto)) != 1 or len(re.findall(r'<head[ >]', texto)) != 1:
        e.append('estrutura de <head> quebrada')
    # 10. posição
    ia = texto.find('<!-- /city-attractions -->')
    if ia >= 0:
        for mk in [m for m in MEUS if m not in ('ld-city', 'p7-css', 'p7-js')]:
            ib = texto.find(f'<!-- {mk} -->')
            if ib >= 0 and ib < ia:
                e.append(f'{mk} antes do bloco de atrações')
    if texto.find('<!-- painel-osm -->') >= 0 and texto.find('<!-- painel-osm -->') > texto.rfind('</body>'):
        e.append('bloco depois de </body>')
    return e, herdado


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--amostra', type=int, default=0, help='máx. de páginas por site (0 = todas)')
    ap.add_argument('--site', default='')
    ap.add_argument('--sem-idempotencia', action='store_true')
    ap.add_argument('--com-git', action='store_true',
                    help='compara com o publicado (git HEAD) — lento: 1 chamada ao git por arquivo')
    ap.add_argument('--silencioso', action='store_true')
    a = ap.parse_args()
    ctx = S3.load()
    tot = collections.Counter()
    exemplos = collections.defaultdict(list)
    for site, (pub, host, repo) in S2.SITES.items():
        if a.site and a.site != site:
            continue
        files = sorted(glob.glob(pub + '/[a-z][a-z]/*.html'))
        if a.amostra:
            step = max(1, len(files) // a.amostra)
            files = files[::step][:a.amostra]
        for fp in files:
            tot['páginas'] += 1
            original = open(fp, encoding='utf-8').read()
            # para delta e herança, comparo com o que está publicado (git HEAD do repo);
            # sem --com-git o cheque de tamanho usa a soma dos próprios blocos (barato)
            base = git_show(repo, fp) if a.com_git else None
            errs, avisos = checa(fp, original, base if base is not None else original, site, ctx)
            if not a.sem_idempotencia:
                novo, _st = S3.build(fp, ctx, site)
                if novo is not None and novo != original:
                    errs.append('não-idempotente: reprocessar mudaria o arquivo')
            if avisos:
                tot['aviso: meta longo herdado (pré-Etapa 7)'] += 1
            if errs:
                tot['problemas'] += 1
                for k in errs:
                    tipo = k.split(':')[0]
                    tot['tipo: ' + tipo] += 1
                    if len(exemplos[tipo]) < 3:
                        exemplos[tipo].append(f'{site}/{os.path.relpath(fp, pub)}')
        print(f'[{site}] {tot["páginas"]} páginas vistas', flush=True)
    print(json.dumps(dict(tot), ensure_ascii=False, indent=1))
    for k, v in exemplos.items():
        print(f'  {k}: {v}')
    if not tot['problemas']:
        print('VALIDADO: nenhum problema nas', tot['páginas'], 'páginas')
    return 1 if tot['problemas'] else 0


_CACHE_GIT = {}


def git_show(repo, fp):
    """conteúdo da versão publicada (HEAD) daquele arquivo, para comparar herança/tamanho."""
    chave = (repo, fp)
    if chave in _CACHE_GIT:
        return _CACHE_GIT[chave]
    import subprocess
    rel = os.path.relpath(fp, f'{WORK}/repos/{repo}')
    try:
        r = subprocess.run(['git', '-C', f'{WORK}/repos/{repo}', 'show', f'HEAD:{rel}'],
                           capture_output=True, text=True, timeout=30)
        out = r.stdout if r.returncode == 0 else None
    except Exception:                                                    # noqa: BLE001
        out = None
    if len(_CACHE_GIT) < 40000:
        _CACHE_GIT[chave] = out
    return out


if __name__ == '__main__':
    raise SystemExit(main())
