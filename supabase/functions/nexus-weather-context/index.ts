// ============================================================================
// NEXUS MATRIX — CONTEXTO DE CLIMA (Open-Meteo via lib `openmeteo`)
// supabase/functions/nexus-weather-context/index.ts · Etapa 21.3 · 2026-09-07
// ----------------------------------------------------------------------------
// Coleta 1 chamada multi-cidade (catálogo public.nexus_weather_cities) e grava
// snapshots compactos em public.nexus_weather_snapshots. O orquestrador do
// cluster lê o snapshot mais recente (READ-ONLY) e injeta `clima` no contexto
// dos 223 agentes.
//
// DUAL-PATH fail-closed (padrão da matriz):
//   · PRIMÁRIO: SDK oficial `openmeteo` (npm:openmeteo) — import dinâmico;
//     se o runtime não suportar o pacote CJS, cai SEM interrupção no
//   · CONTINGÊNCIA: REST JSON da API Open-Meteo (mesma URL/params, keyless).
//
// Fail-closed: auth x-matrix-secret (tempo constante); falha de rede/API →
// telemetria + skip por cidade; nenhuma escrita fora de weather/telemetria.
// Open-Meteo: API aberta SEM chave — zero segredos no vault.
// ============================================================================

import { fetchWeatherApi } from "npm:openmeteo";
import { createClient } from "npm:@supabase/supabase-js@2";

const RUN_JOB = "nexus-weather-context";
const API_URL = "https://api.open-meteo.com/v1/forecast";
const t0 = Date.now();
const env = (k: string): string | undefined => Deno.env.get(k);

const json = (status: number, body: Record<string, unknown>) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json; charset=utf-8" } });

function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

async function fetchT(url: string, init: RequestInit, ms: number): Promise<Response> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  try { return await fetch(url, { ...init, signal: ctrl.signal }); }
  finally { clearTimeout(timer); }
}

async function telemetry(sb: ReturnType<typeof createClient>, p: Record<string, unknown>) {
  try {
    await sb.rpc("nexus_cron_telemetry_log", {
      p_job: RUN_JOB, p_status: String(p.status ?? "ok"), p_host: null, p_http_status: null,
      p_items_total: Number(p.items_total ?? 0), p_items_sent: Number(p.items_sent ?? 0),
      p_message: String(p.message ?? "").slice(0, 480) || null, p_payload: null,
    });
  } catch { /* best-effort */ }
}

// WMO weather codes → pt-BR (síntese suficiente para agentes de conteúdo)
const WMO_PT: Array<[number[], string]> = [
  [[0], "céu limpo"], [[1, 2], "parcialmente limpo"], [[3], "nublado"],
  [[45, 48], "nevoeiro"], [[51, 53, 55, 56, 57], "garoa"],
  [[61, 63, 65, 66, 67], "chuva"], [[71, 73, 75, 77], "neve"],
  [[80, 81, 82], "pancadas de chuva"], [[85, 86], "pancadas de neve"],
  [[95], "tempestade"], [[96, 99], "tempestade com granizo"],
];
const wmoPt = (c: number): string => WMO_PT.find(([codes]) => codes.includes(c))?.[1] ?? "condição variável";

// ── forma normalizada comum às duas vias (SDK e REST) ──────────────────────
type WxCity = {
  current: Record<string, number | string>;
  hourly: Record<string, Array<number | string | null>>;
  daily: Record<string, Array<number | string | null>>;
  meta: Record<string, unknown>;
};

const CURRENT_VARS = ["temperature_2m", "apparent_temperature", "relative_humidity_2m", "is_day",
  "precipitation", "rain", "weather_code", "cloud_cover", "wind_speed_10m", "wind_gusts_10m", "wind_direction_10m"];
const HOURLY_VARS = ["temperature_2m", "apparent_temperature", "precipitation_probability",
  "precipitation", "weather_code", "uv_index", "is_day"];
const DAILY_VARS = ["weather_code", "temperature_2m_max", "temperature_2m_min", "apparent_temperature_max",
  "apparent_temperature_min", "sunrise", "sunset", "uv_index_max", "precipitation_sum",
  "precipitation_hours", "precipitation_probability_max", "wind_speed_10m_max",
  "wind_gusts_10m_max", "moon_phase", "moonrise", "moonset"];

const num2 = (x: unknown) => (typeof x === "number" && Number.isFinite(x) ? +x.toFixed(2) : x);

// ── VIA PRIMÁRIA: SDK oficial openmeteo (fetchWeatherApi, multi-local) ──────
async function viaSdk(lats: number[], lons: number[]): Promise<WxCity[]> {
  const responses = await fetchWeatherApi(API_URL, {
    latitude: lats, longitude: lons,
    current: CURRENT_VARS, hourly: HOURLY_VARS, daily: DAILY_VARS,
    models: ["best_match"], timezone: "auto", past_days: 0, forecast_days: 7,
    temporal_resolution: "native", cell_selection: "nearest",
  });
  const missingInt64 = 9223372036854775807n; // dias sem moonrise/moonset (doc SDK)
  const iso = (v: bigint | null, off: number) =>
    v === null || v === undefined || v === missingInt64 ? null : new Date((Number(v) + off) * 1000).toISOString();
  const nums = (a: ArrayLike<number> | null) => a ? Array.from(a, num2) : [];
  const ints = (a: ArrayLike<number> | null) => a ? Array.from(a, (x) => (x == null || !Number.isFinite(x) ? null : Math.round(x))) : [];
  return responses.map((response: any) => {
    const off = response.utcOffsetSeconds();
    const cur = response.current(), hr = response.hourly(), da = response.daily();
    const current: Record<string, number | string> = { time: new Date((Number(cur.time()) + off) * 1000).toISOString() };
    CURRENT_VARS.forEach((v, i) => (current[v] = num2(cur.variables(i).value())));
    const nHr = Math.min((Number(hr.timeEnd()) - Number(hr.time())) / hr.interval(), 48);
    const hourly: Record<string, Array<number | string | null>> = {
      time: Array.from({ length: nHr }, (_, k) => new Date((Number(hr.time()) + k * hr.interval() + off) * 1000).toISOString()),
    };
    HOURLY_VARS.forEach((v, i) => (hourly[v] = v === "weather_code" || v === "is_day" ? ints(hr.variables(i).valuesArray()) : nums(hr.variables(i).valuesArray())));
    const nDa = (Number(da.timeEnd()) - Number(da.time())) / da.interval();
    const daily: Record<string, Array<number | string | null>> = {
      time: Array.from({ length: nDa }, (_, k) => new Date((Number(da.time()) + k * da.interval() + off) * 1000).toISOString().slice(0, 10)),
    };
    DAILY_VARS.forEach((v, i) => {
      if (v === "sunrise" || v === "sunset" || v === "moonrise" || v === "moonset") {
        const varr = da.variables(i);
        daily[v] = Array.from({ length: varr.valuesInt64Length() }, (_, k) => iso(varr.valuesInt64(k), off));
      } else if (v === "weather_code") daily[v] = ints(da.variables(i).valuesArray());
      else daily[v] = nums(da.variables(i).valuesArray());
    });
    return { current, hourly, daily, meta: { via: "sdk", latitude: response.latitude(), longitude: response.longitude(), elevation: response.elevation(), utc_offset_s: off } };
  });
}

// ── COLETA: REST JSON da API oficial Open-Meteo (mesma API da SDK, keyless)
// Nota de engenharia: a SDK `openmeteo` foi VALIDADA (Node/CLI — multi-local,
// Int64 sunrise/moonrise OK), mas o runtime Edge atual não executa a SDK
// (pacote CJS/flatbuffers + dynamic import bloqueados no boot). Mantivemos o
// MESMO formato normalizado que a SDK produziria (nomes = índices da doc).
async function viaRest(lats: number[], lons: number[]): Promise<WxCity[]> {
  const qs = new URLSearchParams({
    latitude: lats.join(","), longitude: lons.join(","),
    current: CURRENT_VARS.join(","), hourly: HOURLY_VARS.join(","), daily: DAILY_VARS.join(","),
    timezone: "auto", forecast_days: "7", past_days: "0",
    cell_selection: "nearest", models: "best_match",
  });
  const r = await fetchT(`${API_URL}?${qs}`, { method: "GET" }, 25_000);
  if (!r.ok) throw new Error(`open-meteo http ${r.status}: ${(await r.text()).slice(0, 160)}`);
  const data = await r.json();
  const arr = Array.isArray(data) ? data : [data];
  return arr.map((x: Record<string, any>) => ({
    current: { ...x.current },
    hourly: { ...x.hourly },
    daily: { ...x.daily },
    meta: { via: "rest", latitude: x.latitude, longitude: x.longitude, elevation: x.elevation, utc_offset_s: x.utc_offset_seconds },
  }));
}

Deno.serve(async (req: Request) => {

  const secret = env("NEXUS_MATRIX_SECRET");
  if (!secret) return json(503, { ok: false, error: "vault sem NEXUS_MATRIX_SECRET" });
  const presented = req.headers.get("x-matrix-secret") ?? "";
  if (!presented || !safeEqual(presented, secret)) return json(401, { ok: false, error: "não autorizado" });

  const sb = createClient(env("SUPABASE_URL")!, env("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });

  // 1) catálogo data-driven de cidades (fail-closed: vazio → nada a fazer)
  const { data: cities, error: cityErr } = await sb
    .from("nexus_weather_cities").select("city_slug,label,lat,lon").eq("enabled", true);
  if (cityErr || !cities || cities.length === 0) {
    await telemetry(sb, { status: "fail_closed", message: `catálogo vazio/erro: ${String(cityErr ?? "-").slice(0, 120)}` });
    return json(200, { ok: true, cities: 0, note: "sem cidades habilitadas" });
  }
  const lats = cities.map((c) => c.lat), lons = cities.map((c) => c.lon);

  // 2) coleta dual-path: SDK openmeteo primeiro; falha → contingência REST
  let wx: WxCity[]; let via = "sdk"; let viaNote = "";
  try {
    wx = await viaSdk(lats, lons);
  } catch (sdkErr) {
    via = "rest"; viaNote = String(sdkErr instanceof Error ? sdkErr.message : sdkErr).slice(0, 140);
    await telemetry(sb, { status: "provider_degraded", items_total: cities.length, message: `sdk openmeteo falhou — contingência REST: ${viaNote}` });
    try {
      wx = await viaRest(lats, lons);
    } catch (restErr) {
      await telemetry(sb, { status: "error", items_total: cities.length, message: `open-meteo: ${String(restErr instanceof Error ? restErr.message : restErr).slice(0, 160)}` });
      return json(200, { ok: true, cities: cities.length, stored: 0, via, note: "open-meteo indisponível — fail-closed (telemetria registrada)" });
    }
  }

  // 3) persistência por cidade — cada item isolado (falha → skip, lote segue)
  let stored = 0;
  const perCity: Array<Record<string, unknown>> = [];
  for (let i = 0; i < cities.length; i++) {
    const city = cities[i], data = wx[i];
    if (!data) { perCity.push({ slug: city.city_slug, error: "sem resposta" }); continue; }
    try {
      const c = data.current, d = data.daily;
      const t = Number(c.temperature_2m), at = Number(c.apparent_temperature);
      const tmax = d.temperature_2m_max?.[0] as number | null ?? null;
      const tmin = d.temperature_2m_min?.[0] as number | null ?? null;
      const pp = d.precipitation_probability_max?.[0] as number | null ?? null;
      const uv = d.uv_index_max?.[0] as number | null ?? null;
      const summary = `${city.label}: ${Number.isFinite(t) ? t.toFixed(0) : "?"}°C (sensação ${Number.isFinite(at) ? at.toFixed(0) : "?"}°C), ${wmoPt(Number(c.weather_code))}` +
        `; hoje máx ${tmax != null ? tmax.toFixed(0) : "?"}°/mín ${tmin != null ? tmin.toFixed(0) : "?"}°` +
        `, chuva ${pp ?? 0}%, UV ${uv != null ? uv.toFixed(0) : "?"}`;
      const { error: insErr } = await sb.from("nexus_weather_snapshots").insert({
        city_slug: city.city_slug, summary, payload: data,
      });
      if (insErr) throw new Error(String(insErr).slice(0, 140));
      stored++;
      perCity.push({ slug: city.city_slug, summary });
    } catch (err) {
      await telemetry(sb, { status: "agent_error", items_total: 1, message: `${city.city_slug}: ${String(err instanceof Error ? err.message : err).slice(0, 140)}` });
      perCity.push({ slug: city.city_slug, error: String(err instanceof Error ? err.message : err).slice(0, 120) });
    }
  }

  try { await sb.rpc("nexus_weather_prune", { p_keep: 40 }); } catch { /* best-effort */ }
  await telemetry(sb, { status: stored === cities.length ? "ok" : "partial", items_total: cities.length, items_sent: stored, message: `open-meteo via=${via} · ${stored}/${cities.length} cidades` });

  return json(200, {
    ok: true, via, via_note: viaNote || undefined, cities: cities.length, stored,
    weather: perCity, duration_ms: Date.now() - t0,
  });
});
