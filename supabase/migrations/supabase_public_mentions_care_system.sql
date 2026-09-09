-- ============================================================================
-- PUBLIC BRAND MENTION & SOCIAL CUSTOMER CARE SUITE (21.38 v6.0)
-- ============================================================================
-- Escuta passiva de menções/dúvidas transacionais em plataformas públicas
-- (HN Algolia comments · Lemmy fediverso — No-Auth APIs legítimas), a cada
-- 15 min (rota ?care=1 na Edge + job mention-care no cron GHA).
--
-- Filas SEPARADAS por design:
--   · nexus_social_engagement_tasks → intents globais (fluxo 21.30, sem
--     source_url) — inalterado;
--   · nexus_public_brand_mentions   → menções de ATENDIMENTO (com source_url
--     do comentário público) — peso 9999 = atendimento imediato.
--
-- A RPC nexus_mass_ingest_global_intents() foi modificada de forma ADITIVA:
-- itens que carregam source_url entram SOMENTE na fila de menções (nunca nas
-- duas — evita dupla resposta); itens sem source_url seguem o fluxo original.
-- Tudo sob os mesmos advisory locks atômicos + FOR UPDATE SKIP LOCKED.
--
-- FAIL-CLOSED: 403/429/timeout → menção isolada 24h (isolated_until) e volta
-- sozinha à fila depois; liveness ao Telegram privado C1 via
-- nexus_telegram_send_to('privado',...) (bot @NandimFernandesBot). O catálogo
-- de 14.299 anúncios permanece read-only estrito — nenhum statement aqui
-- escreve em ads/anúncios.
--
-- Aplicado e testado ao vivo em 2026-09-09.
-- ============================================================================

-- ── 1) Tabela privada da fila de menções ──
create table if not exists public.nexus_public_brand_mentions (
  id            uuid primary key default gen_random_uuid(),
  source_url    text not null unique,          -- permalink do comentário público
  target_keyword text,                          -- keyword do dicionário que capturou
  platform      text,                           -- hackernews | lemmy | ...
  author_handle text,
  mention_text  text,
  language      text default 'en',
  care_weight   int  not null default 9999,     -- atendimento imediato (primeiro na fila)
  status        text not null default 'pending_reply',  -- pending_reply|processing|replied|isolated|failed
  attempts      int  not null default 0,
  error_code    text,
  isolated_until timestamptz,                   -- 403/429/timeout → +24h
  sid           text,
  reply_text    text,
  processed_at  timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- RLS: service_role only (a Edge usa service key) — sem policies para anon/auth
alter table public.nexus_public_brand_mentions enable row level security;

-- ── 2) RPC de ingest modificada (ADITIVA — roteamento por source_url) ──
create or replace function public.nexus_mass_ingest_global_intents(p_items jsonb)
returns jsonb
language plpgsql
as $function$
declare
  v_total int := 0; v_inserted int := 0; v_mentions int := 0;
begin
  if p_items is null or jsonb_typeof(p_items) <> 'array' then
    return jsonb_build_object('ok', false, 'error', 'p_items deve ser um array json');
  end if;
  v_total := jsonb_array_length(p_items);
  with novos as (
    select x ->> 'platform' as platform, x ->> 'comment_id' as comment_id,
           left(x ->> 'author_handle', 200) as author_handle,
           left(x ->> 'comment_text', 2000) as comment_text,
           left(x ->> 'keyword', 120) as keyword,
           left(x ->> 'source_url', 600) as source_url,
           case
             when lower(coalesce(x ->> 'comment_text','')) ~ '(olá|ola|obrigad|quanto|pre[çc]o|onde|como|cupom|frete|voc[êe]|quero|amei|barato|promo|desconto|voo |hospedagem)' then 'pt'
             when lower(coalesce(x ->> 'comment_text','')) ~ '(hola|gracias|cu[áa]nto|d[óo]nde|cup[óo]n|descuento|vuelo|alojamiento|mejor)' then 'es'
             when lower(coalesce(x ->> 'comment_text','')) ~ '(bonjour|merci|combien|r[ée]duction|vol pas cher|h[ôo]tel |hébergement)' then 'fr'
             else 'en'
           end as language
      from jsonb_array_elements(p_items) x
     where coalesce(x ->> 'comment_id','') <> '' and coalesce(x ->> 'comment_text','') <> ''
  ),
  travados as (
    select n.* from novos n
     where pg_try_advisory_xact_lock(hashtextextended('nexus:engage:global:' || n.platform || ':' || n.comment_id, 0))
  ),
  existentes as (
    select t.platform, t.comment_id from public.nexus_social_engagement_tasks t
      join travados v on v.platform = t.platform and v.comment_id = t.comment_id
       for update of t skip locked
  ),
  ins as (
    insert into public.nexus_social_engagement_tasks
      (platform, comment_id, post_id, profile_name, author_handle, comment_text, language, keyword, status)
    select v.platform, v.comment_id, null, null, v.author_handle, v.comment_text, v.language, v.keyword, 'pending_reply'
      from travados v
     where coalesce(v.source_url, '') = ''            -- 21.38 CARE: com source_url → só fila de menções
       and not exists (select 1 from existentes e where e.platform = v.platform and e.comment_id = v.comment_id)
    on conflict (platform, comment_id) do nothing
    returning 1
  ),
  mins as (                                           -- menções de atendimento (peso 9999)
    insert into public.nexus_public_brand_mentions
      (source_url, target_keyword, platform, author_handle, mention_text, language, care_weight)
    select v.source_url, v.keyword, v.platform, v.author_handle, v.comment_text, v.language, 9999
      from travados v
     where coalesce(v.source_url, '') <> ''
    on conflict (source_url) do nothing
    returning 1
  )
  select (select count(*) from ins), (select count(*) from mins)
    into v_inserted, v_mentions;
  return jsonb_build_object('ok', true, 'received', v_total, 'inserted', v_inserted,
                            'mentions', v_mentions, 'deduped', greatest(v_total - v_inserted - v_mentions, 0));
exception when others then
  return jsonb_build_object('ok', false, 'error', 'mass_ingest isolado (fail-closed): ' || sqlerrm);
end;
$function$;

-- ── 3) Claim atômico da fila de menções (peso 9999 primeiro) ──
create or replace function public.nexus_claim_public_mentions(p_limit integer default 6)
returns table (id uuid, source_url text, target_keyword text, platform text,
               author_handle text, mention_text text, language text, attempts integer)
language plpgsql
security definer
set search_path = 'public'
as $function$
begin
  -- recuperação: isoladas há mais de 24h voltam à fila (fail-closed autônomo)
  update public.nexus_public_brand_mentions
     set status = 'pending_reply', isolated_until = null, updated_at = now()
   where status = 'isolated' and isolated_until < now();

  -- recuperação: 'processing' órfã (edge morreu) volta após 15 min
  update public.nexus_public_brand_mentions
     set status = 'pending_reply', updated_at = now()
   where status = 'processing' and updated_at < now() - interval '15 minutes';

  return query
  update public.nexus_public_brand_mentions t
     set status = 'processing',
         attempts = t.attempts + 1,
         updated_at = now()
   where t.id in (
     select c.id
       from public.nexus_public_brand_mentions c
      where c.status = 'pending_reply'
        and c.attempts < 5
        and pg_try_advisory_xact_lock(hashtextextended('nexus:care:' || c.id::text, 0))
      order by c.care_weight desc, c.created_at asc   -- peso 9999 primeiro
      limit greatest(coalesce(p_limit, 6), 1)
        for update skip locked)
  returning t.id, t.source_url, t.target_keyword, t.platform,
            t.author_handle, t.mention_text, t.language, t.attempts;
exception when others then
  raise warning 'claim_public_mentions isolado (fail-closed): %', sqlerrm;
  return;
end;
$function$;

-- ── 4) Hardening: service-role only ──
revoke execute on function public.nexus_claim_public_mentions(integer) from public, anon, authenticated;

-- FIM supabase_public_mentions_care_system.sql
