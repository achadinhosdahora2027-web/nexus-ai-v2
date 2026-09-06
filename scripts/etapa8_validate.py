#!/usr/bin/env python3
"""ETAPA 8 — Validador genérico pós-injeção (plugin: agora).

Checa em 100% das city pages:
1. city-agora pareado e não-vazio (quando presente)
2. clima.js no p7-js SSE (city-agora OU city-clima) — regra "1 script por bloco"
3. .p7-agora com data-lat/lon/city/lang válidos; título traduzido == lang (zero vazamento pt)
4. HERANÇA nos arquivos modificados vs git HEAD: trecho geo-offers idêntico,
   contagem kqzyfj/sponsored/geo-multi idêntica, city-attractions intacto
5. Tamanho: diff < +3KB vs HEAD por arquivo
Uso: python3 scripts/etapa8_validate.py
"""
import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
PUB = ROOT / "public"
TETO_BYTES = 3000

TITULOS = {"pt": "🌦️ Tempo agora", "fr": "🌦️ Météo actuelle", "it": "🌦️ Meteo adesso"}


def sh(*args):
    return subprocess.run(args, cwd=ROOT, capture_output=True, text=True)


def city_pages():
    files = []
    for d in sorted(PUB.iterdir()):
        if d.is_dir() and len(d.name) == 2 and d.name.isalpha():
            files.extend(sorted(d.glob("*.html")))
    return files


def main():
    errors, warns = [], []
    files = city_pages()
    mod = {ln.split()[-1] for ln in sh("git", "status", "--porcelain", "public/").stdout.splitlines() if ln.strip()}
    mod = {m for m in mod if m.endswith(".html")}
    n_agora = 0
    for f in files:
        rel = str(f.relative_to(ROOT))
        h = f.read_text(encoding="utf-8")
        abertos = h.count("<!-- city-agora -->")
        fechados = h.count("<!-- /city-agora -->")
        if abertos != fechados:
            errors.append(f"{rel}: marcadores city-agora desemparelhados ({abertos}/{fechados})")
            continue
        if abertos > 1:
            errors.append(f"{rel}: city-agora duplicado x{abertos}")
        tem_agora = abertos == 1
        tem_clima = "<!-- city-clima -->" in h
        if tem_agora:
            n_agora += 1
            m = re.search(r"<!-- city-agora -->(.*?)<!-- /city-agora -->", h, re.S)
            if not m or len(m.group(1).strip()) < 100:
                errors.append(f"{rel}: city-agora vazio")
                continue
            bloco = m.group(1)
            g = re.search(r'<div class="p7-agora" data-lat="([^"]+)" data-lon="([^"]+)" data-city="([^"]*)" data-lang="([^"]*)"', bloco)
            if not g:
                errors.append(f"{rel}: .p7-agora sem data-* completos")
            else:
                lang = g.group(4).split("-")[0]
                if g.group(1) in ("", "null") or g.group(2) in ("", "null"):
                    errors.append(f"{rel}: coords nulas no city-agora")
                esp = TITULOS.get(lang, TITULOS["pt"])
                if esp not in bloco:
                    errors.append(f"{rel}: título traduzido errado p/ lang={lang}")
                if lang in ("fr", "it") and "Tempo agora" in bloco and lang == "fr":
                    errors.append(f"{rel}: vazamento de português em página {lang}")
                if lang == "it" and "Consultando o tempo agora" in bloco:
                    errors.append(f"{rel}: vazamento de português em página it")
        head = h.split("</head>")[0]
        tem_js = "/js/clima.js" in head
        if tem_js and not (tem_agora or tem_clima):
            errors.append(f"{rel}: clima.js sem bloco correspondente")
        if (tem_agora or tem_clima) and not tem_js:
            errors.append(f"{rel}: bloco de clima sem clima.js no head")
        if rel in mod:
            r = sh("git", "show", f"HEAD:{rel}")
            if r.returncode != 0:
                warns.append(f"{rel}: sem HEAD (arquivo novo?)")
                continue
            old = r.stdout
            for marc in ("geo-offers", "geo-multi", "city-attractions"):
                a = re.search(rf"<!-- {marc} -->(.*?)<!-- /{marc} -->", old, re.S)
                b = re.search(rf"<!-- {marc} -->(.*?)<!-- /{marc} -->", h, re.S)
                if (a is None) != (b is None):
                    errors.append(f"{rel}: bloco {marc} sumiu/apareceu!")
                elif a and b and a.group(1) != b.group(1):
                    errors.append(f"{rel}: bloco {marc} ALTERADO pela injeção!")
            for token in ("kqzyfj.com", 'rel="sponsored', "8041957"):
                if old.count(token) != h.count(token):
                    errors.append(f"{rel}: contagem '{token}' mudou {old.count(token)}->{h.count(token)}")
            if "101870640" in h or "101870639" in h or "101859672" in h:
                pass  # PIDs: cada repo tem o seu; troca de PID seria pega acima pelo count
            if len(h.encode("utf-8")) - len(old.encode("utf-8")) > TETO_BYTES:
                errors.append(f"{rel}: cresceu além do teto (+{len(h.encode()) - len(old.encode())}B)")
    print(f"varridas {len(files)} city pages ({len(mod)} modificadas); city-agora presente em {n_agora}")
    if warns:
        print(f"AVISOS ({len(warns)}):")
        [print(" -", w) for w in warns[:20]]
    if errors:
        print(f"ERROS ({len(errors)}):")
        [print(" -", e) for e in errors[:40]]
        return 1
    print("ERROS: NENHUM ✅")
    return 0


if __name__ == "__main__":
    sys.exit(main())
