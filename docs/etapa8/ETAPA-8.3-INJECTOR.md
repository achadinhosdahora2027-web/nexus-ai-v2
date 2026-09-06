# ETAPA 8.3-INJECTOR — Bloco `city-fachada2` (ficha do país + extras da cidade)

Data: 2026-09-06 · Item do pedido: 1 (informações básicas) · Status: **LIVE nos 3 sites, verify PASS, IndexNow 200**.

## 1. O que foi injetado

Bloco único `<!-- city-fachada2 -->` após `<!-- /city-fachada -->`, 4 idiomas (pt/fr/it via TRAD + fallback pt):

| Seção | Linhas | Fonte |
|---|---|---|
| País | Moeda, Idiomas, Códigos (ISO2·ISO3·DDI), Capital, Continente, Fusos | `etapa8_paises.json` v2 (Wikidata) |
| Cidade | DDD (raw, cap 4), Fuso (IANA + UTC + DST), Apelidos (cap 6), Feriados→site oficial | jsonl cidades + `etapa8_fusos.json` + fachada |

Regras: moeda/capital/fusos/continente **excluem rank deprecated**; moeda/capital `end==null` + dedup (fallback recente + ano); idiomas preferred-first + resto alfabético (**inclui** deprecated — decisão consciente, ex. inglês EUA); DDD raw; CEP fora (fachada já tem); feriados só com href http do Site oficial; **país-por-página** (country-QID do ld → índice qid→país; conflito ld-vs-pasta → **título vence**; ld inválido → pasta); QIDs auditados vetam apelidos (16) e feriados (330); sem linhas → sem bloco.

## 2. Apply (commitado + push 06/09/2026)

| Repo | Commit | Páginas | Injetado | Atualizado (v2) | Skips |
|---|---|---|---|---|---|
| solvegrid | `4616731` | 3.156 | 2.924 | 1.142 | 232 (230 sem-fachada + breda + groninga sem-linhas) |
| nexus-ai-v2 | `f5e2e0c` | 3.156 | 2.924 | 1.142 | 232 |
| aquitemachadinhos | `e85be5e` | 2.893 | 2.676 | 866 | 217 (215 sem-fachada + breda + groninga) |

**Total: 8.524 blocos. 0 erros. Idempotente** (re-apply = 100% skip; modo update compara bytes: igual → "inalterado").
Validate PASS ×3 (regeneração byte a byte via import do plugin, 0 divergências; teto recalibrado por plugin: agora 3000 / pais 5000, max real +4.367B).
Skips sem-fachada (230/215) = páginas sem QID (215 aq) + sem fachada baked — sem ação (fora do escopo 8.3).

## 3. Auditoria de QIDs — o achado grave (herdado, NÃO introduzido aqui)

`scripts/etapa8_audit_qids.py` (labels+descriptions, 2.983 QIDs, SPARQL bloqueado 429 → API leve): **428 suspeitos** = 36 absurdos + ~392 destinos/divisões + falsos-positivos (56 `comune` IT ✅, parishes AD ✅, census-designated ✅ legítimos).

**16 QIDs errados graves** (página de cidade com QID de outra coisa — ld-city + fachada baked contaminados na Etapa 7):
`br/caxias-do-sul` (time!), `br/rio-de-janeiro` (ESTADO, não cidade!), `de/frankfurt-am-main` (cemitério!), `cn/huanggan` (pessoa!), `es/cartagena` (diocese!), `it/pescara` + `so/hargeisa` + `ru/domodedovo` (aeroportos!), `ph/cebu` (idioma!), `gb/bournemouth|brighton-hove|leeds|sunderland` (times!), `sz/ezulwini` (rio!), `nl/breda` (nome próprio!) + `nl/groninga` (sobrenome!).
Mitigação 8.3: `out/etapa8_qid_excluidos.json` (16 sem-apelido, 330 sem-feriado) — **meu bloco exibe ZERO dados falsos** (provado: Leeds sem "The Whites", Rio sem "rj.gov.br", Pescara sem site do aeroporto).
**PENDÊNCIA CRÍTICA futura**: trocar os 16 QIDs no ld-city + re-harvest fachada (ld/fachada herdados continuam errados — ex. ld de Leeds = do time, foundingDate 1919).

Casos país-por-página (6): `so/mogadiscio`→Somália Q1045 (re-harvest; pasta `so` corrigida Somalilândia→Somália, override ISO documentado); `so/hargeisa`→Somália (título vence, de jure ✅); `ru/sevastopol|simferopol`→Rússia (título vence; ld diz Ucrânia Q212 — sensível, documentado); `tj/pamir`→Tajiquistão (título vence ld Quirguistão); `zw/victoria-falls`→Zimbábue (título vence ld Zâmbia); `th/bangkok`→Tailândia (ld = Dinastia Konbaung, erro herdado absurdo → fallback pasta ✅).
Filtros deprecated que salvaram a verdade: Cuba sem CUC ✅, Angola sem 3 moedas coloniais ✅, Espanha sem América/Oceania (império, end 1898/1901) ✅, Berlim ×1 (dedup 3 claims) ✅, Palestina "Jerusalém Oriental; Ramallah" ✅, Israel "Jerusalém" ✅, Indonésia "Jacarta" ✅.

## 4. Deploy + verify + IndexNow (06/09/2026)

| Site | Preview | Prod (`--branch=main`) |
|---|---|---|
| solvegrid | `211eb81f` | `c692ce83` |
| nexus | `65f70b3a` | `f31b6fb7` |
| aquitem | `f794580a` | `74bf3e43` |

Nota: wrangler exige `CLOUDFLARE_ACCOUNT_ID` (sem ele, `/memberships` 400 code 9106).
Verify live PASS: bloco em buzios ×3, **byte==repo** (buzios ×3), Berlim ×1, Havana CUP, Madri Europa+África, Mogadíscio SO·SOM, clima.js md5 `823eedfb` (sem regressão 8.2), robots 200.
**IndexNow: 8.524 URLs, HTTP 200** em api.indexnow.org + yandex.com × 3 sites.

## 5. Arquivos (md5 idênticos nos 3)

Scripts: `etapa8_plugin_fachada2.py` (`b0923f24…`), `etapa8_inject.py` (`ee5ed555…`, modo update), `etapa8_validate.py` (`db14d06c…`, tetos por plugin + resumo por tipo), `etapa8_harvest_fachada.py` (`a9bcd2ae…`, rank/end + override so), `etapa8_audit_qids.py` (`f5f776ef…`).
Dados: `etapa8_paises.json` v2 (`e4c1d73f…`, 194, Somália Q1045), `etapa8_fusos.json` (`b615e5cd…`, 2.987 = 2.906 + 81 aq), `etapa8_qid_excluidos.json` (`e78c4512…`).
Auxiliares (work/, não commitados): `wd_audit.json` + `wd_audit.log` (428), `etapa8_paises_v1.json` (backup), `harvest_pais_v2.log`.
`js/` = pasta vazia; `va/cidade-do-vaticano` = página legada sem marcadores (fora do escopo).

## 6. Pendências (próximas etapas)

1. **Corrigir 16 QIDs** (ld-city + fachada) — etapa própria com re-harvest fachada.
2. Destinos não-cidade (~350: lagos/parques/ilhas/províncias): tipagem Schema correta (TouristAttraction etc.) + rótulo "Feriados regionais" quando couber.
3. GB fusos sem UTC± (fonte fraca, fiel); `va/` legada; pastas `js/` vazia.
4. Injector tabelas city-clima (8.11) + `--resume` full clima + normalização sol ÷3600 (bug herdado).
