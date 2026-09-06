#!/usr/bin/env python3
"""ETAPA 8.14b — Injetor do bloco <!-- city-instituicoes --> (instituições verificadas no Wikidata).

Dados: out/etapa8_instituicoes.jsonl (harvest 8.14: P131 = cidade; classes P31 =
hospital/universidade/museu/biblioteca/teatro/estádio). Nada é inventado: nomes e classes
vêm do Wikidata; onde a fonte não tem o dado, o item não aparece.

Idempotente: página com <!-- city-instituicoes --> já presente é pulada.
Uso: python3 scripts/etapa814_inject_instituicoes.py [--apply] [--limit N]
"""
import json
import re
import sys
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
PUB = ROOT / "public"
DATA_F = ROOT / "out" / "etapa8_instituicoes.jsonl"

CLASS_PT = {"hospital": "hospital", "universidade": "universidade", "museu": "museu",
            "biblioteca": "biblioteca", "teatro": "teatro", "estádio": "estádio"}
ORDEM = ["hospital", "universidade", "museu", "biblioteca", "teatro", "estádio"]
MAX_ITENS = 30

BLOCK_RE = re.compile(r"\n?<!-- city-instituicoes -->.*?<!-- /city-instituicoes -->\n?", re.S)
H1_RE = re.compile(r"<h1>(.*?)</h1>", re.S)
LD_NAME_RE = re.compile(r'"@type":\s*"City"[^}]*?"name":\s*"([^"]+)"', re.S)


def esc(s):
    return (s or "").replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")


def city_name(page_html):
    m = LD_NAME_RE.search(page_html)
    if m:
        return m.group(1).strip()
    m = H1_RE.search(page_html)
    t = re.sub(r"^[^\wÀ-ÿ]+\s*", "", m.group(1)) if m else "esta cidade"
    return t.split("—")[0].strip()


def build(rec, nome):
    ent = [e for e in rec.get("entidades", []) if e.get("nome") and not e["nome"].startswith("Q")]
    if not ent:
        return None
    ent.sort(key=lambda e: (ORDEM.index(e["tipo"]) if e["tipo"] in ORDEM else 9, e["nome"].lower()))
    total = len(ent)
    mostrados = ent[:MAX_ITENS]
    por_tipo = Counter(e["tipo"] for e in ent)
    totais = ", ".join(f"{n} {CLASS_PT.get(t, t)}" for t, n in
                       sorted(por_tipo.items(), key=lambda kv: (ORDEM.index(kv[0]) if kv[0] in ORDEM else 9)))
    lis = "".join(
        f'<li style="margin:4px 0"><strong>{esc(e["nome"])}</strong> '
        f'<span style="color:#94a3b8;font-size:.78rem">({CLASS_PT.get(e["tipo"], e["tipo"])})</span></li>'
        for e in mostrados)
    extra = f'<li style="margin:4px 0;color:#94a3b8;font-size:.85rem">…e mais {total - MAX_ITENS} instituições listadas no Wikidata.</li>' \
        if total > MAX_ITENS else ""
    body = (
        f'<section class="p7 p7-instituicoes" style="margin:24px 0;padding:15px 17px;'
        f'border:1px solid #1e293b;border-radius:14px">'
        f'<h2 style="margin:0 0 9px;font-size:1.13rem">🏛️ Instituições verificadas — {esc(nome)}</h2>'
        f'<p style="margin:0 0 8px;font-size:.88rem;color:#cbd5e1">{total} instituições com nome '
        f'verificado no Wikidata: {totais}.</p>'
        f'<ul style="margin:0;padding-left:20px;font-size:.88rem">{lis}{extra}</ul>'
        f'<p style="margin:9px 0 0;color:#94a3b8;font-size:.78rem">Fontes: Wikidata — itens com '
        f'P131 = esta cidade e classe P31 de hospital, universidade, museu, biblioteca, teatro '
        f'ou estádio. Onde a fonte não tem o dado, o item não aparece.</p></section>')
    return body


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
        if "<!-- city-instituicoes -->" in h:
            counts["skip-jatem"] += 1
            continue
        rec = data.get(key)
        if not rec:
            counts["skip-semdado"] += 1
            continue
        body = build(rec, city_name(h))
        if not body:
            counts["skip-sem-ent"] += 1
            continue
        novo_block = "\n<!-- city-instituicoes -->\n" + body + "\n<!-- /city-instituicoes -->\n"
        for anchor in ("<!-- /city-agora -->", "<!-- /city-emergencia -->", "<!-- /city-viagens -->",
                       "<!-- /city-nomes -->"):
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
    print(("APPLY" if apply else "DRY-RUN"), "instituicoes:", len(files), "paginas ->", dict(counts), flush=True)


if __name__ == "__main__":
    main()
