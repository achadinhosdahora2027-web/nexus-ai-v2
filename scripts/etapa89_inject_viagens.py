#!/usr/bin/env python3
# ETAPA 8.9 — bloco `city-viagens`: destinos próximos dentro do próprio índice,
# distância em linha reta (haversine) sobre coordenadas REAIS do Wikidata (já nas páginas).
# Determinístico e diferenciado por cidade. Nada inventado. Idempotente.
import json, math, os, re, sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
PUB  = ROOT / "public"
APPLY = "--apply" in sys.argv

TRAD = {
 "titulo": {"pt":"✈️ Viagens e distâncias a partir daqui","en":"✈️ Trips & distances from here","es":"✈️ Viajes y distancias desde aquí","fr":"✈️ Voyages et distances d'ici","it":"✈️ Viaggi e distanze da qui","de":"✈️ Reisen und Entfernungen ab hier"},
 "mesmo_pais": {"pt":"Destinos no mesmo país","en":"Destinations in the same country","es":"Destinos en el mismo país","fr":"Destinations dans le même pays","it":"Destinazioni nello stesso paese","de":"Ziele im selben Land"},
 "outros": {"pt":"Destinos internacionais mais próximos","en":"Closest international destinations","es":"Destinos internacionales más cercanos","fr":"Destinations internationales les plus proches","it":"Destinazioni internazionali più vicine","de":"Nächste internationale Ziele"},
 "fonte": {"pt":"Distância em linha reta (coordenadas do Wikidata). Não é rota por estrada.","en":"Straight-line distance (Wikidata coordinates). Not a driving route.","es":"Distancia en línea recta (coordenadas de Wikidata). No es ruta por carretera.","fr":"Distance en ligne droite (coordonnées Wikidata). Pas une route routière.","it":"Distanza in linea reta (coordinate Wikidata). Non è una strada.","de":"Luftliniendistanz (Wikidata-Koordinaten). Keine Straßenroute."},
}
def t(k,lang):
    lang=(lang or "pt").split("-")[0]
    return TRAD[k].get(lang, TRAD[k]["pt"])

def hav(a,b):
    R=6371.0
    la1,lo1,la2,lo2=map(math.radians,[a[0],a[1],b[0],b[1]])
    d=la2-la1; dl=lo2-lo1
    x=math.sin(d/2)**2+math.cos(la1)*math.cos(la2)*math.sin(dl/2)**2
    return 2*R*math.asin(math.sqrt(x))

def city_pages():
    out=[]
    for d in sorted(PUB.iterdir()):
        if d.is_dir(): out.extend(sorted(d.glob("*.html")))
    return out

def is_noindex(h):
    return bool(re.search(r'<meta[^>]*name=["\']robots["\'][^>]*content=["\'][^"]*noindex', h, re.I))

def build_registry():
    reg={}
    for p in city_pages():
        h=p.read_text(encoding="utf-8",errors="ignore")
        if '"@type":"City"' not in h and "ld-city" not in h: continue
        rel=p.relative_to(ROOT).as_posix()
        for blk in re.finditer(r'<script type="application/ld\+json">(.*?)</script>', h, re.S):
            try: d=json.loads(blk.group(1))
            except: continue
            if isinstance(d,dict) and d.get("@type")=="City":
                g=d.get("geo") or {}
                if "latitude" not in g: break
                key=rel[len("public/"):-len(".html")]
                reg[key]={"name":d.get("name"),"lat":g["latitude"],"lon":g["longitude"],
                          "cc":key.split("/")[0],"country":(d.get("country") or {}).get("name")}
                break
    return reg

def neighbors(reg):
    out={}
    for key,v in reg.items():
        same=[]; other=[]
        for k2,v2 in reg.items():
            if k2==key: continue
            dst=hav((v["lat"],v["lon"]),(v2["lat"],v2["lon"]))
            rec=(dst,k2,v2["name"],v2["cc"],v2["country"])
            (same if v2["cc"]==v["cc"] else other).append(rec)
        same.sort(); other.sort()
        out[key]=(same,other)
    return out

def tr_rows(recs,n):
    rows=""
    for dst,k2,name,cc,country in recs[:n]:
        label=name or k2.split("/")[-1].replace("-"," ").title()
        km=str(round(dst))
        rows+=(f'<tr><td><a style="color:#0369a1;text-decoration:none" href="/{k2}">{label}</a>')
        if country: rows+=f' <span style="color:#94a3b8;font-size:.78rem">{country}</span>'
        rows+=f'</td><td style="text-align:right;white-space:nowrap;color:#475569">≈ {km} km</td></tr>'
    return rows

def build(page_html,key,reg,same,other):
    lang="pt"
    m=re.search(r'<div class="p7-osm"[^>]*data-lang="([^"]*)"', page_html)
    if m: lang=(m.group(1) or "pt").split("-")[0]
    body=(f'<section class="p7 p7-viagens" style="margin:24px 0"><h2 style="margin:0 0 6px;font-size:1.13rem">{t("titulo",lang)}</h2>')
    made=False
    if same:
        body+=(f'<h3 style="margin:12px 0 5px;font-size:.92rem;color:#334155">{t("mesmo_pais",lang)}</h3>'
               f'<table style="width:100%;border-collapse:collapse;font-size:.9rem">')
        body+=tr_rows(same,4)+"</table>"; made=True
    if other:
        body+=(f'<h3 style="margin:12px 0 5px;font-size:.92rem;color:#334155">{t("outros",lang)}</h3>'
               f'<table style="width:100%;border-collapse:collapse;font-size:.9rem">')
        body+=tr_rows(other,3)+"</table>"; made=True
    if not made: return None,lang
    body+=f'<p style="margin:7px 0 0;font-size:.75rem;color:#94a3b8">{t("fonte",lang)}</p></section>'
    return body,lang

BLOCK_RE=re.compile(r"\n?<!-- city-viagens -->.*?<!-- /city-viagens -->\n?", re.S)

def plugin(page_html, rel):
    if "<!-- city-fachada -->" not in page_html or "<!-- /city-mobilidade -->" not in page_html:
        return page_html,"skip",None
    if is_noindex(page_html): return page_html,"skip-noindex",None
    key=rel[len("public/"):-len(".html")]
    if key not in REG or key not in NB: return page_html,"skip-semself",None
    same,other=NB[key]
    body,lang=build(page_html,key,REG[key],same,other)
    if body is None: return page_html,"skip-semvizinhos",lang
    novo_block="\n<!-- city-viagens -->\n"+body+"\n<!-- /city-viagens -->\n"
    if "<!-- city-viagens -->" in page_html:
        novo=BLOCK_RE.sub(novo_block,page_html,count=1)
        return (page_html,"inalterado",lang) if novo==page_html else (novo,"atualizado",lang)
    anchor="<!-- /city-mobilidade -->"
    j=page_html.find(anchor)+len(anchor)
    prefix=page_html[:j].rstrip("\n"); rest=page_html[j:].lstrip("\n")
    return prefix+"\n\n"+novo_block+"\n"+rest,"injetado",lang

REG=build_registry(); NB=neighbors(REG)

def main():
    from collections import Counter
    counts=Counter(); files=city_pages()
    for p in files:
        rel=p.relative_to(ROOT).as_posix()
        h=p.read_text(encoding="utf-8",errors="ignore")
        novo,acao,lang=plugin(h,rel)
        counts[acao]+=1
        if APPLY and acao in ("injetado","atualizado"):
            p.write_text(novo,encoding="utf-8")
    print(("APPLY" if APPLY else "DRY-RUN"),"viagens: total",len(files),dict(counts))
if __name__=="__main__":
    main()
