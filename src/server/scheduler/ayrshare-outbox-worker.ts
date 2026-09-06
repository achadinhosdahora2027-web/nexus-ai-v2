/**
 * ============================================================================
 * NEXUS — AYRSHARE OUTBOX WORKER (Workflow 3 — Social Trends Matrix)
 * Arquivo: src/server/scheduler/ayrshare-outbox-worker.ts
 * ============================================================================
 * Consome a fila REAL public.nexus_social_outbox (Supabase NexusPlataforma)
 * via claim atômico nexus_social_outbox_next() — high_priority_post primeiro —
 * e publica pelo payload OFICIAL da Ayrshare Social Post API (modo primary):
 *
 *   POST https://api.ayrshare.com/api/post
 *   Authorization: Bearer <AYRSHARE_API_KEY>
 *   { "post": "...", "platforms": ["instagram","pinterest","tiktok"],
 *     "mediaUrls": ["https://..."] }
 *
 * State machine respeitada (legado + extensão do motor):
 *   pending_approval/high_priority_post → dispatching (claim)
 *   sucesso  → published  (+published_at, last_http_status)
 *   429/5xx  → volta para pending_approval (ou high_priority_post se P1),
 *              attempts preservado; ≥5 tentativas → failed
 *   4xx      → failed (last_error_code) + telemetria sanitizada
 *   sem key  → devolve tudo à fila original (fail-closed)
 * ============================================================================
 */

const AYRSHARE_POST_ENDPOINT = "https://api.ayrshare.com/api/post";
const REQUEST_TIMEOUT_MS = 20_000;
const MAX_ATTEMPTS = 5;

const ALLOWED_PLATFORMS = [
  "instagram",
  "pinterest",
  "tiktok",
  "twitter",
  "facebook",
  "linkedin",
  "youtube",
  "threads",
  "reddit",
] as const;

type AllowedPlatform = (typeof ALLOWED_PLATFORMS)[number];

/** Shape exato do retorno de nexus_social_outbox_next() */
interface OutboxRow {
  id: string;
  product_id: string | null;
  post: string;
  media_url: string | null;
  public_url: string | null;
  platforms: unknown;
  attempts: number;
  priority: number;
}

function supabaseConfig(): { url: string; key: string } | null {
  const url =
    process.env["NEXUS_GROWTH_DB_URL"] ?? process.env["SUPABASE_URL"];
  const key =
    process.env["NEXUS_GROWTH_DB_SERVICE_KEY"] ??
    process.env["SUPABASE_SERVICE_ROLE_KEY"];
  if (!url || !key) return null;
  return { url: url.replace(/\/+$/, ""), key };
}

async function sbRequest(
  path: string,
  init: RequestInit,
): Promise<unknown | null> {
  const cfg = supabaseConfig();
  if (!cfg) return null;
  try {
    const res = await fetch(`${cfg.url}/rest/v1${path}`, {
      ...init,
      headers: {
        ...(init.headers as Record<string, string> | undefined),
        apikey: cfg.key,
        Authorization: `Bearer ${cfg.key}`,
        "Content-Type": "application/json",
      },
    });
    if (!res.ok) {
      console.warn(`[supabase] ${path} → HTTP ${res.status} (fail-closed)`);
      return null;
    }
    const text = await res.text();
    return text ? (JSON.parse(text) as unknown) : null;
  } catch (err) {
    console.warn(
      `[supabase] ${path} falhou: ${err instanceof Error ? err.message : "erro"}`,
    );
    return null;
  }
}

async function sbRpc<T>(fn: string, params: Record<string, unknown>): Promise<T | null> {
  const out = await sbRequest(`/rpc/${fn}`, {
    method: "POST",
    body: JSON.stringify(params),
  });
  return (out as T | null) ?? null;
}

async function claimOutbox(limit: number): Promise<OutboxRow[]> {
  const rows = await sbRpc<OutboxRow[]>("nexus_social_outbox_next", {
    p_limit: limit,
  });
  return Array.isArray(rows) ? rows : [];
}

async function updateOutboxRow(
  id: string,
  patch: Record<string, unknown>,
): Promise<void> {
  await sbRequest(`/nexus_social_outbox?id=eq.${id}`, {
    method: "PATCH",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify({ updated_at: new Date().toISOString(), ...patch }),
  });
}

async function logTelemetry(
  status: string,
  httpStatus: number | null,
  total: number,
  sent: number,
  message: string,
): Promise<void> {
  const persisted = await sbRpc<unknown>("nexus_cron_telemetry_log", {
    p_job: "ayrshare_outbox",
    p_status: status,
    p_host: null,
    p_http_status: httpStatus,
    p_items_total: total,
    p_items_sent: sent,
    p_message: message,
  });
  if (persisted === null && !supabaseConfig()) {
    console.log(`[telemetry:local] ayrshare/${status} :: ${message}`);
  }
}

/** Valida o contrato oficial {post, platforms, mediaUrls}.
 *  O banco exige platforms = exatamente [instagram, pinterest, tiktok]. */
function normalizeRow(
  row: OutboxRow,
): { post: string; platforms: AllowedPlatform[]; mediaUrls: string[] } | null {
  const post = typeof row.post === "string" ? row.post.trim() : "";
  if (!post) return null;

  const platforms = Array.isArray(row.platforms)
    ? row.platforms.filter(
        (p): p is AllowedPlatform =>
          typeof p === "string" &&
          (ALLOWED_PLATFORMS as readonly string[]).includes(p),
      )
    : [];
  if (platforms.length === 0) return null;

  const mediaUrls =
    typeof row.media_url === "string" && /^https:\/\//.test(row.media_url)
      ? [row.media_url]
      : [];

  return { post: post.slice(0, 3000), platforms, mediaUrls };
}

async function publish(
  payload: { post: string; platforms: AllowedPlatform[]; mediaUrls: string[] },
  apiKey: string,
): Promise<{ httpStatus: number; retryable: boolean; message: string }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(AYRSHARE_POST_ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        post: payload.post,
        platforms: payload.platforms,
        mediaUrls: payload.mediaUrls,
      }),
      signal: controller.signal,
    });
    const body = await res.text();
    if (res.ok) {
      return { httpStatus: res.status, retryable: false, message: "ok" };
    }
    let message = body.slice(0, 300);
    try {
      const parsed = JSON.parse(body) as { message?: string };
      if (parsed.message) message = parsed.message;
    } catch {
      /* mantém fallback */
    }
    return {
      httpStatus: res.status,
      retryable: res.status === 429 || res.status >= 500,
      message,
    };
  } catch (err) {
    return {
      httpStatus: 0,
      retryable: true,
      message: err instanceof Error ? err.message : "network error",
    };
  } finally {
    clearTimeout(timer);
  }
}

export async function runAyrshareOutboxWorker(): Promise<{
  claimed: number;
  sent: number;
  requeued: number;
  failed: number;
}> {
  const apiKey = process.env["AYRSHARE_API_KEY"];
  const batchLimit = Math.min(
    Math.max(Number.parseInt(process.env["AYRSHARE_BATCH"] ?? "", 10) || 10, 1),
    50,
  );

  const rows = await claimOutbox(batchLimit);
  const summary = { claimed: rows.length, sent: 0, requeued: 0, failed: 0 };

  if (rows.length === 0) {
    console.log("[ayrshare] fila vazia — nada a fazer");
    return summary;
  }

  // FAIL-CLOSED: sem credencial, devolve TUDO ao estado anterior ao claim
  if (!apiKey) {
    for (const row of rows) {
      await updateOutboxRow(row.id, {
        status: row.priority === 1 ? "high_priority_post" : "pending_approval",
        attempts: Math.max(row.attempts - 1, 0),
      });
    }
    await logTelemetry(
      "skipped",
      null,
      rows.length,
      0,
      "AYRSHARE_API_KEY ausente — lote devolvido à fila (fail-closed)",
    );
    console.error("[ayrshare] AYRSHARE_API_KEY ausente — lote devolvido à fila");
    return summary;
  }

  for (const row of rows) {
    const payload = normalizeRow(row);
    if (!payload) {
      summary.failed += 1;
      await updateOutboxRow(row.id, {
        status: "failed",
        last_http_status: 422,
        last_error_code: "invalid_payload",
      });
      await logTelemetry(
        "error",
        422,
        1,
        0,
        `payload inválido no outbox id=${row.id} (post/platforms ausentes)`,
      );
      continue;
    }

    const result = await publish(payload, apiKey);

    if (result.httpStatus >= 200 && result.httpStatus < 300) {
      summary.sent += 1;
      await updateOutboxRow(row.id, {
        status: "published",
        last_http_status: result.httpStatus,
        published_at: new Date().toISOString(),
      });
      continue;
    }

    if (result.retryable && row.attempts < MAX_ATTEMPTS) {
      summary.requeued += 1;
      await updateOutboxRow(row.id, {
        status: row.priority === 1 ? "high_priority_post" : "pending_approval",
        last_http_status: result.httpStatus,
      });
      continue;
    }

    summary.failed += 1;
    await updateOutboxRow(row.id, {
      status: "failed",
      last_http_status: result.httpStatus,
      last_error_code: result.message.slice(0, 200),
    });
    await logTelemetry(
      "error",
      result.httpStatus,
      1,
      0,
      `post id=${row.id} falhou definitivamente: ${result.message.slice(0, 200)}`,
    );
  }

  await logTelemetry(
    "ok",
    200,
    summary.claimed,
    summary.sent,
    `publicadas=${summary.sent} reenfileiradas=${summary.requeued} falhas=${summary.failed}`,
  );
  return summary;
}

/* ------------------------------- CLI ------------------------------------- */

const invokedDirectly = process.argv[1]?.includes("ayrshare-outbox-worker");
if (invokedDirectly) {
  runAyrshareOutboxWorker()
    .then((s) => {
      console.log(
        `[ayrshare] concluído — claimed=${s.claimed} published=${s.sent} requeued=${s.requeued} failed=${s.failed}`,
      );
      process.exit(0);
    })
    .catch((err: unknown) => {
      console.error(
        `[ayrshare] falha fatal (fail-closed): ${err instanceof Error ? err.message : String(err)}`,
      );
      process.exit(1);
    });
}
