#!/usr/bin/env python3
"""ETAPA 8.14 — Harvest de entidades nomeadas da cidade via Wikidata SPARQL (P131).
Classes comprováveis e estáveis: hospital (Q16917), universidade (Q3918), museu (Q33506),
biblioteca (Q7075), teatro (Q41754), estádio (Q483110).
Para cada cidade do índice (ld-city) busca entidades com P131 = cidade, em chunks;
grava out/etapa8_instituicoes.jsonl (1 linha/cidade) + checkpoint. Determinístico.
Respeito: WDQS está em regime de rate-limit (1 req/min durante outage) → delay configurável.
"""
import json, re, sys, time, urllib.request, urllib.parse
from pathlib import Path
from collections import Counter

ROOT = Path(__file__).resolve().parent.parent
PUB = ROOT / "public"
OUT = ROOT / "out" / "etapa8_instituicoes.jsonl"
CKPT = Path("/home/user/cloudfire/work") / "data" / "etapa814_checkpoint.jsonl"
LOG = Path("/home/user/cloudfire/work") / "logs" / "etapa814_sparql.log"
UA = {"User-Agent": "etapa814/1.0 (project contact)", "Accept": "application/sparql-results+json"}
DELAY = float(sys.argv[2]) if len(sys.argv) > 2 and sys.argv[1] == "--delay" else 8.0
CHUNK = 90

CLASSES = {"Q16917": "hospital", "Q3918": "universidade", "Q33506": "museu",
           "Q7075": "biblioteca", "Q41754": "teatro", "Q483110": "estádio"}

def log(m):
    LOG.parent.mkdir(parents=True, exist_ok=True)
    with open(LOG, "a", encoding="utf-8") as f:
        f.write(time.strftime("%H:%M:%S ") + m + "\n")
    print(m, flush=True)

def sparql(query, tries=5):
    url = "https://query.wikidata.org/sparql?" + urllib.parse.urlencode({"query": query, "format": "json"})
    for t in range(tries):
        try:
            time.sleep(DELAY)
            d = json.load(urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=120))
            if "results" in d:
                return d["results"]["bindings"]
        except Exception as e:
            log(f"  retry {t} {e}")
            time.sleep(30 * (t + 1))
    return None

def city_qids():
    """QIDs de cidade (do ld-city), como está no mapa dos dois primeiros níveis; retorna lista de (key, qid)."""
    out = []
    for p in sorted(PUB.glob("*/*.html")):
        h = p.read_text(encoding="utf-8", errors="ignore")
        for m in re.finditer(r'<script type="application/ld\+json">(.*?)</script>', h, re.S):
            try:
                d = json.loads(m.group(1))
            except Exception:
                continue
            if isinstance(d, dict) and d.get("@type") == "City":
                qids = [s.split("/wiki/")[-1] for s in (d.get("sameAs") or []) if "wikidata.org" in s]
                if qids:
                    out.append((p.relative_to(PUB).as_posix()[:-5], qids[0]))
                break
    return out

def main():
    OUT.parent.mkdir(parents=True, exist_ok=True)
    CKPT.parent.mkdir(parents=True, exist_ok=True)
    done = set()
    if CKPT.exists():
        for line in CKPT.read_text(encoding="utf-8").splitlines():
            try:
                done.add(json.loads(line)["key"])
            except Exception:
                pass
    cidades = city_qids()
    log(f"cidades: {len(cidades)} | já feitas: {len(done)}")
    cids = " ".join("wd:" + q for _, q in cidades if q not in [None])
    # agrupar por qid para dedupe de consultas
    qid_keys = {}
    for k, q in cidades:
        qid_keys.setdefault(q, []).append(k)
    uniq = [(q, ks) for q, ks in qid_keys.items() if not any(k in done for k in ks)]
    log(f"qids únicos restantes: {len(uniq)}")
    stats = Counter(); nrows = 0
    for i in range(0, len(uniq), CHUNK):
        chunk = uniq[i:i + CHUNK]
        vals = " ".join("wd:" + q for q, _ in chunk)
        query = f"""SELECT ?city_eval ?item ?itemLabel ?inst ?instLabel WHERE {{
          VALUES ?city_eval {{ {vals} }}
          ?item wdt:P131 ?city_eval ; wdt:P31 ?inst .
          VALUES ?inst {{ wd:Q16917 wd:Q3918 wd:Q33506 wd:Q7075 wd:Q41754 wd:Q483110 }}
          SERVICE wikibase:label {{ bd:serviceParam wikibase:language "pt,en". }}
        }}"""
        rows = sparql(query)
        if rows is None:
            log(f"  WARN: lote {i//CHUNK} falhou após retries")
            continue
        by_city = {}
        for b in rows:
            q = b["city_eval"]["value"].split("/")[-1]
            inst = b["inst"]["value"].split("/")[-1]
            cls = CLASSES.get(inst)
            item = b["item"]["value"].split("/")[-1]
            name = b.get("itemLabel", {}).get("value", item)
            if not cls or not name or name.startswith("Q"):
                continue
            by_city.setdefault(q, []).append({"qid": item, "nome": name, "tipo": cls})
        for q, ks in chunk:
            rec = {"qid": q, "keys": ks, "entidades": by_city.get(q, [])}
            with open(OUT, "a", encoding="utf-8") as f:
                f.write(json.dumps(rec, ensure_ascii=False) + "\n")
            with open(CKPT, "a", encoding="utf-8") as f:
                f.write(json.dumps({"key": ks[0]}, ensure_ascii=False) + "\n")
            stats["cidades"] += 1
            nrows += len(rec["entidades"])
            done.update(ks)
        log(f"  lote {i//CHUNK + 1}/{(len(uniq) + CHUNK - 1)//CHUNK}: {len(rows)} rows")
    log(f"FIM: {stats['cidades']} cidades, {nrows} entidades")

if __name__ == "__main__":
    main()
