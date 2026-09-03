import React from 'react';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  metadataBase: new URL('https://nexusplataforma.ia.br'),
  title: {
    default: 'Nexus | Guia Mundial das 129 Nações & Hub Internacional',
    template: '%s | Nexus'
  },
  description: 'Guia global e inteligência de mercado conectando 129 nações, ofertas verificadas e tecnologia de ponta.',
  openGraph: {
    title: 'Nexus Plataforma Global',
    description: 'Guia Mundial das 129 Nações & Hub Internacional de IA e Ferramentas',
    url: 'https://nexusplataforma.ia.br',
    siteName: 'Nexus Plataforma',
    images: [{ url: '/og-image.png', width: 1200, height: 630 }],
    locale: 'pt_BR',
    type: 'website'
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-video-preview': -1,
      'max-image-preview': 'large',
      'max-snippet': -1
    }
  },
  other: {
    monetag: '8469089b876439517e6c5247573c6e21'
  }
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="pt-BR">
      <head>
        <script async src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-5604700207394147" crossOrigin="anonymous"></script>
      </head>
      <body className="bg-slate-950 text-slate-100 antialiased selection:bg-blue-600 selection:text-white">
        {children}
        <script type="text/javascript" dangerouslySetInnerHTML={{ __html: "var infolinks_pid = 3447442; var infolinks_wsid = 0;" }}></script>
        <script type="text/javascript" src="//resources.infolinks.com/js/infolinks_main.js" async></script>
        <script src="/js/growth-cro-engine.js" defer></script>
      </body>
    </html>
  );
}
