#!/usr/bin/env python3
"""ETAPA 8.19 — Harvest de diretório educacional/empresarial por cidade (Wikidata, P131 direto).

  · Educacional: P31/subclasse de Q2385804 (instituição de ensino) → escolas, universidades etc.
  · Empresarial : P31/subclasse de Q4830453 (empresa) com sede registrada (P131) na cidade.
Duas consultas por lote (uma por ramo) para evitar timeout; determinístico; 1 linha/cidade em
out/etapa8_diretorio.jsonl + checkpoint. Principio do projeto: onde a fonte não tem o dado, omite.
Uso: python3 scripts/etapa819_harvest_diretorio.py --delay N
"""
import json
import re
import sys
import time
import urllib.request
import urllib.parse
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
PUB = ROOT / "public"
OUT = ROOT / "out" / "etapa8_diretorio.jsonl"
CKPT = Path("/home/user/cloudfire/work") / "data" / "etapa819_checkpoint.jsonl"
LOG = Path("/home/user/cloudfire/work") / "logs" / "etapa819_sparql.log"
UA = {"User-Agent": "etapa819/1.0 (project contact)", "Accept": "application/sparql-results+json"}
DELAY = float(sys.argv[2]) if len(sys.argv) > 2 and sys.argv[1] == "--delay" else 65.0
CHUNK = 90
RAMOS = {"Q2385804": "educacional", "Q4830453": "empresarial"}


def log(m):
    LOG.parent.mkdir(parents=True, exist_ok=True)
    with open(LOG, "a", encoding="utf-8") as f:
        f.write(time.strftime("%H:%M:%S ") + m + "\n")
    print(m, flush=True)


def sparql(query, tries=4):
    url = "https://query.wikidata.org/sparql?" + urllib.parse.urlencode({"query": query, "format": "json"})
    for t in range(tries):
        try:
            time.sleep(DELAY)
            d = json.load(urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=180))
            if "results" in d:
                return d["results"]["bindings"]
        except Exception as e:
            log(f"  retry {t} {e}")
            time.sleep(45 * (t + 1))
    return None


def city_qids():
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
    qid_keys = {}
    for k, q in cidades:
        qid_keys.setdefault(q, []).append(k)
    uniq = [(q, ks) for q, ks in qid_keys.items() if not any(k in done for k in ks)]
    log(f"qids únicos restantes: {len(uniq)}")
    stats = {"cidades": 0}
    for i in range(0, len(uniq), CHUNK):
        chunk = uniq[i:i + CHUNK]
        vals = " ".join("wd:" + q for q, _ in chunk)
        by_city = {}
        for ramo, tipo in RAMOS.items():
            query = f"""SELECT ?city ?item ?itemLabel WHERE {{
              VALUES ?city {{ {vals} }}
              ?item wdt:P131 ?city ; wdt:P31/wdt:P279* wd:{ramo} .
              SERVICE wikibase:label {{ bd:serviceParam wikibase:language "pt,en". }}
            }} LIMIT 4000"""
            rows = sparql(query)
            if rows is None:
                log(f"  WARN: ramo {tipo} do lote {i//CHUNK + 1} falhou após retries")
                continue
            for b in rows:
                q = b["city"]["value"].split("/")[-1]
                item = b["item"]["value"].split("/")[-1]
                name = b.get("itemLabel", {}).get("value", item)
                if not name or name.startswith("Q") or name == item:
                    continue
                by_city.setdefault(q, []).append({"qid": item, "nome": name, "ramo": tipo})
            log(f"  {tipo}: lote {i//CHUNK + 1}/{(len(uniq) + CHUNK - 1)//CHUNK}: {len(rows)} rows")
        for q, ks in chunk:
            rec = {"qid": q, "keys": ks, "itens": by_city.get(q, [])}
            with open(OUT, "a", encoding="utf-8") as f:
                f.write(json.dumps(rec, ensure_ascii=False) + "\n")
            with open(CKPT, "a", encoding="utf-8") as f:
                f.write(json.dumps({"key": ks[0]}, ensure_ascii=False) + "\n")
            stats["cidades"] += 1
            done.update(ks)
    log(f"FIM: {stats['cidades']} cidades")


if __name__ == "__main__":
    main()
