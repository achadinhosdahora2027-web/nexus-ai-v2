export function checkAffiliateCompliance(htmlOrObj) {
  const text = typeof htmlOrObj === 'string' ? htmlOrObj : JSON.stringify(htmlOrObj);
  const issues = [];
  
  // Forbidden PID checks (prevent leakage of prohibited publisher IDs)
  if (text.includes('101143576')) {
    issues.push('Found prohibited legacy PID 101143576');
  }

  // Ensure sponsored attribute on external links
  const hasAffiliate = text.includes('click-8041957') || text.includes('/api/ads/go') || text.includes('anrdoezrs.net') || text.includes('tkqlhce.com');
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
