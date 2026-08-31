/**
 * ==============================================================================
 * MULTI-LANGUAGE INSTAGRAM & SOCIAL AI CONTENT ENGINE 2026 (195 COUNTRIES)
 * Generates daily localized visual cards (1080x1080 SVG), captions, and ManyChat
 * keyword triggers across 6 major global languages (PT, EN, ES, FR, DE, JA).
 * ==============================================================================
 */

const fs = require('fs');
const path = require('path');

const QUEUE_DIR = path.join(__dirname, '../public/instagram-queue');
const DOMAIN = 'https://www.aquitemachadinhos.com.br';
const TODAY = new Date().toISOString().split('T')[0];

if (!fs.existsSync(QUEUE_DIR)) fs.mkdirSync(QUEUE_DIR, { recursive: true });

const GLOBAL_CAMPAIGNS = [
  {
    lang: "pt-BR",
    flag: "🇧🇷",
    trigger: "TAROT",
    headline: "O Sol (XIX): Revelação do Dia!",
    badge: "🔮 PREVISÃO & ORÁCULO 2026",
    sub: "Clareza mental, prosperidade e cupom desbloqueado.",
    caption: `✨ SUA CARTA DO DIA: O SOL (XIX) ✨\n\nA energia solar ilumina caminhos e traz vitórias imediatas!\n\n👇 Comente "TAROT" para receber a tiragem no seu Direct! 💬`,
    bg: ["#1e1b4b", "#4338ca", "#0f172a"],
    accent: "#fbbf24",
    link: `${DOMAIN}/entretenimento.html#tarot`
  },
  {
    lang: "en-US",
    flag: "🇺🇸",
    trigger: "ORACLE",
    headline: "The Sun (XIX): Daily Guidance!",
    badge: "🔮 3D TAROT & COSMIC ORACLE",
    sub: "Mental clarity, abundance, and VIP travel perks unlocked.",
    caption: `✨ YOUR DAILY TAROT CARD: THE SUN (XIX) ✨\n\nRadiant vitality and new opportunities await you today!\n\n👇 Comment "ORACLE" to get your personalized reading in DM! 💬`,
    bg: ["#0f172a", "#1e293b", "#334155"],
    accent: "#38bdf8",
    link: `${DOMAIN}/entretenimento.html#tarot`
  },
  {
    lang: "es-ES",
    flag: "🇪🇸",
    trigger: "CUPON",
    headline: "El Sol (XIX): Revelación Cósmica!",
    badge: "🔮 TAROT 3D & CUPONES VIP",
    sub: "Claridad mental, prosperidad y descuentos en hoteles.",
    caption: `✨ TU CARTA DEL DÍA: EL SOL (XIX) ✨\n\n¡La energía cósmica abre tus caminos para el amor y los negocios!\n\n👇 Comenta "CUPON" para recibir la predicción y tu descuento en Direct! 💬`,
    bg: ["#450a0a", "#991b1b", "#1c1917"],
    accent: "#f87171",
    link: `${DOMAIN}/entretenimento.html#tarot`
  },
  {
    lang: "fr-FR",
    flag: "🇫🇷",
    trigger: "VOYAGE",
    headline: "Le Soleil (XIX): Guide du Jour!",
    badge: "🔮 TAROT 3D & VOYAGES VIP",
    sub: "Clarté, succès et réductions exclusives débloquées.",
    caption: `✨ VOTRE CARTE DU JOUR: LE SOLEIL (XIX) ✨\n\nNouvelle énergie et opportunités de voyage aujourd'hui!\n\n👇 Commentez "VOYAGE" pour recevoir votre tirage en message privé! 💬`,
    bg: ["#172554", "#1e40af", "#0f172a"],
    accent: "#60a5fa",
    link: `${DOMAIN}/fr/paris.html`
  },
  {
    lang: "de-DE",
    flag: "🇩🇪",
    trigger: "REISE",
    headline: "Die Sonne (XIX): Tagesorakel!",
    badge: "🔮 3D TAROT & REISEDEALS",
    sub: "Klarheit, Vitalität und geprüfte Hotelrabatte.",
    caption: `✨ DEINE TAGESKARTE: DIE SONNE (XIX) ✨\n\nVolle Energie und beste Reiseangebote für heute freigeschaltet!\n\n👇 Kommentiere "REISE" für deine persönliche Deutung per DM! 💬`,
    bg: ["#14532d", "#166534", "#052e16"],
    accent: "#4ade80",
    link: `${DOMAIN}/entretenimento.html#tarot`
  },
  {
    lang: "ja-JP",
    flag: "🇯🇵",
    trigger: "URANAI",
    headline: "太陽 (XIX): 今日のタロット占い!",
    badge: "🔮 3Dタロット & 特別クーポン",
    sub: "幸運の導きと限定旅行クーポンが解放されました。",
    caption: `✨ 今日のタロットカード：太陽 (XIX) ✨\n\n最高のエネルギーと成功が訪れます！\n\n👇 「URANAI」とコメントして、ダイレクトメッセージで結果を受け取りましょう！ 💬`,
    bg: ["#3b0764", "#6b21a8", "#18022e"],
    accent: "#e879f9",
    link: `${DOMAIN}/jp/tokyo.html`
  }
];

function generateMultiLangSvg(camp, idx) {
  const [c1, c2, c3] = camp.bg;
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1080 1080" width="1080" height="1080">
  <defs>
    <linearGradient id="bgGrad_${idx}" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="${c1}" />
      <stop offset="50%" stop-color="${c2}" />
      <stop offset="100%" stop-color="${c3}" />
    </linearGradient>
  </defs>

  <rect width="1080" height="1080" fill="url(#bgGrad_${idx})" />
  <circle cx="540" cy="540" r="460" fill="none" stroke="rgba(255,255,255,0.06)" stroke-width="2" />
  
  <rect x="80" y="80" width="920" height="920" rx="36" fill="rgba(15, 23, 42, 0.75)" stroke="rgba(255,255,255,0.12)" stroke-width="2" />

  <!-- Flag & Badge -->
  <rect x="140" y="140" width="460" height="56" rx="28" fill="${camp.accent}" />
  <text x="370" y="177" font-family="system-ui, sans-serif" font-size="20" font-weight="900" fill="#0f172a" text-anchor="middle">
    ${camp.flag} ${camp.badge}
  </text>

  <!-- Title -->
  <text x="140" y="380" font-family="system-ui, sans-serif" font-size="52" font-weight="900" fill="#ffffff">
    ${camp.headline}
  </text>
  <text x="140" y="470" font-family="system-ui, sans-serif" font-size="28" font-weight="500" fill="#cbd5e1">
    ${camp.sub}
  </text>

  <!-- CTA Box -->
  <rect x="140" y="650" width="800" height="180" rx="20" fill="rgba(255,255,255,0.07)" stroke="${camp.accent}" stroke-width="2" />
  <text x="540" y="720" font-family="system-ui, sans-serif" font-size="26" font-weight="700" fill="#ffffff" text-anchor="middle">
    💬 COMMENT KEYWORD BELOW:
  </text>

  <rect x="360" y="750" width="360" height="56" rx="28" fill="${camp.accent}" />
  <text x="540" y="788" font-family="system-ui, sans-serif" font-size="30" font-weight="900" fill="#0f172a" text-anchor="middle" letter-spacing="2">
    "${camp.trigger}"
  </text>

  <text x="540" y="930" font-family="system-ui, sans-serif" font-size="20" font-weight="600" fill="#94a3b8" text-anchor="middle">
    ⚡ ManyChat 24/7 Multi-Language Bot • aquitemachadinhos.com.br/links
  </text>
</svg>`;
}

function runMultiLangCreator() {
  console.log('================================================================================');
  console.log('🌍 GERADOR DE CONTEÚDO MULTILÍNGUE PARA INSTAGRAM 24/7 (195 PAÍSES)');
  console.log('================================================================================\n');

  GLOBAL_CAMPAIGNS.forEach((camp, idx) => {
    const slug = `instagram-global-${TODAY}-${camp.lang.toLowerCase()}`;
    const svg = generateMultiLangSvg(camp, idx);
    fs.writeFileSync(path.join(QUEUE_DIR, `${slug}.svg`), svg);

    const postPkg = {
      id: slug,
      lang: camp.lang,
      flag: camp.flag,
      trigger: camp.trigger,
      headline: camp.headline,
      caption: camp.caption,
      image_svg_url: `${DOMAIN}/instagram-queue/${slug}.svg`,
      target_url: camp.link,
      status: "ready_to_publish"
    };

    fs.writeFileSync(path.join(QUEUE_DIR, `${slug}.json`), JSON.stringify(postPkg, null, 2));
    console.log(`✓ [${camp.flag} ${camp.lang}] Card Multi-Idioma Gerado: ${slug}.svg (Gatilho: "${camp.trigger}")`);
  });

  console.log('\n================================================================================');
  console.log('✅ POSTS MULTILÍNGUES DO INSTAGRAM GERADOS COM SUCESSO TOTAL 24/7!');
  console.log('================================================================================');
}

runMultiLangCreator();
