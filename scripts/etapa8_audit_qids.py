#!/usr/bin/env python3
"""Auditoria de QIDs: busca labels+descriptions (leve) e sinaliza tipos suspeitos (não-lugar).
Uso: python3 etapa8_audit_qids.py [--delay 3]
Saída: work/wd_audit.json {qid: {key, label_en, desc_en, suspeito, motivo}}
"""
import json, sys, time, urllib.request

SUSPEITAS = ["given name", "family name", "surname", "film", "song", "album", "single ",
             "television", "novel", "book ", "band", "musical group", "company",
             "asteroid", "crater", "football club", "sports club", "airport",
             "university", "school", "hospital", "hotel", "restaurant", "person ",
             "actor", "actress", "singer", "writer", "politician", "video game",
             "painting", "sculpture", "newspaper", "magazine", "website", "brand",
             "dish", "food", "animal", "plant", "river", "mountain", "lake",
             "church", "cathedral", "mosque", "temple", "castle", "palace",
             "museum", "stadium", "bridge", "tower", "monument", "park",
             "ship ", "aircraft", "hurricane", "storm", "earthquake", "war ",
             "battle", "language", "currency", "holiday", "festival", "award"]
GEO_OK = ["city", "town", "village", "municipality", "commune", "capital",
          "borough", "district", "neighborhood", "suburb", "settlement",
          "hamlet", "metropolis", "urban", "município", "cidade", "vila",
          "capital", "comuna", "freguesia", "census-designated", "civil parish"]

DELAY = float(sys.argv[2]) if len(sys.argv) > 2 and sys.argv[1] == "--delay" else 3.0

qm = json.load(open("/home/user/work/wd_qids.json", encoding="utf-8"))
qids = list(qm.keys())
out = {}
for i in range(0, len(qids), 50):
    chunk = qids[i:i + 50]
    url = ("https://www.wikidata.org/w/api.php?action=wbgetentities&ids=" +
           "|".join(chunk) + "&props=labels|descriptions&languages=pt|en&format=json")
    for tent in range(4):
        try:
            time.sleep(DELAY)
            d = json.load(urllib.request.urlopen(urllib.request.Request(
                url, headers={"User-Agent": "etapa8-audit/1.0"}), timeout=60))
            break
        except Exception as e:
            print(f"batch {i//50} tent {tent}: {type(e).__name__}", flush=True)
            time.sleep(15 * (tent + 1))
    else:
        print(f"PULADO batch {i//50}", flush=True)
        continue
    for q, ent in d.get("entities", {}).items():
        if "missing" in ent:
            out[q] = {"key": qm.get(q), "suspeito": True, "motivo": "QID inexistente"}
            continue
        lb = ent.get("labels", {})
        ds = ent.get("descriptions", {})
        le = lb.get("en", {}).get("value", "") or lb.get("pt", {}).get("value", "")
        de = (ds.get("en", {}).get("value", "") or ds.get("pt", {}).get("value", "")).lower()
        motivo = None
        if not de:
            motivo = "sem description (inconclusivo)"
        elif any(g in de for g in GEO_OK):
            motivo = None
        else:
            for s in SUSPEITAS:
                if s in de:
                    motivo = f"desc: {de[:80]}"
                    break
            if motivo is None:
                motivo = f"desc atípica: {de[:80]}"
        out[q] = {"key": qm.get(q), "label": le, "desc": de[:120],
                  "suspeito": motivo is not None and "inconclusivo" not in (motivo or ""),
                  "motivo": motivo}
    print(f"batch {i//50}: {len(out)} auditados", flush=True)
json.dump(out, open("/home/user/work/wd_audit.json", "w"), ensure_ascii=False)
susp = {q: v for q, v in out.items() if v.get("suspeito")}
print(f"TOTAL {len(out)} | SUSPEITOS {len(susp)}")
for q, v in sorted(susp.items(), key=lambda x: str(x[1].get("key"))):
    print(f"  {v.get('key')} {q} {v.get('label')} :: {v.get('motivo')}")
