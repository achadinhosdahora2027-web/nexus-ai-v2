/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: 'www.ftjcfx.com' },
      { protocol: 'https', hostname: 'www.tqlkg.com' },
      { protocol: 'https', hostname: 'images.unsplash.com' }
    ]
  },
  async rewrites() {
    return [
      { source: '/mundial', destination: '/mundial.html' },
      { source: '/radar-mundial', destination: '/radar-mundial.html' },
      { source: '/entertainment', destination: '/entertainment.html' },
      { source: '/ads.txt', destination: '/ads.txt' },
      { source: '/sitemap.xml', destination: '/sitemap.xml' },
      { source: '/sitemap-index.xml', destination: '/sitemap-index.xml' },
      { source: '/sitemap-mundial-paises.xml', destination: '/sitemap-mundial-paises.xml' },
      { source: '/robots.txt', destination: '/robots.txt' }
    ];
  }
};

export default nextConfig;
