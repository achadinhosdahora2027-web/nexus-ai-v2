#!/usr/bin/env python3
# ETAPA 8.11b — Injetor de tabela mensal de clima (bloco <!-- city-clima -->) para cidades
# com dados colhidos (out/etapa8_clima_mensal.jsonl, harvest retomável 8.2) e SEM tabela ainda.
# Formato idêntico às tabelas baked da Etapa 7 (máx/mín/chuva/dias/sol), valores em horas
# (sol_h) — não repete o bug de segundos. Fatos derivados (meses mais secos/chuvosos) vêm
# da própria tabela. Sem "melhor época" (subjetivo → só nas páginas legadas). Idempotente.
import json, re, sys
from pathlib import Path
from collections import Counter

ROOT = Path(__file__).resolve().parent.parent
PUB = ROOT / "public"
DATA = {}
for line in (ROOT / "out" / "etapa8_clima_mensal.jsonl").read_text(encoding="utf-8").splitlines():
    try:
        r = json.loads(line)
        DATA[r["key"]] = r
    except Exception:
        pass
APPLY = "--apply" in sys.argv

MESES = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"]
TD = '<td style="text-align:right;padding:2px 5px">%s</td>'
TH = '<th scope="row" style="text-align:left;color:#94a3b8;font-weight:600;padding-right:10px;white-space:nowrap">%s</th>'

def fnum(v, dec=1):
    return ("%." + str(dec) + "f") % float(v) if isinstance(v, (int, float)) else str(v)

def fpt(v, dec=1, suf=""):
    s = fnum(v, dec).replace(".", ",")
    return s + suf

def is_noindex(h):
    return bool(re.search(r'<meta[^>]*name=["\']robots["\'][^>]*content=["\'][^"]*noindex', h, re.I))

def build(rec, lang="pt"):
    m = rec["mensal"]
    def row(label, vals, dec=1, suf=""):
        return "<tr>" + TH % label + "".join(TD % fpt(v, dec, suf) for v in vals) + "</tr>"
    tmax = [m[str(i)]["tmax"] for i in range(1, 13)]
    tmin = [m[str(i)]["tmin"] for i in range(1, 13)]
    chuva = [m[str(i)].get("chuva") or 0 for i in range(1, 13)]
    dias = [m[str(i)].get("dias_chuva") or 0 for i in range(1, 13)]
    sol = [m[str(i)].get("sol_h") for i in range(1, 13)]
    if any(s is None for s in sol):
        return None
    rows = ("<thead><tr><th></th>" + "".join('<th scope="col">%s</th>' % x for x in MESES) + "</tr></thead><tbody>"
            + row("máx.", tmax) + row("mín.", tmin)
            + row("chuva (mm)", chuva, 0) + row("dias com chuva", dias, 0)
            + row("sol (h/dia)", sol))
    # fatos derivados da tabela (determinísticos)
    order = sorted(range(12), key=lambda i: chuva[i])
    secos = ", ".join(MESES[i] for i in order[:3])
    chuv = ", ".join(MESES[i] for i in order[-3:][::-1])
    body = ('<section class="p7 p7-clima" style="margin:24px 0;padding:15px 17px;border:1px solid #1e293b;border-radius:14px">'
            '<h2 style="margin:0 0 11px;font-size:1.13rem">📅 Clima mês a mês (média real 2023–2025)</h2>'
            '<div style="overflow-x:auto"><table class="p7clima" style="font-size:.84rem;border-collapse:collapse;width:100%">'
            + rows + "</tbody></table></div>"
            '<p style="margin:8px 0 0">Meses mais secos (menor chuva): <b>' + secos + "</b>. Meses mais chuvosos: <b>" + chuv + ".</b></p>"
            '<p style="margin:8px 0 0;font-size:.78rem;color:#94a3b8">Médias calculadas por este projeto de 3 anos de reanálise diária '
            '(Open-Meteo ERA5/best-match, grade ≈ 1–25 km). Tempo agora: bloco “Tempo agora” acima.</p></section>')
    return body

BLOCK_RE = re.compile(r"\n?<!-- city-clima -->.*?<!-- /city-clima -->\n?", re.S)

def plugin(page_html, rel):
    if "<!-- city-fachada -->" not in page_html:
        return page_html, "skip-semfachada", None
    if is_noindex(page_html):
        return page_html, "skip-noindex", None
    if "<!-- city-clima -->" in page_html:
        return page_html, "skip-jatem", None
    key = rel[len("public/"):-len(".html")]
    rec = DATA.get(key)
    if not rec:
        return page_html, "skip-semdadom", None
    body = build(rec)
    if body is None:
        return page_html, "skip-semsol", None
    novo_block = "\n<!-- city-clima -->\n" + body + "\n<!-- /city-clima -->\n"
    for anchor in ("<!-- /city-agora -->", "<!-- /city-emergencia -->", "<!-- /city-viagens -->", "<!-- /city-nomes -->"):
        if anchor in page_html:
            j = page_html.find(anchor) + len(anchor)
            prefix = page_html[:j].rstrip("\n"); rest = page_html[j:].lstrip("\n")
            return prefix + "\n\n" + novo_block + "\n" + rest, "injetado", None
    return page_html, "skip-sem-ancora", None

def main():
    counts = Counter(); files = sorted(PUB.glob("*/*.html"))
    for p in files:
        rel = p.relative_to(ROOT).as_posix()
        h = p.read_text(encoding="utf-8", errors="ignore")
        novo, acao, _ = plugin(h, rel)
        counts[acao] += 1
        if APPLY and acao == "injetado":
            p.write_text(novo, encoding="utf-8")
    print(("APPLY" if APPLY else "DRY-RUN"), "clima-mensal: total", len(files), dict(counts), flush=True)

if __name__ == "__main__":
    main()
