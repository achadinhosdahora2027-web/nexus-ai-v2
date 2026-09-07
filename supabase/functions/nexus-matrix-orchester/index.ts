// ============================================================================
// NEXUS MATRIX AGENTS CLUSTER — Orquestrador central (Edge Function)
// supabase/functions/nexus-matrix-orchester/index.ts · Etapa 21 · 2026-09-07
// ----------------------------------------------------------------------------
// Arquitetura de Agentes em Matriz: agentes são LINHAS em public.nexus_agents,
// não processos/containers. Esta função é o ÚNICO ponto de execução:
//   1. auth fail-closed (x-matrix-secret)
//   2. claim atômico de lote na fila (FOR UPDATE SKIP LOCKED via RPC)
//   3. carrega instrução do agente + contexto sitemap/conversões (read-only)
//   4. despacho em lote assíncrono com concorrência limitada
//   5. falha de agente → nexus_cron_telemetry + próxima tarefa (nunca 500)
//
// VAULT SERVER-SIDE (Deno.env — configurar via `supabase functions secrets set`):
//   NEXUS_MATRIX_SECRET   (obrigatório — auth do cron/GHA)
//   OPENAI_API_KEY        (provedor 1 — precedência)
//   CLAUDE_API_KEY        (provedor 2 — fallback)
//   MATRIX_MODEL          (opcional — default por provedor)
//   MATRIX_MAX_TOKENS     (opcional — default 800)
//   MATRIX_CONCURRENCY    (opcional — default 4)
// SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY são injetados pela plataforma.
//
// GARANTIAS ESTRUTURAIS: read-only sobre ads (14.036 anúncios),
// nexus_ecommerce_routes, nexus_social_outbox, ads_seo_submissions.
// Este orquestrador escreve APENAS em nexus_agent_tasks_queue + telemetria.
// Fail-closed: sem segredo → 503; sem chave IA → lote 'skipped' + telemetria;
// sem contexto → executa com declaração de contexto ausente; erro individual
// → fail + backoff + próxima tarefa.
// ============================================================================

import { createClient } from "npm:@supabase/supabase-js@2";

const RUN_JOB = "nexus-matrix-orchester";
const RUN_BUDGET_MS = 150_000; // guarda-fogo p/ wall-clock do run
const t0 = Date.now();

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

// ── util: fetch com timeout (fail-closed, nunca trava o lote) ──────────────
async function fetchT(url: string, init: RequestInit, ms: number): Promise<Response> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  try {
    return await fetch(url, { ...init, signal: ctrl.signal });
  } finally {
    clearTimeout(timer);
  }
}

// ── telemetria: canal fail-closed (nunca quebra o fluxo) ───────────────────
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

// ── contexto de dados (sitemap/conversões) — read-only, cada item fail-closed
type Ctx = Record<string, unknown>;
async function loadContext(sb: ReturnType<typeof createClient>): Promise<Ctx> {
  const ctx: Ctx = { generated_at: new Date().toISOString() };

  // 1) inventário de anúncios (14.036) e rotas ecommerce — contagens PostgREST
  const counts: Array<[string, string]> = [
    ["anuncios_ativos", "ads?select=id&limit=1"],
    ["rotas_ecommerce", "nexus_ecommerce_routes?select=id&limit=1"],
    ["cliques_conversoes", "ads_clicks?select=id&limit=1"],
  ];
  for (const [key, path] of counts) {
    try {
      const r = await fetchT(
        `${Deno.env.get("SUPABASE_URL")}/rest/v1/${path}`,
        {
          headers: {
            apikey: Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
            authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
            prefer: "count=exact",
          },
        },
        8_000,
      );
      const total = r.headers.get("content-range")?.split("/")[1];
      if (total) ctx[key] = Number(total);
    } catch { /* ausência declarada no contexto */ }
  }

  // 2) fila de indexação pendente (proxy de tráfego futuro)
  try {
    const r = await fetchT(
      `${Deno.env.get("SUPABASE_URL")}/rest/v1/ads_seo_submissions?select=id&limit=1&status=eq.pending`,
      {
        headers: {
          apikey: Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
          authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
          prefer: "count=exact",
        },
      },
      8_000,
    );
    const total = r.headers.get("content-range")?.split("/")[1];
    if (total) ctx.fila_indexacao_pendente = Number(total);
  } catch { /* coluna/filtro pode divergir — fail-closed */ }

  // 3) sitemaps vivos (contagem de <loc>)
  const sitemaps: Array<[string, string]> = [
    ["sitemap_aquitemachadinhos_urls", "https://www.aquitemachadinhos.com.br/sitemap.xml"],
    ["sitemap_solvegrid_urls", "https://solvegrid.com.br/sitemap.xml"],
  ];
  for (const [key, url] of sitemaps) {
    try {
      const r = await fetchT(url, { method: "GET" }, 8_000);
      if (r.ok) {
        const xml = await r.text();
        ctx[key] = (xml.match(/<loc>/g) ?? []).length;
      }
    } catch { /* host fora — contexto declara ausência */ }
  }

  return ctx;
}

// ── provedores de IA (vault server-side; nenhum segredo sai daqui) ─────────
// Cadeia com fallback: OpenAI primeiro; 401/402/429 (auth/billing) degrada o
// provedor para o restante do run e a tarefa sobe para o próximo da fila.
type Provider = { name: string; call(sys: string, user: string): Promise<string> };

function resolveProviders(): Provider[] {
  const maxTokens = Number(Deno.env.get("MATRIX_MAX_TOKENS") ?? "800");
  const list: Provider[] = [];

  const openai = Deno.env.get("OPENAI_API_KEY");
  if (openai) {
    const model = Deno.env.get("MATRIX_MODEL") ?? "gpt-4o-mini";
    list.push({
      name: `openai:${model}`,
      async call(sys, user) {
        const r = await fetchT("https://api.openai.com/v1/chat/completions", {
          method: "POST",
          headers: { authorization: `Bearer ${openai}`, "content-type": "application/json" },
          body: JSON.stringify({
            model, max_tokens: maxTokens, temperature: 0.2,
            messages: [{ role: "system", content: sys }, { role: "user", content: user }],
          }),
        }, 60_000);
        if (!r.ok) throw new Error(`openai http ${r.status}: ${(await r.text()).slice(0, 180)}`);
        const data = await r.json();
        return data?.choices?.[0]?.message?.content ?? "";
      },
    });
  }

  const claude = Deno.env.get("CLAUDE_API_KEY") ?? Deno.env.get("ANTHROPIC_API_KEY");
  if (claude) {
    const model = Deno.env.get("MATRIX_MODEL_CLAUDE") ?? "claude-haiku-4-5-20251001";
    list.push({
      name: `claude:${model}`,
      async call(sys, user) {
        const r = await fetchT("https://api.anthropic.com/v1/messages", {
          method: "POST",
          headers: { "x-api-key": claude, "anthropic-version": "2023-06-01", "content-type": "application/json" },
          body: JSON.stringify({
            model, max_tokens: maxTokens, system: sys,
            messages: [{ role: "user", content: user }],
          }),
        }, 60_000);
        if (!r.ok) throw new Error(`claude http ${r.status}: ${(await r.text()).slice(0, 180)}`);
        const data = await r.json();
        return (data?.content ?? []).map((b: { text?: string }) => b.text ?? "").join("\n").trim();
      },
    });
  }
  return list;
}

// ── pool de concorrência limitada (lote assíncrono, mas com freio) ─────────
async function runPool<T, R>(items: T[], size: number, fn: (x: T) => Promise<R>): Promise<PromiseSettledResult<R>[]> {
  const results: PromiseSettledResult<R>[] = new Array(items.length);
  let cursor = 0;
  const workers = Array.from({ length: Math.min(Math.max(size, 1), items.length) }, async () => {
    while (cursor < items.length) {
      const i = cursor++;
      results[i] = await fn(items[i]).then(
        (v) => ({ status: "fulfilled", value: v }) as PromiseSettledResult<R>,
        (e) => ({ status: "rejected", reason: e }) as PromiseSettledResult<R>,
      );
    }
  });
  await Promise.all(workers);
  return results;
}

// ── handler principal ──────────────────────────────────────────────────────
Deno.serve(async (req: Request) => {
  // 1) AUTH FAIL-CLOSED
  const secret = Deno.env.get("NEXUS_MATRIX_SECRET");
  if (!secret) return json(503, { ok: false, error: "vault sem NEXUS_MATRIX_SECRET — configure antes de ativar o cluster" });
  const presented = req.headers.get("x-matrix-secret") ?? "";
  if (!presented || !safeEqual(presented, secret)) return json(401, { ok: false, error: "não autorizado" });

  const url = new URL(req.url);
  const batch = Math.min(Math.max(Number(url.searchParams.get("batch") ?? "8"), 1), 24);

  const sb = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );
  const telemetry = makeTelemetry(sb);

  // 2) PROVEDORES DE IA — nenhum → lote inteiro 'skipped' (fail-closed, sem crash)
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
  const deadProviders = new Set<string>(); // degradados neste run (401/402/429)

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
    return json(200, { ok: true, provider: providers.map((p) => p.name).join("+"), claimed: 0, succeeded: 0, failed: 0, skipped: 0, duration_ms: Date.now() - t0 });
  }

  // 4) CONTEXTO COMPARTILHADO DO LOTE (1 carga por run — economia de quota)
  const ctx = await loadContext(sb);

  // 5) DESPACHO EM LOTE, ASSÍNCRONO, ISOLADO POR TAREFA
  let succeeded = 0, failed = 0;
  const perTask: Array<Record<string, unknown>> = [];

  await runPool(claimed, Number(Deno.env.get("MATRIX_CONCURRENCY") ?? "4"), async (task) => {
    const budgetLeft = RUN_BUDGET_MS - (Date.now() - t0);
    if (budgetLeft <= 5_000) {
      // orçamento esgotado: devolve sem consumir tentativa fatal
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
      // cadeia de provedores com fallback: 401/402/429 degrada e tenta o próximo
      const prompt = `CONTEXTO DO ECOSSISTEMA (leituras do run, fail-closed):\n${JSON.stringify(ctx, null, 2)}\n\n` +
        `TAREFA (${task.agent_slug}):\n${JSON.stringify(task.payload ?? {})}`;
      let answer = "", servedBy = "";
      let lastErr: unknown = null;
      for (const p of providers) {
        if (deadProviders.has(p.name)) continue;
        try {
          answer = await p.call(agent.system_instruction as string, prompt);
          servedBy = p.name;
          break;
        } catch (err) {
          lastErr = err;
          const msg = String(err instanceof Error ? err.message : err);
          // auth/billing/sem-créditos: degrada o provedor p/ o restante do run
          if (/http (401|402|429)|credit balance|no credits|billing/i.test(msg)) {
            deadProviders.add(p.name);
            await telemetry.log({
              status: "provider_degraded",
              message: `${p.name}: ${msg.slice(0, 160)}`,
            });
            continue; // tenta próximo provedor nesta mesma tarefa
          }
          // erro transiente: este provedor segue vivo p/ as demais tarefas,
          // mas ESTA tarefa cai para o próximo da cadeia
          if (providers.some((q) => !deadProviders.has(q.name) && q.name !== p.name)) continue;
          throw err;
        }
      }
      if (!servedBy) {
        throw new Error(lastErr ? `provedores esgotados: ${String(lastErr instanceof Error ? lastErr.message : lastErr).slice(0, 160)}` : "nenhum provedor disponível");
      }
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

  // 6) TELEMETRIA RESUMO DO RUN
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
