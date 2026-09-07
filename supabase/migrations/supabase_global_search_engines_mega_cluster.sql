-- ============================================================================
-- NEXUS — MALHA GLOBAL DE INDEXAÇÃO MULTI-ENGINES (100+ endpoints) · 21.7
-- supabase/migrations/supabase_global_search_engines_mega_cluster.sql
-- ----------------------------------------------------------------------------
-- Estende a esteira Google (200/dia/host, intocada) para Bing/Yahoo/Naver/
-- Seznam/Qwant (IndexNow), pings XML-RPC e agregadores de sitemap/RSS:
--   · ads_seo_submissions  +4 colunas de status por buscador (aditivo)
--   · nexus_google_index_queue +4 colunas idem (fila do runner)
--   · RPC nexus_get_next_indexation_batch() — claim atômico FOR UPDATE
--     SKIP LOCKED, lotes de até 100 URLs/run sem colisão com o engine Google
--     (que continua dono único do GSC e do status 'pending_google_crawl').
--
-- ADITIVA · IDEMPOTENTE · fail-closed · zero segredo hardcoded (a chave
-- IndexNow segue em nexus_growth_secrets, lida em runtime).
-- ============================================================================

begin;

-- ---------------------------------------------------------------------------
-- 1. STATUS TRACKEADO POR BUSCADOR — inventário (ads_seo_submissions)
-- ---------------------------------------------------------------------------
alter table public.ads_seo_submissions
  add column if not exists status_google     text not null default 'pending';
alter table public.ads_seo_submissions
  add column if not exists status_bing_yahoo text not null default 'pending';
alter table public.ads_seo_submissions
  add column if not exists status_yandex     text not null default 'pending';
alter table public.ads_seo_submissions
  add column if not exists status_sindicacao text not null default 'pending';

create index if not exists idx_ads_seo_sind
  on public.ads_seo_submissions (status_sindicacao, submitted_at desc);

-- ---------------------------------------------------------------------------
-- 2. STATUS TRACKEADO POR BUSCADOR — fila do runner (nexus_google_index_queue)
--    (o engine Google NÃO lê estas colunas: colisão impossível)
-- ---------------------------------------------------------------------------
alter table public.nexus_google_index_queue
  add column if not exists status_google     text not null default 'pending';
alter table public.nexus_google_index_queue
  add column if not exists status_bing_yahoo text not null default 'pending';
alter table public.nexus_google_index_queue
  add column if not exists status_yandex     text not null default 'pending';
alter table public.nexus_google_index_queue
  add column if not exists status_sindicacao text not null default 'pending';

create index if not exists idx_ngiq_sind
  on public.nexus_google_index_queue (status_sindicacao, priority asc, created_at asc);

-- ---------------------------------------------------------------------------
-- 3. CLAIM ATÔMICO DA MALHA — até 100 URLs/run, SKIP LOCKED (sem colisão
--    entre runs concorrentes e SEM interferir no claim do engine Google)
-- ---------------------------------------------------------------------------
drop function if exists public.nexus_get_next_indexation_batch(integer);
create function public.nexus_get_next_indexation_batch(
  p_limit integer default 100)
returns table (v_id bigint, v_url text, v_host text, v_priority integer)
language plpgsql security invoker set search_path = public as $fn$
begin
  return query
  update public.nexus_google_index_queue q
     set status_sindicacao = 'processing', updated_at = now()
   where q.id in (
     select c.id from public.nexus_google_index_queue c
      where c.status_sindicacao = 'pending'
        and c.status in ('pending_google_crawl', 'processing', 'indexed', 'url_is_indexed')
        and (c.attempts < 20 or c.attempts is null)
      order by c.priority asc nulls last, c.created_at asc
      limit greatest(1, least(coalesce(p_limit, 100), 100))
      for update skip locked)
  returning q.id, q.url, q.host, q.priority;
end $fn$;

-- ---------------------------------------------------------------------------
-- 4. FECHAMENTO DO CICLO DA MALHA — marca sindicação concluída por URL
--    (preserva o status do engine Google; atualiza inventário espelho)
-- ---------------------------------------------------------------------------
create or replace function public.nexus_mesh_finalize(
  p_url text, p_bing_yahoo text default 'done', p_yandex text default 'done',
  p_message text default null)
returns void language plpgsql security invoker set search_path = public as $fn$
begin
  update public.nexus_google_index_queue
     set status_sindicacao = 'done',
         status_bing_yahoo = coalesce(p_bing_yahoo, 'done'),
         status_yandex     = coalesce(p_yandex, 'done'),
         status_google     = 'delegated_google_engine',
         updated_at = now()
   where url = p_url;

  update public.ads_seo_submissions
     set status_sindicacao = 'done',
         status_bing_yahoo = coalesce(p_bing_yahoo, 'done'),
         status_yandex     = coalesce(p_yandex, 'done'),
         status_google     = 'delegated_google_engine',
         last_ping = now(),
         ping_count = coalesce(ping_count, 0) + 1
   where url = p_url;
exception when others then
  raise notice 'mesh_finalize(%): %', p_url, sqlerrm; -- nunca derruba o runner
end $fn$;

revoke execute on function public.nexus_get_next_indexation_batch(integer) from public;
revoke execute on function public.nexus_mesh_finalize(text,text,text,text) from public;

comment on function public.nexus_get_next_indexation_batch(integer) is
  'Malha global: claim atômico SKIP LOCKED de até 100 URLs p/ sindicação multi-engine';

commit;
