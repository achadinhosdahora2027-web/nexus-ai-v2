# ETAPA 8.10 — Bloco `city-emergencia`: números nacionais de emergência

Data: 2026-09-06 · Item do pedido: 10 (emergência) e 21 (serviços públicos, parcial)
Status: **aplicado + validado + idempotente nos 3 repos; commit/push feito; PUBLICADO no Vercel (3 sites, verify byte==repo).** Deploy no host canônico Cloudflare: **pendente** (tokens CF inválidos — pendência desde a 8.1, com o usuário).

## O que é
Novo bloco `<!-- city-emergencia --> … <!-- /city-emergencia -->` em cada página-cidade (após `city-viagens`; fallback após `city-mobilidade`):
- H2 "🚨 Emergência — números nacionais" (i18n pt/en/es/fr/it/de, t() com fallback pt).
- Tabela: serviço (rótulo Wikidata, traduzido pelo idioma da página) → número(s) com link `tel:`.
- Nota de fonte: "Números oficiais de emergência do país. Fonte: Wikidata (propriedade P2852). Em dúvida, confirme na fonte local."

## Fonte e comprovabilidade (nada inventado)
- **Wikidata P2852** (emergency telephone number) em cada um dos 194 países de `out/etapa8_paises.json` (qids do harvest 8.3), com **qualificador P366 (use)** → serviço. Exemplos reais: BR 190→polícia (Q35535), 192→serviços de emergência médica (Q860447), 193→corpo de bombeiros (Q6498663), 188→linha de crise (Q1414611); FR 15+17+18+112+114; DE 110+112; JP 110+119+118 (guarda costeira); RU 01/02/03+101/102/103; US 911; AR 100/101/117/911; IN 100/101/102/108/112; AD 110+112+116+118.
- **192/194 países com números · 561 números**. `kp` (Coreia do Norte) e `ps` (Palestina) **sem P2852** → páginas desses países **sem bloco** (regra-mãe: omite, nunca fabrica). `fi`/`mt`: item Q25743523 sem rótulo numérico → pulado pela validação.
- Filtros: claims `rank=deprecated` fora; `P582` (fim) < 2026 fora (históricos); dedupe (número,service).

## Números da aplicação
| Repo | páginas com bloco | 2ª passada | `</html>` íntegro | duplicatas | tel: inválidos |
|---|---|---|---|---|---|
| solvegrid | **2.897** | 100% inalterado | ✅ | 0 | 0 |
| nexus-ai-v2 | **2.897** | 100% inalterado | ✅ | 0 | 0 |
| aquitemachadinhos | **2.651** | 100% inalterado | ✅ | 0 | 0 |
- Peso: +~1,3 KB/página (Belém 100,1 → 101,5 KB) — dentro do teto.
- Cobertura = mesma regra da 8.9 (fachada+mobilidade): sem-âncora 18 (sg/nx) / 16 (aq); sem-fachada 236/366; sem-dados 11 (kp/ps + diretórios não-país).
- Páginas com `city-viagens` sem `city-emergencia`: **exatamente** 9 (kp×4 + ps×5) — conjunto-verificação limpo.

## Auditoria (erros encontrados e corrigidos na hora)
1. **Bug do harvester — qualifiers P366 não lidos** (`itens-uso 0`): `claim_value()` esperava `mainsnak`; o snak de qualifier traz `datavalue` no topo. Corrigido com fallback `c.get("mainsnak") or c`; re-validado (BR e demais com P366 corretos).
2. **`tel:` URI com hífen** (números oficiais com hífen no Wikidata: `tel:442-020` Guiné, `tel:772-03-73` Comores): display mantém formato, `href` só dígitos (RFC 3966). 7.971 links `tel:` validados, 0 inválidos.
3. Checkpoint: diretório `work/data` criado antes de abrir (crash 1º run).
4. 429 em série na Wikidata → sleep 2s entre lotes + backoff exponencial (5/10/20/40s).
5. `public/ad/*` (páginas de Andorra, 9) têm fachada+viagens e **sem noindex** → receberam o bloco corretamente (não é erro de escopo).
6. Lacuna upstream detectada: `out/etapa8_paises.json` (8.3) **não contém `nl` (Holanda)**. Sem impacto hoje (`public/nl/*` não são páginas-cidade; 0 com viagens). Pendência 8.11: re-harvest Q55.

## Publicação
- **GitHub (rollback durável)**: `solvegrid@467b421f` · `nexus-ai-v2@6d35862` · `aquitemachadinhos@b5f35e9` (push confirmado nos 3 remotos).
- **Vercel — LIVE e público, verify byte==repo** (md5 idênticos: belem sg `5f09d33b…`, nx `75dc8aa8…`, ananindeua aq `c9c2b98d…`; `painel-osm.js` md5 == repo nos 3):
  - `https://solvegrid-aqui-tem-achadinhos.vercel.app` (deploy `ctb1a4uul`)
  - `https://nexus-ai-v2-aqui-tem-achadinhos.vercel.app` (deploy `omhxxqayc`)
  - `https://aquitemachadinhos-aqui-tem-achadinhos.vercel.app` (deploy `k5itl867u`)
  - Comando: `vercel deploy --prod --archive=tgz` (free plan limita a 5.000 upload-requests/dia → `--archive=tgz` obrigatório; erro `api-upload-free` sem ele).
  - **Mudança de configuração**: `ssoProtection` removida dos 3 projetos (estava `all_except_custom_domains` — URLs .vercel.app exigiam login). Conteúdo = o mesmo dos repos PÚBLICOS no GitHub; reversível pelo dashboard/API (`PATCH /v9/projects/{id} {"ssoProtection": {"deploymentType":"all_except_custom_domains"}}`).
- **Cloudflare (canônico) — BLOQUEADO**: os 3 tokens `cfat_*` retornam `Authentication error` (code 10000) em `/user/tokens/verify` e `/accounts/6f0b…/pages/projects`; endpoint R2 falha TLS no sandbox. Prova do estado: canônicos sg/nx/aq servem a **8.4** (fachada2 presente, `city-viagens`=0, `painel-osm.js` md5 `c3d551d4…`). **Com token CF novo**:
  ```bash
  export CLOUDFLARE_ACCOUNT_ID=6f0b265228c514158b20be2e5ea3ec96
  export CLOUDFLARE_API_TOKEN=<novo>
  # DE DENTRO de public/ (guarda functions/):
  cd public && npx -y wrangler@4.86.0 pages deploy . --project-name=solvegrid --branch=main
  cd public && npx -y wrangler@4.86.0 pages deploy . --project-name=nexus --branch=main
  cd public && npx -y wrangler@4.86.0 pages deploy . --project-name=aquitem --branch=main
  ```
  (nomes de projeto Pages a confirmar no registro das Etapas 7–8.4; 1 clonagem → deploy por projeto.)
- **IndexNow: NÃO disparado** — só após o deploy CF (os hosts canônicos ainda são 8.4; pingar agora seria avisar conteúdo desatualizado). Reaproveitar chave `a120ccc8…txt` já publicada na raiz.

## Como retomar
```bash
git clone https://github.com/achadinhosdahora2027-web/{solvegrid,nexus-ai-v2,aquitemachadinhos}.git
# clima (em andamento, retomável): python3 scripts/etapa8_harvest_clima.py --resume
# token CF novo → deploy wrangler (acima) → verify (grep city-emergencia/city-viagens) → IndexNow → atualizar relatório
```

## Pendências 8.11+
(a) deploy CF canônico (8.9+8.10) + IndexNow · (b) normalizar "sol em segundos" nas tabelas mensais (bug herdado 8.2, 236 páginas) · (c) 16 QIDs errados no ld-city (8.3) · (d) `nl` no paises.json (Q55) · (e) `city-instituicoes` (harvest_entidades.py quebrado — rótulo→QID) · (f) âncoras/FAQ das 100 intenções · (g) Vercel: reativar ssoProtection se o usuário preferir.
