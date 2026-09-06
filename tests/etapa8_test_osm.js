// Teste funcional painel-osm v2: jsdom + mock fetch Overpass.
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');
// uso: npm i jsdom && node tests/etapa8_test_osm.js  (dentro do repo)
const js = fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'painel-osm.js'), 'utf-8');

const N = (id, lat, lon, tags) => ({ type: 'node', id, lat, lon, tags });
const FIX = {
  hosp: [{ type: 'count', tags: { total: 5 } },
    N(1, -23.560, -46.640, { name: 'Hospital Central', amenity: 'hospital', phone: '+55 11 1111-1111', website: 'https://hcentral.ex', opening_hours: '24/7', 'addr:street': 'Rua A', 'addr:housenumber': '10', wheelchair: 'yes', email: 'a@h.ex' }),
    N(2, -23.551, -46.631, { name: 'UPA Norte', amenity: 'urgent_care', phone: '+55 11 2222-2222' }),
    N(3, -23.570, -46.650, { name: 'Consultório Sul', healthcare: 'doctor' }),
    N(4, -23.555, -46.635, { amenity: 'hospital' }),
    N(5, -23.545, -46.625, { name: 'PS Leste', amenity: 'clinic', emergency: 'emergency_ward_entrance', opening_hours: 'Mo-Fr 08:00-18:00' })],
  comida: [{ type: 'count', tags: { total: 2 } },
    N(11, -23.552, -46.632, { name: 'Pizza Verde', amenity: 'restaurant', cuisine: 'pizza;italian', 'diet:vegan': 'yes', takeaway: 'yes', delivery: 'no', website: 'https://verde.ex' }),
    N(12, -23.553, -46.633, { name: 'Café Ponto', amenity: 'cafe', cuisine: 'coffee_shop;cake', outdoor_seating: 'yes' })],
  hotel: [{ type: 'count', tags: { total: 1 } },
    N(21, -23.554, -46.634, { name: 'Hotel Luz', tourism: 'hotel', stars: '4', rooms: '120', fee: 'yes', 'diet:halal': 'only' })],
  relig: [{ type: 'count', tags: { total: 1 } },
    N(31, -23.556, -46.636, { name: 'Igreja Matriz', amenity: 'place_of_worship', religion: 'christian', denomination: 'catholic', wheelchair: 'limited' })],
};
let calls = [];
function mockFetch(url, opts) {
  calls.push(opts.body || '');
  const b = opts.body || '';
  const els = b.includes('urgent_care') ? FIX.hosp : b.includes('place_of_worship') && b.includes('religion') ? FIX.relig
    : /tourism.*hotel/.test(b) ? FIX.hotel : b.includes('cuisine') ? FIX.comida : FIX.hosp;
  return Promise.resolve({ ok: true, json: () => Promise.resolve({ elements: els }) });
}
const html = `<!DOCTYPE html><html><head></head><body>
<div class="p7-osm" data-lat="-23.55" data-lon="-46.63" data-r="9000" data-city="Teste" data-lang="pt">
<button class="p7tab" data-cat="hospital">H</button>
<button class="p7tab" data-cat="comida">C</button>
<button class="p7tab" data-cat="hoteis">Ho</button>
<button class="p7tab" data-cat="religiao">R</button>
<div class="p7out"></div></div>
<script>${js}</script></body></html>`;

const dom = new JSDOM(html, { runScripts: 'dangerously', url: 'https://x.test/' });
dom.window.fetch = mockFetch;
const d = dom.window.document;
let fails = 0;
const ok = (c, msg) => { console.log((c ? 'PASS' : 'FAIL') + ' ' + msg); if (!c) fails++; };
const names = () => [...d.querySelectorAll('.p7out ul li')].map(li => (li.querySelector('strong, a') || {}).textContent);
const wait = (ms) => new Promise(r => setTimeout(r, ms));
const click = (sel) => d.querySelector(sel).dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }));

(async () => {
  await wait(300); // init + fetch hospital
  ok(calls.length === 1, `1 fetch inicial (n=${calls.length})`);
  ok(JSON.stringify(names()) === JSON.stringify(['UPA Norte', 'PS Leste', 'Hospital Central', 'Consultório Sul']),
    'ordem distância: ' + JSON.stringify(names()));
  const cab = d.querySelector('.p7out p').textContent;
  ok(/2 com telefone/.test(cab) && /1 com site/.test(cab) && /2 com horário/.test(cab), 'auditoria: ' + cab.slice(0, 120));
  ok(d.querySelectorAll('[data-chip]').length === 4, 'chips hospital = 4 (todos+3)');
  ok((d.querySelector('.p7out').innerHTML.match(/24 h/g) || []).length === 1, 'badge 24h ×1');
  ok(!!d.querySelector('a[href^="mailto:"]'), 'link mailto');
  ok(!/sponsored/.test(d.querySelector('.p7out').innerHTML), 'sem rel=sponsored');
  ok(/noopener nofollow/.test(d.querySelector('.p7out').innerHTML), 'com nofollow');
  click('[data-chip="urg"]'); await wait(50);
  ok(JSON.stringify(names()) === JSON.stringify(['UPA Norte', 'PS Leste']), 'chip urg filtra: ' + JSON.stringify(names()));
  ok(calls.length === 1, 'chip não refetcha');
  click('[data-chip="todos"]'); await wait(50);
  ok(names().length === 4, 'todos restaura 4 (sem-nome fora)');
  click('[data-ord="ficha"]'); await wait(50);
  ok(names()[0] === 'Hospital Central', 'ficha completa 1º: ' + names()[0]);
  click('[data-ord="dist"]'); await wait(50);
  ok(names()[0] === 'UPA Norte', 'distância volta: ' + names()[0]);
  // aba comida
  click('.p7tab[data-cat="comida"]'); await wait(150);
  ok(calls.length === 2, 'fetch aba comida');
  const out = d.querySelector('.p7out').textContent;
  ok(/🌱 vegano/.test(out) && /🥡 para viagem/.test(out), 'diet + takeaway');
  ok(/pizza, italian/.test(out), 'cuisine limpa (sem _)');
  ok(/☀️ área externa/.test(out), 'outdoor');
  ok(d.querySelectorAll('[data-chip]').length === 6, 'chips comida = 6');
  click('[data-chip="veg"]'); await wait(50);
  ok(JSON.stringify(names()) === JSON.stringify(['Pizza Verde']), 'chip veg');
  click('[data-chip="cafe"]'); await wait(50);
  ok(JSON.stringify(names()) === JSON.stringify(['Café Ponto']), 'chip cafe');
  // aba hoteis
  click('.p7tab[data-cat="hoteis"]'); await wait(150);
  const oh = d.querySelector('.p7out').textContent;
  ok(/★★★★ \(4 estrelas\)/.test(oh), 'stars ★★★★');
  ok(/120 quartos/.test(oh) && /🎟️ pago/.test(oh) && /halal/.test(oh), 'rooms + fee + halal');
  // aba religiao
  click('.p7tab[data-cat="religiao"]'); await wait(150);
  const orr = d.querySelector('.p7out').textContent;
  ok(/denominação: catholic/.test(orr) && /acessibilidade: parcial/.test(orr), 'denomination + wheelchair traduzido');
  // cache: revisitar hospital não refetcha
  const n0 = calls.length;
  click('.p7tab[data-cat="hospital"]'); await wait(150);
  ok(calls.length === n0, 'cache hit sem refetch');
  const keys = Object.keys(dom.window.localStorage);
  ok(keys.length === 4 && keys.every(k => k.indexOf('p7osm2:') === 0), 'cache p7osm2 ×4: ' + keys.length);
  // estado por aba preservado
  ok(d.querySelector('[data-chip="urg"]') && names().length === 4, 'revisit preserva filtro todos');
  console.log(fails ? `\n${fails} FALHAS` : '\nTODOS PASS');
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error('ERRO', e); process.exit(2); });
