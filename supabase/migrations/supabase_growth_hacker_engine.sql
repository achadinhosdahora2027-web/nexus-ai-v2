-- ============================================================================
-- NEXUS GROWTH HACKER ENGINE — edição PRODUÇÃO (v2.1, como implantado)
-- Alvo: Supabase NexusPlataforma · 2026-09-06 · estado: APLICADO E VERIFICADO
-- ============================================================================
-- Este arquivo reflete EXATAMENTE o estado implantado no banco de produção,
-- incluindo tudo o que a introspecção do schema real revelou:
--
--   · ads_clicks        = log real de cliques /go (trigger W1 anexado)
--   · ads               = catálogo real (14.036) — coluna `weight` reutilizada
--   · nexus_ecommerce_routes = rotas ecommerce (+click_weight/weight_updated_at)
--   · nexus_social_outbox    = fila social REAL — CHECKs estendidos aditivamente
--     com UM novo estado ('high_priority_post'); state machine legado preservado
--     (pending_approval→approved→dispatching→published/failed/rejected)
--   · ads_seo_submissions = inventário real de URLs pós-validação (trigger W2)
--   · pg_net 0.20.4     = net.http_post(url, body JSONB, params, headers,
--                         timeout_milliseconds) — SEM argumento content_type
--
-- SMOKE TESTS EXECUTADOS EM PRODUÇÃO (2026-09-06):
--   W1 ✅ clique sintético qualificado (PID=101870640) → ads.weight+1 (com rollback)
--   W2 ✅ 3 URLs → api.indexnow.org + yandex.com → HTTP 202 {"success":true}
--   W3 ✅ enqueue → promote(high_priority_post) → claim(dispatching) → cleanup
--
-- PROPRIEDADES: fail-closed · idempotente · zero segredos hardcoded ·
--               DDL apenas aditiva nas tabelas legadas.
-- ============================================================================

begin;

-- ---------------------------------------------------------------------------
-- 0. EXTENSÃO pg_net (nativa, custo zero)
-- ---------------------------------------------------------------------------
do $do$
begin
  create extension if not exists pg_net;
  raise notice 'pg_net garantida';
exception when others then
  raise notice 'pg_net indisponível: % — W2 permanece fail-closed', sqlerrm;
end
$do$;

-- ---------------------------------------------------------------------------
-- 0.1 HELPERS DE URL (apex sem barra final — padrão Etapa 5)
-- ---------------------------------------------------------------------------
create or replace function public.nexus_host_of(p_url text)
returns text language sql immutable strict as $fn$
  select nullif(
           lower(
             split_part(
               split_part(
                 split_part(
                   split_part(split_part(p_url,'#',1),'?',1),
                   '//', 2),
                 '/', 1),
               ':', 1)),
           '')
$fn$;

create or replace function public.nexus_clean_url(p_url text)
returns text language plpgsql immutable strict as $fn$
declare
  v text := btrim(coalesce(p_url,'')); v_path text;
begin
  if v = '' then return null; end if;
  v := split_part(split_part(v,'#',1),'?',1);
  v := regexp_replace(v,'^https?://','','i');
  v_path := case when position('/' in v) > 0 then rtrim(substr(v,position('/' in v)),'/') else '' end;
  return 'https://' || public.nexus_host_of('https://' || v) || v_path;
end
$fn$;

revoke execute on function public.nexus_host_of(text) from public;
revoke execute on function public.nexus_clean_url(text) from public;

-- ---------------------------------------------------------------------------
-- 0.2 CONFIGURAÇÃO — hosts validados (apex+www, inventário real) e cofre
-- ---------------------------------------------------------------------------
create table if not exists public.nexus_growth_hosts (
  host text primary key check (host = lower(host)),
  site_slug text not null default '',
  sitemap_path text not null default '/sitemap.xml',
  active boolean not null default true,
  created_at timestamptz not null default now()
);

insert into public.nexus_growth_hosts (host, site_slug) values
  ('solvegrid.com.br','solvegrid'),
  ('www.solvegrid.com.br','solvegrid'),
  ('aquitemachadinhos.com.br','aquitemachadinhos'),
  ('www.aquitemachadinhos.com.br','aquitemachadinhos'),
  ('nexusplataforma.ia.br','nexus'),
  ('www.nexusplataforma.ia.br','nexus')
on conflict (host) do update set site_slug = excluded.site_slug;

create table if not exists public.nexus_growth_secrets (
  key text primary key,
  value text not null,
  updated_at timestamptz not null default now(),
  note text not null default ''
);
insert into public.nexus_growth_secrets (key, value, note) values
  ('indexnow_key','REPLACE_COM_A_CHAVE_ROTACIONADA_DE_PRODUCAO',
   'Chave IndexNow (8-128 hex). Publicar <chave>.txt na raiz dos hosts.')
on conflict (key) do nothing;

create table if not exists public.nexus_official_pids (
  pid text primary key,
  site_slug text not null,
  host text not null,
  active boolean not null default true
);
insert into public.nexus_official_pids (pid, site_slug, host) values
  ('101870640','solvegrid','solvegrid.com.br'),
  ('101870639','nexus','nexusplataforma.ia.br'),
  ('101859672','aquitemachadinhos','aquitemachadinhos.com.br')
on conflict (pid) do update set site_slug = excluded.site_slug, host = excluded.host;

-- ---------------------------------------------------------------------------
-- 0.3 TELEMETRIA SANITIZADA
-- ---------------------------------------------------------------------------
create table if not exists public.nexus_cron_telemetry (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  job text not null,
  target_host text,
  status text not null default 'ok',
  http_status integer,
  items_total integer not null default 0,
  items_sent integer not null default 0,
  message text,
  payload jsonb
);
create index if not exists idx_nexus_cron_telemetry_job
  on public.nexus_cron_telemetry (job, created_at desc);

create or replace function public.nexus_cron_telemetry_log(
  p_job text, p_status text default 'ok', p_host text default null,
  p_http_status integer default null, p_items_total integer default 0,
  p_items_sent integer default 0, p_message text default null, p_payload jsonb default null)
returns void language plpgsql security invoker set search_path = public as $fn$
begin
  begin
    insert into public.nexus_cron_telemetry
      (job, target_host, status, http_status, items_total, items_sent, message, payload)
    values (left(coalesce(p_job,'unknown'),60),
            nullif(lower(split_part(coalesce(p_host,'-'),':',1)),''),
            left(coalesce(p_status,'ok'),40), p_http_status,
            greatest(coalesce(p_items_total,0),0), greatest(coalesce(p_items_sent,0),0),
            left(regexp_replace(coalesce(p_message,''),
                  '(key|token|code|client_secret|password|access_token)=[^&\s]+','\1=REDACTED','gi'),500),
            coalesce(p_payload,'{}'::jsonb));
  exception when others then
    raise warning 'telemetry: falha (%) — fail-closed', sqlerrm;
  end;
end
$fn$;
revoke execute on function public.nexus_cron_telemetry_log
  (text,text,text,integer,integer,integer,text,jsonb) from public, anon, authenticated;

-- ============================================================================
-- WORKFLOW 1 — SMART ROTATOR (gatilho na tabela REAL de cliques /go)
-- ============================================================================
alter table public.nexus_ecommerce_routes
  add column if not exists click_weight numeric(12,4) not null default 1.0000;
alter table public.nexus_ecommerce_routes
  add column if not exists weight_updated_at timestamptz;
create index if not exists idx_nexus_routes_click_weight
  on public.nexus_ecommerce_routes (active, click_weight desc nulls last);

create or replace function public.fn_optimize_conversion_weight()
returns trigger language plpgsql security definer set search_path = public as $fn$
declare
  v_url text := coalesce(new.click_url, '');
  v_meta jsonb := coalesce(new.metadata, '{}'::jsonb);
  v_pid text;
  v_sid text;
begin
  begin
    -- PID oficial no URL ou metadata (detecção estrita: os 3 PIDs da Etapa 8)
    v_pid := substring(v_url from '(101859672|101870640|101870639)');
    if v_pid is null
       and coalesce(v_meta ->> 'pid','') in ('101859672','101870640','101870639') then
      v_pid := v_meta ->> 'pid';
    end if;
    if v_pid is null then return new; end if;
    if not exists (select 1 from public.nexus_official_pids p
                   where p.pid = v_pid and p.active) then
      return new;
    end if;

    -- (a) catálogo ads (14.036): api_id identifica o anúncio clicado
    if new.ad_id is not null then
      update public.ads a
         set weight = coalesce(a.weight,0) + 1
       where a.api_id = new.ad_id;
    end if;

    -- (b) rota ecommerce pelo source_product_id
    v_sid := coalesce(nullif(v_meta ->> 'source_product_id',''), new.ad_id);
    if v_sid is not null then
      update public.nexus_ecommerce_routes r
         set click_weight = coalesce(r.click_weight,1.0) + 1,
             weight_updated_at = now()
       where r.source_product_id = v_sid and r.active = true;

      if exists (select 1 from public.nexus_ecommerce_routes r
                  where r.source_product_id = v_sid and r.active = true
                    and r.click_weight >= 25) then
        perform public.nexus_cron_telemetry_log('conversion_weight','ok',
          new.site_slug, 200, 1, 1,
          format('produto %s em marco de conversao (>=25) — elegivel a nexus_social_promote()', v_sid));
      end if;
    end if;

    perform public.nexus_cron_telemetry_log('conversion_weight','ok',
      new.site_slug, 200, 1, 1,
      format('clique qualificado PID=%s · ads.weight/click_weight incrementados', v_pid));
  exception when others then
    raise warning 'W1: skip fail-closed — %', sqlerrm;
    perform public.nexus_cron_telemetry_log('conversion_weight','error',new.site_slug,
      null,1,0,'clique NAO pontuado (rota /go intacta): ' || left(sqlerrm,180));
  end;
  return new;
end
$fn$;

do $do$
begin
  drop trigger if exists trigger_optimize_conversion_weight on public.ads_clicks;
  create trigger trigger_optimize_conversion_weight
    after insert on public.ads_clicks
    for each row execute function public.fn_optimize_conversion_weight();
  raise notice 'W1: trigger_optimize_conversion_weight ATIVO em public.ads_clicks';
exception when others then
  raise warning 'W1: gatilho nao criado: %', sqlerrm;
end
$do$;

-- Renderização pública ordenada por conversão real (colunas reais de ads)
create or replace view public.nexus_public_offers_ordered as
select a.api_id, a.advertiser, a.name, a.click_url, a.category,
       coalesce(a.weight, 0) as click_weight, a.revenue_score, a.active
from public.ads a
where a.active is not false
order by coalesce(a.weight,0) desc, a.revenue_score desc nulls last;
comment on view public.nexus_public_offers_ordered is
  'W1: ofertas ordenadas por peso de conversao real (ads.weight) — consumir na renderizacao publica';

create or replace function public.nexus_top_offers(p_limit integer default 24)
returns setof public.nexus_public_offers_ordered
language sql stable security invoker set search_path = public as $fn$
  select * from public.nexus_public_offers_ordered
  limit greatest(1, least(coalesce(p_limit,24), 500))
$fn$;
revoke execute on function public.nexus_top_offers(integer) from public, anon, authenticated;

-- ============================================================================
-- WORKFLOW 2 — INDEXNOW INCREMENTAL (pg_net) + gatilho no inventário real
-- ============================================================================
create table if not exists public.nexus_indexnow_log (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  host text not null,
  endpoint text not null,
  request_id bigint,
  url_count integer not null default 0,
  status text not null default 'submitted',
  message text
);
create index if not exists idx_nexus_indexnow_log_host
  on public.nexus_indexnow_log (host, created_at desc);

create or replace function public.notify_search_engines_via_indexnow(
  p_urls text[] default null)
returns integer language plpgsql security invoker set search_path = public as $fn$
declare
  v_key text; v_host text; v_clean text[]; v_body jsonb; v_req bigint;
  v_sent integer := 0; v_total integer := 0; v_msg text;
  v_endpoint text;
begin
  begin
    if p_urls is null or array_length(p_urls,1) is null then return 0; end if;
    v_total := array_length(p_urls,1);

    select value into v_key from public.nexus_growth_secrets where key='indexnow_key';
    if v_key is null or length(trim(v_key)) < 16 or v_key like 'REPLACE%' then
      perform public.nexus_cron_telemetry_log('indexnow','skipped',null,null,v_total,0,
        'chave indexnow nao configurada — envio abortado (fail-closed)');
      return 0;
    end if;

    for v_host in
      select distinct public.nexus_host_of(u) h from unnest(p_urls) u
      where public.nexus_host_of(u) in (select host from public.nexus_growth_hosts where active)
    loop
      select array_agg(distinct c) into v_clean
        from (select public.nexus_clean_url(u) c from unnest(p_urls) u
              where public.nexus_host_of(u) = v_host) t where c is not null;
      continue when v_clean is null or array_length(v_clean,1) is null;

      v_body := jsonb_build_object('host', v_host, 'key', v_key,
                  'keyLocation', format('https://%s/%s.txt', v_host, v_key),
                  'urlList', to_jsonb(v_clean));
      foreach v_endpoint in array array['https://api.indexnow.org/indexnow','https://yandex.com/indexnow']
      loop
        v_req := null; v_msg := null;
        begin
          -- pg_net 0.20.x: body é JSONB; não existe parâmetro content_type
          v_req := net.http_post(url := v_endpoint, body := v_body,
                    headers := '{"Content-Type":"application/json"}'::jsonb,
                    timeout_milliseconds := 10000);
        exception when others then
          v_msg := left(sqlerrm,180);
        end;
        insert into public.nexus_indexnow_log (host,endpoint,request_id,url_count,status,message)
        values (v_host, v_endpoint, v_req, array_length(v_clean,1),
                case when v_req is null then 'error' else 'submitted' end, v_msg);
      end loop;
      v_sent := v_sent + array_length(v_clean,1);
    end loop;

    perform public.nexus_cron_telemetry_log('indexnow','ok',null,null,v_total,v_sent,
      'lote submetido via pg_net (api.indexnow.org + yandex.com)');
    return v_sent;
  exception when others then
    perform public.nexus_cron_telemetry_log('indexnow','error',null,null,
      coalesce(v_total,0),v_sent,'falha geral (fail-closed): ' || left(sqlerrm,180));
    return 0;
  end;
end
$fn$;
revoke execute on function public.notify_search_engines_via_indexnow(text[])
  from public, anon, authenticated;

create or replace function public.fn_seo_submission_indexnow()
returns trigger language plpgsql security definer set search_path = public as $fn$
begin
  begin
    if new.url is null then return new; end if;
    if public.nexus_host_of(new.url) not in
       (select host from public.nexus_growth_hosts where active) then
      return new;
    end if;
    perform public.notify_search_engines_via_indexnow(array[new.url]);
  exception when others then
    raise warning 'W2: skip fail-closed — %', sqlerrm;
  end;
  return new;
end
$fn$;

do $do$
begin
  drop trigger if exists trigger_seo_submission_indexnow on public.ads_seo_submissions;
  create trigger trigger_seo_submission_indexnow
    after insert on public.ads_seo_submissions
    for each row execute function public.fn_seo_submission_indexnow();
  raise notice 'W2: trigger_seo_submission_indexnow ATIVO';
exception when others then
  raise warning 'W2: gatilho nao criado: %', sqlerrm;
end
$do$;

-- ============================================================================
-- WORKFLOW 3 — AYRSHARE OUTBOX (tabela REAL; state machine legado preservado
--             + UM novo estado 'high_priority_post' nos CHECKs — superconjunto)
-- ============================================================================
alter table public.nexus_social_outbox
  add column if not exists priority integer not null default 100;
alter table public.nexus_social_outbox
  add column if not exists tag text;
alter table public.nexus_social_outbox
  add column if not exists last_http_status integer;

-- idempotente em re-execução: só reestende se o novo estado ainda não existir
do $do$
begin
  if exists (
    select 1 from pg_constraint
     where conrelid = 'public.nexus_social_outbox'::regclass
       and conname = 'nexus_social_outbox_status_check'
       and pg_get_constraintdef(oid) not like '%high_priority_post%') then
    alter table public.nexus_social_outbox drop constraint nexus_social_outbox_status_check;
    alter table public.nexus_social_outbox add constraint nexus_social_outbox_status_check
      check (status = any (array['pending_approval','approved','dispatching','published',
                                'failed','rejected','high_priority_post']));
    raise notice 'W3: status_check estendido com high_priority_post';
  end if;
  if exists (
    select 1 from pg_constraint
     where conrelid = 'public.nexus_social_outbox'::regclass
       and conname = 'nexus_social_outbox_check'
       and pg_get_constraintdef(oid) not like '%high_priority_post%') then
    alter table public.nexus_social_outbox drop constraint nexus_social_outbox_check;
    alter table public.nexus_social_outbox add constraint nexus_social_outbox_check
      check (((status = 'approved') = (approved_at is not null))
          or (status = any (array['dispatching','published','failed','rejected',
                                  'high_priority_post'])));
    raise notice 'W3: outbox_check estendido com high_priority_post';
  end if;
exception when others then
  raise warning 'W3: extensoes de CHECK: %', sqlerrm;
end
$do$;

create index if not exists idx_nexus_social_outbox_dispatch
  on public.nexus_social_outbox (status, priority, created_at);

create or replace function public.nexus_social_enqueue(
  p_product_id uuid, p_post text, p_media_url text, p_public_url text,
  p_platforms text[] default array['instagram','pinterest','tiktok'],
  p_tag text default null, p_high_priority boolean default false)
returns uuid language plpgsql security invoker set search_path = public as $fn$
declare v_id uuid; v_exists uuid;
begin
  begin
    if p_product_id is null or nullif(btrim(p_post),'') is null then
      raise warning 'social_enqueue: product_id e post obrigatorios';
      return null;
    end if;
    select id into v_exists from public.nexus_social_outbox
     where product_id = p_product_id
       and status in ('pending_approval','high_priority_post','approved')
     limit 1;
    if v_exists is not null then return v_exists; end if;
    insert into public.nexus_social_outbox
      (product_id, post_text, media_url, public_url, platforms, status, priority, tag)
    values (p_product_id, left(p_post,3000),
            coalesce(nullif(p_media_url,''), p_public_url),
            p_public_url, to_jsonb(p_platforms),
            case when p_high_priority then 'high_priority_post' else 'pending_approval' end,
            case when p_high_priority then 1 else 100 end, p_tag)
    returning id into v_id;
    return v_id;
  exception when others then
    raise warning 'social_enqueue: skip fail-closed — %', sqlerrm;
    return null;
  end;
end
$fn$;
revoke execute on function public.nexus_social_enqueue(uuid,text,text,text,text[],text,boolean)
  from public, anon, authenticated;

create or replace function public.nexus_social_promote(
  p_public_url text, p_tag text default 'alta-conversao-global')
returns uuid language plpgsql security invoker set search_path = public as $fn$
declare v_id uuid; v_cand record;
begin
  begin
    update public.nexus_social_outbox
       set status='high_priority_post', priority=1,
           tag=coalesce(p_tag, tag), updated_at=now()
     where public_url = p_public_url
       and status in ('pending_approval','failed','rejected')
     returning id into v_id;
    if v_id is not null then
      perform public.nexus_cron_telemetry_log('social_outbox','ok',null,null,1,1,
        format('promovido a high_priority_post (outbox id=%s)',v_id));
      return v_id;
    end if;
    select * into v_cand from public.nexus_social_candidate_queue
     where public_url = p_public_url and status in ('verified','approved')
     order by verified_at desc limit 1;
    if v_cand.product_id is not null then
      insert into public.nexus_social_outbox
        (product_id, post_text, media_url, public_url, platforms, status, priority, tag)
      values (v_cand.product_id,
              left(coalesce(v_cand.source_snapshot->>'title', v_cand.public_url),3000),
              v_cand.media_url, v_cand.public_url,
              coalesce(v_cand.source_snapshot->'platforms', '["instagram","pinterest","tiktok"]'::jsonb),
              'high_priority_post', 1, coalesce(p_tag,'alta-conversao-global'))
      returning id into v_id;
    end if;
    return v_id;
  exception when others then
    raise warning 'social_promote: skip fail-closed — %', sqlerrm;
    return null;
  end;
end
$fn$;
revoke execute on function public.nexus_social_promote(text,text)
  from public, anon, authenticated;

create or replace function public.nexus_social_outbox_next(p_limit integer default 10)
returns table (id uuid, product_id uuid, post text, media_url text, public_url text,
               platforms jsonb, attempts integer, priority integer)
language sql security invoker set search_path = public as $fn$
  with claim as (
    select id from public.nexus_social_outbox
     where status in ('high_priority_post','pending_approval')
     order by priority asc,
              case when status='high_priority_post' then 0 else 1 end,
              created_at asc
     limit greatest(1, least(coalesce(p_limit,10),50))
       for update skip locked
  )
  update public.nexus_social_outbox o
     set status='dispatching', attempts=o.attempts+1, updated_at=now()
   where o.id in (select id from claim)
  returning o.id, o.product_id, o.post_text, o.media_url, o.public_url,
            o.platforms, o.attempts, o.priority
$fn$;
revoke execute on function public.nexus_social_outbox_next(integer)
  from public, anon, authenticated;

-- ============================================================================
-- SUPORTE AO ENGINE GOOGLE (TS) — fila + quota + seed do inventário real
-- ============================================================================
create table if not exists public.nexus_google_index_queue (
  id bigint generated always as identity primary key,
  url text not null unique,
  host text not null,
  priority integer not null default 100,
  status text not null default 'pending_google_crawl',
  attempts integer not null default 0,
  last_inspection_verdict text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_nexus_google_queue_dispatch
  on public.nexus_google_index_queue (status, priority, created_at);

create table if not exists public.nexus_google_index_quota (
  day date not null default current_date,
  host text not null,
  used integer not null default 0,
  primary key (day, host),
  check (used >= 0 and used <= 200)
);

insert into public.nexus_google_index_queue (url, host, priority)
select distinct on (u.url) u.url, u.host, u.prio
from (
  select public.nexus_clean_url(s.url) as url,
         public.nexus_host_of(s.url) as host,
         case when s.url ~ '^https?://(www\.)?[a-z]+[^/]*/?$' then 1
              when s.url ~ '^https?://(www\.)?[a-z]+[^/]*/[a-z]{2}(/[#?].*)?$' then 50
              else 100 end as prio
  from public.ads_seo_submissions s
  where public.nexus_host_of(s.url) in (select host from public.nexus_growth_hosts where active)
    and public.nexus_clean_url(s.url) is not null
) u
on conflict (url) do nothing;

insert into public.nexus_google_index_queue (url, host, priority)
select h.host_url, h.host, 1 from (values
  ('https://solvegrid.com.br','solvegrid.com.br'),
  ('https://aquitemachadinhos.com.br','aquitemachadinhos.com.br'),
  ('https://nexusplataforma.ia.br','nexusplataforma.ia.br'),
  ('https://www.aquitemachadinhos.com.br','www.aquitemachadinhos.com.br'),
  ('https://www.solvegrid.com.br','www.solvegrid.com.br'),
  ('https://www.nexusplataforma.ia.br','www.nexusplataforma.ia.br')) as h(host_url, host)
on conflict (url) do nothing;

create or replace function public.nexus_google_queue_claim(p_limit integer default 200)
returns table (id bigint, url text, host text, priority integer)
language sql security invoker set search_path = public as $fn$
  with claim as (
    select id from public.nexus_google_index_queue
     where status='pending_google_crawl'
        or (status='processing' and updated_at < now() - interval '2 hours')
     order by priority asc, created_at asc
     limit greatest(1, least(coalesce(p_limit,200),500))
       for update skip locked
  )
  update public.nexus_google_index_queue q
     set status='processing', attempts=q.attempts+1, updated_at=now()
   where q.id in (select id from claim)
  returning q.id, q.url, q.host, q.priority
$fn$;
revoke execute on function public.nexus_google_queue_claim(integer)
  from public, anon, authenticated;

create or replace function public.nexus_bump_index_quota(p_host text, p_requested integer default 1)
returns integer language plpgsql security invoker set search_path = public as $fn$
declare v_used integer; v_grant integer; v_limit constant integer := 200;
begin
  begin
    perform pg_advisory_xact_lock(hashtext('nexus_quota|' || coalesce(p_host,'?')));
    insert into public.nexus_google_index_quota (day, host, used)
    values (current_date, p_host, 0) on conflict (day, host) do nothing;
    select used into v_used from public.nexus_google_index_quota
     where day=current_date and host=p_host for update;
    v_grant := least(greatest(coalesce(p_requested,1),0), greatest(v_limit-coalesce(v_used,0),0));
    if v_grant > 0 then
      update public.nexus_google_index_quota set used = coalesce(v_used,0)+v_grant
       where day=current_date and host=p_host;
    end if;
    return v_grant;
  exception when others then
    raise warning 'quota: falha fail-closed (concede 0) — %', sqlerrm;
    return 0;
  end;
end
$fn$;
revoke execute on function public.nexus_bump_index_quota(text,integer)
  from public, anon, authenticated;

-- ============================================================================
-- ENDURECIMENTO: RLS nas tabelas novas + grants mínimos
-- ============================================================================
do $do$
declare t text;
begin
  foreach t in array array[
    'nexus_growth_secrets','nexus_growth_hosts','nexus_official_pids',
    'nexus_cron_telemetry','nexus_indexnow_log','nexus_google_index_queue',
    'nexus_google_index_quota']
  loop
    execute format('alter table public.%I enable row level security;', t);
    execute format('revoke all on table public.%I from anon, authenticated;', t);
    execute format('grant select,insert,update,delete on table public.%I to service_role;', t);
  end loop;
  raise notice 'ENDURECIMENTO: RLS + grants minimos aplicados';
end
$do$;

do $do$
declare v_pgnet boolean := exists (select 1 from pg_extension where extname='pg_net');
begin
  raise notice '===============================================================';
  raise notice 'NEXUS GROWTH ENGINE v2.1 — schema real de producao';
  raise notice 'W1 SMART ROTATOR .... trigger em ads_clicks (PID oficial) -> ads.weight + eco.click_weight';
  raise notice 'W2 INDEXNOW ......... %', case when v_pgnet then 'ATIVO com pg_net (gatilho em ads_seo_submissions)' else 'FAIL-CLOSED ate pg_net' end;
  raise notice 'W3 AYRSHARE ......... outbox real + high_priority_post + claim dispatching';
  raise notice 'GSC ENGINE .......... fila do inventario real + quota 200/dia/host';
  raise notice '===============================================================';
end
$do$;

commit;
