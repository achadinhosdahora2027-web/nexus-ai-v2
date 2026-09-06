#!/usr/bin/env python3
"""ETAPA 8.14c — Completa o dataset de instituições de UM repo a partir do dataset do solvegrid.

Os dados são por QID de cidade (idênticos entre repos); este script reconstrói o jsonl local
filtrado pelas páginas LOCAIS e consulta o que falta (chaves de cidade exclusivas deste repo).
Uso (dentro do repo alvo): python3 scripts/etapa814_extend_aq.py --from <caminho_do_jsonl_sg> --delay N
Idempotente (reusa out/etapa8_instituicoes.jsonl se existir e for mais novo que o checkpoint).
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
OUT = ROOT / "out" / "etapa8_instituicoes.jsonl"
LOG = Path("/home/user/cloudfire/work") / "logs" / "etapa814_extend.log"
UA = {"User-Agent": "etapa814c/1.0 (project contact)", "Accept": "application/sparql-results+json"}
DELAY = float(sys.argv[sys.argv.index("--delay") + 1]) if "--delay" in sys.argv else 65.0
CHUNK = 90
CLASSES = {"Q16917": "hospital", "Q3918": "universidade", "Q33506": "museu",
           "Q7075": "biblioteca", "Q41754": "teatro", "Q483110": "estádio"}


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
    src = sys.argv[sys.argv.index("--from") + 1] if "--from" in sys.argv else None
    if not src or not Path(src).exists():
        log("ERRO: --from <jsonl_sg> obrigatório")
        return 1
    base = {}
    for line in Path(src).read_text(encoding="utf-8").splitlines():
        try:
            r = json.loads(line)
        except Exception:
            continue
        base[r["qid"]] = r
    log(f"registros do solvegrid: {len(base)}")
    kq = city_qids()
    log(f"páginas-cidade locais: {len(kq)}")
    qid_keys = {}
    for k, q in kq:
        qid_keys.setdefault(q, []).append(k)
    registros = []
    for q, ks in qid_keys.items():
        br = base.get(q)
        if br:
            registros.append({"qid": q, "keys": ks, "entidades": br.get("entidades", [])})
    feitas = {r["qid"] for r in registros}
    faltam = [q for q in qid_keys if q not in feitas]
    log(f"cobertas: {len(registros)} | faltam: {len(faltam)}")
    for i in range(0, len(faltam), CHUNK):
        chunk = faltam[i:i + CHUNK]
        vals = " ".join("wd:" + q for q in chunk)
        query = f"""SELECT ?item ?itemLabel ?inst ?instLabel ?city WHERE {{
          VALUES ?city {{ {vals} }}
          ?item wdt:P131 ?city ; wdt:P31 ?inst .
          VALUES ?inst {{ wd:Q16917 wd:Q3918 wd:Q33506 wd:Q7075 wd:Q41754 wd:Q483110 }}
          SERVICE wikibase:label {{ bd:serviceParam wikibase:language "pt,en". }}
        }}"""
        rows = sparql(query)
        if rows is None:
            log(f"  WARN: lote falhou após retries")
            continue
        by_city = {}
        for b in rows:
            q = b["city"]["value"].split("/")[-1]
            inst = b["inst"]["value"].split("/")[-1]
            cls = CLASSES.get(inst)
            item = b["item"]["value"].split("/")[-1]
            name = b.get("itemLabel", {}).get("value", item)
            if not cls or not name or name.startswith("Q"):
                continue
            by_city.setdefault(q, []).append({"qid": item, "nome": name, "tipo": cls})
        for q in chunk:
            registros.append({"qid": q, "keys": qid_keys[q], "entidades": by_city.get(q, [])})
        log(f"  lote adicional {i//CHUNK + 1}/{max(1,(len(faltam)+CHUNK-1)//CHUNK)}: {len(rows)} rows")
    with open(OUT, "w", encoding="utf-8") as f:
        for r in registros:
            f.write(json.dumps(r, ensure_ascii=False) + "\n")
    log(f"FIM: {len(registros)} cidades em {OUT.name}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
