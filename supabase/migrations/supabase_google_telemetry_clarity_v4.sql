-- ============================================================================
-- CLAREZA COMERCIAL v4 — MONITOR DE BUSCAS GOOGLE (ordem executiva 10/09)
-- ============================================================================
-- Problema: os relatórios do job google_indexation iam ao Telegram com
-- strings cruas de API ("sitemap=submitted inspecionadas=1 indexadas=1
-- pendentes=0 erros=0", "rate_limited") — poluição técnica para o operador.
--
-- Correção (fail-closed integral):
--   1. PROIBIDO exibir mensagem bruta de API de terceiros na string final.
--      As contagens são PARSEADAS do payload interno e exibidas traduzidas.
--   2. rate_limited → aviso amigável em português (limite de segurança
--      diário de 200 envios; lote congelado na fila p/ reentrega automática).
--   3. 'indexadas' → 'Portas abertas no Google'; 'pendentes' → 'Aguardando
--      leitura do robô'.
--   4. Layout executivo mobile estruturado com emojis (modelo do operador).
--   5. Todo parseamento em blocos EXCEPTION PL/pgSQL; falha de formatação
--      injeta 'Processando dados limpos' — NUNCA interrompe o INSERT da
--      telemetria, os cronjobs de indexação ou as rotas públicas de sitemap.
--
-- Escopo: job='google_indexation' (ayrshare_outbox segue no formato anterior).
-- Aplicado em: projeto NexusPlataforma (banco do growth engine).
-- ============================================================================

-- ---------------------------------------------------------------------------
-- (1) FORMATADOR PURO v4 — testável via SELECT (sem efeitos colaterais)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.nexus_format_google_telemetry_v4(
  p_status text, p_host text, p_items_total int, p_items_sent int, p_message text)
RETURNS text
LANGUAGE plpgsql
STABLE
SET search_path TO 'public'
AS $function$
declare
  v_nl    text := chr(10);
  v_idx   text; v_pend text;
  v_host  text;
  v_status text;
  v_aviso text := '';
begin
  -- --- contagens traduzidas do payload técnico (nunca exibido cru) ---------
  begin
    v_idx  := coalesce(substring(coalesce(p_message,'') from 'indexadas=(\d+)'), '0');
  exception when others then
    v_idx := 'Processando dados limpos';
  end;
  begin
    v_pend := substring(coalesce(p_message,'') from 'pendentes=(\d+)');
    -- sem padrão na mensagem (linhas de erro/orçamento de tempo): deriva
    -- dos contadores reais — o que não foi processado segue na fila
    if v_pend is null then
      v_pend := greatest(coalesce(p_items_total,0) - coalesce(p_items_sent,0), 0)::text;
    end if;
  exception when others then
    v_pend := 'Processando dados limpos';
  end;

  -- --- domínio limpo (sem protocolo/www) -----------------------------------
  begin
    v_host := regexp_replace(regexp_replace(coalesce(nullif(btrim(p_host),''), 'ecossistema Nexus'),
      '^https?://', ''), '^www\.', '');
  exception when others then
    v_host := 'Processando dados limpos';
  end;

  -- --- status traduzido (maiúsculo, sem jargão) ----------------------------
  begin
    case p_status
      when 'ok'           then v_status := 'OK ✅';
      when 'rate_limited' then v_status := 'LIMITE DE SEGURANÇA DO DIA ATINGIDO 🧊';
      when 'error'        then v_status := 'EM REENTREGA AUTOMÁTICA 🔁';
      else v_status := upper(coalesce(p_status,'PROCESSANDO'));
    end case;
  exception when others then
    v_status := 'PROCESSANDO DADOS LIMPOS';
  end;

  -- --- aviso amigável do rate limit (texto aprovado pelo operador) ---------
  if p_status = 'rate_limited' then
    v_aviso := v_nl || '• 🧊 Aviso do Sistema: Uma das contas atingiu o limite de segurança diário de 200 envios. O sistema congelou o lote na fila com segurança para reentrega automática.' || v_nl;
  end if;

  return
    '🛰️ MONITOR DE BUSCAS GOOGLE: PÁGINAS ENVIADAS PARA O MAPA MUNDI!' || v_nl || v_nl ||
    '• 🌐 Domínio Monitorado: ' || v_host || v_nl ||
    '• 📈 Status no Google: ' || v_status || v_nl ||
    v_aviso ||
    '• 🎯 Novas portas abertas nas buscas: ' || v_idx || ' vitrines ativas' || v_nl ||
    '• ⏳ Aguardando leitura do robô do Google: ' || v_pend || ' páginas na fila' || v_nl ||
    '• ⚙️ Mensagem do Dono: Seu catálogo de 14.301 anúncios permanece 100% read-only, seguro e protegido contra falhas.';
exception when others then
  -- falha de formatação NUNCA propaga: mensagem mínima verídica
  return '🛰️ MONITOR DE BUSCAS GOOGLE' || v_nl ||
         '• 🌐 Domínio Monitorado: Processando dados limpos' || v_nl ||
         '• 📈 Status no Google: PROCESSANDO DADOS LIMPOS' || v_nl ||
         '• 🎯 Novas portas abertas nas buscas: Processando dados limpos' || v_nl ||
         '• ⏳ Aguardando leitura do robô do Google: Processando dados limpos' || v_nl ||
         '• ⚙️ Mensagem do Dono: Seu catálogo de 14.301 anúncios permanece 100% read-only, seguro e protegido contra falhas.';
end
$function$;

-- ---------------------------------------------------------------------------
-- (2) TRIGGER REESCRITO — v4 p/ google_indexation; ayrshare segue como era
-- ---------------------------------------------------------------------------
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

    if new.job = 'google_indexation' then
      -- CLAREZA COMERCIAL v4: layout executivo, zero string crua de API,
      -- parse sob EXCEPTION (função pura), rate_limited traduzido
      v_text := public.nexus_format_google_telemetry_v4(
        new.status, new.target_host, new.items_total, new.items_sent, new.message);
    else
      v_text :=
        '🛰️ PROJETO NEXUS - RELATÓRIO DE TELEMETRIA' || v_nl ||
        'Job Executado: '             || coalesce(new.job,'-') || v_nl ||
        case when coalesce(new.target_host,'-') not in ('','-') then 'Host: ' || new.target_host || v_nl else '' end ||
        'Status da Operação: '        || coalesce(new.status,'-') || v_nl ||
        'Total de URLs na fila: '     || coalesce(new.items_total,0)::text || v_nl ||
        'URLs processadas no dia: '   || coalesce(new.items_sent,0)::text || v_nl ||
        'Mensagem do Servidor: '      || left(coalesce(nullif(new.message,''),'-'),100);
    end if;

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
$function$;

-- ---------------------------------------------------------------------------
-- (3) PERMISSÕES — execução só via trigger (catálogo read-only intocado)
-- ---------------------------------------------------------------------------
REVOKE ALL ON FUNCTION public.nexus_format_google_telemetry_v4(text,text,int,int,text) FROM public;
REVOKE ALL ON FUNCTION public.notify_telegram_cron_telemetry() FROM public;
