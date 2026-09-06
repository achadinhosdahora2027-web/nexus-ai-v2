#!/usr/bin/env python3
"""ETAPA 8.3 — Harvest Wikidata: países (moeda/idioma/DDI/ISO/capital/fuso) + cidades (fuso/DDD/CEP/apelidos).

Fase P: 194 países × (P38 P37 P474 P297 P298 P30 P36 P421) + resolução de labels/itens (moedas: P498 P489).
Fase C: 2.983 cidades × (P421 P473 P281 P1449 P1813) + labels.
Batch 50 QIDs/req, delay 2s, backoff 429 (30/60/120/240s), checkpoint em out/.
QIDs-país: extraídos do ld-city (country sameAs). QIDs-cidade: ld-city sameAs.

Uso:
  python3 scripts/etapa8_harvest_fachada.py pais         # ~4 reqs
  python3 scripts/etapa8_harvest_fachada.py cidades [--limit N] [--resume]
Saídas: out/etapa8_paises.json, out/etapa8_fachada_cidades.jsonl
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
UA = {"User-Agent": "etapa8-fachada/1.0 (contact: local)"}
BACKOFFS = [30, 60, 120, 240]


def wb(ids, props="claims|labels", lang="pt|en"):
    url = ("https://www.wikidata.org/w/api.php?action=wbgetentities&ids=" + "|".join(ids)
           + f"&props={props}&languages={lang}&languagefallback=1&format=json")
    last = None
    for i, wait in enumerate([0] + BACKOFFS):
        if wait:
            print(f"  backoff {wait}s (#{i})", flush=True)
            time.sleep(wait)
        try:
            req = urllib.request.Request(url, headers=UA)
            d = json.load(urllib.request.urlopen(req, timeout=60))
            if d.get("success") != 1:
                raise RuntimeError(f"wb success!=1: {json.dumps(d.get('error', d))[:200]}")
            return d
        except Exception as e:
            last = e
            if "429" not in str(e) and "HTTP Error 429" not in str(e) and "success!=1" not in str(e):
                raise
            if "success!=1" in str(e) and i >= 2:
                raise
    raise last


def label(ent):
    lb = ent.get("labels", {})
    return (lb.get("pt") or lb.get("en") or {}).get("value")


def item_vals(claims, prop):
    """Todos os valores item de um claim (com rank + end-time quando houver)."""
    out = []
    for c in claims.get(prop, []):
        try:
            v = c["mainsnak"]["datavalue"]["value"]
            if isinstance(v, dict) and v.get("id", "").startswith("Q"):
                end = None
                for q in c.get("qualifiers", {}).get("P582", []):
                    end = q["datavalue"]["value"]["time"]
                out.append({"qid": v["id"], "rank": c.get("rank"), "end": end})
        except Exception:
            pass
    return out


def str_vals(claims, prop):
    out = []
    for c in claims.get(prop, []):
        try:
            v = c["mainsnak"]["datavalue"]["value"]
            if isinstance(v, str):
                out.append(v)
        except Exception:
            pass
    return out


def text_vals(claims, prop):
    """Valores monolingual text (com idioma)."""
    out = []
    for c in claims.get(prop, []):
        try:
            v = c["mainsnak"]["datavalue"]["value"]
            if isinstance(v, dict) and "text" in v:
                out.append({"text": v["text"], "lang": v.get("language")})
        except Exception:
            pass
    return out


def pais_qids():
    m = {}
    for f in PUB.iterdir():
        if f.is_dir() and len(f.name) == 2 and f.name.isalpha():
            for h in f.glob("*.html"):
                t = h.read_text(encoding="utf-8")
                x = re.search(r'"country":\{"@type":"Country","name":"([^"]+)","sameAs":"https://www.wikidata.org/wiki/(Q\d+)"', t)
                if x:
                    m[f.name] = {"nome": x.group(1), "qid": x.group(2)}
                    break
    return m


def cidade_qids():
    out = {}
    for d in sorted(PUB.iterdir()):
        if d.is_dir() and len(d.name) == 2 and d.name.isalpha():
            for f in sorted(d.glob("*.html")):
                t = f.read_text(encoding="utf-8")
                if '<meta name="robots" content="noindex' in t.split("</head>")[0]:
                    continue
                x = re.search(r'"sameAs":\["https://www.wikidata.org/wiki/(Q\d+)"', t)
                if x:
                    out[f.relative_to(PUB).as_posix()[:-5]] = x.group(1)
    return out


def fase_pais():
    OUT.mkdir(exist_ok=True)
    pq = pais_qids()
    print(f"países: {len(pq)}")
    qids = [v["qid"] for v in pq.values()]
    ents = {}
    for i in range(0, len(qids), 50):
        batch = qids[i:i + 50]
        print(f"  batch países {i//50+1} ({len(batch)})", flush=True)
        d = wb(batch)
        ents.update(d.get("entities", {}))
        time.sleep(2)
    # resolve itens referenciados (moedas, idiomas, capitais, fusos, continentes)
    refs = set()
    for e in ents.values():
        cl = e.get("claims", {})
        for p in ("P38", "P37", "P36", "P421", "P30"):
            refs.update(v["qid"] for v in item_vals(cl, p))
    refs = sorted(refs - set(qids))
    print(f"  itens referenciados: {len(refs)}")
    refents = {}
    for i in range(0, len(refs), 50):
        batch = refs[i:i + 50]
        print(f"  batch refs {i//50+1}", flush=True)
        d = wb(batch)
        refents.update(d.get("entities", {}))
        time.sleep(2)
    # retry: QIDs de país ausentes no retorno (falha parcial nunca é silenciosa)
    missing = [q for q in qids if q not in ents]
    if missing:
        print(f"  retry {len(missing)} países ausentes: {missing[:8]}", flush=True)
        d = wb(missing[:50])
        ents.update(d.get("entities", {}))
        time.sleep(2)
        missing = [q for q in qids if q not in ents]
        if missing:
            raise RuntimeError(f"países sem retorno após retry: {missing}")
    # moedas: ISO (P498) + símbolo (P489 -> P487 caractere Unicode)
    moedas = {v["qid"] for e in ents.values() for v in item_vals(e.get("claims", {}), "P38")}
    simb_refs = set()
    for q in moedas:
        e = refents.get(q, {})
        simb_refs.update(v["qid"] for v in item_vals(e.get("claims", {}), "P489"))
    simb_refs = sorted(simb_refs - set(refents))
    if simb_refs:
        print(f"  batch símbolos: {len(simb_refs)}", flush=True)
        d = wb(simb_refs[:50])
        refents.update(d.get("entities", {}))
        time.sleep(2)
    out = {}
    for cc, info in pq.items():
        e = ents.get(info["qid"], {})
        cl = e.get("claims", {})
        def L(q):
            return label(refents.get(q, {}))
        moedas_l = []
        for v in item_vals(cl, "P38"):
            me = refents.get(v["qid"], {})
            iso = str_vals(me.get("claims", {}), "P498")
            sim_chars = []
            for s in item_vals(me.get("claims", {}), "P489"):
                se = refents.get(s["qid"], {})
                sim_chars += str_vals(se.get("claims", {}), "P487")
            moedas_l.append({"qid": v["qid"], "nome": L(v["qid"]), "iso": iso[0] if iso else None,
                             "simbolo": sim_chars[0] if sim_chars else None, "end": v["end"]})
        out[cc] = {
            "nome": info["nome"], "qid": info["qid"],
            "iso2": (str_vals(cl, "P297") or [None])[0],
            "iso3": (str_vals(cl, "P298") or [None])[0],
            "ddi": str_vals(cl, "P474"),
            "moedas": moedas_l,
            "idiomas": [{"qid": v["qid"], "nome": L(v["qid"]), "rank": v["rank"]} for v in item_vals(cl, "P37")],
            "capital": [{"qid": v["qid"], "nome": L(v["qid"]), "end": v["end"]} for v in item_vals(cl, "P36")],
            "fusos": [{"qid": v["qid"], "nome": L(v["qid"])} for v in item_vals(cl, "P421")],
            "continente": [L(v["qid"]) for v in item_vals(cl, "P30")],
        }
    (OUT / "etapa8_paises.json").write_text(json.dumps(out, ensure_ascii=False, indent=1), encoding="utf-8")
    # cobertura
    n = len(out)
    cov = {k: sum(1 for v in out.values() if v[k]) for k in ("iso2", "ddi", "moedas", "idiomas", "capital", "fusos")}
    print("cobertura países:", {k: f"{v}/{n}" for k, v in cov.items()})
    return out


def fase_cidades(limit=None, resume=True):
    OUT.mkdir(exist_ok=True)
    cq = cidade_qids()
    print(f"cidades com QID: {len(cq)}")
    outp = OUT / "etapa8_fachada_cidades.jsonl"
    done = set()
    if resume and outp.exists():
        for line in outp.open(encoding="utf-8"):
            try:
                done.add(json.loads(line)["key"])
            except Exception:
                pass
    items = [(k, q) for k, q in sorted(cq.items()) if k not in done]
    if limit:
        items = items[:limit]
    print(f"a colher: {len(items)} (feitas: {len(done)})")
    # fusos das cidades: coletar QIDs e resolver labels depois
    fusos = set()
    recs = []
    for i in range(0, len(items), 50):
        batch = items[i:i + 50]
        print(f"  batch {i//50+1}/{(len(items)+49)//50}", flush=True)
        d = wb([q for _, q in batch])
        miss = [q for _, q in batch if q not in d.get("entities", {})]
        if miss:
            print(f"    retry {len(miss)}: {miss[:5]}", flush=True)
            d2 = wb(miss[:50])
            d["entities"].update(d2.get("entities", {}))
            time.sleep(2)
            miss = [q for _, q in batch if q not in d.get("entities", {})]
            if miss:
                raise RuntimeError(f"cidades sem retorno após retry: {miss[:8]}")
        for key, q in batch:
            e = d.get("entities", {}).get(q, {})
            cl = e.get("claims", {})
            fz = item_vals(cl, "P421")
            fusos.update(v["qid"] for v in fz)
            recs.append({"key": key, "qid": q,
                         "fusos": [v["qid"] for v in fz],
                         "ddd": str_vals(cl, "P473"),
                         "cep": str_vals(cl, "P281"),
                         "apelidos": text_vals(cl, "P1449") + text_vals(cl, "P1813")})
        time.sleep(2)
    print(f"  fusos distintos: {len(fusos)}")
    flabel = {}
    fl = sorted(fusos)
    for i in range(0, len(fl), 50):
        d = wb(fl[i:i + 50], props="labels")
        for q, e in d.get("entities", {}).items():
            flabel[q] = label(e)
        time.sleep(2)
    with outp.open("a", encoding="utf-8") as fo:
        for r in recs:
            r["fusos"] = [{"qid": q, "nome": flabel.get(q)} for q in r["fusos"]]
            fo.write(json.dumps(r, ensure_ascii=False) + "\n")
    cov = {"fusos": sum(1 for r in recs if r["fusos"]), "ddd": sum(1 for r in recs if r["ddd"]),
           "cep": sum(1 for r in recs if r["cep"]), "apelidos": sum(1 for r in recs if r["apelidos"])}
    print(f"cobertura lote ({len(recs)}):", cov)


def main():
    if len(sys.argv) < 2 or sys.argv[1] not in ("pais", "cidades"):
        print(f"uso: {sys.argv[0]} pais|cidades [--limit N] [--no-resume]")
        return 2
    if sys.argv[1] == "pais":
        fase_pais()
    else:
        limit = int(sys.argv[sys.argv.index("--limit") + 1]) if "--limit" in sys.argv else None
        fase_cidades(limit=limit, resume="--no-resume" not in sys.argv)
    return 0


if __name__ == "__main__":
    sys.exit(main())
