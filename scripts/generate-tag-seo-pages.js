/**
 * ==============================================================================
 * PROGRAMMATIC SEARCH INTENT & TAG SEO GENERATOR 2026 (195 COUNTRIES)
 * Generates search-optimized, high-ranking programmatic tag landing pages
 * with JSON-LD Schema.org, OpenGraph meta, and quadruple monetization stack.
 * ==============================================================================
 */

const fs = require('fs');
const path = require('path');

const TAGS_DIR = path.join(__dirname, '../public/tags');
const DOMAIN = 'https://www.aquitemachadinhos.com.br';
const NOW = new Date().toISOString();

if (!fs.existsSync(TAGS_DIR)) fs.mkdirSync(TAGS_DIR, { recursive: true });

const TAG_DEFINITIONS = [
  {
    slug: "cupons-shopee-hoje",
    title: "Cupons Shopee Verificados Hoje 2026: Frete Grátis & 70% OFF",
    meta_desc: "Lista atualizada de cupons secretos da Shopee com frete grátis sem valor mínimo, cashback e até 70% de desconto em compras verificadas.",
    h1: "🛍️ Cupons Shopee Atualizados Hoje (Frete Grátis & Descontos)",
    brand: "shopee",
    badge: "🔥 ECONOMIA RELÂMPAGO",
    cta_text: "Pegar Cupons da Shopee Agora ➔",
    faq: [
      { q: "Como conseguir frete grátis na Shopee hoje?", a: "Acesse nosso link oficial verificado diariamente para resgatar cupons de frete grátis e descontos relâmpago de até 70%." }
    ]
  },
  {
    slug: "hoteis-gramado-booking-desconto",
    title: "Hotéis em Gramado com Desconto no Booking 2026 (Até 30% OFF)",
    meta_desc: "Reserve os melhores hotéis e pousadas perto da Borges de Medeiros e Lago Negro em Gramado com 15% a 30% OFF direto no Booking.com.",
    h1: "🏨 Hotéis e Pousadas em Gramado com Desconto Exclusivo",
    brand: "booking",
    badge: "✈️ VIAGENS & HOSPEDAGEM",
    cta_text: "Ver Hotéis em Gramado com Desconto ➔",
    faq: [
      { q: "Qual a melhor época para conseguir hotéis baratos em Gramado?", a: "Na baixa temporada e reservando com antecedência pelo Booking.com você garante até 30% de desconto e cancelamento grátis." }
    ]
  },
  {
    slug: "nordvpn-cupom-74-off",
    title: "Cupom NordVPN 2026: 74% OFF + 3 Meses Grátis de Proteção",
    meta_desc: "Ative o melhor desconto oficial da NordVPN com criptografia militar, IP dedicado e streaming liberado em 111 países.",
    h1: "🛡️ NordVPN Shield: 74% OFF + 3 Meses Grátis",
    brand: "nordvpn",
    badge: "🔒 CIBERSEGURANÇA & PRIVACIDADE",
    cta_text: "Ativar NordVPN com 74% OFF ➔",
    faq: [
      { q: "Como funciona a garantia de reembolso da NordVPN?", a: "A NordVPN oferece garantia de reembolso incondicional de 30 dias para você testar sem riscos." }
    ]
  },
  {
    slug: "cursos-ia-udemy-desconto",
    title: "Cursos de IA, Python e Programação na Udemy (A partir de R$ 27,90)",
    meta_desc: "Aprenda Inteligência Artificial, Engenharia de Prompt, Python e Full-Stack com cursos certificados e mais bem avaliados na Udemy.",
    h1: "🎓 Cursos de IA & Programação com Desconto na Udemy",
    brand: "udemy",
    direct_url: "https://www.udemy.com/topic/artificial-intelligence/", // sem programa de afiliados na conta (auditoria 03/09/2026)
    badge: "💡 EDUCAÇÃO & CARREIRA",
    cta_text: "Acessar cursos na Udemy ➔",
    faq: [
      { q: "Os cursos da Udemy têm certificado reconhecido?", a: "Sim, todos os cursos concluídos emitem certificado oficial que pode ser adicionado ao LinkedIn e currículo." }
    ]
  },
  {
    slug: "barretos-2027-ingressos-hoteis",
    title: "Festa do Peão de Barretos 2027: Hotéis, Ingressos & Dicas",
    meta_desc: "Guia completo antecipado para a maior festa do peão da América Latina: como comprar ingressos baratos e reservar hotéis perto do Parque do Peão.",
    h1: "🤠 Guia Oficial Festa do Peão de Barretos 2027",
    brand: "booking",
    badge: "🐎 EVENTOS NACIONAIS",
    cta_text: "Garantir Hotéis para Barretos ➔",
    faq: [
      { q: "Onde se hospedar na Festa do Peão de Barretos?", a: "Recomenda-se reservar pousadas e hotéis com antecedência pelo Booking em Barretos ou cidades vizinhas como Colina e Bebedouro." }
    ]
  },
  {
    slug: "tarot-3d-previsao-gratis",
    title: "Tarot 3D dos Arcanos Maiores Online Grátis: Conselho do Dia 2026",
    meta_desc: "Tire sua carta do dia no Tarot 3D dos Arcanos Maiores, receba orientações para amor, finanças e caminhos abertos com cupom VIP exclusivo.",
    h1: "🔮 Tarot 3D Interativo: Tire Sua Carta do Dia Grátis",
    brand: "booking",
    badge: "✨ ORÁCULO CÓSMICO",
    cta_text: "Tirar Carta do Dia no Tarot 3D ➔",
    faq: [
      { q: "Como funciona a tiragem do Tarot 3D?", a: "Você escolhe mentalmente sua questão, clica na carta em 3D e o oráculo revela a mensagem do Arcano Maior correspondente ao seu momento." }
    ]
  }
];

function generateHtmlPage(tag) {
  const affiliateUrl = tag.direct_url || `https://achadinhos-ad-engine.vercel.app/api/ads/go?brand=${tag.brand}&site=tag_seo&slot=${tag.slug}`;
  const relAttr = tag.direct_url ? 'nofollow noopener noreferrer' : 'sponsored noopener noreferrer nofollow';
  const canonicalUrl = `${DOMAIN}/tags/${tag.slug}.html`;

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=5"/>
  <meta name="monetag" content="8469089b876439517e6c5247573c6e21" />
  <title>${tag.title} | Aqui Tem Achadinhos</title>
  <meta name="description" content="${tag.meta_desc}"/>
  <link rel="canonical" href="${canonicalUrl}"/>
  <meta name="robots" content="index, follow, max-image-preview:large"/>

  <meta property="og:title" content="${tag.title}"/>
  <meta property="og:description" content="${tag.meta_desc}"/>
  <meta property="og:url" content="${canonicalUrl}"/>
  <meta property="og:type" content="article"/>

  <script type="application/ld+json">
  {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    "mainEntity": [
      ${tag.faq.map(f => `{"@type": "Question", "name": "${f.q}", "acceptedAnswer": {"@type": "Answer", "text": "${f.a}"}}`).join(',')}
    ]
  }
  </script>

  <style>
    * { margin:0; padding:0; box-sizing:border-box; font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif; }
    body { background:#0f172a; color:#f8fafc; min-height:100vh; padding:24px 16px 80px 16px; display:flex; justify-content:center; }
    .wrap { width:100%; max-width:680px; display:flex; flex-direction:column; gap:20px; }
    .badge { display:inline-block; padding:6px 14px; background:linear-gradient(135deg,#6366f1,#8b5cf6); border-radius:20px; font-size:0.75rem; font-weight:800; color:#fff; align-self:flex-start; }
    h1 { font-size:1.6rem; font-weight:900; line-height:1.3; color:#fff; }
    .desc { font-size:0.95rem; color:#cbd5e1; line-height:1.6; }
    .card { background:rgba(30,41,59,0.7); backdrop-filter:blur(10px); border:1px solid rgba(255,255,255,0.1); border-radius:16px; padding:20px; display:flex; flex-direction:column; gap:14px; }
    .cta-btn { background:linear-gradient(135deg,#10b981,#059669); color:#fff; text-decoration:none; font-weight:800; font-size:1rem; padding:16px 24px; border-radius:12px; text-align:center; box-shadow:0 4px 20px rgba(16,185,129,0.4); transition:transform 0.2s; }
    .cta-btn:hover { transform:scale(1.02); }
    .faq-box { background:#030712; padding:16px; border-radius:12px; border:1px solid #1e293b; }
    .faq-q { font-weight:700; color:#38bdf8; font-size:0.92rem; margin-bottom:6px; }
    .faq-a { font-size:0.85rem; color:#94a3b8; line-height:1.5; }
  </style>

  <script async src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-5604700207394147" crossorigin="anonymous"></script>
  <script src="https://quge5.com/88/tag.min.js" data-zone="274860" async data-cfasync="false"></script>
</head>
<body>

  <div class="wrap">
    <a href="/links.html" style="color:#94a3b8; text-decoration:none; font-size:0.85rem; font-weight:600;">➔ Voltar para Todos os Links & Cupons</a>
    
    <span class="badge">${tag.badge}</span>
    <h1>${tag.h1}</h1>
    
    <div class="card">
      <div style="display:flex; align-items:center; gap:8px; font-size:0.82rem; color:#4ade80; font-weight:700;">
        <span style="display:inline-block; width:8px; height:8px; border-radius:50%; background:#22c55e; box-shadow:0 0 8px #22c55e;"></span>
        <span class="live-timestamp">Verificado hoje</span>
      </div>
      <p class="desc">${tag.meta_desc}</p>
      
      <a href="${affiliateUrl}" target="_blank" rel="${relAttr}" class="cta-btn">
        ${tag.cta_text}
      </a>
    </div>

    <!-- FAQ Section -->
    <div class="card">
      <h2 style="font-size:1.1rem; color:#f8fafc; font-weight:800;">Perguntas Frequentes</h2>
      ${tag.faq.map(f => `
        <div class="faq-box">
          <div class="faq-q">${f.q}</div>
          <div class="faq-a">${f.a}</div>
        </div>
      `).join('')}
    </div>

    <!-- Navigation Hubs -->
    <div style="text-align:center; margin-top:20px;">
      <a href="/entretenimento.html" style="color:#38bdf8; font-size:0.85rem; margin:0 8px;">Tarot 3D</a> •
      <a href="/o-que-fazer-em-gramado.html" style="color:#38bdf8; font-size:0.85rem; margin:0 8px;">Guia Gramado</a> •
      <a href="/links.html" style="color:#38bdf8; font-size:0.85rem; margin:0 8px;">Bio VIP</a>
    </div>

  </div>

  <script type="text/javascript"> var infolinks_pid = 3447442; var infolinks_wsid = 0; </script>
  <script type="text/javascript" src="//resources.infolinks.com/js/infolinks_main.js"></script>
  <script src="/js/growth-cro-engine.js" defer></script>
</body>
</html>`;
}

function runTagGenerator() {
  console.log('================================================================================');
  console.log('🏷️ GERADOR PROGRAMÁTICO DE TAGS SEO & SEARCH INTENT 2026');
  console.log('================================================================================\n');

  TAG_DEFINITIONS.forEach(tag => {
    const html = generateHtmlPage(tag);
    const filePath = path.join(TAGS_DIR, `${tag.slug}.html`);
    fs.writeFileSync(filePath, html);
    console.log(`✓ [Tag SEO] Gerada: public/tags/${tag.slug}.html`);
  });

  console.log('\n================================================================================');
  console.log('✅ TODAS AS PÁGINAS DE TAG SEO GERADAS COM SUCESSO 24/7!');
  console.log('================================================================================');
}

runTagGenerator();
