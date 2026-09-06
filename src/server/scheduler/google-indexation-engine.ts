/**
 * ============================================================================
 * NEXUS — GOOGLE SEARCH CONSOLE INDEXATION ENGINE
 * Arquivo: src/server/scheduler/google-indexation-engine.ts
 * Stack:  Node 20+ · google-auth-library (OAuth2 Service Account) ·
 *         Search Console API (webmasters v3 + URL Inspection v1) · Supabase REST
 * ============================================================================
 *
 * CORREÇÕES FATUAIS vs. especificação original (conformidade com a API):
 *
 *  1) ESCOPO OAUTH
 *     "https://googleapis.com" NÃO é um escopo emitível pelo Google. O escopo
 *     oficial do Search Console API é:
 *       https://www.googleapis.com/auth/webmasters
 *     É o utilizado abaixo (constante GSC_SCOPE).
 *
 *  2) O QUE A URL INSPECTION API REALMENTE FAZ
 *     A URL Inspection API (urlInspection/index:inspect) CONSULTA o estado de
 *     indexação (verdict, coverageState, lastCrawlTime, canonical). Ela NÃO
 *     expõe operação "request indexing" — esse botão existe apenas na UI do
 *     Search Console. A alavanca programática real de re-crawl é:
 *       a) submissão do sitemap incremental (PUT webmasters/v3 — implementado);
 *       b) Inspeção para MEDIR resultado e realimentar a fila
 *          'pending_google_crawl' até verdict = URL_IS_INDEXED (implementado).
 *
 *  3) QUOTA OFICIAL
 *     Inspection API: 2.000 chamadas/dia · 600/min · 200/min/propriedade.
 *     Limitador corporativo próprio (mais conservador): 200 URLs/dia/domínio,
 *     persistido em public.nexus_google_index_quota (advisory lock por host).
 *
 *  4) PRÉ-REQUISITO DE PROPRIEDADE
 *     O service account (ex.: websitesbot@<projeto>.iam.gserviceaccount.com)
 *     precisa ser adicionado como usuário VERIFICADO/proprietário delegado em
 *     CADA propriedade (sc-domain:solvegrid.com.br etc.). Sem isso → HTTP 403.
 *
 * SEGURANÇA / FAIL-CLOSED:
 *  - A credencial vem EXCLUSIVAMENTE de process.env.GOOGLE_SERVICE_ACCOUNT_JSON
 *    (string JSON ou base64). Nada é lido de arquivo, chat ou repo.
 *  - Nenhum segredo é logado; telemetria passa por sanitização no banco
 *    (nexus_cron_telemetry_log redacta key=/token=/code=...).
 *  - Em HTTP 429/quota estourada: itens voltam para 'pending_google_crawl',
 *    log sanitizado em public.nexus_cron_telemetry, NENHUMA exceção propaga
 *    para as rotas públicas do SolveGrid.
 * ============================================================================
 */

import { JWT } from "google-auth-library";

/* ---------------------------------------------------------------------------
 * Constantes oficiais
 * ------------------------------------------------------------------------- */

/** Escopo OAuth2 oficial do Google Search Console API. */
export const GSC_SCOPE = "https://www.googleapis.com/auth/webmasters";

/** Hosts validados no sitemap (Etapa 5, commit 9aaeba1) — apex + www,
 *  conforme o inventário real em ads_seo_submissions (aq/nx usam www). */
export const ALLOWED_HOSTS = [
  "solvegrid.com.br",
  "www.solvegrid.com.br",
  "aquitemachadinhos.com.br",
  "www.aquitemachadinhos.com.br",
  "nexusplataforma.ia.br",
  "www.nexusplataforma.ia.br",
] as const;

export type AllowedHost = (typeof ALLOWED_HOSTS)[number];

/** Rate limit corporativo: máximo de URLs inspecionadas por dia, por domínio. */
export const DAILY_LIMIT_PER_HOST = 200;

/** Orçamento de tempo do run inteiro (default 11 min) — excedente volta à fila. */
export const RUN_TIME_BUDGET_MS =
  Number.parseInt(process.env["NEXUS_TIME_BUDGET_MS"] ?? "", 10) || 11 * 60_000;

/** Concorrência de inspeções (limite oficial: 600/min global, 200/min/propriedade). */
const INSPECT_CONCURRENCY = Math.min(
  Math.max(Number.parseInt(process.env["NEXUS_INSPECT_CONCURRENCY"] ?? "", 10) || 4, 1),
  8,
);

const WEBMASTERS_BASE = "https://www.googleapis.com/webmasters/v3";
const INSPECT_ENDPOINT =
  "https://searchconsole.googleapis.com/v1/urlInspection/index:inspect";
const REQUEST_TIMEOUT_MS = 15_000;
const DEFAULT_SITEMAP_PATH = "/sitemap.xml";
const DEFAULT_HUB_URLS: readonly string[] = [
  "https://solvegrid.com.br",
  "https://aquitemachadinhos.com.br",
  "https://nexusplataforma.ia.br",
  "https://www.aquitemachadinhos.com.br",
];

/* ---------------------------------------------------------------------------
 * Tipos
 * ------------------------------------------------------------------------- */

export interface ServiceAccount {
  client_email: string;
  private_key: string;
}

export interface HostReport {
  host: string;
  sitemap: "submitted" | "error" | "skipped";
  sitemapDetail?: string;
  quotaGranted: number;
  inspected: number;
  indexed: number;
  rateLimited: boolean;
  errors: number;
  pending: number;
}

export interface IndexationReport {
  ok: boolean;
  reason?: "missing_credentials" | "auth_failed" | "empty_batch" | null;
  totalUrls: number;
  hosts: HostReport[];
  startedAt: string;
  durationMs: number;
}

interface InspectionResponse {
  inspectionResult?: {
    indexStatusResult?: {
      status?: string;
      verdict?: string;
      coverageState?: string;
      lastCrawlTime?: string;
      googleCanonical?: string;
    };
  };
}

interface InspectionOutcome {
  indexed: boolean;
  status: string;
  coverageState?: string;
  lastCrawlTime?: string;
}

/** Erro tipado da API Google (status 0 = falha de rede/abort). */
export class GscError extends Error {
  constructor(
    readonly status: number,
    readonly reason: string,
    message: string,
  ) {
    super(message);
    this.name = "GscError";
  }
}

/* ---------------------------------------------------------------------------
 * Credencial (isolada do chat; apenas env var server-side)
 * ------------------------------------------------------------------------- */

/** Lê e valida GOOGLE_SERVICE_ACCOUNT_JSON (JSON puro ou base64). Sem logs de segredo. */
export function getServiceAccount(): ServiceAccount | null {
  const raw = process.env["GOOGLE_SERVICE_ACCOUNT_JSON"];
  if (!raw || raw.trim() === "") return null;
  try {
    const decoded = raw.trim().startsWith("{")
      ? raw
      : Buffer.from(raw, "base64").toString("utf8");
    const parsed = JSON.parse(decoded) as Partial<ServiceAccount>;
    if (
      typeof parsed.client_email !== "string" ||
      typeof parsed.private_key !== "string" ||
      !parsed.client_email.includes("@") ||
      !parsed.private_key.includes("PRIVATE KEY")
    ) {
      return null;
    }
    return {
      client_email: parsed.client_email,
      private_key: parsed.private_key.replace(/\\n/g, "\n"),
    };
  } catch {
    return null;
  }
}

let cachedToken: { token: string; expiresAt: number } | null = null;

/** Gera (e cacheia ~50min) o Bearer token OAuth2 de curta duração. */
export async function getAccessToken(
  account: ServiceAccount | null = getServiceAccount(),
): Promise<string> {
  if (!account) {
    throw new GscError(
      0,
      "missing_credentials",
      "GOOGLE_SERVICE_ACCOUNT_JSON ausente/inválido no servidor",
    );
  }
  if (cachedToken && Date.now() < cachedToken.expiresAt) {
    return cachedToken.token;
  }
  const client = new JWT({
    email: account.client_email,
    key: account.private_key,
    scopes: [GSC_SCOPE],
  });
  const creds = await client.authorize();
  const token = creds.access_token;
  if (!token) {
    throw new GscError(0, "auth_failed", "OAuth2 não retornou access_token");
  }
  cachedToken = {
    token,
    expiresAt: (creds.expiry_date ?? Date.now() + 50 * 60 * 1000) - 120_000,
  };
  return token;
}

/* ---------------------------------------------------------------------------
 * Utilidades de URL (canonical apex sem barra final — padrão Etapa 5)
 * ------------------------------------------------------------------------- */

/** Dominio registravel (sem www) — chave das propriedades sc-domain no GSC. */
function registrableDomain(host: string): string {
  return host.startsWith("www.") ? host.slice(4) : host;
}

/** Domínios-base do ecossistema (propriedades sc-domain no GSC). */
export const BASE_DOMAINS = [
  "solvegrid.com.br",
  "aquitemachadinhos.com.br",
  "nexusplataforma.ia.br",
] as const;

function baseDomainOf(host: string): string | null {
  for (const base of BASE_DOMAINS) {
    if (host === base || host.endsWith(`.${base}`)) return base;
  }
  return null;
}

/** Aceita o host exato validado QUALQUER subdomínio dos domínios-base
 *  (satélites de cidade: teresina.aquitemachadinhos.com.br etc.). */
function isAllowedHost(host: string): host is AllowedHost {
  return (
    (ALLOWED_HOSTS as readonly string[]).includes(host) ||
    baseDomainOf(host) !== null
  );
}

/** Sanitiza 1 URL: só https, só hosts validados, sem query/fragment, apex sem barra. */
export function sanitizeUrl(raw: string): string | null {
  try {
    const u = new URL(raw.trim());
    if (u.protocol !== "https:") return null;
    if (!isAllowedHost(u.hostname)) return null;
    u.hash = "";
    u.search = "";
    if (u.pathname === "/") return `https://${u.hostname}`;
    const path = u.pathname.replace(/\/+$/, "");
    return `https://${u.hostname}${path}`;
  } catch {
    return null;
  }
}

function groupByHost(urls: readonly string[]): Map<string, string[]> {
  const map = new Map<string, string[]>();
  for (const url of urls) {
    const { hostname } = new URL(url);
    const bucket = map.get(hostname);
    if (bucket) bucket.push(url);
    else map.set(hostname, [url]);
  }
  return map;
}

/* ---------------------------------------------------------------------------
 * HTTP Google (timeout + 1 retry em 5xx/rede; nunca retry em 429/4xx)
 * ------------------------------------------------------------------------- */

async function gscRequest<T>(
  url: string,
  init: RequestInit,
  token: string,
  attempt = 0,
): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      ...init,
      headers: {
        ...(init.headers as Record<string, string> | undefined),
        Authorization: `Bearer ${token}`,
      },
      signal: controller.signal,
    });
    if (res.ok) {
      if (res.status === 204) return {} as T;
      return (await res.json()) as T;
    }
    const body = await res.text();
    let reason = `http_${res.status}`;
    let message = body.slice(0, 300);
    try {
      const parsed = JSON.parse(body) as {
        error?: { status?: string; message?: string };
      };
      if (parsed.error?.status) reason = parsed.error.status;
      if (parsed.error?.message) message = parsed.error.message;
    } catch {
      /* corpo não-JSON: mantém fallback */
    }
    if (res.status >= 500 && attempt < 1) {
      return gscRequest<T>(url, init, token, attempt + 1);
    }
    throw new GscError(res.status, reason, message);
  } catch (err) {
    if (err instanceof GscError) throw err;
    if (attempt < 1) return gscRequest<T>(url, init, token, attempt + 1);
    throw new GscError(
      0,
      "network_error",
      err instanceof Error ? err.message : "network error",
    );
  } finally {
    clearTimeout(timer);
  }
}

/* ---------------------------------------------------------------------------
 * Operações Search Console
 * ------------------------------------------------------------------------- */

/** PUT sitemaps: submete/re-submete o sitemap incremental do domínio. */
export async function submitSitemap(
  host: string,
  token: string,
  sitemapPath: string = process.env["NEXUS_SITEMAP_PATH"] ?? DEFAULT_SITEMAP_PATH,
): Promise<void> {
  let feedUrl = `https://${host}${sitemapPath}`;
  try {
    const probe = await fetch(feedUrl, { method: "HEAD", redirect: "follow" });
    if (probe.ok && probe.url.startsWith("https://")) {
      feedUrl = probe.url; // URL final pós-redirect (ex.: apex -> www)
    }
  } catch {
    /* fail-closed: mantém URL canônica */
  }
  // propriedade GSC é sempre o domínio-base (sc-domain cobre subdomínios);
  // o feed pode ser o sitemap do próprio subdomínio (satélites de cidade)
  const siteUrl = encodeURIComponent(
    `sc-domain:${baseDomainOf(host) ?? registrableDomain(host)}`,
  );
  const feed = encodeURIComponent(feedUrl);
  await gscRequest<void>(
    `${WEBMASTERS_BASE}/sites/${siteUrl}/sitemaps/${feed}`,
    { method: "PUT" },
    token,
  );
}

/** POST urlInspection/index:inspect — mede o estado de indexação da URL. */
export async function inspectUrl(
  url: string,
  host: string,
  token: string,
): Promise<InspectionOutcome> {
  const res = await gscRequest<InspectionResponse>(
    INSPECT_ENDPOINT,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        inspectionUrl: url,
        siteUrl: `sc-domain:${baseDomainOf(host) ?? registrableDomain(host)}`,
        languageCode: "pt-BR",
      }),
    },
    token,
  );
  const index = res.inspectionResult?.indexStatusResult;
  // Shape real da API: { verdict: PASS|NEUTRAL|PARTIAL|FAIL, coverageState, lastCrawlTime }
  const verdict = index?.verdict ?? "UNKNOWN";
  const coverage = index?.coverageState ?? "";
  return {
    indexed: verdict === "PASS" || /indexada/i.test(coverage),
    status: [verdict, coverage].filter(Boolean).join(" · "),
    coverageState: coverage,
    lastCrawlTime: index?.lastCrawlTime,
  };
}

/* ---------------------------------------------------------------------------
 * Persistência Supabase (REST com service_role) — fila, quota, telemetria
 * ------------------------------------------------------------------------- */

interface QueueClaimRow {
  id: number;
  url: string;
  host: string;
  priority: number;
}

function supabaseConfig(): { url: string; key: string } | null {
  // Prioriza as variáveis namespaced do motor (NexusPlataforma); fallback
  // para os nomes clássicos (nunca sobrescrever os envs legados dos sites).
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
  if (!cfg) return null; // fail-closed: degrada sem quebrar
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
      console.warn(
        `[supabase] ${path} → HTTP ${res.status} (fail-closed, seguindo sem persistir)`,
      );
      return null;
    }
    const text = await res.text();
    return text ? (JSON.parse(text) as unknown) : null;
  } catch (err) {
    console.warn(
      `[supabase] ${path} falhou: ${err instanceof Error ? err.message : "erro"} (fail-closed)`,
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

/** Telemetria sanitizada (RPC aplica redact de key=/token= no banco). */
async function logTelemetry(
  job: string,
  status: string,
  host: string | null,
  httpStatus: number | null,
  itemsTotal: number,
  itemsSent: number,
  message: string,
): Promise<void> {
  const persisted = await sbRpc<unknown>("nexus_cron_telemetry_log", {
    p_job: job,
    p_status: status,
    p_host: host,
    p_http_status: httpStatus,
    p_items_total: itemsTotal,
    p_items_sent: itemsSent,
    p_message: message,
  });
  if (persisted === null && !supabaseConfig()) {
    console.log(`[telemetry:local] ${job}/${status} ${host ?? "-"} :: ${message}`);
  }
}

/* --- rate limiter persistido (200/dia/domínio) --------------------------- */

const localQuotaFallback = new Map<string, number>();

async function reserveQuota(host: string, requested: number): Promise<number> {
  const granted = await sbRpc<number>("nexus_bump_index_quota", {
    p_host: host,
    p_requested: requested,
  });
  if (typeof granted === "number") return granted;
  // Sem Supabase env: fallback local por processo (ainda respeita o teto)
  const used = localQuotaFallback.get(host) ?? 0;
  const grant = Math.min(requested, Math.max(DAILY_LIMIT_PER_HOST - used, 0));
  localQuotaFallback.set(host, used + grant);
  console.warn(
    `[quota] fallback local em memória (${host}: concedido ${grant}/${DAILY_LIMIT_PER_HOST})`,
  );
  return grant;
}

/* --- fila nexus_google_index_queue ---------------------------------------- */

async function claimQueue(limit: number): Promise<QueueClaimRow[]> {
  const rows = await sbRpc<QueueClaimRow[]>("nexus_google_queue_claim", {
    p_limit: limit,
  });
  return Array.isArray(rows) ? rows : [];
}

async function updateQueueRow(
  url: string,
  status: string,
  verdict?: string,
  message?: string,
): Promise<void> {
  const body: Record<string, unknown> = {
    status,
    updated_at: new Date().toISOString(),
  };
  if (verdict !== undefined) body["last_inspection_verdict"] = verdict;
  if (message !== undefined) body["last_inspection_verdict"] = `${verdict ?? ""} ${message}`.trim();
  await sbRequest(
    `/nexus_google_index_queue?url=eq.${encodeURIComponent(url)}`,
    { method: "PATCH", body: JSON.stringify(body), headers: { Prefer: "return=minimal" } },
  );
}

async function setQueueStatus(urls: readonly string[], status: string): Promise<void> {
  for (const url of urls) {
    await updateQueueRow(url, status);
  }
}

/** Enfileira URLs com status 'pending_google_crawl' (upsert por url única). */
export async function enqueuePending(urls: readonly string[]): Promise<void> {
  const valid = [...new Set(urls.map(sanitizeUrl).filter((u): u is string => u !== null))];
  if (valid.length === 0) return;
  const rows = valid.map((url) => ({
    url,
    host: new URL(url).hostname,
    priority: 100,
    status: "pending_google_crawl",
  }));
  await sbRequest("/nexus_google_index_queue?on_conflict=url", {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates" },
    body: JSON.stringify(rows),
  });
}

/* ---------------------------------------------------------------------------
 * PIPELINE PRINCIPAL — forceGoogleIndexation(urlList)
 * Sitemap incremental + inspeção em lote com quota/429 fail-closed.
 * ------------------------------------------------------------------------- */

function emptyHostReport(host: string): HostReport {
  return {
    host,
    sitemap: "skipped",
    quotaGranted: 0,
    inspected: 0,
    indexed: 0,
    rateLimited: false,
    errors: 0,
    pending: 0,
  };
}

export async function forceGoogleIndexation(
  urlList: readonly string[],
): Promise<IndexationReport> {
  const startedAt = new Date();
  const urls = [
    ...new Set(urlList.map(sanitizeUrl).filter((u): u is string => u !== null)),
  ];

  const finish = (
    ok: boolean,
    reason?: IndexationReport["reason"],
  ): IndexationReport => ({
    ok,
    reason: reason ?? null,
    totalUrls: urls.length,
    hosts: [],
    startedAt: startedAt.toISOString(),
    durationMs: Date.now() - startedAt.getTime(),
  });

  if (urls.length === 0) {
    await logTelemetry(
      "google_indexation",
      "skipped",
      null,
      null,
      urlList.length,
      0,
      "lote sem URLs válidas após sanitização (hosts permitidos: " +
        ALLOWED_HOSTS.join(", ") +
        ")",
    );
    return finish(false, "empty_batch");
  }

  // FAIL-CLOSED: sem credencial → loga, enfileira e retorna sem lançar erro
  const account = getServiceAccount();
  if (!account) {
    await logTelemetry(
      "google_indexation",
      "error",
      null,
      null,
      urls.length,
      0,
      "GOOGLE_SERVICE_ACCOUNT_JSON ausente/inválido no servidor — URLs preservadas em pending_google_crawl",
    );
    await enqueuePending(urls);
    return finish(false, "missing_credentials");
  }

  let token: string;
  try {
    token = await getAccessToken(account);
  } catch (err) {
    const gscErr =
      err instanceof GscError
        ? err
        : new GscError(0, "auth_failed", err instanceof Error ? err.message : "?");
    await logTelemetry(
      "google_indexation",
      "error",
      null,
      gscErr.status,
      urls.length,
      0,
      `falha OAuth2 (${gscErr.reason}) — URLs preservadas em pending_google_crawl`,
    );
    await enqueuePending(urls);
    return finish(false, "auth_failed");
  }

  const maxPerHost = Math.min(
    Math.max(
      Number.parseInt(process.env["NEXUS_MAX_URLS_PER_HOST"] ?? "", 10) ||
        DAILY_LIMIT_PER_HOST,
      1,
    ),
    DAILY_LIMIT_PER_HOST,
  );

  const byHost = groupByHost(urls);
  const hostReports: HostReport[] = [];
  const deadline = Date.now() + RUN_TIME_BUDGET_MS;

  for (const [host, hostUrls] of byHost) {
    const hr = emptyHostReport(host);
    hostReports.push(hr);

    // (1) Sitemap incremental — alavanca programática de re-crawl
    try {
      await submitSitemap(host, token);
      hr.sitemap = "submitted";
    } catch (err) {
      hr.sitemap = "error";
      hr.sitemapDetail = err instanceof GscError ? `${err.status} ${err.reason}` : "network";
      if (err instanceof GscError && err.status === 403) {
        await logTelemetry(
          "google_indexation",
          "error",
          host,
          403,
          hostUrls.length,
          0,
          "403 no sitemap: propriedade sc-domain não verificada para o service account — adicione o e-mail do bot como usuário no Search Console",
        );
      }
    }

    // (2) Rate limit por PROPRIEDADE GSC (200/dia no domínio registrável —
    //     subdomínios de cidade compartilham o mesmo orçamento)
    const wanted = Math.min(hostUrls.length, maxPerHost);
    const granted = await reserveQuota(baseDomainOf(host) ?? host, wanted);
    hr.quotaGranted = granted;

    if (granted === 0) {
      hr.rateLimited = true;
      hr.pending = hostUrls.length;
      await setQueueStatus(hostUrls, "pending_google_crawl");
      await logTelemetry(
        "google_indexation",
        "rate_limited",
        host,
        429,
        hostUrls.length,
        0,
        "cota diária esgotada (200/dia/domínio) — lote integral preservado em pending_google_crawl",
      );
      continue;
    }

    const budget = hostUrls.slice(0, granted);
    const overflow = hostUrls.slice(granted);
    if (overflow.length > 0) {
      hr.pending += overflow.length;
      await setQueueStatus(overflow, "pending_google_crawl");
    }

    // (3) Inspeção em lote com concorrência controlada + orçamento de tempo.
    //     2.000/dia oficial; teto corporativo 200/dia/domínio; 4 em paralelo
    //     (~120/min) respeita 600/min global e 200/min por propriedade.
    let halted = false;
    let cursor = 0;
    const worker = async (): Promise<void> => {
      while (!halted && Date.now() < deadline) {
        const i = cursor++;
        if (i >= budget.length) return;
        const url = budget[i] as string;
        try {
          const outcome = await inspectUrl(url, host, token);
          hr.inspected += 1;
          if (outcome.indexed) {
            hr.indexed += 1;
            await updateQueueRow(url, "indexed", outcome.status);
          } else {
            hr.pending += 1;
            await updateQueueRow(url, "submitted", outcome.status);
          }
        } catch (err) {
          if (
            err instanceof GscError &&
            (err.status === 429 || /rate|quota/i.test(err.reason))
          ) {
            hr.rateLimited = true;
            hr.pending += 1;
            await updateQueueRow(url, "pending_google_crawl");
            halted = true; // resto do lote volta para a fila
          } else if (err instanceof GscError && err.status === 403) {
            hr.errors += 1;
            hr.pending += 1;
            await updateQueueRow(url, "pending_google_crawl");
            halted = true;
            await logTelemetry(
              "google_indexation",
              "error",
              host,
              403,
              budget.length,
              hr.inspected,
              "403 na inspeção: service account sem permissão na propriedade — adicione-o no Search Console (Usuários e permissões)",
            );
          } else {
            hr.errors += 1;
            await updateQueueRow(
              url,
              "failed",
              undefined,
              err instanceof GscError ? `${err.status} ${err.reason}`.slice(0, 120) : "network",
            );
          }
        }
      }
    };
    await Promise.all(Array.from({ length: INSPECT_CONCURRENCY }, () => worker()));

    // sobras (halt/deadline): devolve tudo que não foi processado à fila e
    // REEMBOLSA a quota concedida mas não usada (nexus_refund_index_quota)
    const processedMax = halted || Date.now() >= deadline ? cursor : budget.length;
    const leftovers = budget.slice(processedMax);
    for (const url of leftovers) {
      hr.pending += 1;
      await updateQueueRow(url, "pending_google_crawl");
    }
    if (leftovers.length > 0) {
      await sbRpc<number>("nexus_refund_index_quota", {
        p_host: host,
        p_refund: leftovers.length,
      });
    }
    if (Date.now() >= deadline && hr.inspected < budget.length) {
      await logTelemetry(
        "google_indexation",
        "ok",
        host,
        null,
        budget.length,
        hr.inspected,
        `orçamento de tempo do run atingido — ${budget.length - hr.inspected} URLs devolvidas a pending_google_crawl (próxima janela do cron segue)`,
      );
    }

    await logTelemetry(
      "google_indexation",
      hr.rateLimited ? "rate_limited" : "ok",
      host,
      200,
      budget.length,
      hr.inspected,
      `sitemap=${hr.sitemap} inspecionadas=${hr.inspected} indexadas=${hr.indexed} pendentes=${hr.pending} erros=${hr.errors}`,
    );
  }

  return {
    ok: true,
    reason: null,
    totalUrls: urls.length,
    hosts: hostReports,
    startedAt: startedAt.toISOString(),
    durationMs: Date.now() - startedAt.getTime(),
  };
}

/* ---------------------------------------------------------------------------
 * ENTRYPOINT de scheduler (GitHub Actions a cada 4h / Vercel Cron)
 * Consome a fila 'pending_google_crawl' + hubs priorizados.
 * ------------------------------------------------------------------------- */

export async function runGoogleIndexationPipeline(): Promise<IndexationReport> {
  const claimLimit = Math.min(
    Math.max(Number.parseInt(process.env["NEXUS_CLAIM_LIMIT"] ?? "", 10) || 200, 1),
    500,
  );
  const claimed = await claimQueue(claimLimit);
  const hubs = (process.env["NEXUS_HUB_URLS"] ?? DEFAULT_HUB_URLS.join(","))
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  const urls = [...hubs, ...claimed.map((row) => row.url)];
  const report = await forceGoogleIndexation(urls);
  return {
    ...report,
    totalUrls: report.totalUrls,
    hosts: report.hosts,
  };
}
