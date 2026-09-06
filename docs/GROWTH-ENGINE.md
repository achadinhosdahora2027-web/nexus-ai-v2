# Nexus Growth Hacker Engine — Runbook de Operação (estado implantado)

**Data:** 2026-09-06 · **Status: IMPLANTADO E VERIFICADO EM PRODUÇÃO**

---

## 1. O que está no ar (evidências)

| Componente | Onde | Evidência de funcionamento |
|---|---|---|
| **W1 Smart Rotator** | Supabase **NexusPlataforma** (`etbxbaaaspdcoiakifbb`) | Trigger `trigger_optimize_conversion_weight` em `public.ads_clicks` — smoke test com clique qualificado PID=101870640 → `ads.weight+1` (com rollback). View `nexus_public_offers_ordered` ordena por conversão real. |
| **W2 IndexNow incremental** | Idem + `pg_net 0.20.4` | `notify_search_engines_via_indexnow()` → **HTTP 202 `{"success":true}`** de api.indexnow.org e yandex.com (3 homepages). Trigger em `ads_seo_submissions` dispara a cada URL nova validada. |
| **W3 Ayrshare Outbox** | Idem, tabela REAL `nexus_social_outbox` | Ciclo completo: `nexus_social_enqueue` → `nexus_social_promote` (status `high_priority_post`, prioridade 1) → claim atômico `nexus_social_outbox_next` (`dispatching`). CHECKs legados preservados (superconjunto com 1 estado novo). |
| **Engine Google (GSC)** | Runner validado + PR #1 pronto para merge | OAuth2 Service Account OK (`webmasters`), token mintado; **sitemap solvegrid SUBMETIDO (PUT 204)**; inspeção real executada; fila `nexus_google_index_queue` com **3.334 URLs reais** do inventário; quota 200/dia/host com advisory lock (uso do dia: 1–5/host). |
| **CI do repo** | GitHub `achadinhosdahora2027-web/nexus-ai-v2` | PR #1 passou na pipeline existente (kit:test/exports/selftest). Cron `nexus-growth-cron` (4h Google / 6h social) ativa no merge. Secrets configurados. |
| **Vercel** | 3 projetos do ecossistema | `GOOGLE_SERVICE_ACCOUNT_JSON` + `NEXUS_GROWTH_DB_URL` + `NEXUS_GROWTH_DB_SERVICE_KEY` (Production, encrypted). **Nenhum env legado foi sobrescrito.** |

Integridade: **14.036 anúncios** e **3.334 submissions** intactos (DDL apenas aditiva; `ADD COLUMN` com fast default).

## 2. Mapeamento real descoberto e usado

- Cérebro do ecossistema = projeto Supabase **NexusPlataforma** (o projeto "Aqui tem Achadinhos" fica como DB do site aq).
- Fluxo /go real = `ads_clicks` (com `ad_id` ↔ `ads.api_id`, `metadata` jsonb, `site_slug`).
- Inventário de URLs pós-validação = `ads_seo_submissions` (aq e nx usam **www.**; solvegrid usa apex).
- Fila social real = `nexus_social_outbox` com state machine legada
  (`pending_approval→approved→dispatching→published/failed/rejected`) — o motor só **acrescentou** `high_priority_post` (CHECKs estendidos como superconjunto) e colunas `priority`/`tag`/`last_http_status`.
- Sitemaps: `nexusplataforma.ia.br/sitemap.xml` (200 direto); solvegrid/aq apex → 301 → **www**/sitemap.xml (200). O engine resolve o redirect antes do PUT.

## 3. Pendências para 100% (ação humana)

1. **Delegar o bot no GSC nas outras 2 propriedades** — hoje só `sc-domain:solvegrid.com.br` está visível ao bot (`siteFullUser`). Em Search Console → Usuários e permissões, adicionar:
   `websitesbot@ordinal-motif-504815-j4.iam.gserviceaccount.com`
   em `sc-domain:aquitemachadinhos.com.br` e `sc-domain:nexusplataforma.ia.br`.
   Até lá, esses hosts caem no caminho 403 fail-closed (sem quebrar nada).
2. **Merge do PR #1** (`nexus-ai-v2`) — ativa o cron 4h/6h (workflows novos só vigem no branch default).
3. **`AYRSHARE_API_KEY`** — criar secret no repo (Settings → Secrets) e/ou env na Vercel. Sem ela o robô devolve o lote à fila (fail-closed, testado).
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
| `ghp_…` (GitHub, o token válido) | Branch + 5 arquivos + 3 secrets + PR #1 no `nexus-ai-v2` | Rotacionar |
| Chave IndexNow (32 hex) | `nexus_growth_secrets.indexnow_key` | Publicar/validar `<chave>.txt` nos hosts; rotacionar se desejar |
| `vcp_8XAV…` / ghp_ inválido / demais segredos do Env.local1.txt | **Não usados** | Tratar todos como comprometidos (transitaram em texto plano) |

## 7. Arquivos do workspace (espelho do que foi implantado)

- `supabase/migrations/supabase_growth_hacker_engine.sql` — migração v2.1 (as-deployed, idempotente)
- `src/server/scheduler/google-indexation-engine.ts` — engine GSC (OAuth2, sitemap, inspection, quota, fila)
- `src/server/scheduler/run-google-indexation.ts` — runner de cron
- `src/server/scheduler/ayrshare-outbox-worker.ts` — robô social (payload oficial primary)
- `.github/workflows/nexus-growth-cron.yml` — cron 4h/6h self-contained
