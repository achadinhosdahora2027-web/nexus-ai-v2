-- ============================================================================
-- supabase_global_unlimited_multilingual_taxonomy.sql
-- MATRIX CORE v7.5 — WIKIDATA GLOBAL TRANSLATION SUITE & DATAMUSE (EN)
-- (Etapa 21.38 · Expansão internacional definitiva · 2026-09-09)
--
-- OBJETIVO: eliminar barreiras linguísticas no dicionário de escuta —
-- termos transacionais em TODAS as línguas com rótulo no Wikidata
-- (muito além dos 196 países: são as línguas reais cobertas pelas
-- entidades Q27686 hotel, Q376880 air travel, Q217107 travel agency,
-- Q11034548 coupon, Q291046 discounts, Q212930 online shopping,
-- Q949715 luxury good, Q170963 VPN — cada uma com labels em 40–153
-- idiomas), + sinônimos EN via Datamuse (API INGLESA por natureza —
-- usada apenas para enriquecer o pool inglês; declarado com honestidade).
--
--   1) language_iso SEM filtro estático: a coluna é text e NÃO possuía
--      CHECK (verificado ao vivo em pg_constraint) — aceita qualquer
--      código ISO planetário (ja, zh, de, fr, ar, es, pt, en, be-tarask…).
--      O filtro que existia era de ROTAÇÃO no código da Edge (v7.5 remove:
--      o pool de varredura agora inclui o pool auto multilíngue).
--   2) Coluna source (curated|auto): as 33 keywords curadas mantêm
--      prioridade de rotação garantida (1 slot dedicado por ciclo);
--      as auto multilíngues giram nos demais slots — cobertura total
--      eventual, sem diluir as curadas de alto EPC.
--   3) RPC nexus_ingest_dynamic_keywords_batch(p_items jsonb):
--      upsert idempotente ON CONFLICT (keyword) DO NOTHING (índice único
--      verificado ao vivo), advisory lock por lote, cap 1000/call,
--      whitelist rígida de categorias (travel|marketplace|security),
--      lowercase determinístico p/ dedup global de string.
--   4) pg_cron 'nexus-keyword-expansion' diário 03:00 UTC (00:00 BRT,
--      madrugada) dispara a Edge ?expand=1 (Wikidata+Datamuse→batch).
--   5) FAIL-CLOSED: EXCEPTION isolado por lote → telemetry silencioso;
--      respostas vazias/timeout de API externa não interrompem nada;
--      catálogo de 14.299 anúncios permanece read-only estrito.
--
-- Aplicado e testado ao vivo em 2026-09-09.
-- ============================================================================

-- ── 1) Coluna source: curated | auto ───────────────────────────────────────
alter table public.nexus_global_target_keywords
  add column if not exists source text not null default 'curated';

create index if not exists nexus_global_target_keywords_source_idx
  on public.nexus_global_target_keywords (active, source);

-- (language_iso: SEM constraint — verificado; nada a remover. Índice forense:)
create index if not exists nexus_global_target_keywords_lang_idx
  on public.nexus_global_target_keywords (language_iso);

-- ── 2) RPC de ingest em lote (massivo, idempotente, travado por advisory) ──
create or replace function public.nexus_ingest_dynamic_keywords_batch(
  p_items jsonb
) returns jsonb
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_total int;
  v_ins   int := 0;
begin
  if p_items is null or jsonb_typeof(p_items) <> 'array' then
    return jsonb_build_object('ok', false, 'error', 'p_items deve ser array json');
  end if;
  v_total := jsonb_array_length(p_items);
  if v_total = 0 then
    return jsonb_build_object('ok', true, 'received', 0, 'inserted', 0, 'skipped', 0);
  end if;
  if v_total > 1000 then
    return jsonb_build_object('ok', false, 'error', 'lote > 1000 itens — fatie (fail-closed)');
  end if;
  if not pg_try_advisory_xact_lock(hashtext('nexus:kw:ingest:batch')) then
    return jsonb_build_object('ok', false, 'error', 'outro lote em curso (advisory lock) — retry');
  end if;

  insert into public.nexus_global_target_keywords
    (keyword, language_iso, product_category, target_niche, source, active)
  select distinct on (lower(btrim(kw)))
         lower(btrim(kw)), lang, cat, 'global_intl', 'auto', true
    from (
      select left(x ->> 'keyword', 200)                                   kw,
             left(lower(coalesce(nullif(x ->> 'language_iso',''), 'en')), 12) lang,
             left(x ->> 'product_category', 40)                           cat
        from jsonb_array_elements(p_items) x
    ) t
   where length(btrim(kw)) between 2 and 200
     and kw ~ '[[:alpha:]]'
     and coalesce(cat, '') in ('travel', 'marketplace', 'security')
  on conflict (keyword) do nothing;

  get diagnostics v_ins := row_count;
  return jsonb_build_object('ok', true, 'received', v_total,
                            'inserted', v_ins, 'skipped', v_total - v_ins);
exception when others then
  perform public.nexus_cron_telemetry_log(
    'kw-expansion','error','db',null,0,0,
    'ingest batch isolado (fail-closed): ' || left(sqlerrm, 140), null);
  return jsonb_build_object('ok', false, 'error', left(sqlerrm, 140));
end $fn$;

-- ── 3) Disparo diário da expansão (madrugada 03:00 UTC = 00:00 BRT) ────────
create or replace function public.nexus_keyword_expansion_fire()
returns jsonb
language plpgsql
security definer
set search_path = public, net, extensions
as $fn$
declare
  v_token text;
  v_req   bigint;
begin
  select value into v_token from public.nexus_growth_secrets
   where key = 'stream_listener_token';
  if v_token is null or v_token = 'PENDING_SET_AT_APPLY' then
    perform public.nexus_cron_telemetry_log(
      'kw-expansion','skipped','edge',null,0,0,
      'fail-closed: stream_listener_token ausente do cofre', null);
    return jsonb_build_object('ok', false, 'reason', 'missing_token');
  end if;

  v_req := net.http_post(
    url      := 'https://etbxbaaaspdcoiakifbb.supabase.co/functions/v1/nexus-matrix-orchester?expand=1',
    body     := '{}'::jsonb,
    headers  := jsonb_build_object(
                  'Content-Type', 'application/json',
                  'x-stream-token', v_token),
    timeout_milliseconds := 30000
  );
  return jsonb_build_object('ok', true, 'http_request_id', v_req);
exception when others then
  perform public.nexus_cron_telemetry_log(
    'kw-expansion','error','edge',null,0,0,
    'fire isolado (fail-closed): ' || left(sqlerrm, 140), null);
  return jsonb_build_object('ok', false, 'error', left(sqlerrm, 140));
end $fn$;

-- pg_cron diário (agendado após deploy+teste da Edge ?expand=1):
select cron.schedule(
  'nexus-keyword-expansion',
  '0 3 * * *',
  $$select public.nexus_keyword_expansion_fire();$$
);

-- ── 4) Hardening: EXECUTE default vai ao PUBLIC — fechar tudo (lição 21.38)
revoke execute on function public.nexus_ingest_dynamic_keywords_batch(jsonb)
  from public, anon, authenticated;
revoke execute on function public.nexus_keyword_expansion_fire()
  from public, anon, authenticated;
