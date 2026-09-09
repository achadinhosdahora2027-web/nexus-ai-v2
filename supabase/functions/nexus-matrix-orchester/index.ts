// ============================================================================
// NEXUS MATRIX AGENTS CLUSTER — Orquestrador central (Edge Function) · v5.8
// supabase/functions/nexus-matrix-orchester/index.ts · Etapa 21.32 · 2026-09-08
// v5.8 (21.38, TRIPLO FUNIL TELEGRAM — C1 privado/C2 ofertas/C3 oráculo):
//     · runTelegramOrculoBroadcaster() — pílula diária de utilidade pública
//       (cotação er-api + clima Open-Meteo + Wikipedia do cache local) com
//       mídia HD (Pollinations/LoremFlickr), disparada via ?oraculo=1
//       (cron GHA diário 08:20 UTC = 05:20 Brasília); SIDs telegram_oraculo_c3_*.
//     · motor de replies RECRUTA não-seguidores para o Canal 2
//       (@ofertasbrasilz): trigger DDL 21.38 marca recruit_c2 e o elo
//       gratuito (Mistral/Groq) injeta o convite no texto da resposta.
// v5.7 (21.32, CLAREZA FORENSE DO PAINEL TELEGRAM):
//   • ctx.cotacao — USD→BRL renovado a cada ciclo via er-api (no-auth,
//     cache 12h na nexus_external_data_cache): o trigger de VENDA lê este
//     cache para converter a comissão em Reais no push (≈ R$ …);
//   • probe telegram_board ganha cotacao_usd_brl + cliques com rede
//     (fan-out 21.32 enriquece click_streams com sid/advertiser/network).
// v5.6 (21.31, MALHA ANALÍTICA DO PAINEL DE BORDO TELEGRAM):
//   • probe telegram_board no early-return — cliques humanos 24h (tabela
//     nexus_click_streams, pushes com janela anti-dilúvio 10 min), vendas do
//     Radar (affiliate_conversions) e pushes do dia (nexus_telegram_push_log,
//     request_id pg_net verificável). Alertas nativos: triggers de banco
//     notify_telegram_real_click_event / real_sale_event / price_hunter_alert
//     (pg_net → api.telegram.org, fail-closed absoluto, kill-switch no cofre).
// v5.5 (21.30, GLOBAL INTENT HIJACKING & MASSIVE REPLY FRAMEWORK):
//   • loadSocialListeningContext() — VARREDURA ATIVA por keyword do
//     dicionário nexus_global_target_keywords (EN/PT/ES/FR) nas fontes de
//     busca pública global no-auth: HN Algolia · Lemmy (fediverso) ·
//     StackExchange. Reddit devolve 403/WAF; Buffer/Ayrshare não expõem
//     busca pública global (introspecção ao vivo 21.28) — seguem como fonte
//     de comentários nos NOSSOS posts + publicação. Ingest em massa via RPC
//     nexus_mass_ingest_global_intents (advisory locks transacionais +
//     FOR UPDATE SKIP LOCKED + dedup platform/comment_id).
//   • Motor de engagement: intents globais → resposta NATIVA bilíngue no
//     idioma detectado (≤400 chars, elos gratuitos) + mídia HD keyword do
//     Motor 21.29 (cache-first) → outbox ready_to_post entregue às CONTAS
//     POSTADORAS VIVAS, SID solvegrid_reply_<conta>_<lang>_<ts> no /go.
//   • ISOLAMENTO 24h: 401 (credencial) / 403 (WAF de borda) / 429
//     (rate-limit) → cooldown na tabela unificada nexus_social_profile_
//     cooldowns + rate_limited_until nativo da fazenda + REENTREGA
//     imediata da tarefa às contas vivas. Telemetria em
//     nexus_cron_telemetry. Anúncios: read-only estrito (intocados).
// v5.4 (21.29, MÓDULO DE INGESTÃO DE MÍDIAS ILIMITADAS — NO-AUTH IMAGE ENGINE):
//   • resolveTaskMedia() — criativos HD a custo zero para os 223 agentes:
//     cache-first 0ms na tabela privada nexus_matrix_media_assets (índice
//     único por keyword), provedores no-auth LoremFlickr (geo/turismo, URL
//     final direta 1080×1080) e Pollinations AI (arte: elo gratuito
//     mistral→groq→cohere→hf redige o prompt estético em inglês; URL dinâmica
//     estável image.pollinations.ai/prompt/<enc>?width=1080&height=1080&nologo=true).
//   • Mídia VERIFICADA (>320px, HEAD-check-friendly) injetada no prompt do
//     agente, no p_result (mediaUrls p/ Ayrshare + anexo Buffer) e na idea
//     estruturada (mata na raiz as image_url alucinadas/unsplash-404);
//     fallback determinístico de capa de marca; tracking profile_name no SID
//     do /go intacto. Falha de foto/timeout NUNCA derruba o run (fail-closed).
// v5.3 (21.28, HUB REGIONAL SUL + CAIXA POSTAL):
//   • ctx.hub_sul — cluster regional sul_br (@ia.ofertassul linkedin+facebook
//     +instagram · @ai.ofertassul instagram · verificados ao vivo no Buffer)
//     + cidades-gatilho da Região Sul; rota specialty sul_geo_geo_free no
//     routeForTask; diretiva de segmentação regional nos prompts (o envio às
//     contas e o SID solvegrid_social_sul_* são feitos pelo dispatcher v5.3).
// v5.3 (21.27, GROWTH ENGINEERING MULTIPLIERS):
//   • ctx.sitemaps_multilingues — metadados i18n server-side em runtime:
//     translations do RestCountries (por/spa) + resumos Wikipedia EN/ES
//     (cache 7d) → hreflang/alternates para SEO por idiomas geográficos.
//   • PRICE ERROR HUNTER — claim v3 aceita 'priority_bug_alert' (precedência
//     absoluta no lote); safety-net por run re-enfileira anomalias presas;
//     a fila social é furada pelo trigger com prioridade 9999 (21.27 §3).
//   • ctx.price_hunter — painel da caça injetado nos 223 agentes + diretiva
//     de urgência máxima nas tarefas priority_bug_alert.
// v5.2 (21.26, MALHA DE ESCUTA ATIVA & AESTHETICS FRAMEWORK):
//   • loadSocialListeningContext() — fetch server-side das interações
//     pendentes (Ayrshare /api/comments oficial + probe Buffer GraphQL com as
//     permissões engagements:read/write · insights:read · ideas:write),
//     ingest deduplicado na fila privada nexus_social_engagement_tasks e
//     insights de mídia (saves/shares/impressões) via RPC atômico local —
//     contexto injetado em TODOS os 223 agentes.
//   • runEngagementReplies() — respostas bilíngues ultrarrápidas em cauda
//     longa (≤400 chars) forçadas nos elos GRATUITOS (mistral→cohere→hf),
//     com CTA /go?oferta=…&sid=solvegrid_reply_<profile_name>_<ts>.
//   • Fluxo estético: agentes de criação (content-creation e assinaturas
//     afins) estruturam payloads {title, hook, visual_direction, image_url}
//     a partir do cache de utilidade pública (NASA APOD, Wikipedia, Clima)
//     → nexus_social_ideas + ideas:write no Buffer (best-effort isolado).
//   • FAIL-CLOSED por bloco: 401 (token expirado) / 429 (rate-limit de
//     interação) / 403 (WAF de borda) → captura + telemetria em
//     nexus_cron_telemetry + PULA o bloco. Ads (14.299), outbox e rotas
//     SolveGrid permanecem intocados.
// v4 (21.25, saneamento do feed): TRAVA ANTI-DUPLO-POST — o claim do lote
// agora é blindado no banco por pg_try_advisory_xact_lock(task_id) dentro do
// RPC nexus_matrix_claim_tasks v2 (FOR UPDATE SKIP LOCKED + advisory lock por
// tarefa): a transição pending→running acontece no mesmo milissegundo da
// leitura, em modo atômico isolado. Requisições paralelas/cron com latência
// recebem conjunto disjunto ou vazio — nunca a mesma tarefa duas vezes.
// ----------------------------------------------------------------------------
// Arquitetura de Agentes em Matriz: agentes são LINHAS em public.nexus_agents,
// não processos/containers. Esta função é o ÚNICO ponto de execução:
//   1. auth fail-closed (x-matrix-secret)
//   2. claim atômico de lote na fila (FOR UPDATE SKIP LOCKED via RPC +
//      pg_try_advisory_xact_lock por task — v4/21.25)
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
//   GEMINI_API_KEY        (3º elo 21.16 — acionado quando OpenAI/Claude pedem
//                          billing; default gemini-3.5-flash, AI Studio)
//   GROQ_API_KEY / MISTRAL_API_KEY / DEEPSEEK_API_KEY / OPENROUTER_API_KEY /
//   COHERE_API_KEY        (elos 4-8 21.16 — malha redundante; OpenRouter
//                          gateway multi-model; defaults rápidos validados)
//   HF_API_KEY            (9º elo 21.16 — Hugging Face Inference Router,
//                          OpenAI-compatible; aceita HUGGINGFACE_API_KEY)
//   NOVITA_API_KEY        (10º elo 21.16 — Novita AI, OpenAI-compatible;
//                          auth ok + 156 modelos validados, aguardando crédito)
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
  transform?: (p: Record<string, unknown>) => Record<string, unknown>,
  timeoutMs = 8_000,
  raw = false,
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
    const r = await fetchT(url, { headers: { "User-Agent": NEXUS_BOT_UA, accept: "application/json" } }, timeoutMs);
    if (!r.ok) throw new Error(`http ${r.status}`);
    const payload = raw ? ({ rawText: await r.text() } as Record<string, unknown>)
                        : (await r.json()) as Record<string, unknown>;
    if (validate && !validate(payload)) throw new Error("payload recusado pela validação (shape inesperado)");
    const digest = transform ? transform(payload) : payload;
    const { error: upErr } = await sb.from("nexus_external_data_cache").upsert({
      provider_slug: provider, query_key: key, payload_response: digest,
      fetched_at: new Date().toISOString(),
      expires_at: new Date(Date.now() + ttlSeconds * 1000).toISOString(),
    }, { onConflict: "query_key" });
    if (upErr) throw new Error(`upsert: ${String(upErr).slice(0, 100)}`);
    return digest;
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

  // v5.3 (21.27): METADADOS DE SITEMAPS MULTILÍNGUES — RestCountries
  // translations (por/spa) + Wikipedia EN/ES, server-side em runtime. Cada
  // chamada ISOLADA (timeout/429/DNS → ausência declarada — fail-closed):
  // falha de tradução NUNCA derruba o contexto nem a renderização pública.
  try {
    const RCi18n = (cc: string) => cachedExternal(sb, "restcountries", `restcountries:${cc.toLowerCase()}:i18n`,
      `https://restcountries.com/v3.2/alpha/${cc}?fields=name,translations,cca2`, 2_592_000,
      (p) => Array.isArray(p));
    const WikiI18n = (lang: string, title: string) => cachedExternal(sb, "wikipedia",
      `wikipedia:${lang}:${title.toLowerCase().replace(/\s+/g, "-")}`,
      `https://${lang}.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title)}`, 604_800);
    const [tBr, tUs, tPt, wEnBr, wEnUb, wEsBr, wEsUb] = await Promise.all([
      RCi18n("BR"), RCi18n("US"), RCi18n("PT"),
      WikiI18n("en", "Barretos"), WikiI18n("en", "Uberlândia"),
      WikiI18n("es", "Barretos"), WikiI18n("es", "Uberlândia"),
    ]);
    const trOf = (c: Record<string, unknown> | null) => {
      const e = Array.isArray(c) ? (c[0] as Record<string, any>) : null;
      if (!e) return null;
      return { pais_en: e.name?.common ?? null, pais_pt: e.translations?.por?.common ?? null,
               pais_es: e.translations?.spa?.common ?? null,
               idiomas: Object.values(e.languages ?? {}) };
    };
    const locales = [
      { locale: "pt-BR", wiki: { barretos: wikiOf(wikiBarretos), uberlandia: wikiOf(wikiUber) } },
      { locale: "en", wiki: { barretos: wikiOf(wEnBr), uberlandia: wikiOf(wEnUb) } },
      { locale: "es", wiki: { barretos: wikiOf(wEsBr), uberlandia: wikiOf(wEsUb) } },
    ].filter((l) => Object.values(l.wiki).some(Boolean));
    ctx.sitemaps_multilingues = {
      nota: "agentes SEO: gerar metadados hreflang/alternates por idioma geográfico com estas fontes",
      paises: { br: trOf(tBr), us: trOf(tUs), pt: trOf(tPt) },
      locales: locales.length ? locales : "wikipedia i18n indisponível neste run (fail-closed)",
      hreflang_template: "https://www.solvegrid.com.br{path}?lang={locale}",
    };
  } catch (e) {
    ctx.sitemaps_multilingues_indisponivel =
      `traduções indisponíveis neste run (fail-closed): ${String(e instanceof Error ? e.message : e).slice(0, 120)}`;
  }

  // v5.3 (21.27): painel do PRICE ERROR HUNTER (read-only) para os agentes
  try {
    const { data: hunt } = await sb.from("nexus_price_anomalies_hunter")
      .select("titulo,preco_atual,preco_de,desconto_pct,loja,status,detected_at")
      .in("status", ["armed", "blasted"])
      .order("detected_at", { ascending: false }).limit(5);
    const { count: armedHoje } = await sb.from("nexus_price_anomalies_hunter")
      .select("id", { count: "exact", head: true }).eq("status", "armed");
    ctx.price_hunter = {
      anomalias_recentes: hunt ?? [],
      armed_pendentes: armedHoje ?? 0,
      nota: "erros de preço detectados no feed — ofertas de urgência máxima para copy viral",
    };
  } catch { /* painel declarado ausente (fail-closed) */ }

  // v5.3 (21.28): HUB REGIONAL SUL — contas do cluster + cidades-gatilho
  // (read-only; o direcionamento de mídia/SID acontece no dispatcher v5.3)
  try {
    const { data: sulFarms } = await sb.from("nexus_buffer_farms")
      .select("profile_name,daily_cap,target_niche,notes")
      .eq("status", "active").eq("target_niche", "sul_br");
    ctx.hub_sul = {
      contas: (sulFarms ?? []).map((f: any) => ({
        conta: f.profile_name, cap_diario: f.daily_cap, nota: f.notes,
      })),
      cidades_gatilho: ["Gramado", "Curitiba", "Balneário Camboriú", "Porto Alegre",
        "Florianópolis", "Caxias do Sul", "Blumenau", "Joinville", "Londrina",
        "Maringá", "Foz do Iguaçu", "Pelotas", "Santa Maria", "Novo Hamburgo",
        "Cascavel", "Bento Gonçalves", "Gravataí", "Canoas"],
      sid_marker: "solvegrid_social_sul_",
      nota: "ofertas geo-localizadas Sul vão PRIORITARIAMENTE ao cluster sul_br (1 post/conta/run, 3/dia)",
    };
  } catch { /* hub declarado ausente (fail-closed) */ }

  // 5) MEGA CLUSTER — 16 novos adaptadores no-auth (some-se aos 5 já ativos:
  //    awesomeapi, frankfurter, restcountries/mledoze, wikipedia, open-meteo
  //    = 21 APIs na malha). Cada chamada ISOLADA: 429/timeout/DNS/shape →
  //    telemetria external_api_error + null no contexto (fail-closed).
  const [nominatim, geonames, overpass, ipapi, mlibre, wikidataSparql, openlib, wikivoyage, sun, openaq, openuv, worldbank, hipolabs, census, ibge] = await Promise.all([
    cachedExternal(sb, "nominatim", "nominatim:barretos",
      "https://nominatim.openstreetmap.org/search?q=Barretos,SP,Brazil&format=json&limit=1", 86_400,
      (p) => Array.isArray(p), (p) => { const e = (p as any[])[0] ?? {}; return { lat: e.lat ?? null, lon: e.lon ?? null, display: String(e.display_name ?? "").slice(0, 120) }; }),
    cachedExternal(sb, "geonames", "geonames:br",
      "https://api.geonames.org/countryInfoJSON?username=demo&country=BR", 2_592_000,
      (p) => Array.isArray((p as any).geonames), (p) => { const e = (p as any).geonames?.[0] ?? {}; return { pais: e.countryName ?? null, capital: e.capital ?? null, populacao: e.population ?? null }; }),
    cachedExternal(sb, "overpass", "overpass:hospitais-barretos",
      "https://overpass-api.de/api/interpreter?data=" + encodeURIComponent('[out:json][timeout:8];node["amenity"="hospital"](around:8000,-20.5578,-48.5626);out count;'), 86_400,
      (p) => Array.isArray((p as any).elements), (p) => ({ hospitais_raio_8km: (p as any).elements?.[0]?.tags?.total ?? null })),
    cachedExternal(sb, "ipapi", "ipapi:egress",
      "http://ip-api.com/json/?fields=status,country,city,query", 3_600,
      (p) => (p as any).status === "success", (p) => ({ cidade_egress: (p as any).city ?? null, pais_egress: (p as any).country ?? null })),
    cachedExternal(sb, "mercadolivre", "mercadolivre:mlb-categorias",
      "https://api.mercadolibre.com/sites/MLB/categories", 21_600,
      (p) => Array.isArray(p), (p) => ({ total: (p as any[]).length, amostra: (p as any[]).slice(0, 5).map((c) => c.name) })),
    cachedExternal(sb, "wikidata", "wikidata:sparql:barretos-pt",
      "https://query.wikidata.org/sparql?format=json&query=" + encodeURIComponent('SELECT ?item ?itemLabel WHERE { ?item rdfs:label "Barretos"@pt . SERVICE wikibase:label { bd:serviceParam wikibase:language "pt". } } LIMIT 3'), 2_592_000,
      (p) => !!(p as any).results, (p) => ({ qids: ((p as any).results?.bindings ?? []).map((b: any) => String(b.item?.value ?? "").split("/").pop()).slice(0, 3) })),
    cachedExternal(sb, "openlibrary", "openlibrary:barretos",
      "https://openlibrary.org/search.json?q=barretos&limit=3&fields=title,author_name,first_publish_year", 2_592_000,
      (p) => typeof (p as any).numFound === "number", (p) => ({ obras: (p as any).numFound ?? 0, titulos: ((p as any).docs ?? []).slice(0, 3).map((d: any) => d.title) })),
    cachedExternal(sb, "wikivoyage", "wikivoyage:pt:barretos",
      "https://pt.wikivoyage.org/api/rest_v1/page/summary/Barretos", 604_800,
      (p) => !!(p as any).extract, (p) => ({ resumo_turistico: String((p as any).extract ?? "").slice(0, 300) })),
    cachedExternal(sb, "sunrise_sunset", "sunrise-sunset:barretos",
      "https://api.sunrise-sunset.org/json?lat=-20.5578&lng=-48.5626&tzid=America/Sao_Paulo", 86_400,
      (p) => (p as any).status === "OK", (p) => { const r = (p as any).results ?? {}; return { nascer_do_sol: r.sunrise ?? null, por_do_sol: r.sunset ?? null, meio_dia_solar: r.solar_noon ?? null, duracao_dia: r.day_length ?? null }; }),
    cachedExternal(sb, "openaq", "openaq:barretos",
      "https://api.openaq.org/v2/nearest?coordinates=-20.5578,-48.5626", 86_400,
      (p) => !!(p as any).results, undefined), // v1/v2 aposentadas; v3 exige chave → fail-closed declarado
    cachedExternal(sb, "openuv", "openuv:barretos",
      "https://api.openuv.io/api/v1/uv?lat=-20.5578&lng=-48.5626", 86_400,
      (p) => !!(p as any).uv, undefined), // exige token → fail-closed; UV real vive em clima (Open-Meteo)
    cachedExternal(sb, "worldbank", "worldbank:pib-bra",
      "https://api.worldbank.org/v2/country/BRA/indicator/NY.GDP.MKTP.CD?format=json&per_page=3", 2_592_000,
      (p) => Array.isArray(p), (p) => { const e = (p as any[])[1]?.[0] ?? {}; return { pib_usd: e.value ?? null, ano: e.date ?? null }; }),
    cachedExternal(sb, "hipolabs", "hipolabs:universidades-br",
      "https://universities.hipolabs.com/search?country=Brazil", 2_592_000,
      (p) => Array.isArray(p), (p) => ({ total: (p as any[]).length, amostra: (p as any[]).slice(0, 3).map((u) => u.name) })),
    cachedExternal(sb, "census", "census:catalogo-datasets",
      "https://api.census.gov/data.json", 2_592_000,
      (p) => Array.isArray((p as any).data), (p) => ({ datasets: (p as any).data?.length ?? 0 }), 30_000), // raw 5MB → digest
    cachedExternal(sb, "ibge", "ibge:municipio-3505500",
      "https://servicodados.ibge.gov.br/api/v1/localidades/municipios/3505500", 2_592_000,
      (p) => !!(p as any).nome, (p) => ({ municipio: (p as any).nome ?? null, uf: (p as any).microrregiao?.mesorregiao?.UF?.sigla ?? null, mesorregiao: (p as any).microrregiao?.mesorregiao?.nome ?? null })),
  ]);

  ctx.mapas_geolocalizacao = {
    nominatim_barretos: nominatim, geonames_br: geonames,
    overpass_hospitais_barretos: overpass, ip_api_egress: ipapi,
  };
  ctx.economia_mercadolivre = { mlb_categorias: mlibre ?? null }; // null quando policy-blocked (fail-closed)
  ctx.conteudo_gratuito = {
    wikidata_barretos: wikidataSparql ?? null,
    openlibrary_barretos: openlib ?? null,
    wikivoyage_barretos: wikivoyage ?? null,
  };
  const durHoras = (() => { const m = /(\d+):(\d+):(\d+)/.exec(String((sun as any)?.duracao_dia ?? "")); return m ? +(+m[1] + +m[2] / 60).toFixed(2) : null; })();
  ctx.sol_e_utilidades = {
    sunrise_sunset_barretos: sun ?? null,
    sunrise_sunset_engine: sun ? { duracao_dia_horas: durHoras, fonte_engine: "derivado de api.sunrise-sunset.org" } : null,
    openaq_barretos: openaq ?? null,   // v3 exige chave — null até credencial (isolado)
    openuv_barretos: openuv ?? null,   // idem; UV operacional já vem de clima (Open-Meteo)
  };
  ctx.institucional = {
    worldbank_pib_brasil: worldbank ?? null,
    hipolabs_universidades_br: hipolabs ?? null,
    us_census_datasets: census ?? null,
    ibge_barretos: ibge ?? null,
    restcountries: "ativo — ver ctx.geopolitica",
  };

  // 6) ULTRA GALAXY — 50 novos adaptadores no-auth em 7 blocos lógicos
  //    (soma-se à malha de 21 = 71 APIs). Sentinela = endpoint válido que
  //    hoje exige chave/está geo-bloqueado: retorna null COM telemetria e
  //    auto-sara quando o acesso abrir. Ondas de 12 p/ educação de rede.
  type Ultra = { provider: string; key: string; url: string; ttl: number; block: string;
    validate?: (p: Record<string, unknown>) => boolean;
    transform?: (p: Record<string, unknown>) => Record<string, unknown>;
    timeoutMs?: number; raw?: boolean };
  const U = (block: string, provider: string, key: string, url: string, ttl: number,
    validate?: Ultra["validate"], transform?: Ultra["transform"], timeoutMs?: number, raw?: boolean): Ultra =>
    ({ block, provider, key, url, ttl, validate, transform, timeoutMs, raw });
  const ULTRA: Ultra[] = [
    // ── ISCAS FINANCEIRAS ──
    U("iscas_financeiras","coincap","coincap:top2","https://api.coincap.io/v2/assets?limit=2",1800,
      (p)=>Array.isArray((p as any).data),(p)=>{const a=(p as any).data??[];return {btc_usd:+(a[0]?.priceUsd??0)||null,eth_usd:+(a[1]?.priceUsd??0)||null};}),
    U("iscas_financeiras","exchangerate","exchangerate:usd-latest","https://open.er-api.com/v6/latest/USD",1800,
      (p)=>!!(p as any).rates,(p)=>({usd_brl:(p as any).rates?.BRL??null,usd_eur:(p as any).rates?.EUR??null})),
    U("iscas_financeiras","vatcomply","vatcomply:eur-rates","https://api.vatcomply.com/rates?base=EUR",1800,
      (p)=>!!(p as any).rates,(p)=>({eur_usd:(p as any).rates?.USD??null,eur_brl:(p as any).rates?.BRL??null})),
    U("iscas_financeiras","binance","binance:btcusdt","https://api.binance.com/api/v3/ticker/price?symbol=BTCUSDT",1800,
      (p)=>!!(p as any).price,(p)=>({btc_usdt:+(p as any).price}),6_000),
    U("iscas_financeiras","bitfinex","bitfinex:btcusd","https://api-pub.bitfinex.com/v2/ticker/tBTCUSD",1800,
      (p)=>Array.isArray(p),(p)=>({btc_usd:(p as any[])[6]??null})),
    U("iscas_financeiras","cryptocompare","cryptocompare:btc","https://min-api.cryptocompare.com/data/price?fsym=BTC&tsyms=USD",1800,
      (p)=>(p as any).USD!=null,(p)=>({btc_usd:(p as any).USD})),
    U("iscas_financeiras","ukholidays","ukholidays:england-wales","https://www.gov.uk/bank-holidays.json",2_592_000,
      (p)=>!!(p as any)["england-and-wales"],(p)=>{const e=(p as any)["england-and-wales"]?.events??[];return {proximo_feriado:e[0]?.title??null,data:e[0]?.date??null,total_ano:e.length};}),
    // ── TURISMO & MOBILIDADE ──
    U("turismo_mobilidade","aviationedge","aviationedge:flights","https://aviation-edge.com/api/public/flights?key=DEMO",86_400,undefined,undefined,6_000),
    U("turismo_mobilidade","opensky","opensky:barretos-bbox","https://opensky-network.org/api/states/all?lamin=-20.7&lomin=-48.7&lamax=-20.4&lomax=-48.4",900,
      (p)=>typeof (p as any).time==="number",(p)=>({aeronaves_na_area:((p as any).states??[]).length})),
    U("turismo_mobilidade","airlabs","airlabs:ping","https://airlabs.co/api/v9/ping?api_key=DEMO",86_400,undefined,undefined,6_000),
    U("turismo_mobilidade","airportdata","airportdata:kjfk","https://airport-data.com/api/ap_info.json?icao=KJFK",2_592_000,
      (p)=>!!(p as any).icao,(p)=>({aeroporto:(p as any).name,icao:(p as any).icao,iata:(p as any).iata})),
    U("turismo_mobilidade","citybikes","citybikes:redes","https://api.citybik.es/v2/networks?fields=id,name",86_400,
      (p)=>Array.isArray((p as any).networks),(p)=>({redes_globais:(p as any).networks?.length??null})),
    U("turismo_mobilidade","tfl","tfl:tube-status","https://api.tfl.gov.uk/Line/Mode/tube/Status",900,
      (p)=>Array.isArray(p),(p)=>({linhas:(p as any[]).length,amostra:(p as any[]).slice(0,3).map((l)=>l.name+":"+(l.lineStatuses?.[0]?.statusSeverityDescription??"?"))})),
    U("turismo_mobilidade","digitransit","digitransit:geocode","https://api.digitransit.fi/geocoding/v1/search?text=Helsinki&size=1",86_400,undefined,undefined,6_000),
    // ── SEO & TEXTOS GRÁTIS ──
    U("seo_textos","wikiquote","wikiquote:pt:festa","https://pt.wikiquote.org/api/rest_v1/page/summary/Festa",604_800,
      (p)=>!!(p as any).extract,(p)=>({citacao_contexto:String((p as any).extract??"").slice(0,300)})),
    U("seo_textos","wiktionary","wiktionary:pt:barretos","https://pt.wiktionary.org/api/rest_v1/page/definition/barretos",604_800,undefined,undefined,6_000),
    U("seo_textos","dbpedia","dbpedia:abstract-barretos","https://dbpedia.org/sparql?format=json&query=SELECT%20%3Fab%20WHERE%20%7B%20%3Chttp%3A%2F%2Fdbpedia.org%2Fresource%2FBarretos%3E%20%3Chttp%3A%2F%2Fdbpedia.org%2Fontology%2Fabstract%3E%20%3Fab%20.%20FILTER%28lang%28%3Fab%29%3D%27pt%27%29%20%7D",2_592_000,undefined,undefined,10_000),
    U("seo_textos","europeana","europeana:search","https://api.europeana.eu/record/v2/search.json?query=barretos&rows=2",86_400,undefined,undefined,6_000),
    U("seo_textos","loc","loc:barretos","https://www.loc.gov/search/?q=barretos&fo=json&c=2&at=results",2_592_000,
      (p)=>Array.isArray((p as any).results),(p)=>({resultados:(p as any).results?.length??0,primeiro_titulo:(p as any).results?.[0]?.title??null})),
    U("seo_textos","gutendex","opentextos:gutendex","https://gutendex.com/books?search=barretos",2_592_000,
      (p)=>typeof (p as any).count==="number",(p)=>({obras:(p as any).count})),
    U("seo_textos","dpla","dpla:items","https://api.dp.la/v2/items?q=barretos",86_400,undefined,undefined,6_000),
    // ── ESTILO DE VIDA & PINTEREST ──
    U("estilo_de_vida","mealdb","mealdb:feijoada","https://www.themealdb.com/api/json/v1/1/search.php?s=feijoada",86_400,
      (p)=>Array.isArray((p as any).meals),(p)=>{const m=(p as any).meals?.[0]??{};return {receita:m.strMeal??null,categoria:m.strCategory??null,video:m.strYoutube??null};}),
    U("estilo_de_vida","cocktaildb","cocktaildb:caipirinha","https://www.thecocktaildb.com/api/json/v1/1/search.php?s=caipirinha",86_400,
      (p)=>Array.isArray((p as any).drinks),(p)=>{const d=(p as any).drinks?.[0]??{};return {drinque:d.strDrink??null,copo:d.strGlass??null};}),
    U("estilo_de_vida","openfoodfacts","openfoodfacts:brigadeiro","https://world.openfoodfacts.org/cgi/search.pl?search_terms=brigadeiro&json=1&page_size=1",86_400,
      (p)=>typeof (p as any).count==="number",(p)=>({produtos_catalogados:(p as any).count})),
    U("estilo_de_vida","fruityvice","fruityvice:banana","https://www.fruityvice.com/api/fruit/banana",2_592_000,
      (p)=>!!(p as any).name,(p)=>({fruta:(p as any).name,calorias_100g:(p as any).nutritions?.calories??null})),
    U("estilo_de_vida","taco","taco:random","https://taco-randomizer.herokuapp.com/random/",86_400,undefined,undefined,6_000),
    U("estilo_de_vida","usda","usda:black-bean","https://api.nal.usda.gov/fdc/v1/foods/search?query=black%20bean&api_key=DEMO_KEY",86_400,
      (p)=>typeof (p as any).totalHits==="number",(p)=>({hits:(p as any).totalHits})),
    U("estilo_de_vida","bored","bored:activity","https://bored-api.vercel.app/api/activity",86_400,undefined,undefined,6_000),
    // ── CULTURA GEEK & ENGRAÇADOS ──
    U("cultura_geek","pokeapi","pokeapi:25","https://pokeapi.co/api/v2/pokemon/25",2_592_000,
      (p)=>!!(p as any).name,(p)=>({pokemon:(p as any).name,exp:(p as any).base_experience,tipos:((p as any).types??[]).map((t)=>t.type?.name)})),
    U("cultura_geek","rickmorty","rickmorty:1","https://rickandmortyapi.com/api/character/1",2_592_000,
      (p)=>!!(p as any).name,(p)=>({personagem:(p as any).name,especie:(p as any).species,status:(p as any).status})),
    U("cultura_geek","swapi","swapi:people-1","https://swapi.dev/api/people/1/",2_592_000,
      (p)=>!!(p as any).name,(p)=>({personagem:(p as any).name,nascimento:(p as any).birth_year})),
    U("cultura_geek","tvmaze","tvmaze:show-1","https://api.tvmaze.com/shows/1",2_592_000,
      (p)=>!!(p as any).name,(p)=>({serie:(p as any).name,nota:(p as any).rating?.average??null,generos:(p as any).genres})),
    U("cultura_geek","ann","ann:title-4658","https://cdn.animenewsnetwork.com/encyclopedia/api.xml?title=4658",2_592_000,undefined,undefined,8_000,true),
    U("cultura_geek","jikan","jikan:anime-1","https://api.jikan.moe/v4/anime/1",2_592_000,
      (p)=>!!(p as any).data,(p)=>({anime:(p as any).data?.title,nota:(p as any).data?.score,episodios:(p as any).data?.episodes})),
    U("cultura_geek","digimon","digimon:agumon","https://digimon-api.vercel.app/api/digimon/name/agumon",2_592_000,
      (p)=>Array.isArray(p),(p)=>({digimon:(p as any[])[0]?.name??null})),
    // ── AUTORIDADE GOVERNAMENTAL (EEAT) ──
    U("autoridade_gov","usgs","usgs:terremotos-br-barretos","https://earthquake.usgs.gov/fdsnws/event/1/query?format=geojson&limit=1&orderby=time&latitude=-20.56&longitude=-48.56&maxradiuskm=500",900,
      (p)=>!!(p as any).metadata,(p)=>({terremotos_500km_7d:(p as any).metadata?.count??null,ultimo_local:(p as any).features?.[0]?.properties?.place??null})),
    U("autoridade_gov","nasa","nasa:apod","https://api.nasa.gov/planetary/apod?api_key=DEMO_KEY",43_200,
      (p)=>!!(p as any).url,(p)=>({titulo:(p as any).title,tipo:(p as any).media_type,url_midia:(p as any).url}),12_000),
    U("autoridade_gov","co2signal","co2signal:br","https://api.co2signal.com/v1/latest?countryCode=BR",86_400,undefined,undefined,6_000),
    U("autoridade_gov","unsdg","undata:sdg-geoareas","https://unstats.un.org/SDGAPI/v1/sdg/GeoAreas",86_400,undefined,undefined,10_000),
    U("autoridade_gov","paris","opendataparis:catalogo","https://opendata.paris.fr/api/v2/catalog/datasets?limit=1",86_400,
      (p)=>typeof (p as any).total_count==="number",(p)=>({datasets_abertos:(p as any).total_count})),
    U("autoridade_gov","datagov","datagov:search","https://catalog.data.gov/api/3/action/package_search?q=barretos&rows=1",86_400,undefined,undefined,8_000),
    U("autoridade_gov","danishbiz","danishbusiness:cvr","https://datacvr.virk.dk/virksomhed/38017514?format=json",86_400,undefined,undefined,6_000),
    // ── UTILIDADES & AD-BLOCK EVADER ──
    U("utilidades","dicebear","dicebear:avatar-nexus","https://api.dicebear.com/9.x/avataaars/svg?seed=nexus",2_592_000,
      (p)=>typeof (p as any).rawText==="string",(p)=>({svg_chars:(p as any).rawText.length,template:"https://api.dicebear.com/9.x/avataaars/svg?seed={slug}"}),12_000,true),
    U("utilidades","robohash","robohash:nexus","https://robohash.org/nexus?set=set1&size=100x100",2_592_000,
      (p)=>typeof (p as any).rawText==="string",(p)=>({png_bytes:(p as any).rawText.length}),12_000,true),
    U("utilidades","jsonplaceholder","jsonplaceholder:post-1","https://jsonplaceholder.typicode.com/posts/1",2_592_000,
      (p)=>!!(p as any).title,(p)=>({post_exemplo:(p as any).title})),
    U("utilidades","isitup","isupme:aq-com-br","https://isitup.org/aquitemachadinhos.com.br.json",1800,undefined,undefined,6_000),
    U("utilidades","httpbin","httpbin:echo","https://httpbin.org/get",21_600,
      (p)=>!!(p as any).headers,(p)=>({ua_confirmado:(p as any).headers?.["User-Agent"]??null,egress:(p as any).origin??null})),
    U("utilidades","ripestat","nationalnetworks:ripe-whois","https://stat.ripe.net/data/whois/data.json?resource=23.20.0.0/8",2_592_000,
      (p)=>!!(p as any).data,(p)=>({recurso:(p as any).data?.resources?.resource??null,primeiro_asn:(p as any).data?.asns?.[0]??null}),20_000),
    U("utilidades","cdnjs","cdnjs:libraries","https://api.cdnjs.com/libraries?limit=2&fields=name,version",86_400,
      (p)=>Array.isArray((p as any).results),(p)=>({bibliotecas_idx:(p as any).results?.map((r)=>r.name)??null})),
    U("utilidades","useragentstring","uas:json","http://useragentstring.com/api/json?UA=NexusGlobalBot/2.0",86_400,undefined,undefined,6_000),
  ];
  const ultraGalaxy: Record<string, Record<string, unknown>> = {};
  for (let i = 0; i < ULTRA.length; i += 12) {
    const wave = ULTRA.slice(i, i + 12);
    const res = await Promise.all(wave.map((a) =>
      cachedExternal(sb, a.provider, a.key, a.url, a.ttl, a.validate, a.transform, a.timeoutMs, a.raw)));
    wave.forEach((a, j) => {
      (ultraGalaxy[a.block] ??= {})[a.key.split(":").pop() as string] = res[j];
    });
  }
  ctx.ultra_galaxy = ultraGalaxy;
  ctx.monetizacao = { rota_go: "/go", nota: "conteúdo/isca deve CTA para /go — PID do afiliado resolvido server-side" };

  // v5.7 (21.32): cotação USD→BRL para o painel de caixa do Telegram — o
  // trigger notify_telegram_real_sale_event lê este cache (er-api no-auth,
  // renovado a cada ciclo, TTL 12h) e converte a comissão em Reais
  try {
    const fx = await cachedExternal(sb, "er-api", "usd-latest",
      "https://open.er-api.com/v6/latest/USD", 43_200,
      (p) => !!(p as Record<string, any>)?.rates?.BRL, undefined, 8_000);
    ctx.cotacao = { usd_brl: Number((fx as Record<string, any>)?.rates?.BRL ?? 0) || null,
      fonte: "er-api (cache 12h, renovação por ciclo)" };
  } catch { ctx.cotacao = { usd_brl: null, nota: "cotação indisponível — trigger usa fallback" }; }

  // 5.5) NASA APOD (no-auth DEMO_KEY · cache 24h) — insumo do fluxo estético
  //      (capas Pinterest/Instagram do agente content-creation)
  const nasaApod = await cachedExternal(sb, "nasa", "nasa:apod",
    "https://api.nasa.gov/planetary/apod?api_key=DEMO_KEY", 86_400,
    (p) => !!(p.url && p.title));
  if (nasaApod) {
    ctx.nasa_apod = { titulo: nasaApod.title, url: nasaApod.url,
      explicacao: String(nasaApod.explanation ?? "").slice(0, 280) };
  }

  // 6) MALHA DE ESCUTA ATIVA v5.2 (21.26) — comentários pendentes + insights
  //    de mídia; bloco INTEIRO isolado: falha alguma derruba o contexto geral
  try {
    ctx.listening = await loadSocialListeningContext(sb);
  } catch (e) {
    ctx.listening_indisponivel =
      `escuta ativa indisponível neste run (fail-closed): ${String(e instanceof Error ? e.message : e).slice(0, 140)}`;
  }

  // higiene do reservatório (best-effort)
  try { await sb.rpc("nexus_cache_prune", { p_keep: 60 }); } catch { /* segue */ }
  return ctx;
}

// ── MALHA DE ESCUTA ATIVA v5.2 (21.26) ─────────────────────────────────────
// Endpoints oficiais: Ayrshare Comments (engagements:read/write), Ayrshare
// Analytics (insights:read) e Buffer GraphQL (probe de engajamentos/ideas).
// Cada bloco é INDEPENDENTE e fail-closed: 401/429/403-WAF → telemetria em
// nexus_cron_telemetry + pulo do bloco — o lote de agentes segue intacto.
const AYR_COMMENTS = "https://api.ayrshare.com/api/comments";
const AYR_REPLY = "https://api.ayrshare.com/api/comments/reply";
const AYR_ANALYTICS = "https://api.ayrshare.com/api/analytics/post";
const BUF_GQL = "https://api.buffer.com/graphql";
// ── v5.5 (21.30): fontes de busca pública global (no-auth, custo zero) —
// validadas ao vivo: HN 200/0,2s · Lemmy 200/2,6s · StackExchange 200/quota.
// Reddit search.json → 403 (WAF) — descartado.
const HN_SEARCH = "https://hn.algolia.com/api/v1/search";
const LEMMY_SEARCH = "https://lemmy.ml/api/v3/search";
const SE_SEARCH = "https://api.stackexchange.com/2.3/search/advanced";
const GLOBAL_INTENT_MAX_AGE_MS = 30 * 24 * 3_600_000; // janela de frescor 30d

async function ayrCall(
  url: string, key: string, init: RequestInit = {}, timeoutMs = 12_000,
): Promise<{ ok: boolean; status: number; body: Record<string, any> }> {
  const r = await fetchT(url, {
    ...init,
    headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
  }, timeoutMs);
  let body: Record<string, any> = {};
  try { body = await r.json(); } catch { /* corpo não-json → vazio */ }
  return { ok: r.ok, status: r.status, body };
}

const httpOf = (e: unknown): number | null =>
  Number(String(e instanceof Error ? e.message : e).match(/http (\d{3})/)?.[1] ?? 0) || null;

// classificação exigida: 401=token expirado · 429=rate-limit · 403=WAF de borda
const kindOf = (http: number | null): string =>
  http === 401 ? "token_expirado_401" : http === 429 ? "rate_limit_429" : http === 403 ? "waf_borda_403" : "erro";

async function loadSocialListeningContext(
  sb: ReturnType<typeof createClient>,
): Promise<Record<string, unknown>> {
  const out: Record<string, unknown> = { ativa: true, gerado_em: new Date().toISOString() };
  const tel = async (status: string, host: string | null, http: number | null, msg: string) => {
    try {
      await sb.rpc("nexus_cron_telemetry_log", {
        p_job: RUN_JOB, p_status: status, p_host: host, p_http_status: http,
        p_items_total: 0, p_items_sent: 0, p_message: msg.slice(0, 480), p_payload: null,
      });
    } catch { /* telemetria best-effort */ }
  };

  // ── BLOCO 1 (isolado): comentários por post publicado — Ayrshare oficial
  //    GET /api/comments?id=<postId> com a chave da CONTA DONA do post
  //    (contrato validado ao vivo: 200 = dono · 404 = outra conta · 403 = WAF)
  let farms: Array<{ profile_name: string; api_key: string }> = [];
  try {
    const { data } = await sb.from("nexus_social_farms")
      .select("profile_name,api_key").eq("status", "active");
    farms = (data ?? []).filter((f: any) => !!f.api_key);
  } catch { /* fazenda indisponível → escuta Ayrshare declarada ausente */ }
  out.contas_ayrshare_ativas = farms.length;

  let pubs: Array<{ product_id: string; external_post_id: string }> = [];
  try {
    const { data } = await sb.from("nexus_social_outbox")
      .select("product_id,external_post_id")
      .eq("status", "published").not("external_post_id", "is", null)
      .order("published_at", { ascending: false }).limit(4);
    pubs = data ?? [];
  } catch { /* sem posts publicados → escuta sem alvo nesta run */ }

  const raw: Array<Record<string, unknown>> = [];
  const ownerBy = new Map<string, { profile_name: string; api_key: string }>();
  const farmOrder = [...farms]; // ordenada por acerto: dono achado vai p/ frente
  let commentsFound = 0;
  for (const p of pubs) {
    if (Date.now() - t0 > 100_000) break; // guarda de muralha do run
    const pid = String(p.external_post_id);
    let owner = ownerBy.get(pid) ?? null;
    let commentsBody: Record<string, any> | null = null;
    if (owner) {
      try {
        const { ok, body } = await ayrCall(`${AYR_COMMENTS}?id=${encodeURIComponent(pid)}`, owner.api_key);
        if (ok) commentsBody = body;
      } catch { /* sem comentários neste post nesta run */ }
    } else {
      for (const f of farmOrder) {
        try {
          const { ok, body } = await ayrCall(`${AYR_COMMENTS}?id=${encodeURIComponent(pid)}`, f.api_key);
          if (ok) { owner = f; commentsBody = body; break; } // dono encontrado
          continue; // 404 = post de outra conta · 403/429 = conta bloqueada
        } catch { /* próxima conta (fail-closed) */ }
      }
    }
    if (owner) {
      ownerBy.set(pid, owner);
      const idx = farmOrder.indexOf(owner);
      if (idx > 0) { farmOrder.splice(idx, 1); farmOrder.unshift(owner); }
      // corpo: {"instagram":[…], "tiktok":[…], "commentsCount":N, …}
      for (const [platform, list] of Object.entries(commentsBody ?? {})) {
        if (!Array.isArray(list)) continue;
        for (const c of (list as Array<Record<string, any>>).slice(0, 20)) {
          const cid = String(c.id ?? c.commentId ?? "");
          const text = String(c.text ?? c.comment ?? "").trim();
          if (!cid || !text) continue;
          if (String(c.type ?? "comment") === "reply") continue; // nossas respostas
          raw.push({
            platform, comment_id: cid, post_id: pid,
            profile_name: owner.profile_name,
            author_handle: c.authorName ?? c.username ?? c.from?.username ?? "",
            comment_text: text, type: "comment",
          });
          commentsFound++;
        }
      }
    }
  }
  out.posts_varridos = pubs.length;
  out.comentarios_encontrados = commentsFound;

  // ingest deduplicado (product_id enriquecido via external_post_id no RPC)
  if (raw.length) {
    try {
      const { data } = await sb.rpc("nexus_ingest_engagement_tasks", { p_items: raw });
      out.ingest = data ?? { received: raw.length, inserted: 0 };
    } catch (e) {
      await tel("listening_ingest_error", null, null,
        `ingest de comentários pulado (fail-closed): ${String(e instanceof Error ? e.message : e).slice(0, 140)}`);
    }
  }

  // ── BLOCO 4 (v5.5/21.30, isolado): GLOBAL INT HIJACKING — varredura
  //    ATIVA do dicionário nas fontes públicas globais (2 keywords/run por
  //    rotação last_swept_at) → ingest em massa (a resposta nativa bilíngue
  //    nasce no motor de engagement com entrega às contas postadoras vivas)
  try {
    const { data: kws } = await sb.from("nexus_global_target_keywords")
      .select("keyword,language_iso,product_category")
      .eq("active", true)
    // 21.38 (autorizado): 2→8 keywords/run — 4× captação por varredura; a
    // rotação por last_swept_at cobre o dicionário todo a cada 3 runs (12h).
    .order("last_swept_at", { ascending: true, nullsFirst: true })
    .limit(8);
    const cap: Array<Record<string, unknown>> = [];
    for (const k of kws ?? []) {
      if (Date.now() - t0 > 90_000) break; // guarda de muralha do run
      const q = encodeURIComponent(k.keyword);
      await Promise.allSettled([
        (async () => { // Hacker News (Algolia) — stories globais
          try {
            const r = await fetchT(`${HN_SEARCH}?query=${q}&tags=story&hitsPerPage=4`,
              { headers: { "User-Agent": NEXUS_BOT_UA, accept: "application/json" } }, 8_000);
            if (!r.ok) return;
            const b = await r.json().catch(() => null) as Record<string, any> | null;
            for (const h of ((b?.hits ?? []) as Array<Record<string, any>>)) {
              const txt = String(h.title ?? h.story_title ?? "").trim();
              const ago = h.created_at_i ? Date.now() - h.created_at_i * 1000 : Infinity;
              if (!txt || ago > GLOBAL_INTENT_MAX_AGE_MS) continue;
              cap.push({ platform: "hackernews", comment_id: `hn:${h.objectID}`,
                author_handle: String(h.author ?? ""), comment_text: txt.slice(0, 2000),
                language: k.language_iso, keyword: k.keyword });
            }
          } catch { /* fonte isolada — fail-closed */ }
        })(),
        (async () => { // Lemmy (fediverso) — posts globais
          try {
            const r = await fetchT(`${LEMMY_SEARCH}?q=${q}&type_=Posts&sort=New&limit=4`,
              { headers: { "User-Agent": NEXUS_BOT_UA, accept: "application/json" } }, 10_000);
            if (!r.ok) return;
            const b = await r.json().catch(() => null) as Record<string, any> | null;
            for (const p of ((b?.posts ?? []) as Array<Record<string, any>>)) {
              const txt = String(p.post?.name ?? "").trim();
              const ago = p.post?.published ? Date.now() - Date.parse(p.post.published) : Infinity;
              if (!txt || ago > GLOBAL_INTENT_MAX_AGE_MS) continue;
              const corpo = p.post?.body
                ? ` — ${String(p.post.body).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").slice(0, 400)}` : "";
              cap.push({ platform: "lemmy", comment_id: `lemmy:${p.post?.id}`,
                author_handle: String(p.creator?.name ?? ""),
                comment_text: (txt + corpo).slice(0, 2000),
                language: k.language_iso, keyword: k.keyword });
            }
          } catch { /* fonte isolada — fail-closed */ }
        })(),
        (async () => { // StackExchange (superuser) — perguntas globais
          try {
            const r = await fetchT(`${SE_SEARCH}?q=${q}&order=desc&sort=creation&site=superuser&pagesize=4`,
              { headers: { "User-Agent": NEXUS_BOT_UA, accept: "application/json" } }, 8_000);
            if (!r.ok) return;
            const b = await r.json().catch(() => null) as Record<string, any> | null;
            for (const it of ((b?.items ?? []) as Array<Record<string, any>>)) {
              const txt = String(it.title ?? "").trim();
              const ago = it.creation_date ? Date.now() - it.creation_date * 1000 : Infinity;
              if (!txt || ago > GLOBAL_INTENT_MAX_AGE_MS) continue;
              cap.push({ platform: "stackexchange", comment_id: `se:${it.question_id}`,
                author_handle: String(it.owner?.display_name ?? ""),
                comment_text: txt.slice(0, 2000),
                language: k.language_iso, keyword: k.keyword });
            }
          } catch { /* fonte isolada — fail-closed */ }
        })(),
      ]);
    }
    if (kws?.length) {
      await sb.from("nexus_global_target_keywords")
        .update({ last_swept_at: new Date().toISOString() })
        .in("keyword", (kws as Array<{ keyword: string }>).map((k) => k.keyword));
    }
    if (cap.length) {
      const { data: ing } = await sb.rpc("nexus_mass_ingest_global_intents", { p_items: cap });
      out.global_intents = { keywords: (kws ?? []).map((k) => (k as { keyword: string }).keyword),
        capturas: cap.length, ingest: ing ?? null };
    } else {
      out.global_intents = { keywords: (kws ?? []).map((k) => (k as { keyword: string }).keyword), capturas: 0 };
    }
  } catch (e) {
    await tel("global_intent_sweep_error", null, null,
      `varredura global pulada (fail-closed): ${String(e instanceof Error ? e.message : e).slice(0, 140)}`);
    out.global_intents = { erro: "varredura indisponível — bloco isolado" };
  }

  // painel dos pendentes → injetado no contexto de TODOS os 223 agentes
  try {
    const { data } = await sb.from("nexus_social_engagement_tasks")
      .select("platform,author_handle,comment_text,language,profile_name,created_at")
      .eq("status", "pending_reply")
      .order("created_at", { ascending: true }).limit(8);
    out.comentarios_pendentes = data ?? [];
    out.comentarios_pendentes_amostra = data?.length ?? 0;
  } catch { /* contexto declara ausência */ }

  // ── BLOCO 2 (isolado): probe Buffer GraphQL (engagements) — org pode não
  //    expor o campo: erro → telemetria + pulo (Ayrshare é a fonte primária)
  try {
    const { data: bf } = await sb.from("nexus_buffer_farms")
      .select("org_id,api_key").eq("status", "active").limit(1);
    const org = bf?.[0]?.org_id, token = bf?.[0]?.api_key;
    if (org && token) {
      const r = await fetchT(BUF_GQL, {
        method: "POST",
        headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
        body: JSON.stringify({ query: `{ engagements(input: {organizationId: "${org}"}) { edges { node { id } } } }` }),
      }, 10_000);
      if (!r.ok) throw new Error(`http ${r.status}`);
      const g = await r.json().catch(() => ({})) as Record<string, any>;
      if (g.errors?.length) throw new Error(`graphql: ${String(g.errors[0]?.message ?? "").slice(0, 90)}`);
      out.buffer_engagements = "ok";
    }
  } catch (e) {
    const http = httpOf(e);
    out.buffer_engagements = `skipped:${kindOf(http)}`;
    await tel(`listening_buffer_${kindOf(http)}`, "buffer", http,
      `engagements Buffer indisponíveis — bloco pulado (fail-closed): ${String(e instanceof Error ? e.message : e).slice(0, 140)}`);
  }

  // ── BLOCO 3 (isolado): insights de mídia por post (insights:read →
  //    POST /api/analytics/post {id} na conta dona → savedCount/sharesCount/
  //    viewsCount/commentsCount somados por plataforma → RPC atômico local →
  //    auto-aprendizado do rank_score nos seletores)
  try {
    const num = (v: unknown) => Math.max(0, Number(v) || 0);
    let registered = 0;
    for (const p of pubs) {
      const owner = ownerBy.get(String(p.external_post_id));
      if (!owner || !p.product_id) continue;
      try {
        const { ok, status, body } = await ayrCall(AYR_ANALYTICS, owner.api_key, {
          method: "POST", body: JSON.stringify({ id: String(p.external_post_id) }),
        });
        if (!ok) throw new Error(`http ${status}`);
        let saves = 0, shares = 0, views = 0, comments = 0;
        for (const [, pl] of Object.entries(body)) {
          const a = (pl as Record<string, any>)?.analytics;
          if (!a) continue;
          saves += num(a.savedCount ?? a.saves);
          shares += num(a.sharesCount ?? a.shares);
          views += Math.max(num(a.viewsCount), num(a.reachCount), num(a.impressions));
          comments += num(a.commentsCount ?? a.comments);
        }
        const { data: ins } = await sb.rpc("nexus_register_engagement_insight", {
          p_product_id: p.product_id, p_platform: "multi",
          p_saves: saves, p_shares: shares, p_impressions: views, p_comments: comments,
        });
        if (ins?.ok) registered++;
      } catch (e) {
        const http = httpOf(e);
        await tel(`listening_insights_${kindOf(http)}`, owner.profile_name, http,
          `insight do post ${String(p.external_post_id).slice(0, 12)} pulado (fail-closed): ${String(e instanceof Error ? e.message : e).slice(0, 120)}`);
      }
    }
    out.insights_registrados = registered;
  } catch (e) {
    const http = httpOf(e);
    out.insights = `skipped:${kindOf(http)}`;
    await tel(`listening_insights_${kindOf(http)}`, "ayrshare", http,
      `insights de mídia pulados (fail-closed): ${String(e instanceof Error ? e.message : e).slice(0, 140)}`);
  }

  return out;
}

// motor de respostas: escuta → claim atômico → elo GRATUITO → reply ≤400
async function runEngagementReplies(
  sb: ReturnType<typeof createClient>,
  freeChain: Provider[],
  telemetry: Telemetry,
): Promise<Record<string, unknown>> {
  const res: Record<string, unknown> = { executado: false };
  try {
    if (freeChain.length === 0) {
      await telemetry.log({ status: "engagement_skipped",
        message: "sem elo gratuito (mistral/cohere/hf) no vault — replies adiados ao próximo ciclo (fail-closed)" });
      return res;
    }
    // 21.38 (autorizado): claim 4→16/run — processamento em passo com a
    // captação 4× (RPC auto-curativa: 'processing' órfã volta à fila em 15min)
    const { data } = await sb.rpc("nexus_claim_engagement_tasks", { p_limit: 16 });
    const pendentes = (data ?? []) as Array<Record<string, any>>;
    if (!pendentes.length) { res.executado = true; res.replies = 0; return res; }

    // responde NA CONTA que capturou o comentário
    const { data: farms } = await sb.from("nexus_social_farms")
      .select("profile_name,api_key,platforms").eq("status", "active");
    const keyBy = new Map((farms ?? []).map((f: any) => [f.profile_name as string, f.api_key as string]));

    // v5.5 (21.30): ISOLAMENTO 24h — perfis em cooldown (401/403/429) não
    // recebem tentativas; intents globais seguem para as contas VIVAS
    let cooled = new Set<string>();
    try {
      const { data: cds } = await sb.from("nexus_social_profile_cooldowns")
        .select("profile_key").gt("blocked_until", new Date().toISOString());
      cooled = new Set((cds ?? []).map((c: any) => c.profile_key as string));
    } catch { /* tabela indisponível → todas consideradas vivas (fail-closed) */ }
    const liveFarms = (farms ?? []).filter((f: any) => !cooled.has(f.profile_name));
    const cooldown24h = async (profile: string, http: number | null, causa: string) => {
      const until = new Date(Date.now() + 24 * 3_600_000).toISOString();
      try {
        await sb.from("nexus_social_profile_cooldowns").upsert({
          profile_key: profile, engine: "ayrshare", reason: causa, http_status: http,
          blocked_until: until, updated_at: new Date().toISOString(),
        }, { onConflict: "profile_key" });
        // isolamento NATIVO na fazenda (respeitado pela central de tráfego v5.1)
        await sb.from("nexus_social_farms")
          .update({ rate_limited_until: until }).eq("profile_name", profile);
      } catch { /* best-effort */ }
      await telemetry.log({ status: "engagement_cooldown_24h", http_status: http,
        message: `${profile} isolado por 24h (${causa}) — tarefa reentregada às contas postadoras vivas` });
    };

    let posted = 0, failed = 0;
    for (const t of pendentes) {
      try {
        // v5.5 (21.30): GLOBAL INTENT (captura de busca pública — sem post
        // nosso e sem perfil dono) → resposta NATIVA no idioma detectado +
        // mídia HD keyword (Motor 21.29) → outbox ready_to_post (contas VIVAS)
        if (!t.post_id && !t.profile_name) {
          // keyword real da captura (claim não a projeta — lookup por PK, 0ms)
          let kw: string | null = null;
          try {
            const { data: krow } = await sb.from("nexus_social_engagement_tasks")
              .select("keyword").eq("id", t.id).maybeSingle();
            kw = (krow?.keyword as string | null) ?? null;
          } catch { /* isolado — segue sem keyword */ }
          const lang = String(t.language ?? "en").slice(0, 2) || "en";
          const live = liveFarms.filter((f: any) => Array.isArray(f.platforms) && f.platforms.length);
          const entrega = live[0]?.profile_name ?? "global";
          const sid = `solvegrid_reply_${entrega}_${lang}_${Date.now().toString(36)}`;
          const link = `https://www.solvegrid.com.br/?sid=${sid}`;
          const { answer } = await dispatchWithFallback(freeChain,
            "You are the Nexus global reply engine. Detect the language of the captured public post and reply NATIVELY in that exact language. Reply ONLY with the final text, no quotes, no explanation.",
            "Captured public post (platform: " + t.platform + ', keyword: "' + (kw ?? "") + '") by @' + (t.author_handle ?? "user") + ":\n«" + String(t.comment_text ?? "").slice(0, 600) + "»\n\nWrite a native reply in the post's own language (hint: " + lang + "), max 400 characters: warm, helpful, mentioning a smart way to find that deal. End with a call-to-action using this exact link: " + link + (t.recruit_c2 !== false ? "\nThen invite them to join our free daily Brazil deals channel with this exact link: https://t.me/ofertasbrasilz" : "") + "\nReply with the text only.",
            async (p, err) => {
              await telemetry.log({ status: "provider_degraded",
                message: `global reply ${p.name} degradado — contingência: ${String(err instanceof Error ? err.message : err).slice(0, 110)}` });
            });
          let reply = (answer ?? "").trim();
          reply = reply.includes("solvegrid.com.br")
            ? reply.slice(0, 400)
            : `${reply.slice(0, Math.max(0, 400 - link.length - 2))}\n${link}`;
          // v5.8 (21.38): convite C2 GARANTIDO — recrutamento de não-seguidor
          if (t.recruit_c2 !== false && !reply.includes("t.me/ofertasbrasilz")) {
            const inv = "🎁 Ofertas todo dia: t.me/ofertasbrasilz";
            reply = `${reply.slice(0, Math.max(0, 400 - inv.length - 1))}\n${inv}`;
          }
          // mídia HD da keyword (cache-first 21.29) — OBRIGATÓRIA: o outbox
          // exige media_url NOT NULL e as plataformas visuais exigem criativo;
          // todas as fontes caírem → tarefa VOLTA à fila (reentrega no próximo
          // ciclo) em vez de postar sem capa
          let media: MediaAsset | null = null;
          try {
            const subject = String(t.comment_text ?? kw ?? "offers").slice(0, 90);
            media = await resolveTaskMedia(sb, telemetry, freeChain,
              { keyword: `kw:${kw ?? t.platform}`, term: String(kw ?? "offers"),
                path: "ai", subject: `luxury modern social media visual about ${subject}` });
          } catch { /* isolado — media null tratado abaixo */ }
          if (!media) {
            await sb.from("nexus_social_engagement_tasks")
              .update({ status: "pending_reply", error_code: "aguardando_midia_hd",
                updated_at: new Date().toISOString() })
              .eq("id", t.id);
            await telemetry.log({ status: "global_intent_media_wait",
              message: `intent ${t.platform}/${t.comment_id} sem mídia HD neste ciclo (fontes frias) — reentrega no próximo run (fail-closed)` });
            continue;
          }
          const farmPlats = (live[0]?.platforms as string[] | undefined) ?? [];
          const plats = farmPlats.slice(0, 2);
          const platformsFinal = plats.length ? plats : ["instagram", "facebook"];
          const { error: insErr } = await sb.from("nexus_social_outbox").insert({
            product_id: null,
            post_text: reply.slice(0, 3000),
            media_url: media.url,
            public_url: "https://www.solvegrid.com.br/",
            platforms: platformsFinal,
            status: "ready_to_post",
            priority: 40,
            tag: `global_intent_${t.platform}_${lang}`,
          });
          if (insErr) throw new Error(`outbox: ${JSON.stringify(insErr).slice(0, 160)}`);
          await sb.rpc("nexus_finish_engagement_task", {
            p_id: t.id, p_status: "posted", p_reply: reply, p_sid: sid,
          });
          posted++;
          continue;
        }
        // conta dona em isolamento 24h → tarefa aguarda reentrega (recovery 15min)
        if (cooled.has(String(t.profile_name ?? ""))) continue;
        const pt = t.language === "pt";
        const sid = `solvegrid_reply_${t.profile_name ?? "social"}_${Date.now().toString(36)}`;
        const link = t.product_id
          ? `https://www.solvegrid.com.br/go?oferta=${t.product_id}&sid=${sid}`
          : `https://www.solvegrid.com.br/?sid=${sid}`;
        const sys = pt
          ? "Você responde comentários de clientes em redes sociais com alegria, utilidade e brevidade. Responda APENAS com o texto final da resposta, sem aspas e sem explicações."
          : "You reply to customer comments on social media with warmth, usefulness and brevity. Reply ONLY with the final response text, no quotes, no explanation.";
        const user = pt
          ? `Comentário de @${t.author_handle ?? "cliente"} no ${t.platform}: "${t.comment_text}"\nEscreva uma resposta em PORTUGUÊS do Brasil, ultrarrápida, simpática e útil, com no MÁXIMO 400 caracteres. Termine convidando para a oferta com o link exatamente assim: ${link}${t.recruit_c2 !== false ? "\nConvide também para o nosso canal gratuito de ofertas do Brasil com o link exato: https://t.me/ofertasbrasilz" : ""}\nResponda apenas com o texto.`
          : `Comment by @${t.author_handle ?? "customer"} on ${t.platform}: "${t.comment_text}"\nWrite an ultra-fast, friendly and helpful reply in ENGLISH, max 400 characters. End with a call-to-action using this exact link: ${link}${t.recruit_c2 !== false ? "\nAlso invite them to our free daily Brazil deals channel with this exact link: https://t.me/ofertasbrasilz" : ""}\nReply with the text only.`;
        const { answer } = await dispatchWithFallback(freeChain, sys, user, async (p, err) => {
          await telemetry.log({ status: "provider_degraded",
            message: `reply ${p.name} degradado — contingência: ${String(err instanceof Error ? err.message : err).slice(0, 120)}` });
        });
        let reply = (answer ?? "").trim();
        // CTA garantido com o profile_name no SID (atribuição por conta)
        reply = reply.includes("solvegrid.com.br")
          ? reply.slice(0, 400)
          : `${reply.slice(0, Math.max(0, 400 - link.length - 2))}\n${link}`;
        // v5.8 (21.38): convite C2 GARANTIDO — recrutamento de não-seguidor
        if (t.recruit_c2 !== false && !reply.includes("t.me/ofertasbrasilz")) {
          const inv = pt ? "🎁 Ofertas todo dia: t.me/ofertasbrasilz" : "🎁 Daily deals: t.me/ofertasbrasilz";
          reply = `${reply.slice(0, Math.max(0, 400 - inv.length - 1))}\n${inv}`;
        }
        const key = keyBy.get(t.profile_name);
        if (!key) throw new Error(`sem api_key para a conta ${t.profile_name}`);
        const { ok, status } = await ayrCall(AYR_REPLY, key, {
          method: "POST",
          body: JSON.stringify({ id: t.comment_id, platform: t.platform, message: reply }),
        });
        if (!ok) throw new Error(`http ${status}`);
        await sb.rpc("nexus_finish_engagement_task", {
          p_id: t.id, p_status: "posted", p_reply: reply, p_sid: sid,
        });
        posted++;
      } catch (e) {
        const http = httpOf(e);
        failed++;
        if (http === 401 || http === 403 || http === 429) {
          // v5.5 (21.30): bloqueio de rede (401 credencial · 403 WAF de
          // borda · 429 rate-limit) → isolamento 24h da conta + REENTREGA
          // imediata da tarefa às contas postadoras vivas
          await cooldown24h(String(t.profile_name ?? "desconhecido"), http, kindOf(http));
          try {
            await sb.from("nexus_social_engagement_tasks")
              .update({ status: "pending_reply", error_code: `reentrega_${kindOf(http)}`,
                updated_at: new Date().toISOString() })
              .eq("id", t.id);
          } catch { /* best-effort */ }
        } else {
          try {
            await sb.rpc("nexus_finish_engagement_task", {
              p_id: t.id, p_status: "failed",
              p_error: String(e instanceof Error ? e.message : e).slice(0, 190),
            });
          } catch { /* best-effort */ }
        }
        await telemetry.log({
          status: `engagement_reply_${kindOf(http)}`, http_status: http,
          message: `reply ${t.platform}/${t.comment_id} isolado (fail-closed): ${String(e instanceof Error ? e.message : e).slice(0, 140)}`,
        });
      }
    }
    res.executado = true; res.replies = posted; res.falhas = failed;
    await telemetry.log({
      status: posted > 0 ? "engagement_ok" : (failed > 0 ? "engagement_partial" : "engagement_ok"),
      items_total: pendentes.length, items_sent: posted,
      message: `escuta ativa: ${posted}/${pendentes.length} respostas publicadas (cauda longa ≤400 chars, bilíngue, elos gratuitos ${freeChain.map((p) => p.name.split(":")[0]).join("→")})`,
    });
  } catch (e) {
    await telemetry.log({ status: "engagement_block_error",
      message: `motor de engagement pulado (fail-closed): ${String(e instanceof Error ? e.message : e).slice(0, 160)}` });
  }
  return res;
}

// fluxo estético: agentes de criação estruturam ideas de capas (alta resolução)
const IDEA_SIG = /content-creation|creative|canva|design|idea|capa|cover|aesthetic|thumbnail/i;

async function tryStoreIdea(
  sb: ReturnType<typeof createClient>, telemetry: Telemetry,
  slug: string, answer: string, elo: string, mediaVerified?: string,
): Promise<void> {
  try {
    const m = answer.match(/\{[\s\S]*\}/);
    if (!m) return;
    const obj = JSON.parse(m[0]) as Record<string, any>;
    const title = String(obj.title ?? obj.titulo ?? "").trim();
    if (!title) return;
    const { error } = await sb.from("nexus_social_ideas").insert({
      source: "utility-cache",
      title: title.slice(0, 140),
      hook: String(obj.hook ?? obj.gancho ?? "").slice(0, 300) || null,
      visual_direction: String(obj.visual_direction ?? obj.direcao_visual ?? obj.direction ?? "").slice(0, 400) || null,
      // v5.4: URL VERIFICADA do motor de mídias tem precedência — mata na
      // raiz as image_url alucinadas (unsplash 404) dos elos gratuitos
      image_url: mediaVerified ?? (typeof obj.image_url === "string" && obj.image_url.startsWith("https") ? obj.image_url : null),
      payload: obj, elo,
    });
    if (error) throw new Error(String(error).slice(0, 120));

    // ideas:write no Buffer — best-effort ISOLADO (org pode não expor o campo)
    try {
      const { data: bf } = await sb.from("nexus_buffer_farms")
        .select("org_id,api_key").eq("status", "active").limit(1);
      const org = bf?.[0]?.org_id, token = bf?.[0]?.api_key;
      if (org && token) {
        const texto = `${title}${obj.hook ? ` — ${String(obj.hook).slice(0, 120)}` : ""}`;
        const r = await fetchT(BUF_GQL, {
          method: "POST",
          headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
          body: JSON.stringify({ query: `mutation { createIdea(input: {organizationId: "${org}", text: ${JSON.stringify(texto)}}) { id } }` }),
        }, 10_000);
        const gbody = r.ok ? await r.json().catch(() => ({})) as Record<string, any> : {};
        const gqlOk = r.ok && !gbody.errors?.length;
        await telemetry.log({
          status: gqlOk ? "idea_buffer_ok" : "idea_buffer_skipped", host: "buffer",
          http_status: r.ok ? r.status : null,
          message: gqlOk ? "ideas:write sincronizado com o Buffer"
            : `ideas:write Buffer indisponível (${r.ok ? "graphql sem o campo createIdea" : `http ${r.status}`}) — idea preservada localmente (fail-closed)`,
        });
      }
    } catch (e) {
      const http = httpOf(e);
      await telemetry.log({ status: `idea_buffer_${kindOf(http)}`, host: "buffer", http_status: http,
        message: `ideas:write Buffer pulado (fail-closed): ${String(e instanceof Error ? e.message : e).slice(0, 120)} — idea preservada em nexus_social_ideas` });
    }
    await telemetry.log({ status: "idea_stored", items_sent: 1,
      message: `idea estética estruturada pelo agente ${slug} (elo ${elo}): ${title.slice(0, 80)}` });
  } catch (e) {
    await telemetry.log({ status: "idea_parse_skipped",
      message: `idea não estruturada — bloco pulado (fail-closed): ${String(e instanceof Error ? e.message : e).slice(0, 120)}` });
  }
}

// ── provedores de IA (dual-key; nenhum segredo sai daqui) ──────────────────
type Provider = { name: string; call(sys: string, user: string): Promise<string> };

function resolveProviders(): Provider[] {
  const maxTokens = Number(env("MATRIX_MAX_TOKENS") ?? "800");
  const openaiKey = env("OPENAI_API_KEY");
  const claudeKey = env("CLAUDE_API_KEY") ?? env("ANTHROPIC_API_KEY");
  const geminiKey = env("COMMERCE_GEMINI_API_KEY") ?? env("GEMINI_API_KEY");
  const geminiModel = env("MATRIX_MODEL_GEMINI") ?? "gemini-3.5-flash";
  const groqKey = env("COMMERCE_GROQ_API_KEY") ?? env("GROQ_API_KEY");
  const groqModel = env("MATRIX_MODEL_GROQ") ?? "qwen/qwen3.8-27b";
  const mistralKey = env("COMMERCE_MISTRAL_API_KEY") ?? env("MISTRAL_API_KEY");
  const mistralModel = env("MATRIX_MODEL_MISTRAL") ?? "open-mistral-nemo";
  const deepseekKey = env("COMMERCE_DEEPSEEK_API_KEY") ?? env("DEEPSEEK_API_KEY");
  const deepseekModel = env("MATRIX_MODEL_DEEPSEEK") ?? "deepseek-chat";
  const openrouterKey = env("COMMERCE_OPENROUTER_API_KEY") ?? env("OPENROUTER_API_KEY");
  const openrouterModel = env("MATRIX_MODEL_OPENROUTER") ?? "openai/gpt-4o-mini";
  const cohereKey = env("COMMERCE_COHERE_API_KEY") ?? env("COHERE_API_KEY");
  const cohereModel = env("MATRIX_MODEL_COHERE") ?? "command-r7b-12-2024";
  const hfKey = env("HF_API_KEY") ?? env("HUGGINGFACE_API_KEY");
  const hfModel = env("MATRIX_MODEL_HF") ?? "meta-llama/Llama-3.1-8B-Instruct";
  const novitaKey = env("COMMERCE_NOVITA_API_KEY") ?? env("NOVITA_API_KEY");
  const novitaModel = env("MATRIX_MODEL_NOVITA") ?? "meta-llama/llama-3.1-8b-instruct";
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

  // 3º elo (21.16): Gemini — quando OpenAI/Claude respondem billing (402/
  // sem crédito), a MESMA tarefa cai aqui sem interromper o lote.
  const gemini: Provider | null = geminiKey ? {
    name: `gemini:${geminiModel}`,
    async call(sys, user) {
      const model = this.name.split(":")[1];
      const r = await fetchT(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
        {
          method: "POST",
          headers: { "x-goog-api-key": geminiKey, "content-type": "application/json" },
          body: JSON.stringify({
            system_instruction: { parts: [{ text: sys }] },
            contents: [{ role: "user", parts: [{ text: user }] }],
            generationConfig: { maxOutputTokens: maxTokens, temperature: 0.2 },
          }),
        }, 60_000);
      if (!r.ok) throw new Error(`gemini http ${r.status}: ${(await r.text()).slice(0, 180)}`);
      const parts = (await r.json())?.candidates?.[0]?.content?.parts ?? [];
      return parts.map((b: { text?: string }) => b.text ?? "").join("\n").trim();
    },
  } : null;

  // Elos 4-8 (21.16): OpenAI-compatible (Groq/Mistral/DeepSeek/OpenRouter)
  // + Cohere v2. Todos testados ao vivo em 2026-09-07.
  const oaiCompatible = (
    name: string, url: string, key: string,
  ): Provider => ({
    name,
    async call(sys, user) {
      const model = this.name.split(":")[1];
      const r = await fetchT(url, {
        method: "POST",
        headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
        body: JSON.stringify({
          model, max_tokens: maxTokens, temperature: 0.2,
          messages: [{ role: "system", content: sys }, { role: "user", content: user }],
        }),
      }, 60_000);
      if (!r.ok) throw new Error(`${name.split(":")[0]} http ${r.status}: ${(await r.text()).slice(0, 180)}`);
      return (await r.json())?.choices?.[0]?.message?.content ?? "";
    },
  });

  const groq = groqKey ? oaiCompatible(`groq:${groqModel}`, "https://api.groq.com/openai/v1/chat/completions", groqKey) : null;
  const mistral = mistralKey ? oaiCompatible(`mistral:${mistralModel}`, "https://api.mistral.ai/v1/chat/completions", mistralKey) : null;
  const deepseek = deepseekKey ? oaiCompatible(`deepseek:${deepseekModel}`, "https://api.deepseek.com/chat/completions", deepseekKey) : null;
  const openrouter = openrouterKey ? oaiCompatible(`openrouter:${openrouterModel}`, "https://openrouter.ai/api/v1/chat/completions", openrouterKey) : null;
  const hf = hfKey ? oaiCompatible(`hf:${hfModel}`, "https://router.huggingface.co/v1/chat/completions", hfKey) : null;
  const novita = novitaKey ? oaiCompatible(`novita:${novitaModel}`, "https://api.novita.ai/v3/openai/chat/completions", novitaKey) : null;

  const cohere: Provider | null = cohereKey ? {
    name: `cohere:${cohereModel}`,
    async call(sys, user) {
      const model = this.name.split(":")[1];
      const r = await fetchT("https://api.cohere.com/v2/chat", {
        method: "POST",
        headers: { authorization: `Bearer ${cohereKey}`, "content-type": "application/json" },
        body: JSON.stringify({
          model, max_tokens: maxTokens, temperature: 0.2,
          messages: [{ role: "system", content: sys }, { role: "user", content: user }],
        }),
      }, 60_000);
      if (!r.ok) throw new Error(`cohere http ${r.status}: ${(await r.text()).slice(0, 180)}`);
      const content = (await r.json())?.message?.content;
      return Array.isArray(content) ? content.map((b: { text?: string }) => b.text ?? "").join("\n").trim() : String(content ?? "");
    },
  } : null;

  // Cadeia de 10 elos: OpenAI → Claude → Gemini → Groq → Mistral → Cohere →
  // OpenRouter → HF → Novita → DeepSeek (billing/rate-limit degrada p/ o próximo).
  // MATRIX_MODEL define o líder (alias: gpt/claude/gemini/groq/mistral/cohere/openrouter/deepseek).
  const chain: Provider[] = [openai, claude, gemini, groq, mistral, cohere, openrouter, hf, novita, deepseek]
    .filter(Boolean) as Provider[];
  if (preferred) {
    const alias: Record<string, string> = {
      gpt: "openai", o1: "openai", o3: "openai", claude: "claude", gemini: "gemini",
      groq: "groq", mistral: "mistral", cohere: "cohere", command: "cohere",
      openrouter: "openrouter", deepseek: "deepseek", hf: "hf", huggingface: "hf",
      novita: "novita",
    };
    const want = alias[preferred.split(/[-:]/)[0]] ?? preferred.split(/[-:]/)[0];
    const i = chain.findIndex((p) => p.name.startsWith(want));
    if (i > 0) chain.unshift(...chain.splice(i, 1));
  }
  return chain;
}

// ── classes de erro que ativam a CONTINGÊNCIA (dual-key fallback) ──────────
// Spec: 429 (rate limit), 402 (sem saldo), falha de conexão. Incluímos também
// 401 (auth), 5xx (indisponibilidade do provedor) e billing explícito.
function isFallbackWorthy(msg: string): boolean {
  return /http (40[0-9]|42[89]|5\d\d)|credit balance|no credits|billing|network|timeout|timed out|abort|fetch failed|dns|econnrefused|connection/i.test(msg);
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

// ── MATRIX MODEL ROUTING (v6 · 21.16): especialidade por elo gratuito ─────
// Assinaturas de especialidade reordenam a cadeia de 10 elos POR TAREFA,
// explorando as cotas diárias gratuitas de forma especializada:
//   • gemini (3.5-flash, contexto massivo) → SEO programático de cauda longa
//     + enriquecimento de landing pages locais (IBGE, clima, cache Wikipedia)
//   • groq (<150ms) → code-review, debug e higienização de filas de indexação
//   • mistral → cohere → hf (blocos de escrita) → legendas comerciais e
//     chamadas criativas (outbox Ayrshare assíncrona)
const SPECIALTY_ROUTES: Array<{ match: RegExp; order: string[]; why: string }> = [
  { match: /seo|programmatic|landing|local|ibge|cidade|city|tail|cauda|wiki|weather|clima|destino|passagen|hospedagem|hotel/i,
    order: ["gemini", "openrouter", "hf", "mistral", "groq", "cohere", "novita", "deepseek", "openai", "claude"],
    why: "seo_cauda_longa" },
  { match: /code-review|debug|hygiene|higien|queue|fila|audit|auditoria|lint|refactor|test|watchdog|deploy|log|index/i,
    order: ["groq", "gemini", "mistral", "cohere", "openrouter", "hf", "novita", "deepseek", "openai", "claude"],
    why: "code_debug_velocidade" },
  { match: /caption|legenda|copy|creative|criativ|social|ayrshare|instagram|pinterest|tiktok|post|headline|thumbnail|reels|video|short/i,
    order: ["mistral", "cohere", "hf", "gemini", "groq", "openrouter", "novita", "deepseek", "openai", "claude"],
    why: "copy_comercial_blocos" },
  // v5.2 (21.26): escuta ativa → respostas em cauda longa nos elos GRATUITOS
  { match: /engage|engagement|listening|escuta|reply|resposta|coment|comment|mention|men(ç|c)o/i,
    order: ["mistral", "cohere", "hf", "groq", "gemini", "openrouter", "novita", "deepseek", "openai", "claude"],
    why: "engagement_reply_free_fast" },
  // v5.2 (21.26): fluxo estético de capas (ideas de alta resolução)
  { match: /content-creation|canva|design|idea|capa|cover|aesthetic|pinterest-cover/i,
    order: ["mistral", "cohere", "hf", "gemini", "openrouter", "groq", "novita", "deepseek", "openai", "claude"],
    why: "aesthetic_ideas_free" },
  // v5.3 (21.27): PRICE ERROR HUNTER — copy viral de urgência nos elos
  // GRATUITOS (a tarefa priority_bug_alert fura o lote no claim v3)
  { match: /price|preco|preç|anomal|bug|hunter|erro.*pre|relampago|relâmpago|black.?friday/i,
    order: ["mistral", "cohere", "hf", "groq", "gemini", "openrouter", "novita", "deepseek", "openai", "claude"],
    why: "price_bug_blast_free" },
  // v5.3 (21.28): HUB SUL — ofertas geo-localizadas da Região Sul nos elos
  // GRATUITOS, com regionalismo (gaúcho/catarinense/paranaense) no copy
  { match: /gramado|curitiba|balne[áa]rio|cambori[úu]|porto alegre|florian[óo]polis|caxias do sul|blumenau|joinville|londrina|maring[áa]|foz do igua[çc][úu]|pelotas|santa maria|novo hamburgo|cascavel|bento gon[çc]alves|rio grande do sul|santa catarina|paran[áa]|hub.?sul|sul_br|regi[ãa]o sul/i,
    order: ["mistral", "cohere", "hf", "gemini", "groq", "openrouter", "novita", "deepseek", "openai", "claude"],
    why: "sul_geo_hub_free" },
];
function routeForTask(chain: Provider[], slug: string, payload = ""): Provider[] {
  const sig = `${slug} ${payload}`.toLowerCase();
  const route = SPECIALTY_ROUTES.find((r) => r.match.test(sig));
  if (!route) return chain; // sem assinatura → cadeia padrão de 10 elos
  const byName = new Map(chain.map((p) => [p.name.split(":")[0], p]));
  const head = route.order.map((n) => byName.get(n)).filter(Boolean) as Provider[];
  return [...head, ...chain.filter((p) => !head.includes(p))];
}

// ── pool de concorrência limitada (lote assíncrono, mas com freio) ─────────
async function runPool<T, R>(items: T[], size: number, fn: (x: T) => Promise<R>): Promise<void> {
  let cursor = 0;
  const workers = Array.from({ length: Math.min(Math.max(size, 1), items.length) }, async () => {
    while (cursor < items.length) await fn(items[cursor++]);
  });
  await Promise.all(workers);
}

// ── v5.4 (21.29): MOTOR DE MÍDIAS ILIMITADAS — no-auth, custo zero ─────────
// Fonte infinita de criativos HD para os 223 agentes → mediaUrls (Ayrshare)
// + anexos Buffer, com o tracking profile_name intacto no SID do /go.
//   1. CACHE-FIRST 0ms: índice único query_keyword da tabela privada
//      nexus_matrix_media_assets (RLS on, 0 policies, service_role only).
//   2. PATH GEO (turismo/produtos): LoremFlickr no-auth 1080×1080 → URL
//      final DIRETA (HEAD 200 — passa na guarda de mídia v9) → Pollinations
//      fotográfico como contingência.
//   3. PATH IA (arte): elo GRATUITO (mistral→groq→cohere→hf) redige o prompt
//      estético em inglês → URL dinâmica ESTÁVEL
//      image.pollinations.ai/prompt/<enc>?width=1080&height=1080&nologo=true.
//   4. FALLBACK determinístico: capa de marca fixa (não grava no cache).
//   5. Tudo morto → null + telemetria (post segue sem capa ou pula a jusante).
// FAIL-CLOSED: cada bloco isolado — servidor de fotos fora/timeout NUNCA
// derruba o run; os 14.299 anúncios permanecem read-only estrito.
const MEDIA_UA = "NexusGlobalBot/2.0";
const POLLINATIONS_BASE = "https://image.pollinations.ai/prompt/";
const LOREMFLICKR_BASE = "https://loremflickr.com/1080/1080/";
const MEDIA_MIN_EDGE = 320; // compliance de mídia do cluster (>320px)
const MEDIA_FALLBACK_URL = POLLINATIONS_BASE +
  encodeURIComponent(
    "Nexus SolveGrid luxury offers brand cover, elegant dark gold minimal modern hero, high resolution",
  ) + "?width=1080&height=1080&nologo=true";
const GEO_MEDIA_RE =
  /\b(gramado|curitiba|balne[áa]rio cambori[úu]|cambori[úu]|porto alegre|florian[óo]polis|caxias do sul|blumenau|joinville|londrina|maring[áa]|foz do igua[çc][úu]|pelotas|barretos|s[ãa]o paulo|rio de janeiro|paris|londres|madri|barcelona|nova york|orlando|miami|buenos aires|disney)\b/i;
type MediaAsset = { keyword: string; url: string; provider: string; width: number; height: number };

// dimensões REAIS do binário (JPEG SOF / PNG IHDR) — prova a compliance >320px
function imageDims(b: Uint8Array): { w: number; h: number } | null {
  try {
    if (b.length > 24 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e) {
      return {
        w: ((b[16] << 24) | (b[17] << 16) | (b[18] << 8) | b[19]) >>> 0,
        h: ((b[20] << 24) | (b[21] << 16) | (b[22] << 8) | b[23]) >>> 0,
      };
    }
    if (b.length > 4 && b[0] === 0xff && b[1] === 0xd8) {
      let i = 2;
      while (i + 9 < b.length) {
        if (b[i] !== 0xff) { i++; continue; }
        const m = b[i + 1];
        if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) {
          return { h: (b[i + 5] << 8) | b[i + 6], w: (b[i + 7] << 8) | b[i + 8] };
        }
        i += 2 + ((b[i + 2] << 8) | b[i + 3]);
      }
    }
  } catch { /* dims best-effort */ }
  return null;
}

// cache-first: leitura 0ms pelo índice único (miss → resolvedor externo)
async function mediaCacheGet(
  sb: ReturnType<typeof createClient>, keyword: string,
): Promise<MediaAsset | null> {
  try {
    const { data } = await sb.from("nexus_matrix_media_assets")
      .select("query_keyword,media_url,provider_slug,width,height")
      .eq("query_keyword", keyword).maybeSingle();
    return data
      ? {
          keyword: String(data.query_keyword), url: String(data.media_url),
          provider: String(data.provider_slug),
          width: Number(data.width ?? 0), height: Number(data.height ?? 0),
        }
      : null;
  } catch { return null; } // cache indisponível → resolvedor externo (fail-closed)
}

// upsert aditivo ON CONFLICT (query_keyword) — só service_role escreve
async function mediaCachePut(
  sb: ReturnType<typeof createClient>, a: MediaAsset,
): Promise<void> {
  try {
    await sb.from("nexus_matrix_media_assets").upsert({
      query_keyword: a.keyword, media_url: a.url, provider_slug: a.provider,
      width: a.width, height: a.height,
    }, { onConflict: "query_keyword" });
  } catch { /* cache best-effort — nunca derruba o run */ }
}

// warm-up Pollinations: 1ª geração ~10s; aquecida, HEAD 200 <1s (CDN deles).
// Baixa o binário 1x, valida content-type image/* e mede as dimensões reais.
async function pollinationsWarm(
  url: string, ms = 20_000,
): Promise<{ ok: boolean; w: number; h: number }> {
  try {
    const r = await fetchT(url, { headers: { "User-Agent": MEDIA_UA } }, ms);
    if (!r.ok || !/^image\//i.test(r.headers.get("content-type") ?? "")) {
      return { ok: false, w: 0, h: 0 };
    }
    const dims = imageDims(new Uint8Array(await r.arrayBuffer()));
    return { ok: true, w: dims?.w ?? 0, h: dims?.h ?? 0 };
  } catch { return { ok: false, w: 0, h: 0 }; }
}

// PATH GEO provedor 1: LoremFlickr no-auth — keyword → foto real 1080×1080.
// Segue o 302 e congela a URL FINAL (direta 200 → passa no HEAD-check v9).
async function mediaFromLoremFlickr(
  keyword: string, term: string,
): Promise<MediaAsset | null> {
  try {
    const r = await fetchT(`${LOREMFLICKR_BASE}${encodeURIComponent(term)}`,
      { headers: { "User-Agent": MEDIA_UA, accept: "image/*" } }, 10_000);
    if (!r.ok || !/^image\//i.test(r.headers.get("content-type") ?? "")) return null;
    const finalUrl = r.url || `${LOREMFLICKR_BASE}${encodeURIComponent(term)}`;
    // v5.4.1: o asset é registrado sob a CHAVE de cache (keyword) — o termo
    // serve apenas para a busca; antes gravava sob o termo e o lookup por
    // keyword nunca acertava (cache geo ineficaz, detectado na homologação)
    return { keyword, url: finalUrl, provider: "loremflickr", width: 1080, height: 1080 };
  } catch { return null; } // fora do ar/timeout → próximo provedor (fail-closed)
}

// PATH IA: elo GRATUITO (mistral→groq→cohere→hf) redige o prompt estético em
// inglês; todos caírem → prompt determinístico (o post NUNCA fica sem mídia
// por culpa do redator)
async function aestheticPromptFromFreeElo(
  elos: Provider[], subject: string,
): Promise<string> {
  const deterministic =
    `${subject}, luxury aesthetic, modern minimal elegant composition, warm golden light, high resolution social media cover`;
  for (const p of elos.slice(0, 4)) {
    try {
      const out = await p.call(
        "You write image-generation prompts for AI image APIs. Reply with ONLY the prompt itself: 25-40 words in English, luxurious, modern, high-conversion aesthetic for a social media cover. No quotes, no preamble, no explanation.",
        `Subject: ${subject}`,
      );
      const t = String(out ?? "").trim().replace(/^["'`]+|["'`]+$/g, "")
        .replace(/\s+/g, " ").slice(0, 300);
      if (t.length >= 40 && /[a-z]/i.test(t)) return t;
    } catch { /* elo seguinte — isolado */ }
  }
  return deterministic;
}

async function mediaFromPollinations(
  keyword: string, prompt: string,
): Promise<MediaAsset | null> {
  const url = `${POLLINATIONS_BASE}${encodeURIComponent(prompt)}?width=1080&height=1080&nologo=true`;
  const warm = await pollinationsWarm(url);
  if (!warm.ok || warm.w <= MEDIA_MIN_EDGE) return null;
  return { keyword, url, provider: "pollinations-ai", width: warm.w, height: warm.h };
}

// resolvedor chefe: cache-first → cadeia no-auth → fallback determinístico
async function resolveTaskMedia(
  sb: ReturnType<typeof createClient>, telemetry: Telemetry, elos: Provider[],
  spec: { keyword: string; term: string; path: "geo" | "ai"; subject: string },
): Promise<MediaAsset | null> {
  const cached = await mediaCacheGet(sb, spec.keyword);
  if (cached?.url) return cached; // HIT: 0ms, zero requisição externa
  let asset: MediaAsset | null = null;
  try {
    if (spec.path === "geo") {
      asset = await mediaFromLoremFlickr(spec.keyword, spec.term);
      if (!asset) {
        asset = await mediaFromPollinations(spec.keyword,
          `${spec.subject}, iconic landmark travel photography, vibrant colors, luxury, high resolution`);
      }
    } else {
      const prompt = await aestheticPromptFromFreeElo(elos, spec.subject);
      asset = await mediaFromPollinations(spec.keyword, prompt);
    }
  } catch (e) {
    await telemetry.log({ status: "media_engine_error", host: "media-engine",
      message: `resolvedor de mídia pulado (fail-closed): ${String(e instanceof Error ? e.message : e).slice(0, 120)}` });
  }
  if (asset) {
    await mediaCachePut(sb, asset);
    await telemetry.log({ status: "media_resolved", host: asset.provider, items_sent: 1,
      message: `mídia HD ${asset.width}x${asset.height} (${asset.provider}) p/ "${spec.keyword}" — cache-first daqui em diante` });
    return asset;
  }
  // fallback determinístico (capa de marca fixa) — NÃO grava no cache:
  // provedores reais são retentados no próximo run
  try {
    const fb = await pollinationsWarm(MEDIA_FALLBACK_URL, 18_000);
    if (fb.ok && fb.w > MEDIA_MIN_EDGE) {
      await telemetry.log({ status: "media_fallback", host: "fallback-brand", items_sent: 1,
        message: `provedores no-auth indisponíveis p/ "${spec.keyword}" — capa de marca determinística aplicada (${fb.w}x${fb.h})` });
      return { keyword: spec.keyword, url: MEDIA_FALLBACK_URL, provider: "fallback-brand", width: fb.w, height: fb.h };
    }
  } catch { /* isolado */ }
  await telemetry.log({ status: "media_skipped", host: "media-engine",
    message: `nenhuma fonte respondeu p/ "${spec.keyword}" — post segue sem capa (guarda de mídia v9 decide texto-ou-pulo a jusante)` });
  return null;
}


// ── v5.8 (21.38): ORÁCULO C3 — pílula diária de utilidade pública ──────────
// Lê o reservatório local (clima Open-Meteo · cotação er-api · Wikipedia),
// redige a pílula com elo gratuito e dispara sendPhoto (HD) direto no Canal 3
// (@achadinhosdahora2026vip). Bloco ISOLADO: nenhuma falha aqui pode tocar
// o /go, a MV, o cron social ou a fila de agentes (fail-closed total).
async function runTelegramOrculoBroadcaster(
  sb: ReturnType<typeof createClient>,
  elos: Provider[],
  telemetry: Telemetry,
): Promise<Record<string, unknown>> {
  const ymd = new Date().toISOString().slice(0, 10).replace(/-/g, "");

  // 1) cofre (fail-closed)
  const { data: secs } = await sb.from("nexus_growth_secrets")
    .select("key,value")
    .in("key", ["telegram_bot_token", "telegram_chat_id_oraculo", "telegram_alerts_enabled"]);
  const vault: Record<string, string> = Object.fromEntries((secs ?? []).map((r: any) => [r.key, r.value]));
  if (vault.telegram_alerts_enabled === "off") return { ok: false, motivo: "telegram_alerts_enabled=off" };
  if (!vault.telegram_bot_token || !vault.telegram_chat_id_oraculo)
    return { ok: false, motivo: "vault sem token/chat_id_oraculo (fail-closed)" };
  if (elos.length === 0) return { ok: false, motivo: "sem elo gratuito disponível (fail-closed)" };

  // 2) contexto local — cada fonte isolada (falha de uma não derruba as demais)
  let climaTxt = "previsão indisponível";
  try {
    const { data: wx } = await sb.from("nexus_weather_snapshots")
      .select("city_slug,summary").order("fetched_at", { ascending: false }).limit(6);
    const vistos = new Set<string>();
    const linhas: string[] = [];
    for (const w of (wx ?? [])) {
      if (vistos.has(w.city_slug) || linhas.length >= 3) continue;
      vistos.add(w.city_slug);
      linhas.push(`${w.city_slug}: ${String(w.summary ?? "").slice(0, 90)}`);
    }
    if (linhas.length) climaTxt = linhas.join(" · ");
  } catch { /* clima opcional */ }

  let usdBrl: number | null = null;
  try {
    const fx = await cachedExternal(sb, "er-api", "usd-latest",
      "https://open.er-api.com/v6/latest/USD", 43_200,
      (p) => !!(p as any).rates && typeof (p as any).rates.BRL === "number");
    usdBrl = fx ? Number((fx as any).rates.BRL) : null;
  } catch { /* câmbio opcional */ }

  let wikiTxt: string | null = null;
  try {
    const w = await cachedExternal(sb, "wikipedia", "wikipedia:pt:festa-do-peao-barretos",
      "https://pt.wikipedia.org/api/rest_v1/page/summary/Festa%20do%20Pe%C3%A3o%20de%20Barretos", 604_800);
    wikiTxt = w ? String((w as any).extract ?? "").slice(0, 220) : null;
  } catch { /* wiki opcional */ }

  // 3) oferta topo — link promocional da pílula (SID do Oráculo C3)
  let oferta: { id: string; nome: string } | null = null;
  try {
    const { data: top } = await sb.from("nexus_public_offers_ordered_mv")
      .select("id,offer_json").order("rank_score", { ascending: false }).limit(1);
    if (top && top[0])
      oferta = { id: String(top[0].id), nome: String((top[0].offer_json as any)?.nome ?? "oferta do dia") };
  } catch { /* oferta opcional */ }
  const linkPill = `https://www.solvegrid.com.br/?sid=telegram_oraculo_c3_pill_${ymd}`;
  const linkOferta = oferta
    ? `https://www.solvegrid.com.br/go?oferta=${oferta.id}&sid=telegram_oraculo_c3_oferta_${ymd}`
    : linkPill;

  // 4) pílula via elo gratuito (Mistral/Groq → fallback determinístico)
  const { answer, servedBy } = await dispatchWithFallback(elos,
    "Você é o Oráculo de utilidade pública do projeto Nexus (canal Telegram 'IA Buy'). Escreve pílulas diárias em PORTUGUÊS do Brasil, formato leve com HTML simples (<b>, <i>, um emoji por linha). Responda APENAS com a pílula pronta, sem aspas e sem explicações. Máximo 850 caracteres.",
    `Redija a pílula do dia com:\n1) 💵 Cotação do dia: USD 1 = R$ ${usdBrl ? usdBrl.toFixed(2).replace(".", ",") : "aguardando"} (fonte er-api)\n2) 🌤️ Previsão local (fonte Open-Meteo): ${climaTxt}\n3) ✈️ Dica de viagem curta e prática${wikiTxt ? ` (inspiração: ${wikiTxt})` : ""}\n4) Uma linha final convidando para a oferta do dia com o link exato: ${linkOferta}\nNão invente números além dos fornecidos. Máximo 850 caracteres.`,
    async (p, err) => {
      await telemetry.log({ status: "provider_degraded",
        message: `oráculo ${p.name} degradado — contingência: ${String(err instanceof Error ? err.message : err).slice(0, 110)}` });
    });
  let pill = (answer ?? "").trim();
  if (!pill) {
    pill = `🔮 <b>ORÁCULO DO DIA</b>\n\n💵 <b>Cotação:</b> USD 1 = R$ ${usdBrl ? usdBrl.toFixed(2).replace(".", ",") : "aguardando"}\n🌤️ <b>Tempo agora:</b> ${climaTxt}\n\n✈️ Viajar bem é viajar sabendo o preço. Confira a oferta do dia:\n👉 ${linkOferta}`;
  }
  pill = pill.slice(0, 950);

  // 5) mídia HD (cache-first: Pollinations/LoremFlickr → capa de marca)
  let mediaUrl: string | null = null;
  try {
    const media = await resolveTaskMedia(sb, telemetry, elos, {
      keyword: `oraculo:${ymd}`,
      term: "brazil sunrise travel",
      path: "ai",
      subject: "serene Brazilian countryside sunrise, warm golden light, minimalist travel deals aesthetic, high quality",
    });
    mediaUrl = media?.url ?? null;
  } catch { /* sem mídia → pílula em texto puro */ }

  // 6) disparo: sendPhoto (HD) com fallback sendMessage — isolado
  const api = `https://api.telegram.org/bot${vault.telegram_bot_token}`;
  let enviador = "sendMessage";
  let messageId: number | null = null;
  let tgOk = false;
  if (mediaUrl) {
    try {
      const fd = new FormData();
      fd.append("chat_id", vault.telegram_chat_id_oraculo);
      fd.append("photo", mediaUrl);
      fd.append("caption", pill);
      fd.append("parse_mode", "HTML");
      const r = await fetchT(`${api}/sendPhoto`, { method: "POST", body: fd }, 20_000);
      const j: any = await r.json().catch(() => ({}));
      tgOk = r.ok && !!j?.ok;
      messageId = j?.result?.message_id ?? null;
      if (tgOk) enviador = "sendPhoto";
    } catch { /* cai para sendMessage */ }
  }
  if (!tgOk) {
    try {
      const r = await fetchT(`${api}/sendMessage`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ chat_id: vault.telegram_chat_id_oraculo, text: pill, parse_mode: "HTML" }),
      }, 15_000);
      const j: any = await r.json().catch(() => ({}));
      tgOk = r.ok && !!j?.ok;
      messageId = j?.result?.message_id ?? null;
    } catch { /* fail-closed: oráculo silencia hoje, tenta amanhã */ }
  }
  await telemetry.log({
    status: tgOk ? "oraculo_c3_ok" : "oraculo_c3_fail",
    items_sent: tgOk ? 1 : 0,
    message: `oráculo C3 ${tgOk ? "transmitido" : "falhou (fail-closed)"} via ${enviador}${messageId ? ` (msg ${messageId})` : ""} · elo=${servedBy ?? "fallback-determinístico"} · usd=${usdBrl ?? "?"}`,
  });
  return { ok: tgOk, enviador, message_id: messageId, elo: servedBy ?? null,
    usd_brl: usdBrl, oferta: oferta?.nome ?? null, pill_chars: pill.length };
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
      message: "sem nenhuma chave IA no vault (OpenAI/Claude/Gemini/Groq/Mistral/Cohere/OpenRouter/HF/Novita/DeepSeek) — lote não despachado",
    });
    return json(200, {
      ok: true, provider: null, claimed: 0, succeeded: 0, failed: 0,
      skipped: stale ?? 0, note: "vault sem chave IA — fail-closed (telemetria registrada)",
      duration_ms: Date.now() - t0,
    });
  }
  const deadProviders = new Set<string>(); // degradados neste run

  // v5.4 (21.29): elos gratuitos do MOTOR DE MÍDIAS (mistral→groq→cohere→hf)
  // — redigem o prompt estético em inglês para o Pollinations (custo zero)
  const mediaElos = providers.filter((p) => /^(mistral|groq|cohere|hf):/i.test(p.name));

  // v5.4 (21.29): AUTOTESTE DO MOTOR DE MÍDIAS (?media_self_test=1) —
  // homologação ao vivo (geo + IA + contagem do cache). Fail-closed: mesma
  // auth x-matrix-secret; único efeito colateral é o cache + telemetria.
  if (url.searchParams.get("media_self_test") === "1") {
    const tMedia = Date.now();
    const geo = await resolveTaskMedia(sb, telemetry, mediaElos,
      { keyword: "geo:gramado", term: "gramado", path: "geo", subject: "Gramado" });
    const ia = await resolveTaskMedia(sb, telemetry, mediaElos,
      { keyword: `ai:self-test:${new Date().toISOString().slice(0, 10)}`,
        term: "capa luxuosa de ofertas Nexus", path: "ai",
        subject: "luxury offers creative cover for Nexus e-commerce deals" });
    let cacheRows: number | null = null;
    try {
      const { count } = await sb.from("nexus_matrix_media_assets")
        .select("id", { count: "exact", head: true });
      cacheRows = count ?? 0;
    } catch { /* best-effort */ }
    return json(200, { ok: true, media_self_test: { geo, ia, cache_rows: cacheRows },
      duration_ms: Date.now() - tMedia });
  }

  // v5.8 (21.38): ORÁCULO C3 — pílula diária de utilidade pública. Rota
  // isolada (?oraculo=1): qualquer falha interna é capturada AQUI e nunca
  // alcança o fluxo principal (claim/agents/social ficam intactos).
  if (url.searchParams.get("oraculo") === "1") {
    const tOr = Date.now();
    let resOr: Record<string, unknown> = {};
    try {
      resOr = await runTelegramOrculoBroadcaster(sb, mediaElos, telemetry);
    } catch (e) {
      resOr = { ok: false, erro: String(e instanceof Error ? e.message : e).slice(0, 160) };
      try {
        await telemetry.log({ status: "oraculo_c3_error",
          message: `oráculo isolado (fail-closed): ${String(e instanceof Error ? e.message : e).slice(0, 140)}` });
      } catch { /* telemetria best-effort */ }
    }
    return json(200, { ok: true, oraculo: resOr, duration_ms: Date.now() - tOr });
  }

  // 3) CLAIM ATÔMICO DO LOTE (v4/21.25: RPC endurecido com
  //    pg_try_advisory_xact_lock por task + FOR UPDATE SKIP LOCKED —
  //    transição pending→running no mesmo milissegundo, sem janela de corrida)
  const { data: tasks, error: claimErr } = await sb.rpc("nexus_matrix_claim_tasks", {
    p_limit: batch,
    p_stale_seconds: 1800,
  });
  if (claimErr) {
    await telemetry.log({ status: "claim_error", message: String(claimErr).slice(0, 200) });
    return json(502, { ok: false, error: "claim falhou", detail: String(claimErr).slice(0, 200) });
  }
  const claimed = (tasks ?? []) as Array<{
    id: number; agent_slug: string; payload: Record<string, unknown>;
    attempts: number; claimed_at?: string | null; status?: string | null;
  }>;
  // GUARDA v4: só processa tarefas com marcador de claim imediato válido
  // (claimed_at preenchido pelo RPC no instante do claim — defesa contra
  // qualquer leitura suja/paralela; tarefas sem marcador são devolvidas)
  const owned = claimed.filter((t) => !!t.claimed_at);
  if (owned.length < claimed.length) {
    await telemetry.log({
      status: "claim_guard",
      items_total: owned.length,
      items_sent: owned.length,
      message: `guarda v4: ${claimed.length - owned.length} tarefa(s) sem marcador de claim descartada(s) — anti-duplo-execução`,
    });
  }
  // v5.2: elos gratuitos para o motor de engagement (definidos cedo — a
  // escuta ativa roda mesmo quando a fila de agentes está vazia)
  const freeElos = providers.filter((p) => /^(mistral|cohere|hf):/i.test(p.name));

  // 4.4) v5.3 — PRICE ERROR HUNTER safety-net: anomalias 'armed' presas
  //      >10min (blast do trigger falhou) re-enfileiram a tarefa prioritária.
  //      Bloco ISOLADO: falha → telemetria + pulo (ads/SolveGrid intactos).
  let anomalyNet: Record<string, unknown> = {};
  try {
    const { data: net } = await sb.rpc("nexus_price_anomaly_safety_net", { p_limit: 2 });
    anomalyNet = (net as Record<string, unknown>) ?? {};
  } catch (e) {
    await telemetry.log({ status: "hunter_net_error",
      message: `safety-net do price hunter pulado (fail-closed): ${String(e instanceof Error ? e.message : e).slice(0, 140)}` });
  }

  if (owned.length === 0) {
    // v5.2: fila de agentes vazia NÃO dispensa a MALHA DE ESCUTA ATIVA —
    // comentários pendentes + insights de mídia + replies em cauda longa
    // rodam em TODO trigger (24/7), fail-closed por bloco
    const listening = await loadSocialListeningContext(sb).catch((e) => ({
      indisponivel: `escuta indisponível (fail-closed): ${String(e instanceof Error ? e.message : e).slice(0, 120)}`,
    }));
    const engagement = await runEngagementReplies(sb, freeElos, telemetry);
    // v5.3: probe leve do Hub Sul no early-return (o contexto COMPLETO —
    // hub_sul/price_hunter/sitemaps_multilingues — só é montado quando há
    // tarefas; aqui uma checagem direta prova o cluster em produção)
    let hubSulProbe: Record<string, unknown> | null = null;
    try {
      const { count } = await sb.from("nexus_buffer_farms")
        .select("id", { count: "exact", head: true })
        .eq("status", "active").eq("target_niche", "sul_br");
      hubSulProbe = { contas_sul_ativas: count ?? 0 };
    } catch { hubSulProbe = null; }
    // v5.6 (21.31): probe do PAINEL DE BORDO TELEGRAM (cliques humanos 24h,
    // vendas do Radar e pushes do dia — auditoria em nexus_telegram_push_log)
    let tgProbe: Record<string, unknown> | null = null;
    try {
      const { count: clicks24 } = await sb.from("nexus_click_streams")
        .select("id", { count: "exact", head: true })
        .gt("created_at", new Date(Date.now() - 86_400_000).toISOString());
      const { count: vendas } = await sb.from("affiliate_conversions")
        .select("id", { count: "exact", head: true });
      const { count: pushesHoje } = await sb.from("nexus_telegram_push_log")
        .select("id", { count: "exact", head: true })
        .gt("created_at", new Date().toISOString().slice(0, 10));
      const { count: cliquesComRede } = await sb.from("nexus_click_streams")
        .select("id", { count: "exact", head: true })
        .not("network", "is", null)
        .gt("created_at", new Date(Date.now() - 86_400_000).toISOString());
      let cotacao: number | null = null;
      try {
        const { data: fx } = await sb.from("nexus_external_data_cache")
          .select("payload_response").eq("query_key", "usd-latest").maybeSingle();
        cotacao = Number((fx?.payload_response as Record<string, any>)?.rates?.BRL ?? 0) || null;
      } catch { /* best-effort */ }
      tgProbe = { cliques_humanos_24h: clicks24 ?? 0, vendas_radar: vendas ?? 0,
        pushes_telegram_hoje: pushesHoje ?? 0, cliques_com_rede_24h: cliquesComRede ?? 0,
        cotacao_usd_brl: cotacao };
    } catch { tgProbe = null; }
    return json(200, {
      ok: true, provider: providers.map((p) => p.name).join("+"),
      claimed: 0, succeeded: 0, failed: 0, skipped: 0, degraded: [],
      listening, engagement, anomaly_net: anomalyNet,
      contexto: { hub_sul: hubSulProbe, telegram_board: tgProbe },
      duration_ms: Date.now() - t0,
    });
  }

  // 4) CONTEXTO COMPARTILHADO DO LOTE (1 carga por run — read-only)
  //    v5.2: inclui a MALHA DE ESCUTA ATIVA (comentários + insights)
  const ctx = await loadContext(sb);

  // 4.5) v5.2 — MOTOR DE ENGAGEMENT: respostas bilíngues em cauda longa
  //      forçadas nos elos GRATUITOS (mistral→cohere→hf), claim atômico na
  //      fila privada. Bloco INDEPENDENTE: 401/429/WAF → telemetria + pulo.
  const engagement = await runEngagementReplies(sb, freeElos, telemetry);

  // 5) DESPACHO EM LOTE, ASSÍNCRONO, ISOLADO POR TAREFA (dual-key fallback)
  let succeeded = 0, failed = 0;
  const perTask: Array<Record<string, unknown>> = [];

  await runPool(owned, Number(env("MATRIX_CONCURRENCY") ?? "4"), async (task) => {
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
      // v5.2: assinatura da tarefa → injeção direcionada de escuta/estética
      const taskSig = `${task.agent_slug} ${JSON.stringify(task.payload ?? {})}`.toLowerCase();
      const isEngagementTask = /engage|engagement|listening|escuta|reply|resposta|coment|comment|mention|men(ç|c)o/.test(taskSig);
      const isIdeaTask = IDEA_SIG.test(taskSig);
      // v5.3: tarefa de ERRO DE PREÇO (claim v3 furou o lote) → diretiva de
      // urgência máxima com copy viral bilíngue
      const isBugAlert = task.status === "priority_bug_alert" ||
        /priority_bug/.test(taskSig);
      // v5.3 (21.28): tarefa de oferta geo-localizada Sul → diretiva regional
      const isSulTask = /gramado|curitiba|balne[áa]rio|cambori[úu]|porto alegre|florian[óo]polis|caxias|blumenau|joinville|londrina|maring[áa]|foz do igua[çc][úu]|pelotas|rio grande do sul|santa catarina|paran[áa]|hub.?sul|sul_br|regi[ãa]o sul/i.test(taskSig);
      // v5.4 (21.29): MÍDIA ILIMITADA — geo (cidade detectada na assinatura)
      // ou IA (tarefa estética); cache-first, resolvedores no-auth isolados
      const mediaCity = taskSig.match(GEO_MEDIA_RE)?.[0]?.trim()
        ?? (isSulTask ? "sul do brasil" : null);
      let media: MediaAsset | null = null;
      if (mediaCity || isIdeaTask) {
        media = await resolveTaskMedia(sb, telemetry, mediaElos, mediaCity
          ? { keyword: `geo:${mediaCity}`, term: mediaCity, path: "geo", subject: mediaCity }
          : { keyword: `ai:${task.agent_slug}:${new Date().toISOString().slice(0, 10)}`,
              term: task.agent_slug, path: "ai",
              subject: `luxury social media cover for agent ${task.agent_slug} (Nexus e-commerce offers)` });
      }
      const listeningCtx = ctx.listening as Record<string, any> | undefined;
      const prompt = `CONTEXTO DO ECOSSISTEMA (leituras do run, fail-closed):\n${JSON.stringify(ctx, null, 2)}\n\n` +
        (isEngagementTask && Array.isArray(listeningCtx?.comentarios_pendentes) && listeningCtx.comentarios_pendentes.length
          ? `DADOS BRUTOS DE ESCUTA ATIVA (comentários pendentes — use como base da resposta):\n${JSON.stringify(listeningCtx.comentarios_pendentes, null, 1)}\n\n`
          : "") +
        (isIdeaTask
          ? `DIRETIVA ESTÉTICA (Aesthetics Framework): estruture a saída como objeto JSON {title, hook, visual_direction, image_url} para capas de Pinterest/Instagram de alta resolução, ancorada no cache de utilidade pública do contexto (nasa_apod, wikipedia_resumos, clima).\n\n`
          : "") +
        (isBugAlert
          ? `ALERTA PRIORITÁRIO — ERRO DE PREÇO DETECTADO NO FEED (Price Error Hunter): escreva copy viral de EXTREMA urgência (PT-BR e versão EN curta), destacando a queda brutal de preço e o risco do link sumir. Use os dados brutos da tarefa e o painel ctx.price_hunter. Máximo 400 caracteres por versão, termine com o public_url da tarefa.\n\n`
          : "") +
        (isSulTask
          ? `DIRETIVA HUB REGIONAL SUL (21.28): esta oferta é geo-localizada da Região Sul do Brasil. Escreva copy em PT-BR com identidade regional sulista (cidade/estado presentes no ctx.hub_sul.cidades_gatilho), calor humano e CTA local. O envio sairá prioritariamente pelas contas @ia.ofertassul (LinkedIn/Facebook/Instagram) e @ai.ofertassul (Instagram) com SID solvegrid_social_sul_*.\n\n`
          : "") +
        (media
          ? `MÍDIA HD PRONTA E VERIFICADA (21.29 No-Auth Image Engine, cache-first — use EXATAMENTE esta URL como image_url/capa do post; não invente outras):\n${JSON.stringify({ image_url: media.url, provider: media.provider, width: media.width, height: media.height })}\n\n`
          : "") +
        `TAREFA (${task.agent_slug}):\n${JSON.stringify(task.payload ?? {})}`;

      const live = routeForTask(providers, task.agent_slug, JSON.stringify(task.payload ?? {}))
        .filter((p) => !deadProviders.has(p.name));
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
        p_result: {
          provider: servedBy, output_chars: answer.length, output: answer.slice(0, 12_000),
          // v5.4: mídia verificada flui para a jusante — mediaUrls é a
          // propriedade que o Ayrshare espera no post; media alimenta o
          // anexo do Buffer (dispatcher) com dims para compliance >320px
          ...(media
            ? { mediaUrls: [media.url], media: { url: media.url, provider: media.provider, width: media.width, height: media.height, keyword: media.keyword } }
            : {}),
        },
      });
      if (doneErr) throw new Error(`complete falhou: ${String(doneErr).slice(0, 120)}`);
      // v5.2: agentes de criação → payload estético de idea (isolado)
      if (isIdeaTask) {
        try { await tryStoreIdea(sb, telemetry, task.agent_slug, answer, servedBy.split(":")[0], media?.url ?? undefined); } catch { /* isolado */ }
      }
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
    items_total: owned.length,
    items_sent: succeeded,
    message: `provider=${providers.map((p) => p.name).join("+")} degradados=${[...deadProviders].join(",") || "nenhum"} ok=${succeeded} fail=${failed} routing=seo>gemini|code>groq|copy>mistral.cohere.hf|listen>mistral.cohere.hf|aesthetic>mistral.cohere.hf · escuta=${JSON.stringify(engagement)}`,
    payload: { tasks: perTask },
  });

  return json(200, {
    ok: true, provider: providers.map((p) => p.name).join("+"),
    degraded: [...deadProviders], claimed: owned.length, lock: "pg_try_advisory_xact_lock",
    succeeded, failed, skipped: owned.length - succeeded - failed,
    tasks: perTask, engagement, anomaly_net: anomalyNet, context: ctx, duration_ms: Date.now() - t0,
  });
});
