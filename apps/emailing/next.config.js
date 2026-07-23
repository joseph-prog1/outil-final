/** @type {import('next').NextConfig} */
const nextConfig = {
  serverExternalPackages: ['nodemailer', 'imapflow'],
  // Portail de la suite Charlie : /scraper et /posts sont servis par les
  // autres apps (ports internes), tout est accessible sur le port 3005.
  async rewrites() {
    return [
      { source: '/scraper', destination: 'http://localhost:3105/scraper' },
      { source: '/scraper/:path*', destination: 'http://localhost:3105/scraper/:path*' },
      { source: '/posts', destination: 'http://localhost:5001/' },
      { source: '/posts/:path*', destination: 'http://localhost:5001/:path*' },
    ];
  },
};

module.exports = nextConfig;
