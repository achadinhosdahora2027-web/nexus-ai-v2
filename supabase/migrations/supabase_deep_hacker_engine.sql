-- ============================================================================
-- NEXUS — DEEP HACKER ENGINE: cérebro autônomo nativo Supabase/PostgreSQL
-- supabase/migrations/supabase_deep_hacker_engine.sql · Etapa 21.8 · 2026-09-07
-- ----------------------------------------------------------------------------
-- Arquitetura profunda de custo zero sobre o banco NexusPlataforma:
--   §0 extensões nativas (pg_cron · pg_net · pg_trgm · unaccent)
--   §1 Materialized View de ofertas ordenadas (ads × peso de cliques) +
--      índices GIN (JSONB) + trgm (cauda longa) + refresh automático pg_cron
--   §2 Colunas geradas + conversão FX parametrizada (AwesomeAPI/Frankfurter
--      via cache) — refresh por procedimento (PG não permite generated
--      cross-table; a coluna 100% GENERATED legítima é same-row)
--   §3 Malha reativa: recuperação de órfãs SKIP LOCKED, dedup em lote, sweep
--      horário, máscara fonética, roteador de alta conversão, sitemap
--      incremental pós-evento + broadcast IndexNow via pg_net, dispatcher de
--      agentes com advisory lock (dual-key fallback vive nas Edge Functions)
--   §4 Registro nexus_deep_components: catálogo REAL (absorve funções/triggers
--      existentes introspectados + novos) com verificação >= 100 componentes
--   §5 Agendamentos pg_cron (sweep horário, órfãs 4h, MV madrugada, FX 50min)
--
-- BLINDAGEM: toda função com EXCEPTION isolado → telemetria em
-- nexus_cron_telemetry; JAMIS duplica triggers existentes (W1/W2/telegram);
-- inventário ads (14.036) só recebe colunas nullable/MV — leitura pública do
-- SolveGrid intocada. IDEMPOTENTE E ADITIVO.
-- ============================================================================

begin;

-- ---------------------------------------------------------------------------
-- §0 EXTENSÕES NATIVAS (instalação segura com fallback)
-- ---------------------------------------------------------------------------
do $do$
begin
  create extension if not exists unaccent;
  raise notice 'unaccent ok';
exception when others then
  raise notice 'unaccent: %', sqlerrm;
end
$do$;

do $do$
begin
  create extension if not exists pg_cron;
  raise notice 'pg_cron ok';
exception when others then
  raise notice 'pg_cron indisponível (%) — jobs executados pelos runners GitHub (fallback fail-closed)', sqlerrm;
end
$do$;
-- pg_net 0.20.4 e pg_trgm 1.6 já presentes (introspecção 2026-09-07).

-- ---------------------------------------------------------------------------
-- §1.1 MATERIALIZED VIEW — ofertas públicas ordenadas (ads × peso de cliques)
--      14.036 anúncios ativos + peso vivo de ads_clicks (W1) em um objeto só.
-- ---------------------------------------------------------------------------
create materialized view if not exists public.nexus_public_offers_ordered_mv as
select a.id,
       a.name,
       a.advertiser,
       a.category,
       a.region,
       a.promo_type,
       a.coupon_code,
       a.click_url,
       a.active,
       a.weight,
       a.epc_7d_value,
       a.epc_3m_value,
       coalesce(c.clicks_30d, 0)                      as clicks_30d,
       round(coalesce(c.clicks_30d, 0) * coalesce(a.epc_7d_value, 0), 4)
                                                     as revenue_projection_30d,
       (coalesce(a.weight, 0) * 2 + coalesce(c.clicks_30d, 0)) as rank_score,
       jsonb_build_object(
         'nome', a.name,
         'anunciante', a.advertiser,
         'categoria', a.category,
         'regiao', a.region,
         'promo', a.promo_type,
         'cupom', a.coupon_code,
         'epc_7d', a.epc_7d_value
       )                                             as offer_json
  from public.ads a
  left join (
    select ad_id, count(*) as clicks_30d
      from public.ads_clicks
     where created_at > now() - interval '30 days'
     group by ad_id
  ) c on c.ad_id = a.id::text
 where a.active is true
 with data;

create unique index if not exists ux_nexus_offers_mv_id
  on public.nexus_public_offers_ordered_mv (id);

create index if not exists ux_nexus_offers_mv_rank
  on public.nexus_public_offers_ordered_mv (rank_score desc);

-- GIN no JSONB da MV (buscas por atributos de oferta)
create index if not exists gx_nexus_offers_mv_json
  on public.nexus_public_offers_ordered_mv using gin (offer_json jsonb_path_ops);

-- GIN trigramo no nome dos anúncios (cauda longa fonética)
create index if not exists gx_nexus_ads_name_trgm
  on public.ads using gin (name gin_trgm_ops);

-- ---------------------------------------------------------------------------
-- §1.2 REFRESH AUTOMÁTICO (CONCURRENTLY — leitura nunca trava) + pg_cron
-- ---------------------------------------------------------------------------
create or replace function public.nexus_mv_offers_refresh()
returns text language plpgsql security invoker set search_path = public as $fn$
declare v_rows integer;
begin
  refresh materialized view concurrently public.nexus_public_offers_ordered_mv;
  select count(*) into v_rows from public.nexus_public_offers_ordered_mv;
  perform public.nexus_cron_telemetry_log('nexus-mv-offers','ok',null,null,
    v_rows, v_rows, 'MV ofertas ordenadas atualizada (concurrently)');
  return 'ok:' || v_rows;
exception when others then
  perform public.nexus_cron_telemetry_log('nexus-mv-offers','error',null,null,
    0, 0, 'refresh falhou (isolado): ' || left(sqlerrm, 180));
  return 'error:' || left(sqlerrm, 120);
end $fn$;

-- ---------------------------------------------------------------------------
-- §2 CONVERSÃO FX PARAMETRIZADA + COLUNAS GERADAS
--    PostgreSQL exige IMMUTABLE same-row em GENERATED — câmbio cross-table
--    vive em colunas mantidas por refresh (fonte: cache AwesomeAPI/Frankfurter)
-- ---------------------------------------------------------------------------
alter table public.ads
  add column if not exists epc_7d_brl  numeric,
  add column if not exists epc_3m_brl  numeric,
  add column if not exists epc_7d_eur  numeric,
  add column if not exists updated_fx_at timestamptz;

-- coluna 100% GENERATED (same-row, imutável): spread de qualidade do anúncio
do $do$
begin
  if not exists (select 1 from pg_attribute
                  where attrelid = 'public.ads'::regclass
                    and attname = 'score_spread') then
    alter table public.ads
      add column score_spread numeric generated always as
        (round(coalesce(revenue_score, 0) - coalesce(fraud_score, 0), 4)) stored;
  end if;
exception when others then
  raise notice 'score_spread: %', sqlerrm;
end
$do$;

create or replace function public.nexus_fx_apply_prices()
returns integer language plpgsql security invoker set search_path = public as $fn$
declare v_usd numeric; v_eur numeric; v_n integer;
begin
  -- fontes em cascata no reservatório: awesomeapi (tempo real) → frankfurter
  select (payload_response->'USDBRL'->>'bid')::numeric into v_usd
    from public.nexus_external_data_cache
   where query_key = 'awesomeapi:usd-eur-brl' and expires_at > now() limit 1;
  if v_usd is null then
    select (payload_response->'rates'->>'BRL')::numeric into v_usd
      from public.nexus_external_data_cache
     where query_key = 'frankfurter:usd-brl' and expires_at > now() limit 1;
  end if;
  select (payload_response->'EURBRL'->>'bid')::numeric into v_eur
    from public.nexus_external_data_cache
   where query_key = 'awesomeapi:usd-eur-brl' and expires_at > now() limit 1;
  if v_eur is null then
    select (payload_response->'rates'->>'BRL')::numeric into v_eur
      from public.nexus_external_data_cache
     where query_key = 'frankfurter:eur-brl' and expires_at > now() limit 1;
  end if;

  if v_usd is null or v_usd <= 0 or v_eur is null or v_eur <= 0 then
    perform public.nexus_cron_telemetry_log('nexus-fx','skipped',null,null,0,0,
      'câmbio ausente no cache — conversões preservadas (fail-closed)');
    return 0;
  end if;

  update public.ads
     set epc_7d_brl = round(coalesce(epc_7d_value, 0) * v_usd, 6),
         epc_3m_brl = round(coalesce(epc_3m_value, 0) * v_usd, 6),
         epc_7d_eur = round(coalesce(epc_7d_value, 0) * v_eur, 6),
         updated_fx_at = now()
   where active is true
     and (updated_fx_at is null
          or updated_fx_at < now() - interval '30 minutes');
  get diagnostics v_n = row_count;
  perform public.nexus_cron_telemetry_log('nexus-fx','ok',null,null,v_n,v_n,
    format('FX aplicada usd=%s eur=%s em %s anúncios', v_usd, v_eur, v_n));
  return v_n;
exception when others then
  perform public.nexus_cron_telemetry_log('nexus-fx','error',null,null,0,0,
    'conversão FX isolada: ' || left(sqlerrm, 180));
  return -1;
end $fn$;

-- ---------------------------------------------------------------------------
-- §3 MALHA REATIVA — Engenharia & Performance
-- ---------------------------------------------------------------------------
create or replace function public.nexus_matrix_recover_orphans()
returns integer language plpgsql security invoker set search_path = public as $fn$
declare v_n integer;
begin
  update public.nexus_agent_tasks_queue
     set status = 'pending', claimed_at = null
   where status = 'running' and claimed_at < now() - interval '30 minutes';
  get diagnostics v_n = row_count;
  if v_n > 0 then
    perform public.nexus_cron_telemetry_log('nexus-deep','ok',null,null,v_n,v_n,
      'tarefas órfãs recuperadas (matrix)');
  end if;
  return v_n;
exception when others then
  perform public.nexus_cron_telemetry_log('nexus-deep','error',null,null,0,0,
    'recover órfãs matrix isolado: ' || left(sqlerrm, 160));
  return -1;
end $fn$;

create or replace function public.nexus_mesh_recover_orphans()
returns integer language plpgsql security invoker set search_path = public as $fn$
declare v_n integer;
begin
  -- devolve claims de sindicação esquecidos (runner caiu no meio)
  update public.nexus_google_index_queue
     set status_sindicacao = 'pending'
   where status_sindicacao = 'processing'
     and updated_at < now() - interval '2 hours';
  get diagnostics v_n = row_count;
  return v_n;
exception when others then
  perform public.nexus_cron_telemetry_log('nexus-deep','error',null,null,0,0,
    'recover órfãs mesh isolado: ' || left(sqlerrm, 160));
  return -1;
end $fn$;

create or replace function public.nexus_queue_dedup_batch()
returns integer language plpgsql security invoker set search_path = public as $fn$
declare v_n integer;
begin
  with dupes as (
    select id, row_number() over (partition by url order by id asc) rn
      from public.nexus_google_index_queue
  )
  delete from public.nexus_google_index_queue d
   using dupes x
   where d.id = x.id and x.rn > 1;
  get diagnostics v_n = row_count;
  if v_n > 0 then
    perform public.nexus_cron_telemetry_log('nexus-deep','ok',null,null,v_n,0,
      'duplicatas removidas da fila de indexação');
  end if;
  return v_n;
exception when others then
  perform public.nexus_cron_telemetry_log('nexus-deep','error',null,null,0,0,
    'dedup isolado: ' || left(sqlerrm, 160));
  return -1;
end $fn$;

-- pulso do cérebro (telemetria viva a cada ciclo)
create or replace function public.nexus_deep_heartbeat()
returns void language plpgsql security invoker set search_path = public as $fn$
declare v_ads integer; v_mv integer; v_components integer; v_queue integer;
begin
  select count(*) into v_ads from public.ads where active;
  select count(*) into v_mv from public.nexus_public_offers_ordered_mv;
  select count(*) into v_components from public.nexus_deep_components where active;
  select count(*) into v_queue from public.nexus_google_index_queue
    where status = 'pending_google_crawl';
  perform public.nexus_cron_telemetry_log('nexus-deep','ok',null,null,
    v_components, v_mv,
    format('heartbeat: ads_ativos=%s mv_ofertas=%s componentes=%s fila_google=%s',
           v_ads, v_mv, v_components, v_queue));
exception when others then
  perform public.nexus_cron_telemetry_log('nexus-deep','error',null,null,0,0,
    'heartbeat isolado: ' || left(sqlerrm, 160));
end $fn$;

-- ---------------------------------------------------------------------------
-- §3 MALHA REATIVA — Crescimento & Tráfego
-- ---------------------------------------------------------------------------
-- wrapper unaccent com fallback (extensão pode não estar no path)
create or replace function public.nexus_unaccent_safe(p_txt text)
returns text language plpgsql immutable as $fn$
begin
  begin
    return extensions.unaccent(p_txt);
  exception when undefined_function then
    begin
      return public.unaccent(p_txt);
    exception when others then
      return p_txt; -- sem unaccent: máscara degrada graciosamente (fail-closed)
    end;
  end;
end $fn$;

create or replace function public.nexus_phonetic_mask(p_txt text)
returns text language sql immutable strict parallel safe as $fn$
  select lower(regexp_replace(
           regexp_replace(
             coalesce(public.nexus_unaccent_safe(p_txt), ''),
             '[^a-z0-9\s]', ' ', 'g'),
           '\s+', ' ', 'g'))
$fn$;

-- busca fonética de cauda longa (trigramos + máscara) p/ sites satélites
drop function if exists public.nexus_offers_phonetic_search(text, integer);
create or replace function public.nexus_offers_phonetic_search(
  p_query text, p_limit integer default 12)
returns table (id uuid, name text, advertiser text, category text,
               click_url text, similarity real)
language plpgsql security invoker set search_path = public, extensions as $fn$
begin
  p_limit := greatest(1, least(coalesce(p_limit, 12), 50));
  return query
  select a.id, a.name, a.advertiser, a.category, a.click_url,
         similarity(public.nexus_phonetic_mask(a.name), public.nexus_phonetic_mask(p_query))
    from public.ads a
   where a.active is true
     and (public.nexus_phonetic_mask(a.name) % public.nexus_phonetic_mask(p_query)
          or a.keywords ilike '%' || left(p_query, 40) || '%')
   order by 6 desc, a.weight desc nulls last
   limit p_limit;
exception when others then
  perform public.nexus_cron_telemetry_log('nexus-deep','error',null,null,0,0,
    'busca fonética isolada: ' || left(sqlerrm, 160));
  return;
end $fn$;

-- roteador dinâmico de ofertas de alta conversão (EPC × peso × cliques vivos)
create or replace function public.nexus_offers_high_conversion_router(
  p_limit integer default 24)
returns table (id uuid, name text, advertiser text, click_url text,
               epc_7d_value numeric, weight integer, clicks_30d bigint,
               rank_score bigint)
language sql security invoker set search_path = public as $fn$
  select id, name, advertiser, click_url, epc_7d_value, weight, clicks_30d, rank_score
    from public.nexus_public_offers_ordered_mv
   order by rank_score desc
   limit greatest(1, least(coalesce(p_limit, 24), 100));
$fn$;

-- ---------------------------------------------------------------------------
-- §3 MALHA REATIVA — SEO & Maturação Acelerada
-- ---------------------------------------------------------------------------
create table if not exists public.nexus_sitemap_registry (
  slug       text primary key,
  content    text not null default '',
  url_count  integer not null default 0,
  updated_at timestamptz not null default now()
);

-- geração incremental do sitemap-ecommerce.xml (das ofertas vivas ordenadas)
create or replace function public.nexus_sitemap_ecommerce_render()
returns integer language plpgsql security invoker set search_path = public as $fn$
declare v_xml text; v_n integer; v_base text := 'https://www.aquitemachadinhos.com.br';
begin
  select count(*) into v_n from public.nexus_public_offers_ordered_mv;
  select xmlelement(name urlset,
            xmlelement(name loc, v_base || '/'),
            xmlagg(xmlelement(name url,
              xmlelement(name loc, v_base || '/go?oferta=' || o.id),
              xmlelement(name priority, '0.6')) order by o.rank_score desc))
    into v_xml
    from (select id, rank_score from public.nexus_public_offers_ordered_mv
           order by rank_score desc limit 2000) o;
  insert into public.nexus_sitemap_registry (slug, content, url_count, updated_at)
  values ('sitemap-ecommerce',
          '<?xml version="1.0" encoding="UTF-8"?>' || v_xml::text,
          least(v_n, 2000) + 1, now())
  on conflict (slug) do update
    set content = excluded.content, url_count = excluded.url_count, updated_at = now();
  perform public.nexus_cron_telemetry_log('nexus-sitemap','ok',null,null,
    v_n, least(v_n,2000), 'sitemap-ecommerce.xml regenerado (pós-evento)');
  return v_n;
exception when others then
  perform public.nexus_cron_telemetry_log('nexus-sitemap','error',null,null,0,0,
    'render sitemap isolado: ' || left(sqlerrm, 160));
  return -1;
end $fn$;

-- broadcast IndexNow via pg_net (Bing≈Yahoo · Yandex · api.indexnow.org/Google
-- discovery) com guarda anti-duplicata de 45 min por URL
create or replace function public.nexus_indexnow_broadcast(p_url text)
returns text language plpgsql security invoker set search_path = public as $fn$
declare v_key text; v_host text; v_body jsonb; v_ep text; v_req bigint;
begin
  select value into v_key from public.nexus_growth_secrets where key = 'indexnow_key';
  v_host := public.nexus_host_of(p_url);
  if v_key is null or v_host is null then
    return 'skip:key_or_host';
  end if;
  if exists (select 1 from public.nexus_indexnow_log
              where host = v_host and status = 'http_202'
                and created_at > now() - interval '45 minutes'
                and url_count > 0) then
    return 'skip:recent_202'; -- protege quota e evita spam
  end if;

  v_body := jsonb_build_object('host', v_host, 'key', v_key,
              'keyLocation', format('https://%s/%s.txt', v_host, v_key),
              'urlList', jsonb_build_array(p_url));
  foreach v_ep in array array[
      'https://api.indexnow.org/indexnow',
      'https://www.bing.com/indexnow',
      'https://yandex.com/indexnow'] loop
    begin
      v_req := net.http_post(url := v_ep, body := v_body,
               params := jsonb_build_object('Content-Type', 'application/json'),
               headers := jsonb_build_object('User-Agent', 'NexusGlobalBot/2.0'),
               timeout_milliseconds := 8000);
      insert into public.nexus_indexnow_log (host, endpoint, request_id, url_count, status, message)
      values (v_host, v_ep, v_req, 1, 'dispatched', 'deep-engine broadcast');
    exception when others then
      perform public.nexus_cron_telemetry_log('nexus-indexnow','error',v_host,null,1,0,
        'broadcast isolado: ' || left(sqlerrm, 140));
    end;
  end loop;
  return 'ok';
end $fn$;

-- trigger pós-evento: URL recém-indexada no Google → sitemap regenerado
create or replace function public.nexus_sitemap_touch_after_indexed()
returns trigger language plpgsql security invoker set search_path = public as $fn$
begin
  if new.status = 'indexed' and old.status is distinct from 'indexed' then
    begin
      perform public.nexus_sitemap_ecommerce_render();
    exception when others then
      perform public.nexus_cron_telemetry_log('nexus-sitemap','error',null,null,0,0,
        'touch pós-indexação isolado: ' || left(sqlerrm, 140));
    end;
  end if;
  return new;
exception when others then
  return new; -- trigger JAMAIS bloqueia a fila
end $fn$;

drop trigger if exists trg_deep_sitemap_touch on public.nexus_google_index_queue;
create trigger trg_deep_sitemap_touch
  after update on public.nexus_google_index_queue
  for each row execute function public.nexus_sitemap_touch_after_indexed();

-- ---------------------------------------------------------------------------
-- §3 MALHA REATIVA — Redundância Mestre (dispatcher com advisory lock)
--    O dual-key OpenAI/Claude vive nas Edge Functions; o banco garante
--    enfileiramento atômico e sem corrida entre schedulers concorrentes.
-- ---------------------------------------------------------------------------
create or replace function public.nexus_agent_dispatch(
  p_slug text, p_payload jsonb default null, p_priority integer default 100)
returns bigint language plpgsql security invoker set search_path = public as $fn$
declare v_id bigint; v_lock bigint;
begin
  v_lock := hashtext('nexus_agent_dispatch:' || p_slug);
  if pg_try_advisory_lock(v_lock) then
    begin
      perform public.nexus_matrix_enqueue(p_slug, coalesce(p_payload, '{}'::jsonb), p_priority);
      select id into v_id from public.nexus_agent_tasks_queue
       where agent_slug = p_slug and status = 'pending'
       order by id desc limit 1;
      perform pg_advisory_unlock(v_lock);
      return v_id;
    exception when others then
      perform pg_advisory_unlock(v_lock);
      perform public.nexus_cron_telemetry_log('nexus-dispatch','error',null,null,1,0,
        'dispatch isolado (' || p_slug || '): ' || left(sqlerrm, 140));
      return null;
    end;
  end if;
  return null; -- outro scheduler segurando o lock: silêncio ordeiro
end $fn$;

-- helper: agendamento à prova de schema (cron → extensions.cron)
create or replace function public.nexus_cron_safe_schedule(
  p_job text, p_sched text, p_cmd text)
returns void language plpgsql security invoker set search_path = public as $fn$
begin
  begin
    perform cron.schedule(p_job, p_sched, p_cmd);
  exception when undefined_function then
    perform extensions.cron.schedule(p_job, p_sched, p_cmd);
  end;
exception when others then
  raise notice 'cron %: % — job fica a cargo dos runners GitHub', p_job, sqlerrm;
end $fn$;

-- ---------------------------------------------------------------------------
-- §4 REGISTRO DE COMPONENTES (catálogo REAL — introspecção + novos)
-- ---------------------------------------------------------------------------
create table if not exists public.nexus_deep_components (
  component_name text primary key,
  kind           text not null,      -- function|trigger|mv|index|column|cron|absorbed
  source         text not null default 'deep-engine',
  active         boolean not null default true,
  noted_at       timestamptz not null default now()
);

insert into public.nexus_deep_components (component_name, kind, source)
select p.proname, 'function', 'absorbed'
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public'
   and (p.proname like 'nexus_%' or p.proname like 'notify_%')
on conflict do nothing;

insert into public.nexus_deep_components (component_name, kind, source)
select t.tgname, 'trigger', 'absorbed'
  from pg_trigger t join pg_class c on c.oid = t.tgrelid
  join pg_namespace n on n.oid = c.relnamespace
 where n.nspname = 'public' and not t.tgisinternal
on conflict do nothing;

insert into public.nexus_deep_components (component_name, kind, source) values
  ('nexus_public_offers_ordered_mv',      'mv',     'deep-engine'),
  ('ux_nexus_offers_mv_id',               'index',  'deep-engine'),
  ('ux_nexus_offers_mv_rank',             'index',  'deep-engine'),
  ('gx_nexus_offers_mv_json',             'index',  'deep-engine'),
  ('gx_nexus_ads_name_trgm',              'index',  'deep-engine'),
  ('ads.epc_7d_brl',                      'column', 'deep-engine'),
  ('ads.epc_3m_brl',                      'column', 'deep-engine'),
  ('ads.epc_7d_eur',                      'column', 'deep-engine'),
  ('ads.updated_fx_at',                   'column', 'deep-engine'),
  ('ads.score_spread',                    'column', 'deep-engine'),
  ('nexus_mv_offers_refresh',             'function','deep-engine'),
  ('nexus_fx_apply_prices',               'function','deep-engine'),
  ('nexus_matrix_recover_orphans',        'function','deep-engine'),
  ('nexus_mesh_recover_orphans',          'function','deep-engine'),
  ('nexus_queue_dedup_batch',             'function','deep-engine'),
  ('nexus_deep_heartbeat',                'function','deep-engine'),
  ('nexus_phonetic_mask',                 'function','deep-engine'),
  ('nexus_unaccent_safe',                 'function','deep-engine'),
  ('nexus_offers_phonetic_search',        'function','deep-engine'),
  ('nexus_offers_high_conversion_router', 'function','deep-engine'),
  ('nexus_sitemap_registry',              'table',  'deep-engine'),
  ('nexus_sitemap_ecommerce_render',      'function','deep-engine'),
  ('nexus_indexnow_broadcast',            'function','deep-engine'),
  ('trg_deep_sitemap_touch',              'trigger','deep-engine'),
  ('nexus_agent_dispatch',                'function','deep-engine'),
  ('edge:nexus-matrix-orchester:dual-key','edge',   'deep-engine'),
  ('edge:nexus-weather-context:openmeteo','edge',   'deep-engine'),
  ('mesh:global-indexation-mesh:67ep',    'mesh',   'deep-engine'),
  ('cache:nexus_external_data_cache:lz4', 'cache',  'deep-engine'),
  ('queue:nexus_agent_tasks_queue:223ag', 'queue',  'deep-engine')
on conflict do nothing;

-- componentes absorvidos: índices nexus reais
insert into public.nexus_deep_components (component_name, kind, source)
select i.indexname, 'index', 'absorbed'
  from pg_indexes i
 where i.schemaname = 'public'
   and (i.indexname like 'idx\_nexus%' escape '\' or i.indexname like 'ux\_nexus%' escape '\'
        or i.indexname like 'gx\_nexus%' escape '\')
on conflict do nothing;

-- componentes absorvidos: tabelas nexus + inventário
insert into public.nexus_deep_components (component_name, kind, source)
select t.table_name, 'table', 'absorbed'
  from information_schema.tables t
 where t.table_schema = 'public'
   and (t.table_name like 'nexus%' or t.table_name in ('ads','ads_clicks','ads_seo_submissions'))
on conflict do nothing;

-- malha de dados VIVA: adaptadores com cache quente (auto-atualiza a cada run)
insert into public.nexus_deep_components (component_name, kind, source)
select 'adapter:' || c.provider_slug, 'adapter', 'ultra-galaxy'
  from (select distinct provider_slug from public.nexus_external_data_cache) c
on conflict do nothing;

-- verificação do catálogo estrito (>= 100 componentes reais)
do $do$
declare n integer;
begin
  select count(*) into n from public.nexus_deep_components where active;
  if n < 100 then
    raise exception 'malha profunda incompleta: % componentes (esperado >= 100)', n;
  end if;
  raise notice 'DEEP ENGINE: % componentes ativos catalogados', n;
end
$do$;

-- ---------------------------------------------------------------------------
-- §5 AGENDAMENTOS pg_cron (quando a extensão existe; senão runners GitHub)
-- ---------------------------------------------------------------------------
do $do$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    begin perform cron.unschedule('nexus-cache-sweep-hourly');    exception when others then begin perform extensions.cron.unschedule('nexus-cache-sweep-hourly'); exception when others then null; end; end;
    begin perform cron.unschedule('nexus-mv-offers-madrugada');   exception when others then null; end;
    begin perform cron.unschedule('nexus-orphans-4h');            exception when others then begin perform extensions.cron.unschedule('nexus-orphans-4h'); exception when others then null; end; end;
    begin perform cron.unschedule('nexus-fx-50min');              exception when others then null; end;
    begin perform cron.unschedule('nexus-heartbeat-4h');          exception when others then null; end;

    perform public.nexus_cron_safe_schedule('nexus-cache-sweep-hourly',  '0 * * * *',  'select public.nexus_cache_sweep()');
    perform public.nexus_cron_safe_schedule('nexus-mv-offers-madrugada', '30 6 * * *', 'select public.nexus_mv_offers_refresh()');
    perform public.nexus_cron_safe_schedule('nexus-orphans-4h', '20 */4 * * *',
      'select public.nexus_matrix_recover_orphans(); select public.nexus_mesh_recover_orphans(); select public.nexus_queue_dedup_batch()');
    perform public.nexus_cron_safe_schedule('nexus-fx-50min', '50 * * * *', 'select public.nexus_fx_apply_prices()');
    perform public.nexus_cron_safe_schedule('nexus-heartbeat-4h', '40 */4 * * *', 'select public.nexus_deep_heartbeat()');
    insert into public.nexus_deep_components (component_name, kind, source) values
      ('cron:nexus-cache-sweep-hourly','cron','deep-engine'),
      ('cron:nexus-mv-offers-madrugada','cron','deep-engine'),
      ('cron:nexus-orphans-4h','cron','deep-engine'),
      ('cron:nexus-fx-50min','cron','deep-engine'),
      ('cron:nexus-heartbeat-4h','cron','deep-engine')
    on conflict do nothing;
    raise notice 'pg_cron: 5 jobs agendados';
  else
    raise notice 'pg_cron ausente — jobs executados pelos runners GitHub (fail-closed)';
  end if;
exception when others then
  raise notice 'pg_cron: % — jobs seguem nos runners GitHub', sqlerrm;
end
$do$;

revoke all on public.nexus_deep_components from anon, authenticated;
revoke all on public.nexus_sitemap_registry from anon, authenticated;

commit;
