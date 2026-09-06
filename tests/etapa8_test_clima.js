/* ETAPA 8.2 — teste real do public/js/clima.js sobre shim de DOM.
 * Cenários: 1) sucesso completo (vis+AQI+14 dias) 2) AQI falha 3) forecast falha
 * 4) visibilidade ausente 5) i18n fr/it. Falha com exit 1 em qualquer divergência.
 * Uso: node tests/etapa8_test_clima.js
 */
'use strict';
const fs = require('fs');
const path = require('path');

function makeDoc(boxAttrs) {
  const texts = [];
  function T(t) { return { nodeType: 3, text: String(t), get textContent() { return this.text; } }; }
  function E(tag) {
    const e = {
      nodeType: 1, tag, attrs: {}, kids: [],
      setAttribute(k, v) { this.attrs[k] = v; },
      getAttribute(k) { return this.attrs[k]; },
      appendChild(c) { this.kids.push(c); return c; },
      remove() { this.removed = true; },
      set textContent(v) { this.kids = [T(v)]; },
      get textContent() { return this.kids.map(k => k.textContent || '').join(''); },
      set innerHTML(v) { this.kids = (v === '') ? [] : [T('[html]')]; },
    };
    return e;
  }
  const box = E('div');
  for (const k of Object.keys(boxAttrs)) box.setAttribute(k, boxAttrs[k]);
  const doc = {
    _box: box,
    readyState: 'complete',
    createElement: E,
    createTextNode: T,
    querySelectorAll(sel) { return sel === '.p7-agora' ? [box] : []; },
    addEventListener() {},
  };
  return doc;
}

function forecast14() {
  const time = [], mx = [], mn = [], ps = [], pp = [], uv = [], sr = [], ss = [];
  for (let i = 0; i < 14; i++) {
    const d = '2026-09-' + String(6 + i).padStart(2, '0');
    time.push(d); mx.push(30 + i % 3); mn.push(20); ps.push(0); pp.push(10);
    uv.push(8); sr.push(d + 'T06:10'); ss.push(d + 'T18:20');
  }
  const ht = [], htt = [], hp = [];
  for (let i = 0; i < 12; i++) { ht.push('2026-09-06T' + String(i).padStart(2, '0') + ':00'); htt.push(25); hp.push(5); }
  return {
    current: { time: '2026-09-06T10:00', temperature_2m: 27.3, apparent_temperature: 29.1, relative_humidity_2m: 70, precipitation: 0, weather_code: 2, wind_speed_10m: 12, surface_pressure: 1012, cloud_cover: 40, visibility: 15000 },
    hourly: { time: ht, temperature_2m: htt, precipitation_probability: hp },
    daily: { time, temperature_2m_max: mx, temperature_2m_min: mn, precipitation_sum: ps, precipitation_probability_max: pp, uv_index_max: uv, sunrise: sr, sunset: ss },
    timezone: 'America/Sao_Paulo', elevation: 760,
  };
}
const AQ = { current: { us_aqi: 42, pm2_5: 8.2, pm10: 15.0 } };

async function runCase(name, boxAttrs, fetchImpl, asserts) {
  const doc = makeDoc(boxAttrs);
  const store = {};
  const sandbox = {
    document: doc, window: {}, sessionStorage: {
      getItem: k => (k in store ? store[k] : null),
      setItem: (k, v) => { store[k] = String(v); },
    },
  };
  sandbox.window = sandbox;
  sandbox.window.fetch = fetchImpl;
  // Sem AbortController no shim cobre o ramo ctl=null; CE2 cobre com mock abaixo.
  const code = fs.readFileSync(path.join(__dirname, '../public/js/clima.js'), 'utf8');
  const fetchShim = (...a) => fetchImpl(...a);
  sandbox.window.fetch = fetchShim; // o script checa `'fetch' in window`
  const g = new Function('document', 'window', 'sessionStorage', 'fetch', 'AbortController', code);
  g(doc, sandbox.window, sandbox.sessionStorage, fetchShim, undefined);
  await new Promise(r => setTimeout(r, 50));
  const txt = doc._box.textContent;
  let fails = 0;
  for (const [label, ok] of asserts(txt)) {
    if (!ok) { console.log(`  ✗ ${name}: ${label}`); fails++; }
  }
  if (!fails) console.log(`  ✓ ${name}`);
  return fails;
}

(async () => {
  let fails = 0;
  const okFetch = (url) => Promise.resolve({
    ok: true,
    json: () => Promise.resolve(String(url).includes('air-quality') ? AQ : forecast14()),
  });
  // 1. sucesso completo
  fails += await runCase('sucesso', { 'data-lat': '-23.5', 'data-lon': '-46.6', 'data-city': 'São Paulo', 'data-lang': 'pt' }, okFetch,
    (t) => [['temp', t.includes('27,3')], ['vis km', /1[45][,.\s]?0?\s?km/.test(t)], ['AQI', t.includes('AQI')], ['PM2.5', t.includes('PM2.5')], ['14 dias', t.includes('14 dias')], ['nascer', t.includes('06:10')]]);
  // 2. AQI falha -> resto ok, sem AQI
  const noAq = (url) => String(url).includes('air-quality') ? Promise.reject(new Error('boom')) : okFetch(url);
  fails += await runCase('aqi-falha', { 'data-lat': '-23.5', 'data-lon': '-46.6', 'data-city': 'X', 'data-lang': 'pt' }, noAq,
    (t) => [['temp ok', t.includes('27,3')], ['sem AQI', !t.includes('AQI')], ['14 dias', t.includes('14 dias')]]);
  // 3. forecast falha -> fallback
  const noFc = () => Promise.reject(new Error('down'));
  fails += await runCase('forecast-falha', { 'data-lat': '-23.5', 'data-lon': '-46.6', 'data-city': 'X', 'data-lang': 'pt' }, noFc,
    (t) => [['fallback', t.includes('indisponível')], ['link fonte', t.includes('Open-Meteo')]]);
  // 4. visibilidade ausente -> travessão, sem throw
  const noVis = (url) => Promise.resolve({ ok: true, json: () => {
    if (String(url).includes('air-quality')) return Promise.resolve(AQ);
    const d = forecast14(); delete d.current.visibility; return Promise.resolve(d);
  }});
  fails += await runCase('sem-vis', { 'data-lat': '0', 'data-lon': '0', 'data-city': 'Y', 'data-lang': 'pt' }, noVis,
    (t) => [['travessao', t.includes('—')], ['resto ok', t.includes('27,3')]]);
  // 5. i18n fr + it
  fails += await runCase('fr', { 'data-lat': '48.8', 'data-lon': '2.3', 'data-city': 'Paris', 'data-lang': 'fr' }, okFetch,
    (t) => [['Visibilité', t.includes('Visibilité')], ['14 prochains', t.includes('14 prochains jours')], ['AQI bon', t.includes('bon')]]);
  fails += await runCase('it', { 'data-lat': '41.9', 'data-lon': '12.5', 'data-city': 'Roma', 'data-lang': 'it' }, okFetch,
    (t) => [['Visibilità', t.includes('Visibilità')], ['14 giorni', t.includes('Prossimi 14 giorni')]]);
  console.log(fails === 0 ? 'RESULTADO: tudo passou ✅' : `RESULTADO: ${fails} FALHAS ❌`);
  process.exit(fails === 0 ? 0 : 1);
})();
