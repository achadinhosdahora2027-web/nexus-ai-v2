// Teste da porta de política do affiliate-telemetry.js (roda em node, sem browser).
const fs = require('fs');
const path = require('path');
const FILE = process.argv[2] || require('path').join(__dirname,'..','public','js','affiliate-telemetry.js');
const src = fs.readFileSync(FILE, 'utf8');

function run(links, imgs, readyState) {
  const fired = [];
  const mk = (attrs) => ({ getAttribute: (k) => attrs[k] || null });
  const anchors = links.map((h) => mk({ href: h }));
  const images = imgs.map((s) => mk({ src: s }));
  const document = {
    readyState: readyState || 'complete',
    body: { appendChild() {} },
    getElementsByTagName: (t) => (t === 'a' ? anchors : t === 'img' ? images : []),
    querySelectorAll: () => [],
    addEventListener() {},
  };
  global.document = document;
  global.navigator = { language: 'pt-BR', userAgent: 'Mozilla/5.0', sendBeacon: () => true };
  global.window = { location: { hostname: 'www.exemplo.com.br', href: 'https://www.exemplo.com.br/' } };
  global.location = { hostname: 'www.exemplo.com.br' };
  global.Image = class {
    constructor() { this.style = {}; }
    set src(v) { fired.push(v); }
    get src() { return ''; }
    setAttribute() {}
  };
  global.fetch = () => Promise.reject(new Error('no'));
  new Function('require', 'module', 'exports', src + '\n//# sourceURL=telemetry')(require, { exports: {} }, {});
  return fired;
}

const PID = (src.match(/CJ_PID = '(\d+)'/) || [])[1];
if (!PID) { console.error('PID não encontrado no arquivo'); process.exit(2); }
const booking = '17288448', carla = '17075184';
const bl = `https://www.kqzyfj.com/click-${PID}-${booking}?sid=x`;
const cl = `https://www.tqlkg.com/click-${PID}-${carla}?sid=x`;
const px = `https://www.ftjcfx.com/image-${PID}-${booking}`;

let fail = 0;
function t(nome, got, want) {
  const ok = got === want;
  if (!ok) fail++;
  console.log(`${ok ? '✓' : '✗'} ${nome}: ${got} (esperado ${want})`);
}
t('página sem link de afiliado => 0 pixels', run([], []).length, 0);
t('só Booking na página => 1 pixel', run([bl], []).length, 1);
t('Booking + Carla => 2 pixels', run([bl, cl], []).length, 2);
t('pixel estático já presente => não duplica', run([bl], [px]).length, 0);
t('link de OUTRO PID não vale', run([`https://www.kqzyfj.com/click-99999999-${booking}`], []).length, 0);
t('DOM ainda loading => nada disparado antes do DOMContentLoaded', run([bl], [], 'loading').length, 0);
process.exit(fail ? 1 : 0);
