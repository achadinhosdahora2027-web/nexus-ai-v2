/**
 * NEXUS — Cloudflare Cache Purger (vitrines espelho) · pacote cf-www-unblock/
 * src/server/scheduler/cloudflare-cache-purger.ts · Etapa 21.11 · 2026-09-07
 * ----------------------------------------------------------------------------
 * Expurgo reativo do cache de borda das 3 vitrines espelho
 * (www.aquitemachadinhos.com.br · solvegrid.com.br · nexusplataforma.ia.br)
 * sempre que a matriz recalcula os melhores anúncios (cron GitHub Actions,
 * logo após o Matrix Agent Cluster e o refresh da MV de ofertas).
 *
 * SEGREDOS (nunca em código/logs):
 *   CLOUDFLARE_API_TOKEN  — token com permissão Zone.Cache Purge
 *   CLOUDFLARE_ZONE_ID    — 1 zona OU lista separada por vírgula
 *   CLOUDFLARE_ZONE_IDS   — alternativa plural (mesmo formato)
 *   (credenciais gêmeas cadastradas em Vercel Production do projeto `nexus`
 *    e nos GitHub Secrets do nexus-ai-v2 — nada em texto plano)
 *
 * ENDPOINT OFICIAL: POST https://api.cloudflare.com/client/v4/zones/{ZONE}/purge_cache
 *   payload de produção: {"purge_everything": true}
 *   (correção documentada do spec: a base é api.cloudflare.com/client/v4 —
 *    cloudflare.com/{ZONE}/purge_cache não é endpoint válido da API)
 *
 * FAIL-CLOSED ESTRITO: try/catch ISOLADO POR ZONA — 429 (rate-limit), 5xx,
 * timeout, DNS/TLS → ocorrência em public.nexus_cron_telemetry (job
 * 'cloudflare-cache-purger') + PRÓXIMA zona; o cron NUNCA quebra, e os
 * 14.036 anúncios e as rotas /go do Supabase jamais são tocados (o expurgo
 * é operação de borda, leitura/escrita zero no banco de ofertas).
 *
 * Exit codes: 0 = rodou (mesmo com skip total em fail-closed).
 */

/* ── env ------------------------------------------------------------------ */
const DB_URL = (process.env.NEXUS_GROWTH_DB_URL ?? "").replace(/\/+$/, "");
const DB_KEY = process.env.NEXUS_GROWTH_DB_SERVICE_KEY ?? "";
const CF_TOKEN = process.env.CLOUDFLARE_API_TOKEN ?? "";
const RUN_JOB = "cloudflare-cache-purger";

const ZONES: string[] = (process.env.CLOUDFLARE_ZONE_IDS ?? process.env.CLOUDFLARE_ZONE_ID ?? "")
  .split(",")
  .map((z) => z.trim())
  .filter((z) => /^[0-9a-f]{32}$/i.test(z));

const PURGE_CONCURRENCY = 3; // cortesia ao plano gratuito (3 zonas)

/* ── telemetria (PostgREST cru, idêntica ao mesh 21.7) --------------------- */
async function telemetry(
  status: string,
  httpStatus: number | null,
  total: number,
  sent: number,
  message: string,
): Promise<void> {
  if (!DB_URL || !DB_KEY) return; // sem banco → segue fail-closed silencioso
  try {
    const res = await fetch(`${DB_URL}/rest/v1/nexus_cron_telemetry`, {
      method: "POST",
      headers: {
        apikey: DB_KEY,
        Authorization: `Bearer ${DB_KEY}`,
        "Content-Type": "application/json",
        Prefer: "return=minimal",
      },
      body: JSON.stringify({
        job: RUN_JOB,
        target_host: "cloudflare.com",
        status,
        http_status: httpStatus,
        items_total: total,
        items_sent: sent,
        message: message.slice(0, 500),
      }),
    });
    if (!res.ok) console.warn(`[purge] telemetria non-${res.status} (isolado)`);
  } catch (err) {
    console.warn(`[purge] telemetria falhou isolada: ${(err as Error).message}`);
  }
}

/* ── expurgo de 1 zona (try/catch rigoroso) -------------------------------- */
interface ZoneResult {
  zone: string;
  ok: boolean;
  code: number;
  detail: string;
}

async function purgeZone(zone: string): Promise<ZoneResult> {
  const url = `https://api.cloudflare.com/client/v4/zones/${zone}/purge_cache`;
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15_000);
    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${CF_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ purge_everything: true }),
      signal: controller.signal,
    });
    clearTimeout(timer);

    const body = (await res.json().catch(() => ({}))) as {
      success?: boolean;
      errors?: Array<{ message?: string }>;
    };

    // 429 = rate-limit do Cloudflare → telemetria + skip (proibido quebrar cron)
    if (res.status === 429) {
      const detail = `rate-limit 429 zona ${zone.slice(0, 8)}… — ocorrência registrada, execução pulada`;
      console.warn(`[purge] ${detail}`);
      await telemetry("rate_limited", 429, 1, 0, detail);
      return { zone, ok: false, code: 429, detail };
    }

    if (res.ok && body.success === true) {
      console.log(`[purge] zona ${zone.slice(0, 8)}… expurgada (purge_everything)`);
      return { zone, ok: true, code: res.status, detail: "purge_everything ok" };
    }

    // API respondeu, mas negou (401/403/4xx) → telemetria + próxima zona
    const detail = `HTTP ${res.status} zona ${zone.slice(0, 8)}…: ${body.errors?.[0]?.message ?? "sem detalhe"}`;
    console.warn(`[purge] ${detail}`);
    await telemetry("rejected", res.status, 1, 0, detail);
    return { zone, ok: false, code: res.status, detail };
  } catch (err) {
    // timeout/DNS/TLS/rede — instabilidade NUNCA interrompe o cron
    const detail = `rede isolada zona ${zone.slice(0, 8)}…: ${(err as Error).message}`;
    console.warn(`[purge] ${detail}`);
    await telemetry("network_error", null, 1, 0, detail);
    return { zone, ok: false, code: 0, detail };
  }
}

/* ── pool de concorrência simples ------------------------------------------ */
async function pool<T, R>(items: T[], size: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = [];
  for (let i = 0; i < items.length; i += size) {
    out.push(...(await Promise.all(items.slice(i, i + size).map(fn))));
  }
  return out;
}

/* ── componente de expurgo automático (exportado) --------------------------- */
export async function purgeGlobalCloudflareCache(): Promise<void> {
  console.log(`[purge] cf-www-unblock · ${new Date().toISOString()}`);

  if (!CF_TOKEN || ZONES.length === 0) {
    const detail = !CF_TOKEN
      ? "CLOUDFLARE_API_TOKEN ausente — fail-closed (nada expurgado, cron segue)"
      : `nenhum Zone ID válido em CLOUDFLARE_ZONE_ID(S) — fail-closed`;
    console.warn(`[purge] ${detail}`);
    await telemetry("skipped", null, 0, 0, detail);
    return;
  }

  console.log(`[purge] ${ZONES.length} zona(s) · purge_everything=true`);
  const results = await pool(ZONES, PURGE_CONCURRENCY, purgeZone);
  const ok = results.filter((r) => r.ok).length;

  const resumo =
    ok === results.length
      ? `expurgo completo: ${ok}/${results.length} zonas (vitrines com ofertas frescas)`
      : `expurgo parcial fail-closed: ${ok}/${results.length} zonas — falhas isoladas em telemetria`;
  console.log(`[purge] ${resumo}`);
  await telemetry(ok === results.length ? "ok" : "partial", 200, results.length, ok, resumo);
}

/* ── entrypoint (cron tsx) -------------------------------------------------- */
if (process.argv[1] && process.argv[1].endsWith("cloudflare-cache-purger.ts")) {
  purgeGlobalCloudflareCache().catch((err: Error) => {
    // último anteparo: nada aqui derruba o cron
    console.warn(`[purge] anteparo final: ${err.message}`);
    void telemetry("error", null, 0, 0, `anteparo final: ${err.message.slice(0, 160)}`);
    process.exitCode = 0;
  });
}
