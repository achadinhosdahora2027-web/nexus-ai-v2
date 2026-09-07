// ============================================================================
// NEXUS MATRIX AGENTS CLUSTER — Orquestrador central (Edge Function)
// supabase/functions/nexus-matrix-orchester/index.ts · Etapa 21.2 · 2026-09-07
// ----------------------------------------------------------------------------
// Arquitetura de Agentes em Matriz: agentes são LINHAS em public.nexus_agents,
// não processos/containers. Esta função é o ÚNICO ponto de execução:
//   1. auth fail-closed (x-matrix-secret)
//   2. claim atômico de lote na fila (FOR UPDATE SKIP LOCKED via RPC)
//   3. carrega instrução do agente + contexto sitemap/conversões (read-only)
//   4. DUAL-KEY FALLBACK: tenta o provedor-líder (MATRIX_MODEL ou OpenAI);
//      HTTP 429 (rate limit), 402 (sem saldo), 401, 5xx ou FALHA DE CONEXÃO
//      → aviso na telemetria + IMEDIATAMENTE o próximo provedor (Claude/API
//      secundária) processa a tarefa sem interrupção (try/catch aninhado).
//   5. falha final do agente → telemetria + próxima tarefa (nunca 500)
//
// VAULT SERVER-SIDE (Deno.env — equivalente seguro de process.env no runtime
// Deno das Edge Functions; configure via `supabase functions secrets set`):
//   NEXUS_MATRIX_SECRET   (obrigatório — auth do cron/GHA)
//   OPENAI_API_KEY        (provedor líder por default)
//   CLAUDE_API_KEY        (contingência de produção; aceita ANTHROPIC_API_KEY)
//   MATRIX_MODEL          (opcional — "gpt-…" prioriza OpenAI; "claude-…"
//                          prioriza Claude como líder da cadeia)
//   MATRIX_MAX_TOKENS     (opcional — default 800)
//   MATRIX_CONCURRENCY    (opcional — default 4)
// SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY são injetados pela plataforma.
//
// GARANTIAS DE ISOLAMENTO: modo estritamente READ-ONLY sobre ads (14.036
// anúncios), ads_clicks, nexus_ecommerce_routes, nexus_social_outbox e
// ads_seo_submissions. Escrita APENAS em nexus_agent_tasks_queue (estado da
// fila) e logs EXCLUSIVAMENTE em public.nexus_cron_telemetry (via helper
// fail-closed). Fail-closed ponta a ponta: sem segredo → 401/503; sem chave
// IA → lote 'skipped' + telemetria; provedor caído → contingência; tudo
// caído → tarefa em backoff e próxima — anúncios e rotas jamais tocados.
// ============================================================================

import { createClient } from "npm:@supabase/supabase-js@2";

const RUN_JOB = "nexus-matrix-orchester";
const RUN_BUDGET_MS = 150_000; // guarda-fogo p/ wall-clock do run
const t0 = Date.now();

// env de runtime (Deno): equivalente a process.env no Node
const env = (key: string): string | undefined => Deno.env.get(key);

// ── util: respostas ────────────────────────────────────────────────────────
const json = (status: number, body: Record<string, unknown>) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });

// ── util: comparação de segredo em tempo constante ─────────────────────────
function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

// ── util: fetch com timeout (falha de conexão vira exceção tratável) ───────
async function fetchT(url: string, init: RequestInit, ms: number): Promise<Response> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  try {
    return await fetch(url, { ...init, signal: ctrl.signal });
  } finally {
    clearTimeout(timer);
  }
}

// ── telemetria: canal fail-closed, logs SÓ em nexus_cron_telemetry ─────────
type Telemetry = {
  log(p: { status?: string; host?: string | null; http_status?: number | null;
           items_total?: number; items_sent?: number; message?: string | null;
           payload?: Record<string, unknown> }): Promise<void>;
};
function makeTelemetry(sb: ReturnType<typeof createClient>): Telemetry {
  return {
    async log(p) {
      try {
        await sb.rpc("nexus_cron_telemetry_log", {
          p_job: RUN_JOB,
          p_status: p.status ?? "ok",
          p_host: p.host ?? null,
          p_http_status: p.http_status ?? null,
          p_items_total: p.items_total ?? 0,
          p_items_sent: p.items_sent ?? 0,
          p_message: (p.message ?? null)?.slice(0, 480) ?? null,
          p_payload: p.payload ?? null,
        });
      } catch { /* telemetria é best-effort: jamais propaga */ }
    },
  };
}

// ── malha de dados ilimitados (APIs no-auth) — cache read-through ──────────
// Fluxo fail-closed: cache fresco → usa local (zero ms, zero carga externa);
// expirado → fetch nativo (User-Agent: NexusGlobalBot/2.0) → upsert; falha
// (rede/timeout/429/5xx) → telemetria em nexus_cron_telemetry + null (o
// contexto autodeclara a ausência amigável para o agente).
const NEXUS_BOT_UA = "NexusGlobalBot/2.0";

async function cachedExternal(
  sb: ReturnType<typeof createClient>,
  provider: string,
  key: string,
  url: string,
  ttlSeconds: number,
  validate?: (p: Record<string, unknown>) => boolean,
): Promise<Record<string, unknown> | null> {
  // 1) CACHE LOCAL PRIMEIRO
  try {
    const { data } = await sb
      .from("nexus_external_data_cache")
      .select("payload_response")
      .eq("query_key", key)
      .gt("expires_at", new Date().toISOString())
      .maybeSingle();
    if (data) return data.payload_response as Record<string, unknown>;
  } catch { /* cache indisponível → segue para o fetch (fail-closed) */ }

  // 2) MISS/EXPIRADO → FETCH EXTERNO + ATUALIZA O RESERVATÓRIO
  try {
    const r = await fetchT(url, { headers: { "User-Agent": NEXUS_BOT_UA, accept: "application/json" } }, 8_000);
    if (!r.ok) throw new Error(`http ${r.status}`);
    const payload = (await r.json()) as Record<string, unknown>;
    if (validate && !validate(payload)) throw new Error("payload recusado pela validação (shape inesperado)");
    const { error: upErr } = await sb.from("nexus_external_data_cache").upsert({
      provider_slug: provider, query_key: key, payload_response: payload,
      fetched_at: new Date().toISOString(),
      expires_at: new Date(Date.now() + ttlSeconds * 1000).toISOString(),
    }, { onConflict: "query_key" });
    if (upErr) throw new Error(`upsert: ${String(upErr).slice(0, 100)}`);
    return payload;
  } catch (err) {
    try {
      await sb.rpc("nexus_cron_telemetry_log", {
        p_job: RUN_JOB, p_status: "external_api_error", p_host: provider,
        p_message: `${provider}/${key}: ${String(err instanceof Error ? err.message : err).slice(0, 160)}`,
      });
    } catch { /* telemetria best-effort */ }
    return null;
  }
}

// ── contexto de dados (sitemap/conversões) — read-only, cada item fail-closed
type Ctx = Record<string, unknown>;
async function loadContext(sb: ReturnType<typeof createClient>): Promise<Ctx> {
  const ctx: Ctx = { generated_at: new Date().toISOString() };
  const svcKey = env("SUPABASE_SERVICE_ROLE_KEY") ?? "";

  const counts: Array<[string, string]> = [
    ["anuncios_ativos", "ads?select=id&limit=1"],
    ["rotas_ecommerce", "nexus_ecommerce_routes?select=id&limit=1"],
    ["cliques_conversoes", "ads_clicks?select=id&limit=1"],
    ["fila_indexacao_pendente", "ads_seo_submissions?select=id&limit=1&status=eq.pending"],
  ];
  for (const [key, path] of counts) {
    try {
      const r = await fetchT(`${env("SUPABASE_URL")}/rest/v1/${path}`, {
        headers: { apikey: svcKey, authorization: `Bearer ${svcKey}`, prefer: "count=exact" },
      }, 8_000);
      const total = r.headers.get("content-range")?.split("/")[1];
      if (total) ctx[key] = Number(total);
    } catch { /* ausência declarada no contexto */ }
  }

  const sitemaps: Array<[string, string]> = [
    ["sitemap_aquitemachadinhos_urls", "https://www.aquitemachadinhos.com.br/sitemap.xml"],
    ["sitemap_solvegrid_urls", "https://solvegrid.com.br/sitemap.xml"],
  ];
  for (const [key, url] of sitemaps) {
    try {
      const r = await fetchT(url, { method: "GET" }, 8_000);
      if (r.ok) ctx[key] = (await r.text()).match(/<loc>/g)?.length ?? 0;
    } catch { /* host fora — contexto declara ausência */ }
  }

  // 3) clima (snapshots do nexus-weather-context · Open-Meteo) — read-only:
  //    mais recente por cidade; falha autodeclarada no contexto (fail-closed)
  try {
    const { data: wx, error: wxErr } = await sb
      .from("nexus_weather_snapshots")
      .select("city_slug,summary,fetched_at")
      .order("fetched_at", { ascending: false })
      .limit(12);
    const clima: Record<string, string> = {};
    for (const w of wx ?? []) if (!(w.city_slug in clima)) clima[w.city_slug] = w.summary;
    if (Object.keys(clima).length) ctx.clima = clima;
  } catch (e) {
    ctx.clima_erro = String(e instanceof Error ? e.message : e).slice(0, 160);
  }

  // 4) MALHA DE DADOS ILIMITADOS (no-auth · cache-first em
  //    nexus_external_data_cache · UA NexusGlobalBot/2.0 · TTL por provedor)
  const [wikiPeao, wikiBarretos, wikiUber] = await Promise.all([
    cachedExternal(sb, "wikipedia", "wikipedia:pt:festa-do-peao-barretos",
      `https://pt.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent("Festa do Peão de Barretos")}`, 604_800), // 7 d
    cachedExternal(sb, "wikipedia", "wikipedia:pt:barretos",
      `https://pt.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent("Barretos")}`, 604_800),
    cachedExternal(sb, "wikipedia", "wikipedia:pt:uberlandia",
      `https://pt.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent("Uberlândia")}`, 604_800),
  ]);

  // câmbio 24/7 → agente currency-fx-hedging: AwesomeAPI (tempo real) e,
  // se cota/quota esgotar (429), Frankfurter/ECB — ambas no-auth.
  let fx = await cachedExternal(sb, "awesomeapi", "awesomeapi:usd-eur-brl",
    "https://economia.awesomeapi.com.br/last/USD-BRL,EUR-BRL", 1800,
    (p) => !!p.USDBRL || !!p.EURBRL);
  let fxFonte = "awesomeapi";
  if (!fx) {
    const [fUsd, fEur] = await Promise.all([
      cachedExternal(sb, "frankfurter", "frankfurter:usd-brl",
        "https://api.frankfurter.app/latest?from=USD&to=BRL", 1800, (p) => !!(p as any)?.rates?.BRL),
      cachedExternal(sb, "frankfurter", "frankfurter:eur-brl",
        "https://api.frankfurter.app/latest?from=EUR&to=BRL", 1800, (p) => !!(p as any)?.rates?.BRL),
    ]);
    if (fUsd || fEur) {
      fx = { USDBRL: fUsd ? { bid: (fUsd as any).rates.BRL } : null,
             EURBRL: fEur ? { bid: (fEur as any).rates.BRL } : null };
      fxFonte = "frankfurter (ECB)";
    }
  }
  const usd = (fx?.USDBRL ?? null) as Record<string, unknown> | null;
  const eur = (fx?.EURBRL ?? null) as Record<string, unknown> | null;
  if (usd || eur) {
    ctx.cambio = {
      fonte: fxFonte,
      usd_brl: usd ? Number(usd.bid) : null,
      eur_brl: eur ? Number(eur.bid) : null,
      variacao_24h_pct: { usd: usd?.pctChange != null ? Number(usd.pctChange) : null,
                          eur: eur?.pctChange != null ? Number(eur.pctChange) : null },
    };
  } else ctx.cambio_indisponivel = "cotação indisponível neste run (fail-closed — awesomeapi e frankfurter)";

  // geopolítica → labels: RestCountries (v3.2); se recusado/deprecado, deriva
  // do dataset no-auth mledoze/countries (CDN jsDelivr, 1 linha p/ todos)
  const RC = (cc: string) => cachedExternal(sb, "restcountries", `restcountries:${cc.toLowerCase()}`,
    `https://restcountries.com/v3.2/alpha/${cc}?fields=name,capital,currencies,languages,cca2`, 2_592_000,
    (p) => Array.isArray(p));
  const geoOf = (c: Record<string, unknown> | null) => {
    const e = Array.isArray(c) ? (c[0] as Record<string, any>) : (c as Record<string, any>);
    if (!e) return null;
    return { nome: e.name?.common, capital: e.capital?.[0] ?? null,
      moedas: Object.keys(e.currencies ?? {}), idiomas: Object.values(e.languages ?? {}) };
  };
  const [rcBr, rcUs, rcPt] = await Promise.all([RC("BR"), RC("US"), RC("PT")]);
  let geo = { br: geoOf(rcBr), us: geoOf(rcUs), pt: geoOf(rcPt) };
  if (!geo.br && !geo.us && !geo.pt) {
    const all = await cachedExternal(sb, "mledoze", "mledoze:countries-all",
      "https://cdn.jsdelivr.net/gh/mledoze/countries@master/countries.json", 2_592_000,
      (p) => Array.isArray(p) && (p as unknown[]).length > 100);
    const find = (cc: string) => {
      const e = (all as Array<Record<string, any>> | null)?.find((c) => c.cca2 === cc) ?? null;
      return e ? { nome: e.name?.common ?? null, capital: e.capital?.[0] ?? null,
        moedas: Object.keys(e.currencies ?? {}), idiomas: Object.values(e.languages ?? {}) } : null;
    };
    geo = { br: find("BR"), us: find("US"), pt: find("PT") };
  }
  if (geo.br || geo.us || geo.pt) ctx.geopolitica = geo;
  else ctx.geopolitica_indisponivel = "restcountries/mledoze indisponíveis neste run (fail-closed)";

  // wikipedia → resumos pt-BR p/ SEO de cauda longa sem queimar billing
  const wikiOf = (w: Record<string, unknown> | null) => w ? {
    titulo: w.title ?? null,
    resumo: String(w.extract ?? "").slice(0, 400) || null,
    url: (w.content_urls as Record<string, any> | undefined)?.desktop?.page ?? null,
  } : null;
  const wiki = { festa_do_peao_barretos: wikiOf(wikiPeao), barretos: wikiOf(wikiBarretos), uberlandia: wikiOf(wikiUber) };
  if (wiki.festa_do_peao_barretos || wiki.barretos || wiki.uberlandia) ctx.wikipedia_resumos = wiki;
  else ctx.wikipedia_indisponivel = "wikipedia indisponível neste run (fail-closed)";

  // higiene do reservatório (best-effort)
  try { await sb.rpc("nexus_cache_prune", { p_keep: 60 }); } catch { /* segue */ }
  return ctx;
}

// ── provedores de IA (dual-key; nenhum segredo sai daqui) ──────────────────
type Provider = { name: string; call(sys: string, user: string): Promise<string> };

function resolveProviders(): Provider[] {
  const maxTokens = Number(env("MATRIX_MAX_TOKENS") ?? "800");
  const openaiKey = env("OPENAI_API_KEY");
  const claudeKey = env("CLAUDE_API_KEY") ?? env("ANTHROPIC_API_KEY");
  const preferred = env("MATRIX_MODEL") ?? "";       // define o LÍDER da cadeia
  const claudeModel = env("MATRIX_MODEL_CLAUDE") ?? (preferred.startsWith("claude") ? preferred : "claude-haiku-4-5-20251001");
  const openaiModel = preferred.startsWith("gpt") ? preferred : "gpt-4o-mini";

  const openai: Provider | null = openaiKey ? {
    name: `openai:${openaiModel}`,
    async call(sys, user) {
      const model = this.name.split(":")[1];
      const r = await fetchT("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: { authorization: `Bearer ${openaiKey}`, "content-type": "application/json" },
        body: JSON.stringify({
          model, max_tokens: maxTokens, temperature: 0.2,
          messages: [{ role: "system", content: sys }, { role: "user", content: user }],
        }),
      }, 60_000);
      if (!r.ok) throw new Error(`openai http ${r.status}: ${(await r.text()).slice(0, 180)}`);
      return (await r.json())?.choices?.[0]?.message?.content ?? "";
    },
  } : null;

  const claude: Provider | null = claudeKey ? {
    name: `claude:${claudeModel}`,
    async call(sys, user) {
      const model = this.name.split(":")[1];
      const r = await fetchT("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "x-api-key": claudeKey, "anthropic-version": "2023-06-01", "content-type": "application/json" },
        body: JSON.stringify({
          model, max_tokens: maxTokens, system: sys,
          messages: [{ role: "user", content: user }],
        }),
      }, 60_000);
      if (!r.ok) throw new Error(`claude http ${r.status}: ${(await r.text()).slice(0, 180)}`);
      return ((await r.json())?.content ?? []).map((b: { text?: string }) => b.text ?? "").join("\n").trim();
    },
  } : null;

  // Prioridade da cadeia: MATRIX_MODEL define o líder ("claude-*" → Claude
  // primeiro). Default: OpenAI líder, Claude contingência de produção.
  if (preferred.startsWith("claude")) return [claude, openai].filter(Boolean) as Provider[];
  return [openai, claude].filter(Boolean) as Provider[];
}

// ── classes de erro que ativam a CONTINGÊNCIA (dual-key fallback) ──────────
// Spec: 429 (rate limit), 402 (sem saldo), falha de conexão. Incluímos também
// 401 (auth), 5xx (indisponibilidade do provedor) e billing explícito.
function isFallbackWorthy(msg: string): boolean {
  return /http (401|402|429|5\d\d)|credit balance|no credits|billing|network|timeout|timed out|abort|fetch failed|dns|econnrefused|connection/i.test(msg);
}

// ── despacho com fallback aninhado (try/catch em cadeia) ───────────────────
// Tenta o líder; capturada uma exceção de contingência, registra o aviso na
// telemetria, degrada o provedor para o restante do run e processa a MESMA
// tarefa com o provedor seguinte — sem interrupção do lote.
async function dispatchWithFallback(
  chain: Provider[],
  sys: string,
  user: string,
  onDegraded: (p: Provider, err: unknown) => Promise<void>,
): Promise<{ answer: string; servedBy: string }> {
  const attempt = async (i: number): Promise<{ answer: string; servedBy: string }> => {
    const p = chain[i];
    if (!p) throw new Error("cadeia de provedores esgotada neste run");
    try {
      return { answer: await p.call(sys, user), servedBy: p.name };
    } catch (err) {
      const msg = String(err instanceof Error ? err.message : err);
      if (!isFallbackWorthy(msg)) throw err; // erro de lógica → backoff normal
      await onDegraded(p, err); // aviso na telemetria + degradação do run
      if (i + 1 >= chain.length) throw err; // sem contingência → falha isolada
      return attempt(i + 1); // IMEDIATAMENTE o provedor de contingência
    }
  };
  return attempt(0);
}

// ── pool de concorrência limitada (lote assíncrono, mas com freio) ─────────
async function runPool<T, R>(items: T[], size: number, fn: (x: T) => Promise<R>): Promise<void> {
  let cursor = 0;
  const workers = Array.from({ length: Math.min(Math.max(size, 1), items.length) }, async () => {
    while (cursor < items.length) await fn(items[cursor++]);
  });
  await Promise.all(workers);
}

// ── handler principal ──────────────────────────────────────────────────────
Deno.serve(async (req: Request) => {
  // 1) AUTH FAIL-CLOSED
  const secret = env("NEXUS_MATRIX_SECRET");
  if (!secret) return json(503, { ok: false, error: "vault sem NEXUS_MATRIX_SECRET — configure antes de ativar o cluster" });
  const presented = req.headers.get("x-matrix-secret") ?? "";
  if (!presented || !safeEqual(presented, secret)) return json(401, { ok: false, error: "não autorizado" });

  const url = new URL(req.url);
  const batch = Math.min(Math.max(Number(url.searchParams.get("batch") ?? "8"), 1), 24);

  const sb = createClient(env("SUPABASE_URL")!, env("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { persistSession: false },
  });
  const telemetry = makeTelemetry(sb);

  // 2) CADEIA DUAL-KEY — vazia → lote inteiro 'skipped' (fail-closed, sem crash)
  const providers = resolveProviders();
  if (providers.length === 0) {
    const { count: stale } = await sb
      .from("nexus_agent_tasks_queue")
      .select("id", { count: "exact", head: true })
      .eq("status", "pending");
    await telemetry.log({
      status: "fail_closed",
      items_total: stale ?? 0,
      message: "sem OPENAI_API_KEY/CLAUDE_API_KEY no vault — lote não despachado",
    });
    return json(200, {
      ok: true, provider: null, claimed: 0, succeeded: 0, failed: 0,
      skipped: stale ?? 0, note: "vault sem chave IA — fail-closed (telemetria registrada)",
      duration_ms: Date.now() - t0,
    });
  }
  const deadProviders = new Set<string>(); // degradados neste run

  // 3) CLAIM ATÔMICO DO LOTE
  const { data: tasks, error: claimErr } = await sb.rpc("nexus_matrix_claim_tasks", {
    p_limit: batch,
    p_stale_seconds: 1800,
  });
  if (claimErr) {
    await telemetry.log({ status: "claim_error", message: String(claimErr).slice(0, 200) });
    return json(502, { ok: false, error: "claim falhou", detail: String(claimErr).slice(0, 200) });
  }
  const claimed = (tasks ?? []) as Array<{ id: number; agent_slug: string; payload: Record<string, unknown>; attempts: number }>;
  if (claimed.length === 0) {
    return json(200, {
      ok: true, provider: providers.map((p) => p.name).join("+"),
      claimed: 0, succeeded: 0, failed: 0, skipped: 0, degraded: [], duration_ms: Date.now() - t0,
    });
  }

  // 4) CONTEXTO COMPARTILHADO DO LOTE (1 carga por run — read-only)
  const ctx = await loadContext(sb);

  // 5) DESPACHO EM LOTE, ASSÍNCRONO, ISOLADO POR TAREFA (dual-key fallback)
  let succeeded = 0, failed = 0;
  const perTask: Array<Record<string, unknown>> = [];

  await runPool(claimed, Number(env("MATRIX_CONCURRENCY") ?? "4"), async (task) => {
    if (RUN_BUDGET_MS - (Date.now() - t0) <= 5_000) {
      await sb.rpc("nexus_matrix_fail_task", { p_id: task.id, p_error: "budget de run exaurido — reentrega" });
      perTask.push({ id: task.id, slug: task.agent_slug, status: "budget_deferred" });
      return;
    }
    try {
      const { data: agent } = await sb
        .from("nexus_agents")
        .select("system_instruction,group_package,active")
        .eq("agent_slug", task.agent_slug)
        .eq("active", true)
        .maybeSingle();
      if (!agent) {
        await sb.rpc("nexus_matrix_fail_task", { p_id: task.id, p_error: "agente inativo ou inexistente" });
        perTask.push({ id: task.id, slug: task.agent_slug, status: "skipped" });
        return;
      }
      const prompt = `CONTEXTO DO ECOSSISTEMA (leituras do run, fail-closed):\n${JSON.stringify(ctx, null, 2)}\n\n` +
        `TAREFA (${task.agent_slug}):\n${JSON.stringify(task.payload ?? {})}`;

      const live = providers.filter((p) => !deadProviders.has(p.name));
      const { answer, servedBy } = await dispatchWithFallback(live, agent.system_instruction as string, prompt,
        async (p, err) => {
          deadProviders.add(p.name); // circuit-breaker do run
          await telemetry.log({ // aviso exigido: contingência registrada
            status: "provider_degraded",
            http_status: Number(String(err instanceof Error ? err.message : err).match(/http (\d{3})/)?.[1] ?? 0) || null,
            message: `${p.name} degradado — acionando contingência: ${String(err instanceof Error ? err.message : err).slice(0, 140)}`,
          });
        });

      const { error: doneErr } = await sb.rpc("nexus_matrix_complete_task", {
        p_id: task.id,
        p_result: { provider: servedBy, output_chars: answer.length, output: answer.slice(0, 12_000) },
      });
      if (doneErr) throw new Error(`complete falhou: ${String(doneErr).slice(0, 120)}`);
      succeeded++;
      perTask.push({ id: task.id, slug: task.agent_slug, status: "done", provider: servedBy, output_chars: answer.length });
    } catch (err) {
      failed++;
      const msg = String(err instanceof Error ? err.message : err).slice(0, 400);
      try { await sb.rpc("nexus_matrix_fail_task", { p_id: task.id, p_error: msg }); } catch { /* segue */ }
      await telemetry.log({
        status: "agent_error",
        message: `${task.agent_slug}: ${msg}`,
        payload: { task_id: task.id, attempts: task.attempts },
      });
      perTask.push({ id: task.id, slug: task.agent_slug, status: "failed", error: msg.slice(0, 160) });
    }
  });

  // 6) TELEMETRIA RESUMO DO RUN (logs exclusivamente em nexus_cron_telemetry)
  await telemetry.log({
    status: failed > 0 ? (succeeded > 0 ? "partial" : "error") : "ok",
    items_total: claimed.length,
    items_sent: succeeded,
    message: `provider=${providers.map((p) => p.name).join("+")} degradados=${[...deadProviders].join(",") || "nenhum"} ok=${succeeded} fail=${failed}`,
    payload: { tasks: perTask },
  });

  return json(200, {
    ok: true, provider: providers.map((p) => p.name).join("+"),
    degraded: [...deadProviders], claimed: claimed.length,
    succeeded, failed, skipped: claimed.length - succeeded - failed,
    tasks: perTask, context: ctx, duration_ms: Date.now() - t0,
  });
});
