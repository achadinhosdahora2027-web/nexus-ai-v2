#!/usr/bin/env node
/**
 * ==============================================================================
 * CANÁRIO DE AFILIADOS  (Etapa 6) — scripts/affiliate-health-check.js
 * ==============================================================================
 * Auditoria determinística da monetização deste repositório. Roda no CI e local.
 * Zero dependências externas (node >= 18).
 *
 *   node scripts/affiliate-health-check.js
 *   CHECK_LIVE=1 node scripts/affiliate-health-check.js     # + produção real
 *   node scripts/affiliate-health-check.js --max 40         # mais exemplos
 *
 * Sai com código 1 quando existe falha FATAL, para o workflow ficar vermelho
 * (os `|| true` que escondiam este passo foram removidos dos workflows).
 * ==============================================================================
 */
const fs = require('fs');
const path = require('path');
const https = require('https');

const SITE = 'nexus';
const HOST = 'https://nexusplataforma.ia.br';
const PID = '101870639';
const ABBR = 'nx';
const SID_PREFIX = 'nexus-ai-v2';   // prefixo real usado nos sid/`site=` deste site
const SIBLING_PIDS = ['101870640', '101870639', '101859672'].filter((p) => p !== PID);
const LEGACY_CID = '8041957';
const PUB = path.join(__dirname, '..', 'public');
const CHECK_LIVE = process.env.CHECK_LIVE === '1';
const MAX_EX = (() => { const i = process.argv.indexOf('--max'); return i > 0 && process.argv[i + 1] ? parseInt(process.argv[i + 1], 10) : 12; })();

const REDES = [
  ['CJ', /https:\/\/www\.(?:kqzyfj|jdoqocy|anrdoezrs|dpbolvw|openstat)\.com\/click-\d+/i],
  ['Awin', /https:\/\/www\.awin1\.com\/cread\.php\?/i],
  ['Admitad', /https:\/\/[a-z0-9.-]+\/g\/[a-z0-9]{8,40}(?:\/|[?&]|$)/i], // encurtadores da rede
  ['Lomadee', /https:\/\/lmdee\.link\//i],
  ['Shopee', /https:\/\/s\.shopee\.com\.br\//i],
  ['MercadoLivre', /https:\/\/meli\.la\//i],
];
const isAff = (href) => REDES.some(([, rx]) => rx.test(href));

const fatal = [];
const warn = [];
const oklog = [];
const ex = [];
const stat = {};

const walk = (dir, keep) => {
  const out = [];
  if (!fs.existsSync(dir)) return out;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...walk(p, keep));
    else if (keep(p)) out.push(p);
  }
  return out;
};
const rel = (p) => path.relative(PUB, p).replace(/\\/g, '/');
const isHtml = (p) => p.endsWith('.html');
const note = (m) => { if (ex.length < MAX_EX) ex.push(m); };

function fetchStatus(url) {
  return new Promise((resolve) => {
    const req = https.get(url, { headers: { 'User-Agent': 'Mozilla/5.0 (compatible; AquiTemCanary/1.0)', Accept: '*/*' }, timeout: 20000 },
      (res) => { res.resume(); resolve({ status: res.statusCode, loc: res.headers.location || '' }); });
    req.on('error', (e) => resolve({ status: 0, err: String(e.message || e).slice(0, 70) }));
    req.on('timeout', () => { req.destroy(); resolve({ status: 0, err: 'timeout' }); });
  });
}

function auditarArquivos() {
  const files = walk(PUB, isHtml);
  const cityFiles = files.filter((f) => /^[a-z]{2}\/[^/]+\.html$/.test(rel(f)));
  const tagFiles = files.filter((f) => rel(f).startsWith('tags/'));
  const alvo = cityFiles.concat(tagFiles);
  if (!cityFiles.length) fatal.push('nenhum public/[cc]/*.html encontrado');
  stat.paginas_html = files.length;
  stat.paginas_cidade = cityFiles.length;
  stat.paginas_tags = tagFiles.length;

  const b = { geoOfertas: 0, geoMulti: 0, atracoes: 0, langBox: 0, noindex: 0, noindexComBloco: 0 };
  const redes = {};
  const a = { semRel: 0, semSponsored: 0, sidFora: 0, awinSemClickref: 0, admitadSemSubid: 0, semDivulgacao: 0, descDuplicada: 0 };
  const descs = new Map();

  for (const f of alvo) {
    const s = fs.readFileSync(f, 'utf8');
    const r = rel(f);
    const noindex = /name="robots" content="[^"]*noindex/.test(s);
    if (noindex) b.noindex++;
    if (s.includes('<!-- geo-offers -->')) b.geoOfertas++;
    if (s.includes('<!-- geo-multi -->')) {
      b.geoMulti++;
      if (noindex) b.noindexComBloco++;
      if (!/(parceiros|partner|partenaires)[^<]{0,40}(verificad|verificat|vérifi|verifi)/i.test(s)) { a.semDivulgacao++; note(`${r}: bloco multi-rede sem texto de divulgação`); }
    }
    if (s.includes('<!-- city-attractions -->')) {
      b.atracoes++;

      if (!/<ol class="attrlist"><li>/.test(s)) { fatal.push(`${r}: <!-- city-attractions --> sem <ol class="attrlist"> preenchido`); }
      const itens = (s.match(/<ol class="attrlist">(.*?)<\/ol>/s) || ['', ''])[1].split('<li>').length - 1;
      if (itens < 3) warn.push(`${r}: lista curta (${itens} atração(ões) reais — sem inventar preenchimento)`);
    }
    if (s.includes('<!-- visitor-langs -->') && !/<table[^>]*><thead>/.test(s)) fatal.push(`${r}: langbox sem tabela`);
    if (s.includes('<!-- visitor-langs -->')) b.langBox++;

    // todo link de afiliado precisa de rel com sponsored + nofollow, e sid no padrão
    for (const tag of s.match(/<a\b[^>]*>/g) || []) {
      let href = (tag.match(/href="([^"]*)"/) || [])[1] || '';
      href = href.replace(/&amp;/g, '&').replace(/&#38;/g, '&');
      if (!isAff(href)) continue;
      const rede = (REDES.find(([, rx]) => rx.test(href)) || ['?'])[0];
      redes[rede] = (redes[rede] || 0) + 1;
      const relAttr = (tag.match(/rel="([^"]*)"/) || [])[1] || '';
      if (!/\bnofollow\b/.test(relAttr)) { a.semRel++; note(`${r}: <a ${rede}> sem nofollow`); }
      if (!/\bsponsored\b/.test(relAttr)) { a.semSponsored++; }
      if (rede === 'CJ') {
        const sid = decodeURIComponent((href.match(/[?&]sid=([^&]+)/) || [])[1] || '');
        if (!new RegExp(`^(${ABBR}|${SID_PREFIX})_[a-z]{2}_[a-z0-9._-]+$`).test(sid)) { a.sidFora++; note(`${r}: sid "${sid || '(ausente)'}" fora do padrão (${ABBR}|${SID_PREFIX})_cc_slug`); }
      }
      if (rede === 'Awin' && !/[?&]clickref=/.test(href)) { a.awinSemClickref++; note(`${r}: Awin sem clickref (perde o sub-id por cidade)`); }
      if (rede === 'Admitad' && !/[?&]subid=/.test(href)) { a.admitadSemSubid++; note(`${r}: Admitad sem subid (perde o rastreio por cidade)`); }
      if (/image-\d+-/.test(href)) a.semRel += 0;
    }

    if (/(^|[^A-Za-z])8041957/.test(s)) fatal.push(`${r}: CID legado 8041957 presente`);
    for (const other of SIBLING_PIDS) if (s.includes(`click-${other}-`) || s.includes(`image-${other}-`)) fatal.push(`${r}: PID de OUTRO site (${other})`);
    if (s.includes('image-') && /image-\d+-\d+/.test(s) && !s.includes(`image-${PID}-`)) fatal.push(`${r}: pixel CJ com PID errado (esperado ${PID})`);
    if (/<!-- geo-multi -->/.test(s) && !/target="_blank"/.test(s)) warn.push(`${r}: bloco de ofertas sem target=_blank`);
    if (/<!-- ld-attractions -->/.test(s)) {
      const j = (s.match(/<!-- ld-attractions --><script type="application\/ld\+json">([\s\S]*?)<\/script>/) || [])[1];
      try {
        const d = JSON.parse(j);
        if (!Array.isArray(d.itemListElement) || !d.itemListElement.length) fatal.push(`${r}: ItemList JSON-LD sem itens`);
      }
      catch (e) { fatal.push(`${r}: JSON-LD de atrações inválido (${String(e.message).slice(0, 50)})`); }
    }
    const dm = noindex ? null : (s.match(/<meta name="description" content="([^"]*)"/) || [])[1];
    if (dm) {
      const k = dm.trim();
      if (descs.has(k)) { a.descDuplicada++; note(`${r}: description igual à de ${descs.get(k)}`); } else descs.set(k, r);
    }
  }

  stat.redes = redes;
  stat.blocos = b;
  stat.anomalias = a;
  const base = Math.max(1, alvo.length - b.noindex);
  const pc = (n) => Math.round((n / base) * 100);
  const cOf = pc(b.geoOfertas); const cMul = pc(b.geoMulti); const cAtr = pc(b.atracoes);
  if (cOf < 95) fatal.push(`cobertura geo-offers ${cOf}% (<95%)`); else oklog.push(`geo-offers em ${cOf}% das páginas indexáveis`);
  if (cMul < 95) fatal.push(`cobertura geo-multi ${cMul}% (<95%)`); else oklog.push(`geo-multi em ${cMul}% das páginas indexáveis`);
  stat.cobertura_atracoes_pct = cAtr;
  if (b.noindexComBloco) warn.push(`${b.noindexComBloco} páginas noindex tocadas (deveriam ser puladas)`);
  if (a.semRel) fatal.push(`${a.semRel} links de afiliado sem rel nofollow`);
  if (a.semSponsored) fatal.push(`${a.semSponsored} links de afiliado sem rel sponsored`);
  if (a.sidFora) fatal.push(`${a.sidFora} links CJ com sid fora do padrão`);
  if (a.awinSemClickref) fatal.push(`${a.awinSemClickref} links Awin sem clickref`);
  if (a.semDivulgacao) fatal.push(`${a.semDivulgacao} blocos sem divulgação de vínculo de afiliado`);
  if (a.descDuplicada) fatal.push(`${a.descDuplicada} descrições duplicadas entre páginas`);
  if (a.admitadSemSubid) warn.push(`${a.admitadSemSubid} links Admitad sem subid`);
  return { files, cityFiles };
}

function auditarSuporte() {
  for (const need of ['ads.txt', 'robots.txt', '404.html', 'sitemap.xml', 'js/affiliate-telemetry.js']) {
    if (!fs.existsSync(path.join(PUB, need))) fatal.push(`falta public/${need}`);
  }
  const rp = path.join(PUB, 'robots.txt');
  if (fs.existsSync(rp)) {
    const t = fs.readFileSync(rp, 'utf8');
    if (!/Sitemap:\s*https/i.test(t)) warn.push('robots.txt sem linha Sitemap:');
    if (!/Disallow: \/\*\?\*sid=/.test(t)) warn.push('robots.txt sem o Disallow de ?sid=');
  }
  const tp = path.join(PUB, 'js/affiliate-telemetry.js');
  if (fs.existsSync(tp)) {
    const t = fs.readFileSync(tp, 'utf8');
    if (t.includes('CJ_PIXELS') && !t.includes('pageHasCjCreative'))
      fatal.push('affiliate-telemetry.js dispara pixel de impressão sem a porta de política (impressão fantasma => risco de suspensão na CJ)');
    else if (t.includes('pageHasCjCreative')) oklog.push('telemetry com porta de política de impressão');
    if (t.includes(`image-${LEGACY_CID}`)) fatal.push('telemetry aponta pixel para o CID legado');
  }
  const fnDir = path.join(__dirname, '..', 'functions');
  const yxHtml = walk(PUB, (p) => /yandex_[0-9a-f]{16}\.html$/.test(rel(p)));
  const fnJs = fs.existsSync(fnDir) ? fs.readdirSync(fnDir).filter((f) => f.startsWith('yandex_')) : [];
  if (yxHtml.length && !fnJs.length) fatal.push(`existem ${yxHtml.length} páginas yandex_*.html mas não há functions/yandex_*.js -> 308 em produção`);
  else if (fnJs.length) oklog.push(`functions/ com ${fnJs.length} arquivo(s) de verificação Yandex`);
  const sm = walk(PUB, (p) => /^sitemap[\w-]*\.xml$/.test(rel(p)));
  for (const f of sm) {
    const xml = fs.readFileSync(f, 'utf8');
    const locs = [...xml.matchAll(/<loc>https?:\/\/[^/]+(\/[^<\s]*)<\/loc>/g)].map((m) => m[1]);
    let falta = 0;
    for (const u of locs) {
      const clean = u.replace(/\/+$/, '') || '/index';
      const cand = /\.(xml|txt|json|js|css)$/i.test(clean)
        ? [path.join(PUB, clean)]
        : [path.join(PUB, clean + '.html'), path.join(PUB, clean, 'index.html')];
      if (!cand.some((c) => fs.existsSync(c))) { falta++; note(`${rel(f)} aponta para ${u}, inexistente em public/`); }
    }
    if (falta) fatal.push(`${rel(f)}: ${falta}/${locs.length} URLs do sitemap sem arquivo`);
    else oklog.push(`${rel(f)}: ${locs.length} URLs batem com o disco`);
    stat.sitemaps = Object.assign(stat.sitemaps || {}, { [rel(f)]: locs.length });
  }
}

async function live(cityFiles) {
  const alvos = [['/', 200], [`/pag-nao-existe-canario-${Date.now()}`, 404]];
  const yx = walk(PUB, (p) => /yandex_[0-9a-f]{16}\.html$/.test(rel(p)));
  if (yx.length) alvos.push(['/' + rel(yx[0]), 200]);
  const am = cityFiles.filter((f) => /^br\//.test(rel(f))).slice(0, 3).concat(cityFiles.slice(-2));
  for (const f of am) alvos.push(['/' + rel(f).replace(/\.html$/, ''), 200]);
  for (const [u, esperado] of alvos) {
    const r = await fetchStatus(HOST + u);
    if (r.status === esperado) oklog.push(`live ${u}: ${r.status}`);
    else if ((r.status === 301 || r.status === 308) && r.loc && r.loc.includes(HOST.replace(/^https?:\/\//, ''))) warn.push(`live ${u}: ${r.status} -> ${r.loc}`);
    else fatal.push(`live ${u}: HTTP ${r.status}${r.err ? ' ' + r.err : ''} (esperado ${esperado})`);
  }
}

async function main() {
  const { cityFiles } = auditarArquivos();
  auditarSuporte();
  if (CHECK_LIVE) { try { await live(cityFiles); } catch (e) { warn.push('checagem live falhou: ' + String(e.message).slice(0, 80)); } }
  const rep = { site: SITE, pid: PID, host: HOST, quando: new Date().toISOString(), stat, ok: oklog, warn, fatal, exemplos: ex };
  try {
    const outDir = path.join(__dirname, '..', 'out');
    fs.mkdirSync(outDir, { recursive: true });
    fs.writeFileSync(path.join(outDir, 'affiliate-health-check.json'), JSON.stringify(rep, null, 2));
  } catch (e) { /* read-only FS em alguns runners */ }
  console.log(`\n===== CANÁRIO DE AFILIADOS — ${SITE} (PID ${PID}) =====`);
  console.log('páginas:', stat.paginas_html, '(cidade', stat.paginas_cidade + ', tags', stat.paginas_tags + ')');
  console.log('blocos :', JSON.stringify(stat.blocos));
  console.log('redes  :', JSON.stringify(stat.redes), '| cobertura atrações:', stat.cobertura_atracoes_pct + '%');
  console.log('anomalias:', JSON.stringify(stat.anomalias));
  for (const o of oklog) console.log('  ✓', o);
  for (const w of warn) console.log('  ⚠', w);
  for (const e of ex) console.log('  ·', e);
  if (fatal.length) {
    console.log('\nFALHAS FATAIS:');
    for (const f of fatal.slice(0, 40)) console.log('  ✗', f);
    console.log(`\nRESULTADO: FALHOU (${fatal.length} fatal, ${warn.length} alerta)`);
    process.exit(1);
  }
  console.log(`\nRESULTADO: OK (${warn.length} alerta(s))`);
}

main().catch((e) => { console.error('canário quebrou:', e && (e.stack || e.message)); process.exit(2); });
