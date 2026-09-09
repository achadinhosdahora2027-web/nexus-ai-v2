-- ============================================================================
-- ZERNIO RAIL DUAL EXPANSION (21.38 v5.9) — 2ª rail em 2 canais
-- ============================================================================
-- Expande a Zernio Rail para o SEGUNDO canal gratuito da plataforma:
--   · Canal 1 (original): Pinterest idnandim — board "Ofertas Verificadas
--     Brasil" (id 1108167120751531391)
--   · Canal 2 (novo):     Instagram oficial "AQUITÉM | Guias Locais"
--     (conta 6aa0b4ab726ebfe037ca4d8c) — plataforma definida no cofre por
--     'zernio_secondary_platform' ('instagram' | 'threads'), lida em tempo
--     de execução pelo orquestrador de mídias (ayrshare-outbox-worker.ts).
--
-- DEDUP GLOBAL por par (outbox_id, platform): cada item do outbox pode virar
-- 1 pin E 1 post de feed — nunca 2x no mesmo canal. A PK única original
-- (outbox_id) é substituída por PK composta.
--
-- SIDs no /go por canal: zernio_pinterest_* / zernio_instagram_* /
-- zernio_threads_* → o Click-Stream Tracker isola a receita de cada feed.
--
-- FAIL-CLOSED: canal secundário é OPCIONAL (allowlist instagram/threads) —
-- ausente/inválido, a rail segue pinterest-only. Falhas por canal são
-- isoladas (try/catch no worker; telemetria → Telegram privado C1 via
-- trigger notify_telegram_cron_telemetry). O catálogo de 14.299 anúncios
-- permanece read-only estrito.
--
-- Aplicado em produção em 2026-09-09 (PK composta verificada ao vivo).
-- ============================================================================

-- 1) Coluna de canal com default retrô (6 rows históricas = pinterest)
alter table public.nexus_zernio_pins
  add column if not exists platform text not null default 'pinterest';

-- 2) PK única → PK composta (outbox_id, platform)
alter table public.nexus_zernio_pins
  drop constraint nexus_zernio_pins_pkey;

alter table public.nexus_zernio_pins
  add constraint nexus_zernio_pins_dual_pk primary key (outbox_id, platform);

-- 3) Cofre: canal secundário + conta (provisionados via ops; chave da API
--    e conta primária já existem de supabase_zernio_rail.sql)
insert into public.nexus_growth_secrets (key, value, updated_at) values
  ('zernio_secondary_platform', 'instagram', now()),
  ('zernio_account_secondary', '6aa0b4ab726ebfe037ca4d8c', now())
on conflict (key) do update set value = excluded.value, updated_at = excluded.updated_at;

-- FIM supabase_zernio_rail_dual_expansion.sql
