import crypto from 'crypto';

export const QUALITY_GATE_RULES = [
  'has_title', 'has_meta_desc', 'has_canonical', 'has_hreflang',
  'valid_slug_length', 'has_json_ld', 'sponsored_rel_tags',
  'disclosure_present', 'no_404_canonical', 'valid_country_code',
  'valid_locale_syntax', 'no_duplicate_slug', 'schema_valid',
  'price_converted', 'preconnect_present', 'mobile_viewport',
  'clean_url_structure', 'robots_allow', 'affiliate_sid_injected',
  'content_min_length', 'no_forbidden_pids'
];

export function sanitizeSlugSegment(segment, maxLen = 72) {
  let clean = segment.toLowerCase().replace(/[^a-z0-9-_]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
  if (clean.length > maxLen) {
    const hash = crypto.createHash('sha256').update(clean).digest('hex').substring(0, 6);
    clean = clean.substring(0, maxLen - 7) + '-' + hash;
  }
  return clean;
}

export function buildCanonicalUrl(urlBase, locale, facet, format) {
  const cleanBase = urlBase.replace(/\/+$/, '');
  const cleanLocale = locale.toLowerCase().trim();
  const cleanFacet = sanitizeSlugSegment(facet);
  const cleanFormat = sanitizeSlugSegment(format);
  return `${cleanBase}/growth/${cleanLocale}/${cleanFacet}/${cleanFormat}`;
}

export function validateQualityGate(pageData) {
  const errors = [];
  if (!pageData.title) errors.push('Missing title');
  if (!pageData.canonical) errors.push('Missing canonical');
  if (!pageData.locale) errors.push('Missing locale');
  if (!pageData.offers || !Array.isArray(pageData.offers)) errors.push('Missing offers');
  return {
    passed: errors.length === 0,
    errors
  };
}
