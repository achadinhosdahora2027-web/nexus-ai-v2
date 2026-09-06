# ETAPA 8.11–8.16 — Clima (fix+expansão), NL/labels de países, FAQ local e Roteiros

Data: 2026-09-06 · Itens do pedido: 12 (clima), 1 (dados básicos), 41/40 (100 intenções),
13/37–39 (guia/roteiro) · Status: **aplicado + validado (ERROS: NENHUM nos 3 repos) +
commit/push (rollback durável).** Deploy único pendente (será feito uma única vez ao final).

## Visão geral dos blocos entregues nesta rodada

| Bloco | O que é | Fonte | solvegrid | nexus | aquitem |
|---|---|---|---|---|---|
| `city-clima` (tabelas novas) | clima mês a mês (máx/mín/chuva/dias/sol) | Open-Meteo ERA5 (harvest retomável) | **381** | 379 | 361 |
| fix "sol" | corrige 230 tabelas baked que exibiam **segundos** sob "h/dia" | bug herdado Etapa 7 | 230/230 | 230/230 | 230/230 |
| `city-faq` | **perguntas de cauda longa** (matriz das 100 intenções), respostas derivadas dos dados reais da página | ld-city + fachada2 + atrações + clima + mobilidade + viagens + emergência | **2.906** | 2.906 | 2.641 |
| `city-roteiro` | roteiro 1/2/3 dias com as **atrações reais** (Wikidata, P625) ordenadas por proximidade ao centro | data/etapa6_atracoes.json | **1.547** | 1.547 | 1.534 |
| `nl` + labels de países | Países Baixos (Q55) adicionados ao dataset + **31 labels vazias/QID** de moedas/capitais/idiomas resolvidas (herdadas do 8.3) | Wikidata | 195 países ✔ | ✔ | ✔ |
| auditoria QIDs local | 2.926 páginas → 2.906 QIDs únicos; **1 conflito real** (mc/sg "cidade-estado") | análise local | documento | ✔ | ✔ |

## Detalhes importantes (auditoria da rodada)

1. **Bug de código meu (8.11)**: `flag startswith("Q")` marcava 5 labels legítimas em português
   (Quinxassa, Quito, Quetzal, Quiate, Quigali) como inválidas — falso positivo; filtrando por
   `nome == qid` estrito restaram só 2 reais (euro Q4916 e moeda TW histórica) e ambos resolvidos.
2. **`city-fachada2` nos `nl/*`**: o registro dos Países Baixos precisa de `continente` como lista de
   dicts (formato do harvest) — corrigido em 2 iterações (continente P30: Q46 Europa + Q27611
   América Central, dado real do Wikidata pelos territórios caribenhos).
3. **Incidente de propagação (importante)**: a premissa "3 repos espelho byte-idênticos" **NÃO valia**
   para a maioria das páginas (cada repo tem os próprios blocos de afiliado/PID por design:
   PIDs 101870640 sg / 101870639 nx / 101859672 aq). Copiar `public/` entre repos sobrescreveu
   blocos de herança → **2889+2564 arquivos restaurados do HEAD local** e re-aplicados SÓ via
   injetores idempotentes (que não tocam herança). Validação final: ERROS: NENHUM nos 3.
   REGRA NOVA (já no REGRAS-OPERACIONAIS): propagação de public/ NUNCA por cópia de arquivo;
   sempre restaurar HEAD + re-aplicar scripts.
4. **WDQS em outage** (rate-limit 1 req/min global, regra "797a132"): o harvest SPARQL de
   `city-instituicoes` (8.14) ficou **pronto** (`scripts/etapa814_harvest_instituicoes.py`,
   checkpoint + retries) mas NÃO executável agora. O painel-osm ao vivo já cobre as categorias
   (hospital/universidade/museu/etc. com nome+endereço+telefone) — lacuna documentada,
   bloqueado por fonte externa, não por decisão.
5. **QIDs**: auditoria local == 1 conflito real (2 páginas mc/sg usam o QID do CONCEITO Q133442
   "cidade-Estado"); correção exige API WD (em 429 hoje) → pendência documentada com script pronto.
6. **Harvest clima**: parou temporariamente em backoff 480s (429 do Open-Meteo, 160/2670 cidades
   no checkpoint commitado). Retomável com `--resume`; cada rodada adiciona tabelas e o injector
   é idempotente. As 2.670 páginas sem tabela continuam com o bloco "Tempo agora" ao vivo.

## Validação
```
etapa8_validate.py (atualizado: city-clima fora da herança + checagens específicas
sol<=24h, 12 colunas, marcadores pareados; teto da rodada 12 KB) → 3 repos: ERROS: NENHUM ✅
fix-sol 2ª passada: 0 mudanças (idempotente) ✅
faq/roteiro/clima 2ª passada: 0 mudanças ✅
sol em todas as tabelas: max <= 9,4 h (sem resíduo de segundos) ✅
md5 cruzado sg vs nx nos arquivos de amostra: idênticos ✅
```

## Publicação (GitHub — rollback durável)
- solvegrid `b2e72a2` · nexus-ai-v2 `26d6e52` · aquitemachadinhos `3664903` (push confirmado)

## Próximo e único passo desta sessão
1. Re-injetar as últimas tabelas do harvest → validação rápida → **commit se houver mudança**.
2. **DEPLOY ÚNICO** (Vercel, `--prod --archive=tgz`) nos 3 projetos + verify byte==repo.
3. IndexNow: **só após deploy no host canônico Cloudflare** (tokens CF inválidos — pendência do
   usuário; comando pronto no relatório 8.10). Google: sitemap já existente.
4. Limpeza de workspace (snapshot) + relatório + atualização REGRA.md.

## Como retomar pendências
- Clima: `python3 scripts/etapa8_harvest_clima.py --resume` (qualquer sessão; idempotente).
- Instituições (WDQS normalizado): `python3 scripts/etapa814_harvest_instituicoes.py --delay 15`
  → depois injetor (a escrever no formato dos blocos atuais).
- QIDs mc/sg: `etapa812_audit_qids.py` (API estável) + aplicar correções aprovadas.
- Cloudflare: com token novo, `wrangler pages deploy` de dentro de `public/` (3 projetos).
