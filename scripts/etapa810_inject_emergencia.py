#!/usr/bin/env python3
# ETAPA 8.10 — bloco `city-emergencia`: números nacionais de emergência por país.
# Fonte: Wikidata P2852 (+ uso P366), coletado por etapa810_harvest_emergencia.py.
# Nada inventado; países sem dado → sem bloco. Idempotente; i18n pt/en/es/fr/it/de.
import json, re, sys
from pathlib import Path
from collections import Counter

ROOT = Path(__file__).resolve().parent.parent
DATA = json.load(open(ROOT / "out" / "etapa8_emergencia.json", encoding="utf-8"))
APPLY = "--apply" in sys.argv

TRAD = {
  "titulo": {"pt": "🚨 Emergência — números nacionais", "en": "🚨 Emergency — national numbers",
             "es": "🚨 Emergencia — números nacionales", "fr": "🚨 Urgence — numéros nationaux",
             "it": "🚨 Emergenza — numeri nazionali", "de": "🚨 Notfall — landesweite Nummern"},
  "geral": {"pt": "Emergência", "en": "Emergency", "es": "Emergencia",
            "fr": "Urgence", "it": "Emergenza", "de": "Notruf"},
  "nota": {"pt": "Números oficiais de emergência do país. Fonte: Wikidata (propriedade P2852). Em dúvida, confirme na fonte local.",
           "en": "Official national emergency numbers. Source: Wikidata (property P2852). If in doubt, check the local source.",
           "es": "Números oficiales de emergencia del país. Fuente: Wikidata (propiedad P2852). En caso de duda, confirme en la fuente local.",
           "fr": "Numéros d'urgence nationaux officiels. Source : Wikidata (propriété P2852). En cas de doute, vérifiez auprès de la source locale.",
           "it": "Numeri di emergenza nazionali ufficiali. Fonte: Wikidata (proprietà P2852). In caso di dubbio, verifica la fonte locale.",
           "de": "Offizielle nationale Notrufnummern. Quelle: Wikidata (Eigenschaft P2852). Im Zweifel bei der lokalen Quelle nachprüfen."},
}

def t(k, lang):
    lang = (lang or "pt").split("-")[0]
    return TRAD[k].get(lang, TRAD[k]["pt"])

def city_pages():
    out = []
    for d in sorted(Path(ROOT / "public").iterdir()):
        if d.is_dir():
            out.extend(sorted(d.glob("*.html")))
    return out

def is_noindex(h):
    return bool(re.search(r'<meta[^>]*name=["\']robots["\'][^>]*content=["\'][^"]*noindex', h, re.I))

def build_block(page_html, key):
    cc = key.split("/")[0]
    rec = DATA.get(cc)
    if not rec or not rec.get("nums"):
        return None, "skip-semdados"
    lang = "pt"
    m = re.search(r'<div class="p7-osm"[^>]*data-lang="([^"]*)"', page_html)
    if m:
        lang = (m.group(1) or "pt").split("-")[0]
    by_label = {}
    for r in rec["nums"]:
        lab = None
        if r.get("use_qid"):
            lab = r.get("use_l10n", {}).get(lang) or r.get("use_l10n", {}).get("en")
        lab = lab or t("geral", lang)
        by_label.setdefault(lab, []).append(r["n"])
    rows = ""
    for lab in sorted(by_label, key=str.lower):
        nums = sorted(by_label[lab], key=str)
        tel = " · ".join(
            '<a style="color:#b91c1c;font-weight:600;text-decoration:none" href="tel:%s">%s</a>' % (
                re.sub("[^0-9+#*]", "", n) or n, n)
            for n in nums)
        rows += f'<tr><td style="padding:3px 8px 3px 0;color:#334155">{lab}</td><td style="text-align:right;white-space:nowrap">{tel}</td></tr>'
    body = (f'<section class="p7 p7-emergencia" style="margin:24px 0">'
            f'<h2 style="margin:0 0 6px;font-size:1.13rem">{t("titulo", lang)}</h2>'
            f'<table style="width:100%;border-collapse:collapse;font-size:.9rem">{rows}</table>'
            f'<p style="margin:7px 0 0;font-size:.75rem;color:#94a3b8">{t("nota", lang)}</p></section>')
    return body, lang

BLOCK_RE = re.compile(r"\n?<!-- city-emergencia -->.*?<!-- /city-emergencia -->\n?", re.S)

def plugin(page_html, rel):
    if "<!-- city-fachada -->" not in page_html:
        return page_html, "skip-semfachada", None
    if is_noindex(page_html):
        return page_html, "skip-noindex", None
    key = rel[len("public/"):-len(".html")]
    body, lang = build_block(page_html, key)
    if body is None:
        return page_html, lang, None
    novo_block = "\n<!-- city-emergencia -->\n" + body + "\n<!-- /city-emergencia -->\n"
    if "<!-- city-emergencia -->" in page_html:
        novo = BLOCK_RE.sub(novo_block, page_html, count=1)
        return (page_html, "inalterado", lang) if novo == page_html else (novo, "atualizado", lang)
    anchor = "<!-- /city-viagens -->"
    if anchor not in page_html:
        anchor = "<!-- /city-mobilidade -->"
    if anchor not in page_html:
        return page_html, "skip-sem-ancora", lang
    j = page_html.find(anchor) + len(anchor)
    prefix = page_html[:j].rstrip("\n"); rest = page_html[j:].lstrip("\n")
    return prefix + "\n\n" + novo_block + "\n" + rest, "injetado", lang

def main():
    counts = Counter(); files = city_pages()
    for p in files:
        rel = p.relative_to(ROOT).as_posix()
        h = p.read_text(encoding="utf-8", errors="ignore")
        novo, acao, lang = plugin(h, rel)
        counts[acao] += 1
        if APPLY and acao in ("injetado", "atualizado"):
            p.write_text(novo, encoding="utf-8")
    print(("APPLY" if APPLY else "DRY-RUN"), "emergencia: total", len(files), dict(counts), flush=True)

if __name__ == "__main__":
    main()
