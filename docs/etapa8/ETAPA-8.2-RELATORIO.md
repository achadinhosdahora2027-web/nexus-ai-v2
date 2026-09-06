# ETAPA 8.2 — Clima: tempo agora em 7.775 páginas + harvest mensal retomável

Data: 2026-09-06 · Repos: solvegrid, nexus-ai-v2, aquitemachadinhos · Item do pedido: 12 (clima dinâmico)

## 1. O que foi feito

### 1a. `public/js/clima.js` v2 (1 arquivo × 3 repos, 11.403 → 13.674 bytes)
- **+Visibilidade** (`current.visibility` → km, 1 decimal; `—` se ausente).
- **+Qualidade do ar** (Air Quality API Open-Meteo, sem key): US AQI + categoria EPA + PM2.5.
  Chamada encadeada com timeout 8s; qualquer falha → omite só a linha do ar (resto renderiza).
  Sem `Promise.all` de propósito (compat máxima, só `.then/.catch`).
- **7 → 14 dias** no `<details>` (dados já vinham de graça no `forecast_days=14`).
- i18n pt/fr/it/en para todos os rótulos novos (categorias AQI traduzidas nos 4).
- Cache 15min, fallback honesto e `timezone=auto` preservados.

### 1b. Bloco `<!-- city-agora -->` — 7.775 páginas (eram 236+225 com clima)
| Repo | city pages | já tinham city-clima | ganharam city-agora | puladas (sem coords/noindex) |
|---|---|---|---|---|
| solvegrid | 3.156 | 236 | **2.670** | 250 |
| nexus-ai-v2 | 3.156 | 236 | **2.670** | 250 |
| aquitemachadinhos | 2.893 | 225 | **2.435** | 233 |
| **total** | **9.205** | **697** | **7.775** | **733** |

- Injector genérico `scripts/etapa8_inject.py` (plugin `agora`, idempotente, âncora `painel-osm`,
  coords+lang copiados do OSM, título traduzido pt/fr/it, `<script clima.js>` no `p7-js`).
- i18n real: 67/67 páginas `fr` com "Météo actuelle", 52/52 `it` com "Meteo adesso", 0 vazamento pt.

### 1c. Harvester mensal `scripts/etapa8_harvest_clima.py` (job retomável)
- 1 req/cidade (archive daily 2023–2025), sequencial, delay 8s, backoff 60/120/240/480s em 429,
  checkpoint JSONL + `--resume`, ordem por nº de atrações (importantes primeiro), pula quem já tem tabela.
- Piloto: **20/20 ok, 0×429**. `out/etapa8_clima_mensal.jsonl` versionado (checkpoint durável).
- Coords idênticas nos 3 repos (2.579/2.579 comuns, 0 divergentes) → 1 harvest serve aos 3.
- Estimativa job completo: ~2.900 cidades × ~9s ≈ **7–8h** (retomável; próxima sessão).

## 2. Provas e validações (nada presumido)

```
tests/etapa8_test_clima.js (shim DOM + fetch mock, 3 repos): 6/6 cenários ✅
  sucesso | aqi-falha | forecast-falha | sem-vis | fr | it
etapa8_inject.py 2º run: 0 mudanças nos 3 repos (idempotente) ✅
etapa8_validate.py: 9.205 páginas, herança vs git HEAD byte a byte
  (geo-offers/geo-multi/city-attractions + counts kqzyfj/sponsored) — ERROS: NENHUM ✅
Validação cruzada do harvester vs tabela baked (ad/andorra-a-velha):
  tmax/tmin/chuva/dias_chuva bit-identical; sol_s difere 0.1s em 1 mês (float/re-análise) ✅
```

## 3. Achados da auditoria (suspeitar de tudo)

1. **BUG HERDADO (Etapa 7) — "sol (h/dia)" gravado em SEGUNDOS**: Andorra jan baked `26166.2`
   (= 26.166s = 7.27h ✅ bate com minha média em horas). As 243 tabelas existentes exibem segundos
   sob rótulo de horas. Correção planejada: novas tabelas com `sol_h` correto + passada de
   normalização ÷3600 nas antigas (próxima sub-etapa do injector de tabelas, com validador).
2. **Método Etapa 7 redescoberto por engenharia reversa e PROVADO**: chuva round0, dias round0 com
   limiar pr>1.0mm (testados 0/0.1/0.2/0.5/1.0 — só 1.0 bate), sol round1, janela 2023–2025.
3. **Auto-deploy Git→Pages: NÃO existe** (live 8.1 inalterado 30min pós-push) → deploy só via
   wrangler/API. Bloqueador mantém-se: token CF novo.
4. `city-mobilidade`/`city-busca` já cobrem parte dos itens 3/25/26/40 — próximas etapas expandem,
   não duplicam.

## 4. Publicação
- **GitHub**: `solvegrid@4f23e7a` · `nexus-ai-v2@f8bc608` · `aquitemachadinhos@928329c`.
- **Cloudflare**: ✅ PRODUÇÃO sg `7a62d4f6` · nx `d0a9a912` · aq `632e4e55` (06/09/2026, previews validados antes). Rollback Etapa 7: sg `daf74a97` · nx `02d0767d` · aq `2afccda0`. Verify_live PASS (bytes==repo, md5 clima.js, yandex 200, 404 real, sitemaps 3168/3168/2917, sids próprios). IndexNow: 7.782 URLs (HTTP 200 nos 2 endpoints × 3 sites).

## 5. Como retomar (ordem)
```bash
cd /home/user/work/repos/aquitemachadinhos   # ou solvegrid/nexus (scripts idênticos)
python3 scripts/etapa8_harvest_clima.py --resume        # job ~7-8h, retomável (Ctrl+C seguro)
# depois: injector de tabelas city-clima (plugin novo) + normalização sol ÷3600 + validate + preview + prod
# com token CF novo: wrangler pages deploy (DE DENTRO de public/) nos 3 projetos
```
