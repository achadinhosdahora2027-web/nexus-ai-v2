#!/usr/bin/env python3
"""ETAPA 8.19b — Injetor do bloco <!-- city-diretorio --> (diretório educacional/empresarial).

Dados: out/etapa8_diretorio.jsonl (harvest 8.19: P131 na cidade; classes transitivas
Q2385804 instituição de ensino / Q4830453 empresa). Nada inventado; onde não há dado, omite.
Idempotente. Uso: python3 scripts/etapa819_inject_diretorio.py [--apply] [--limit N]
"""
import json
import re
import sys
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
PUB = ROOT / "public"
DATA_F = ROOT / "out" / "etapa8_diretorio.jsonl"
RAMO_PT = {"educacional": "instituições de ensino", "empresarial": "empresas com sede registrada"}
MAX_ITENS = 15


def esc(s):
    return (s or "").replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")


def city_name(page_html):
    m = re.search(r'"@type":\s*"City"[^}]*?"name":\s*"([^"]+)"', page_html)
    if m:
        return m.group(1).strip()
    m = re.search(r"<h1>(.*?)</h1>", page_html, re.S)
    return (re.sub(r"^[^\wÀ-ÿ]+\s*", "", m.group(1)).split("—")[0].strip()) if m else "esta cidade"


def build(rec, nome):
    itens = [i for i in rec.get("itens", []) if i.get("nome") and not i["nome"].startswith("Q")]
    if not itens:
        return None
    grupos = []
    for ramo in ("educacional", "empresarial"):
        lst = sorted([i for i in itens if i.get("ramo") == ramo], key=lambda x: x["nome"].lower())
        if not lst:
            continue
        most = lst[:MAX_ITENS]
        lis = "".join(f'<li style="margin:4px 0"><strong>{esc(x["nome"])}</strong></li>' for x in most)
        extra = (f'<li style="margin:4px 0;color:#94a3b8;font-size:.85rem">…e mais '
                 f'{len(lst) - MAX_ITENS} {RAMO_PT[ramo]} listadas no Wikidata.</li>') if len(lst) > MAX_ITENS else ""
        grupos.append(
            f'<div style="margin:10px 0 0"><h3 style="margin:0 0 4px;font-size:.92rem;color:#60a5fa">'
            f'{ESC_CAPA.get(ramo, ramo)} ({len(lst)})</h3>'
            f'<ul style="margin:0;padding-left:20px;font-size:.88rem">{lis}{extra}</ul></div>')
    if not grupos:
        return None
    body = (
        f'<section class="p7 p7-diretorio" style="margin:24px 0;padding:15px 17px;'
        f'border:1px solid #1e293b;border-radius:14px">'
        f'<h2 style="margin:0 0 7px;font-size:1.13rem">🏢 Diretório local — {esc(nome)}</h2>'
        f'<p style="margin:0 0 4px;font-size:.88rem;color:#cbd5e1">Instituições e empresas com sede '
        f'registrada na cidade (dados públicos do Wikidata).</p>'
        + "".join(grupos) +
        f'<p style="margin:9px 0 0;color:#94a3b8;font-size:.78rem">Fontes: Wikidata — itens com '
        f'P131 = esta cidade e classe (transitiva) de instituição de ensino (Q2385804) ou empresa '
        f'(Q4830453). Onde a fonte não tem o dado, o item não aparece.</p></section>')
    return body


ESC_CAPA = {"educacional": "Educação", "empresarial": "Empresas"}


def main():
    apply = "--apply" in sys.argv
    limit = None
    if "--limit" in sys.argv:
        limit = int(sys.argv[sys.argv.index("--limit") + 1])
    data = {}
    if DATA_F.exists():
        for line in DATA_F.read_text(encoding="utf-8").splitlines():
            try:
                r = json.loads(line)
            except Exception:
                continue
            for k in r.get("keys", []):
                data[k] = r
    print("cidades com dados:", len(data), flush=True)
    counts = Counter()
    files = sorted(PUB.glob("*/*.html"))
    if limit:
        files = files[:limit]
    for p in files:
        rel = p.relative_to(ROOT).as_posix()
        key = rel[len("public/"):-len(".html")]
        h = p.read_text(encoding="utf-8", errors="ignore")
        if "<!DOCTYPE" not in h:
            counts["skip-notpage"] += 1
            continue
        if "<!-- city-diretorio -->" in h:
            counts["skip-jatem"] += 1
            continue
        rec = data.get(key)
        if not rec:
            counts["skip-semdado"] += 1
            continue
        body = build(rec, city_name(h))
        if not body:
            counts["skip-sem-item"] += 1
            continue
        novo_block = "\n<!-- city-diretorio -->\n" + body + "\n<!-- /city-diretorio -->\n"
        for anchor in ("<!-- /city-fachada2 -->", "<!-- /city-fachada -->", "<!-- /city-instituicoes -->",
                       "<!-- /city-agora -->", "<!-- /city-historia -->"):
            if anchor in h:
                j = h.find(anchor) + len(anchor)
                prefix = h[:j].rstrip("\n")
                rest = h[j:].lstrip("\n")
                novo = prefix + "\n\n" + novo_block + "\n" + rest
                counts["injetado"] += 1
                if apply:
                    p.write_text(novo, encoding="utf-8")
                break
        else:
            counts["skip-sem-ancora"] += 1
    print(("APPLY" if apply else "DRY-RUN"), "diretorio:", len(files), "paginas ->", dict(counts), flush=True)


if __name__ == "__main__":
    main()
