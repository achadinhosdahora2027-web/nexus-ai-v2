-- ============================================================================
-- NEXUS MATRIX — MEGA CLUSTER DE 21 APIS GLOBAIS ILIMITADAS · Etapa 21.5
-- supabase/migrations/supabase_unlimited_apis_mega_cluster.sql · 2026-09-07
-- ----------------------------------------------------------------------------
-- Otimização do reservatório public.nexus_external_data_cache para a malha
-- completa (mapas/geolocalização, economia/câmbio, SEO/conteúdo,
-- utilidades/saúde, institucional):
--   · indexação avançada por provider_slug + query_key (busca local 0 ms)
--   · BRIN em expires_at (varredura de expiração com custo mínimo)
--   · CHECK de sanidade de TTL (expires_at > fetched_at)
--   · política automatizada de limpeza: função nexus_cache_sweep() +
--     agendamento pg_cron quando disponível (senão o orquestrador varre
--     a cada run — fail-closed nos dois caminhos).
--
-- ADITIVA · IDEMPOTENTE · sem toque em ads (14.036)/rotas/outbox/fila.
-- ============================================================================

begin;

-- ---------------------------------------------------------------------------
-- 1. INDEXAÇÃO AVANÇADA (leitura dominante: cache-first por query_key e
--    varredura por provedor; BRIN atende o sweep sem inchar a tabela)
-- ---------------------------------------------------------------------------
create index if not exists idx_nexus_ext_cache_provider_query
  on public.nexus_external_data_cache (provider_slug, query_key);

create index if not exists idx_nexus_ext_cache_expires_brin
  on public.nexus_external_data_cache using brin (expires_at);

-- ---------------------------------------------------------------------------
-- 2. SANIDADE DE TTL (impede cache eterno por engano de gravação)
-- ---------------------------------------------------------------------------
do $do$
begin
  if not exists (select 1 from pg_constraint
                  where conname = 'ck_nexus_ext_cache_ttl') then
    alter table public.nexus_external_data_cache
      add constraint ck_nexus_ext_cache_ttl check (expires_at > fetched_at);
  end if;
exception when others then
  raise notice 'constraint ttl: %', sqlerrm;
end
$do$;

-- ---------------------------------------------------------------------------
-- 3. POLÍTICA DE LIMPEZA AUTOMATIZADA (sweep explícito + retorno de contagem)
-- ---------------------------------------------------------------------------
create or replace function public.nexus_cache_sweep()
returns integer language plpgsql security invoker set search_path = public as $fn$
declare v_n integer;
begin
  delete from public.nexus_external_data_cache
   where expires_at < now();
  get diagnostics v_n = row_count;
  return v_n;
end $fn$;

revoke execute on function public.nexus_cache_sweep() from public;

-- ---------------------------------------------------------------------------
-- 4. AGENDAMENTO pg_cron (quando a extensão existir no projeto). Sem pg_cron,
--    o orquestrador chama nexus_cache_sweep() a cada run — nunca acumula.
-- ---------------------------------------------------------------------------
do $do$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    begin
      perform cron.unschedule('nexus-cache-sweep-hourly');
    exception when others then null;
    end;
    perform cron.schedule('nexus-cache-sweep-hourly', '0 * * * *',
                          'select public.nexus_cache_sweep()');
    raise notice 'pg_cron: sweep horário agendado';
  else
    raise notice 'pg_cron ausente — sweep garantido pelo orquestrador a cada run (fail-closed)';
  end if;
exception when others then
  raise notice 'pg_cron: % — sweep permanece via orquestrador', sqlerrm;
end
$do$;

comment on table public.nexus_external_data_cache is
  'Matrix mega cluster: reservatório read-through das 21 APIs no-auth (cache-first · TTL por provedor · sweep automatizado).';

commit;
