#!/usr/bin/env python3
"""ETAPA 8.13 — Completa o dataset de países (out/etapa8_paises.json) com países ausentes
do harvest 8.3 (lacuna encontrada na 8.10: 'nl' — Países Baixos, Q55).
Mesma estrutura do fase_pais() do etapa8_harvest_fachada.py (P38 P37 P474 P297 P298 P30 P36 P421
+ resolução de moedas P498/P489). Verifica país por país: já presente -> pula.
Saída: out/etapa8_paises.json atualizado (só adições; nunca regrava os existentes).
"""
import json, re, sys, time, urllib.request, urllib.parse
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "out" / "etapa8_paises.json"
UA = {"User-Agent": "etapa813-nl/1.0 (project contact)"}
FALTAM = {"nl": "Q55"}  # cc -> qid dos países ausentes conhecidos

def wb(ids, props="claims|labels", lang="pt|en"):
    url = "https://www.wikidata.org/w/api.php?" + urllib.parse.urlencode(
        {"action": "wbgetentities", "format": "json", "props": props,
         "languages": lang, "ids": "|".join(ids)})
    for t in range(5):
        try:
            time.sleep(2.0)
            return json.load(urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=60))
        except Exception as e:
            print("retry", t, e, flush=True)
            time.sleep(15 * (t + 1))
    raise RuntimeError("wd fail")

def label(ent):
    l = ent.get("labels", {})
    return l.get("pt", {}).get("value") or l.get("en", {}).get("value") or ""

def item_vals(claims, prop):
    out = []
    for c in claims.get(prop, []):
        if c.get("rank") == "deprecated":
            continue
        v = (c.get("mainsnak") or {}).get("datavalue", {}).get("value", {})
        if v.get("id"):
            quals = {}
            for k, qs in c.get("qualifiers", {}).items():
                qv = qs[0].get("datavalue", {}).get("value")
                if isinstance(qv, dict) and qv.get("id"):
                    quals[k] = qv["id"]
                elif isinstance(qv, dict) and qv.get("time"):
                    quals[k] = qv["time"]
            nvl = quals.get("P580") or quals.get("P582")
            end = None
            if quals.get("P582"):
                m = re.search(r"(\d{4})", quals["P582"])
                end = int(m.group(1)) if m else None
            out.append({"qid": v["id"], "rank": c.get("rank", "normal"),
                        "end": end, "qualifiers": quals})
    return out

def str_vals(claims, prop):
    out = []
    for c in claims.get(prop, []):
        dv = (c.get("mainsnak") or {}).get("datavalue") or {}
        if dv.get("type") == "string":
            out.append(dv["value"])
    return out

def text_vals(claims, prop):
    out = []
    for c in claims.get(prop, []):
        dv = (c.get("mainsnak") or {}).get("datavalue") or {}
        if dv.get("type") == "monolingualtext":
            out.append(dv["value"])
    return out

def collect_cc(cc, qid):
    ents = wb([qid]).get("entities", {})
    e = ents.get(qid)
    if not e or "missing" in e:
        raise RuntimeError(f"QID {qid} ausente")
    cl = e.get("claims", {})
    # moedas com ISO P498 + símbolo P489->P487
    moedas = []
    mo_qids = [v["qid"] for v in item_vals(cl, "P38")]
    if mo_qids:
        me = wb(mo_qids, props="claims|labels").get("entities", {})
        for v in item_vals(cl, "P38"):
            mi = me.get(v["qid"], {})
            iso = (mi.get("claims", {}).get("P498") or [{}])[0].get("mainsnak", {}).get("datavalue", {}).get("value")
            sim = None
            p489 = (mi.get("claims", {}).get("P489") or [{}])[0]
            sim_q = (p489.get("mainsnak") or {}).get("datavalue", {}).get("value", {}).get("id")
            if sim_q:
                se = wb([sim_q], props="labels|claims").get("entities", {})
                simp = se.get(sim_q, {})
                sim = (simp.get("claims", {}).get("P487") or [{}])[0].get("mainsnak", {}).get("datavalue", {}).get("value")
                if not sim:
                    sim = label(simp) or sim_q
            moedas.append({"qid": v["qid"], "nome": label(mi) or v["qid"],
                           "iso": iso, "simbolo": sim, "rank": v["rank"], "end": v["end"]})
    return {
        "nome": label(e), "qid": qid,
        "iso2": (str_vals(cl, "P297") or [cc.upper()])[0],
        "iso3": (str_vals(cl, "P298") or [""])[0],
        "ddi": str_vals(cl, "P474"),
        "moedas": moedas,
        "idiomas": [{"qid": v["qid"], "nome": v["qid"], "rank": v["rank"]} for v in item_vals(cl, "P37")],
        "capital": [{"qid": v["qid"], "nome": v["qid"], "rank": v["rank"], "end": v["end"]} for v in item_vals(cl, "P36")],
        "fusos": [{"qid": v["qid"], "nome": v["qid"], "rank": v["rank"], "end": v["end"]} for v in item_vals(cl, "P421")],
        "continente": [v["qid"] for v in item_vals(cl, "P30")],
    }

def main():
    d = json.load(open(OUT, encoding="utf-8"))
    antes = len(d)
    for cc, qid in FALTAM.items():
        if cc in d:
            print(f"{cc}: já presente, pulando"); continue
        rec = collect_cc(cc, qid)
        # resolve labels dos itens internos (idiomas/capital/fusos)
        ids = set()
        for k in ("idiomas", "capital", "fusos"):
            for v in rec[k]:
                ids.add(v["qid"])
        ids.update(rec["continente"])  # continente já é lista de qids
        labs = wb(sorted(ids), props="labels").get("entities", {})
        def L(q):
            return label(labs.get(q, {})) or q
        for v in rec["idiomas"]:
            v["nome"] = L(v["qid"])
        for v in rec["capital"]:
            v["nome"] = L(v["qid"])
        for v in rec["fusos"]:
            v["nome"] = L(v["qid"])
        rec["continente"] = [L(q) for q in rec["continente"]]
        d[cc] = rec
        print(f"{cc} ADICIONADO: {rec['nome']} | {rec['iso2']} {rec['iso3']} | DDI {rec['ddi']} | "
              f"moedas {[m['nome'] for m in rec['moedas']]} | capital {rec['capital']}")
    json.dump(d, open(OUT, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    print(f"total países: {antes} -> {len(d)}")
    # validação: cada chave tem qid/nome/iso2
    bad = [k for k, v in d.items() if not (v.get("qid") and v.get("nome") and v.get("iso2"))]
    print("registros inválidos:", bad[:5])

if __name__ == "__main__":
    main()
