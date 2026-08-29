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
    }
  ];
}
