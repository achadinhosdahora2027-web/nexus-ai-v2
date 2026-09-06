#!/usr/bin/env python3
"""ETAPA 8.18b — Injetor do bloco <!-- city-historia --> (fatos datados do Wikidata).

Dados: out/etapa8_historia.jsonl (harvest 8.18: P571 início · P1082 população+data · P1376 capital de).
Nada inventado: exibe apenas fatos da fonte, com a data; onde a fonte não tem o dado, a linha não aparece.
Idempotente. Uso: python3 scripts/etapa818_inject_historia.py [--apply] [--limit N]
"""
import json
import re
import sys
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
PUB = ROOT / "public"
DATA_F = ROOT / "out" / "etapa8_historia.jsonl"

BLOCK_RE = re.compile(r"\n?<!-- city-historia -->.*?<!-- /city-historia -->\n?", re.S)
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


def fmt_pop(n):
    try:
        return f"{int(n):,}".replace(",", ".")
    except Exception:
        return str(n)


def norm(s):
    import unicodedata
    s = unicodedata.normalize("NFKD", s or "")
    s = "".join(c for c in s if not unicodedata.combining(c))
    return re.sub(r"[^a-z0-9]+", " ", s.lower()).strip()


def build(rec, nome):
    inicio = rec.get("inicio")
    pop = rec.get("populacao") or {}
    caps = [c for c in (rec.get("capital_de") or []) if norm(c) and norm(c) != norm(nome)]
    if not any([inicio, pop, caps]):
        return None
    linhas = []
    if inicio:
        txt = f"{abs(inicio)} a.C." if inicio < 0 else f"{inicio}"
        linhas.append(f'<div style="display:flex;gap:10px;justify-content:space-between;align-items:baseline;'
                      f'border-bottom:1px dotted #334155;padding:3px 0"><dt style="color:#94a3b8;margin:0">'
                      f'Fundação / início</dt><dd style="margin:0;text-align:right"><strong>{txt}</strong></dd></div>')
    if pop.get("valor"):
        linhas.append(f'<div style="display:flex;gap:10px;justify-content:space-between;align-items:baseline;'
                      f'border-bottom:1px dotted #334155;padding:3px 0"><dt style="color:#94a3b8;margin:0">'
                      f'População</dt><dd style="margin:0;text-align:right"><strong>{fmt_pop(pop["valor"])}</strong> '
                      f'<span style="color:#94a3b8;font-size:.8rem">({esc(pop.get("data", ""))})</span></dd></div>')
    if caps:
        linhas.append(f'<div style="display:flex;gap:10px;justify-content:space-between;align-items:baseline;'
                      f'border-bottom:1px dotted #334155;padding:3px 0"><dt style="color:#94a3b8;margin:0">'
                      f'Capital de</dt><dd style="margin:0;text-align:right"><strong>'
                      f'{esc(" · ".join(caps))}</strong></dd></div>')
    body = (
        f'<section class="p7 p7-historia" style="margin:24px 0;padding:15px 17px;'
        f'border:1px solid #1e293b;border-radius:14px">'
        f'<h2 style="margin:0 0 11px;font-size:1.13rem">📜 História e números verificados — {esc(nome)}</h2>'
        f'<dl style="display:grid;grid-template-columns:repeat(auto-fit,minmax(300px,1fr));gap:0 22px;'
        f'margin:0;font-size:.9rem">' + "".join(linhas) + '</dl>'
        f'<p style="margin:9px 0 0;color:#94a3b8;font-size:.78rem">Fontes: Wikidata — P571 (início), '
        f'P1082 (população com data de referência), P1376 (capital de). Onde a fonte não tem o dado, '
        f'a linha não aparece.</p></section>')
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
        if "<!-- city-historia -->" in h:
            counts["skip-jatem"] += 1
            continue
        rec = data.get(key)
        if not rec:
            counts["skip-semdado"] += 1
            continue
        body = build(rec, city_name(h))
        if not body:
            counts["skip-sem-dado"] += 1
            continue
        novo_block = "\n<!-- city-historia -->\n" + body + "\n<!-- /city-historia -->\n"
        for anchor in ("<!-- /city-fachada2 -->", "<!-- /city-fachada -->", "<!-- /city-clima -->",
                       "<!-- /city-agora -->", "<!-- /city-roteiro -->"):
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
    print(("APPLY" if apply else "DRY-RUN"), "historia:", len(files), "paginas ->", dict(counts), flush=True)


if __name__ == "__main__":
    main()
