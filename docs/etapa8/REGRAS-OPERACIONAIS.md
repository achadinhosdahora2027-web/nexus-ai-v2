# REGRAS OPERACIONAIS — Painel Operacional da Cidade (vigente para sempre)

Salvo em 2026-09-06. Origem: mensagem do usuário que inicia a ETAPA 8+.
Esta é a lei do projeto. Qualquer sessão futura deve ler este arquivo primeiro.

## 1. Ritmo de execução
- Fazer UMA coisa de cada vez, SEM PARAR, por ETAPAS.
- Cada etapa: planejar → executar → VERIFICAR (erros + pontos cegos) → publicar → verificar ao vivo → documentar → passar à próxima.
- Nunca pular verificação. Nunca presumir ("está no ar" só com HTTP 200 real no host real). Nunca amostrar quando der para varrer 100%.
- Suspeitar SEMPRE de tudo: re-ler o próprio diff, re-testar links, re-validar JSON-LD, re-checar PIDs/sids, re-checar canonical/robots/sitemap/404.

## 2. Padrão de qualidade
- Ultra inteligência, expert em tudo, nível ultra engenhoso.
- NUNCA inventar dado: só publica dado verificável (Wikidata, OSM, Open-Meteo, OurAirports, fontes primárias). Sem dado → OMITIR o bloco, nunca preencher com chute.
- Estrutura pode ser igual; DADOS E ENTIDADES nunca (anti-sobreposição 79–87%: cada cidade só com suas entidades reais).
- "Não deixe de fazer algo se a cidade oferece": se a fonte tem o dado/entidade, ele TEM que aparecer. Completude onde há dado; silêncio onde não há.
- Todo bloco novo com marcador próprio `<!-- nome --> ... <!-- /nome -->` (inclusive no `<head>`), inserção idempotente (reaplicar = 0 diffs).
- Nenhum texto gerado sem passar por TRAD/tt (i18n total, zero vazamento de português em página estrangeira).
- Nenhum "publicado" sem `verify_live` contra o host real (preview primeiro, produção depois).
- Teto de peso por página respeitado; JS com `node --check` + testes reais sobre shim de DOM.

## 3. Workflows, pipelines e automações
- Toda etapa ganha/renova: harvester (coleta) → injector (aplica) → validator (0 problemas) → preflight (repo==produção) → preview → verify_live → produção → verify_live → IndexNow → commit+push (rollback durável).
- Workflows do GitHub Actions sem `|| true` em passos de dinheiro/afiliado; canário `affiliate-health-check.js` tem que existir e rodar.
- Scripts idempotentes, com logs em `work/logs/`, dados versionados em `work/data/*.jsonl`, relatórios em `work/*.md`.
- Automação inteligente: backoff + concorrência baixa em APIs externas (429 é sinal, não erro a ignorar); cache local; retomada por checkpoint.

## 4. Cloudflare ("cloudfire") é o destino final
- Tudo é feito DIRETO no Cloudflare: Cloudflare Pages (Direct Upload / wrangler), hosts canônicos finais.
- Regra do wrangler: `wrangler pages deploy <dir>` resolve `functions/` a partir do CWD — rodar DE DENTRO da pasta ou o Functions some (verificação Yandex vira 308). O canário checa isso.
- Plano gratuito: Functions limitado a 100k invocações/dia — NADA de middleware em todas as requests (derruba o site). Alternativa: canonical + estático.
- Produção só no branch `main`; preview em branch `preview-*` validado antes.
- Credenciais: pode usar TODAS as que estiverem no workspace/Env. Autorização total para executar. Depois o usuário rotaciona.

## 5. Workspace
- Sempre que estiver cheio, APAGAR o desnecessário para continuar com eficiência: cópias de deploy montadas, `node_modules`, `__pycache__`, `~/.npm/_cacache`, `work/tmp/*`.
- NUNCA apagar sem ter substituto: `work/data/*.jsonl` (dados colhidos), `work/bin/*`, `work/tests/*`, `work/logs/*`, relatórios e este arquivo só saem se já estiverem no GitHub.
- `bin/build_deploy_dir.sh` tem que remontar a árvore de deploy; `npm install` em `tools/` restitui o wrangler. Scripts de deploy com guarda para fazer isso sozinhos.
- Meta: snapshot enxuto (<128MB / <10k arquivos que contam), disco com folga (>10GB livres).

## 6. SEO e indexação
- Nenhum URL novo sem necessidade; nenhum título de cidade alterado sem motivo; sitemaps regenerados a partir do DISCO; todas as URLs do sitemap = 200.
- `robots.txt`/sitemaps/canonical/404 real verificados a cada deploy.
- IndexNow (Bing/Yandex/parceiros) para todas as URLs alteradas; Google via sitemap+GSC+crawl (Google ignora IndexNow).
- `rel="sponsored noopener nofollow"` + divulgação em 100% dos cards de afiliado; zero PID cruzado; zero CID legado `8041957`; sid `{site}_{cc}_{slug}` sempre.

## 7. Escopo: os 42 itens do Painel Operacional
Ver `ETAPA-8-ROADMAP-PAINEL-OPERACIONAL.md` (matriz item → fonte de dados → etapa → status).
Ordem de execução por valor+viabilidade, um item/bloco por vez, sempre verificando.
Itens sem fonte primária em lote (ex.: custo de vida, salários, religião por cidade, 5G por cidade) ficam DOCUMENTADOS como lacuna — inventar número é pior que o vazio.

## 8. Documentação de cada etapa
Cada etapa entrega um relatório `ETAPA-X-RELATORIO.md`: o que foi publicado (contadores reais), correções que a auditoria encontrou, validação local, publicação Cloudflare + verificação ao vivo, lacunas abertas (não escondidas), limpeza do workspace, como retomar (comandos exatos na ordem).

## 9. Incidentes viram regra (apêndice vivo)
- 2026-09-06 (8.1): 3 edits paralelos no mesmo arquivo perderam 2 edits (last-write-wins silencioso).
  REGRA: edits no mesmo arquivo SEMPRE sequenciais (um bloco por vez) + re-ler e re-testar após editar.
- 2026-09-06 (8.3): `cp orig dest1 dest2` NÃO copia para 2 destinos (sintaxe inválida, falha silenciosa parcial).
  REGRA: um destino por comando `cp`/`mv` + verificar com md5/ls após sync entre repos.
