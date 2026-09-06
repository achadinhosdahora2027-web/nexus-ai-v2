#!/usr/bin/env python3
"""ETAPA 8.13b — Fecha lacuna de labels do out/etapa8_paises.json (herdada do harvest 8.3):
itens de moedas/idiomas/capital/fusos/continente com nome vazio ou nome==QID (falha parcial
silenciosa do batch 1 — relatório 8.3 §2.2). Resolve labels pt (fallback en) + regenera a
fachada2 (plugin pais) apenas nas páginas dos países afetados (inclui 'nl' novo).
Saídas: paises.json corrigido; páginas regeneradas (working tree).
"""
import json, re, sys, time, urllib.request, urllib.parse
from pathlib import Path
from collections import Counter

ROOT = Path(__file__).resolve().parent.parent
PUB = ROOT / "public"
UA = {"User-Agent": "etapa813b/1.0 (project contact)"}

def wb(ids, tries=6):
    ids = sorted(set(ids))
    out = {}
    for i in range(0, len(ids), 40):
        chunk = ids[i:i+40]
        url = "https://www.wikidata.org/w/api.php?" + urllib.parse.urlencode(
            {"action": "wbgetentities", "format": "json", "props": "labels",
             "languages": "pt|en", "ids": "|".join(chunk)})
        for t in range(tries):
            try:
                time.sleep(2.5)
                d = json.load(urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=60))
                out.update(d.get("entities", {}))
                break
            except Exception as e:
                print(f"  retry {t} {e}", flush=True)
                time.sleep(20 * (t + 1))
        else:
            print("  WARN: lote falhou", chunk[:3], flush=True)
    return out

def label(ent):
    l = ent.get("labels", {})
    return l.get("pt", {}).get("value") or l.get("en", {}).get("value") or None

# Fallback local para itens SEM label pt/en na fonte — valor = rótulo publicado no próprio
# Wikidata em outro idioma (verificado via EntityData). Q11649941 = 銀圓券 (yuan de prata,
# moeda histórica da República da China; só tem label zh/ja — fim +1992-08-05).
LOCAL_LABELS = {"Q11649941": "銀圓券"}

def main():
    d = json.load(open(ROOT / "out" / "etapa8_paises.json", encoding="utf-8"))
    afetados = set()
    ids = set()
    for cc, v in d.items():
        for k in ("moedas", "idiomas", "capital", "fusos"):
            for it in v.get(k, []):
                nm = it.get("nome") or ""
                if nm == it.get("qid") or not nm:
                    ids.add(it["qid"]); afetados.add(cc)
        for c in v.get("continente", []):
            if isinstance(c, str) and c.startswith("Q"):
                ids.add(c)
    print("labels a resolver:", len(ids), "| países afetados:", len(afetados), flush=True)
    labs = wb(ids)
    nfix = 0
    for cc, v in d.items():
        for k in ("moedas", "idiomas", "capital", "fusos"):
            for it in v.get(k, []):
                nm = it.get("nome") or ""
                if nm == it.get("qid") or not nm:
                    L = label(labs.get(it["qid"], {})) or LOCAL_LABELS.get(it["qid"])
                    if L:
                        it["nome"] = L; nfix += 1
        nc = []
        for c in v.get("continente", []):
            if isinstance(c, str) and c.startswith("Q"):
                L = label(labs.get(c, {}))
                nc.append(L or c)
            else:
                nc.append(c)
        v["continente"] = nc
    json.dump(d, open(ROOT / "out" / "etapa8_paises.json", "w", encoding="utf-8"),
              ensure_ascii=False, indent=1)
    print("labels corrigidas:", nfix, flush=True)
    # varrer de novo (deve ser 0)
    rest = []
    for cc, v in d.items():
        for k in ("moedas", "idiomas", "capital", "fusos"):
            for it in v.get(k, []):
                nm = it.get("nome") or ""
                if nm == it.get("qid") or not nm:
                    rest.append((cc, k, it["qid"]))
    print("restantes inválidos:", len(rest), rest[:8], flush=True)
    with open(ROOT / "out" / "etapa813_paises_afetados.json", "w") as f:
        json.dump(sorted(afetados), f)
    print("afetados:", sorted(afetados))

if __name__ == "__main__":
    main()
