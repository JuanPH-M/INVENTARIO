import type { NextConfig } from 'next';

/**
 * URL interna del backend. El navegador siempre habla con la web (/api/...) y Next.js
 * reenvía la petición a la API, de modo que funciona igual en localhost, en la red local
 * de una tienda (http://192.168.x.x:3000) o detrás de un dominio con HTTPS.
 */
const API_INTERNAL_URL = (process.env['API_INTERNAL_URL'] ?? 'http://localhost:3001').replace(/\/$/, '');

const nextConfig: NextConfig = {
  // 'standalone' empaqueta un servidor mínimo para Docker (NEXT_OUTPUT=standalone en el Dockerfile).
  // En Windows sin permisos de symlink se omite y se usa `next start` normal.
  output: process.env['NEXT_OUTPUT'] === 'standalone' ? 'standalone' : undefined,
  reactStrictMode: true,
  poweredByHeader: false,
  transpilePackages: ['@inventario/shared', '@inventario/types'],
  images: {
    remotePatterns: [
      { protocol: 'http', hostname: 'localhost' },
      { protocol: 'https', hostname: '**' },
    ],
  },
  async rewrites() {
    return [{ source: '/api/:path*', destination: `${API_INTERNAL_URL}/api/:path*` }];
  },
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy', value: 'camera=(self), microphone=(), geolocation=()' },
        ],
      },
    ];
  },
};

export default nextConfig;
