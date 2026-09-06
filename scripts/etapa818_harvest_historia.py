#!/usr/bin/env python3
"""ETAPA 8.18 — Harvest de dados de "história" por cidade (Wikidata, comprovável).

Por cidade (ld-city, mesmo índice da 8.14):
  · P571 (início)            → ano de fundação/primeira menção
  · P1082 (população)        → valor mais recente com data (P585)
  · P1376 (capital de)       → entidades das quais a cidade é capital (labels pt/en)
Não define narrativa: exibe fatos datados da fonte; onde a fonte não tem, omite.

Saídas: out/etapa8_historia.jsonl (1 linha/cidade) + checkpoint em work/data.
Uso: python3 scripts/etapa818_harvest_historia.py --delay N  (N segundos entre consultas)
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
OUT = ROOT / "out" / "etapa8_historia.jsonl"
CKPT = Path("/home/user/cloudfire/work") / "data" / "etapa818_checkpoint.jsonl"
LOG = Path("/home/user/cloudfire/work") / "logs" / "etapa818_sparql.log"
UA = {"User-Agent": "etapa818/1.0 (project contact)", "Accept": "application/sparql-results+json"}
DELAY = float(sys.argv[2]) if len(sys.argv) > 2 and sys.argv[1] == "--delay" else 65.0
CHUNK = 90


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
            d = json.load(urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=120))
            if "results" in d:
                return d["results"]["bindings"]
        except Exception as e:
            log(f"  retry {t} {e}")
            time.sleep(45 * (t + 1))
    return None


def city_qids():
    """QIDs das páginas-cidade (ld-city) — mesma regra da 8.14 (finditer, sem loop)."""
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


def ano(v):
    """Extrai ano (int) de um valor de data xsd (aceita datas negativas/parciais)."""
    try:
        s = v
        m = re.match(r"^(-?)(\d{1,4})-", s)
        if not m:
            return None
        y = int(m.group(2))
        return -y if m.group(1) else y
    except Exception:
        return None


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
        query = f"""SELECT ?city ?inception ?pop ?popdate ?capOf ?capOfLabel WHERE {{
          VALUES ?city {{ {vals} }}
          OPTIONAL {{ ?city wdt:P571 ?inception }}
          OPTIONAL {{ ?city p:P1082 ?ps . ?ps ps:P1082 ?pop ; pq:P585 ?popdate }}
          OPTIONAL {{ ?city wdt:P1376 ?capOf .
                     SERVICE wikibase:label {{ bd:serviceParam wikibase:language "pt,en". ?capOf rdfs:label ?capOfLabel }} }}
        }}"""
        rows = sparql(query)
        if rows is None:
            log(f"  WARN: lote {i//CHUNK + 1} falhou após retries")
            continue
        by_city = {}
        for b in rows:
            q = b["city"]["value"].split("/")[-1]
            rec = by_city.setdefault(q, {})
            if "inception" in b:
                a = ano(b["inception"]["value"])
                if a is not None:
                    rec.setdefault("inicio", a)
            if "pop" in b and "popdate" in b:
                try:
                    v = int(float(b["pop"]["value"]))
                    d = b["popdate"]["value"][:4]
                except Exception:
                    continue
                c = rec.get("populacao")
                if not c or d >= c["data"]:
                    rec["populacao"] = {"valor": v, "data": d}
            if "capOfLabel" in b:
                lbl = b["capOfLabel"]["value"]
                if lbl and not lbl.startswith("Q"):
                    rec.setdefault("capital_de", [])
                    if lbl not in rec["capital_de"] and len(rec["capital_de"]) < 5:
                        rec["capital_de"].append(lbl)
        for q, ks in chunk:
            rec = {"qid": q, "keys": ks}
            rec.update(by_city.get(q, {}))
            with open(OUT, "a", encoding="utf-8") as f:
                f.write(json.dumps(rec, ensure_ascii=False) + "\n")
            with open(CKPT, "a", encoding="utf-8") as f:
                f.write(json.dumps({"key": ks[0]}, ensure_ascii=False) + "\n")
            stats["cidades"] += 1
            done.update(ks)
        log(f"  lote {i//CHUNK + 1}/{(len(uniq) + CHUNK - 1)//CHUNK}: {len(rows)} rows")
    log(f"FIM: {stats['cidades']} cidades")


if __name__ == "__main__":
    main()
