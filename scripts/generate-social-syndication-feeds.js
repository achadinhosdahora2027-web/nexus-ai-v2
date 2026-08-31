/**
 * ==============================================================================
 * AUTOMATED SOCIAL SYNDICATION & PINTEREST RSS FEED GENERATOR (NEXUS AI V2)
 * ==============================================================================
 */

const fs = require('fs');
const path = require('path');

const DOMAIN = 'https://www.nexusplataforma.ia.br';
const FEEDS_DIR = path.join(__dirname, '../public/feeds');
const NOW = new Date().toUTCString();

if (!fs.existsSync(FEEDS_DIR)) {
  fs.mkdirSync(FEEDS_DIR, { recursive: true });
}

const TECH_CARDS = [
  {
    title: "Global AI Matrix & Productivity Tools 2026",
    link: `${DOMAIN}/entertainment/index.html`,
    description: "Explore the most powerful AI productivity tools, prompt architectures, and enterprise intelligence models updated daily.",
    image: `${DOMAIN}/favicon.ico`,
    category: "Artificial Intelligence"
  },
  {
    title: "NordVPN Cybersecurity & AI Privacy Shield 2026",
    link: `${DOMAIN}/entertainment/index.html#vpn`,
    description: "Protect your AI data pipelines with military-grade encryption and 70% off high-speed global proxies.",
    image: `${DOMAIN}/favicon.ico`,
    category: "Cybersecurity"
  },
  {
    title: "Udemy Certified AI & Full-Stack Development Courses",
    link: `${DOMAIN}/entertainment/index.html#courses`,
    description: "Master LLM orchestration, Next.js 15, and Python automation with world-class certified courses.",
    image: `${DOMAIN}/favicon.ico`,
    category: "Education & Tech"
  }
];

function generatePinterestRss() {
  let rss = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:media="http://search.yahoo.com/mrss/" xmlns:dc="http://purl.org/dc/elements/1.1/">
  <channel>
    <title>Nexus AI Global Intelligence Feeds 2026</title>
    <link>${DOMAIN}</link>
    <description>Daily automated feed for AI tools, machine learning pipelines, and tech infrastructure.</description>
    <language>en-US</language>
    <lastBuildDate>${NOW}</lastBuildDate>
`;

  TECH_CARDS.forEach(item => {
    rss += `    <item>
      <title><![CDATA[${item.title}]]></title>
      <link>${item.link}</link>
      <guid isPermaLink="true">${item.link}</guid>
      <description><![CDATA[${item.description}]]></description>
      <category><![CDATA[${item.category}]]></category>
      <pubDate>${NOW}</pubDate>
      <media:content url="${item.image}" medium="image" />
    </item>\n`;
  });

  rss += `  </channel>
</rss>`;

  fs.writeFileSync(path.join(FEEDS_DIR, 'pinterest-pins.rss'), rss);
  console.log(`✓ Nexus Pinterest RSS gerado: public/feeds/pinterest-pins.rss`);
}

function generateTelegramSyndicationJson() {
  const payload = {
    generated_at: NOW,
    network: "Nexus AI Global Feed",
    total_campaigns: TECH_CARDS.length,
    broadcast_queue: TECH_CARDS.map(item => ({
      headline: item.title,
      target_url: item.link,
      telegram_caption: `⚡ *${item.title}*\n\n${item.description}\n\n👉 Access: ${item.link}`,
      whatsapp_message: `*${item.title}*\n${item.description}\n👉 ${item.link}`,
      category: item.category
    }))
  };

  fs.writeFileSync(path.join(FEEDS_DIR, 'telegram-broadcast.json'), JSON.stringify(payload, null, 2));
  console.log(`✓ Nexus Telegram Broadcast JSON gerado: public/feeds/telegram-broadcast.json`);
}

function run() {
  console.log('--- GERANDO FEEDS NEXUS 24/7 ---');
  generatePinterestRss();
  generateTelegramSyndicationJson();
  console.log('--- NEXUS FEEDS OK ---');
}

run();
