#!/usr/bin/env python3
# ETAPA 8.10 — harvest `city-emergencia`: números nacionais de emergência por país.
# Fonte: Wikidata, propriedade P2852 (emergency telephone number) nos itens de país,
# com qualificador P366 (use) → serviço (polícia/bombeiros/EMS...). Comprovável, nada inventado.
# Idempotente: só escreve quando consolida um país; --resume retoma de checkpoint.
import json, os, re, sys, time, urllib.request, urllib.parse
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT  = ROOT / "out" / "etapa8_emergencia.json"
WORK = Path("/home/user/cloudfire/work")
CKPT = WORK / "data" / "etapa810_emergencia_checkpoint.jsonl"
LOG  = WORK / "logs" / "etapa810_harvest.log"
LANG = "pt|en|es|fr|it|de"
UA   = {"User-Agent": "city-panel-project/1.0 (contact: owner@example)"}

def log(msg):
    LOG.parent.mkdir(parents=True, exist_ok=True)
    with open(LOG, "a", encoding="utf-8") as f:
        f.write(f"{time.strftime('%Y-%m-%d %H:%M:%S')} {msg}\n")
    print(msg, flush=True)

def wd_get(params, tries=4):
    url = "https://www.wikidata.org/w/api.php?" + urllib.parse.urlencode(params)
    for i in range(tries):
        try:
            req = urllib.request.Request(url, headers=UA)
            d = json.load(urllib.request.urlopen(req, timeout=45))
            if d.get("success") is False:
                raise RuntimeError(f"batch success=false: {d.get('error')}")
            return d
        except Exception as e:
            wait = 5 * (2 ** i)
            log(f"  wd retry {i+1}/{tries} ({e}) -> {wait}s")
            time.sleep(wait)
    raise RuntimeError(f"Wikidata falhou definitivamente: {params.get('ids','')[:60]}")

def batch(qids, step=50):
    out = {}
    for i in range(0, len(qids), step):
        chunk = qids[i:i+step]
        d = wd_get({"action": "wbgetentities", "format": "json", "props": "claims|labels",
                    "languages": LANG, "ids": "|".join(chunk)})
        ents = d.get("entities", {})
        ok = sum(1 for e in ents.values() if "claims" in e or "labels" in e)
        if ok < len(chunk):
            log(f"  WARN: batch {i//step}: {ok}/{len(chunk)} entidades")
            # tenta uma vez só o que faltou
            missing = [q for q in chunk if q not in ents or ("claims" not in ents[q] and "labels" not in ents[q])]
            if missing:
                time.sleep(3)
                d2 = wd_get({"action": "wbgetentities", "format": "json", "props": "claims|labels",
                             "languages": LANG, "ids": "|".join(missing)})
                ents.update(d2.get("entities", {}))
        out.update(ents)
        time.sleep(2.0)  # respeito à API (evita 429 em série)
    return out

def claim_value(c):
    """Valor de um snak de claim (mainsnak) OU de um qualifier (que não tem mainsnak)."""
    sn = c.get("mainsnak") or c
    try:
        return sn["datavalue"]["value"]
    except Exception:
        return None

def qual_ids(c, prop):
    out = []
    for q in c.get("qualifiers", {}).get(prop, []):
        v = claim_value(q)
        if isinstance(v, dict) and v.get("id"):
            out.append(v["id"])
    return out

def qual_times(c, prop):
    """Retorna ano de cada valor temporal do qualificador (ex.: P580/P582)."""
    out = []
    for q in c.get("qualifiers", {}).get(prop, []):
        v = claim_value(q)
        if isinstance(v, dict) and v.get("time"):
            m = re.match(r"^[+\-]?(\d{4})", v["time"])
            if m:
                out.append(int(m.group(1)))
    return out

def main():
    WORK.mkdir(parents=True, exist_ok=True)
    CKPT.parent.mkdir(parents=True, exist_ok=True)
    paises = json.load(open(ROOT / "out" / "etapa8_paises.json", encoding="utf-8"))
    log(f"harvest emergencia: {len(paises)} países")

    done = {}
    if CKPT.exists():
        for line in CKPT.read_text(encoding="utf-8").splitlines():
            try:
                r = json.loads(line)
                done[r["cc"]] = r["rec"]
            except Exception:
                pass
        log(f"checkpoint: {len(done)} países já no checkpoint")

    country_ids = [p["qid"] for p in paises.values()]
    ents = batch(sorted(set(country_ids)), 50)
    log(f"entidades de país: {len(ents)}/{len(country_ids)}")

    # 1) extrai P2852 de cada país
    per_country = {}
    num_ids = set(); use_ids = set()
    for cc, p in paises.items():
        ent = ents.get(p["qid"])
        if not ent:
            log(f"  SEM ENTIDADE: {cc} {p['qid']}")
            continue
        claims = ent.get("claims", {}).get("P2852", [])
        rows = []
        for c in claims:
            if c.get("rank") == "deprecated":
                continue
            nv = claim_value(c)
            if not (isinstance(nv, dict) and nv.get("id")):
                continue
            # números históricos (P582 fim de vigência no passado) → omite
            ends = qual_times(c, "P582")
            if ends and min(ends) < 2026:
                continue
            uses = qual_ids(c, "P366")
            rows.append({"num": nv["id"], "use": uses[0] if uses else None})
            num_ids.add(nv["id"])
            if uses:
                use_ids.update(uses)
        per_country[cc] = rows
    log(f"P2852 extraído. itens-número {len(num_ids)}, itens-uso {len(use_ids)}")

    # 2) labels dos itens de número e de uso
    labs = batch(sorted(num_ids | use_ids), 50)
    def lab(qid, lang):
        e = labs.get(qid, {})
        return e.get("labels", {}).get(lang, {}).get("value") or \
               e.get("labels", {}).get("en", {}).get("value") or qid

    # 3) consolida por país (valida número)
    num_re = re.compile(r"^[0-9][0-9 #*+\-]{1,9}$")
    ALL_LANGS = ["pt", "en", "es", "fr", "it", "de"]
    result = {}
    skipped = []
    for cc, p in paises.items():
        if cc in done:
            result[cc] = done[cc]
            continue
        rows = []
        seen = set()
        for r in per_country.get(cc, []):
            n = lab(r["num"], "en").strip()
            n = re.sub(r"\s+", "", n)
            if not num_re.match(n):
                skipped.append((cc, r["num"], n))
                continue
            use_q = r["use"]
            key = (n, use_q)
            if key in seen:
                continue
            seen.add(key)
            rows.append({"n": n, "use_qid": use_q,
                         "use_l10n": {L: lab(use_q, L) if use_q else None for L in ALL_LANGS}})
        if not rows:
            log(f"  {cc}: sem números P2852")
        rows.sort(key=lambda r: (r["use_l10n"]["en"] or "zzz", r["n"]))
        rec = {"qid": p["qid"], "nome": p["nome"], "iso2": p.get("iso2"),
               "nums": rows, "colhido": time.strftime("%Y-%m-%d"),
               "fonte": "Wikidata P2852 (números de emergência por país; uso via P366)"}
        result[cc] = rec
        with open(CKPT, "a", encoding="utf-8") as f:
            f.write(json.dumps({"cc": cc, "rec": rec}, ensure_ascii=False) + "\n")

    json.dump(result, open(OUT, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    com_num = sum(1 for v in result.values() if v["nums"])
    tot = sum(len(v["nums"]) for v in result.values())
    log(f"RESULTADO: {com_num}/{len(result)} países com números · {tot} números · "
        f"validados; pulados={len(skipped)} {skipped[:6]}")

if __name__ == "__main__":
    main()
