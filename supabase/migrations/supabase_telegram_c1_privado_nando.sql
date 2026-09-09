-- ============================================================================
-- TRIPLO FUNIL 21.38 — ETAPA C1: CHAT PRIVADO DO DONO VIA @NandimFernandesBot
-- ============================================================================
-- Contexto: o dono mandou /start ao bot dele (@NandimFernandesBot /
-- NandoBotTelegram, id 8992362681) e capturou o chat privado via getUpdates.
-- Topologia final do triplo funil:
--   C1 · Painel Privado de Controle → chat 5808022745 via @NandimFernandesBot
--        (telegram_chat_id_privado + telegram_bot_token_privado)
--   C2 · @ofertasbrasilz            → -1004317377063 via @AquiTemOfertasBot
--   C3 · @achadinhosdahora2026vip   → -1003556152679 via @AquiTemOfertasBot
--
-- Roteamento por canal: quando o destino é o chat privado do dono
-- (telegram_chat_id_privado), TODOS os remetentes usam o token do bot dele
-- (telegram_bot_token_privado), com fallback fail-closed para o bot master.
-- Isto é obrigatório porque @AquiTemOfertasBot não pode iniciar conversa com
-- o dono (regra do Telegram: bot só fala com quem mandou /start a ELE).
--
-- Aplicado em produção em 2026-09-08 (comprovado ao vivo):
--   API direta  → message_id 1527
--   send_to     → req 269 / message_id 1529
--   push        → req 268 / message_id 1528
--   telemetry   → req 270 / message_id 1530
--
-- Secrets GitHub Actions atualizados no mesmo dia:
--   TELEGRAM_BOT_TOKEN → token do @NandimFernandesBot
--   TELEGRAM_CHAT_ID   → 5808022745 (privado do dono)
-- ============================================================================

-- ── 1) Cofre: chat privado do dono (C1) + painel forense redirecionado ──
-- (token do bot do dono vive SÓ no cofre, não versionado — mesmo padrão do
--  telegram_bot_token; provisionado via ops com valor real)
insert into public.nexus_growth_secrets (key, value, updated_at) values
  ('telegram_chat_id_privado', '5808022745', now()),
  ('telegram_chat_id',         '5808022745', now())
on conflict (key) do update set value = excluded.value, updated_at = excluded.updated_at;


-- ── roteamento C1: nexus_telegram_send_to ──
CREATE OR REPLACE FUNCTION public.nexus_telegram_send_to(p_channel text, p_text text, p_trigger text DEFAULT 'triple_funnel'::text, p_event_key text DEFAULT NULL::text)
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'net', 'extensions'
AS $function$
declare
  v_token text;
  v_chat  text;
  v_key   text;
  v_req   bigint;
  v_enabled text;
begin
  begin
    if p_channel not in ('privado','ofertas','oraculo') then
      raise exception 'canal inválido: %', p_channel;
    end if;
    if coalesce(btrim(p_text), '') = '' then
      insert into public.nexus_telegram_push_log (trigger_name, event_key, payload_preview)
      values (p_trigger, p_event_key, 'GUARDA triplo funil: texto nulo/vazio — push bloqueado');
      return null;
    end if;

    select value into v_enabled from public.nexus_growth_secrets where key = 'telegram_alerts_enabled';
    if v_enabled = 'off' then
      insert into public.nexus_telegram_push_log (trigger_name, event_key, payload_preview)
      values (p_trigger, p_event_key, 'desligado (telegram_alerts_enabled) — triplo funil respeita');
      return null;
    end if;

    select value into v_token from public.nexus_growth_secrets where key = 'telegram_bot_token';
    -- 21.38 C1: canal privado do dono usa o bot dele (@NandimFernandesBot);
    -- fallback fail-closed para o bot master se a chave não existir.
    if p_channel = 'privado' then
      v_token := coalesce((select value from public.nexus_growth_secrets where key = 'telegram_bot_token_privado'), v_token);
    end if;
    v_key := case p_channel
               when 'privado'  then 'telegram_chat_id_privado'
               when 'ofertas'  then 'telegram_chat_id_ofertas'
               when 'oraculo'  then 'telegram_chat_id_oraculo'
             end;
    select value into v_chat from public.nexus_growth_secrets where key = v_key;

    if coalesce(v_token, '') = '' or coalesce(v_chat, '') = '' then
      insert into public.nexus_telegram_push_log (trigger_name, event_key, payload_preview)
      values (p_trigger, p_event_key, 'canal ' || p_channel || ' sem token/chat_id no cofre — fail-closed');
      return null;
    end if;

    -- limite de caracteres do Telegram respeitado na origem (4096)
    select net.http_post(
      url      := 'https://api.telegram.org/bot' || v_token || '/sendMessage',
      body     := jsonb_build_object(
                    'chat_id', v_chat,
                    'text', left(p_text, 4000),
                    'parse_mode', 'HTML',
                    'disable_web_page_preview', false),
      params   := '{}'::jsonb,
      headers  := jsonb_build_object('Content-Type', 'application/json'),
      timeout_milliseconds := 8000
    ) into v_req;

    insert into public.nexus_telegram_push_log (trigger_name, event_key, request_id, payload_preview)
    values (p_trigger, p_event_key, v_req, left('[' || p_channel || '] ' || p_text, 160));
    return v_req;
  exception when others then
    -- API do Telegram fora / timeout / limite: NUNCA propaga para o caller
    begin
      insert into public.nexus_telegram_push_log (trigger_name, event_key, payload_preview)
      values (p_trigger, p_event_key, 'exceção isolada (fail-closed): ' || left(sqlerrm, 140));
    exception when others then null;
    end;
    return null;
  end;
end $function$

-- ── roteamento C1: nexus_telegram_push ──
CREATE OR REPLACE FUNCTION public.nexus_telegram_push(p_text text, p_trigger text, p_event_key text)
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_token text; v_chat text; v_enabled text; v_req bigint;
begin
  -- v5.6.1 GUARDA: texto nulo/vazio NUNCA vai para a API (bug "null" ao vivo:
  -- || com NULL anulava o texto e o Telegram entregava a string literal)
  if p_text is null or btrim(p_text) = '' then
    insert into public.nexus_telegram_push_log (trigger_name, event_key, payload_preview)
    values (p_trigger, p_event_key, 'GUARDA v5.6.1: texto nulo/vazio — push bloqueado');
    return null;
  end if;
  select value into v_enabled from public.nexus_growth_secrets
   where key = 'telegram_alerts_enabled';
  if coalesce(v_enabled, 'false') <> 'true' then
    insert into public.nexus_telegram_push_log (trigger_name, event_key, payload_preview)
    values (p_trigger, p_event_key, 'desligado (telegram_alerts_enabled)');
    return null;
  end if;
  select value into v_token from public.nexus_growth_secrets where key = 'telegram_bot_token';
  select value into v_chat  from public.nexus_growth_secrets where key = 'telegram_chat_id';
  -- 21.38 C1: se o painel aponta para o chat privado do dono, usa o bot dele.
  if v_chat = (select value from public.nexus_growth_secrets where key = 'telegram_chat_id_privado') then
    v_token := coalesce((select value from public.nexus_growth_secrets where key = 'telegram_bot_token_privado'), v_token);
  end if;
  if v_token is null or v_chat is null or length(btrim(v_token)) < 10 then
    return null;
  end if;
  select net.http_post(
    url := 'https://api.telegram.org/bot' || v_token || '/sendMessage',
    body := jsonb_build_object('chat_id', v_chat, 'text', left(p_text, 4000)),
    params := '{}'::jsonb,
    headers := jsonb_build_object('Content-Type', 'application/json'),
    timeout_milliseconds := 8000
  ) into v_req;
  insert into public.nexus_telegram_push_log (trigger_name, event_key, request_id, payload_preview)
  values (p_trigger, p_event_key, v_req, left(p_text, 160));
  return v_req;
exception when others then
  return null;
end $function$

-- ── roteamento C1: notify_telegram_cron_telemetry ──
CREATE OR REPLACE FUNCTION public.notify_telegram_cron_telemetry()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_token text; v_chat text; v_enabled text;
  v_nl    text := chr(10);
  v_text  text; v_url text;
  v_jobs    constant text[] := array['google_indexation','ayrshare_outbox'];
  v_status  constant text[] := array['ok','error','rate_limited'];
begin
  begin
    if new.job is null or not (new.job = any(v_jobs)) then return new; end if;
    if new.status is null or not (new.status = any(v_status)) then return new; end if;
    select value into v_enabled from public.nexus_growth_secrets
     where key='telegram_alerts_enabled';
    if coalesce(v_enabled,'false') <> 'true' then return new; end if;
    select value into v_token from public.nexus_growth_secrets where key='telegram_bot_token';
    select value into v_chat  from public.nexus_growth_secrets where key='telegram_chat_id';
    -- 21.38 C1: chat privado do dono → bot dele (@NandimFernandesBot)
    if v_chat = (select value from public.nexus_growth_secrets where key='telegram_chat_id_privado') then
      v_token := coalesce((select value from public.nexus_growth_secrets where key='telegram_bot_token_privado'), v_token);
    end if;
    if v_token is null or v_chat is null or v_token like 'REPLACE%' then
      raise warning 'telegram: credenciais ausentes (fail-closed)';
      return new;
    end if;
    v_text :=
        '🛰️ PROJETO NEXUS - RELATÓRIO DE TELEMETRIA' || v_nl ||
        'Job Executado: '             || coalesce(new.job,'-') || v_nl ||
        case when coalesce(new.target_host,'-') not in ('','-') then 'Host: ' || new.target_host || v_nl else '' end ||
        'Status da Operação: '        || coalesce(new.status,'-') || v_nl ||
        'Total de URLs na fila: '     || coalesce(new.items_total,0)::text || v_nl ||
        'URLs processadas no dia: '   || coalesce(new.items_sent,0)::text || v_nl ||
        'Mensagem do Servidor: '      || left(coalesce(nullif(new.message,''),'-'),100);
    v_url := 'https://api.telegram.org/bot' || v_token || '/sendMessage';
    perform net.http_post(
      url     := v_url,
      body    := jsonb_build_object('chat_id', v_chat, 'text', v_text),
      headers := '{"Content-Type":"application/json"}'::jsonb,
      timeout_milliseconds := 20000);
  exception when others then
    raise warning 'telegram: falha fail-closed (%) — telemetria preservada', sqlerrm;
  end;
  return new;
end
$function$

-- ── roteamento C1: notify_telegram_nexus_heartbeat ──
CREATE OR REPLACE FUNCTION public.notify_telegram_nexus_heartbeat()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_token text; v_chat text; v_enabled text; v_mv bigint; v_se bigint;
  v_texto text; v_social text;
begin
  -- escopo: apenas os 2 jobs do painel de bordo
  if new.job not in ('nexus-social-traffic-central','global-indexation-mesh') then
    return new;
  end if;

  -- 21.24g-fix (anti-diluvio): na malha global, empurrar SOMENTE o resultado final
  -- consolidado (status ok) ou erros estruturais do runner (suffixo _error).
  -- Rejeicoes por endpoint (indexnow_rejected etc.) ja estao resumidas em
  -- endpoints_ok= na linha final e NAO geram mais push.
  if new.job = 'global-indexation-mesh' then
    if new.status <> 'ok' and right(new.status, 6) <> '_error' then
      return new;
    end if;
    -- colapsa erros identicos em no maximo 1 push por 10 minutos
    if right(new.status, 6) = '_error' and exists (
      select 1 from public.nexus_cron_telemetry t
       where t.job = new.job
         and t.status = new.status
         and left(coalesce(t.message,''),60) = left(coalesce(new.message,''),60)
         and t.created_at > now() - interval '10 minutes'
         and t.id < new.id) then
      return new;
    end if;
  end if;

  select value into v_enabled from public.nexus_growth_secrets where key = 'telegram_alerts_enabled';
  if coalesce(v_enabled,'false') <> 'true' then
    return new;
  end if;
  select value into v_token from public.nexus_growth_secrets where key = 'telegram_bot_token';
  select value into v_chat from public.nexus_growth_secrets where key = 'telegram_chat_id';
    -- 21.38 C1: chat privado do dono → bot dele (@NandimFernandesBot)
    if v_chat = (select value from public.nexus_growth_secrets where key='telegram_chat_id_privado') then
      v_token := coalesce((select value from public.nexus_growth_secrets where key='telegram_bot_token_privado'), v_token);
    end if;
  if v_token is null or v_chat is null or length(trim(v_token)) < 10 then
    return new;
  end if;
  select count(*) into v_mv from public.nexus_public_offers_ordered_mv;
  select count(*) into v_se from public.nexus_google_index_queue where status in ('pending_google_crawl','processing');

  -- 21.24g-fix: rotulo por job (antes items_sent da malha aparecia como posts sociais)
  v_social := case
    when new.job = 'nexus-social-traffic-central'
      then '• Fila Redes Sociais: ' || coalesce(new.items_sent, 0) || ' publicados/agendados neste ciclo'
    else '• URLs finalizadas na malha: ' || coalesce(new.items_sent, 0) || '/' || coalesce(new.items_total, 0)
  end;

  v_texto :=
    '🛰️ PROJETO NEXUS - CENTRAL DE CONTROLE GLOBAL 24/7' || chr(10) || chr(10) ||
    '• Job Executado: ' || new.job || chr(10) ||
    '• Status da Run: ' || new.status || chr(10) ||
    '• Total de Anúncios Ativos: ' || replace(to_char(v_mv, 'FM999,999,999'), ',', '.') || ' ofertas na MV pública' || chr(10) ||
    '• Fila Search Engines: ' || replace(to_char(v_se, 'FM999,999,999'), ',', '.') || ' URLs pendentes de crawl' || chr(10) ||
    v_social || chr(10) ||
    '• Mensagem do Servidor: ' || left(coalesce(new.message, '-'), 140);
  perform net.http_post(
    url := 'https://api.telegram.org/bot' || v_token || '/sendMessage',
    body := jsonb_build_object('chat_id', v_chat, 'text', v_texto),
    params := '{}'::jsonb,
    headers := jsonb_build_object('Content-Type', 'application/json'),
    timeout_milliseconds := 8000);
  return new;
exception when others then
  return new;
end
$function$

-- FIM 21.38-C1
