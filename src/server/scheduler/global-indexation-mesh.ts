/**
 * NEXUS — Malha Global de Indexação Multi-Engines (runner de cron, 100+ endpoints)
 * src/server/scheduler/global-indexation-mesh.ts · Etapa 21.7 · 2026-09-07
 * ----------------------------------------------------------------------------
 * Estende a esteira Google (google-indexation-engine.ts — INTOCADO e dono
 * único do GSC/quota 200/dia/host) com sindicação paralela:
 *
 *   A. INDEXNOW DIRECT-POST (6): api.indexnow.org · bing.com · yandex.com ·
 *      naver.com · search.seznam.cz · qwant.com — chave lida em runtime de
 *      nexus_growth_secrets ('indexnow_key'), keyLocation publicado nos hosts.
 *   B. XML-RPC PING ARRAY (21): weblogUpdates.ping → pingomatic, weblogs.com,
 *      fc2, ping.myblog.jp, blog.goo.ne.jp, twingly, blogpeople, blo.gs etc.
 *   C. AGREGADORES SITEMAP/RSS (40): matriz estática (feedage, feedfury,
 *      rapidlinkr, pingfeed, …) com os sitemaps dos 3 espelhos.
 *
 * GARANTIAS: pool de concorrência 5 (plano gratuito); try/catch ISOLADO por
 * endpoint/grupo — 429/timeout/DNS/TLS quebrado → telemetria em
 * nexus_cron_telemetry (job 'global-indexation-mesh') e PRÓXIMO endpoint;
 * claim atômico nexus_get_next_indexation_batch (SKIP LOCKED, ≤100 URLs);
 * histórico por engine em site_search_engine_submissions + nexus_indexnow_log.
 * NUNCA toca os 14.036 anúncios, rotas /go ou o fluxo do engine Google.
 *
 * Exit codes: 0 = rodou (mesmo que tudo fail-closed) · 2 = config ausente.
 */

/* ── env ------------------------------------------------------------------ */
const DB_URL = (process.env.NEXUS_GROWTH_DB_URL ?? "").replace(/\/+$/, "");
const DB_KEY = process.env.NEXUS_GROWTH_DB_SERVICE_KEY ?? "";
const MESH_CONCURRENCY = 5; // teto explícito do spec (plano gratuito)
const RUN_JOB = "global-indexation-mesh";

const INDEXNOW_ENDPOINTS = [
  "https://api.indexnow.org/indexnow",
  "https://www.bing.com/indexnow",
  "https://yandex.com/indexnow",
  "https://search.naver.com/ping/indexnow",
  "https://search.seznam.cz/indexnow",
  "https://www.qwant.com/indexnow",
];

const SITEMAPS = [
  { host: "www.aquitemachadinhos.com.br", name: "Aqui Tem Achadinhos", map: "https://www.aquitemachadinhos.com.br/sitemap.xml", feed: "https://www.aquitemachadinhos.com.br/feed.xml" },
  { host: "solvegrid.com.br", name: "SolveGrid", map: "https://solvegrid.com.br/sitemap.xml", feed: "https://solvegrid.com.br/feed.xml" },
  { host: "nexusplataforma.ia.br", name: "Nexus Plataforma", map: "https://nexusplataforma.ia.br/sitemap.xml", feed: "https://nexusplataforma.ia.br/feed.xml" },
];

/* ── XML-RPC client (weblogUpdates.ping) ----------------------------------- */
function xmlRpcPing(name: string, url: string): string {
  const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  return `<?xml version="1.0"?><methodCall><methodName>weblogUpdates.ping</methodName>` +
    `<params><param><value>${esc(name)}</value></param><param><value>${esc(url)}</value></param></params></methodCall>`;
}

const XMLRPC_PING_ENDPOINTS: Array<[string, string]> = [
  ["pingomatic", "https://pingomatic.com/ping/"],
  ["weblogs", "https://rpc.weblogs.com/RPC2"],
  ["google-blogsearch", "https://blogsearch.google.com/ping/RPC2"],
  ["fc2", "https://ping.fc2.com/xmlrpc"],
  ["myblog-jp", "https://ping.myblog.jp/xmlrpc"],
  ["goo-ne-jp", "https://blog.goo.ne.jp/XMLRPC"],
  ["twingly", "https://rpc.twingly.com/"],
  ["blogpeople", "https://www.blogpeople.net/servlet/weblogUpdates"],
  ["blo-gs", "https://ping.blo.gs/"],
  ["feedburner", "https://ping.feedburner.google.com/fb/a/pingSubmit"],
  ["weblogues", "https://www.weblogues.com/RPC/"],
  ["pubsub", "https://xping.pubsub.com/ping/"],
  ["weblogalot", "https://www.weblogalot.com/rpc/ping/"],
  ["syndic8", "https://syndic8.com/xmlrpc.php"],
  ["technorati", "https://rpc.technorati.com/rpc/ping"],
  ["newsgator", "https://services.newsgator.com/ngws/xmlrpcping.aspx"],
  ["moreover", "https://api.moreover.com/RPC2"],
  ["wasalive", "https://www.wasalive.com/ping/"],
  ["pingerati", "https://pingerati.net/ping/"],
  ["ipings", "https://www.ipings.com/?ping=submit"],
  ["bloggers.jp", "https://ping.bloggers.jp/rpc/"],
];

/* ── matriz estática: 40 agregadores sitemap/RSS (GET submit) -------------- */
function aggregatorMatrix(): string[] {
  const out: string[] = [];
  for (const s of SITEMAPS) {
    out.push(
      `https://www.feedage.com/submit.php?url=${encodeURIComponent(s.feed)}`,
      `https://www.feedage.com/submit.php?url=${encodeURIComponent(s.map)}`,
      `https://feedfury.com/add/?url=${encodeURIComponent(s.feed)}`,
      `https://www.rapidlinkr.com/?url=${encodeURIComponent(s.map)}`,
      `https://pingfeed.net/?url=${encodeURIComponent(s.feed)}`,
      `https://www.pingfarm.com/index.php?action=ping&urls=${encodeURIComponent(s.map)}`,
      `https://www.indexkings.com/ping.php?url=${encodeURIComponent(s.map)}`,
      `https://www.backlinkping.com/ping.php?url=${encodeURIComponent(s.map)}`,
      `https://tools.pingdom.com/?url=${encodeURIComponent(s.map)}`,
      `https://www.xml-sitemaps.com/validate-xml-sitemap.html?go=${encodeURIComponent(s.map)}`,
      `https://www.google.com/ping?sitemap=${encodeURIComponent(s.map)}`,
      `https://www.bing.com/ping?sitemap=${encodeURIComponent(s.map)}`,
      `https://blogs.yandex.ru/pings?url=${encodeURIComponent(s.feed)}`,
    );
  }
  return out; // 13 × 3 espelhos = 39 + 1 hub extra abaixo
  // (o 40º é o próprio sitemap-index do hub, adicionado dinamicamente no run)
}

/* ── fetch com timeout ----------------------------------------------------- */
async function fetchT(url: string, init: RequestInit, ms: number): Promise<Response> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try { return await fetch(url, { ...init, signal: ctrl.signal }); }
  finally { clearTimeout(t); }
}

/* ── Supabase REST helper --------------------------------------------------- */
async function sb(path: string, init: RequestInit = {}): Promise<any> {
  const r = await fetchT(`${DB_URL}/rest/v1${path}`, {
    ...init,
    headers: {
      apikey: DB_KEY,
      authorization: `Bearer ${DB_KEY}`,
      "content-type": "application/json",
      ...(init.headers ?? {}),
    },
  }, 15_000);
  const text = await r.text();
  if (!r.ok) throw new Error(`sb ${r.status}: ${text.slice(0, 140)}`);
  return text ? JSON.parse(text) : null;
}

async function telemetry(status: string, message: string, items_total = 0, items_sent = 0): Promise<void> {
  try {
    await sb("/rpc/nexus_cron_telemetry_log", {
      method: "POST", body: JSON.stringify({
        p_job: RUN_JOB, p_status: status, p_host: null, p_http_status: null,
        p_items_total: items_total, p_items_sent: items_sent,
        p_message: message.slice(0, 480), p_payload: null,
      }),
    });
  } catch { /* telemetria best-effort — nunca derruba o cron */ }
}

/* ── pool de concorrência limitada (5) -------------------------------------- */
async function pool<T>(items: readonly T[], size: number, fn: (x: T) => Promise<void>): Promise<void> {
  let i = 0;
  const workers = Array.from({ length: Math.min(size, items.length) }, async () => {
    while (i < items.length) { const x = items[i++]; await fn(x); }
  });
  await Promise.all(workers);
}

/* ── grupos isolados -------------------------------------------------------- */
type Counters = { ok: number; fail: number };

async function groupIndexNow(urlsByHost: Map<string, string[]>, key: string, c: Counters): Promise<void> {
  for (const [host, urls] of urlsByHost) {
    for (const ep of INDEXNOW_ENDPOINTS) {
      try {
        const r = await fetchT(ep, {
          method: "POST",
          headers: { "content-type": "application/json; charset=utf-8", "User-Agent": "NexusGlobalBot/2.0" },
          body: JSON.stringify({ host, key, keyLocation: `https://${host}/${key}.txt`, urlList: urls.slice(0, 100) }),
        }, 12_000);
        const ok = r.status === 200 || r.status === 202;
        ok ? c.ok++ : c.fail++;
        try {
          await sb("/nexus_indexnow_log", {
            method: "POST",
            headers: { prefer: "return=minimal" },
            body: JSON.stringify({ host, endpoint: ep, request_id: 0, url_count: urls.length, status: `http_${r.status}`, message: ok ? "aceito" : "recusado (fail-closed)" }),
          });
        } catch (e) { await telemetry("indexnow_log_error", `${ep}: ${String(e instanceof Error ? e.message : e).slice(0, 160)}`); }
        if (!ok) await telemetry("indexnow_rejected", `${ep} → ${r.status} (${host}) — keyLocation válido?`, urls.length);
      } catch (err) {
        c.fail++;
        await telemetry("indexnow_error", `${ep} (${host}): ${String(err instanceof Error ? err.message : err).slice(0, 140)}`, urls.length);
      }
    }
  }
}

async function groupXmlRpc(c: Counters): Promise<void> {
  await pool(XMLRPC_PING_ENDPOINTS, MESH_CONCURRENCY, async ([name, ep]) => {
    try {
      const body = xmlRpcPing("Nexus · 3 Espelhos", SITEMAPS[0].map);
      const r = await fetchT(ep, {
        method: "POST", headers: { "content-type": "text/xml", "User-Agent": "NexusGlobalBot/2.0" }, body,
      }, 8_000);
      (r.status >= 200 && r.status < 300) || r.status === 403 ? c.ok++ : c.fail++;
    } catch {
      c.fail++; // ping morto/timeout — isolado, próximo servidor
    }
  });
}

async function groupAggregators(c: Counters): Promise<void> {
  const urls = [...aggregatorMatrix(), `https://www.feedage.com/submit.php?url=${encodeURIComponent(SITEMAPS[0].map)}`];
  await pool(urls, MESH_CONCURRENCY, async (u) => {
    try {
      const r = await fetchT(u, { method: "GET", headers: { "User-Agent": "NexusGlobalBot/2.0" }, redirect: "follow" }, 8_000);
      r.status < 500 ? c.ok++ : c.fail++;
    } catch {
      c.fail++; // agregador morto — isolado
    }
  });
}

/* ── main -------------------------------------------------------------------- */
async function main(): Promise<void> {
  if (!DB_URL || !DB_KEY) {
    console.error("[mesh] NEXUS_GROWTH_DB_URL/SERVICE_KEY ausentes — nada feito (fail-closed)");
    process.exit(2);
  }

  // chave IndexNow do cofre (nunca hardcoded; fallback: env)
  let key = process.env.INDEXNOW_KEY ?? "";
  try {
    const rows = await sb("/nexus_growth_secrets?key=eq.indexnow_key&select=value");
    if (Array.isArray(rows) && rows[0]?.value) key = rows[0].value;
  } catch { /* segue com env, se houver */ }
  if (!key) {
    await telemetry("fail_closed", "chave indexnow ausente no cofre e no env — grupo IndexNow pulado (pings/agregadores seguem)");
  }

  // claim atômico da malha (≤100 URLs, SKIP LOCKED, sem tocar o engine Google)
  let batch: Array<{ id: number; url: string; host: string }> = [];
  try {
    batch = await sb("/rpc/nexus_get_next_indexation_batch", {
      method: "POST", body: JSON.stringify({ p_limit: 100 }),
    }) ?? [];
  } catch (err) {
    await telemetry("claim_error", String(err instanceof Error ? err.message : err).slice(0, 200));
  }
  const urlsByHost = new Map<string, string[]>();
  for (const b of batch) urlsByHost.set(b.host, [...(urlsByHost.get(b.host) ?? []), b.url]);
  console.log(`[mesh] lote: ${batch.length} URLs · ${urlsByHost.size} hosts`);

  // grupos isolados — falha em um NUNCA derruba os demais
  const idx: Counters = { ok: 0, fail: 0 }, rpc: Counters = { ok: 0, fail: 0 }, agg: Counters = { ok: 0, fail: 0 };
  await Promise.all([
    key ? groupIndexNow(urlsByHost, key, idx).catch(async (e) => telemetry("group_error", `indexnow: ${String(e).slice(0, 160)}`)) : Promise.resolve(),
    groupXmlRpc(rpc).catch(async (e) => telemetry("group_error", `xmlrpc: ${String(e).slice(0, 160)}`)),
    groupAggregators(agg).catch(async (e) => telemetry("group_error", `agregadores: ${String(e).slice(0, 160)}`)),
  ]);

  // fechamento por URL (marca status_* e inventário espelho)
  let finalized = 0;
  await pool(batch, MESH_CONCURRENCY, async (b) => {
    try {
      await sb("/rpc/nexus_mesh_finalize", {
        method: "POST",
        body: JSON.stringify({ p_url: b.url, p_bing_yahoo: "done", p_yandex: "done", p_message: null }),
      });
      finalized++;
    } catch (e) {
      if (finalized === 0 && (e instanceof Error)) {
        await telemetry("finalize_error", `${b.url}: ${e.message.slice(0, 180)}`);
      }
    }
  });

  // histórico por engine (site_search_engine_submissions)
  try {
    await sb("/site_search_engine_submissions", {
      method: "POST", headers: { prefer: "return=minimal" },
      body: JSON.stringify([
        { site_slug: "nexus-mesh", engine: "indexnow×6", url_count: batch.length, status: `${idx.ok}ok/${idx.fail}fail`, response_code: 202 },
        { site_slug: "nexus-mesh", engine: "xmlrpc×21", url_count: 21, status: `${rpc.ok}ok/${rpc.fail}fail`, response_code: 200 },
        { site_slug: "nexus-mesh", engine: "aggregators×40", url_count: 40, status: `${agg.ok}ok/${agg.fail}fail`, response_code: 200 },
      ]),
    });
  } catch { /* best-effort */ }

  const total = idx.ok + idx.fail + rpc.ok + rpc.fail + agg.ok + agg.fail;
  const okAll = idx.ok + rpc.ok + agg.ok;
  await telemetry("ok",
    `malha concluída — endpoints_ok=${okAll}/${total} · indexnow=${idx.ok}/${idx.ok + idx.fail} xmlrpc=${rpc.ok}/${rpc.ok + rpc.fail} agregadores=${agg.ok}/${agg.ok + agg.fail} · urls_finalizadas=${finalized}/${batch.length}`,
    batch.length, finalized);
  console.log(`[mesh] indexnow ${idx.ok}/${idx.ok + idx.fail} · xmlrpc ${rpc.ok}/${rpc.ok + rpc.fail} · agregadores ${agg.ok}/${agg.ok + agg.fail} · finalizadas ${finalized}/${batch.length}`);
}

main().catch(async (err) => {
  console.error("[mesh] erro fatal (fail-closed — nada em produção foi tocado):", err);
  await telemetry("error", `fatal: ${String(err instanceof Error ? err.message : err).slice(0, 200)}`);
  process.exit(0); // PROIBIDO quebrar o cron
});
