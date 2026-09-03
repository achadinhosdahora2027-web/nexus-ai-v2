export function checkAffiliateCompliance(htmlOrObj) {
  const text = typeof htmlOrObj === 'string' ? htmlOrObj : JSON.stringify(htmlOrObj);
  const issues = [];
  
  // Forbidden PID checks (prevent leakage of prohibited publisher IDs)
  if (text.includes('101143576')) {
    issues.push('Found prohibited legacy PID 101143576');
  }
  // CID 8041957 é a EMPRESA, nunca um PID: click-8041957-* / image-8041957-* creditam cliques fora da conta
  if (/(click|image)-8041957-/.test(text)) {
    issues.push('CID 8041957 used as PID in CJ link/pixel (must be 101859672 / 101870639 / 101870640)');
  }
  // Link IDs inventados (auditoria 03/09/2026) — nunca existiram nos programas joined
  const FAKE_CJ_LINK_IDS = ['12884704','13936081','14068571','14298102','13892019','15243102','14298109','14318721','14092819','13892711','15102938','15609182','15392810','15182903','14920194','15201928','13768291'];
  const fake = FAKE_CJ_LINK_IDS.filter((id) => new RegExp('click-\\d+-' + id + '\\b').test(text));
  if (fake.length) {
    issues.push('Fake CJ link IDs found: ' + fake.join(','));
  }

  // Ensure sponsored attribute on external links
  const hasAffiliate = /click-\d{7,9}-\d+/.test(text) || text.includes('/api/ads/go') || text.includes('anrdoezrs.net') || text.includes('tkqlhce.com');
  if (hasAffiliate) {
    if (typeof htmlOrObj === 'string' && !htmlOrObj.includes('rel="sponsored')) {
      issues.push('Affiliate links must include rel="sponsored"');
    }
  }

  return {
    clean: issues.length === 0,
    issues
  };
}
