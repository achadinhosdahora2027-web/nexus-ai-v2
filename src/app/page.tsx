import React from 'react';
import Link from 'next/link';

export default function HomePage() {
  const nations = [
    { name: 'Estados Unidos', slug: 'us-new-york-nordvpn', count: 12 },
    { name: 'Alemanha', slug: 'de-berlin-tech', count: 8 },
    { name: 'Japão', slug: 'jp-tokyo-ai', count: 10 },
    { name: 'Reino Unido', slug: 'gb-london-saas', count: 9 },
    { name: 'França', slug: 'fr-paris-deals', count: 7 },
    { name: 'Brasil', slug: 'br-saopaulo-ofertas', count: 15 }
  ];

  return (
    <main className="min-h-screen px-4 py-12 md:py-20 max-w-5xl mx-auto space-y-12">
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

      <section className="grid grid-cols-1 md:grid-cols-3 gap-6">
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
      </section>
    </main>
  );
}
