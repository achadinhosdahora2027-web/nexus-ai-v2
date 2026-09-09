-- ============================================================================
-- ZERNIO RAIL (21.38) — 2ª rail de postagem social via API Zernio
-- ============================================================================
-- Cross-post dos itens publicados (nexus_social_outbox) para o Pinterest
-- (conta idnandim) através da API Zernio (https://zernio.com/api/v1) —
-- plano usage-based com as 2 primeiras contas grátis (custo zero).
--
-- Credenciais vivem SÓ no cofre nexus_growth_secrets (provisionadas via ops,
-- NUNCA versionadas — o repo é público):
--   zernio_api_key            → sk_... (Bearer)
--   zernio_account_pinterest  → id da conta conectada
--   zernio_board_pinterest    → id do board "Ofertas Verificadas Brasil"
--   zernio_enabled            → 'true'/'false' (kill-switch remoto)
--
-- Dedup: cada item do outbox vira pin UMA única vez (outbox_id é PK).
-- ============================================================================

create table if not exists public.nexus_zernio_pins (
  outbox_id      uuid primary key references public.nexus_social_outbox(id) on delete cascade,
  zernio_post_id text,
  pin_id         text,
  pin_url        text,
  sid            text,
  status         text default 'posted',
  created_at     timestamptz default now()
);

alter table public.nexus_zernio_pins enable row level security;
-- service role only (worker) — sem policies para anon/authenticated.
-- (Aplicado em produção em 2026-09-09; teste ao vivo: pin 1108167052089474104)
