-- ============================================================================
-- ESTRUTURA DE TRIPLO FUNIL DO TELEGRAM — DDL ADITIVO (21.38)
-- supabase/migrations/supabase_telegram_triple_funnel_system.sql
-- ----------------------------------------------------------------------------
-- CANAIS:
--   C1 · Painel Privado de Controle  → vault 'telegram_chat_id_privado'
--        (chat privado do dono com @AquiTemOfertasBot — backfill do ID real
--         pelo workflow telegram-funnel-backfill-c1; até lá fail-closed)
--   C2 · Hub de Recrutamento & Ofertas → @ofertasbrasilz (-1004317377063)
--   C3 · Oráculo de Utilidade Pública  → @achadinhosdahora2026vip (-1003556152679)
--
-- COMPONENTES:
--   1) Chaves de cofre (nexus_growth_secrets) + leitura segura
--   2) nexus_telegram_send_to() — sender fail-closed por canal (pg_net)
--   3) Trigger AFTER INSERT em nexus_social_engagement_tasks → marca o
--      comentário de NÃO-SEGUIDOR para recrutamento do Canal 2 (a IA gratuita
--      Mistral/Groq do orquestrador v5.8 injeta o convite no texto da resposta)
--   4) nexus_telegram_ofertas_broadcast() — pesca de madrugada: top ofertas
--      por engajamento + alertas de bug de preço (peso 9999) → Canal 2
--   5) pg_cron 'nexus-telegram-c2-ofertas' — 08:30 UTC (05:30 Brasília)
--
-- FAIL-CLOSED (blindagem total):
--   * Todo bloco tem EXCEPTION WHEN OTHERS → telemetria/push_log, nunca raise.
--   * Instabilidade da API do Telegram, timeout ou limite de caracteres NUNCA
--     trava o /go, a MV, o cron social ou a inserção de tarefas de engagement.
--   * Inventário de 14.299 anúncios: 100% READ-ONLY (nenhum UPDATE/DELETE em
--     ads/mv/routes — só SELECT e INSERT em tabelas de log).
--   * Anti-dilúvio: broadcast C2 no máximo 1×/20h; dedup por oferta 7d.
-- ============================================================================

-- ════════════════════════════════════════════════════════════════════════
-- 1) COFRE — chaves dos três canais (idempotente)
-- ════════════════════════════════════════════════════════════════════════
insert into public.nexus_growth_secrets (key, value) values
  ('telegram_chat_id_privado', ''),                      -- C1: backfill do dono (fail-closed até lá)
  ('telegram_chat_id_ofertas', '-1004317377063'),        -- C2: @ofertasbrasilz
  ('telegram_chat_id_oraculo', '-1003556152679')         -- C3: @achadinhosdahora2026vip
on conflict (key) do update set value = excluded.value, updated_at = now();

-- ════════════════════════════════════════════════════════════════════════
-- 2) CONFIG SEGURO + SENDER FAIL-CLOSED POR CANAL
-- ════════════════════════════════════════════════════════════════════════
create or replace function public.nexus_telegram_send_to(
  p_channel text,          -- 'privado' | 'ofertas' | 'oraculo'
  p_text    text,
  p_trigger text default 'triple_funnel',
  p_event_key text default null
) returns bigint
language plpgsql
security definer
set search_path = public, net, extensions
as $fn$
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
end $fn$;

-- ════════════════════════════════════════════════════════════════════════
-- 3) RECRUTAMENTO C2 — trigger na escuta ativa (não-seguidores)
--    Toda tarefa capturada pelo motor de escuta é um NÃO-SEGUIDOR comentando
--    em post global. O trigger marca a tarefa (recruit_c2) e o orquestrador
--    v5.8 ordena a IA gratuita (Mistral/Groq) a injetar o convite do Canal 2
--    no texto da resposta social. Bug de preço tem prioridade no hint.
-- ════════════════════════════════════════════════════════════════════════
alter table public.nexus_social_engagement_tasks
  add column if not exists recruit_c2  boolean default null,
  add column if not exists recruit_hint text;

create or replace function public.nexus_engagement_recruit_c2_trigger()
returns trigger
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_hint text;
begin
  begin
    -- rotatividade de convites (3 sabores — a IA escolhe o tom no texto final)
    v_hint := (array[
      '🎁 Entrou no nosso canal de ofertas do Brasil? Cupons e achados todo dia: https://t.me/ofertasbrasilz',
      '🔥 Descontos quentes todo dia no nosso canal gratuito: https://t.me/ofertasbrasilz',
      '💸 Não paga mais caro: alertas de promoção em tempo real em https://t.me/ofertasbrasilz'
    ])[1 + (floor(random() * 3))::int];

    update public.nexus_social_engagement_tasks
       set recruit_c2 = true,
           recruit_hint = v_hint,
           updated_at = now()
     where id = new.id;
  exception when others then
    -- recrutamento é best-effort: JAMAIS bloqueia a inserção da tarefa
    null;
  end;
  return null; -- trigger AFTER sem efeito no fluxo
end $fn$;

drop trigger if exists nexus_engagement_recruit_c2 on public.nexus_social_engagement_tasks;
create trigger nexus_engagement_recruit_c2
  after insert on public.nexus_social_engagement_tasks
  for each row
  when (new.status in ('pending','pending_reply'))
  execute function public.nexus_engagement_recruit_c2_trigger();

-- ════════════════════════════════════════════════════════════════════════
-- 4) BROADCASTER C2 DE MADRUGADA — top-5 (bugs de preço peso 9999 primeiro)
-- ════════════════════════════════════════════════════════════════════════
create or replace function public.nexus_telegram_ofertas_broadcast()
returns jsonb
language plpgsql
security definer
set search_path = public, net, extensions
as $fn$
declare
  v_hoje      text := to_char(now(), 'YYYYMMDD');
  v_linhas    text := '';
  v_texto     text;
  v_req       bigint;
  v_n_bugs    int := 0;
  v_n_ofertas int := 0;
  r           record;
begin
  begin
    -- ANTI-DILÚVIO: no máximo 1 broadcast por 20h no Canal 2
    if exists (
      select 1 from public.nexus_telegram_push_log
       where trigger_name = 'c2_ofertas_broadcast'
         and created_at > now() - interval '20 hours'
         and coalesce(event_key, '') <> '') then
      return jsonb_build_object('ok', false, 'motivo', 'anti-dilúvio: broadcast das últimas 20h');
    end if;

    -- (a) ALERTAS DE BUG DE PREÇO — peso 9999 (prioridade máxima)
    for r in
      select titulo, preco_atual, preco_de, desconto_pct, loja
        from public.nexus_price_anomalies_hunter
       where detected_at > now() - interval '48 hours'
         and (coalesce(status, '') not in ('blasted', 'expired'))
         and not exists (
               select 1 from public.nexus_telegram_push_log pl
                where pl.event_key = 'c2:bug:' || public.nexus_price_anomalies_hunter.id::text
                  and pl.created_at > now() - interval '7 days')
       order by desconto_pct desc
       limit 3
    loop
      v_n_bugs := v_n_bugs + 1;
      v_linhas := v_linhas ||
        format(E'🚨 <b>BUG DE PREÇO — %s</b>\n💸 de R$ %s por <b>R$ %s</b> (−%s%%)\n👉 https://www.solvegrid.com.br/go?marca=%s&sid=telegram_ofertas_c2_bugpreco_%s\n\n',
          left(r.titulo, 60),
          ltrim(to_char(r.preco_de, 'FM999990.00'), '0'),
          ltrim(to_char(r.preco_atual, 'FM999990.00'), '0'),
          r.desconto_pct,
          lower(regexp_replace(r.loja, '[^a-zA-Z0-9]', '', 'g')),
          v_hoje);
      insert into public.nexus_telegram_push_log (trigger_name, event_key, payload_preview)
      values ('c2_ofertas_broadcast', 'c2:bug', 'dedup bug: ' || left(r.titulo, 60));
    end loop;

    -- (b) TOP OFERTAS POR ENGAJAMENTO (o que a audiência já ama)
    for r in
      select m.id::text as id,
             coalesce(m.offer_json->>'nome', m.offer_json->>'anunciante', 'Oferta') as nome,
             coalesce(m.offer_json->>'promo', '') as promo,
             coalesce(m.offer_json->>'anunciante', '') as anunciante
        from public.nexus_public_offers_ordered_mv m
        join public.nexus_social_engagement_insights ei on ei.product_id = m.id
        join public.ads a on a.id = m.id
       where a.active
         and a.html_code like '%<img%'
         and m.weight > 0
         and not exists (
               select 1 from public.nexus_telegram_push_log pl
                where pl.event_key = 'c2:oferta:' || m.id::text
                  and pl.created_at > now() - interval '7 days')
       order by (ei.engagement_score + m.rank_score) desc
       limit 5
    loop
      v_n_ofertas := v_n_ofertas + 1;
      v_linhas := v_linhas ||
        format(E'🔥 <b>%s</b>\n%s\n👉 https://www.solvegrid.com.br/go?oferta=%s&sid=telegram_ofertas_c2_top_%s\n\n',
          left(r.nome, 70),
          case when btrim(r.promo) = '' then coalesce(nullif(r.anunciante, ''), 'Oferta verificada') else left(r.promo, 90) end,
          r.id,
          v_n_ofertas);
      insert into public.nexus_telegram_push_log (trigger_name, event_key, payload_preview)
      values ('c2_ofertas_broadcast', 'c2:oferta:' || r.id, 'dedup oferta: ' || left(r.nome, 60));
    end loop;

    if v_n_bugs + v_n_ofertas = 0 then
      return jsonb_build_object('ok', false, 'motivo', 'sem ofertas/bugs novos (dedup 7d) — silêncio honesto');
    end if;

    v_texto := '🛒 <b>OFERTAS BRASIL — seleção de hoje</b>' || E'\n' ||
               '━━━━━━━━━━━━━━━━━━━━' || E'\n\n' || rtrim(v_linhas, E'\n') || E'\n\n' ||
               '📡 Ative as notificações e compartilhe com quem ama economizar!';

    v_req := public.nexus_telegram_send_to('ofertas', v_texto, 'c2_ofertas_broadcast', 'c2:' || v_hoje);

    return jsonb_build_object('ok', v_req is not null, 'request_id', v_req,
                              'bugs_preco', v_n_bugs, 'ofertas', v_n_ofertas);
  exception when others then
    begin
      insert into public.nexus_telegram_push_log (trigger_name, event_key, payload_preview)
      values ('c2_ofertas_broadcast', null, 'exceção isolada (fail-closed): ' || left(sqlerrm, 140));
    exception when others then null;
    end;
    return jsonb_build_object('ok', false, 'erro', left(sqlerrm, 140));
  end;
end $fn$;

-- ════════════════════════════════════════════════════════════════════════
-- 5) PG_CRON — madrugada 08:30 UTC = 05:30 Brasília (audiência acordando)
-- ════════════════════════════════════════════════════════════════════════
select cron.unschedule('nexus-telegram-c2-ofertas')
  where exists (select 1 from cron.job where jobname = 'nexus-telegram-c2-ofertas');
select cron.schedule('nexus-telegram-c2-ofertas', '30 8 * * *',
  $$select public.nexus_telegram_ofertas_broadcast();$$);

-- ════════════════════════════════════════════════════════════════════════
-- 6) BLINDAGEM DE PRIVILÉGIO (projeto endurecido RLS)
-- ════════════════════════════════════════════════════════════════════════
revoke all on function public.nexus_telegram_send_to(text, text, text, text) from anon, authenticated;
revoke all on function public.nexus_engagement_recruit_c2_trigger() from anon, authenticated;
revoke all on function public.nexus_telegram_ofertas_broadcast() from anon, authenticated;
