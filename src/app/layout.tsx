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
        <footer id="affiliate-disclosure" style={{clear:"both",margin:"24px auto 8px",maxWidth:720,padding:"10px 14px",fontSize:12,lineHeight:1.5,color:"#94a3b8",background:"rgba(148,163,184,.08)",border:"1px solid rgba(148,163,184,.2)",borderRadius:8}}>
          <strong>Divulgação de Afiliados:</strong> este site participa de programas de afiliados — CJ Affiliate, Amazon Associados, Shopee, Awin e similares. Podemos receber comissão por compras feitas nos links deste site, sem nenhum custo extra para você. <em>(FTC 16 CFR Part 255 / CONAR)</em>
        </footer>
        <script type="text/javascript" dangerouslySetInnerHTML={{ __html: "var infolinks_pid = 3447442; var infolinks_wsid = 0;" }}></script>
        <script type="text/javascript" src="//resources.infolinks.com/js/infolinks_main.js" async></script>
        <script src="/js/growth-cro-engine.js" defer></script>
      </body>
    </html>
  );
}
