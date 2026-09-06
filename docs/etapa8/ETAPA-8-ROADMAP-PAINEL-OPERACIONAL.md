# ETAPA 8 — Roadmap: de "página de cidade" para "painel operacional da cidade"

Data: 2026-09-06 · Regras: `/home/user/REGRAS-OPERACIONAIS.md` (lei do projeto)
Princípio: estrutura igual, DADOS E ENTIDADES nunca iguais. Sem fonte primária → omite, nunca inventa.

## 0. Ponto de partida (verificado em 2026-09-06, repo == produção byte a byte)

| Bloco (marcador) | Cobertura | O que já resolve (itens do pedido) |
|---|---|---|
| `city-fachada` | 16 campos | parte do item 1 |
| `city-nomes` | nomes em todos os idiomas Wikidata | parte do item 36 |
| `city-clima` | 243 cidades (mensal) + `clima.js` ao vivo | parte do item 12 |
| `city-mobilidade` | aeroportos + vizinhas + "para onde ir" | parte dos itens 3, 25, 26 |
| `city-busca` | chips em 12 categorias | parte dos itens 40, 41 |
| `painel-osm` | 26 abas ao vivo via Overpass | itens 2, 4, 6, 7, 9, 10(parcial), 11, 15, 16, 18, 19(parcial), 20(parcial), 21(parcial), 23, 24, 27, 28, 29, 30, 31, 33, 34 |
| `city-attractions` + FAQ + ItemList | 6.981 págs / 33.393 atrações | item 13, parte do 35/37 |
| `geo-offers` + `geo-multi` | 100% links testados 1 a 1 | monetização (não mexer sem auditoria) |
| Vocabulário 192 idiomas | 7.073 caixas | item 36 |

## 1. Matriz dos 42 itens → sub-etapas

| Item | Nome | Status | Fonte / estratégia | Sub-etapa |
|---|---|---|---|---|
| 1 | Informações básicas | 🟡 parcial (16 campos) | Wikidata batch (P421 fuso, P473 DDD, P281 CEP, P571 fundação…) + REST Countries (moeda, idiomas, código país) + distâncias computadas | 8.3 Fachada+ |
| 2 | Mapa completo | 🟡 parcial (26 abas) | Auditoria ao vivo Overpass + POI completo (nome+endereço+tel+site+horário+distância+rota) + camadas faltantes | 8.4 OSM v2 |
| 3 | Como chegar | 🟡 parcial | Grafo próprio (3.162 cidades c/ coords): vizinhas + rotas; OSM (rodoviária, estação, porto, ferry) ao vivo; pedágio/condição = sem fonte → links utilidade | 8.7 |
| 4 | Transporte na cidade | 🟡 parcial (aba transporte) | OSM ao vivo (metrô/trem/ônibus/VLT/BRT/bonde/ferry) + tarifas/cartões = sem fonte em lote → lacuna documentada | 8.4 |
| 5 | Dinheiro | 🔴 falta | Moeda por país (REST Countries, bake) + conversor ao vivo client-side (open.er-api.com, sem key) + OSM (bancos/ATM/câmbio) | 8.5 |
| 6 | Compras | 🟡 parcial (abas mercado/shopping) | OSM v2 (categorias finas) | 8.4 |
| 7 | Alimentação | 🟡 parcial (aba comida) | OSM v2 (cuisine=*, diet:vegetarian/vegan/halal/kosher/gluten_free) + "melhor X" = ordenação por dados, nunca ranking inventado | 8.4 |
| 8 | Hospedagem | 🟡 parcial (Booking slot + aba hotéis) | OSM (hotel/hostel/motel/camp_site) + filtros por tags reais | 8.4 |
| 9 | Saúde | 🟡 parcial (abas hospital/clinica) | OSM v2 + UPA/UBS via tags BR + planos de saúde = sem fonte → lacuna | 8.4 |
| 10 | Emergência | 🟡 parcial (aba emergencia) | **Dataset números nacionais por país (verificado)** bake/JS + OSM + delegacia da mulher (BR) | 8.6 |
| 11 | Farmácias | 🟢 aba existe | OSM v2 (dispensing, 24h via opening_hours) | 8.4 |
| 12 | Clima/tempo | 🟡 243/3.162 mensal | Harvest Open-Meteo archive p/ todas (workers 1 + backoff) + nascer/pôr-sol + UV + qualidade do ar (Air Quality API) | 8.2 |
| 13 | Turismo | 🟢 atrações Wikidata | Expandir tipos (trilhas, cachoeiras, mirantes via OSM) | 8.4 |
| 14 | Eventos | 🔴 bug: 6 stubs duplicados | **8.1: 6 páginas reescritas c/ conteúdo real único + JSON-LD Event + validador anti-regressão no CI**; depois Event Engine (Wikidata events + calendário anual por país) | 8.1 ✅ + 8.9 |
| 15 | Esportes | 🟡 aba esporte | OSM v2 (stadium, pitch, sports_centre, bicycle…) + calendário = sem fonte → lacuna | 8.4 |
| 16 | Educação | 🟡 aba educacao | OSM v2 (school/university/college/kindergarten/library) + vestibular/bolsas = sem fonte → lacuna | 8.4 |
| 17 | Empregos | 🔴 falta | Sem API gratuita em lote → **links-utilidade honestos** (buscas prontas Indeed/LinkedIn/Google Jobs por cidade) + concursos = sem fonte → lacuna. NUNCA vaga inventada | 8.10 |
| 18 | Empresas | 🟡 aba empresas | OSM v2 (office/craft/shop=*) + diretório = sem fonte → parcial | 8.4 |
| 19 | Moradia | 🟡 aba moradia | OSM (estate_agent) + preço/aluguel = sem fonte → lacuna (+links-utilidade) | 8.4/8.10 |
| 20 | Serviços digitais | 🟡 aba digital | OSM (internet_cafe, mobile_phone) + apps oficiais = curadoria por país (pequena, manual, verificada) | 8.6 |
| 21 | Serviços públicos | 🟡 aba servicos | OSM (townhall, post_office, government) + docs por país (curadoria verificada) | 8.6 |
| 22 | Internet/telefonia | 🟡 parcial | Cobertura 4G/5G = sem fonte → lacuna; operadoras/lojas/SIM via OSM + curadoria país | 8.6 |
| 23 | Utilidades | 🟡 aba utilidades | OSM v2 (recycling, charging p/ EV ✅ já em carro) + contas (água/luz/gás) = sem fonte → lacuna | 8.4 |
| 24 | Automóveis | 🟡 aba carro | OSM v2 (fuel, charging, car_wash, parking, car_rental) + preço combustível = sem fonte → lacuna | 8.4 |
| 25 | Viagens a partir | 🟡 "para onde ir" | Grafo próprio: faixas 1h/2h/3h/5h + fim de semana + praias/históricas próximas (por tipo Wikidata/OSM) | 8.7 |
| 26 | Distâncias | 🟡 parcial | Tabela multimodal computada (km haversine + tempo carro/ônibus/avião/trem estimado + fórmula declarada) | 8.7 |
| 27 | Família | 🟡 aba crianca | OSM v2 (playground, zoo, aquarium, kinder…) | 8.4 |
| 28 | Acessibilidade | 🟡 aba acessivel | OSM (wheelchair=*, tactile_paving) + auditoria de verdade nas tags | 8.4 |
| 29 | Pets | 🟡 aba vet | OSM v2 (veterinary, pet, dog_park, pet_boarding) + 24h via opening_hours | 8.4 |
| 30 | Vida noturna | 🟡 aba noite | OSM v2 (bar, pub, nightclub, events) + transporte noturno = sem fonte → parcial | 8.4 |
| 31 | Shopping/lazer | 🟡 abas shopping/cultura | OSM v2 (mall, cinema, theatre, bowling, escape_game, water_park) | 8.4 |
| 32 | Instagram/fotos | 🔴 falta | Mirantes/pôr-do-sol via OSM (viewpoint) + nascer/pôr-sol (Open-Meteo) + hashtags determinísticas (rotuladas como sugestão, não dado) | 8.8 |
| 33 | Vida social | 🟡 parcial (noite/comida) | OSM v2 (microbrewery, winery, karaoke, live_music) | 8.4 |
| 34 | Cultura/religião | 🟡 abas cultura/religiao | OSM v2 (church/mosque/synagogue/temple/shrine + denomination) | 8.4 |
| 35 | História | 🟡 fundação + atrações | Resumo Wikipedia por cidade (API summary, batch c/ backoff + cache + atribuição) + personagens/eventos = sem fonte em lote → parcial | 8.8 |
| 36 | Idiomas | 🟢 vocab + nomes | Frases úteis por país (curadoria pequena, verificada) + gírias = sem fonte → lacuna | 8.8 |
| 37 | Guia do turista | 🔴 falta | **Montado dos blocos reais**: roteiros 1/2/3/5/7 dias ordenando atrações por pageviews + clima + dinheiro + transporte (zero texto inventado) | 8.8 |
| 38 | Guia do morador | 🔴 falta | Montado dos blocos reais (bairros OSM? place=suburb ao vivo + serviços) | 8.8 |
| 39 | Guia do empreendedor | 🔴 falta | Montado (empresas/coworking OSM + setores = sem fonte → parcial honesto) | 8.8 |
| 40 | Top pesquisas | 🟡 chips estáticos | pytrends c/ cache+backoff onde houver geo (fonte+data exibidos) + fallback: intenções estruturadas (nunca "top 100" inventado) | 8.10 |
| 41 | 100 intenções base | 🟡 parcial (chips) | Motor de intenções: 100 bases × entidades reais da cidade = links internos/externos úteis | 8.10 |
| 42 | Antiduplicação | 🔴 auditar | Overlap n-gram entre páginas (amostra estratificada + pares suspeitos), JSON-LD/description únicos, validador no CI | 8.11 |

## 2. Ordem de execução (uma coisa de cada vez, sem parar)

1. **8.0 Fundação** — regras, inventário, roadmap, toolchain versionada (este arquivo). ✅
2. **8.1 Eventos: 6 stubs → conteúdo real único** — 7 arquivos isolados, fecha bug citado 2×, deploy barato. + validador anti-regressão + workflow CI.
3. **8.2 Clima 100%** — harvest mensal todas as cidades + sol/UV/ar.
4. **8.3 Fachada+** — DDD, fuso/UTC, moeda, idiomas, feriado municipal, distâncias.
5. **8.4 OSM v2** — auditoria ao vivo + POI completo + categorias finas (1 arquivo JS = todas as cidades ganham).
6. **8.5 Dinheiro ao vivo** — conversor client-side + moeda/país.
7. **8.6 País-pack** — emergência, serviços públicos/digitais, internet (datasets por país, 1 bake).
8. **8.7 Grafo de viagens** — 1h/2h/3h/5h, multimodal, fim de semana.
9. **8.8 Guias+História** — Wikipedia summaries + roteiros pageviews + guias 37/38/39.
10. **8.9 Event Engine** — Wikidata events por cidade + calendário anual país.
11. **8.10 Intenções** — trends reais + motor de intenções + links-utilidade (empregos/moradia).
12. **8.11 Antiduplicação** — auditoria overlap + correções.
13. **8.12 Higiene CI** — remover `|| true` de dinheiro, desativar Deploy Vercel aquitem, canários.

Estratégia de deploy: mudanças **client-side** (JS) = 1 arquivo por site, sem reinjetar páginas.
Mudanças **baked** (fachada, clima, guias…) = acumulam num ÚNICO injector `stage8` com 1 validação + 1 preview + 1 produção por rodada. Stubs (8.1) = deploy isolado imediato.

## 3. Toolchain (versionada nos 3 repos em `scripts/etapa8_*` + `docs/etapa8/*`)

- `scripts/etapa8_validate_events.py` — unicidade/JSON-LD/afiliados dos eventos (8.1)
- `bin-etapa8/` (workspace) → promovido a `scripts/` a cada sub-etapa: harvesters, injector, validators, `preflight.sh`, `verify_live.py`, `deploy.sh` (com guarda CWD p/ `functions/`)
- Dados: `data/etapa8_*.json` nos repos (pequenos, duráveis). Raw volumoso: workspace + checkpoint.

## 4. Bloqueador atual (2026-09-06)

Tokens Cloudflare do Env (`...fdeb30`, `...b815b6`) = **401 Invalid** (testado 2×). GitHub ✅.
Tudo segue até "deploy-ready"; publicação precisa de token CF novo (permissões Pages+read) ou deploy manual via Dashboard/`wrangler login`.
