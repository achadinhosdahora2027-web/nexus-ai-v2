#!/usr/bin/env python3
# ETAPA 8.11a — CORREÇÃO: tabelas baked de clima exibiam "sol" em SEGUNDOS sob rótulo "sol (h/dia)".
# Bug herdado da Etapa 7 (ex.: Andorra jan 26.166,2 = 26.166 s = 7,3 h). Normaliza ÷3600.
# Idempotente (valores <= 30 não são tocados). Aplica em todas as páginas com <!-- city-clima -->.
import re, sys
from pathlib import Path
from collections import Counter

ROOT = Path(__file__).resolve().parent.parent
PUB = ROOT / "public"
APPLY = "--apply" in sys.argv

# linha <tr> do "sol": th com texto 'sol...' + 12 tds
ROW_RE = re.compile(r'(<tr><th scope="row"[^>]*>(sol[^<]*)</th>)(.*?)(</tr>)', re.S)
CELL_RE = re.compile(r'(<td style="[^"]*">)([^<]*)(</td>)')

def fix_value(v):
    """'26.166,2' (segundos, pt) -> '7,3' (horas). Retorna (novo, mudou)."""
    fnum = float(v.replace(".", "").replace(",", "."))
    if fnum > 30.0:                      # claramente em segundos
        h = fnum / 3600.0
        return ("%.1f" % h).replace(".", ","), True
    return v, False

def main():
    counts = Counter(); files = sorted(PUB.glob("*/*.html"))
    for p in files:
        h = p.read_text(encoding="utf-8", errors="ignore")
        if "<!-- city-clima -->" not in h:
            continue
        def repl_row(m):
            cells = m.group(3)
            def repl_cell(cm):
                val, ch = fix_value(cm.group(2).strip())
                return "%s%s%s" % (cm.group(1), val, cm.group(3))
            ncells = CELL_RE.sub(repl_cell, cells)
            return m.group(1) + ncells + m.group(4)
        novo, n = ROW_RE.subn(repl_row, h)
        if n == 0:
            counts["sem-linha-sol"] += 1
            continue
        if novo == h:
            counts["inalterado"] += 1
        else:
            counts["corrigido"] += 1
            if APPLY:
                p.write_text(novo, encoding="utf-8")
        # verificação de sanidade
        m2 = ROW_RE.search(novo)
        vals = [float(mm.group(2).replace(".", "").replace(",", ".")) for mm in CELL_RE.finditer(m2.group(3))]
        if vals and max(vals) > 24:
            counts["AVISO>24h"] += 1
            print("AVISO:", p, vals[:3])
    print(("APPLY" if APPLY else "DRY-RUN"), "fix-sol:", dict(counts), flush=True)

if __name__ == "__main__":
    main()
