#!/usr/bin/env python3
"""ETAPA 8.3 — Plugin fachada2: bloco <!-- city-fachada2 --> (ficha do país + extras da cidade).

Uso pelo injector (`etapa8_inject.py`, plugin "pais") e pelo validador (regeneração byte a byte).
Determinístico: mesmas entradas = mesmos bytes.

Dados (out/): etapa8_paises.json (cc), etapa8_fachada_cidades.jsonl (key), etapa8_fusos.json (key),
etapa8_qid_excluidos.json (QIDs com apelidos/feriados vetados — auditoria wd_audit).
Regras de exibição (ver ETAPA-8.3-RELATORIO):
- país: country-QID do ld da página (índice qid→país); conflito ld-vs-pasta → título vence;
  ld inválido/não-país → fallback país-da-pasta (cc); ambos inválidos → sem seção país
- moeda/capital/fusos/continente: exclui rank deprecated; moeda/capital: end==null (atuais,
  dedup); fallback = mais recente + " (até ANO)"
- idiomas: todos, ordem preferred > normal > deprecated, dedup nome
- DDD: raw (zeros preservados — "061" BR vs "052" AL têm semânticas distintas), cap 4 + "e mais N"
- CEP: NÃO exibido (fachada já tem "Faixa de código postal")
- apelidos: dedup texto, lang da página primeiro, cap 6 + "e mais N", HTML-escaped
- fuso: tz IANA + UTC jan/jul + DST (nota "2026" no rodapé); formato UTC−3 / UTC+5:30
- feriados: só com href http extraído do "Site oficial" da fachada; sem href → linha some
- sem nenhuma linha → retorna None (não injeta bloco vazio)
"""
import html
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
PUB = ROOT / "public"
OUT = ROOT / "out"

TRAD = {
    "titulo": {"pt": "🏛️ Ficha do país e da cidade", "fr": "🏛️ Fiche du pays et de la ville",
              "it": "🏛️ Scheda del paese e della città"},
    "moeda": {"pt": "Moeda", "fr": "Monnaie", "it": "Moneta"},
    "idiomas": {"pt": "Idiomas", "fr": "Langues", "it": "Lingue"},
    "codigos": {"pt": "Códigos do país", "fr": "Codes du pays", "it": "Codici del paese"},
    "capital": {"pt": "Capital", "fr": "Capitale", "it": "Capitale"},
    "continente": {"pt": "Continente", "fr": "Continent", "it": "Continente"},
    "fusos_pais": {"pt": "Fusos do país", "fr": "Fuseaux du pays", "it": "Fusi del paese"},
    "ddd": {"pt": "DDD / código de área", "fr": "Indicatif régional", "it": "Prefisso telefonico"},
    "fuso": {"pt": "Fuso horário", "fr": "Fuseau horaire", "it": "Fuso orario"},
    "apelidos": {"pt": "Também chamada de", "fr": "Aussi appelée", "it": "Chiamata anche"},
    "feriados": {"pt": "Feriados municipais", "fr": "Jours fériés municipaux", "it": "Festività comunali"},
    "feriados_link": {"pt": "consulte o site oficial ↗", "fr": "voir le site officiel ↗",
                      "it": "vedi il sito ufficiale ↗"},
    "com_dst": {"pt": "com horário de verão", "fr": "avec heure d'été", "it": "con ora legale"},
    "sem_dst": {"pt": "sem horário de verão", "fr": "sans heure d'été", "it": "senza ora legale"},
    "mais": {"pt": "e mais {n}", "fr": "et {n} autres", "it": "e altri {n}"},
    "ate": {"pt": "até {a}", "fr": "jusqu'en {a}", "it": "fino al {a}"},
    "rodape": {
        "pt": "Fontes: Wikidata + base IANA (fusos calculados para 2026). Onde a fonte não tem o dado, a linha não aparece.",
        "fr": "Sources : Wikidata + base IANA (fuseaux calculés pour 2026). Sans donnée, la ligne n'apparaît pas.",
        "it": "Fonti: Wikidata + database IANA (fusi calcolati per il 2026). Senza dati, la riga non appare."},
}

_CACHE = {}


def t(key, lang):
    return TRAD[key].get(lang, TRAD[key]["pt"])


def load():
    if "p" not in _CACHE:
        _CACHE["p"] = json.load(open(OUT / "etapa8_paises.json", encoding="utf-8"))
        _CACHE["c"] = {}
        for line in open(OUT / "etapa8_fachada_cidades.jsonl", encoding="utf-8"):
            r = json.loads(line)
            _CACHE["c"][r["key"]] = r
        _CACHE["f"] = json.load(open(OUT / "etapa8_fusos.json", encoding="utf-8"))
        try:
            ex = json.load(open(OUT / "etapa8_qid_excluidos.json", encoding="utf-8"))
            _CACHE["xa"] = set(ex.get("sem_apelido", []))
            _CACHE["xf"] = set(ex.get("sem_feriado", []))
        except FileNotFoundError:
            _CACHE["xa"], _CACHE["xf"] = set(), set()
        _CACHE["q2c"] = {v["qid"]: k for k, v in _CACHE["p"].items() if v.get("qid")}
    return _CACHE["p"], _CACHE["c"], _CACHE["f"], _CACHE["xa"], _CACHE["xf"], _CACHE["q2c"]


def ano(iso):
    m = re.match(r"[+-]?(\d{4})", iso or "")
    return m.group(1) if m else "?"


def fmt_utc(v):
    """-3 -> '−3' (U+2212); 9 -> '+9'; 5.5 -> '+5:30'; 0 -> '+0'."""
    neg = v < 0
    a = abs(v)
    h = int(a)
    mnt = int(round((a - h) * 60))
    if mnt == 60:
        h, mnt = h + 1, 0
    corpo = str(h) if mnt == 0 else f"{h}:{mnt:02d}"
    return ("−" if neg else "+") + corpo


def fuso_txt(fz, lang):
    base = f"UTC{fmt_utc(fz['utc_jan'])}"
    if fz["utc_jan"] != fz["utc_jul"]:
        base = f"UTC{fmt_utc(fz['utc_jan'])}/{fmt_utc(fz['utc_jul'])}"
    dst = t("com_dst", lang) if fz["dst"] else t("sem_dst", lang)
    return f"{fz['tz']} · {base} · {dst}"


def cur_cap(vals, lang, fmt_one):
    vals = [v for v in vals if v.get("rank") != "deprecated"]
    atuais = [v for v in vals if not v.get("end")]
    if atuais:
        return "; ".join(dedup([fmt_one(v) for v in atuais]))
    if not vals:
        return None
    v = sorted(vals, key=lambda x: x.get("end") or "")[-1]
    return f"{fmt_one(v)} ({t('ate', lang).format(a=ano(v.get('end')))})"


def moeda_txt(moedas, lang):
    def one(m):
        s = m["nome"] or m["iso"] or m["qid"]
        det = " · ".join(x for x in [m["iso"], m["simbolo"]] if x)
        return f"{s} ({det})" if det else s
    return cur_cap(moedas, lang, one)


def capital_txt(caps, lang):
    return cur_cap(caps, lang, lambda c: c["nome"] or c["qid"])


def idiomas_txt(idiomas):
    """preferred primeiro (ordem do claim); demais em ordem alfabética (inclui deprecated,
    ex.: inglês nos EUA é deprecated como 'oficial federal' mas é o idioma de facto)."""
    pref = [i["nome"] or i["qid"] for i in idiomas if i.get("rank") == "preferred"]
    resto = sorted({(i["nome"] or i["qid"]) for i in idiomas if i.get("rank") != "preferred"})
    out = [n for n in pref if n] + [n for n in resto if n not in pref]
    return ", ".join(dedup(out)) if out else None


def norm_utc(label):
    """'UTC\u221204:00' -> 'UTC\u22124'; demais passam intactos."""
    m = re.match(r"^UTC([\u2212\-+])?(\d{1,2})(?::(\d{2}))?$", (label or "").strip())
    if not m or not m.group(1):
        return label
    v = int(m.group(2)) + (int(m.group(3)) / 60 if m.group(3) else 0)
    if m.group(1) in ("-", "\u2212"):
        v = -v
    return "UTC" + fmt_utc(v)


def dedup(seq):
    vistos, out = set(), []
    for x in seq:
        if x not in vistos:
            vistos.add(x)
            out.append(x)
    return out


def cap_list(vals, n, lang):
    if len(vals) <= n:
        return ", ".join(vals)
    return ", ".join(vals[:n]) + f" ({t('mais', lang).format(n=len(vals) - n)})"


def apelidos_txt(apelidos, lang):
    unicos = []
    vistos = set()
    for a in apelidos:
        if a["text"] not in vistos:
            vistos.add(a["text"])
            unicos.append(a)
    def score(a):
        al = (a.get("lang") or "").lower()
        if al == lang or al.startswith(lang + "-"):
            return 0
        if al == "en" or al.startswith("en-"):
            return 1
        return 2
    unicos.sort(key=score)
    vals = [html.escape(a["text"], quote=False) for a in unicos]
    return cap_list(vals, 6, lang) if vals else None


def site_oficial_href(fachada_bloco):
    m = re.search(r"Site oficial</dt>(.*?)</dd>", fachada_bloco, re.S)
    if not m:
        return None
    h = re.search(r'href="([^"]+)"', m.group(1))
    if not h or not h.group(1).startswith("http"):
        return None
    return h.group(1)


def pais_da_pagina(html_doc, key, paises, qid2cc):
    """Resolve o país: country-QID do ld → índice; conflito ld-vs-pasta → título vence
    (evita contradição visível); ld inválido → pasta; tudo inválido → None."""
    cc = key.split("/")[0]
    pasta = paises.get(cc)
    m = re.search(r'"country":\{"@type":"Country","name":"[^"]+","sameAs":"https://www.wikidata.org/wiki/(Q\d+)"',
                  html_doc)
    cc_ld = qid2cc.get(m.group(1)) if m else None
    ld_pais = paises.get(cc_ld) if cc_ld else None
    if not ld_pais:
        return pasta
    if not pasta or (pasta.get("qid") and pasta["qid"] == m.group(1)):
        return ld_pais
    titulo = re.search(r"<title>(.*?)</title>", html_doc, re.S)
    titulo = titulo.group(1) if titulo else ""
    nome_pasta = pasta.get("nome") or ""
    if nome_pasta and re.search(r",\s*" + re.escape(nome_pasta) + r"\b", titulo):
        return pasta
    return ld_pais


def build(html_doc, key, lang):
    """Monta o bloco fachada2 ou retorna None (sem linhas / sem fachada)."""
    paises, cidades, fusos, exc_ap, exc_fe, qid2cc = load()
    linhas = []
    p = pais_da_pagina(html_doc, key, paises, qid2cc)
    if p:
        mo = moeda_txt(p["moedas"], lang)
        if mo:
            linhas.append((t("moeda", lang), html.escape(mo, quote=False)))
        idio = idiomas_txt(p["idiomas"])
        if idio:
            linhas.append((t("idiomas", lang), html.escape(idio, quote=False)))
        cods = " · ".join(x for x in [p.get("iso2"), p.get("iso3")] if x)
        if p.get("ddi"):
            ddis = ", ".join(dedup(p["ddi"]))
            cods = f"{cods} · {ddis}" if cods else ddis
        if cods:
            linhas.append((t("codigos", lang), html.escape(cods, quote=False)))
        cap = capital_txt(p["capital"], lang)
        if cap:
            linhas.append((t("capital", lang), html.escape(cap, quote=False)))
        cont = dedup([c["nome"] for c in p.get("continente", [])
                      if c.get("nome") and c.get("rank") != "deprecated" and not c.get("end")])
        if cont:
            linhas.append((t("continente", lang), html.escape(", ".join(cont), quote=False)))
        fp = dedup([norm_utc(f["nome"]) for f in p.get("fusos", [])
                    if f.get("nome") and f.get("rank") != "deprecated" and not f.get("end")])
        if fp:
            linhas.append((t("fusos_pais", lang), html.escape(", ".join(fp), quote=False)))
    c = cidades.get(key)
    if c and c.get("ddd"):
        linhas.append((t("ddd", lang), html.escape(cap_list(dedup(c["ddd"]), 4, lang), quote=False)))
    fz = fusos.get(key)
    if fz and fz.get("tz"):
        linhas.append((t("fuso", lang), html.escape(fuso_txt(fz, lang), quote=False)))
    qid_cid = c.get("qid") if c else None
    if c and c.get("apelidos") and qid_cid not in exc_ap:
        ap = apelidos_txt(c["apelidos"], lang)
        if ap:
            linhas.append((t("apelidos", lang), ap))
    mf = re.search(r"<!-- city-fachada -->(.*?)<!-- /city-fachada -->", html_doc, re.S)
    if mf and qid_cid not in exc_fe:
        href = site_oficial_href(mf.group(1))
        if href:
            linhas.append((t("feriados", lang),
                            f'<a href="{html.escape(href, quote=True)}" target="_blank" rel="noopener nofollow">{t("feriados_link", lang)}</a>'))
    if not linhas:
        return None
    dls = "\n".join(
        '<div style="display:flex;gap:10px;justify-content:space-between;align-items:baseline;border-bottom:1px dotted #334155;padding:3px 0">'
        f'<dt style="color:#94a3b8;margin:0">{k}</dt><dd style="margin:0;text-align:right"><strong>{v}</strong></dd></div>'
        for k, v in linhas
    )
    return (
        "\n<!-- city-fachada2 -->\n"
        '<section class="p7 p7-fachada2" style="margin:24px 0;padding:15px 17px;border:1px solid #1e293b;border-radius:14px">'
        f'<h2 style="margin:0 0 11px;font-size:1.13rem">{t("titulo", lang)}</h2>'
        '<dl class="p7num" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(300px,1fr));gap:0 22px;margin:0;font-size:.9rem">'
        f"{dls}</dl>"
        f'<p style="margin:9px 0 0;color:#94a3b8;font-size:.78rem">{t("rodape", lang)}</p>'
        "</section>\n<!-- /city-fachada2 -->\n"
    )
