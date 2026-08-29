import assert from 'assert';
import { sanitizeSlugSegment, buildCanonicalUrl, validateQualityGate } from '../lib/generate.mjs';
import { buildHreflangCluster } from '../lib/hreflang.mjs';
import { checkAffiliateCompliance } from '../lib/guardian.mjs';
import { injectDynamicSid, getDisclosures } from '../lib/monetize.mjs';
import { createPlan } from '../lib/plan.mjs';

console.log('--- Iniciando Self-Test do Growth Kit (10/10) ---');

// 1. Slug Sanitization
const slug = sanitizeSlugSegment('Como Configurar NordVPN no Roteador & TV - Guia Definitivo 2026', 72);
assert.ok(slug.length <= 72, 'Slug too long');
console.log('1. Slug Sanitization: PASS');

// 2. Canonical URL Build
const canonical = buildCanonicalUrl('https://nexusplataforma.ia.br', 'pt-br', 'us-new-york-nordvpn', 'ai-tech-coupons');
assert.strictEqual(canonical, 'https://nexusplataforma.ia.br/growth/pt-br/us-new-york-nordvpn/ai-tech-coupons');
console.log('2. Canonical URL Build: PASS');

// 3. Quality Gate
const qg = validateQualityGate({ title: 'Test', canonical: 'https://test.com', locale: 'pt-br', offers: [{ id: 1 }] });
assert.strictEqual(qg.passed, true);
console.log('3. Quality Gate: PASS');

// 4. Hreflang Cluster Nexus (16 locales)
const hrefNexus = buildHreflangCluster('https://nexusplataforma.ia.br', 'nexus', 'facet-1', 'format-1');
assert.strictEqual(Object.keys(hrefNexus).length, 17); // 16 + x-default
console.log('4. Hreflang Cluster Nexus: PASS (16 hreflang + x-default)');

// 5. Hreflang Cluster SolveGrid (7 locales)
const hrefSolveGrid = buildHreflangCluster('https://solvegrid.com.br', 'solvegrid', 'facet-1', 'format-1');
assert.strictEqual(Object.keys(hrefSolveGrid).length, 8); // 7 + x-default
console.log('5. Hreflang Cluster SolveGrid: PASS (7 hreflang + x-default)');

// 6. Guardian Affiliate Compliance
const guardClean = checkAffiliateCompliance({ text: 'safe content' });
assert.strictEqual(guardClean.clean, true);
console.log('6. Guardian Affiliate Compliance: PASS');

// 7. Guardian Forbidden PID Check
const guardProhibited = checkAffiliateCompliance({ text: 'prohibited 101143576' });
assert.strictEqual(guardProhibited.clean, false);
console.log('7. Guardian Forbidden PID Check: PASS');

// 8. Dynamic SID Injection
const sidUrl = injectDynamicSid('https://tkqlhce.com/click-8041957', 'nexus', 'rectangle');
assert.ok(sidUrl.includes('sid=nexus_rectangle'));
console.log('8. Dynamic SID Injection: PASS');

// 9. Multilingual Disclosures
const discPt = getDisclosures('pt-br');
const discEn = getDisclosures('en-us');
assert.ok(discPt.includes('afiliado') && discEn.includes('affiliate'));
console.log('9. Multilingual Disclosures: PASS');

// 10. Universe Planner
const plan = createPlan({ totalPages: 1000000, lotSize: 10000 });
assert.strictEqual(plan.totalLots, 100);
console.log('10. Universe Planner: PASS');

console.log('\n 10/10 Self-Test concluído com sucesso total!');
