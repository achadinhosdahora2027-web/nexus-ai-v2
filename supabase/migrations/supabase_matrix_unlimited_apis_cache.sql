-- ============================================================================
-- NEXUS MATRIX — MALHA DE DADOS ILIMITADOS: CACHE UNIFICADO NO-AUTH · 21.4
-- supabase/migrations/supabase_matrix_unlimited_apis_cache.sql · 2026-09-07
-- ----------------------------------------------------------------------------
-- Cache local inteligente para APIs públicas sem chave:
--   · awesomeapi   (economia.awesomeapi.com.br — câmbio USD/EUR×BRL p/ hedge)
--   · restcountries(restcountries.com — labels de idiomas/moedas/capitais)
--   · wikipedia    (pt.wikipedia.org REST summary — SEO cauda longa grátis)
-- Fluxo (fail-closed): cache fresco → usa local (0 ms, zero carga externa);
-- expirado → fetch externo (User-Agent: NexusGlobalBot/2.0) → upsert no
-- reservatório; falha → telemetria em nexus_cron_telemetry + contexto limpo.
--
-- PROPRIEDADES: aditiva · idempotente · sem segredos (APIs no-auth) ·
-- sem toque em ads (14.036)/rotas/outbox/fila.
-- ============================================================================

begin;

-- ---------------------------------------------------------------------------
-- 1. RESERVATÓRIO UNIFICADO (read-through cache)
-- ---------------------------------------------------------------------------
create table if not exists public.nexus_external_data_cache (
  id               uuid primary key default gen_random_uuid(),
  provider_slug    text not null check (provider_slug = lower(provider_slug)),
  query_key        text not null unique,
  payload_response jsonb not null,
  fetched_at       timestamptz not null default now(),
  expires_at       timestamptz not null
);

comment on table public.nexus_external_data_cache is
  'Matrix unlimited-data mesh: cache read-through das APIs públicas no-auth (cache-first, TTL por provedor).';

-- ---------------------------------------------------------------------------
-- 2. ÍNDICES DE PERFORMANCE (busca local em zero ms + varredura por provedor)
--    query_key já garante unicidade via constraint (índice único implícito);
--    o índice composto cobre a leitura dominante do loadContext.
-- ---------------------------------------------------------------------------
create index if not exists idx_nexus_ext_cache_provider
  on public.nexus_external_data_cache (provider_slug);

create index if not exists idx_nexus_ext_cache_provider_expiry
  on public.nexus_external_data_cache (provider_slug, expires_at desc);

-- ---------------------------------------------------------------------------
-- 3. HIGIENE (retenção leve: mantém apenas os N mais recentes por provedor
--    e purga linhas expiradas há mais de 7 dias — chamada pelo orquestrador)
-- ---------------------------------------------------------------------------
create or replace function public.nexus_cache_prune(p_keep integer default 60)
returns void language plpgsql security invoker set search_path = public as $fn$
begin
  delete from public.nexus_external_data_cache
   where expires_at < now() - interval '7 days';

  delete from public.nexus_external_data_cache c
   where c.id in (
     select id from (
       select id, row_number() over (
                partition by provider_slug order by fetched_at desc) rn
         from public.nexus_external_data_cache
     ) x where x.rn > greatest(coalesce(p_keep,60),1));
end $fn$;

revoke execute on function public.nexus_cache_prune(integer) from public;
revoke all on public.nexus_external_data_cache from anon, authenticated;

commit;
