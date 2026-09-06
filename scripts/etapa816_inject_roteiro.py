#!/usr/bin/env python3
"""ETAPA 8.16 — Bloco `city-roteiro`: sugestão de roteiro (1/2/3 dias) derivada das
atrações REAIS verificadas no Wikidata (data/etapa6_atracoes.json, com coordenadas) +
centro da cidade (ld-city). Determinístico: ordena por proximidade ao centro e agrupa
em dias; cada item mostra distância em linha reta. Nada de "melhor", preços ou horários.
Idempotente; só para cidades com >= 3 atrações com coordenadas.
"""
import json, math, re, sys, unicodedata, html
from pathlib import Path
from collections import Counter

ROOT = Path(__file__).resolve().parent.parent
PUB = ROOT / "public"
APPLY = "--apply" in sys.argv

def norm(s):
    s = unicodedata.normalize("NFKD", s or "")
    s = "".join(c for c in s if not unicodedata.combining(c))
    return re.sub(r"[^a-z0-9]+", " ", s.lower()).strip()

def hav(a, b):
    R = 6371.0
    la1, lo1, la2, lo2 = map(math.radians, [a[0], a[1], b[0], b[1]])
    d = la2 - la1; dl = lo2 - lo1
    x = math.sin(d / 2) ** 2 + math.cos(la1) * math.cos(la2) * math.sin(dl / 2) ** 2
    return 2 * R * math.asin(math.sqrt(x))

def get_ld(h):
    for m in re.finditer(r'<script type="application/ld\+json">(.*?)</script>', h, re.S):
        try:
            d = json.loads(m.group(1))
        except Exception:
            continue
        if isinstance(d, dict) and d.get("@type") == "City":
            return d
    return None

def main():
    ATRA = json.load(open(ROOT / "data" / "etapa6_atracoes.json", encoding="utf-8"))["por_cidade"]
    # índice por (cc, slug-normalizado)
    idx = {}
    for key, lst in ATRA.items():
        parts = key.split("|")
        if len(parts) >= 2:
            idx[(parts[0], norm(parts[1]))] = lst
    counts = Counter(); files = sorted(PUB.glob("*/*.html"))
    for p in files:
        rel = p.relative_to(ROOT).as_posix()
        h = p.read_text(encoding="utf-8", errors="ignore")
        if "<!-- city-fachada -->" not in h:
            counts["skip-semfachada"] += 1; continue
        if re.search(r'<meta[^>]*name=["\']robots["\'][^>]*content=["\'][^"]*noindex', h, re.I):
            counts["skip-noindex"] += 1; continue
        key = rel[len("public/"):-len(".html")]
        cc, slug = key.split("/", 1)
        ld = get_ld(h)
        if not ld:
            counts["skip-semld"] += 1; continue
        geo = ld.get("geo") or {}
        if "latitude" not in geo:
            counts["skip-semcoords"] += 1; continue
        center = (float(geo["latitude"]), float(geo["longitude"]))
        ats = idx.get((cc, norm(slug)), [])
        items = []
        for a in ats:
            c = a.get("c", "")
            m = re.match(r"Point\(([-\d.]+)\s+([-\d.]+)\)", c)
            if not m:
                continue
            coords = (float(m.group(2)), float(m.group(1)))
            items.append({"nome": a.get("disp") or a.get("alt") or a["q"],
                          "tipo": re.sub(r"[^a-z ]", "", (a.get("t") or "").lower()).strip(),
                          "km": hav(center, coords)})
        if len(items) < 3:
            counts["skip-poucas"] += 1; continue
        items.sort(key=lambda x: x["km"])
        # dias: 0-3: dia1, 4-7: dia2, resto dia3 (máx 3 dias; sobra entra no último)
        dias = [items[0:4], items[4:8], items[8:13]]
        nomes_dia = ["Roteiro de 1 dia", "Roteiro de 2 dias", "Roteiro de 3 dias"]
        ndias = 1 if len(items) <= 4 else (2 if len(items) <= 8 else 3)
        parts_h = []
        for i in range(ndias):
            bloco = "".join(
                f'<li style="margin:3px 0">{html.escape(x["nome"])} '
                f'<span style="color:#94a3b8;font-size:.78rem">({x["tipo"] or "ponto de interesse"} · ≈ {round(x["km"])} km do centro)</span></li>'
                for x in dias[i])
            parts_h.append(f'<h3 style="margin:10px 0 4px;font-size:.92rem;color:#334155">Dia {i+1}</h3>'
                           f'<ol style="margin:0 0 4px;padding-left:20px;font-size:.88rem">{bloco}</ol>')
        body = ('<section class="p7 p7-roteiro" style="margin:24px 0;padding:15px 17px;border:1px solid #1e293b;border-radius:14px">'
                f'<h2 style="margin:0 0 7px;font-size:1.13rem">🗺️ {nomes_dia[ndias-1]} com as atrações reais (Wikidata)</h2>'
                + "".join(parts_h) +
                '<p style="margin:8px 0 0;font-size:.75rem;color:#94a3b8">Sugestão determinística: atrações verificadas no Wikidata ordenadas '
                'pela distância em linha reta ao centro da cidade e agrupadas por dia. Não é avaliação de qualidade; '
                'confirme horários, ingressos e funcionamento nos locais.</p></section>')
        novo_block = "\n<!-- city-roteiro -->\n" + body + "\n<!-- /city-roteiro -->\n"
        if "<!-- city-roteiro -->" in h:
            novo = re.sub(r"\n?<!-- city-roteiro -->.*?<!-- /city-roteiro -->\n?", novo_block, h, count=1, flags=re.S)
            acao = "inalterado" if novo == h else "atualizado"
            counts[acao] += 1
            if APPLY and acao == "atualizado":
                p.write_text(novo, encoding="utf-8")
            continue
        for anchor in ("<!-- /city-faq -->", "<!-- /faq-attractions -->", "<!-- /city-mobilidade -->"):
            if anchor in h:
                j = h.find(anchor) + len(anchor)
                prefix = h[:j].rstrip("\n"); rest = h[j:].lstrip("\n")
                novo = prefix + "\n\n" + novo_block + "\n" + rest
                counts["injetado"] += 1
                if APPLY:
                    p.write_text(novo, encoding="utf-8")
                break
        else:
            counts["skip-sem-ancora"] += 1
    print(("APPLY" if APPLY else "DRY-RUN"), "roteiro: total", len(files), dict(counts), flush=True)

if __name__ == "__main__":
    main()
