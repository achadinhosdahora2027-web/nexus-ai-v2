#!/usr/bin/env python3
"""ETAPA 8.15 — Bloco `city-faq`: respostas de cauda longa (matriz das 100 intenções de
busca local), geradas SOMENTE a partir de dados que já existem na própria página
(ld-city Wikidata, fachada2, atrações, clima, mobilidade, viagens, emergência).
Zero invenção: pergunta sem dado real na página → linha não aparece.
Idempotente. i18n pt (páginas atuais são pt; TRAD prevê en/es/fr/it).
"""
import json, re, sys, unicodedata, html
from pathlib import Path
from collections import Counter

ROOT = Path(__file__).resolve().parent.parent
PUB = ROOT / "public"
APPLY = "--apply" in sys.argv

def norm(s):
    s = unicodedata.normalize("NFKD", s or "")
    s = "".join(c for c in s if not unicodedata.combining(c))
    return re.sub(r"[^a-z0-9]+", " ", s.lower()).strip()

def num_br(n):
    return f"{int(n):,}".replace(",", ".")

def get_ld(h):
    for m in re.finditer(r'<script type="application/ld\+json">(.*?)</script>', h, re.S):
        try:
            d = json.loads(m.group(1))
        except Exception:
            continue
        if isinstance(d, dict) and d.get("@type") == "City":
            return d
    return None

def bloco(h, nome):
    m = re.search(r'<!-- ?' + nome + r' ?-->(.*?)<!-- ?/' + nome + r' ?-->', h, re.S)
    return m.group(1) if m else ""

def dt_value(b, label):
    """pega o <dd> do par dt com o label dado no bloco fachada2."""
    for dm in re.finditer(r'<dt style="[^"]*">([^<]*)</dt><dd[^>]*>(.*?)</dd>', b, re.S):
        if norm(dm.group(1)) == norm(label):
            return re.sub(r"<[^>]+>", "", dm.group(2)).strip()
    return None

def coletar(h, key):
    ld = get_ld(h)
    f2 = bloco(h, "city-fachada2")
    att = bloco(h, "city-attractions")
    cli = bloco(h, "city-clima")
    via = bloco(h, "city-viagens")
    eme = bloco(h, "city-emergencia")
    mob = bloco(h, "city-mobilidade")
    pergs = []
    if not ld:
        return pergs
    nome = ld.get("name", key.split("/")[-1].replace("-", " ").title())
    # 1) onde fica
    addr = ld.get("address") or {}
    partes = [addr.get("addressLocality"), addr.get("addressRegion"), addr.get("addressCountry")]
    partes = [p for p in partes if p and norm(p) != norm(nome)]
    geo = ld.get("geo") or {}
    if partes:
        resp = f"{nome} fica em {', '.join(partes)}."
        if geo.get("latitude"):
            resp += f" Coordenadas: {geo['latitude']}, {geo['longitude']}."
        pergs.append(("Onde fica %s?" % nome, resp))
    # 2) população
    pop = ld.get("population") or {}
    v = pop.get("value") if isinstance(pop, dict) else pop
    if v:
        ano = pop.get("generated", "")[:4] if isinstance(pop, dict) else ""
        pergs.append(("Qual a população de %s?" % nome,
                      "%s habitantes (%s)." % (num_br(v), ano or "Wikidata")))
    # 3) moeda
    mo = dt_value(f2, "Moeda")
    if mo:
        pergs.append(("Qual é a moeda de %s?" % nome, "Moeda local: %s." % mo))
    # 4) idiomas
    idio = dt_value(f2, "Idiomas")
    if idio:
        pergs.append(("Que idiomas se falam em %s?" % nome, "Idiomas do país: %s." % idio))
    # 5) ddd
    ddd = dt_value(f2, "DDD / código de área")
    if ddd:
        ddd_limpo = re.sub(r"<[^>]+>", "", ddd).strip()
        pergs.append(("Qual o DDD / código de área de %s?" % nome,
                      "Código de área: %s." % ddd_limpo))
    # 6) quantas atrações / o que fazer
    m = re.search(r'(\d+)\s*atrações?\s*verificadas', att)
    if m:
        n = int(m.group(1))
        nomes = [re.sub(r"<[^>]+>", "", a).strip() for a in re.findall(r'<li><a[^>]*>(.*?)</a>', att, re.S)]
        nomes = [x for x in nomes if x][:4]
        txt = "; ".join(nomes)
        pergs.append(("O que fazer em %s?" % nome,
                      "%s atrações verificadas no Wikidata em %s, incluindo %s. Veja a lista completa na seção de atrações." %
                      (num_br(n), nome, txt if txt else "—")))
    # 7) como chegar (aeroportos do bloco mobilidade: dd "Aeroportos mais próximos")
    mdt = re.search(r'<dt[^>]*>Aeroportos mais próximos</dt><dd[^>]*>(.*?)</dd>', mob, re.S)
    if mdt:
        nomes_aero = [re.sub(r"<[^>]+>", "", a).strip() for a in re.findall(r'<a[^>]*>([^<]+)</a>', mdt.group(1))]
        nomes_aero = [a for a in nomes_aero if a and len(a) > 2][:3]
        if nomes_aero:
            pergs.append(("Como chegar a %s? (de avião)" % nome,
                          "Aeroportos mais próximos: %s. Veja a seção de mobilidade para detalhes." %
                          "; ".join(nomes_aero)))
    # 8) destinos próximos (viagens)
    dest = re.findall(r'<td><a[^>]*>([^<]+)</a>\s*<span[^>]*>([^<]*)</span>\s*</td><td[^>]*>≈\s*([\d,.]+)\s*km', via)
    if dest:
        pergs.append(("Para onde posso viajar de %s?" % nome,
                      "Destinos próximos: %s." % "; ".join(f"{d[0]} ({d[2]} km)" for d in dest[:4])))
    # 9) emergência
    eme_rows = re.findall(r'<td[^>]*>([^<]*)</td><td[^>]*>(.*?)</td>', eme)
    if eme_rows:
        txt = "; ".join(f"{a.strip()}: {re.sub(r'<[^>]+>', '', b)}" for a, b in eme_rows[:4])
        pergs.append(("Qual o número de emergência em %s?" % nome,
                      "Números nacionais de emergência — %s." % txt))
    # 10) clima (melhor época / meses secos)
    secos = re.search(r'Meses mais secos[^:]*:\s*<b>([^<]+)</b>', cli)
    if secos:
        chuv = re.search(r'Meses mais chuvosos[^:]*:\s*<b>([^<]+)</b>', cli)
        pergs.append(("Qual a melhor época para visitar %s?" % nome,
                      "Meses mais secos (menor chuva): %s. Meses mais chuvosos: %s." %
                      (secos.group(1), chuv.group(1) if chuv else "—")))
    else:
        melh = re.search(r'<(?:b|strong)>\s*Melhor época para ir:\s*([^<]+)', cli)
        if melh:
            pergs.append(("Qual a melhor época para visitar %s?" % nome,
                          "Melhor época para ir: %s." % melh.group(1).strip().rstrip(".")))
    return pergs

def build(pergs):
    if not pergs:
        return None
    det = "".join(
        f'<details style="margin:7px 0;border:1px solid #334155;border-radius:10px;padding:8px 12px">'
        f'<summary style="cursor:pointer;font-size:.92rem"><strong>{html.escape(q)}</strong></summary>'
        f'<p style="margin:7px 0 2px;font-size:.88rem;color:#cbd5e1">{html.escape(r)}</p></details>' for q, r in pergs)
    return ('<section class="p7 p7-faq100" style="margin:24px 0;padding:15px 17px;border:1px solid #1e293b;border-radius:14px">'
            '<h2 style="margin:0 0 9px;font-size:1.13rem">❓ Perguntas rápidas (respostas dos dados desta página)</h2>'
            + det +
            '<p style="margin:8px 0 0;font-size:.75rem;color:#94a3b8">Respostas derivadas dos dados desta página '
            '(Wikidata e Open-Meteo). Confirme horários e condições antes de viajar.</p></section>')

BLOCK_RE = re.compile(r"\n?<!-- city-faq -->.*?<!-- /city-faq -->\n?", re.S)

def plugin(page_html, rel):
    if "<!-- city-fachada -->" not in page_html:
        return page_html, "skip-semfachada", None
    if re.search(r'<meta[^>]*name=["\']robots["\'][^>]*content=["\'][^"]*noindex', page_html, re.I):
        return page_html, "skip-noindex", None
    pergs = coletar(page_html, rel[len("public/"):-len(".html")])
    if len(pergs) < 4:
        return page_html, "skip-poucas", len(pergs)
    body = build(pergs)
    if body is None:
        return page_html, "skip-semperg", None
    novo_block = "\n<!-- city-faq -->\n" + body + "\n<!-- /city-faq -->\n"
    if "<!-- city-faq -->" in page_html:
        novo = BLOCK_RE.sub(novo_block, page_html, count=1)
        return (page_html, "inalterado", None) if novo == page_html else (novo, "atualizado", None)
    anchor = "<!-- /faq-attractions -->"
    if anchor not in page_html:
        anchor = "<!-- /city-emergencia -->"
    if anchor not in page_html:
        anchor = "<!-- /painel-osm -->"
    if anchor not in page_html:
        return page_html, "skip-sem-ancora", None
    j = page_html.find(anchor) + len(anchor)
    prefix = page_html[:j].rstrip("\n"); rest = page_html[j:].lstrip("\n")
    return prefix + "\n\n" + novo_block + "\n" + rest, "injetado", None

def main():
    counts = Counter(); files = sorted(PUB.glob("*/*.html"))
    for p in files:
        rel = p.relative_to(ROOT).as_posix()
        h = p.read_text(encoding="utf-8", errors="ignore")
        novo, acao, det = plugin(h, rel)
        counts[acao] += 1
        if APPLY and acao in ("injetado", "atualizado"):
            p.write_text(novo, encoding="utf-8")
    print(("APPLY" if APPLY else "DRY-RUN"), "faq100: total", len(files), dict(counts), flush=True)

if __name__ == "__main__":
    main()
