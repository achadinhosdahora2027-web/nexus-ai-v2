import React from 'react';
import fs from 'fs';
import path from 'path';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { OfferButton } from '@/components/growth/OfferButton';
import { AffiliateTracker } from '@/components/growth/AffiliateTracker';
import { AdSlot } from '@/components/growth/AdSlot';
import { isRtlLocale, getHreflangAlternates } from '@/i18n/hreflang';

export const revalidate = 3600;
export const dynamicParams = true;

// Prevent build from trying to pre-render 1,000,000 pages during build time
export async function generateStaticParams() {
  if (process.env.GROWTH_PRERENDER !== 'true') {
    return [];
  }
  return [];
}

interface PageProps {
  params: {
    locale: string;
    tail: string[];
  };
}

const DISCLOSURES: Record<string, string> = {
  'pt-br': 'Divulgação: Como parceiro afiliado, podemos receber uma comissão pelas compras qualificadas realizadas através dos links desta página, sem nenhum custo adicional para você.',
  'en-us': 'Disclosure: As an affiliate partner, we may earn a commission from qualifying purchases made through links on this page at no additional cost to you.',
  'es-es': 'Divulgación: Como socio afiliado, podemos recibir una comisión por compras calificadas a través de los enlaces de esta página, sin costo adicional para usted.',
  'de-de': 'Hinweis: Als Partner können wir eine Provision für qualifizierte Käufe über Links auf dieser Seite erhalten, ohne zusätzliche Kosten für Sie.',
  'fr-fr': 'Divulgation : En tant que partenaire affilié, nous pouvons recevoir une commission sur les achats qualifiés effectués via les liens de cette page, sans frais supplémentaires pour vous.',
  'ja-jp': '開示：アフィリエイトパートナーとして、本ページのリンクを経由した適格な購入から報酬を得る場合があります（追加費用は発生しません）。',
  'zh-cn': '披露：作为联盟合作伙伴，我们可能会从本页面链接产生的符合条件的购买中赚取佣金，您无需承担任何额外费用。'
};

function getDataset(locale: string, tail: string[]) {
  const facet = tail[0] || '';
  const format = tail.slice(1).join('/') || 'index';

  // 1. Try dataset in public/growth/datasets/{locale}/{facet}/{format}.json
  const datasetPath = path.join(process.cwd(), 'public', 'growth', 'datasets', locale.toLowerCase(), facet, `${format}.json`);
  if (fs.existsSync(datasetPath)) {
    try {
      return { type: 'json' as const, data: JSON.parse(fs.readFileSync(datasetPath, 'utf8')) };
    } catch (e) {
      console.error('Error reading growth dataset:', e);
    }
  }

  // 2. Legacy fallback in public/growth/{locale}/{facet}/{format}/index.html or .html
  const legacyHtmlPath = path.join(process.cwd(), 'public', 'growth', locale.toLowerCase(), ...tail, 'index.html');
  const legacyHtmlDirect = path.join(process.cwd(), 'public', 'growth', locale.toLowerCase(), `${tail.join('/')}.html`);
  const legacyPath = fs.existsSync(legacyHtmlPath) ? legacyHtmlPath : fs.existsSync(legacyHtmlDirect) ? legacyHtmlDirect : null;

  if (legacyPath) {
    try {
      return { type: 'legacy_html' as const, html: fs.readFileSync(legacyPath, 'utf8') };
    } catch (e) {
      console.error('Error reading legacy growth html:', e);
    }
  }

  return null;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const resolved = getDataset(params.locale, params.tail);
  if (!resolved) return { title: 'Página não encontrada' };

  const urlBase = process.env.NEXT_PUBLIC_APP_URL || 'https://nexusplataforma.ia.br';
  const facet = params.tail[0] || '';
  const format = params.tail.slice(1).join('/') || 'index';
  const alternates = getHreflangAlternates(urlBase, facet, format);
  const canonicalUrl = `${urlBase.replace(/\/+$/, '')}/growth/${params.locale.toLowerCase()}/${facet}/${format}`;

  if (resolved.type === 'legacy_html') {
    return {
      title: 'Guia & Ofertas Internacionais | Nexus',
      alternates: {
        canonical: canonicalUrl,
        languages: alternates
      },
      robots: {
        index: true,
        follow: true,
        'max-image-preview': 'large'
      }
    };
  }

  const { data } = resolved;
  return {
    title: data.title || 'Guia de Ofertas e Tecnologia',
    description: data.description || 'Confira os melhores cupons, ferramentas de IA e serviços globais.',
    alternates: {
      canonical: data.canonical || canonicalUrl,
      languages: data.hreflang || alternates
    },
    robots: {
      index: true,
      follow: true,
      'max-image-preview': 'large',
      'max-snippet': -1,
      'max-video-preview': -1
    },
    openGraph: {
      title: data.title,
      description: data.description,
      url: data.canonical || canonicalUrl,
      locale: params.locale,
      images: [{ url: '/og-image.png', width: 1200, height: 630, alt: data.title }]
    }
  };
}

export default async function GrowthPage({ params }: PageProps) {
  const resolved = getDataset(params.locale, params.tail);
  if (!resolved) {
    notFound();
  }

  const isRtl = isRtlLocale(params.locale);
  const disclosureText = DISCLOSURES[params.locale.toLowerCase()] || DISCLOSURES['en-us'];

  if (resolved.type === 'legacy_html') {
    return (
      <div
        dir={isRtl ? 'rtl' : 'ltr'}
        className="legacy-growth-container min-h-screen bg-slate-950 text-slate-100"
        dangerouslySetInnerHTML={{ __html: resolved.html }}
      />
    );
  }

  const { data } = resolved;
  const offers = Array.isArray(data.offers) ? data.offers : [];
  const datasetHosts = Array.isArray(data.affiliateHosts) ? data.affiliateHosts : [];

  const jsonLdData = [
    {
      '@context': 'https://schema.org',
      '@type': 'WebPage',
      name: data.title,
      description: data.description,
      url: data.canonical
    },
    {
      '@context': 'https://schema.org',
      '@type': 'ItemList',
      name: 'Ofertas e Parceiros em Destaque',
      itemListElement: offers.map((offer: any, idx: number) => ({
        '@type': 'ListItem',
        position: idx + 1,
        item: {
          '@type': 'Product',
          name: offer.title || offer.name || 'Serviço Recomendado',
          description: offer.description || 'Desconto e oferta verificada',
          offers: {
            '@type': 'Offer',
            priceCurrency: offer.currency || 'USD',
            price: offer.price || '0.00',
            availability: 'https://schema.org/InStock'
          }
        }
      }))
    },
    {
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Home', item: '/' },
        { '@type': 'ListItem', position: 2, name: 'Growth', item: '/growth' },
        { '@type': 'ListItem', position: 3, name: params.locale, item: `/growth/${params.locale}` },
        { '@type': 'ListItem', position: 4, name: data.title, item: data.canonical }
      ]
    },
    {
      '@context': 'https://schema.org',
      '@type': 'Organization',
      name: 'Nexus Plataforma',
      url: 'https://nexusplataforma.ia.br'
    }
  ];

  return (
    <main dir={isRtl ? 'rtl' : 'ltr'} className="min-h-screen bg-slate-950 text-slate-100 px-4 py-8 md:py-16">
      <AffiliateTracker datasetHosts={datasetHosts} site="nexus" slot="page" />

      {jsonLdData.map((schema, idx) => (
        <script
          key={idx}
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }}
        />
      ))}

      <div className="max-w-4xl mx-auto space-y-8">
        <AdSlot
          slot="header"
          title="Promoção Exclusiva de Cibersegurança & Nuvem"
          badge="Destaque Verificado"
          ctaText="Ativar Oferta Especial"
          ctaUrl="https://achadinhos-ad-engine.vercel.app/api/ads/go?brand=nordvpn&site=nexus&slot=header"
        />

        <header className="text-center space-y-4">
          <h1 className="text-3xl md:text-5xl font-extrabold tracking-tight text-white">{data.title}</h1>
          <p className="text-lg text-slate-400 max-w-2xl mx-auto">{data.description}</p>
        </header>

        <section className="bg-slate-900/50 border border-slate-800 rounded-2xl p-6 md:p-8 space-y-6">
          <div className="flex items-center justify-between border-b border-slate-800 pb-4">
            <h2 className="text-xl font-bold text-slate-200">Ofertas & Cupons Disponíveis</h2>
            <span className="text-xs font-mono text-emerald-400 bg-emerald-950/60 px-3 py-1 rounded-full border border-emerald-800/40">
              {offers.length} cupons ativos
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {offers.map((offer: any, idx: number) => (
              <div key={idx} className="bg-slate-900 border border-slate-800/80 rounded-xl p-5 flex flex-col justify-between space-y-4 hover:border-slate-700 transition">
                <div>
                  <span className="text-xs font-bold text-blue-400 tracking-wider uppercase">{offer.brand || 'Parceiro'}</span>
                  <h3 className="text-lg font-bold text-white mt-1">{offer.title || offer.name}</h3>
                  <p className="text-sm text-slate-400 mt-2">{offer.description}</p>
                </div>
                <div className="pt-2 flex items-center justify-between">
                  {offer.discount && (
                    <span className="text-xs font-extrabold text-amber-400 bg-amber-950/70 px-2.5 py-1 rounded-md border border-amber-800/40">
                      {offer.discount}
                    </span>
                  )}
                  <OfferButton
                    href={offer.url || `https://achadinhos-ad-engine.vercel.app/api/ads/go?brand=${encodeURIComponent(offer.brand || 'nordvpn')}&site=nexus&slot=card_${idx}`}
                    label={offer.cta || 'Obter Desconto'}
                    brand={offer.brand}
                    price={offer.priceFormatted}
                  />
                </div>
              </div>
            ))}
          </div>
        </section>

        <AdSlot
          slot="inline"
          title="Economize até 70% com as Melhores Ferramentas Globais"
          badge="Recomendado"
          ctaText="Ver Oferta Inline"
          ctaUrl="https://achadinhos-ad-engine.vercel.app/api/ads/go?brand=surfshark&site=nexus&slot=inline"
        />

        <AdSlot
          slot="rectangle"
          title="Soluções Corporativas & Inteligência Artificial"
          badge="B2B SaaS"
          ctaText="Conhecer Agora"
          ctaUrl="https://achadinhos-ad-engine.vercel.app/api/ads/go?brand=malwarebytes&site=nexus&slot=rectangle"
        />

        <footer className="pt-8 border-t border-slate-800/80 text-xs text-slate-500 leading-relaxed text-center">
          <p>{disclosureText}</p>
        </footer>
      </div>
    </main>
  );
}
