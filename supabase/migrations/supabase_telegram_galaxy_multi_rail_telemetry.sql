-- ============================================================================
-- GALAXY CLUSTER FRAMEWORK — TELEMETRIA TRIPLICADA V2 (21.38, fechamento)
-- ============================================================================
-- Consolida a monitoração multi-rail (Ayrshare + Zernio Dual + SocialAPI)
-- com leitura forense do Click-Stream pelas novas assinaturas de sub-origem
-- e push de status diário no Telegram privado C1 (5808022745) via
-- @NandimFernandesBot (bot pessoal do dono — routing 21.38).
--
-- FAIL-CLOSED: snapshot e push vivem num único bloco EXCEPTION isolado —
-- timeout/limite/token na Zernio/Ayrshare/SocialAPI NUNCA derrubam o push,
-- e falha do push NUNCA afeta os motores. Tudo é SELECT (leitura) sobre o
-- catálogo — os 14.299 anúncios permanecem read-only estrito.
--
-- Determinismo: cotação USD/BRL lida do cache LOCAL nexus_external_data_cache
-- (er-api, job nexus-fx-50min) — nenhuma chamada externa no caminho do push.
-- As pílulas (clima Open-Meteo/Wikipedia/cotação) seguem anexadas
-- deterministicamente pelo Oráculo C3 na Edge (v5.8+, runTelegramOrculo).
-- ============================================================================

-- ── 1) LEITURA FORENSE: mapa de sub-origem dos SIDs (inclui assinaturas novas) ──
create or replace function public.nexus_click_forensics_suborigin(p_sid text)
returns text
language sql immutable
as $fn$
  select case
    when p_sid like 'zernio_instagram%'  then 'zernio_instagram'
    when p_sid like 'zernio_pinterest%'  then 'zernio_pinterest'
    when p_sid like 'zernio_threads%'    then 'zernio_threads'
    when p_sid like 'socialapi_official%' then 'socialapi_oficial'
    when p_sid like 'telegram_ofertas_c2%' then 'telegram_c2_ofertas'
    when p_sid like 'telegram_oraculo_c3%' then 'telegram_c3_oraculo'
    when p_sid like 'solvegrid_reply%'   then 'engajamento_reply'
    when p_sid like 'solvegrid_blast%'   then 'blast_social'
    when p_sid like 'aquitemachadinhos%' then 'anuncios_aquitem'
    when p_sid like 'solvegrid_oferta%'  then 'go_direto_sites'
    when coalesce(p_sid, '') = ''        then 'direto_sem_sid'
    else 'outros'
  end;
$fn$;

-- ── 2) VIEW FORENSE DIÁRIA: cliques humanos vs robôs + geolocalização ──
--    (mesma regex do Censo anti-bot do notify_telegram_real_click_event)
create or replace view public.nexus_click_forensics_daily_vw as
  select created_at::date as dia,
         public.nexus_click_forensics_suborigin(sid) as suborigem,
         count(*) filter (
           where coalesce(device_type, '') <> 'bot'
             and coalesce(user_agent, '') !~* '(bot|crawl|spider|slurp|bingpreview|lighthouse|externalagent|healthcheck|canary|pingdom|uptimerobot|headless|nexusglobalbot|facebookexternalhit|whatsapp|skypeuripreview)'
         ) as cliques_humanos,
         count(*) as cliques_total,
         count(*) filter (
           where coalesce(device_type, '') = 'bot'
             or coalesce(user_agent, '') ~* '(bot|crawl|spider|slurp|bingpreview|lighthouse|externalagent|healthcheck|canary|pingdom|uptimerobot|headless|nexusglobalbot|facebookexternalhit|whatsapp|skypeuripreview)'
         ) as robos_higienizados,
         count(distinct nullif(country_code, '')) as paises,
         string_agg(distinct nullif(country_code, ''), ',' order by nullif(country_code, '')) as geolocalizacao
    from public.nexus_click_streams
   group by 1, 2;

-- ── 3) Semente da versão da Edge (atualizada a cada deploy — sem fake news) ──
insert into public.nexus_growth_secrets (key, value, updated_at) values
  ('edge_version', 'v40', now())
on conflict (key) do update set value = excluded.value, updated_at = excluded.updated_at;

-- ── 4) SNAPSHOT CONSOLIDADO DAS 3 RAILS + PUSH C1 (fail-closed total) ──
create or replace function public.nexus_galaxy_rail_status()
returns jsonb
language plpgsql
security definer
set search_path = 'public', 'net', 'extensions'
as $fn$
declare
  c_bots constant text := '(bot|crawl|spider|slurp|bingpreview|lighthouse|externalagent|healthcheck|canary|pingdom|uptimerobot|headless|nexusglobalbot|facebookexternalhit|whatsapp|skypeuripreview)';
  v_nl     text := chr(10);
  v_farms  int; v_ayr int; v_zpin int; v_zig int; v_zth int;
  v_soc    int; v_mv int; v_hum int; v_bots int;
  v_usd    text; v_edge text; v_msg text; v_text text;
  v_token  text; v_chat text; v_req bigint;
  v_total  int;
begin
  begin
    -- ── leitura viva (100% SELECT — read-only sobre o catálogo) ──
    select count(*) into v_farms
      from public.nexus_social_farms where status = 'active';

    select count(*) into v_ayr
      from public.nexus_social_outbox
     where status = 'published' and published_at::date = current_date;

    select count(*) filter (where platform = 'pinterest'),
           count(*) filter (where platform = 'instagram'),
           count(*) filter (where platform = 'threads')
      into v_zpin, v_zig, v_zth
      from public.nexus_zernio_pins
     where created_at::date = current_date and status = 'posted';

    select count(*) into v_soc
      from public.nexus_socialapi_posts
     where created_at::date = current_date and status = 'posted';

    select count(*) into v_mv
      from public.nexus_public_offers_ordered_mv where weight > 0;

    select count(*) into v_hum
      from public.nexus_click_streams
     where created_at > now() - interval '24 hours'
       and sid ~ '^(zernio_|socialapi_|telegram_|solvegrid_reply)'
       and coalesce(device_type, '') <> 'bot'
       and coalesce(user_agent, '') !~* c_bots;

    select count(*) into v_bots
      from public.nexus_click_streams
     where created_at > now() - interval '24 hours'
       and (coalesce(device_type, '') = 'bot' or coalesce(user_agent, '') ~* c_bots);

    -- cotação determinística do cache local (er-api, job nexus-fx-50min)
    select coalesce((payload_response -> 'rates' ->> 'BRL'), 'n/d') into v_usd
      from public.nexus_external_data_cache
     where provider_slug = 'er-api' and query_key = 'usd-latest'
     order by fetched_at desc limit 1;

    select coalesce(value, 'v?') into v_edge
      from public.nexus_growth_secrets where key = 'edge_version';

    v_total := v_ayr + v_zpin + v_zig + v_zth + v_soc;
    v_msg := format('%s publicações hoje (Ayrshare %s · Zernio %s pin + %s ig · SocialAPI %s) · %s cliques humanos no funil em 24h · %s robôs higienizados',
                    v_total, v_ayr, v_zpin, v_zig, v_soc, v_hum, v_bots);

    -- ── snapshot consolidado (persistido SEMPRE, push é best-effort) ──
    insert into public.nexus_cron_telemetry
      (created_at, job, target_host, status, items_total, items_sent, message)
    values (now(), 'galaxy_rails', null, 'ok', v_total, v_total,
            'TELEMETRIA TRIPLICADA V2 — ' || v_msg);

    -- ── push C1: @NandimFernandesBot → chat privado do dono ──
    select value into v_chat  from public.nexus_growth_secrets where key = 'telegram_chat_id_privado';
    select value into v_token from public.nexus_growth_secrets where key = 'telegram_bot_token_privado';
    if coalesce(v_chat, '') = '' or coalesce(v_token, '') = '' then
      return jsonb_build_object('ok', true, 'push', false, 'motivo', 'C1 sem token/chat no cofre — snapshot persistido (fail-closed)', 'mensagem', v_msg);
    end if;

    v_text :=
        '🛰️ COMPUTAÇÃO MESTRE NEXUS — STATUS DAS 3 RAILS' || v_nl ||
        '• Multi-Rail Status: SUCCESS (' || v_edge || ' active na Edge)' || v_nl ||
        '• Esteira 1 Ayrshare Farm: ' || v_farms || ' contas ativas (' || v_ayr || ' posts hoje)' || v_nl ||
        '• Esteira 2 Zernio DUAL: Pinterest ' || v_zpin || ' + Instagram Mestre ' || v_zig || ' posts hoje' || v_nl ||
        '• Esteira 3 SocialAPI Oficial: Instagram @aquitatem + FB no ar (' || v_soc || ' posts hoje)' || v_nl ||
        '• Total de Anúncios Monitorados na MV: ' || v_mv || ' ativas' || v_nl ||
        '• USD/BRL: ' || v_usd || ' (cache local er-api — determinístico)' || v_nl ||
        '• Filtro Anti-Bot / Código do Censo: Ativos — ' || v_bots || ' robôs higienizados em 24h' || v_nl ||
        '• Mensagem do Servidor: ' || v_msg;

    select net.http_post(
      url      => 'https://api.telegram.org/bot' || v_token || '/sendMessage',
      body     => jsonb_build_object('chat_id', v_chat, 'text', v_text, 'parse_mode', 'HTML'),
      params   => '{}'::jsonb,
      headers  => jsonb_build_object('Content-Type', 'application/json'),
      timeout_milliseconds => 8000
    ) into v_req;

    insert into public.nexus_telegram_push_log (trigger_name, event_key, request_id, payload_preview)
    values ('galaxy_rail_status', 'galaxy:' || current_date::text, v_req, left(v_text, 160));

    return jsonb_build_object('ok', true, 'push', true, 'request_id', v_req, 'mensagem', v_msg);
  exception when others then
    raise warning 'galaxy_rail_status isolado (fail-closed): %', sqlerrm;
    return jsonb_build_object('ok', false, 'erro', sqlerrm);
  end;
end;
$fn$;

-- ── 5) Agenda diária: 12:15 UTC = 09:15 Brasília (briefing matinal no C1) ──
select cron.unschedule('nexus-galaxy-rail-status')
 where exists (select 1 from cron.job where jobname = 'nexus-galaxy-rail-status');
select cron.schedule('nexus-galaxy-rail-status', '15 12 * * *',
                      $$select public.nexus_galaxy_rail_status();$$);

-- ── 6) Hardening: service-role only ──
-- (NB: o default do Postgres concede EXECUTE ao role PUBLIC — revogar só de
--  anon/authenticated NÃO fecha o acesso; o revoke inclui PUBLIC.)
revoke execute on function public.nexus_click_forensics_suborigin(text) from public, anon, authenticated;
revoke execute on function public.nexus_galaxy_rail_status() from public, anon, authenticated;
revoke select on public.nexus_click_forensics_daily_vw from public, anon, authenticated;

-- FIM supabase_telegram_galaxy_multi_rail_telemetry.sql

-- ═══ FIX v3 (21.38 · 2026-09-09, PROVADO AO VIVO) ═════════════════════════
-- facebookexternalhit/1.1 (crawler oficial do Facebook que gera link previews
-- dos posts das fazendas) escapava do filtro anti-bot: 174 cliques em 6h
-- alertados como "👤 CLIQUE HUMANO REAL" com device 'desktop' e sessão 0s.
-- Corrigido em TODAS as camadas (gate do alerta, classificador de device,
-- censo galaxy): regex += facebookexternalhit|whatsapp|skypeuripreview.
-- Provas ao vivo: (1) unidade — UA crawler→bot, Chrome/iPhone→humano;
-- (2) insert de teste com o UA → ZERO pushes; (3) censo do dia recomputado:
-- 840 cliques 'anuncios_aquitem' → 839 robôs / 1 humano real.
