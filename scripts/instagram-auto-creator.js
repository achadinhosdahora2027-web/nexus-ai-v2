/**
 * ==============================================================================
 * INSTAGRAM AI AUTONOMOUS CONTENT CREATOR ENGINE 2026 (FEED, REELS & CARROSSEL)
 * Generates ready-to-publish visual cards (1080x1080 SVG/HTML), viral captions,
 * dynamic hashtags, and ManyChat Comment-to-DM triggers on autopilot 24/7.
 * ==============================================================================
 */

const fs = require('fs');
const path = require('path');

const QUEUE_DIR = path.join(__dirname, '../public/instagram-queue');
const FEEDS_DIR = path.join(__dirname, '../public/feeds');
const DOMAIN = 'https://www.aquitemachadinhos.com.br';
const NOW = new Date();
const TODAY_STR = NOW.toISOString().split('T')[0];

if (!fs.existsSync(QUEUE_DIR)) fs.mkdirSync(QUEUE_DIR, { recursive: true });
if (!fs.existsSync(FEEDS_DIR)) fs.mkdirSync(FEEDS_DIR, { recursive: true });

const POST_TEMPLATES = [
  {
    category: "Astrologia & Tarot 3D",
    trigger_keyword: "TAROT",
    headline: "O Sol (XIX): Revelação do Dia!",
    badge: "🔮 PREVISÃO & ORÁCULO 2026",
    subheadline: "Grandes vitórias, clareza mental e caminhos abertos.",
    bg_gradient: ["#1e1b4b", "#4338ca", "#0f172a"],
    accent_color: "#fbbf24",
    caption: `✨ SUA CARTA DO DIA: O SOL (XIX) ✨

A energia do Sol traz máxima vitalidade, clareza e caminhos completamente abertos para você hoje. É o momento perfeito para destravar finanças, relacionamentos e novos projetos!

🃏 O que o Oráculo revela para você:
1. Prosperidade e vitória nos seus objetivos.
2. Alívio de tensões e renovação de energia.
3. Desbloqueio de um Cupom Cósmico exclusivo!

👇 QUER TIRAR SUA CARTA DO DIA NO TAROT 3D?
Comente "TAROT" aqui embaixo que eu te envio o link do Tarot 3D Interativo no seu direct agora mesmo! 💬🚀

.
.
.
#tarot #astrologia #tarot3d #oraculo #horoscopo #previsaoastral #signos #espiritualidade #aquitemachadinhos #sorte`,
    link: `${DOMAIN}/entretenimento.html#tarot`
  },
  {
    category: "Viagens & Achadinhos",
    trigger_keyword: "GRAMADO",
    headline: "Gramado 2026: Roteiro Secreto!",
    badge: "✈️ ACHADINHOS DE VIAGEM",
    subheadline: "4 dias na Serra Gaúcha com cupons de 15% a 30% OFF.",
    bg_gradient: ["#064e3b", "#047857", "#022c22"],
    accent_color: "#34d399",
    caption: `❄️ GUIA COMPLETO GRAMADO & CANELA 2026 ❄️

Vai viajar para a Serra Gaúcha? Não pague caro em hotéis e passeios! Separamos o roteiro secreto mais econômico e charmoso para você aproveitar tudo:

📍 Roteiro de 4 Dias:
▪️ Dia 1: Lago Negro, Rua Coberta e Mini Mundo
▪️ Dia 2: Snowland & Fondue Colonial
▪️ Dia 3: Cascata do Caracol e Fábricas de Chocolate
▪️ Dia 4: Maria Fumaça e Tour dos Vinhedos

🎁 BÔNUS: Cupons verificados de até 30% OFF no Booking.com e Aluguel de Carros Carla!

👇 QUER RECEBER O ROTEIRO COMPLETO E OS CUPONS?
Comente "GRAMADO" ou "VIAGEM" que eu te mando o guia no seu direct agora! ✈️🏨

.
.
.
#gramado #natalluz #serragaucha #canela #viagens #dicasdeviagem #hoteis #booking #turismobrasil #achadinhos`,
    link: `${DOMAIN}/o-que-fazer-em-gramado.html`
  },
  {
    category: "Cupons & Compras",
    trigger_keyword: "CUPOM",
    headline: "Radar de Cupons Secretos Shopee!",
    badge: "🔥 ECONOMIA & CASHBACK",
    subheadline: "Ofertas relâmpago com frete grátis verificadas hoje.",
    bg_gradient: ["#7c2d12", "#c2410c", "#431407"],
    accent_color: "#fb923c",
    caption: `🚨 RADAR DE CUPONS SECRETOS ATUALIZADOS HOJE 🚨

Achadinhos imperdíveis com até 70% OFF em eletrônicos, organizadores para casa, moda e importados com frete grátis!

⚡ Por que pagar o preço cheio se você pode usar os cupons verificados do Aqui Tem Achadinhos?

👇 QUER RESGATAR OS CUPONS ANTES QUE ACABEM?
Comente "CUPOM" ou "ACHADINHO" aqui embaixo que eu te envio a lista direta no direct! 🛍️📦

.
.
.
#shopee #achadinhos #cupons #descontos #mercadolivre #comprasonline #promocoes #economizar #achados`,
    link: `${DOMAIN}/black-friday-2026-cupons.html`
  },
  {
    category: "Grandes Eventos 2026/2027",
    trigger_keyword: "BARRETOS",
    headline: "Barretos 2027: Guia Antecipado!",
    badge: "🤠 FESTA DO PEÃO OFICIAL",
    subheadline: "Hotéis com desconto, rotas de transporte e ingressos.",
    bg_gradient: ["#78350f", "#b45309", "#451a03"],
    accent_color: "#fde047",
    caption: `🐎 FESTA DO PEÃO DE BARRETOS 2027: TUDO O QUE VOCÊ PRECISA SABER! 🐎

Quer garantir as melhores opções de hospedagem perto do Parque do Peão e economizar antes dos preços subirem?

📌 O que preparamos para você:
▪️ Hotéis e pousadas verificados com desconto.
▪️ Rotas de transporte e melhores trajetos.
▪️ Dicas secretas para aproveitar a maior festa do Brasil!

👇 QUER RECEBER O GUIA ANTECIPADO NO DIRECT?
Comente "BARRETOS" que eu te envio o link completo agora! 🤠🎶

.
.
.
#barretos #festadopeao #barretos2027 #rodeio #sertanejo #turismosp #hoteisbarretos #ingressos`,
    link: `${DOMAIN}/festa-do-peao-barretos-2027-ingressos.html`
  }
];

function generateSvgCard(post, index) {
  const [c1, c2, c3] = post.bg_gradient;
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1080 1080" width="1080" height="1080">
  <defs>
    <linearGradient id="bgGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="${c1}" />
      <stop offset="50%" stop-color="${c2}" />
      <stop offset="100%" stop-color="${c3}" />
    </linearGradient>
    <filter id="shadow" x="-10%" y="-10%" width="120%" height="120%">
      <feDropShadow dx="0" dy="12" stdDeviation="16" flood-color="#000000" flood-opacity="0.6"/>
    </filter>
  </defs>

  <!-- Background -->
  <rect width="1080" height="1080" fill="url(#bgGrad)" />

  <!-- Grid Decoration -->
  <circle cx="540" cy="540" r="440" fill="none" stroke="rgba(255,255,255,0.06)" stroke-width="2" />
  <circle cx="540" cy="540" r="320" fill="none" stroke="rgba(255,255,255,0.04)" stroke-width="2" />

  <!-- Card Container -->
  <rect x="80" y="80" width="920" height="920" rx="40" fill="rgba(15, 23, 42, 0.7)" stroke="rgba(255,255,255,0.15)" stroke-width="2" filter="url(#shadow)" />

  <!-- Badge Top -->
  <rect x="140" y="140" width="420" height="60" rx="30" fill="${post.accent_color}" />
  <text x="350" y="180" font-family="system-ui, -apple-system, sans-serif" font-size="22" font-weight="900" fill="#0f172a" text-anchor="middle" letter-spacing="1">
    ${post.badge}
  </text>

  <!-- Brand Top Right -->
  <text x="940" y="180" font-family="system-ui, -apple-system, sans-serif" font-size="22" font-weight="700" fill="#94a3b8" text-anchor="end">
    @aquitemachadinhos
  </text>

  <!-- Main Headline -->
  <text x="140" y="360" font-family="system-ui, -apple-system, sans-serif" font-size="56" font-weight="900" fill="#ffffff">
    ${post.headline.split(':')[0]}
  </text>
  <text x="140" y="440" font-family="system-ui, -apple-system, sans-serif" font-size="52" font-weight="800" fill="${post.accent_color}">
    ${post.headline.split(':')[1] || ''}
  </text>

  <!-- Subheadline -->
  <text x="140" y="550" font-family="system-ui, -apple-system, sans-serif" font-size="32" font-weight="500" fill="#e2e8f0">
    ${post.subheadline}
  </text>

  <!-- Dynamic ManyChat Comment Trigger Box -->
  <rect x="140" y="660" width="800" height="180" rx="24" fill="rgba(255,255,255,0.08)" stroke="${post.accent_color}" stroke-width="2" />
  
  <text x="540" y="730" font-family="system-ui, -apple-system, sans-serif" font-size="28" font-weight="700" fill="#ffffff" text-anchor="middle">
    💬 COMENTE A PALAVRA-CHAVE ABAIXO:
  </text>

  <rect x="340" y="760" width="400" height="60" rx="30" fill="${post.accent_color}" />
  <text x="540" y="802" font-family="system-ui, -apple-system, sans-serif" font-size="34" font-weight="900" fill="#0f172a" text-anchor="middle" letter-spacing="2">
    "${post.trigger_keyword}"
  </text>

  <!-- Footer Indicator -->
  <text x="540" y="940" font-family="system-ui, -apple-system, sans-serif" font-size="20" font-weight="600" fill="#94a3b8" text-anchor="middle">
    ⚡ Envio 100% Automático via Direct (ManyChat AI Bot) • aquitemachadinhos.com.br
  </text>
</svg>`;
}

function runCreator() {
  console.log('================================================================================');
  console.log('🎨 GERADOR DE CONTEÚDO AUTOMÁTICO PARA INSTAGRAM 24/7 (AI AUTOPILOT)');
  console.log('================================================================================\n');

  const generatedPosts = [];

  POST_TEMPLATES.forEach((post, idx) => {
    const slug = `instagram-post-${TODAY_STR}-${idx + 1}-${post.trigger_keyword.toLowerCase()}`;
    const svgContent = generateSvgCard(post, idx);
    const svgPath = path.join(QUEUE_DIR, `${slug}.svg`);
    fs.writeFileSync(svgPath, svgContent);

    const postPackage = {
      id: slug,
      created_at: NOW.toISOString(),
      category: post.category,
      trigger_keyword: post.trigger_keyword,
      headline: post.headline,
      caption: post.caption,
      image_svg_url: `${DOMAIN}/instagram-queue/${slug}.svg`,
      target_url: post.link,
      manychat_hook: `Comente "${post.trigger_keyword}" para receber a DM automática via ManyChat`,
      status: "ready_to_publish"
    };

    const jsonPath = path.join(QUEUE_DIR, `${slug}.json`);
    fs.writeFileSync(jsonPath, JSON.stringify(postPackage, null, 2));

    generatedPosts.push(postPackage);
    console.log(`✓ [${post.category}] Card SVG + Legenda Gerados: ${slug}.svg`);
  });

  // Master Queue Manifest
  const manifest = {
    updated_at: NOW.toISOString(),
    total_posts: generatedPosts.length,
    active_posts: generatedPosts
  };

  fs.writeFileSync(path.join(FEEDS_DIR, 'instagram-feed.json'), JSON.stringify(manifest, null, 2));
  console.log(`\n✓ Manifesto do Instagram Feed Atualizado: public/feeds/instagram-feed.json`);

  console.log('\n================================================================================');
  console.log('✅ PACOTE DE POSTS DO INSTAGRAM 100% GERADO COM SUCESSO 24/7!');
  console.log('================================================================================');
}

runCreator();
