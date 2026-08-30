import React from 'react';
import Link from 'next/link';

export default function HomePage() {
  const featuredOffers = [
    {
      brand: 'Booking.com',
      title: 'Hospedagens & Hotéis Internacionais',
      desc: 'Reserve hotéis nas 129 nações com tarifas negociadas e cancelamento grátis.',
      discount: 'Até 30% OFF',
      cta: 'Ver Hotéis',
      url: 'https://achadinhos-ad-engine.vercel.app/api/ads/go?brand=booking&site=nexus&slot=home_card_1'
    },
    {
      brand: 'NordVPN',
      title: 'Cibersegurança Global & IP Dedicado',
      desc: 'Navegação segura em viagens internacionais com servidores ultra-rápidos.',
      discount: '70% OFF + 3 Meses',
      cta: 'Ativar Cupom',
      url: 'https://achadinhos-ad-engine.vercel.app/api/ads/go?brand=nordvpn&site=nexus&slot=home_card_2'
    },
    {
      brand: 'Carla Car Rental',
      title: 'Aluguel de Carros no Exterior',
      desc: 'Compare mais de 500 locadoras no mundo com seguro e suporte 24h.',
      discount: 'Tarifa Especial',
      cta: 'Comparar Carros',
      url: 'https://achadinhos-ad-engine.vercel.app/api/ads/go?brand=carla&site=nexus&slot=home_card_3'
    }
  ];

  const nations = [
    { name: 'Estados Unidos', slug: 'us-new-york-nordvpn', count: 12 },
    { name: 'Alemanha', slug: 'de-berlin-tech', count: 8 },
    { name: 'Japão', slug: 'jp-tokyo-ai', count: 10 },
    { name: 'Reino Unido', slug: 'gb-london-saas', count: 9 },
    { name: 'França', slug: 'fr-paris-deals', count: 7 },
    { name: 'Brasil', slug: 'br-saopaulo-ofertas', count: 15 }
  ];

  return (
    <main className="min-h-screen px-4 py-12 md:py-20 max-w-5xl mx-auto space-y-16">
      {/* CJ Impression Pixels for Active Verified Advertisers */}
      <img src="https://www.ftjcfx.com/image-8041957-17288448" width="1" height="1" alt="" className="opacity-0 pointer-events-none absolute" loading="lazy" />
      <img src="https://www.tqlkg.com/image-8041957-17075184" width="1" height="1" alt="" className="opacity-0 pointer-events-none absolute" loading="lazy" />

      <header className="text-center space-y-4">
        <span className="text-xs uppercase font-mono tracking-widest text-blue-400 bg-blue-950/80 px-3 py-1 rounded-full border border-blue-800/60">
          Nexus World Guide • 129 Nações
        </span>
        <h1 className="text-4xl md:text-6xl font-black tracking-tight text-white">
          Inteligência Global & Conexões Internacionais
        </h1>
        <p className="text-lg text-slate-400 max-w-2xl mx-auto">
          Explore diretórios de IA, ferramentas corporativas, cibersegurança e guias detalhados de 129 países.
        </p>
      </header>

      {/* Featured Monetized Partners Section */}
      <section className="space-y-6">
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <h2 className="text-xl font-bold text-white">🔥 Parceiros Oficiais em Destaque</h2>
          <span className="text-xs font-mono text-blue-400">Ofertas Verificadas</span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {featuredOffers.map((item, idx) => (
            <div key={idx} className="bg-slate-900/90 border border-slate-800 rounded-2xl p-6 flex flex-col justify-between hover:border-blue-500/40 transition">
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-blue-400 uppercase tracking-wider">{item.brand}</span>
                  <span className="text-[10px] font-mono bg-blue-950 text-blue-300 px-2 py-0.5 rounded-full border border-blue-800/50">{item.discount}</span>
                </div>
                <h3 className="text-lg font-bold text-white">{item.title}</h3>
                <p className="text-sm text-slate-400">{item.desc}</p>
              </div>
              <a
                href={item.url}
                target="_blank"
                rel="sponsored noopener noreferrer nofollow"
                className="mt-6 block w-full py-2.5 text-center text-sm font-bold bg-blue-600 hover:bg-blue-500 text-white rounded-xl transition"
              >
                {item.cta}
              </a>
            </div>
          ))}
        </div>
      </section>

      {/* Global Directories Section */}
      <section className="space-y-6">
        <h2 className="text-xl font-bold text-white border-b border-slate-800 pb-3">🌐 Guias por País e Cidade</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {nations.map((nation) => (
            <Link
              key={nation.slug}
              href={`/growth/pt-br/${nation.slug}/ai-tech-coupons`}
              className="group block p-6 rounded-2xl bg-slate-900 border border-slate-800 hover:border-blue-500/50 hover:bg-slate-900/80 transition shadow-lg"
            >
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-xl font-bold text-white group-hover:text-blue-400 transition">{nation.name}</h3>
                <span className="text-xs font-mono text-slate-500">{nation.count} guias</span>
              </div>
              <p className="text-sm text-slate-400">Ver ofertas, cupons e diretório tecnológico para {nation.name}.</p>
            </Link>
          ))}
        </div>
      </section>
    </main>
  );
}
