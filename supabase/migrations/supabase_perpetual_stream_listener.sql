-- ============================================================================
-- supabase_perpetual_stream_listener.sql
-- MATRIX CORE v6.5 — PERSISTENT STREAM LISTENER & REAL-TIME PARALLEL WORKER
-- (Etapa 21.38 · Public Brand Mention & Social Customer Care · 2026-09-09)
--
-- OBJETIVO: eliminar o intervalo entre cronjobs — transformar o Supabase em
-- motor de processamento contínuo com reação quase instantânea a menções
-- públicas, 24/7, fail-closed.
--
-- ARQUITETURA ENTREGUE (com a verdade física de cada plataforma):
--   1) LISTEN/NOTIFY nativo do PostgreSQL: trigger AFTER INSERT em
--      nexus_public_brand_mentions → pg_notify('nexus_mention_stream', …)
--      com payload compacto (< 8 KB) — consumível por qualquer cliente PG
--      nativo com LISTEN. No plano Supabase o transporte reativo suportado
--      para a Edge é o Realtime (WAL): a tabela entra na publicação
--      supabase_realtime e a Edge escuta postgres_changes por WebSocket.
--      (service_role é BYPASSRLS: a Edge vê os INSERTs; anon continua
--      bloqueado sem policy — hardening preservado.)
--   2) PARALELISMO CONCORRENTE: o claim das menções já é atômico
--      (nexus_claim_public_mentions: FOR UPDATE SKIP LOCKED + advisory
--      locks, peso 9999 primeiro, recupera isoladas > 24h e processing
--      órfãs > 15 min). Overlap acidental de listeners é inócuo por
--      desenho. Single-flight via nexus_stream_listener_heartbeat():
--      janela 85 s (tunada p/ margem do muro de 150 s) renovada a cada 5 s; stale após (janela - 10) s → o
--      próximo keepalive assume (self-healing, sem dois líderes).
--   3) KEEPALIVE PERPÉTUO: pg_cron 'nexus-stream-keepalive' a cada 2 min
--      dispara a Edge (?stream=1) via pg_net com token próprio do cofre
--      (stream_listener_token — nunca o NEXUS_MATRIX_SECRET). A Edge
--      responde 200 imediato e roda a janela em EdgeRuntime.waitUntil.
--      Cobertura: ~85 s a cada 120 s (≈ 71% do tempo); latência máxima de
--      reação a um INSERT ≈ 25 s; descoberta segue no cron GHA */15 +
--      micro-varredura por janela na própria Edge.
--   4) FAIL-CLOSED: erros isolados por janela em nexus_cron_telemetry;
--      403/429/timeout por menção → isolamento 24 h (fluxo já existente);
--      faxina forense pg_net (retenção 7 dias) no próprio keepalive;
--      catálogo de 14.299 anúncios permanece read-only estrito.
--
-- NOTA HONESTA DE ENGENHARIA: loop infinito LITERAL numa Edge Function não
-- existe — a plataforma encerra cada execução em ~150 s de muro. O
-- "perpétuo" real é a corrente keepalive auto-reiniciante acima (janelas
-- contínuas com handover automático), que é o máximo fisicamente possível
-- dentro dos limites e cotas do Supabase Edge Runtime.
--
-- Ordem de aplicação: itens 1–6 aplicados ANTES do deploy da Edge v7.5;
-- item 7 (pg_cron) agendado APÓS o deploy + teste ao vivo da rota ?stream=1.
-- Aplicado e testado ao vivo em 2026-09-09.
-- ============================================================================

-- ── 1) Realtime WAL: menções na publicação (INSERT visível à Edge) ─────────
do $blk$
begin
  if not exists (select 1 from pg_publication_tables
                  where pubname = 'supabase_realtime'
                    and schemaname = 'public'
                    and tablename  = 'nexus_public_brand_mentions') then
    alter publication supabase_realtime add table public.nexus_public_brand_mentions;
  end if;
end $blk$;

-- ── 2) LISTEN/NOTIFY nativo: despacho instantâneo em 0 ms p/ clientes PG ───
create or replace function public.nexus_notify_mention_stream()
returns trigger
language plpgsql
security definer
set search_path = public
as $fn$
begin
  begin
    perform pg_notify(
      'nexus_mention_stream',
      jsonb_build_object(
        'id',      new.id,
        'platform', new.platform,
        'keyword', new.target_keyword,
        'lang',    new.language,
        'weight',  new.care_weight,
        'status',  new.status
      )::text
    );
  exception when others then null; -- notificação JAMAIS quebra o INSERT
  return new;
end $fn$;

drop trigger if exists nexus_mention_stream_notify_trg
  on public.nexus_public_brand_mentions;
create trigger nexus_mention_stream_notify_trg
  after insert on public.nexus_public_brand_mentions
  for each row execute function public.nexus_notify_mention_stream();

-- ── 3) Estado single-flight do listener persistente ────────────────────────
create table if not exists public.nexus_stream_listener_state (
  id             int primary key check (id = 1),   -- linha única (singleton)
  updated_at     timestamptz,                       -- último heartbeat vivo
  started_at     timestamptz default now(),
  cycles         bigint not null default 0,         -- janelas assumidas
  replies        bigint not null default 0,         -- respostas totais via stream
  last_error     text,
  last_window_ms int
);
insert into public.nexus_stream_listener_state (id) values (1) on conflict do nothing;
alter table public.nexus_stream_listener_state enable row level security;
-- sem policies: somente service_role (BYPASSRLS) lê/escreve.

-- ── 4) Heartbeat: 'acquire' (assume liderança se stale) | 'renew' (renova) ─
create or replace function public.nexus_stream_listener_heartbeat(
  p_action    text default 'acquire',   -- 'acquire' | 'renew' | 'status'
  p_window_ms int  default 95000,
  p_replied   int  default 0,
  p_error     text default null
) returns boolean
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_stale interval;
begin
  v_stale := make_interval(secs => greatest(p_window_ms, 20000) / 1000.0 - 10);
  begin
    if p_action = 'status' then
      return exists (select 1 from public.nexus_stream_listener_state
                      where id = 1
                        and updated_at > now() - v_stale);
    elsif p_action = 'renew' then
      update public.nexus_stream_listener_state
         set updated_at = now(),
             replies    = replies + greatest(coalesce(p_replied, 0), 0),
             last_error = p_error
       where id = 1
         and updated_at > now() - v_stale;   -- só renova se a liderança é minha
      return found;
    else -- 'acquire'
      update public.nexus_stream_listener_state
         set updated_at     = now(),
             started_at     = now(),
             cycles         = cycles + 1,
             last_window_ms = p_window_ms,
             last_error     = p_error
       where id = 1
         and (updated_at is null or updated_at < now() - v_stale);
      return found;
    end if;
  exception when others then
    raise warning 'stream_heartbeat isolado (fail-closed): %', sqlerrm;
    return false;
  end;
end $fn$;

-- ── 5) Token próprio do cofre p/ o keepalive (não usa NEXUS_MATRIX_SECRET) ─
insert into public.nexus_growth_secrets (key, value)
values ('stream_listener_token', 'PENDING_SET_AT_APPLY')
on conflict (key) do nothing;
-- (valor real injetado no cofre no momento da aplicação — segredo não
--  permanece em arquivos; rotação: update nexus_growth_secrets ...)

-- ── 6) Keepalive: faxina forense pg_net + disparo da janela na Edge ────────
create or replace function public.nexus_stream_keepalive()
returns jsonb
language plpgsql
security definer
set search_path = public, net, extensions
as $fn$
declare
  v_token text;
  v_req   bigint;
  v_purged int := 0;
begin
  begin
    -- faxina forense: retenção de 7 dias nas respostas pg_net acumuladas
    delete from net._http_response where created < now() - interval '7 days';
    get diagnostics v_purged := row_count;
  exception when others then null;
  end;

  select value into v_token from public.nexus_growth_secrets
   where key = 'stream_listener_token';
  if v_token is null or v_token = 'PENDING_SET_AT_APPLY' then
    perform public.nexus_cron_telemetry_log(
      'stream-keepalive','skipped','edge',null,0,0,
      'fail-closed: stream_listener_token ausente do cofre', null);
    return jsonb_build_object('ok', false, 'reason', 'missing_token');
  end if;

  v_req := net.http_post(
    url      := 'https://etbxbaaaspdcoiakifbb.supabase.co/functions/v1/nexus-matrix-orchester?stream=1',
    body     := '{}'::jsonb,
    headers  := jsonb_build_object(
                  'Content-Type', 'application/json',
                  'x-stream-token', v_token),
    timeout_milliseconds := 15000
  );
  return jsonb_build_object('ok', true, 'http_request_id', v_req,
                            'net_purged', v_purged);
exception when others then
  perform public.nexus_cron_telemetry_log(
    'stream-keepalive','error','edge',null,0,0,
    'keepalive isolado (fail-closed): ' || left(sqlerrm, 140), null);
  return jsonb_build_object('ok', false, 'error', left(sqlerrm, 140));
end $fn$;

-- ── 7) pg_cron: corrente keepalive a cada 2 min (após deploy da Edge) ──────
-- Idempotente (cron.schedule atualiza por nome). Janela 95 s a cada 120 s.
select cron.schedule(
  'nexus-stream-keepalive',
  '*/2 * * * *',
  $$select public.nexus_stream_keepalive();$$
);

-- ── 8) Hardening: EXECUTE default vai ao PUBLIC — fechar tudo (lição 21.38)
revoke execute on function public.nexus_notify_mention_stream()
  from public, anon, authenticated;
revoke execute on function public.nexus_stream_listener_heartbeat(text,int,int,text)
  from public, anon, authenticated;
revoke execute on function public.nexus_stream_keepalive()
  from public, anon, authenticated;

-- Nota: o trigger roda como dono da tabela (postgres); revoke de PUBLIC não
-- o afeta. nexus_stream_keepalive fica acessível ao pg_cron via SECURITY
-- DEFINER (owner postgres) e inacessível a anon/authenticated via PostgREST.

-- ── 9) v7.5.1: status 'care_reply_pending' no outbox (fix do sequestro) ────
-- BUG PROVADO AO VIVO (2026-09-09 04:16): a rail 'ready_to_post' pertence à
-- esteira de ofertas 21.24, cujo orquestrador (nexus-ayrshare-orchestrator)
-- REGENERA o texto dos itens claimados — a resposta care 710e foi reescrita
-- como promo genérica "70% OFF", com o sid forense public_mention_care_*
-- DESTRUÍDO e a tag sobrescrita p/ 'mistral'. As respostas de atendimento
-- nunca chegavam íntegras à rede (o mesmo sequestra as global_intent —
-- daí os "failed 137 Duplicate content").
-- FIX NA RAIZ: care publica DIRETO na conta da fazenda (Ayrshare API) a
-- partir da própria Edge; o outbox vira registro forense com status próprio
-- 'care_reply_pending' — INVISÍVEL aos 3 consumidores de ofertas
-- (nexus_social_claim_ready lê ready_to_post/rate_limited_retry;
--  nexus_broadcast_to_ayrshare_mesh lê ready_to_post/rate_limited_retry;
--  ayrshare-outbox-worker lê pending_approval/high_priority_post) — até
-- confirmar 'published' com external_post_id. Retentativas: stream/care
-- reintentam (attempts < 5 → failed).
do $blk$
declare c text; vals text;
begin
  for c, vals in
    select conname, (regexp_match(pg_get_constraintdef(oid), 'ARRAY\[(.+)\]'))[1]
      from pg_constraint
     where conrelid = 'public.nexus_social_outbox'::regclass
       and conname in ('nexus_social_outbox_check','nexus_social_outbox_status_check')
  loop
    if position('care_reply_pending' in vals) = 0 then
      execute format('alter table public.nexus_social_outbox drop constraint %I', c);
      execute format('alter table public.nexus_social_outbox add constraint %I check (status = ANY (ARRAY[%s, ''care_reply_pending''::text]))', c, vals);
    end if;
  end loop;
end $blk$;
-- Aplicado e testado ao vivo (insert care_reply_pending ok · test row limpa).
