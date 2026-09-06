#!/usr/bin/env python3
"""ETAPA 8 — Injector genérico de blocos (idempotente, com herança verificável).

Opera no repo onde está (ROOT = parent de scripts/). Plugins:
  agora  — bloco <!-- city-agora --> (tempo ao vivo) em páginas COM coords OSM e SEM city-clima.

Regras (REGRAS-OPERACIONAIS.md): marcador próprio, inserção canônica idempotente
(rstrip+bloco+lstrip — lição Etapa 7 §2.4), 1 <script> por bloco no p7-js, i18n via TRAD,
pular noindex, log JSONL em out/.

Uso:
  python3 scripts/etapa8_inject.py agora [--apply] [--limit N]
  sem --apply: dry-run (só conta e loga).
"""
import json
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import etapa8_plugin_fachada2 as fachada2

ROOT = Path(__file__).resolve().parent.parent
PUB = ROOT / "public"
OUT = ROOT / "out"

TRAD = {
    "agora_titulo": {"pt": "🌦️ Tempo agora", "fr": "🌦️ Météo actuelle", "it": "🌦️ Meteo adesso"},
    "agora_consulta": {"pt": "Consultando o tempo agora…", "fr": "Consultation de la météo en cours…",
                       "it": "Consultazione meteo in corso…"},
    "agora_fonte": {"pt": "Fonte: Open-Meteo, ao vivo no seu navegador.",
                    "fr": "Source : Open-Meteo, en direct dans votre navigateur.",
                    "it": "Fonte: Open-Meteo, in diretta nel tuo browser."},
}


def t(key, lang):
    return TRAD[key].get(lang, TRAD[key]["pt"])


def city_pages():
    files = []
    for d in PUB.iterdir():
        if d.is_dir() and len(d.name) == 2 and d.name.isalpha():
            files.extend(sorted(d.glob("*.html")))
    return files


def is_noindex(head):
    m = re.search(r'<meta name="robots" content="([^"]*)"', head)
    return bool(m and "noindex" in m.group(1))


def plugin_agora(html, page_rel):
    """Retorna (novo_html, ação, detalhe)."""
    if "<!-- city-clima -->" in html:
        return html, "skip", "tem city-clima"
    if "<!-- city-agora -->" in html:
        return html, "skip", "já tem city-agora"
    head = html.split("</head>")[0]
    if is_noindex(head):
        return html, "skip", "noindex"
    m = re.search(
        r'<div class="p7-osm" data-lat="([^"]+)" data-lon="([^"]+)"[^>]*data-city="([^"]*)"[^>]*data-lang="([^"]*)"',
        html,
    )
    if not m:
        m = re.search(r'<div class="p7-osm" data-lat="([^"]+)" data-lon="([^"]+)"', html)
        if not m:
            return html, "skip", "sem painel-osm/coords"
        lat, lon = m.group(1), m.group(2)
        city, lang = "", "pt"
        m2 = re.search(r'<div class="p7-osm"[^>]*data-city="([^"]*)"', html)
        if m2:
            city = m2.group(1)
        m3 = re.search(r'<div class="p7-osm"[^>]*data-lang="([^"]*)"', html)
        if m3:
            lang = m3.group(1)
    else:
        lat, lon, city, lang = m.group(1), m.group(2), m.group(3), m.group(4)
    if not lat or not lon or lat == "null" or lon == "null":
        return html, "skip", "coords nulas"
    if "<!-- painel-osm -->" not in html:
        return html, "skip", "sem âncora painel-osm"
    lang = (lang or "pt").split("-")[0]
    bloco = (
        "\n<!-- city-agora -->\n"
        '<section class="p7 p7-agora-bloco" style="margin:24px 0;padding:15px 17px;border:1px solid #1e293b;border-radius:14px">'
        f'<h2 style="margin:0 0 11px;font-size:1.13rem">{t("agora_titulo", lang)}</h2>'
        f'<div class="p7-agora" data-lat="{lat}" data-lon="{lon}" data-city="{city}" data-lang="{lang}" '
        'style="margin:0;padding:11px 13px;border:1px solid #334155;border-radius:12px;font-size:.9rem">'
        f'<span style="color:#94a3b8">{t("agora_consulta", lang)}</span></div>'
        f'<p style="margin:7px 0 0;font-size:.75rem;color:#94a3b8">{t("agora_fonte", lang)}</p>'
        "</section>\n<!-- /city-agora -->\n"
    )
    # Inserção canônica antes da âncora (idempotente — lição Etapa 7 §2.4)
    anchor = "<!-- painel-osm -->"
    pre, post = html.split(anchor, 1)
    html = pre.rstrip("\n") + bloco + post.lstrip("\n")
    # Head: 1 <script> para este bloco
    if "/js/clima.js" not in html.split("</head>")[0]:
        mj = re.search(r"(<!-- p7-js -->)(.*?)(<!-- /p7-js -->)", html, re.S)
        if not mj:
            return html, "erro", "sem bloco p7-js no head"
        inner = mj.group(2)
        if "clima.js" not in inner:
            inner = inner.rstrip("\n") + '\n<script defer src="/js/clima.js"></script>\n'
        html = html[: mj.start(2)] + inner + html[mj.end(2):]
    return html, "injetado", f"lat={lat} lon={lon} lang={lang}"


def plugin_pais(html, page_rel):
    """Bloco city-fachada2 após <!-- /city-fachada --> (só se houver linhas)."""
    if "<!-- city-fachada -->" not in html:
        return html, "skip", "sem city-fachada"
    tem_antigo = "<!-- city-fachada2 -->" in html
    head = html.split("</head>")[0]
    if is_noindex(head):
        return html, "skip", "noindex"
    key = page_rel.replace("public/", "")[:-5]
    m = re.search(r'<div class="p7-osm"[^>]*data-lang="([^"]*)"', html)
    lang = (m.group(1) if m else "pt").split("-")[0]
    bloco = fachada2.build(html, key, lang)
    if not bloco:
        return html, "skip", "sem linhas (sem dados)"
    anchor = "<!-- /city-fachada -->"
    pre, post = html.split(anchor, 1)
    if tem_antigo:
        mantigo = re.search(r"\n?<!-- city-fachada2 -->.*?<!-- /city-fachada2 -->\n?", post, re.S)
        if mantigo and mantigo.group(0) == bloco:
            return html, "skip", "fachada2 inalterado"
        post = re.sub(r"\n?<!-- city-fachada2 -->.*?<!-- /city-fachada2 -->\n?", "", post, count=1, flags=re.S)
        html = pre + anchor + bloco + post.lstrip("\n")
        return html, "atualizado", f"lang={lang}"
    html = pre + anchor + bloco + post.lstrip("\n")
    return html, "injetado", f"lang={lang}"


PLUGINS = {"agora": plugin_agora, "pais": plugin_pais}


def main():
    if len(sys.argv) < 2 or sys.argv[1] not in PLUGINS:
        print(f"uso: {sys.argv[0]} {{{'|'.join(PLUGINS)}}} [--apply] [--limit N]")
        return 2
    plugin = PLUGINS[sys.argv[1]]
    apply = "--apply" in sys.argv
    limit = None
    if "--limit" in sys.argv:
        limit = int(sys.argv[sys.argv.index("--limit") + 1])
    OUT.mkdir(exist_ok=True)
    log = open(OUT / f"etapa8_inject_{sys.argv[1]}.jsonl", "w", encoding="utf-8")
    counts = {}
    try:
        files = city_pages()
        if limit:
            files = files[:limit]
        for f in files:
            rel = str(f.relative_to(ROOT))
            html = f.read_text(encoding="utf-8")
            try:
                novo, acao, detalhe = plugin(html, rel)
            except Exception as e:  # suspeitar de tudo: exceção vira erro logado, não crash
                acao, detalhe, novo = "erro", f"exceção: {e}", html
            counts[acao] = counts.get(acao, 0) + 1
            log.write(json.dumps({"arq": rel, "acao": acao, "detalhe": detalhe}, ensure_ascii=False) + "\n")
            if apply and acao in ("injetado", "atualizado"):
                f.write_text(novo, encoding="utf-8")
    finally:
        log.close()
    print(f"{'APPLY' if apply else 'DRY-RUN'} {sys.argv[1]}: {len(files)} páginas -> {counts}")
    return 0 if counts.get("erro", 0) == 0 else 1


if __name__ == "__main__":
    sys.exit(main())
