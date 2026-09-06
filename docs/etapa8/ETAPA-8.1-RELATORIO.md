# ETAPA 8.1 — Eventos: 6 stubs duplicados → conteúdo real único

Data: 2026-09-06 · Repo: aquitemachadinhos (solvegrid/nexus recebem só docs; `public/` deles intocado)
Bug original: gerador/CI escrevendo "Natal Luz de Gramado" em 6 arquivos (Etapa 5 §6.1, Etapa 6 §7).

## 1. O que foi feito

| Arquivo | Antes | Depois (verificado) |
|---|---|---|
| `oktoberfest-blumenau-2026.html` | Natal Luz (noindex) | Guia real: 7–25/out/2026, 41ª ed., Vila Germânica, desfiles Rua XV (index) |
| `cirio-de-nazare-belem-2026.html` | Natal Luz (noindex) | Guia real: procissão 11/out/2026, Trasladação 10/10, Recírio 26/10, Sé→Basílica (index) |
| `festa-do-peao-barretos-2027-ingressos.html` | Natal Luz (noindex) | Guia real: 72ª ed. 19–29/ago/2027; grade/vendas 2027 ainda não divulgadas (dito explicitamente) (index) |
| `rock-in-rio-2026.html` | Natal Luz (noindex) | Guia real: 4,5,6,7,11,12,13/set/2026, Cidade do Rock, portões 14h, ingresso digital (index) |
| `o-que-fazer-em-gramado.html` | Natal Luz (noindex) | Guia perene: Lago Negro, Mini Mundo, Rua Coberta, Snowland, Canela/Caracol, roteiro 4 dias (index) |
| `black-friday-2026-cupons.html` | Natal Luz (noindex) | Guia real: 27/nov/2026 + guia anti-golpe + Meli/Shopee (index) |
| `natal-luz-2026.html` | thin legítimo (index) | Enriquecido: 41ª ed. 22/out/2026–17/jan/2027, 88 dias, 4 espetáculos, 400+ gratuitas (index) |

Cada página: `title`/`h1`/`description`/badge únicos, seção "O essencial" (datas verificadas),
"O que você precisa saber", 2–3 cards afiliados (padrão do site, `rel sponsored nofollow` +
disclosure + pixels CJ PID 101859672), FAQ visível + `FAQPage`, JSON-LD `Event`/`SaleEvent`/
`TouristDestination` (datas ISO, url == canonical sem `.html`), `og:*`, link site oficial (HTTP 200
testado nos 5 domínios), nota "atualizado em 5/9/2026 · confirme no site oficial".

Sitemaps: `sitemap.xml` 2.911 → **2.917 URLs** (6 novas, formato idêntico); `sitemap-guias-turisticos.xml`
4 → 10 (higiene; arquivo órfão do index).

## 2. Correções que a auditoria encontrou (e que foram feitas)

1. **"Gerador" destrutivo `generate-geo-sitemaps.js`**: o HUBS comentado era o menor dos problemas.
   `generateCountriesSitemap()` reduziria `sitemap-mundial-paises.xml` (2.825 URLs reais) a 4 URLs e
   `generateMasterIndex()` reescreveria o index de 1 para 3 filhos. Hoje o CI não commita (runner
   efêmero), mas qualquer run local + commit destruiria a produção. **Travas anti-destruição**:
   as duas funções só escrevem se o arquivo não existir. Testadas em cópia isolada: index e mundial
   byte a byte preservados; guias regenerado com 21 hubs (15+6). As 6 voltaram ao HUBS.
2. **Condição de corrida em edits paralelos no mesmo arquivo**: 3 `edit_file` no mesmo `.js` no mesmo
   bloco perderam 2 edits (ferramenta disse "success" nos 3!). Só o teste de travas revelou.
   REGRA NOVA (vale p/ sempre): **edits no mesmo arquivo sempre sequenciais, nunca no mesmo bloco**,
   e sempre re-ler/verificar após editar. (Proposta de adição ao REGRAS-OPERACIONAIS.md.)
3. **JSON-LD `url` com `.html`**: padronizado sem `.html` (== canonical == og:url) nas 7 páginas.
4. **Escopo contido**: `generate-tag-seo-pages.js` (escreve `tags/*`) e `affiliate-health-check.js`
   (só relatório) auditados — não tocam eventos. Nenhum outro script escreve nesses 7 arquivos.

## 3. Validação local (antes de publicar)

```
python3 scripts/etapa8_events.py            # 7 geradas; 2º run = 0 mudanças (idempotente); --check OK
python3 scripts/etapa8_validate_events.py   # ERROS: NENHUM (unicidade, JSON-LD, afiliados, FAQ==visível)
python3 scripts/etapa8_validate_events.py --live  # ERROS: NENHUM (todos os links externos HTTP 200)
sitemap.xml: 2.917 URLs, 0 inexistentes, 0 noindex, 0 duplicadas — PASS
node --check generate-geo-sitemaps.js — OK; travas testadas em /tmp — PASS
```

CI novo `.github/workflows/etapa8-events.yml` (SEM `|| true`): gerador `--check` + validador +
sitemap íntegro + travas presentes. Falha o build em qualquer regressão.

## 4. Publicação

- **GitHub (ponto de rollback)**: commit `feat(etapa8.1)` + push (este relatório registra o hash após o push).
- **Cloudflare Pages**: ⏳ BLOQUEADO — tokens CF do Env retornam `401 Invalid` (testado 2× em 06/09).
  Pacote deploy-ready: `public/` do aquitem (7 html + 2 sitemaps). Com token novo:
  `cd repos/aquitemachadinhos/public && wrangler pages deploy . --project-name=aquitem --branch=main`
  (rodar DE DENTRO de `public/` — guarda do `functions/`).
- **Teste de auto-deploy**: após o push, aguardar ~5 min e conferir o live; se o host canônico mudar,
  o projeto tem Git integration (deploy automático); se não, só via wrangler.
- **Pós-deploy**: `verify_live` (7 URLs 200 + marcadores + JSON-LD), IndexNow das 7 URLs nos 2 endpoints.

## 5. Fontes (consultadas 05–06/09/2026)

Oktoberfest (passeios.org, coisasdaroca, ocalendario), Círio (ocalendario, passeios.org, portalbrasil),
Barretos 2027 (g1 30/08/2026 — datas; UOL/clickrodeios p/ contexto 2026), Rock in Rio 2026
(Quem/Veja/iFood 04/09/2026), Natal Luz (viajepragramado, dstourgramado, passeios.org), Black Friday
(calendário: última sexta de novembro/2026 = 27/11). Sites oficiais (HTTP 200): oktoberfestblumenau.com.br,
independentes.com.br, rockinrio.com, natalluzdegramado.com.br, ciriodenazare.com.br.

## 6. Lacunas / pendências

1. Token Cloudflare novo (Pages deploy) — com o usuário.
2. `tags/barretos-2027-ingressos-hoteis` (tag page no sitemap) pode sobrepor intenção com a nova página
   de Barretos — auditar conteúdo/consolidação na Etapa 8.11 (antiduplicação).
3. Rock in Rio 2026 termina 13/09/2026: após a data, trocar `eventStatus` p/ `EventCompleted` (ou manter
   scheduled p/ perenidade do guia — decidir com dados de tráfego).
4. Adicionar regra "edits sequenciais no mesmo arquivo" ao REGRAS-OPERACIONAIS.md.

## 7. Como retomar

```bash
cd /home/user/work/repos/aquitemachadinhos
python3 scripts/etapa8_events.py --check && python3 scripts/etapa8_validate_events.py
# com token CF novo:
export CLOUDFLARE_API_TOKEN=<novo>; cd public && npx -y wrangler@4.86.0 pages deploy . --project-name=aquitem --branch=main
# pós-deploy: curl 7 URLs + IndexNow 7 URLs (api.indexnow.org + yandex.com)
```
