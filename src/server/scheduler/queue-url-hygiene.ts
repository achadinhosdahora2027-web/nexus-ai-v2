/**
 * ============================================================================
 * NEXUS — QUEUE URL HYGIENE (Etapa 6 — Higiene de Indexação)
 * Arquivo: src/server/scheduler/queue-url-hygiene.ts
 * ============================================================================
 * Contexto (GSC Page Indexing, print de 06/09/2026):
 *   - 4.059 "Página com redirecionamento"  → inventário contém apex+www
 *   - 3.269 "Cópia sem canônica"           → auditoria de <link rel=canonical>
 *   - 980  "Não encontrado (404)"          → sitemap/fila com URLs mortas
 *
 * O que faz:
 *   1. Lê TODas as URLs da fila google (pending_google_crawl/submitted)
 *   2. GET real com redirect-follow (concurreência controlada):
 *      status HTTP final, URL final (pós-redirect) e tag canonical
 *   3. Grava tudo em public.nexus_url_audit (base do saneamento set-based)
 *
 * FAIL-CLOSED: erros de rede não excluem nada — apenas auditam.
 * Nenhum envio ao Google acontece aqui (isso é papel do cron 4h).
 * ============================================================================
 */

const CONCURRENCY = Math.min(
  Math.max(Number.parseInt(process.env["HYGIENE_CONCURRENCY"] ?? "", 10) || 16, 1),
  32,
);
const FETCH_TIMEOUT_MS = 12_000;

interface AuditRow {
  url: string;
  final_url: string | null;
  http_status: number | null;
  canonical: string | null;
  redirect: boolean;
}

function sb(): { url: string; key: string } | null {
  const url = process.env["NEXUS_GROWTH_DB_URL"];
  const key = process.env["NEXUS_GROWTH_DB_SERVICE_KEY"];
  if (!url || !key) return null;
  return { url: url.replace(/\/+$/, ""), key };
}

async function sbFetch(path: string, init: RequestInit): Promise<unknown> {
  const cfg = sb();
  if (!cfg) throw new Error("env NEXUS_GROWTH_DB_* ausente");
  const res = await fetch(`${cfg.url}/rest/v1${path}`, {
    ...init,
    headers: {
      ...(init.headers as Record<string, string> | undefined),
      apikey: cfg.key,
      Authorization: `Bearer ${cfg.key}`,
      "Content-Type": "application/json",
    },
  });
  if (!res.ok) throw new Error(`REST ${path} → HTTP ${res.status}: ${(await res.text()).slice(0, 150)}`);
  const txt = await res.text();
  return txt ? JSON.parse(txt) : null;
}

async function readQueueUrls(): Promise<string[]> {
  const urls: string[] = [];
  for (let offset = 0; ; offset += 1000) {
    const rows = (await sbFetch(
      `/nexus_google_index_queue?select=url&status=in.(pending_google_crawl,submitted)&limit=1000&offset=${offset}`,
      { method: "GET" },
    )) as { url: string }[];
    urls.push(...rows.map((r) => r.url));
    if (rows.length < 1000) break;
  }
  return urls;
}

function extractCanonical(html: string): string | null {
  const linkTags = html.match(/<link\b[^>]*>/gi) ?? [];
  for (const tag of linkTags) {
    if (/rel=["']?canonical["']?/i.test(tag)) {
      const href = tag.match(/href=["']([^"']+)["']/i);
      if (href?.[1]) return href[1];
    }
  }
  return null;
}

async function auditUrl(
  url: string,
): Promise<AuditRow> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      method: "GET",
      redirect: "follow",
      signal: controller.signal,
      headers: { "User-Agent": "Nexus-Hygiene-Bot/1.0 (+growth-engine)" },
    });
    // lê só o começo do HTML (canonical fica no <head>)
    let head = "";
    if (res.body) {
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let total = 0;
      while (total < 65_536) {
        const { done, value } = await reader.read();
        if (done) break;
        head += dec.decode(value, { stream: true });
        total += value.byteLength;
        if (/<\/head>/i.test(head)) break;
      }
      await reader.cancel().catch(() => undefined);
    }
    return {
      url,
      final_url: res.url && res.url !== url ? res.url : null,
      http_status: res.status,
      canonical: extractCanonical(head),
      redirect: Boolean(res.url && res.url !== url),
    };
  } catch {
    return { url, final_url: null, http_status: null, canonical: null, redirect: false };
  } finally {
    clearTimeout(timer);
  }
}

async function flushAudit(rows: AuditRow[]): Promise<void> {
  for (let i = 0; i < rows.length; i += 500) {
    const chunk = rows.slice(i, i + 500);
    await sbFetch("/nexus_url_audit?on_conflict=url", {
      method: "POST",
      headers: { Prefer: "resolution=merge-duplicates" },
      body: JSON.stringify(chunk),
    });
  }
}

async function main(): Promise<void> {
  const t0 = Date.now();
  const urls = await readQueueUrls();
  console.log(`[hygiene] ${urls.length} URLs na fila para auditar (concorrência ${CONCURRENCY})`);

  const results: AuditRow[] = [];
  let done = 0;
  let cursor = 0;
  const worker = async (): Promise<void> => {
    while (cursor < urls.length) {
      const url = urls[cursor++];
      results.push(await auditUrl(url));
      done++;
      if (done % 250 === 0) {
        console.log(`  ...${done}/${urls.length} (${Math.round((Date.now() - t0) / 1000)}s)`);
      }
    }
  };
  await Promise.all(Array.from({ length: CONCURRENCY }, () => worker()));

  await flushAudit(results);

  const ok = results.filter((r) => (r.http_status ?? 0) === 200).length;
  const redirected = results.filter((r) => r.redirect).length;
  const dead = results.filter((r) => [404, 410].includes(r.http_status ?? 0)).length;
  const noCanonical = results.filter(
    (r) => r.http_status === 200 && !r.canonical,
  ).length;
  const crossCanonical = results.filter((r) => {
    if (!r.canonical || !r.http_status) return false;
    try {
      return new URL(r.canonical).hostname !== new URL(r.url).hostname;
    } catch {
      return false;
    }
  }).length;

  console.log("════════ NEXUS · URL HYGIENE REPORT ════════");
  console.log(`auditadas ......: ${results.length}`);
  console.log(`HTTP 200 .......: ${ok}`);
  console.log(`redirect .......: ${redirected} (apex→www etc. — fontes dos 4.059 do GSC)`);
  console.log(`404/410 ........: ${dead}`);
  console.log(`sem canonical ..: ${noCanonical} (relacionado aos 3.269 do GSC)`);
  console.log(`canonical cross-domain: ${crossCanonical}`);
  console.log(`duracao ........: ${Math.round((Date.now() - t0) / 1000)}s`);
}

main().catch((err: unknown) => {
  console.error(`[hygiene] falha: ${err instanceof Error ? err.message : err}`);
  process.exit(1);
});
