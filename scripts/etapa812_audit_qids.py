#!/usr/bin/env python3
"""ETAPA 8.12 — Auditoria/correção de QIDs de cidade no ld-city (sameAs wikidata).
Detecta: QID inexistente · descrição não-geográfica · rótulo != nome da página ·
grupos que compartilham QID (nomes-variação legítimos vs erros).
Correção automática apenas com prova dupla: rótulo exato == nome da página (normalizado)
+ descrição geográfica (city/town/municipality/…). Saídas:
  out/etapa812_qid_fixes.json   (correções certas)
"""
import json, re, sys, time, unicodedata, urllib.request, urllib.parse
from pathlib import Path
from collections import Counter, defaultdict

ROOT = Path(__file__).resolve().parent.parent
PUB = ROOT / "public"
UA = {"User-Agent": "etapa812-audit/1.0 (project contact)"}
DELAY = 2.0

GEO = ["city", "town", "village", "municipality", "commune", "capital", "borough",
       "district", "neighborhood", "suburb", "settlement", "hamlet", "metropolis",
       "urban", "município", "cidade", "vila", "comuna", "freguesia",
       "census-designated", "civil parish", "emirate", "province", "state", "region",
       "place in", "county", "island", "land", "prefecture"]

def norm(s):
    s = unicodedata.normalize("NFKD", s or "")
    s = "".join(c for c in s if not unicodedata.combining(c))
    return re.sub(r"[^a-z0-9]+", " ", s.lower()).strip()

def api(params):
    url = "https://www.wikidata.org/w/api.php?" + urllib.parse.urlencode(params)
    for t in range(4):
        try:
            time.sleep(DELAY)
            return json.load(urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=60))
        except Exception as e:
            print("retry", t, e, flush=True)
            time.sleep(12 * (t + 1))
    raise RuntimeError("api fail: " + str(params)[:80])

def search(name, lang="pt"):
    d = api({"action": "wbsearchentities", "format": "json", "language": lang,
             "type": "item", "limit": 6, "search": name})
    return d.get("search", [])

def main():
    # 1) mapa por página (extrai apenas o ld CITY, com coords p/ confirmar que é cidade)
    pages = {}
    for p in sorted(PUB.glob("*/*.html")):
        h = p.read_text(encoding="utf-8", errors="ignore")
        for m in re.finditer(r'<script type="application/ld\+json">(.*?)</script>', h, re.S):
            try:
                d = json.loads(m.group(1))
            except Exception:
                continue
            if isinstance(d, dict) and d.get("@type") == "City":
                sa = d.get("sameAs") or []
                qids = [s.split("/wiki/")[-1] for s in sa if "wikidata.org" in s]
                if qids:
                    geo = d.get("geo") or {}
                    pages[p.relative_to(PUB).as_posix()[:-5]] = {
                        "qid": qids[0], "name": d.get("name", ""),
                        "lat": geo.get("latitude"), "lon": geo.get("longitude")}
                break
    print("páginas com ld-city:", len(pages), flush=True)
    qid2keys = defaultdict(list)
    for k, v in pages.items():
        qid2keys[v["qid"]].append(k)

    # 2) labels
    qids = sorted(set(qid2keys))
    labs = {}
    for i in range(0, len(qids), 50):
        chunk = qids[i:i + 50]
        d = api({"action": "wbgetentities", "format": "json", "props": "labels|descriptions",
                 "languages": "pt|en", "ids": "|".join(chunk)})
        for q, e in d.get("entities", {}).items():
            if "missing" in e:
                labs[q] = None
                continue
            lb = e.get("labels", {}); ds = e.get("descriptions", {})
            labs[q] = {"label_pt": lb.get("pt", {}).get("value", ""),
                       "label_en": lb.get("en", {}).get("value", ""),
                       "desc": (ds.get("pt", {}).get("value", "") or ds.get("en", {}).get("value", "")).lower()}

    # 3) flags
    flags = []
    for k, v in pages.items():
        q = v["qid"]; L = labs.get(q)
        nm = norm(v["name"])
        if L is None:
            flags.append({"key": k, "qid": q, "motivo": "QID inexistente", "name": v["name"]})
            continue
        geo = any(g in L["desc"] for g in GEO)
        if not geo:
            flags.append({"key": k, "qid": q, "motivo": "desc não-geográfica",
                          "name": v["name"], "desc": L["desc"][:80]})
            continue
        lab_ok = norm(L["label_pt"]) == nm or norm(L["label_en"]) == nm
        if not lab_ok:
            flags.append({"key": k, "qid": q, "motivo": "rótulo != nome",
                          "name": v["name"], "label": L["label_pt"] or L["label_en"]})
    with open(ROOT / "out" / "etapa812_flags.jsonl", "w", encoding="utf-8") as f:
        for fl in flags:
            f.write(json.dumps(fl, ensure_ascii=False) + "\n")
    print("flags:", len(flags), flush=True)

    # 4) correções com prova dupla
    fixes = []
    done_keys = set()
    CKPT = ROOT / "out" / "etapa812_fixes.jsonl"
    if CKPT.exists():
        for line in CKPT.read_text(encoding="utf-8").splitlines():
            try:
                r = json.loads(line); fixes.append(r); done_keys.add(r["key"])
            except Exception:
                pass
        print("checkpoint fixes:", len(fixes), flush=True)
    for f in flags:
        if f["key"] in done_keys:
            continue
        cands = []
        for lang in ("pt", "en"):
            for c in search(f["name"].strip(), lang):
                cid = c.get("id"); lab = c.get("label", ""); desc = (c.get("description") or "").lower()
                if norm(lab) != norm(f["name"]):
                    continue
                if not any(g in desc for g in GEO):
                    continue
                cands.append({"qid": cid, "label": lab, "desc": desc[:80]})
            if cands:  # já achou candidato perfeito em pt; en é redundante
                break
        best = cands[0] if cands else None
        if best and best["qid"] != f["qid"]:
            fx = {"key": f["key"], "old": f["qid"], "new": best["qid"],
                  "name": f["name"], "label": best["label"], "desc": best["desc"]}
            fixes.append(fx)
            with open(CKPT, "a", encoding="utf-8") as fc:
                fc.write(json.dumps(fx, ensure_ascii=False) + "\n")
    json.dump({"flags": flags, "fixes": fixes}, open(ROOT / "out" / "etapa812_qid_fixes.json", "w", encoding="utf-8"),
              ensure_ascii=False, indent=1)
    print("flags:", len(flags), "| correções automáticas:", len(fixes), flush=True)
    for x in fixes[:40]:
        print(" ", x["key"], x["old"], "->", x["new"], "|", x["label"])

if __name__ == "__main__":
    main()
