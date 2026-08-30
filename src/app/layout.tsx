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
      <body className="bg-slate-950 text-slate-100 antialiased selection:bg-blue-600 selection:text-white">
        {children}
      </body>
    </html>
  );
}
