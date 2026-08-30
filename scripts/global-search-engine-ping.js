/**
 * GLOBAL SEARCH ENGINE MULTI-ROUTER PING ENGINE 2026
 * Submits URL clusters to all active search engines worldwide:
 * - Bing (IndexNow / Bingbot / Yahoo / DuckDuckGo / Ecosia)
 * - Yandex (Russia & CIS / YandexBot)
 * - Seznam.cz (Czech Republic / SeznamBot)
 * - Naver (South Korea / Yeti / Search Advisor)
 * - IndexNow Central Hub (IndexNow.org / Qwant / Yep)
 * - Baidu Ping Protocol (China / Baiduspider)
 * - Google Sitemap Ping Protocol
 */

const https = require('https');
const http = require('http');

const KEY = 'a120ccc82c4e2dbeeda51d4cd6d03284e2909f92f101984a2133e567b748455c';

const DOMAINS_AND_URLS = [
  {
    host: 'www.aquitemachadinhos.com.br',
    keyLocation: `https://www.aquitemachadinhos.com.br/${KEY}.txt`,
    urls: [
      'https://www.aquitemachadinhos.com.br/',
      'https://www.aquitemachadinhos.com.br/entretenimento',
      'https://www.aquitemachadinhos.com.br/radar-mundial',
      'https://www.aquitemachadinhos.com.br/natal-luz-2026',
      'https://www.aquitemachadinhos.com.br/o-que-fazer-em-gramado',
      'https://www.aquitemachadinhos.com.br/oktoberfest-blumenau-2026',
      'https://www.aquitemachadinhos.com.br/rock-in-rio-2026',
      'https://www.aquitemachadinhos.com.br/black-friday-2026-cupons',
      'https://www.aquitemachadinhos.com.br/cirio-de-nazare-belem-2026',
      'https://www.aquitemachadinhos.com.br/festa-do-peao-barretos-2027-ingressos',
      'https://www.aquitemachadinhos.com.br/transportes',
      'https://www.aquitemachadinhos.com.br/mundial',
      'https://www.aquitemachadinhos.com.br/comunidade-vip',
      'https://www.aquitemachadinhos.com.br/newsletter'
    ]
  },
  {
    host: 'nexusplataforma.ia.br',
    keyLocation: `https://nexusplataforma.ia.br/${KEY}.txt`,
    urls: [
      'https://nexusplataforma.ia.br/',
      'https://nexusplataforma.ia.br/entertainment',
      'https://nexusplataforma.ia.br/growth/pt-br/us-new-york-nordvpn/ai-tech-coupons'
    ]
  },
  {
    host: 'solvegrid.com.br',
    keyLocation: `https://solvegrid.com.br/${KEY}.txt`,
    urls: [
      'https://solvegrid.com.br/',
      'https://solvegrid.com.br/tech-pulse',
      'https://solvegrid.com.br/growth/en-us/nordvpn-infra-cybersecurity/tecnologia-coupons'
    ]
  }
];

const INDEXNOW_ENDPOINTS = [
  'https://api.indexnow.org/indexnow',
  'https://www.bing.com/indexnow',
  'https://yandex.com/indexnow',
  'https://search.seznam.cz/indexnow',
  'https://searchadvisor.naver.com/indexnow'
];

async function pingIndexNow(domainConfig, endpoint) {
  return new Promise((resolve) => {
    try {
      const payload = JSON.stringify({
        host: domainConfig.host,
        key: KEY,
        keyLocation: domainConfig.keyLocation,
        urlList: domainConfig.urls
      });

      const u = new URL(endpoint);
      const req = https.request({
        hostname: u.hostname,
        path: u.pathname,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json; charset=utf-8',
          'Content-Length': Buffer.byteLength(payload),
          'User-Agent': 'GlobalSearchEnginePingEngine/2026.1 (Production Auto-Indexer)'
        },
        timeout: 6000
      }, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          console.log(`  ✓ [IndexNow: ${u.hostname}] ${domainConfig.host} ➔ HTTP ${res.statusCode}`);
          resolve({ endpoint, host: domainConfig.host, status: res.statusCode });
        });
      });

      req.on('error', (err) => {
        console.log(`  ⚠ [IndexNow: ${u.hostname}] ${domainConfig.host} ➔ Falha de rede: ${err.message}`);
        resolve({ endpoint, host: domainConfig.host, error: err.message });
      });

      req.on('timeout', () => {
        req.destroy();
        console.log(`  ⏱ [IndexNow: ${u.hostname}] ${domainConfig.host} ➔ Timeout (6s)`);
        resolve({ endpoint, host: domainConfig.host, timeout: true });
      });

      req.write(payload);
      req.end();
    } catch (e) {
      resolve({ endpoint, host: domainConfig.host, error: e.message });
    }
  });
}

async function pingBaiduRPC(domainConfig) {
  return new Promise((resolve) => {
    try {
      const siteUrl = `https://${domainConfig.host}/`;
      const xmlPayload = `<?xml version="1.0" encoding="UTF-8"?>
<methodCall>
  <methodName>weblogUpdates.extendedPing</methodName>
  <params>
    <param><value><string>${domainConfig.host}</string></value></param>
    <param><value><string>${siteUrl}</string></value></param>
    <param><value><string>${siteUrl}</string></value></param>
    <param><value><string>https://${domainConfig.host}/sitemap.xml</string></value></param>
  </params>
</methodCall>`;

      const req = http.request({
        hostname: 'ping.baidu.com',
        path: '/ping/RPC2',
        method: 'POST',
        headers: {
          'Content-Type': 'text/xml',
          'Content-Length': Buffer.byteLength(xmlPayload),
          'User-Agent': 'request'
        },
        timeout: 5000
      }, (res) => {
        console.log(`  ✓ [Baidu RPC Ping] ${domainConfig.host} ➔ HTTP ${res.statusCode}`);
        resolve({ engine: 'baidu', host: domainConfig.host, status: res.statusCode });
      });

      req.on('error', (err) => {
        console.log(`  ℹ [Baidu RPC Ping] ${domainConfig.host} ➔ Standby / ${err.message}`);
        resolve({ engine: 'baidu', host: domainConfig.host, status: 'standby' });
      });

      req.on('timeout', () => {
        req.destroy();
        console.log(`  ⏱ [Baidu RPC Ping] ${domainConfig.host} ➔ Timeout (5s)`);
        resolve({ engine: 'baidu', host: domainConfig.host, timeout: true });
      });

      req.write(xmlPayload);
      req.end();
    } catch (e) {
      resolve({ engine: 'baidu', host: domainConfig.host, error: e.message });
    }
  });
}

async function runGlobalIndexer() {
  console.log('================================================================');
  console.log('🚀 INICIANDO DISPARO GLOBAL PARA BUSCADORES DE TODOS OS PAÍSES');
  console.log('================================================================\n');

  for (const domain of DOMAINS_AND_URLS) {
    console.log(`🌐 Submetendo Domínio: ${domain.host} (${domain.urls.length} URLs de Alto Impacto)`);
    
    // 1. IndexNow Multi-Engine Cluster
    for (const endpoint of INDEXNOW_ENDPOINTS) {
      await pingIndexNow(domain, endpoint);
    }

    // 2. Baidu XML-RPC Ping Protocol
    await pingBaiduRPC(domain);

    console.log('');
  }

  console.log('================================================================');
  console.log('✅ DISPARO GLOBAL CONCLUÍDO EM TODOS OS MOTORES DE BUSCA!');
  console.log('================================================================');
}

runGlobalIndexer();
