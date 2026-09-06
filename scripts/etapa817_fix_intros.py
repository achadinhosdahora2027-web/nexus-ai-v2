#!/usr/bin/env python3
"""ETAPA 8.17 — Remediação de artefatos do gerador legado (dataset antigo de capitais).

A) Páginas-conceito com nome fabricado (destinos inexistentes):
     mc/cidade-estado-polo-financeiro-de-luxo-mundial        (nome="Cidade-Estado, polo financeiro de luxo mundial")
     sg/cidade-estado-hub-financeiro-e-portuario-global      (nome="Cidade-Estado, hub financeiro e portuário global")
     sg/singapura-cidade-estado-com-multiplos-distritos-como-bedok (nome="Singapura (Cidade-Estado ...)")
   São resíduos do mesmo gerador que descreve capitais como "<País> <Cidade> Capital, <descritor>".
   As páginas reais equivalentes existem: mc/monte-carlo, mc/monaco-ville, mc/la-condamine, sg/singapura.
   Deletadas + âncoras removidas + entradas do sitemap.xml + entradas de out/etapa8_fachada_cidades.jsonl.

B) Intros contaminados: o descritor de OUTRAS cidades ("<País> <Cidade> Capital, ...") vazou após o
   descritor próprio (bug de posição do gerador antigo). Mantém descritor próprio + frase de fechamento
   VERBATIM; remove apenas o trecho contaminado (determinístico, tabela explícita de corte).

Execução: sem --apply = auditoria (relatório); com --apply = grava.
"""
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
PUB = ROOT / "public"

CONCEPT_PAGES = [
    "mc/cidade-estado-polo-financeiro-de-luxo-mundial",
    "sg/cidade-estado-hub-financeiro-e-portuario-global",
    "sg/singapura-cidade-estado-com-multiplos-distritos-como-bedok",
]
CONCEPT_KEYS = {c for c in CONCEPT_PAGES}

# marcadores de corte: início do trecho contaminado (primeira entrada "País Cidade Capital," legada)
INTRO_CUTS = {
    "au/burnie": "Australian Capital Territory Canberra",
    "az/sumqayit": "Bahamas Nassau",
    "ba/tuzla": "Camboja Phnom Penh",
    "cy/nicosia": "Coreia do Norte Pyongyang",
    "do/santo-domingo": "Samoa Apia",
    "ee/tartu": "Etiópia Adis Abeba",
    "ge/tbilisi": "Guiana Georgetown",
    "ie/dublin": "Islândia Reykjavík",
    "jo/zarqa": "Kuwait Cidade do Kuwait",
    "lk/sri-jayawardenepura-kotte": "Sudão Cartum",
    "ly/tripoli": "Macedônia do Norte Skopje",
    "mm/yangon": "Moldávia Chisinau",
    "no/oslo": "Omã Mascate",
    "pa/colon": "Papua-Nova Guiné Port Moresby",
    "sm/serravalle": "Senegal Dakar",
    "tt/port-of-spain": "Tunísia Túnis",
    "uy/salto": "Vaticano Cidade do Vaticano",
    "ye/aden": "Jamaica Kingston",
}

H1_P = re.compile(r"(<h1>.*?</h1>\s*<p>)(.*?)(</p>)", re.S)
URL_BLOCK = re.compile(r"<url>\s*<loc>[^<]*cidade-estado[^<]*</loc>.*?</url>", re.S)
ANCHOR = re.compile(r'<a\b[^>]*href="[^"]*cidade-estado[^"]*"[^>]*>\s*[^<]*?\s*</a>', re.S)


def fix_intro(intro: str, marker: str):
    """Retorna (novo_intro, ok, motivo)."""
    i1 = intro.find(".")
    if i1 < 0:
        return intro, False, "sem primeiro ponto"
    mi = intro.find(marker)
    if mi < 0:
        # idempotência: sem marcador E sem assinatura de contaminação -> já limpo
        zona = intro[i1:].split(".")
        if any(re.search(r"\b(Capital|Cidade-Estado)[, ]", z) for z in zona[:-1]):
            return intro, False, "marcador não encontrado (revisar manualmente)"
        return intro, True, "já-limp"
    if intro.find(".", i1 + 1, mi) >= 0:
        return intro, False, "ponto dentro do descritor próprio (revisar manualmente)"
    ldot = intro.rfind(". ")  # fim da zona contaminada = ponto antes da frase de fechamento
    if ldot < 0:
        return intro, False, "sem ponto antes do fechamento (revisar manualmente)"
    closing = intro[ldot:]  # ". Nesta página..."/". Compare ..."/". Aqui ..."
    novo = intro[:mi].rstrip() + closing
    novo = re.sub(r"  +", " ", novo)
    return novo, True, "ok"


def main():
    apply = "--apply" in sys.argv
    res = {"concepts_removidos": [], "concepts_nao_encontrados": [],
           "sitemap_blocos_removidos": 0, "ancoras_removidas": [],
           "intros_fixadas": [], "intros_pendentes": [],
           "fachada_jsonl_removidos": 0}

    # ---- A1) deletar páginas-conceito
    for rel in CONCEPT_PAGES:
        p = PUB / (rel + ".html")
        if not p.exists():
            res["concepts_nao_encontrados"].append(rel)
            continue
        if apply:
            p.unlink()
        res["concepts_removidos"].append(rel)

    # ---- A2) sitemap.xml: remover blocos <url> das 3 URLs
    sitemap = PUB / "sitemap.xml"
    if sitemap.exists():
        txt = sitemap.read_text(encoding="utf-8", errors="ignore")
        n0 = len(URL_BLOCK.findall(txt))
        novo, n = URL_BLOCK.subn("", txt)
        res["sitemap_blocos_removidos"] = n
        if apply and n:
            sitemap.write_text(novo, encoding="utf-8")
        if n == 0:
            res["sitemap_blocos_removidos"] = -1  # nada a remover
        del n0

    # ---- A3) âncoras nas outras páginas
    for p in sorted(PUB.glob("*/*.html")):
        h = p.read_text(encoding="utf-8", errors="ignore")
        if "cidade-estado" not in h:
            continue
        novo, n = ANCHOR.subn("", h)
        if n:
            res["ancoras_removidas"].append(f"{p.relative_to(PUB).as_posix()} ({n})")
            if apply:
                p.write_text(novo, encoding="utf-8")

    # ---- A4) out/etapa8_fachada_cidades.jsonl: remover entradas conceito
    fj = ROOT / "out" / "etapa8_fachada_cidades.jsonl"
    if fj.exists():
        linhas = fj.read_text(encoding="utf-8").splitlines()
        keep = []
        for ln in linhas:
            try:
                k = json.loads(ln).get("key")
            except Exception:
                k = None
            if k in CONCEPT_KEYS:
                res["fachada_jsonl_removidos"] += 1
                continue
            keep.append(ln)
        if apply and res["fachada_jsonl_removidos"]:
            fj.write_text("\n".join(keep) + "\n", encoding="utf-8")

    # ---- B) intros contaminados
    for rel, marker in INTRO_CUTS.items():
        p = PUB / (rel + ".html")
        if not p.exists():
            res["intros_pendentes"].append((rel, "arquivo não existe"))
            continue
        h = p.read_text(encoding="utf-8", errors="ignore")
        m = H1_P.search(h)
        if not m:
            res["intros_pendentes"].append((rel, "sem h1+p"))
            continue
        intro = m.group(2)
        novo, ok, motivo = fix_intro(intro, marker)
        if not ok:
            res["intros_pendentes"].append((rel, motivo))
            continue
        if novo == intro:
            res["intros_pendentes"].append((rel, "já limpo"))
            continue
        res["intros_fixadas"].append(rel)
        if apply:
            h = h[:m.start(2)] + novo + h[m.end(2):]
            p.write_text(h, encoding="utf-8")

    ROOT.joinpath("out", "etapa817_resumo.json").write_text(
        json.dumps(res, ensure_ascii=False, indent=1), encoding="utf-8")
    print(json.dumps(res, ensure_ascii=False, indent=1))
    print("MODO:", "APLICANDO" if apply else "SOMENTE AUDITORIA (use --apply para gravar)")


if __name__ == "__main__":
    main()
