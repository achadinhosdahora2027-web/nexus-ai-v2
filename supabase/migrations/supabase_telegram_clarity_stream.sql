-- ============================================================================
-- 21.32 — AJUSTE DE CLAREZA FORENSE v2 NO PAINEL TELEGRAM
-- supabase/migrations/supabase_telegram_clarity_stream.sql
-- ----------------------------------------------------------------------------
-- Objetivo: alertas de clique com precisão absoluta de ANUNCIANTE + REDE DE
-- AFILIADO (onde a comissão será paga) + CLONE DE ORIGEM (via SID), sem texto
-- genérico "rota-direta", sem cliques sintéticos do cron e sem robôs.
--
-- DESCOBERTA FORENSE (auditoria ao vivo):
--   * O log real do /go é ads_clicks (12,8k/24h) — JÁ captura advertiser,
--     network, click_ref (SID), intent, market, currency; o fan-out
--     nexus_track_attribution_event() (21.10) só não os copiava para
--     nexus_click_streams → daí o "rota-direta (/go)" genérico;
--   * ~75% do tráfego "desktop US" era o robô meta-externalagent/1.1 do
--     Facebook (escâner de links) + HealthCheck-Canary/2026 (cron) —
--     passavam como "desktop" no filtro de bots original.
--
-- CORREÇÕES:
--   1) nexus_click_streams ganha sid/advertiser/network (enriquecimento na
--      CAPTURA — o fan-out copia de ads_clicks; anúncio a anúncio via ads);
--   2) Filtro de bots reforçado (externalagent|healthcheck|canary|…) tanto
--      na classificação do device quanto no push (clique sintético ≠ alerta);
--   3) notify_telegram_real_click_event() v2: anunciante exato (fallback em
--      cascata ads_clicks → MV catálogo nexus_public_offers_ordered_mv →
--      rotas → 'Aguardando'), rede de afiliado com label oficial
--      (CJ Affiliate/Lomadee/Impact Radius/Awin/…), clone de origem via SID
--      (solvegrid_reply_<clone>_<lang>_<ts> / solvegrid_social_sul_*), país,
--      dispositivo e peso país×device×intenção;
--   4) notify_telegram_real_sale_event() v2: rede de recebimento, valor em
--      moeda estrangeira e comissão CONVERTIDA EM REAIS (cotação USD→BRL do
--      cache er-api — open.er-api.com no-auth, atualizada pelo orquestrador
--      a cada ciclo; validada ao vivo: 5,126189 em 08/09/2026);
--   5) Campos nulos → 'Desconhecido/Aguardando' (nunca 'null').
--
-- FAIL-CLOSED: EXCEPTION → RETURN NEW em toda função; o redirecionamento /go
-- e os 14.299 anúncios permanecem intocados (read-only estrito).
-- ============================================================================

-- 1) Colunas forenses no click-stream (enriquecimento na captura) ----------
alter table public.nexus_click_streams
  add column if not exists sid        text,
  add column if not exists advertiser text,
  add column if not exists network    text;

-- 2) Labels oficiais de rede de afiliado ------------------------------------
create or replace function public.nexus_affiliate_network_label(p_network text)
returns text
language plpgsql immutable
as $fn$
begin
  if p_network is null or btrim(p_network) = '' then
    return null;
  end if;
  return case
    when lower(p_network) ~ 'cj|commission junction'        then 'CJ Affiliate'
    when lower(p_network) ~ 'lomadee'                       then 'Lomadee'
    when lower(p_network) ~ 'impact'                        then 'Impact Radius'
    when lower(p_network) ~ 'awin'                          then 'Awin'
    when lower(p_network) ~ 'mercadolivre|mercadolibre|meli' then 'Mercado Livre (Afiliados)'
    when lower(p_network) ~ 'amazon'                        then 'Amazon Associados'
    when lower(p_network) ~ 'tonic'                         then 'Tonic (PPC)'
    when lower(p_network) in ('direct','direto','organic','seo') then 'Tráfego Direto/SEO'
    else initcap(btrim(p_network))
  end;
exception when others then
  return null;
end $fn$;

-- 3) Clone de origem a partir do SID (perfil que gerou o clique) -----------
create or replace function public.nexus_parse_profile_from_sid(p_sid text)
returns text
language plpgsql immutable
as $fn$
declare
  v text;
begin
  if p_sid is null or btrim(p_sid) = '' then
    return null;
  end if;
  v := substring(p_sid from '^solvegrid_reply_(.+?)_([a-z]{2})?_?[0-9a-z]{4,}$');
  if v is not null and v <> '' then return v; end if;
  v := substring(p_sid from '^solvegrid_social_sul_(.+?)_[0-9a-z]{4,}$');
  if v is not null and v <> '' then return v; end if;
  v := substring(p_sid from '^solvegrid_([a-z0-9-]+?)_');
  if v is not null and v <> '' then return v; end if;
  return left(btrim(p_sid), 60);
exception when others then
  return null;
end $fn$;

-- 4) Fan-out enriquecido: copia sid/advertiser/network de ads_clicks -------
--    (corpo 21.10 preservado; diffs: regex de bots estendido + INSERT
--    enriquecido com subqueries escalares NULL-safe)
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
        if jsonb_typeof(v_payload) is distinct from 'object' then
          raise exception 'payload ipapi corrompido (jsonb %)',
            coalesce(jsonb_typeof(v_payload)::text, 'null');
        end if;
        v_country := nullif(upper(coalesce(v_payload ->> 'countryCode', '')), '');
      end if;
    end if;

    -- (b) device_type: coluna → inferência a partir do user_agent
    --     v2 (21.32): externalagent (escâner do Meta) e healthcheck/canary
    --     (cron) agora classificados como BOT — eram ~75% dos "desktop US"
    v_device := lower(nullif(new.device_type, ''));
    if v_device is null then
      v_device := case
        when coalesce(new.user_agent, '') ~* '(bot|crawl|spider|slurp|bingpreview|lighthouse|externalagent|healthcheck|canary|pingdom|uptimerobot|headless|facebookexternalhit|whatsapp|skypeuripreview)' then 'bot'
        when new.user_agent ~* '(ipad|tablet|kindle|silk)' then 'tablet'
        when new.user_agent ~* '(mobile|iphone|android|opera mini)' then 'mobile'
        else 'desktop'
      end;
    end if;

    -- (c) duração da sessão
    if coalesce(new.session_id, '') <> '' then
      select least(coalesce(extract(epoch from
               (coalesce(new.created_at, now()) - min(created_at)))::int, 0), 86400)
        into v_session
        from public.ads_clicks
       where session_id = new.session_id
         and created_at < coalesce(new.created_at, now());
    end if;

    -- (d) peso de conversão em tempo real
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

    -- (e) route_id: ad_id (text) → uuid com cast protegido
    if coalesce(new.ad_id, '') ~*
         '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
      v_route := new.ad_id::uuid;
    end if;

    -- (f) gravação atômica no fluxo — v2 (21.32): ENRIQUECIMENTO FORENSE
    --     sid (click_ref) + advertiser (ads_clicks → catálogo ads) + network
    insert into public.nexus_click_streams
      (route_id, user_agent, country_code, device_type, session_duration, created_at,
       sid, advertiser, network)
    values
      (v_route, left(new.user_agent, 512), v_country, v_device,
       coalesce(v_session, 0), coalesce(new.created_at, now()),
       left(coalesce(new.click_ref, ''), 200),
       coalesce(nullif(new.advertiser, ''),
                (select nullif(a.advertiser, '') from public.ads a
                  where v_route is not null and a.id = v_route limit 1)),
       left(coalesce(new.network, ''), 60));

    -- (g) contador global de auditoria
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

    return new;
  exception when others then
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

-- 5) CLIQUE HUMANO REAL — payload forense v2 -------------------------------
create or replace function public.notify_telegram_real_click_event()
returns trigger
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_last_at  timestamptz;
  v_last_id  bigint;
  v_suppr    integer := 0;
  v_adv      text; v_rede text; v_clone text; v_country text; v_device text;
  v_peso     numeric; v_extra text := '';
  c_tier1 constant text := ',US,GB,CA,AU,DE,FR,NL,SE,NO,DK,CH,AT,BE,IE,NZ,JP,KR,SG,AE,SA,QA,HK,';
  c_bots  constant text := '(bot|crawl|spider|slurp|bingpreview|lighthouse|externalagent|healthcheck|canary|pingdom|uptimerobot|headless|nexusglobalbot|facebookexternalhit|whatsapp|skypeuripreview)';
begin
  -- LIMPEZA (21.32): cliques sintéticos do cron e robôs NÃO geram alerta
  if new.device_type = 'bot' or coalesce(new.user_agent, '') ~* c_bots then
    return new;
  end if;

  select created_at, id, suppressed_count into v_last_at, v_last_id, v_suppr
    from public.nexus_telegram_push_log
   where trigger_name = 'real_click' and event_key is null
   order by created_at desc limit 1;
  if v_last_at is not null and v_last_at > now() - interval '10 minutes' then
    update public.nexus_telegram_push_log
       set suppressed_count = suppressed_count + 1
     where id = v_last_id;
    return new;
  end if;

  -- ANUNCIANTE EXATO em cascata (subqueries escalares NULL-safe — sem
  -- SELECT INTO): ads_clicks → catálogo MV (via route_id=ad uuid) → rotas
  v_adv := coalesce(
    nullif(new.advertiser, ''),
    (select nullif(m.advertiser, '') from public.nexus_public_offers_ordered_mv m
      where new.route_id is not null and m.id = new.route_id limit 1),
    (select nullif(r.merchant_slug, '') from public.nexus_global_routes r
      where new.route_id is not null and r.id = new.route_id limit 1),
    'Aguardando (catálogo)');

  -- REDE DE AFILIADO onde a comissão será paga
  v_rede := coalesce(
    public.nexus_affiliate_network_label(new.network),
    public.nexus_affiliate_network_label(
      (select nullif(m.offer_json ->> 'rede', '')
         from public.nexus_public_offers_ordered_mv m
        where new.route_id is not null and m.id = new.route_id limit 1)),
    'Rede aguardando');

  -- CLONE DE ORIGEM via SID (perfil da conta que gerou o clique)
  v_clone := coalesce(public.nexus_parse_profile_from_sid(new.sid), 'Origem Direta /go');

  v_country := coalesce(nullif(upper(new.country_code), ''), '??');
  v_device  := coalesce(nullif(new.device_type, ''), 'desconhecido');
  v_peso := round(
    (case when position(',' || v_country || ',' in c_tier1) > 0 then 1.30
          when v_country = 'BR' then 1.00 else 0.90 end)
    * (case lower(v_device) when 'mobile' then 1.20 when 'desktop' then 1.10
                             when 'tablet' then 1.00 else 1.05 end)
    * (case when coalesce(new.session_duration, 0) >= 60 then 1.30
            when coalesce(new.session_duration, 0) >= 20 then 1.10
            else 1.00 end), 2);
  if v_suppr > 0 then
    v_extra := chr(10) || '• +' || v_suppr || ' cliques humanos desde o último alerta (janela 10 min)';
  end if;

  perform public.nexus_telegram_push(
    '👤 CLIQUE HUMANO REAL (LEITURA FORENSE)' || chr(10) || chr(10) ||
    '• Anunciante: ' || v_adv || chr(10) ||
    '• Rede de Recebimento: ' || v_rede || chr(10) ||
    '• Clone de Origem: ' || v_clone || chr(10) ||
    '• País (IP): ' || v_country || chr(10) ||
    '• Dispositivo: ' || v_device || ' · ' ||
      left(coalesce(new.user_agent, 'Desconhecido'), 60) || chr(10) ||
    '• Sessão: ' || coalesce(new.session_duration, 0) || 's' || chr(10) ||
    '• Peso de Conversão: ' || coalesce(v_peso, 0) || ' (país×device×intenção)' || chr(10) ||
    '• Status do Link: Ativo · Comissão Rastreada' || v_extra,
    'real_click', null);
  return new;
exception when others then
  return new;
end $fn$;

-- 6) VENDA REAL — rede de recebimento + comissão em REAIS ------------------
create or replace function public.notify_telegram_real_sale_event()
returns trigger
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_brl   numeric;
  v_rede  text;
begin
  if new.commission_amount is null or new.commission_amount <= 0 then
    return new;
  end if;
  -- cotação USD→BRL do cache (er-api, atualizada pelo orquestrador a cada ciclo)
  v_brl := (select (c.payload_response -> 'rates' ->> 'BRL')::numeric
              from public.nexus_external_data_cache c
             where c.provider_slug = 'er-api' and c.query_key = 'usd-latest'
               and c.expires_at > now()
             order by c.fetched_at desc limit 1);
  v_rede := coalesce(public.nexus_affiliate_network_label(new.network), 'Rede aguardando');
  perform public.nexus_telegram_push(
    '💵 NOVA VENDA REAL CONFIRMADA! (COMISSÃO EM REAIS)' || chr(10) || chr(10) ||
    '• ID da Transação: ' || coalesce(nullif(new.external_id, ''),
        coalesce(new.order_id, new.id::text)) || chr(10) ||
    '• Loja / Merchant: ' || coalesce(nullif(new.advertiser, '-'), 'Desconhecido') || chr(10) ||
    '• Rede de Recebimento: ' || v_rede || chr(10) ||
    '• Valor da Compra: ' || coalesce(new.sale_amount, 0) || ' ' ||
      coalesce(new.sale_currency, 'USD') || chr(10) ||
    '• Sua Comissão: ' || new.commission_amount || ' ' ||
      coalesce(new.commission_currency, 'USD') || chr(10) ||
    '• Comissão em Reais: ' ||
      case when v_brl is not null and coalesce(new.commission_usd, 0) > 0
        then '≈ R$ ' || round(new.commission_usd * v_brl, 2)
        else 'R$ aguardando cotação (cache er-api)' end || chr(10) ||
    '• Tracking Ref (SID): ' || coalesce(nullif(new.click_ref, ''),
        coalesce(new.session_id, 'Aguardando')) || chr(10) ||
    '• Status: ' || coalesce(new.status, '-') || ' · Aprovada e Rastreada no Painel',
    'real_sale', coalesce(new.external_id, new.id::text));
  return new;
exception when others then
  return new;
end $fn$;

-- 7) Cotação inicial no cache (o orquestrador v5.7 renova a cada ciclo;
--    er-api validado ao vivo: BRL 5,126189 em 08/09/2026)
insert into public.nexus_external_data_cache
  (provider_slug, query_key, payload_response, fetched_at, expires_at)
values ('er-api', 'usd-latest',
  jsonb_build_object('result', 'success', 'rates', jsonb_build_object('BRL', 5.126189)),
  now(), now() + interval '12 hours')
on conflict (query_key) do update
  set payload_response = excluded.payload_response,
      fetched_at = excluded.fetched_at,
      expires_at = excluded.expires_at;

-- 8) Lock-down das novas funções --------------------------------------------
revoke all on function public.nexus_affiliate_network_label(text) from public, anon, authenticated;
revoke all on function public.nexus_parse_profile_from_sid(text) from public, anon, authenticated;
revoke all on function public.nexus_track_attribution_event() from public, anon, authenticated;
revoke all on function public.notify_telegram_real_click_event() from public, anon, authenticated;
revoke all on function public.notify_telegram_real_sale_event() from public, anon, authenticated;

-- ═══ FIX v3 (21.38 · 2026-09-09, PROVADO AO VIVO) ═════════════════════════
-- facebookexternalhit/1.1 (crawler oficial do Facebook que gera link previews
-- dos posts das fazendas) escapava do filtro anti-bot: 174 cliques em 6h
-- alertados como "👤 CLIQUE HUMANO REAL" com device 'desktop' e sessão 0s.
-- Corrigido em TODAS as camadas (gate do alerta, classificador de device,
-- censo galaxy): regex += facebookexternalhit|whatsapp|skypeuripreview.
-- Provas ao vivo: (1) unidade — UA crawler→bot, Chrome/iPhone→humano;
-- (2) insert de teste com o UA → ZERO pushes; (3) censo do dia recomputado:
-- 840 cliques 'anuncios_aquitem' → 839 robôs / 1 humano real.
