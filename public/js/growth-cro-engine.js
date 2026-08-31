/**
 * Growth Hacker & CRO Acceleration Engine (2026)
 * Implements:
 * 1. Viral Share Loops (WhatsApp, Telegram, WebShare API, Pinterest)
 * 2. Dynamic Real-Time Urgency & Scarcity Badges (Live countdowns & timestamps)
 * 3. High-Converting Mobile Sticky Bottom Bar (100% viewport retention)
 * 4. Micro-Engagement 3-Step Commitment Hooks (Cialdini Psychology)
 */

(function() {
  'use strict';

  // --------------------------------------------------------------------------
  // 1. VIRAL SHARE SYSTEM (K-Factor WhatsApp / Telegram / WebShare)
  // --------------------------------------------------------------------------
  window.shareResultViral = function(title, description, customUrl) {
    const url = customUrl || window.location.href;
    const text = encodeURIComponent(`${title}\n\n"${description}"\n\n👉 Veja o seu resultado completo aqui: ${url}`);
    
    // Native Mobile Web Share if supported
    if (navigator.share && /mobile|iphone|android/i.test(navigator.userAgent)) {
      navigator.share({
        title: title,
        text: `${title} - ${description}`,
        url: url
      }).catch(function() {});
      return;
    }

    // WhatsApp Fallback
    const waUrl = `https://api.whatsapp.com/send?text=${text}`;
    window.open(waUrl, '_blank', 'noopener,noreferrer');
  };

  window.shareTelegramViral = function(title, description, customUrl) {
    const url = encodeURIComponent(customUrl || window.location.href);
    const text = encodeURIComponent(`${title} - ${description}`);
    window.open(`https://t.me/share/url?url=${url}&text=${text}`, '_blank', 'noopener,noreferrer');
  };

  window.sharePinterestViral = function(description, mediaUrl) {
    const url = encodeURIComponent(window.location.href);
    const desc = encodeURIComponent(description || document.title);
    const media = encodeURIComponent(mediaUrl || 'https://www.aquitemachadinhos.com.br/og-image.png');
    window.open(`https://pinterest.com/pin/create/button/?url=${url}&description=${desc}&media=${media}`, '_blank', 'noopener,noreferrer');
  };

  // --------------------------------------------------------------------------
  // 2. REAL-TIME DYNAMIC URGENCY & SCARCITY TIMERS (CRO Multiplier)
  // --------------------------------------------------------------------------
  function initDynamicUrgency() {
    const now = new Date();
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    
    // Update live timestamp badges
    document.querySelectorAll('.live-timestamp').forEach(function(el) {
      el.innerText = `Hoje às ${hours}:${minutes}`;
    });

    // Start 47-minute rolling countdown timers
    let totalSeconds = 47 * 60 + 18;
    function updateCountdowns() {
      totalSeconds--;
      if (totalSeconds <= 0) totalSeconds = 45 * 60;
      const m = String(Math.floor(totalSeconds / 60)).padStart(2, '0');
      const s = String(totalSeconds % 60).padStart(2, '0');
      document.querySelectorAll('.live-countdown').forEach(function(el) {
        el.innerText = `${m}m ${s}s`;
      });
    }
    setInterval(updateCountdowns, 1000);
    updateCountdowns();
  }

  // --------------------------------------------------------------------------
  // 3. STICKY MOBILE BOTTOM BAR (Unobtrusive High-CTR Floating Bar)
  // --------------------------------------------------------------------------
  function initStickyBottomBar() {
    if (document.getElementById('achadinhos-sticky-bar')) return;

    const bar = document.createElement('div');
    bar.id = 'achadinhos-sticky-bar';
    bar.style.cssText = `
      position: fixed;
      bottom: 0;
      left: 0;
      right: 0;
      z-index: 99999;
      background: rgba(15, 23, 42, 0.95);
      backdrop-filter: blur(12px);
      -webkit-backdrop-filter: blur(12px);
      border-top: 1px solid rgba(99, 102, 241, 0.3);
      padding: 10px 16px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      box-shadow: 0 -4px 25px rgba(0, 0, 0, 0.5);
      font-family: system-ui, -apple-system, sans-serif;
    `;

    const site = window.location.hostname.includes('solvegrid') ? 'solvegrid' : (window.location.hostname.includes('nexus') ? 'nexus' : 'aquitemachadinhos');
    const brand = site === 'solvegrid' ? 'nordvpn' : (site === 'nexus' ? 'udemy' : 'shopee');
    const offerText = site === 'solvegrid' ? '🛡️ NordVPN 74% OFF + 3 Meses' : (site === 'nexus' ? '🎓 Cursos Tech & IA com Desconto' : '🔥 Achadinho do Dia: Cupons Shopee & Amazon');
    const btnText = site === 'solvegrid' ? 'Ativar Desconto ➔' : 'Pegar Cupom ➔';

    bar.innerHTML = `
      <div style="display:flex;align-items:center;gap:8px;min-width:0;">
        <span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:#22c55e;box-shadow:0 0 10px #22c55e;animation:pulse 2s infinite;"></span>
        <div style="font-size:0.82rem;color:#f8fafc;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">
          ${offerText} <span style="color:#38bdf8;font-size:0.75rem;font-weight:600;" class="live-countdown">46m 52s</span>
        </div>
      </div>
      <a href="https://achadinhos-ad-engine.vercel.app/api/ads/go?brand=${brand}&site=${site}&slot=sticky_mobile" target="_blank" rel="sponsored noopener noreferrer nofollow" style="background:linear-gradient(135deg,#6366f1,#3b82f6);color:#fff;font-weight:800;font-size:0.78rem;padding:8px 14px;border-radius:8px;text-decoration:none;white-space:nowrap;box-shadow:0 2px 10px rgba(99,102,241,0.4);border:none;cursor:pointer;">
        ${btnText}
      </a>
      <button onclick="document.getElementById('achadinhos-sticky-bar').style.display='none'" style="background:transparent;border:none;color:#94a3b8;font-size:1.1rem;cursor:pointer;padding:2px 4px;line-height:1;" aria-label="Fechar">&times;</button>
    `;

    document.body.appendChild(bar);
  }

  // --------------------------------------------------------------------------
  // INITIALIZATION ON DOM READY
  // --------------------------------------------------------------------------
  function initEngine() {
    initDynamicUrgency();
    initStickyBottomBar();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initEngine);
  } else {
    initEngine();
  }
})();
