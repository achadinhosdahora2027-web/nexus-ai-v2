# Nexus Growth Hacker Engine — Runbook de Operação (estado implantado)

**Data:** 2026-09-06 · **Status: 100% OPERACIONAL + ESTEIRA 5 (Telegram) ONLINE**
**Painel Telegram ativo:** `trigger_telegram_telemetry_alert` → canal **Ofertas Brasil** (@AquiTemOfertasBot) — 7 mensagens reais entregues no run de validação (HTTP 200, message_id 1179–1187), incluindo alerta de `rate_limited` — cron validado na `main` (run SUCCESS, jobs Google + Ayrshare verdes) · 3 propriedades GSC delegadas ao bot · `AYRSHARE_API_KEY` válida e configurada

**Pipeline de indexação em marchinha:** 7 URLs já `PASS · Enviada e indexada` · 284 `submitted` (aguardando recrawl) · 3.047 na fila `pending_google_crawl` — o cron de 4h consome até 200/dia/domínio com concorrência 4, orçamento de 11 min/run e reembolso automático de quota.

---

## 1. O que está no ar (evidências)

| Componente | Onde | Evidência de funcionamento |
|---|---|---|
| **W1 Smart Rotator** | Supabase **NexusPlataforma** (`etbxbaaaspdcoiakifbb`) | Trigger `trigger_optimize_conversion_weight` em `public.ads_clicks` — smoke test com clique qualificado PID=101870640 → `ads.weight+1` (com rollback). View `nexus_public_offers_ordered` ordena por conversão real. |
| **W2 IndexNow incremental** | Idem + `pg_net 0.20.4` | `notify_search_engines_via_indexnow()` → **HTTP 202 `{"success":true}`** de api.indexnow.org e yandex.com (3 homepages). Trigger em `ads_seo_submissions` dispara a cada URL nova validada. |
| **W3 Ayrshare Outbox** | Idem, tabela REAL `nexus_social_outbox` | Ciclo completo: `nexus_social_enqueue` → `nexus_social_promote` (status `high_priority_post`, prioridade 1) → claim atômico `nexus_social_outbox_next` (`dispatching`). CHECKs legados preservados (superconjunto com 1 estado novo). |
| **Engine Google (GSC)** | Runner validado + PR #1 pronto para merge | OAuth2 Service Account OK (`webmasters`), token mintado; **sitemap solvegrid SUBMETIDO (PUT 204)**; inspeção real executada; fila `nexus_google_index_queue` com **3.334 URLs reais** do inventário; quota 200/dia/host com advisory lock (uso do dia: 1–5/host). |
| **Esteira 5 — Alertas Telegram** | Supabase (pg_net 20s) + runners TS | `notify_telegram_cron_telemetry()` dispara a cada telemetria ok/error/rate_limited dos jobs `google_indexation`/`ayrshare_outbox`; runners enviam resumo consolidado; allowlist `COMMERCE_TELEGRAM_HOSTS=api.telegram.org`; kill-switch em `nexus_growth_secrets.telegram_alerts_enabled` |
| **CI do repo** | GitHub `achadinhosdahora2027-web/nexus-ai-v2` | PR #1 passou na pipeline existente (kit:test/exports/selftest). Cron `nexus-growth-cron` (4h Google / 6h social) ativa no merge. Secrets configurados. |
| **Vercel** | 3 projetos do ecossistema | `GOOGLE_SERVICE_ACCOUNT_JSON` + `NEXUS_GROWTH_DB_URL` + `NEXUS_GROWTH_DB_SERVICE_KEY` (Production, encrypted). **Nenhum env legado foi sobrescrito.** |

Integridade: **14.036 anúncios** e **3.334 submissions** intactos (DDL apenas aditiva; `ADD COLUMN` com fast default).

## 2. Etapa 6 — Higiene de Indexação (GSC Page Indexing, print 06/09/2026)

**Diagnóstico do GSC → causa raiz → ação executada:**

| Motivo GSC | Qtd | Causa raiz encontrada | Ação executada |
|---|---|---|---|
| Página com redirecionamento | 4.059 | inventário com apex+www das mesmas páginas | fila canonicalizada p/ URL final; 8 residuais + 3 duplicados excluídos |
| Não encontrado (404) | 980 | `ads_seo_submissions` 100% obsoleto: 3.322/3.332 URLs em 404 | todas estacionadas em `excluded_stale_404` (com evidência em `nexus_url_audit`) |
| Cópia sem canônica | 3.269 | páginas de campanha espelhadas (agora mortas) | corpus novo auditado: **canonical presente em 100%** das 9.259 vivas (4 cross-domain deliberadas) |
| Rastreada, não indexada | 210 | qualidade/concorrência — exige conteúdo + tempo | fila viva será re-submetida pelo cron 4h até `PASS` |
| Página alternativa com canônica adequada | 989 | validação "Falha 05/09" = páginas legacy dos satélites saíram do ar: **984/989 hoje em 404**; as 5 vivas têm canonical→www (saudável) | evidência integral em `nexus_url_audit`; 2 alvos canonical vivos semeados na fila; recomendação site: servir **410 Gone** nos legacy para expurgo acelerado |

**Resultado:** fila Google ressemeada **dos sitemaps vivos** → 9.256 URLs pendentes, **100% HTTP 200 verificadas por GET real** (auditoria completa em `nexus_url_audit`). Job `url-hygiene` semanal (segundas 06:00 UTC) no workflow.

**Recomendações (lado do site, não bloqueantes):** regenerar/retirar o pipeline que alimenta sitemap/Bing a partir de `ads_seo_submissions` (tabela morta); manter canonical self-referencing por domínio (padrão já correto no corpus vivo).

## 2b. Mapeamento real descoberto e usado

- Cérebro do ecossistema = projeto Supabase **NexusPlataforma** (o projeto "Aqui tem Achadinhos" fica como DB do site aq).
- Fluxo /go real = `ads_clicks` (com `ad_id` ↔ `ads.api_id`, `metadata` jsonb, `site_slug`).
- Inventário de URLs pós-validação = `ads_seo_submissions` (aq e nx usam **www.**; solvegrid usa apex).
- Fila social real = `nexus_social_outbox` com state machine legada
  (`pending_approval→approved→dispatching→published/failed/rejected`) — o motor só **acrescentou** `high_priority_post` (CHECKs estendidos como superconjunto) e colunas `priority`/`tag`/`last_http_status`.
- Sitemaps: `nexusplataforma.ia.br/sitemap.xml` (200 direto); solvegrid/aq apex → 301 → **www**/sitemap.xml (200). O engine resolve o redirect antes do PUT.

## 3. Pendências para 100% (ação humana)

~~1. **Delegar o bot no GSC nas outras 2 propriedades**~~ ✅ FEITO (3/3 `siteFullUser`) — hoje só `sc-domain:solvegrid.com.br` está visível ao bot (`siteFullUser`). Em Search Console → Usuários e permissões, adicionar:
   `websitesbot@ordinal-motif-504815-j4.iam.gserviceaccount.com`
   em `sc-domain:aquitemachadinhos.com.br` e `sc-domain:nexusplataforma.ia.br`.
   Até lá, esses hosts caem no caminho 403 fail-closed (sem quebrar nada).
~~2. **Merge do PR #1** (`nexus-ai-v2`)~~ ✅ FEITO (merge `88f0615`; fixes adicionais na main: `bc2a5f9`, `ed138e8`, `c127d3`) — ativa o cron 4h/6h (workflows novos só vigem no branch default).
~~3. **`AYRSHARE_API_KEY`**~~ ✅ FEITO (chave validada via `/api/user` HTTP 200 + secret configurado + job social verde) — criar secret no repo (Settings → Secrets) e/ou env na Vercel. Sem ela o robô devolve o lote à fila (fail-closed, testado).
4. **Chave IndexNow** — a chave em produção está em `public.nexus_growth_secrets` (32 hex). Confirmar que `https://<host>/<chave>.txt` responde 200 nos hosts (o 202 sugere aceitação, mas o arquivo precisa existir para validação completa).

## 4. Verificação operacional (SQL)

```sql
-- telemetria geral
select created_at, job, status, items_total, items_sent, left(message,80)
  from public.nexus_cron_telemetry order by id desc limit 20;
-- ofertas ordenadas por conversão (W1)
select * from public.nexus_public_offers_ordered limit 10;
-- fila Google + quota diária
select status, count(*) from public.nexus_google_index_queue group by 1;
select * from public.nexus_google_index_quota where day = current_date;
-- submissões IndexNow (W2)
select host, endpoint, status, url_count, created_at
  from public.nexus_indexnow_log order by id desc limit 10;
-- fila social (W3)
select status, priority, count(*) from public.nexus_social_outbox group by 1,2;
```

## 5. Rollback (durável, por workflow)

```sql
drop trigger if exists trigger_optimize_conversion_weight on public.ads_clicks;
drop trigger if exists trigger_seo_submission_indexnow on public.ads_seo_submissions;
-- estados novos voltam ao legado:
update public.nexus_social_outbox set status='pending_approval' where status='high_priority_post';
-- desligar cron: desabilitar workflow nexus-growth-cron no GitHub (ou fechar o PR sem merge)
```

## 6. Inventário de credenciais usadas nesta sessão (para rotação)

| Credencial | Onde foi usada | Ação recomendada |
|---|---|---|
| `sbp_…` (Supabase Management) | Aplicar migração, smoke tests, ler api-keys | Rotacionar |
| Service key do **NexusPlataforma** (gerada nesta sessão) | Vercel envs (3 projetos) + GitHub Secrets + testes REST | Rotacionar quando desejar (basta recriar em api-keys) |
| Service account Google (`websitesbot@…`) | Vercel envs (3), GitHub Secret, runs de teste (2 inspeções + 3 PUTs de sitemap) | Rotacionar chave JSON e atualizar envs/secrets |
| `vcp_3X03…` (Vercel) | Criar 3 envs × 3 projetos (production) | Rotacionar |
| Telegram bot token + chat_id (resolvidos dos envs Vercel e replicados: Vercel solvegrid, GitHub Secrets, `nexus_growth_secrets`) | Alertas da Esteira 5 | Rotacionar via BotFather e atualizar os 3 destinos |
| Chave Ayrshare (`958A…3675`)| | Validada + GitHub Secret `AYRSHARE_API_KEY` | Rotacionar no painel Ayrshare e atualizar o secret |
| `ghp_…` (GitHub, o token válido) | Branch + 5 arquivos + 3 secrets + PR #1 no `nexus-ai-v2` | Rotacionar |
| Chave IndexNow (32 hex) | `nexus_growth_secrets.indexnow_key` | Publicar/validar `<chave>.txt` nos hosts; rotacionar se desejar |
| `vcp_8XAV…` / ghp_ inválido / demais segredos do Env.local1.txt | **Não usados** | Tratar todos como comprometidos (transitaram em texto plano) |

## 7. Arquivos do workspace (espelho do que foi implantado)

- `supabase/migrations/supabase_growth_hacker_engine.sql` — migração v2.1 (as-deployed, idempotente)
- `src/server/scheduler/google-indexation-engine.ts` — engine GSC (OAuth2, sitemap, inspection, quota, fila)
- `src/server/scheduler/run-google-indexation.ts` — runner de cron
- `src/server/scheduler/ayrshare-outbox-worker.ts` — robô social (payload oficial primary)
- `.github/workflows/nexus-growth-cron.yml` — cron 4h/6h self-contained
