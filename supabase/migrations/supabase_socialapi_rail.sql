-- ============================================================================
-- SOCIALAPI RAIL (21.38) — 3ª rail de postagem: contas OFICIAIS do império
-- ============================================================================
-- Publica itens do outbox (publicados pela rail principal) nas contas
-- oficiais via SocialAPI.ai (https://api.social-api.ai/v1):
--   · Instagram @aquitatem (AQUITÉM | Guias Locais)
--   · Página Facebook "Achadinhos da Hora - Cupons"
--
-- Fluxo (provado ao vivo 2026-09-09): POST /v1/posts (draft, mídia por
-- source_type=url — o upload presigned NÃO registra na biblioteca) →
-- POST /v1/posts/{id}/publish → poll até published.
--
-- Credenciais SÓ no cofre nexus_growth_secrets (repo público!):
--   socialapi_api_key / socialapi_account_instagram /
--   socialapi_account_facebook / socialapi_enabled (kill-switch).
-- Dedup: cada item do outbox vira post 1× (outbox_id PK).
-- ============================================================================

create table if not exists public.nexus_socialapi_posts (
  outbox_id         uuid primary key references public.nexus_social_outbox(id) on delete cascade,
  socialapi_post_id text,
  ig_status         text,
  fb_status         text,
  sid               text,
  status            text default 'posted',
  created_at        timestamptz default now()
);

alter table public.nexus_socialapi_posts enable row level security;
-- service role only (worker) — sem policies para anon/authenticated.
