-- ===========================================================================
-- 21.25 — SANEAMENTO DO FEED SOCIAL: GUARDA ANTI-DUPLO-POST + FILTRO 320×320
-- ---------------------------------------------------------------------------
-- Diagnóstico homologado pelo dono (feed Instagram): race condition entre
-- gatilhos concorrentes (duplo post da mesma oferta) + injeção de mídia
-- abaixo do teto de renderização (pixels 1x1 / trackers da CJ).
--
-- Censo real que motiva o filtro (2026-09-08, tabela ads ATIVOS = 12.165):
--   * 4.477 anúncios ativos são pixels 1x1 (trackers — NUNCA foram mídia)
--   * 6.675 ativos com largura/altura < 320 (baixa resolução)
--   *   263 ativos sem dimensão declarada
--   *   750 ativos ≥ 320×320 → ÚNICO pool legítimo para imagem social
--
-- Correções (todas aditivas, fail-closed, ads 100% READ-ONLY):
--   §1 nexus_social_feed_healthcheck() — purga/soft-delete + expiração de
--      claims + reagenda presos (chamada 24/7 pelo próprio ciclo)
--   §2 Índices UNIQUE transitórios — impossível processar o mesmo produto
--      simultaneamente em duas filas (defesa em profundidade no DB)
--   §3 nexus_social_claim_ready() — claim ATÔMICO (FOR UPDATE SKIP LOCKED +
--      pg_try_advisory_xact_lock por item + blindagem 7d contra published)
--   §4 nexus_buffer_pick_offers() v2 — 320×320 rígido + advisory lock no
--      pescador + CLAIM TRANSACIONAL (a oferta vira 'claimed' no mesmo
--      milissegundo da pesca — a janela de dupla pesca morre aqui)
--   §5 nexus_ayrshare_enqueue_batch() v2 — 320×320 rígido (era height≥308)
--      + advisory lock serializando enqueues concorrentes + healthcheck
--   §6 nexus_matrix_claim_tasks() v2 — advisory lock por task (orquestrador
--      de IA v4: claim pós-leitura no mesmo milissegundo)
--   §7 Guardas de dimensão nas vias manuais (social_enqueue / approve /
--      promote) — nada abaixo de 320×320 entra na fila por NENHUM caminho
--   §8 Telemetria de ativação
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- §1 HEALTH-CHECK 24/7 (soft-delete apenas nas FILAS — ads intocados)
-- ---------------------------------------------------------------------------
create or replace function public.nexus_social_feed_healthcheck()
returns jsonb
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_requeued  int := 0;
  v_dup       int := 0;
  v_lowres    int := 0;
  v_expired   int := 0;
  v_px1       int; v_low int; v_ok int; v_nodim int;
begin
  begin
    -- (a) itens presos em 'dispatching' (orquestrador interrompido) → volta
    update public.nexus_social_outbox
       set status = 'ready_to_post', updated_at = now()
     where status = 'dispatching'
       and updated_at < now() - interval '30 minutes';
    get diagnostics v_requeued := row_count;
  exception when others then null; end;

  begin
    -- (b) PURGA duplicados abertos: mesmo produto em estados abertos na
    --     mesma janela de data → mantém o mais antigo, soft-delete o resto
    --     v6.5 FIX (21.38, 2026-09-09): rows com product_id NULL (replies de
    --     atendimento/intent — posts ÚNICOS, não ofertas de produto) NÃO
    --     participam do dedup: antes todas caíam na mesma partição NULL e a
    --     mais nova era purgada como "duplicada" (bug provado ao vivo — row
    --     care 9999 purgada pela rail 04:10; fix testado: purged 0 e row
    --     sobreviveu).
    with abertos as (
      select id, product_id, created_at,
             row_number() over (partition by product_id order by created_at asc, id asc) as rn
        from public.nexus_social_outbox
       where product_id is not null
         and status in ('ready_to_post','dispatching','pending_approval',
                        'high_priority_post','approved','rate_limited_retry'))
    update public.nexus_social_outbox o
       set status = 'purged_duplicate', updated_at = now(),
           last_error_code = 'sanity 21.25: duplicado na janela — soft-delete'
      from abertos a
     where o.id = a.id and a.rn > 1;
    get diagnostics v_dup := row_count;
  exception when others then null; end;

  begin
    -- (c) PURGA mídia fora do compliance (ad < 320x320 / pixel 1x1)
    update public.nexus_social_outbox o
       set status = 'purged_lowres', updated_at = now(),
           last_error_code = 'sanity 21.25: mídia abaixo de 320x320 — soft-delete'
      from public.ads a
     where o.product_id = a.id
       and o.status in ('ready_to_post','pending_approval','high_priority_post','approved')
       and (coalesce(a.width,0) < 320 or coalesce(a.height,0) < 320);
    get diagnostics v_lowres := row_count;
  exception when others then null; end;

  begin
    -- (d) claims Buffer órfãs (dispatcher morreu no meio) → expira (2h)
    update public.nexus_buffer_outbox
       set status = 'expired'
     where status = 'claimed'
       and created_at < now() - interval '2 hours';
    get diagnostics v_expired := row_count;
  exception when others then null; end;

  -- censo do pool (números REAIS, nunca hardcode)
  select count(*) filter (where width = 1 and height = 1),
         count(*) filter (where coalesce(width,0) < 320 or coalesce(height,0) < 320),
         count(*) filter (where width >= 320 and height >= 320),
         count(*) filter (where width is null or height is null)
    into v_px1, v_low, v_ok, v_nodim
    from public.ads where active;

  perform public.nexus_cron_telemetry_log(
    'nexus-social-healthcheck','ok','feed-sanity',null,
    v_dup + v_lowres + v_expired, v_requeued,
    'healthcheck 21.25: purga ' || v_dup || ' duplicados / ' || v_lowres ||
    ' lowres / ' || v_expired || ' claims expiradas / ' || v_requeued ||
    ' reenfileirados · pool imagem: ' || v_ok || ' ok-320 · excluídos: ' ||
    v_px1 || ' pixels-1x1 + ' || v_low || ' baixa-res + ' || v_nodim || ' sem-dim',
    jsonb_build_object('purged_duplicate', v_dup, 'purged_lowres', v_lowres,
                       'claims_expiradas', v_expired, 'requeued', v_requeued,
                       'pool_ok_320', v_ok, 'pool_px_1x1', v_px1,
                       'pool_baixa_res', v_low, 'pool_sem_dim', v_nodim));

  return jsonb_build_object('requeued', v_requeued, 'purged_duplicate', v_dup,
                            'purged_lowres', v_lowres, 'claims_expiradas', v_expired,
                            'pool_ok_320', v_ok, 'pool_px_1x1', v_px1,
                            'pool_baixa_res', v_low, 'pool_sem_dim', v_nodim);
exception when others then
  perform public.nexus_cron_telemetry_log('nexus-social-healthcheck','error',null,null,0,0,
    'healthcheck isolado (fail-closed): ' || left(sqlerrm, 140), null);
  return jsonb_build_object('ok', false, 'error', left(sqlerrm, 180));
end $fn$;

-- DDL 21.25: expande o domínio de status da fila Ayrshare para os estados
-- de saneamento (purged_duplicate / purged_lowres — soft-delete que preserva
-- histórico). Havia DUAS constraints idênticas (check + status_check).
alter table public.nexus_social_outbox drop constraint nexus_social_outbox_check;
alter table public.nexus_social_outbox
  add constraint nexus_social_outbox_check
  check (status in ('pending_approval','approved','dispatching','published','failed',
                    'rejected','high_priority_post','ready_to_post','rate_limited_retry',
                    'purged_duplicate','purged_lowres'));
alter table public.nexus_social_outbox drop constraint nexus_social_outbox_status_check;
alter table public.nexus_social_outbox
  add constraint nexus_social_outbox_status_check
  check (status in ('pending_approval','approved','dispatching','published','failed',
                    'rejected','high_priority_post','ready_to_post','rate_limited_retry',
                    'purged_duplicate','purged_lowres'));

-- ---------------------------------------------------------------------------
-- §2 ÍNDICES UNIQUE TRANSITÓRIOS (anti-processamento simultâneo)
--     Estados terminais (published/scheduled/purged_*) ficam FORA do índice:
--     o dedup global de 7 dias continua sendo lógico — re-post após 7d é
--     legítimo e não pode ser bloqueado por constraint.
-- ---------------------------------------------------------------------------
create unique index if not exists uq_social_outbox_em_execucao
  on public.nexus_social_outbox (product_id)
  where status in ('ready_to_post','dispatching');

create unique index if not exists uq_buffer_outbox_em_execucao
  on public.nexus_buffer_outbox (product_id)
  where status = 'claimed';

-- ---------------------------------------------------------------------------
-- §3 CLAIM ATÔMICO DA FILA AYRSHARE (transição no mesmo milissegundo)
--     FOR UPDATE SKIP LOCKED + pg_try_advisory_xact_lock por item +
--     blindagem: produto publicado nos últimos 7 dias NÃO é claimado de novo
-- ---------------------------------------------------------------------------
create or replace function public.nexus_social_claim_ready(p_limit integer default 3)
returns table(id uuid, product_id uuid, post_text text, media_url text,
              public_url text, platforms jsonb, attempts integer,
              priority integer, tag text, offer_meta jsonb)
language plpgsql
security definer
set search_path = public
as $fn$
begin
  return query
  update public.nexus_social_outbox o
     set status = 'dispatching',
         attempts = o.attempts + 1,
         dispatched_at = now(),
         last_error_code = null,
         updated_at = now()
   where o.id in (
     select c.id
       from public.nexus_social_outbox c
      where c.status in ('ready_to_post','rate_limited_retry')
        and c.attempts < 5
        and pg_try_advisory_xact_lock(hashtextextended('nexus:social:claim:' || c.id::text, 0))
        and not exists (
              select 1 from public.nexus_social_outbox p
               where p.product_id = c.product_id
                 and p.status = 'published'
                 and p.published_at > now() - interval '7 days')
      order by c.priority desc, c.created_at asc
      limit greatest(coalesce(p_limit, 3), 1)
        for update skip locked)
  returning o.id, o.product_id, o.post_text, o.media_url, o.public_url,
            o.platforms, o.attempts, o.priority, o.tag, o.offer_meta;
exception when others then
  raise warning 'claim_ready isolado (fail-closed): %', sqlerrm;
  return;
end $fn$;

revoke execute on function public.nexus_social_claim_ready(int) from anon, authenticated;

-- DDL 21.25: a claim transacional nasce ANTES da escolha do canal/copy
-- (estado 'claimed') — canal/texto/mídia/url são completados pelo dispatcher
-- v5.2 no PATCH de confirmação. Relaxa NOT NULL das 4 colunas de conteúdo
-- (histórico 'scheduled' permanece integralmente preenchido).
alter table public.nexus_buffer_outbox
  alter column channel_service drop not null,
  alter column "text"            drop not null,
  alter column media_url         drop not null,
  alter column public_url        drop not null;

-- DDL 21.25 (2): expande o domínio de status para o ciclo de vida da claim
-- transacional: claimed (pescada, aguardando post) → scheduled (post criado
-- no Buffer) · pick_failed (canal não publicou — libera p/ próximo ciclo) ·
-- expired (claim órfã > 2h — healthcheck)
alter table public.nexus_buffer_outbox
  drop constraint nexus_buffer_outbox_status_check;
alter table public.nexus_buffer_outbox
  add constraint nexus_buffer_outbox_status_check
  check (status in ('claimed','scheduled','sent','error','failed',
                    'pick_failed','expired'));

-- ---------------------------------------------------------------------------
-- §4 BUFFER PICK v2 — filtro rígido 320×320 + advisory lock do pescador +
--     CLAIM TRANSACIONAL (fim da janela de dupla pesca: a row 'claimed'
--     nasce no mesmo statement que seleciona a oferta)
-- ---------------------------------------------------------------------------
create or replace function public.nexus_buffer_pick_offers(p_limit integer default 2)
returns jsonb
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_result jsonb;
begin
  -- GUARDA ANTI-CORRIDA: só um pescador por vez (transações concorrentes
  -- recebem vazio — fail-closed, o próximo ciclo do cron pega o resto)
  if not pg_try_advisory_xact_lock(hashtext('nexus:buffer:pick')) then
    return '[]'::jsonb;
  end if;

  with pool as (
    select m.id
      from public.nexus_public_offers_ordered_mv m
      join public.ads a on a.id = m.id
     where a.html_code like '%<img%'
       and a.active
       and a.width  >= 320
       and a.height >= 320
       and a.width::numeric / a.height::numeric between 0.75 and 1.91
       and not exists (
             select 1 from public.nexus_buffer_outbox b
              where b.product_id = m.id
                and b.status in ('claimed','scheduled')
                and b.created_at > now() - interval '7 days')
     order by m.rank_score desc
     limit greatest(coalesce(p_limit, 2), 1)
  ),
  ins as (
    insert into public.nexus_buffer_outbox (product_id, status)
    select id, 'claimed' from pool
    on conflict do nothing
    returning product_id, id as claim_id
  )
  select coalesce(jsonb_agg(row_to_json(r) order by r.rank_score desc), '[]'::jsonb)
    into v_result
    from (
      select m2.id,
             m2.offer_json ->> 'nome'       as nome,
             m2.offer_json ->> 'anunciante' as anunciante,
             m2.offer_json ->> 'categoria'  as categoria,
             m2.offer_json ->> 'promo'      as promo,
             m2.offer_json ->> 'cupom'      as cupom,
             m2.offer_json ->> 'regiao'     as regiao,
             m2.offer_json ->> 'epc_7d'     as epc_7d,
             substring(a2.html_code from 'src="(https?://[^"]+)"') as img,
             m2.rank_score,
             ins.claim_id
        from pool p
        join public.nexus_public_offers_ordered_mv m2 on m2.id = p.id
        join public.ads a2 on a2.id = p.id
        left join ins on ins.product_id = p.id
    ) r;

  return v_result;
exception when others then
  perform public.nexus_cron_telemetry_log('nexus-buffer-dispatcher','pick_error','buffer',null,
    coalesce(p_limit,2), 0, 'pick isolado (fail-closed): ' || left(sqlerrm, 140), null);
  return '[]'::jsonb;
end $fn$;

-- ---------------------------------------------------------------------------
-- §5 ENQUEUE BATCH v2 — 320×320 rígido (era height≥308) + advisory lock
--     serializando enqueues concorrentes + healthcheck no início da run
-- ---------------------------------------------------------------------------
create or replace function public.nexus_ayrshare_enqueue_batch(p_top integer default 10)
returns jsonb
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_candidate record;
  v_img     text;
  v_slug    text;
  v_pub     text;
  v_rank    numeric;
  v_name    text;
  v_loja    text;
  v_cat     text;
  v_promo   text;
  v_cupom   text;
  v_net     text;
  v_enqueued  int := 0;
  v_rejected  int := 0;
  v_skip_media int := 0;
  v_skip_dedup int := 0;
  v_hc       jsonb;
begin
  set local statement_timeout = 0;

  -- GUARDA ANTI-CORRIDA: dois gatilhos concorrentes (cron + manual) não
  -- podem enfileirar a mesma oferta — o segundo sai em silêncio (fail-closed)
  if not pg_try_advisory_xact_lock(hashtext('nexus:social:enqueue')) then
    perform public.nexus_cron_telemetry_log('nexus-ayrshare-cycle','skipped_lock',null,null,0,0,
      'enqueue pulado: outro ciclo concorrente segurando o advisory lock (anti-duplo-post 21.25)', null);
    return jsonb_build_object('ok', true, 'skipped', 'advisory_lock_concorrente');
  end if;

  -- healthcheck 24/7 do feed (purga duplicados/lowres, expira claims,
  -- reagenda presos) — isolado: nunca derruba o enqueue
  begin
    v_hc := public.nexus_social_feed_healthcheck();
  exception when others then
    v_hc := null;
  end;

  for v_candidate in
    with ranked as (
      select m.id,
             m.rank_score,
             m.offer_json ->> 'nome'       as nome,
             m.offer_json ->> 'anunciante' as anunciante,
             m.offer_json ->> 'categoria'  as categoria,
             m.offer_json ->> 'promo'      as promo,
             m.offer_json ->> 'cupom'      as cupom,
             m.offer_json ->> 'regiao'     as regiao,
             m.offer_json ->> 'epc_7d'     as epc_7d,
             a.html_code,
             a.click_url,
             a.updated_fx_at,
             m.rank_score
               + case when a.updated_fx_at > now() - interval '24 hours' then 15 else 0 end
               + case when exists (select 1 from public.nexus_weather_snapshots w
                                    where w.fetched_at > now() - interval '24 hours'
                                      and w.city_slug is not null
                                      and position(lower(w.city_slug) in lower(coalesce(m.offer_json ->> 'nome',''))) > 0)
                      then 10 else 0 end as boosted_rank
        from public.nexus_public_offers_ordered_mv m
        join public.ads a on a.id = m.id
       where a.html_code like '%<img%'
         and a.active
         and a.width  >= 320
         and a.height >= 320
    )
    select * from ranked
     order by boosted_rank desc
     limit greatest(coalesce(p_top, 10), 1)
  loop
    begin
      select coalesce(
               substring(html_code from 'src="(https?://[^"]+)"'),
               substring(html_code from 'src=''(https?://[^'']+)'''))
        into v_img
        from public.ads where id = v_candidate.id;
      if v_img is null or v_img = '' then
        v_skip_media := v_skip_media + 1;
        continue;
      end if;

      -- dedup: mesma oferta só volta à fila após 7 dias
      if exists (select 1 from public.nexus_social_outbox o
                  where o.product_id = v_candidate.id
                    and o.created_at > now() - interval '7 days') then
        v_skip_dedup := v_skip_dedup + 1;
        continue;
      end if;

      v_name  := left(coalesce(nullif(v_candidate.nome,''), 'Oferta imperdível do dia'), 140);
      v_loja  := left(coalesce(nullif(v_candidate.anunciante,''), 'loja parceira'), 80);
      v_cat   := left(coalesce(v_candidate.categoria,''), 60);
      v_promo := left(coalesce(v_candidate.promo,''), 60);
      v_cupom := left(coalesce(v_candidate.cupom,''), 40);

      v_net := case
        when v_candidate.click_url ~ '(kqzyfj|dpbolvw|jdoqocy|anrdoezrs|tkqlhce|rzekl|wbbsv|xqjeo|bednari|ftjcfx|qksrv|ojrq|emjcd)' then 'cj'
        when v_candidate.click_url like '%awin1.com%' then 'awin'
        when v_candidate.click_url like '%lmdee.link%' or v_candidate.click_url like '%lomadee%' then 'lomadee'
        when v_candidate.click_url like '%sjv.io%' or v_candidate.click_url like '%trk.udemy%' then 'impact'
        else 'outros'
      end;

      v_slug := btrim(regexp_replace(lower(coalesce(nullif(v_candidate.nome,''),'oferta')), '[^a-z0-9]+', '-', 'g'), '-');
      if v_slug = '' or v_slug is null then v_slug := 'oferta'; end if;
      v_slug := btrim(left('of-' || v_net || '-' || v_slug, 90), '-');

      insert into public.nexus_ecommerce_routes
        (id, product_slug, network_source, title, description, image_url,
         affiliate_link, active, content_cluster, source_product_id)
      values (v_candidate.id, v_slug, v_net, v_name,
              left('Oferta verificada: ' || v_name, 300), v_img,
              'https://www.solvegrid.com.br/go?oferta=' || v_candidate.id, true,
              'ecommerce', v_candidate.id::text)
      on conflict (id) do update
         set title = excluded.title,
             image_url = excluded.image_url,
             active = true,
             atualizado_em = now();

      v_pub := 'https://www.solvegrid.com.br/go?oferta=' || v_candidate.id::text;
      v_rank := coalesce(v_candidate.boosted_rank, 0);

      insert into public.nexus_social_outbox
        (product_id, post_text, media_url, public_url, platforms, status,
         priority, tag, offer_meta)
      values (v_candidate.id,
              left('🔥 Achado do dia na ' || v_loja || '! ' || v_name ||
                   case when v_promo <> '' then ' — ' || v_promo else '' end ||
                   case when v_cupom <> '' then ' (cupom ' || v_cupom || ')' else '' end ||
                   ' Corre que é por tempo limitado 👉 ' || v_pub || ' #achadinhos #promocao', 480),
              v_img, v_pub,
              '["instagram","pinterest","tiktok"]'::jsonb, 'ready_to_post',
              least(greatest(v_rank::int, 1), 999), 'template',
              jsonb_build_object('nome', v_name, 'anunciante', v_loja, 'categoria', v_cat,
                                 'promo', v_promo, 'cupom', v_cupom,
                                 'regiao', coalesce(v_candidate.regiao,''),
                                 'epc_7d', coalesce(v_candidate.epc_7d,'')::text))
      on conflict do nothing;

      v_enqueued := v_enqueued + 1;
    exception when others then
      v_rejected := v_rejected + 1;
      perform public.nexus_cron_telemetry_log('nexus-ayrshare-cycle','rejected',null,null,1,0,
        'oferta ' || coalesce(v_candidate.id::text,'?') || ' isolada (fail-closed): ' || left(sqlerrm, 120),
        jsonb_build_object('offer', v_candidate.id));
    end;
  end loop;

  perform public.nexus_cron_telemetry_log('nexus-ayrshare-cycle','ok',null,null,
    v_enqueued + v_skip_dedup + v_skip_media + v_rejected, v_enqueued,
    'enqueue v2 (320x320 rígido): ' || v_enqueued || ' enfileiradas / ' || v_skip_dedup ||
    ' dedup-7d / ' || v_skip_media || ' sem banner / ' || v_rejected || ' isoladas',
    jsonb_build_object('enqueued', v_enqueued, 'dedup', v_skip_dedup,
                       'no_media', v_skip_media, 'rejected', v_rejected,
                       'filtro', 'width>=320 AND height>=320',
                       'healthcheck', v_hc));

  return jsonb_build_object('enqueued', v_enqueued, 'dedup', v_skip_dedup,
                            'no_media', v_skip_media, 'rejected', v_rejected,
                            'healthcheck', v_hc);
exception when others then
  perform public.nexus_cron_telemetry_log('nexus-ayrshare-cycle','error',null,null,
    coalesce(p_top,10), v_enqueued, 'exceção raiz (fail-closed): ' || left(sqlerrm, 140), null);
  return jsonb_build_object('ok', false, 'error', left(sqlerrm, 200));
end $fn$;

-- ---------------------------------------------------------------------------
-- §6 MATRIX CLAIM v2 — advisory lock por task (claim pós-leitura atômico
--    para o orquestrador de IA v4; recuperação de stale mantida)
-- ---------------------------------------------------------------------------
create or replace function public.nexus_matrix_claim_tasks(p_limit integer default 8, p_stale_seconds integer default 1800)
returns setof public.nexus_agent_tasks_queue
language plpgsql
set search_path = public
as $fn$
begin
  -- recupera tarefas 'running' órfãs (crash/timeout) — fail-closed com reentrega
  update public.nexus_agent_tasks_queue q
     set status = 'pending', claimed_at = null
   where q.status = 'running'
     and q.claimed_at < now() - (coalesce(p_stale_seconds,1800) || ' seconds')::interval;

  return query
  update public.nexus_agent_tasks_queue q
     set status = 'running', claimed_at = now(), attempts = q.attempts + 1
   where q.id in (
     select id from public.nexus_agent_tasks_queue
      where status = 'pending' and run_after <= now()
        and pg_try_advisory_xact_lock(hashtextextended('nexus:matrix:task:' || id::text, 0))
      order by priority asc, run_after asc
      limit greatest(coalesce(p_limit,8),0)
        for update skip locked)
  returning q.*;
exception when others then
  raise warning 'matrix_claim isolado (fail-closed): %', sqlerrm;
  return;
end $fn$;

-- ---------------------------------------------------------------------------
-- §7 GUARDAS DE DIMENSÃO NAS VIAS MANUAIS (nenhum caminho burla o 320×320)
-- ---------------------------------------------------------------------------
create or replace function public.nexus_social_enqueue(p_product_id uuid, p_post text, p_media_url text, p_public_url text, p_platforms text[] default array['instagram'::text,'pinterest'::text,'tiktok'::text], p_tag text default null, p_high_priority boolean default false, p_override_dimension boolean default false)
returns uuid
language plpgsql
set search_path = public
as $fn$
declare v_id uuid; v_exists uuid;
begin
  begin
    if p_product_id is null or nullif(btrim(p_post),'') is null then
      raise warning 'social_enqueue: product_id e post obrigatorios';
      return null;
    end if;
    -- guarda 21.25: mídia abaixo do teto 320x320 não entra na fila
    -- (p_override_dimension permite post manual explícito do dono)
    if not p_override_dimension and not exists (
      select 1 from public.ads
       where id = p_product_id and width >= 320 and height >= 320) then
      perform public.nexus_cron_telemetry_log('social_outbox','rejected_lowres',null,null,1,0,
        'social_enqueue: produto ' || p_product_id || ' com mídia < 320x320 — recusado (compliance 21.25)', null);
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
    perform public.nexus_cron_telemetry_log('social_outbox','enqueue_error',null,null,1,0,
      'social_enqueue isolado (fail-closed): ' || left(sqlerrm, 140),
      jsonb_build_object('product_id', p_product_id));
    return null;
  end;
end $fn$;

create or replace function public.nexus_approve_social_candidate(p_candidate_id uuid, p_post_text text)
returns uuid
language plpgsql
security definer
set search_path = public
as $fn$
DECLARE
  v_candidate public.nexus_social_candidate_queue%ROWTYPE;
  v_outbox_id UUID;
  v_text TEXT := BTRIM(p_post_text);
BEGIN
  SELECT * INTO v_candidate
  FROM public.nexus_social_candidate_queue
  WHERE id = p_candidate_id AND status = 'pending_approval'
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Candidate is not pending approval';
  END IF;

  IF v_text IS NULL OR char_length(v_text) < 1 OR char_length(v_text) > 3000 THEN
    RAISE EXCEPTION 'Invalid approved post text';
  END IF;

  IF POSITION(v_candidate.public_url IN v_text) = 0 THEN
    RAISE EXCEPTION 'Approved post text must contain public URL';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.nexus_ecommerce_routes
    WHERE id = v_candidate.product_id AND active IS TRUE
  ) THEN
    RAISE EXCEPTION 'Candidate product is no longer active';
  END IF;

  -- guarda 21.25: aprovação exige mídia compliance 320x320
  IF NOT EXISTS (
    SELECT 1 FROM public.ads
    WHERE id = v_candidate.product_id AND width >= 320 AND height >= 320
  ) THEN
    RAISE EXCEPTION 'Media below 320x320 compliance floor (21.25) — aprovacao negada';
  END IF;

  INSERT INTO public.nexus_social_outbox (
    product_id, post_text, media_url, public_url, status, approved_at, created_at, updated_at
  ) VALUES (
    v_candidate.product_id, v_text, v_candidate.media_url, v_candidate.public_url,
    'approved', NOW(), NOW(), NOW()
  ) RETURNING id INTO v_outbox_id;

  UPDATE public.nexus_social_candidate_queue
  SET status = 'approved_for_copy', updated_at = NOW()
  WHERE id = v_candidate.id;

  RETURN v_outbox_id;
END $fn$;

create or replace function public.nexus_social_promote(p_public_url text, p_tag text default 'alta-conversao-global'::text)
returns uuid
language plpgsql
set search_path = public
as $fn$
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
      -- guarda 21.25: promoção de candidato exige mídia 320x320
      if not exists (select 1 from public.ads
                      where id = v_cand.product_id
                        and width >= 320 and height >= 320) then
        perform public.nexus_cron_telemetry_log('social_outbox','rejected_lowres',null,null,1,0,
          'social_promote: candidato com mídia < 320x320 — recusado (compliance 21.25)', null);
        return null;
      end if;
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
end $fn$;

-- ---------------------------------------------------------------------------
-- §8 TELEMETRIA DE ATIVAÇÃO
-- ---------------------------------------------------------------------------
select public.nexus_cron_telemetry_log(
  'nexus-social-sanity','activated','feed-sanity',null,0,0,
  'SANEAMENTO 21.25 ATIVO: (1) filtro rígido width>=320 AND height>=320 em TODOS os seletores (enqueue_batch v2, buffer_pick v2, guardas em social_enqueue/approve/promote) — 4.477 pixels 1x1 e 6.675 baixa-res EXCLUÍDOS do pool de transmissão (750 elegíveis); (2) trava anti-duplo-post: pg_try_advisory_xact_lock no enqueue/pick/claim (matrix_claim_tasks v2 + nexus_social_claim_ready novo) + claims transacionais no Buffer (status claimed no mesmo statement da pesca) + índices unique transitórios uq_social_outbox_em_execucao/uq_buffer_outbox_em_execucao; (3) purga/healthcheck 24/7 nexus_social_feed_healthcheck (soft-delete purged_duplicate/purged_lowres, expira claims 2h, reagenda presos 30min) — chamado a cada ciclo do enqueue; ads 100% read-only; fail-closed em todas as camadas',
  jsonb_build_object('versao','21.25','filtro','320x320','pool_ok',750,
                     'pool_1x1_excluidos',4477,'pool_lowres_excluidos',6675));
