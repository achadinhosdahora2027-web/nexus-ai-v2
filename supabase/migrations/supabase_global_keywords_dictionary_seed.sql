-- ============================================================================
-- CALIBRAÇÃO DE CONTEÚDO (21.38 v5.10) — DICIONÁRIO MESTRE DE ALTO EPC
-- ============================================================================
-- Semeia os blocos de keywords transacionais de alta conversão que forçam os
-- elos de IA gratuitos (Mistral/Gemini/Groq/Cohere/HF) a usar termos
-- estritamente transacionais nas postagens de 4h e nas respostas automáticas
-- a não-seguidores.
--
--   BLOCO EN (mundial, alto EPC)  → target_network = 'CJ Affiliate'
--   BLOCO PT-SUL (hub regional)   → target_niche   = 'sul_br'
--
-- NOTA DE ARQUITETURA: o bloco PT-SUL usa language_iso='pt' (não 'pt_br')
-- deliberadamente — o motor de respostas compara t.language === 'pt' (agora
-- robustecido para aceitar pt*) e o ingest de massa deriva idioma por regex
-- com vocabulário 'pt'. A regionalidade vive em target_niche='sul_br', que
-- a Edge v5.10 lê em runtime para disparar a DIRETIVA REGIONAL.
--
-- INTEGRIDADE: a rotação de varredura segue sob advisory locks atômicos +
-- FOR UPDATE SKIP LOCKED (RPCs nexus_claim_engagement_tasks /
-- nexus_mass_ingest_global_intents — inalterados). Tudo é upsert idempotente
-- por keyword (índice único criado abaixo). O catálogo de 14.299 anúncios
-- permanece read-only estrito — nenhum statement aqui toca ads/anúncios.
--
-- Aplicado em produção em 2026-09-09 (9/9 rows verificadas).
-- ============================================================================

-- 1) Colunas de classificação (aditivo, idempotente)
alter table public.nexus_global_target_keywords
  add column if not exists target_network text,
  add column if not exists target_niche text;

-- 2) Índice único por keyword → upsert idempotente (verificado: 0 duplicatas)
create unique index if not exists nexus_global_target_keywords_keyword_uk
  on public.nexus_global_target_keywords (keyword);

-- 3) Tabela privada: RLS on (service role only — a Edge usa service key)
alter table public.nexus_global_target_keywords enable row level security;

-- 4) BLOCO EN — Alto EPC/Mundial (CJ Affiliate)
insert into public.nexus_global_target_keywords
  (id, keyword, language_iso, product_category, active, target_network, target_niche)
values
  (gen_random_uuid(), 'last minute hotel deals',        'en', 'travel',     true, 'CJ Affiliate', null),
  (gen_random_uuid(), 'booking promo code active',      'en', 'travel',     true, 'CJ Affiliate', null),
  (gen_random_uuid(), 'best cybersecurity discount 2026','en', 'security',  true, 'CJ Affiliate', null),
  (gen_random_uuid(), 'ebay hidden coupons',            'en', 'marketplace',true, 'CJ Affiliate', null),
  (gen_random_uuid(), 'cheap luxury flights',           'en', 'travel',     true, 'CJ Affiliate', null)
on conflict (keyword) do update set
  language_iso      = excluded.language_iso,
  product_category  = excluded.product_category,
  target_network    = excluded.target_network,
  target_niche      = excluded.target_niche,
  active            = true;

-- 5) BLOCO PT-SUL — Hub Regional (Sul do Brasil)
insert into public.nexus_global_target_keywords
  (id, keyword, language_iso, product_category, active, target_network, target_niche)
values
  (gen_random_uuid(), 'cupom hotel gramado inverno',           'pt', 'travel', true, 'CJ Affiliate', 'sul_br'),
  (gen_random_uuid(), 'achadinhos passagens curitiba',         'pt', 'travel', true, 'CJ Affiliate', 'sul_br'),
  (gen_random_uuid(), 'desconto exclusivo serra catarinense',  'pt', 'travel', true, 'CJ Affiliate', 'sul_br'),
  (gen_random_uuid(), 'promocao vale dos vinhedos',            'pt', 'travel', true, 'CJ Affiliate', 'sul_br')
on conflict (keyword) do update set
  language_iso      = excluded.language_iso,
  product_category  = excluded.product_category,
  target_network    = excluded.target_network,
  target_niche      = excluded.target_niche,
  active            = true;

-- FIM supabase_global_keywords_dictionary_seed.sql
