# ETAPA 8.9 — Bloco `city-viagens`: destinos e distâncias (em linha reta)

Data: 2026-09-05 · Item do pedido: 25 (viagens a partir da cidade) e 26 (distâncias), parte de 1/3.
Status: **aplicado + validado + idempotente nos 3 repos; commit/push feito.** Deploy/verify é o passo seguinte.

## O que é
Novo bloco `<!-- city-viagens --> ... <!-- /city-viagens -->` em cada página de cidade que tem
`city-fachada` + `city-mobilidade`, com:
- "Destinos no mesmo país" (até 4, link interno) e "Destinos internacionais mais próximos" (até 3),
  cada um com **distância em linha reta (haversine) em km**, e nota honesta "não é rota por estrada".

## Comprovável e diferenciado (nada inventado)
- As coordenadas vêm das que **já existem no JSON-LD `ld-city` de cada página** (Wikidata).
- Cada cidade recebe a sua própria lista de vizinhos reais (determinístico). Exemplos verificados:
  São Paulo→Guarulhos 14 km / Diadema 15 km; Belém→Ananindeua 18 km; Hoi An→Da Nang 25 km;
  Benguela→Lobito 26 km; Bangkok→Nonthaburi 13 km; Sydney→Central Coast 63 km; Oslo→Skagen (DK) 244 km.
- Não há ranking, "melhor", preço, tempo de carro nem rota fabricados.

## Aplicação (idempotência provada: 2ª passada = 100% "inalterado")
| Repo | páginas com bloco | arquivos alterados | marcador único | `</html>` íntegro |
|---|---|---|---|---|
| solvegrid | 2.906 | 2.906 | ✅ | ✅ |
| nexus-ai-v2 | 2.906 | 2.906 | ✅ | ✅ |
| aquitemachadinhos | 2.660 | 2.660 | ✅ | ✅ |
| **total** | **8.472** | — | ✅ | ✅ |

- Peso por página: +~2,3 KB (ex.: Belém 97,8→100,1 KB) — bem dentro do limite.
- Formato dos links internos = canônico (`/br/belem`, sem `.html`, sem barra final) → não gera 404.
- Cobertura: exatamente as páginas com fachada+mobilidade (skips = páginas não-cidade/sem bloco).

## Arquivo
`scripts/etapa89_inject_viagens.py` (idêntico nos 3 repos): lê o registro das coords do `ld-city`,
pré-computa vizinhos (haversine) e injeta com marcador próprio, traduzindo rótulos (pt/en/es/fr/it/de,
fallback pt) pelo `data-lang` da página.

## Próximo passo
Preview + verify_live + `--branch main` (produção) + IndexNow (8.472 URLs) quando o HTML mudar no ar,
seguindo o ritual das Etapas 7–8.4 (wrangler de dentro da pasta; CLOUDFLARE_ACCOUNT_ID obrigatório).
