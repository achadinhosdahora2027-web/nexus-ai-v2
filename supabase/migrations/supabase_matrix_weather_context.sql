-- ============================================================================
-- NEXUS MATRIX — CONTEXTO DE CLIMA (Open-Meteo) · Etapa 21.3 · 2026-09-07
-- ----------------------------------------------------------------------------
-- Suporte à Edge Function nexus-weather-context (lib `openmeteo`, keyless):
--   · nexus_weather_cities    = catálogo data-driven de cidades (lat/lon)
--   · nexus_weather_snapshots = séries compactas current/hourly/daily + resumo
-- O orquestrador do cluster lê os snapshots (READ-ONLY) e injeta `clima` no
-- contexto de todos os agentes — ex.: Festa do Peão de Barretos, murais de
-- achados e perdidos, agentes de trends/campanhas.
--
-- PROPRIEDADES: aditiva · idempotente · fail-closed · zero segredos (API
-- Open-Meteo não exige chave) · sem toque em ads (14.036)/rotas/outbox.
-- ============================================================================

begin;

-- ---------------------------------------------------------------------------
-- 1. CATÁLOGO DE CIDADES (data-driven: a função lê daqui)
-- ---------------------------------------------------------------------------
create table if not exists public.nexus_weather_cities (
  city_slug  text primary key check (city_slug = lower(city_slug)),
  label      text not null,
  lat        double precision not null,
  lon        double precision not null,
  enabled    boolean not null default true,
  created_at timestamptz not null default now()
);

comment on table public.nexus_weather_cities is
  'Matrix weather: cidades com snapshot climático (habilitar/desabilitar por linha).';

-- ---------------------------------------------------------------------------
-- 2. SNAPSHOTS (append-only; agentes leem o mais recente por cidade)
-- ---------------------------------------------------------------------------
create table if not exists public.nexus_weather_snapshots (
  id         bigint generated always as identity primary key,
  city_slug  text not null references public.nexus_weather_cities(city_slug) on delete cascade,
  summary    text not null default '',
  payload    jsonb not null,
  fetched_at timestamptz not null default now()
);

create index if not exists idx_nexus_weather_snap_city
  on public.nexus_weather_snapshots (city_slug, fetched_at desc);

comment on table public.nexus_weather_snapshots is
  'Matrix weather: séries current/hourly/daily compactas por cidade (Open-Meteo).';

-- ---------------------------------------------------------------------------
-- 3. SEED — cidades-alvo reais do ecossistema (Barretos = Festa do Peão;
--    São Paulo, Uberlândia e Belém = murais de achados e perdidos ativos)
-- ---------------------------------------------------------------------------
insert into public.nexus_weather_cities (city_slug, label, lat, lon) values
  ('barretos', 'Barretos/SP', -20.5578, -48.5626),
  ('saopaulo', 'São Paulo/SP', -23.5505, -46.6333),
  ('uberlandia', 'Uberlândia/MG', -18.9186, -48.2772),
  ('belem', 'Belém/PA', -1.4558, -48.5039)
on conflict (city_slug) do nothing;

-- retenção leve: mantém ~7 dias por cidade (job de limpeza idempotente)
create or replace function public.nexus_weather_prune(p_keep integer default 40)
returns void language plpgsql security invoker set search_path = public as $fn$
begin
  delete from public.nexus_weather_snapshots s
   where s.id in (
     select id from (
       select id, row_number() over (partition by city_slug order by fetched_at desc) rn
         from public.nexus_weather_snapshots
     ) x where x.rn > greatest(coalesce(p_keep,40),1));
end $fn$;

revoke execute on function public.nexus_weather_prune(integer) from public;
revoke all on public.nexus_weather_cities from anon, authenticated;
revoke all on public.nexus_weather_snapshots from anon, authenticated;

commit;
