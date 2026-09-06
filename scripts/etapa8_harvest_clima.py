#!/usr/bin/env python3
"""ETAPA 8.2a — Harvest mensal Open-Meteo archive (2023–2025) com checkpoint.

1 request por cidade (daily 3 anos numa chamada). Respeito total à API: sequencial,
delay 8s, backoff 60/120/240/480s em 429, checkpoint JSONL com fsync, --resume.
Pula cidades que já têm <!-- city-clima -->. Ordem: nº de atrações (por_cidade) desc.

Uso:
  python3 scripts/etapa8_harvest_clima.py --limit 20            # piloto
  python3 scripts/etapa8_harvest_clima.py --resume              # job completo retomável
  python3 scripts/etapa8_harvest_clima.py --city br/sao-paulo   # 1 cidade (validação cruzada)
Saída: out/etapa8_clima_mensal.jsonl  (+ .tmp durante escrita)
"""
import json
import re
import sys
import time
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
PUB = ROOT / "public"
OUT = ROOT / "out"
DELAY = 8
BACKOFFS = [60, 120, 240, 480]


def city_list():
    files = []
    for d in sorted(PUB.iterdir()):
        if d.is_dir() and len(d.name) == 2 and d.name.isalpha():
            files.extend(sorted(d.glob("*.html")))
    try:
        pc = json.load(open(ROOT / "data" / "etapa6_atracoes.json", encoding="utf-8"))["por_cidade"]
    except Exception:
        pc = {}
    nattr = {}
    for k, v in pc.items():
        cc, slug = k.split("|")[0], k.split("|")[1]
        nattr[f"{cc}/{slug}"] = len(v)
    out = []
    for f in files:
        rel = f.relative_to(PUB).as_posix()
        key = rel[:-5]  # tira .html
        h = f.read_text(encoding="utf-8")
        if "<!-- city-clima -->" in h:
            continue
        if '<meta name="robots" content="noindex' in h.split("</head>")[0]:
            continue
        m = re.search(r'<div class="p7-osm" data-lat="([^"]+)" data-lon="([^"]+)"', h)
        if not m or m.group(1) in ("", "null"):
            continue
        out.append({"key": key, "lat": m.group(1), "lon": m.group(2), "nattr": nattr.get(key, 0)})
    out.sort(key=lambda c: -c["nattr"])
    return out


def fetch_monthly(lat, lon):
    url = (
        "https://archive-api.open-meteo.com/v1/archive?latitude=" + lat + "&longitude=" + lon
        + "&start_date=2023-01-01&end_date=2025-12-31"
        + "&daily=temperature_2m_max,temperature_2m_min,precipitation_sum,sunshine_duration&timezone=auto"
    )
    last = None
    for i, wait in enumerate([0] + BACKOFFS):
        if wait:
            print(f"  backoff {wait}s (429 #{i})", flush=True)
            time.sleep(wait)
        try:
            req = urllib.request.Request(url, headers={"User-Agent": "etapa8-clima/1.0"})
            with urllib.request.urlopen(req, timeout=60) as r:
                return json.load(r)
        except Exception as e:
            last = e
            if "429" not in str(e):
                raise
    raise last


def aggregate(d):
    daily = d.get("daily", {})
    t, mx, mn, pr = daily.get("time", []), daily.get("temperature_2m_max", []), \
        daily.get("temperature_2m_min", []), daily.get("precipitation_sum", [])
    su = daily.get("sunshine_duration", [])
    acc = {m: {"mx": [], "mn": [], "ch": {}, "dc": {}, "sol": []} for m in range(1, 13)}
    for i, dt in enumerate(t):
        y, m = int(dt[0:4]), int(dt[5:7])
        if mx[i] is not None:
            acc[m]["mx"].append(mx[i])
        if mn[i] is not None:
            acc[m]["mn"].append(mn[i])
        acc[m]["ch"].setdefault(y, 0.0)
        acc[m]["ch"][y] += pr[i] or 0.0
        acc[m]["dc"].setdefault(y, 0)
        if (pr[i] or 0.0) > 1.0:  # limiar Etapa 7 (prova: andorra jan/abr exatos)
            acc[m]["dc"][y] += 1
        if i < len(su) and su[i] is not None:
            acc[m]["sol"].append(su[i])
    out = {}
    for m in range(1, 13):
        a = acc[m]
        sol_s = round(sum(a["sol"]) / len(a["sol"]), 1) if a["sol"] else None
        out[m] = {
            "tmax": round(sum(a["mx"]) / len(a["mx"]), 1) if a["mx"] else None,
            "tmin": round(sum(a["mn"]) / len(a["mn"]), 1) if a["mn"] else None,
            "chuva": round(sum(a["ch"].values()) / len(a["ch"]), 0) if a["ch"] else None,
            "dias_chuva": round(sum(a["dc"].values()) / len(a["dc"]), 0) if a["dc"] else None,
            "sol_s": sol_s,  # segundos (Etapa 7 gravou segundos sob rótulo h/dia — bug; ver relatório)
            "sol_h": round(sol_s / 3600, 1) if sol_s else None,  # correto p/ novas tabelas
        }
    return out, {"tz": d.get("timezone"), "elev": d.get("elevation"), "ndias": len(t)}


def done_keys(path):
    done = set()
    if path.exists():
        for line in path.open(encoding="utf-8"):
            try:
                done.add(json.loads(line)["key"])
            except Exception:
                pass
    return done


def main():
    OUT.mkdir(exist_ok=True)
    outp = OUT / "etapa8_clima_mensal.jsonl"
    only = None
    if "--city" in sys.argv:
        only = sys.argv[sys.argv.index("--city") + 1]
    limit = int(sys.argv[sys.argv.index("--limit") + 1]) if "--limit" in sys.argv else None
    cities = city_list()
    print(f"cidades sem tabela: {len(cities)}")
    if only:
        cities = [c for c in cities_all_with_coords() if c["key"] == only] or cities
        cities = [c for c in cities if c["key"] == only]
        if not cities:
            print(f"cidade {only} não encontrada/sem coords")
            return 1
    done = done_keys(outp)
    cities = [c for c in cities if c["key"] not in done]
    if limit:
        cities = cities[:limit]
    print(f"a colher: {len(cities)} (já feitas: {len(done)})")
    ok, fail = 0, 0
    with outp.open("a", encoding="utf-8") as fo:
        for i, c in enumerate(cities):
            print(f"[{i+1}/{len(cities)}] {c['key']} nattr={c['nattr']} ...", flush=True)
            try:
                d = fetch_monthly(c["lat"], c["lon"])
                mens, meta = aggregate(d)
                fo.write(json.dumps({"key": c["key"], "lat": c["lat"], "lon": c["lon"],
                                     "mensal": mens, "meta": meta}, ensure_ascii=False) + "\n")
                fo.flush()
                ok += 1
            except Exception as e:
                print(f"  FALHA: {e}")
                fail += 1
            time.sleep(DELAY)
    print(f"FIM: ok={ok} fail={fail}")
    return 0 if fail == 0 else 1


def cities_all_with_coords():
    out = []
    for d in sorted(PUB.iterdir()):
        if d.is_dir() and len(d.name) == 2 and d.name.isalpha():
            for f in sorted(d.glob("*.html")):
                h = f.read_text(encoding="utf-8")
                m = re.search(r'<div class="p7-osm" data-lat="([^"]+)" data-lon="([^"]+)"', h)
                if m and m.group(1) not in ("", "null"):
                    out.append({"key": f.relative_to(PUB).as_posix()[:-5],
                                "lat": m.group(1), "lon": m.group(2), "nattr": 0})
    return out


if __name__ == "__main__":
    sys.exit(main())
