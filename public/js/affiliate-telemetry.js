/**
 * ==============================================================================
 * ACHADINHOS FORENSIC TELEMETRY, CJ PIXEL BEACON & SID AUTO-DECORATOR 2026
 * Managed by: CQO (Auditoria Forense) & CTO (Engenharia de Software)
 * ==============================================================================
 * 1. CJ Impression Beacon com porta de política (PID: 101870639): só dispara quando o
 *    criativo daquele anunciante está servido na página (zero impressão fantasma) e
 *    exatamente uma vez por pageview (não duplica o pixel estático do watchdog).
 * 2. Auto-decorates all outbound affiliate links with forensic telemetry (SID, Geo, Device).
 * 3. Real-time Pageview Beacon to /api/telemetry/collect.
 */

(function() {
  'use strict';

  const CJ_PID = '101870639'; // PID do site (Promotional Property). CID 8041957 NÃO é PID.
  // Política (Etapa 6): impressão = criativo daquele anunciante presente na página.
  const CJ_PIXELS = [
    { host: 'ftjcfx.com', linkId: '17288448', note: 'Booking.com' },
    { host: 'tqlkg.com', linkId: '17075184', note: 'Carla Car Rental' }
  ];

  // 1. CJ IMPRESSION BEACON — com porta de política: só dispara com o criativo na página
  function pageHasCjCreative(linkId) {
    try {
      const needle = '/click-' + CJ_PID + '-' + linkId;
      const as = document.getElementsByTagName('a');
      for (let i = 0; i < as.length; i++) {
        const h = as[i].getAttribute('href') || '';
        if (h.indexOf(needle) !== -1) return true;
      }
      return false;
    } catch (e) {
      return false;
    }
  }

  function staticPixelAlreadyFired(linkId) {
    try {
      const needle = 'image-' + CJ_PID + '-' + linkId;
      const imgs = document.getElementsByTagName('img');
      for (let i = 0; i < imgs.length; i++) {
        if ((imgs[i].getAttribute('src') || '').indexOf(needle) !== -1) return true;
      }
      return false;
    } catch (e) {
      return false;
    }
  }

  function fireCjImpressionBeacons() {
    CJ_PIXELS.forEach(function (pixel) {
      try {
        // sem criativo servido na página => nenhuma impressão reportada à CJ
        if (!pageHasCjCreative(pixel.linkId)) return;
        // pixel estático já presente (injetado pelo watchdog) => não contar o pageview 2x
        if (staticPixelAlreadyFired(pixel.linkId)) return;
        const img = new Image(1, 1);
        img.src = `https://www.${pixel.host}/image-${CJ_PID}-${pixel.linkId}?_ts=${Date.now()}`;
        img.style.position = 'fixed';
        img.style.top = '0';
        img.style.left = '0';
        img.style.width = '1px';
        img.style.height = '1px';
        img.style.opacity = '0.001';
        img.style.pointerEvents = 'none';
        img.setAttribute('aria-hidden', 'true');
        if (document.body) {
          document.body.appendChild(img);
        }
      } catch (e) {}
    });
  }

  function getDeviceType() {
    const ua = navigator.userAgent || '';
    if (/mobile|iphone|ipod|android|blackberry|opera mini|iemobile/i.test(ua)) return 'mobile';
    if (/ipad|tablet|playbook|silk/i.test(ua)) return 'tablet';
    return 'desktop';
  }

  function getLanguage() {
    try {
      return (navigator.language || navigator.userLanguage || 'pt').toLowerCase().substring(0, 2);
    } catch(e) {
      return 'pt';
    }
  }

  // 2. REAL-TIME TELEMETRY BEACON
  function sendPageviewBeacon() {
    try {
      const payload = JSON.stringify({
        type: 'pageview',
        path: window.location.pathname,
        geo: getLanguage(),
        dev: getDeviceType(),
        ref: document.referrer || '',
        cj_pid: CJ_PID
      });

      // Rota /api/telemetry/collect so existe em www.aquitemachadinhos.com.br (nexus/solvegrid: 404).
      if (!/aquitemachadinhos\.com\.br$/.test(window.location.hostname)) return;
      if (navigator.sendBeacon) {
        navigator.sendBeacon('/api/telemetry/collect', payload);
      } else {
        fetch('/api/telemetry/collect', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: payload,
          keepalive: true
        }).catch(function() {});
      }
    } catch(e) {}
  }

  // 3. OUTBOUND AFFILIATE SID AUTO-DECORATION
  function decorateAffiliateLinks() {
    const dev = getDeviceType();
    const lang = getLanguage();
    const links = document.querySelectorAll('a[href*="/api/ads/go"], a[href*="tkqlhce.com"], a[href*="jdoqocy.com"], a[href*="anrdoezrs.net"], a[href*="dpbolvw.net"], a[href*="kqzyfj.com"], a[href*="shopee.com"], a[href*="meli.la"], a[href*="amazon.com"]');

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

  // Execução: o pageview é imediato; a impressão só depois do DOM lido (é quando se sabe
  // quais criativos foram servidos) e exatamente uma vez por pageview.
  let impressionFired = false;
  function fireOnce() {
    if (impressionFired) return;
    impressionFired = true;
    fireCjImpressionBeacons();
  }
  sendPageviewBeacon();
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () {
      fireOnce();
      decorateAffiliateLinks();
    }, { once: true });
  } else {
    fireOnce();
    decorateAffiliateLinks();
  }
})();
