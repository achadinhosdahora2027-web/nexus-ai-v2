import { MetadataRoute } from 'next';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: ['/api/']
    },
    sitemap: [
      'https://nexusplataforma.ia.br/sitemap.xml',
      'https://nexusplataforma.ia.br/growth/sitemaps/sitemap-index.xml'
    ],
    host: 'https://nexusplataforma.ia.br'
  };
}
