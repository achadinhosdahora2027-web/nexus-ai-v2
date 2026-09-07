-- ============================================================================
-- ETAPA 21.10 — CLICK-STREAM & ATTRIBUTION TRACKER (malha nativa de Rastreamento
-- de Fluxo Atômico) · 2026-09-07 · custo zero · fail-closed estrito
-- ----------------------------------------------------------------------------
-- Requisitos atendidos:
--  §1 Tabela privada public.nexus_click_streams (id, route_id, user_agent,
--     country_code, device_type, session_duration, created_at)
--  §2 Índice BRIN em created_at (gravação maciça diária sem degradar a MV —
--     tabela distinta; a MV continua servida pelos índices próprios dela)
--  §3 Contador global de auditoria nexus_attribution_totals (singleton atômico)
--  §4 nexus_track_attribution_event() + gatilho em ads_clicks (rota /go):
--     país via enrichment → fallback cache ipapi (provider_slug='ipapi',
--     query_key=ip_hash); peso de conversão analítico em tempo real;
--     NÃO toca ads.weight (domínio exclusivo do W1 fn_optimize_conversion_weight)
--  §5 Privacidade: RLS on + REVOKE PUBLIC + SECURITY DEFINER
--  §6 nexus_deep_heartbeat v2 com clicks_24h e peso_atribuicao
--  §7 Catálogo: 6 componentes novos + espelho de adaptadores + GUARD >= 200
-- Idempotente · transação única · DDL 100% aditivo (ads 14.036, MV, rotas /go
-- e W1 intocados).
-- ============================================================================
begin;

-- §1 ────────────────────────── TABELA PRIVADA DE CLICK-STREAM ──────────────
create table if not exists public.nexus_click_streams (
  id               uuid primary key default gen_random_uuid(),
  route_id         uuid,                    -- anúncio da rota /go (ad_id textual → uuid; NULL se não-uuid)
  user_agent       text,
  country_code     text,                    -- ISO-2 (rota/cache ipapi)
  device_type      text,                    -- mobile | tablet | desktop | bot
  session_duration integer,                 -- segundos desde o 1º clique da sessão (cap 24h)
  created_at       timestamptz not null default now()
);

-- §2 ────────────── ÍNDICE AVANÇADO BRIN (append-only diário) ───────────────
-- BRIN: ~1 entrada por range de 32 páginas em vez de 1 tuple por linha ⇒
-- ingestão massiva de cliques com footprint mínimo; varreduras temporais
-- (janelas 24h do heartbeat) continuam baratas. Zero acoplamento com a MV.
create index if not exists idx_nexus_click_streams_created_brin
  on public.nexus_click_streams using brin (created_at)
  with (pages_per_range = 32);

-- suporte às consultas de atribuição por anúncio/rota
create index if not exists idx_nexus_click_streams_route
  on public.nexus_click_streams (route_id);

-- §3 ─────────────── CONTADOR GLOBAL DE AUDITORIA (singleton) ───────────────
create table if not exists public.nexus_attribution_totals (
  id                integer primary key default 1 check (id = 1),
  total_events      bigint  not null default 0,
  attributed_events bigint  not null default 0,   -- eventos com país resolvido
  sum_weight        numeric(14,4) not null default 0,
  last_event_at     timestamptz,
  updated_at        timestamptz not null default now()
);
insert into public.nexus_attribution_totals (id) values (1) on conflict (id) do nothing;

-- §4 ────────── GATILHO REATIVO DE MONETIZAÇÃO E INTELIGÊNCIA ───────────────
-- SECURITY DEFINER: grava nas tabelas privadas independente do papel do
-- invocador da rota /go. EXCEPTION interno ⇒ telemetria + clique preservado
-- (o redirecionamento do usuário NUNCA é interrompido).
create or replace function public.nexus_track_attribution_event()
returns trigger
language plpgsql
security definer
set search_path = 'public'
as $fn$
declare
  v_country text;
  v_device  text;
  v_weight  numeric;
  v_session integer;
  v_payload jsonb;
  v_route   uuid;
begin
  begin
    -- (a) código de país: enrichment da rota → fallback cache da IP-API
    v_country := nullif(upper(coalesce(new.country, '')), '');
    if v_country is null and coalesce(new.ip_hash, '') <> '' then
      select c.payload_response into v_payload
        from public.nexus_external_data_cache c
       where c.provider_slug = 'ipapi'
         and c.query_key = new.ip_hash
       order by c.fetched_at desc
       limit 1;
      if v_payload is not null then
        -- payload JSONB corrompido (não-objeto) ⇒ EXCEPTION controlado
        if jsonb_typeof(v_payload) is distinct from 'object' then
          raise exception 'payload ipapi corrompido (jsonb %)',
            coalesce(jsonb_typeof(v_payload)::text, 'null');
        end if;
        v_country := nullif(upper(coalesce(v_payload ->> 'countryCode', '')), '');
      end if;
    end if;

    -- (b) device_type: coluna → inferência a partir do user_agent
    v_device := lower(nullif(new.device_type, ''));
    if v_device is null then
      v_device := case
        when coalesce(new.user_agent, '') ~* '(bot|crawl|spider|slurp|bingpreview|lighthouse)' then 'bot'
        when new.user_agent ~* '(ipad|tablet|kindle|silk)' then 'tablet'
        when new.user_agent ~* '(mobile|iphone|android|opera mini)' then 'mobile'
        else 'desktop'
      end;
    end if;

    -- (c) duração da sessão: segundos desde o 1º clique da mesma session_id
    if coalesce(new.session_id, '') <> '' then
      select least(coalesce(extract(epoch from
               (coalesce(new.created_at, now()) - min(created_at)))::int, 0), 86400)
        into v_session
        from public.ads_clicks
       where session_id = new.session_id
         and created_at < coalesce(new.created_at, now());
    end if;

    -- (d) peso de conversão em tempo real (analítico; ads.weight é do W1):
    --     país (mercado publicitário) × dispositivo × intenção transacional
    v_weight := round(
        (case
           when v_country in ('US','CA','GB','AU','DE','NL','SE','NO','CH','AE') then 1.50
           when v_country = 'BR'                                               then 1.00
           when v_country is null                                               then 0.50
           else 0.75
         end)
      * (case v_device when 'mobile' then 1.20 when 'tablet' then 1.10
                      when 'bot'    then 0.00 else 1.00 end)
      * (case when lower(coalesce(new.intent, '')) = 'transactional' then 1.30
              else 1.00 end)
    , 4);

    -- (e) route_id: ad_id (text) → uuid com cast protegido (inválido ⇒ NULL)
    if coalesce(new.ad_id, '') ~*
         '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
      v_route := new.ad_id::uuid;
    end if;

    -- (f) gravação atômica no fluxo
    insert into public.nexus_click_streams
      (route_id, user_agent, country_code, device_type, session_duration, created_at)
    values
      (v_route, left(new.user_agent, 512), v_country, v_device,
       coalesce(v_session, 0), coalesce(new.created_at, now()));

    -- (g) contador global de auditoria (upsert atômico, sem corrida)
    insert into public.nexus_attribution_totals as t
      (id, total_events, attributed_events, sum_weight, last_event_at, updated_at)
    values (1, 1,
            case when v_country is not null then 1 else 0 end,
            coalesce(v_weight, 0), now(), now())
    on conflict (id) do update set
      total_events      = t.total_events + 1,
      attributed_events = t.attributed_events
                          + (case when v_country is not null then 1 else 0 end),
      sum_weight        = t.sum_weight + excluded.sum_weight,
      last_event_at     = excluded.last_event_at,
      updated_at        = now();

    return new;   -- AFTER INSERT: retorno é ignorado; contrato preservado
  exception when others then
    -- fail-closed estrito: a escrita do clique e o redirecionamento PREVALECEM;
    -- a falha (incl. payload JSONB corrompido) vira telemetria isolada
    begin
      perform public.nexus_cron_telemetry_log(
        'clickstream-attribution', 'error', null, null, 0, 0,
        'gatilho isolado (redirecionamento preservado): ' || left(sqlerrm, 160),
        jsonb_build_object('ad_id', new.ad_id, 'session_id', new.session_id,
                           'ts', coalesce(new.created_at, now())));
    exception when others then
      raise warning 'clickstream: telemetria também falhou (%) — clique preservado',
        sqlerrm;
    end;
    return new;
  end;
end $fn$;

drop trigger if exists trg_clickstream_attribution on public.ads_clicks;
create trigger trg_clickstream_attribution
  after insert on public.ads_clicks
  for each row execute function public.nexus_track_attribution_event();

-- §5 ─────────────────────── PRIVACIDADE (tabela privada) ───────────────────
revoke all on public.nexus_click_streams      from public;
revoke all on public.nexus_attribution_totals from public;
alter table public.nexus_click_streams      enable row level security;
alter table public.nexus_attribution_totals enable row level security;
-- sem policies ⇒ acesso apenas owner/service_role (bypasses RLS);
-- o gatilho SECURITY DEFINER escreve pelos privilégios do owner.

-- §6 ───────── HEARTBEAT v2: INDICADORES DE ATRIBUIÇÃO NO PRÓXIMO CICLO ────
create or replace function public.nexus_deep_heartbeat()
returns void
language plpgsql
set search_path to 'public'
as $function$
declare v_ads integer; v_mv integer; v_components integer; v_queue integer;
        v_clicks integer; v_peso numeric;
begin
  select count(*) into v_ads from public.ads where active;
  select count(*) into v_mv from public.nexus_public_offers_ordered_mv;
  select count(*) into v_components from public.nexus_deep_components where active;
  select count(*) into v_queue from public.nexus_google_index_queue
    where status = 'pending_google_crawl';
  select count(*) into v_clicks from public.nexus_click_streams
    where created_at > now() - interval '24 hours';
  select coalesce(t.sum_weight, 0) into v_peso
    from public.nexus_attribution_totals t where t.id = 1;
  perform public.nexus_cron_telemetry_log('nexus-deep','ok',null,null,
    v_components, v_mv,
    format('heartbeat: ads_ativos=%s mv_ofertas=%s componentes=%s fila_google=%s clicks_24h=%s peso_atribuicao=%s',
           v_ads, v_mv, v_components, v_queue, v_clicks, round(v_peso, 2)));
exception when others then
  perform public.nexus_cron_telemetry_log('nexus-deep','error',null,null,0,0,
    'heartbeat isolado: ' || left(sqlerrm, 160));
end $function$;

-- §7 ──────────── CATÁLOGO DE COMPONENTES + REFRESH DE ADAPTADORES ──────────
with novos(component_name, kind) as (
  values
    ('nexus_click_streams',               'table'),
    ('nexus_attribution_totals',          'table'),
    ('idx_nexus_click_streams_created_brin','index'),
    ('idx_nexus_click_streams_route',     'index'),
    ('nexus_track_attribution_event',     'function'),
    ('trg_clickstream_attribution',       'trigger')
)
insert into public.nexus_deep_components (component_name, kind, source)
select n.component_name, n.kind, '21.10'
  from novos n
 where not exists (select 1 from public.nexus_deep_components d
                    where d.component_name = n.component_name);

-- espelha adaptadores vivos do cache (catálogo auto-atualizável)
insert into public.nexus_deep_components (component_name, kind, source)
select 'adapter:' || c.provider_slug, 'adapter', 'cache'
  from (select distinct provider_slug from public.nexus_external_data_cache) c
 where not exists (select 1 from public.nexus_deep_components d
                    where d.component_name = 'adapter:' || c.provider_slug);

do $guard$
declare n integer;
begin
  select count(*) into n from public.nexus_deep_components where active;
  if n < 200 then
    raise exception 'guard 21.10: apenas % componentes ativos (mínimo 200) — rollback total da txn', n;
  end if;
end $guard$;

commit;
