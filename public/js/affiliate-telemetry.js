/**
 * Achadinhos Global Telemetry & Affiliate SID Auto-Decorator (2026)
 * Automatically enriches outbound affiliate links with forensic telemetry:
 * - Browser Language (geo intent)
 * - Device Type (mobile / desktop / tablet)
 * - Referrer and Slot tracking
 */
(function() {
  'use strict';

  function getDeviceType() {
    const ua = navigator.userAgent || '';
    if (/mobile|iphone|ipod|android|blackberry|opera mini|iemobile/i.test(ua)) return 'mobile';
    if (/ipad|tablet|playbook|silk/i.test(ua)) return 'tablet';
    return 'desktop';
  }

  function getLanguage() {
    try {
      return (navigator.language || navigator.userLanguage || 'en').toLowerCase().substring(0, 2);
    } catch(e) {
      return 'en';
    }
  }

  function decorateAffiliateLinks() {
    const dev = getDeviceType();
    const lang = getLanguage();
    const links = document.querySelectorAll('a[href*="/api/ads/go"], a[href*="tkqlhce.com"], a[href*="jdoqocy.com"], a[href*="anrdoezrs.net"], a[href*="dpbolvw.net"], a[href*="kqzyfj.com"]');

    links.forEach(function(link) {
      try {
        const url = new URL(link.href, window.location.origin);
        if (!url.searchParams.has('geo')) {
          url.searchParams.set('geo', lang);
        }
        if (!url.searchParams.has('dev')) {
          url.searchParams.set('dev', dev);
        }
        link.href = url.toString();
      } catch (e) {}
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', decorateAffiliateLinks);
  } else {
    decorateAffiliateLinks();
  }
})();
