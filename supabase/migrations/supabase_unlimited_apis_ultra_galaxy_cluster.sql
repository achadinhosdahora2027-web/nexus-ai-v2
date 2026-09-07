-- ============================================================================
-- NEXUS MATRIX — ULTRA GALAXY CLUSTER (+50 APIS) · Etapa 21.6 · 2026-09-07
-- supabase/migrations/supabase_unlimited_apis_ultra_galaxy_cluster.sql
-- ----------------------------------------------------------------------------
-- Prepara o reservatório public.nexus_external_data_cache para 71 APIs:
--   · compressão NATIVA LZ4 na coluna JSONB (quando PG>=14) + storage
--     EXTENDED (TOAST) — payloads massivos até 10MB sem inchar o heap;
--   · CHECK de teto de 10MB (defesa em profundidade: digests > teto são
--     rejeitados na escrita — a camada `transform` do orquestrador já reduz
--     tudo a digests mínimos antes de gravar);
--   · nexus_cache_prune v2: retenção DIFERENCIADA por provedor (TTLs
--     individualizados já vivem em expires_at; quotas por categoria de peso).
--
-- ADITIVA · IDEMPOTENTE · sem toque em ads (14.036)/rotas/outbox/fila.
-- ============================================================================

begin;

-- ---------------------------------------------------------------------------
-- 1. PAYLOADS MASSIVOS: TOAST EXTENDED + COMPRESSÃO NATIVA LZ4 (PG>=14)
-- ---------------------------------------------------------------------------
alter table public.nexus_external_data_cache
  alter column payload_response set storage extended;

do $do$
begin
  alter table public.nexus_external_data_cache
    alter column payload_response set compression lz4;
  raise notice 'compressão LZ4 ativa em payload_response';
exception when others then
  raise notice 'LZ4 indisponível (%) — permanece pglz padrão (correto p/ JSONB)', sqlerrm;
end
$do$;

-- ---------------------------------------------------------------------------
-- 2. TETO DE 10MB POR PAYLOAD (sanidade; digests normais: < 2KB)
-- ---------------------------------------------------------------------------
do $do$
begin
  if not exists (select 1 from pg_constraint
                  where conname = 'ck_nexus_ext_cache_payload_10mb') then
    alter table public.nexus_external_data_cache
      add constraint ck_nexus_ext_cache_payload_10mb
      check (octet_length(payload_response::text) <= 10485760);
  end if;
exception when others then
  raise notice 'teto 10MB: %', sqlerrm;
end
$do$;

-- ---------------------------------------------------------------------------
-- 3. PRUNE v2 — TTLs individualizados (expires_at por linha) + quota
--    diferenciada por peso de provedor (datasets-brutos guardam pouco;
--    digests leves guardam mais histórico útil aos agentes)
-- ---------------------------------------------------------------------------
drop function if exists public.nexus_cache_prune(integer);
create function public.nexus_cache_prune(p_keep integer default 60)
returns integer language plpgsql security invoker set search_path = public as $fn$
declare v_n integer := 0; v_batch integer;
begin
  -- 3.1 expirados além da janela de graça de 7 dias: remoção definitiva
  delete from public.nexus_external_data_cache
   where expires_at < now() - interval '7 days';
  get diagnostics v_batch = row_count; v_n := v_n + v_batch;

  -- 3.2 quota por categoria de peso (TTL individual já respeitado em expires_at)
  delete from public.nexus_external_data_cache c
   where c.id in (
     select id from (
       select id,
              row_number() over (partition by provider_slug
                                 order by fetched_at desc) rn,
              case when provider_slug in
                        ('census','mledoze','ripestat','openfoodfacts','pokeapi')
                   then 3                                      -- datasets pesados
                   when provider_slug in
                        ('awesomeapi','frankfurter','opensky','tfl','httpbin',
                         'isitup','ipapi','nasa','usgs','sunrise_sunset')
                   then 12                                     -- alta frequência
                   else greatest(coalesce(p_keep,60),12)        -- padrão
              end quota
         from public.nexus_external_data_cache
     ) x where x.rn > x.quota);
  get diagnostics v_batch = row_count; v_n := v_n + v_batch;

  return v_n;
end $fn$;

revoke execute on function public.nexus_cache_prune(integer) from public;

comment on function public.nexus_cache_prune(integer) is
  'v2: purga por TTL individualizado (expires_at) com quotas por peso de provedor';

commit;
