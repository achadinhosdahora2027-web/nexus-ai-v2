# ETAPA 8.4 — OSM v2 (painel de mapa em camadas)

Data: 2026-09-06 · Itens do pedido: 2, 4, 6–9, 11, 13, 15, 16, 18, 19, 23, 24, 27–31, 33, 34 · Status: **LIVE nos 3 sites, testes 26/26, verify PASS**.

## 1. O que mudou (1 arquivo JS — todas as cidades ganham, zero inject)

`public/js/painel-osm.js` v1 (28 KB) → v2 (58 KB), md5 `c3d551d4b0…` idêntico nos 3 repos. **Queries Overpass byte-idênticas à v1** (CATS extraído por script, prova de igualdade no build — risco zero no mapa).

| Recurso | Detalhe |
|---|---|
| POI rico | +e-mail (mailto), diet (🥗🌱halal/kosher/sem glúten), stars ★, denomination, dispensing 💊, takeaway/delivery/drive/outdoor, fee 🎟️/🆓, rooms; wheelchair traduzido (total/parcial/não); cuisine limpa (`pizza;italian`); endereço +`addr:place/unit/neighbourhood` |
| Chips por aba | 20 abas com 2–5 sub-filtros (ex. comida: pizza/lanches/café/veg/bar; religião: ✝️☪️✡️🕉️; carro: posto/EV/estacionamento/oficina/aluguel) — **client-side, sem nova consulta** |
| Badge 24h | `opening_hours=24/7` → 🕐 24 h (única afirmação de horário; sem parser de "aberto agora" — nunca afirmar sem certeza) |
| Auditoria | Cabeçalho com "X com telefone · Y com site · Z com horário" (transparência da cobertura comunitária) |
| Ordenação | 📍 distância (default) + 📋 ficha completa (placar de tags reais, declarado — "melhor X" por dados, nunca inventado) |
| Correções v1 | `rel="sponsored"` indevido em links orgânicos → `nofollow`; UTF-8 correto (v1 sem acentos); cache versionada `p7osm2:` (v1/v2 não se misturam); i18n pt/en/fr/it completo |

## 2. Testes (reais, não checklist)

- `tests/etapa8_test_osm.js` (novo, nos 3): jsdom + mock Overpass, **26/26 PASS ×3** (ordem distância, chips filtram sem refetch, toggle ficha, badge 24h, mailto, stars, diet, denomination, cache `p7osm2`, estado por aba).
- `node --check` OK + grep ES5 puro (público amplo, sem transpiler).
- Overpass real via curl: HTTP 200, `count.total=24` farmácias Sé-SP, nomes reais (Drogasil, Droga Raia ✅) — formato bate com o parser.
- **Teste contra o JS servido pelo preview: 26/26 PASS** (prova funcional do deploy).

## 3. Deploy + verify (06/09/2026)

Preview sg `0b814c7c` (byte==repo + teste funcional) → prod: sg `544f4f0e` · nx `5392f326` · aq `34abf1b2`.
Verify live: `painel-osm.js` md5 == repo nos 3 domínios; `fachada2` intacta (sem regressão 8.3). **Sem IndexNow** (nenhum HTML mudou — só o .js).
Commits: sg `da79c67c` · nx `f6ed7786` · aq `38d254f8` (+ docs).
Nota rotina: snapshot truncou workspace de novo → re-clone via `achadinhosdahora2027-web` (dono confirmado via API), wrangler 4.86.0 reinstalado, `CLOUDFLARE_ACCOUNT_ID` obrigatório.

## 4. Pendências (futuro)

1. Parser "aberto agora" (opening_hours simples: `Mo-Fr HH:MM-HH:MM`) — só com suite de testes dedicada; hoje só 24/7 afirma.
2. `rel="ugc"` avaliar para links comunitários (hoje nofollow).
3. Brand/operator e redes sociais do POI (pulados — poluição/valor baixo).
4. 16 QIDs errados (8.3) continuam pendentes — etapa própria.
