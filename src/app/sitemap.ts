import { MetadataRoute } from 'next';

export default function sitemap(): MetadataRoute.Sitemap {
  const baseUrl = 'https://nexusplataforma.ia.br';
  return [
    {
      url: baseUrl,
      lastModified: new Date(),
      changeFrequency: 'daily',
      priority: 1.0
    },
    {
      url: `${baseUrl}/growth/pt-br/us-new-york-nordvpn/ai-tech-coupons`,
      lastModified: new Date(),
      changeFrequency: 'daily',
      priority: 0.8
    },
    { url: `${baseUrl}/entertainment`, lastModified: new Date(), changeFrequency: 'weekly' as const, priority: 0.7 },
    { url: `${baseUrl}/mundial`, lastModified: new Date(), changeFrequency: 'weekly' as const, priority: 0.7 },
  ];
}
