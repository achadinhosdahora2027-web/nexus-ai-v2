# ETAPA 8.3 — Fachada+ (dados; injector em ETAPA-8.3-INJECTOR.md — LIVE 06/09/2026)

Data: 2026-09-06 · Item do pedido: 1 (informações básicas) · Status: dados colhidos e validados, commitados; bloco `city-pais` + linhas novas a injetar.

## 1. Dados (commitados nos 3 repos, md5 idênticos)

| Arquivo | Conteúdo | Cobertura |
|---|---|---|
| `out/etapa8_paises.json` | 194 países: ISO2/3, DDI (P474), moedas (P38→P498 ISO + P489→P487 símbolo, com `end`), idiomas (P37 rank), capital (P36 com `end`), fusos (P421), continente | 193–194/194 (~100%) |
| `out/etapa8_fachada_cidades.jsonl` | 3.007 cidades: fuso (P421), DDD (P473), CEP (P281), apelidos (P1449+P1813) | ddd 59%, cep 67%, fusos 7%, apelidos 8% |
| `out/etapa8_fusos.json` | 2.906 cidades: tz IANA + UTC jan/jul + DST (TimezoneFinder offline + zoneinfo) | **100%** (0 falhas) |

Provas: SP DDD 11 ✅ CEP 01000-000 (= baked ✅ cruzada); BR=BRL R$/$ ✅ DDI +55 ✅ Brasília atual (Rio end=1960 ✅); US capital Washington atual (Filadélfia/NY históricas ✅); fusos BR 14 zonas plausíveis; Noronha UTC−2 ✅; DST NY/Sydney detectado ✅.
QIDs extraídos do `ld-city` (2.983 únicos); coords idênticas nos 3 repos (prova 8.2) → 1 harvest serve aos 3.

## 2. Achados da auditoria
1. **REST Countries morta**: v3 deprecada, v5 exige auth (401). Substituída por Wikidata (fonte primária, mesma filosofia).
2. **Falha parcial silenciosa no batch 1**: 6 países vieram vazios (batch com erro parcial). Harvester corrigido: checa `success`, retry de QIDs ausentes, falha explícita. Re-harvest: 100%.
3. **Moedas/capitais históricas**: filtro `end==null` (real, Brasília, Washington). Regra do injector: atuais (todas, ex.: África do Sul multi-capital legítima); fallback = mais recente + ano.
4. **Símbolo moeda**: P489 dá item ("dólar"), caractere vem do P487 do item ($). Fallback: ISO.
5. **Idiomas**: exibir todos, ordem preferred > normal > deprecated (US: inglês deprecated como "oficial federal" mas de facto — seção chama "Idiomas", não "oficiais").
6. **Paris 22 CEPs**: regra faixa — ≤4 lista todos; >4 → "min–max (N códigos)". DDD "061" → normaliza "61".
7. **24 keys compartilham QID** (3.007 keys > 2.983 QIDs) → investigar na 8.11. `jp/tokyo`, `us/new-york` não existem (slugs US têm padrão `us-*-ny`; Tóquio ausente do inventário — sem URL nova por ora).
8. **cp multi-destino não existe no Unix** (`cp a b c` ≠ 2 destinos): incidente de sync corrigido com 6 cps + md5. REGRA NOVA: um destino por comando + verificar.

## 3. Regras do injector (próxima rodada)
- Bloco novo `city-pais` (ficha do país) + linhas na fachada: DDD, fuso/UTC/DST, apelidos, feriados-municipais→link prefeitura (sem inventar data).
- TRAD pt/fr/it; validador estendido; deploy + IndexNow. Feriado municipal, religião, economia: lacunas documentadas (sem fonte em lote).
- Retomar: `python3 scripts/etapa8_harvest_fachada.py pais|cidades` (idempotente, --resume) + escrever plugin `pais` no `etapa8_inject.py`.

## 4. GitHub
- `solvegrid@f7d1a41` · `nexus-ai-v2@7e52afe` (dados) + commit fix sync (hash no log) · aquitem idem.
