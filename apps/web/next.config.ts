import type { NextConfig } from 'next';

const gatewayUrl = process.env.OCEAN_GATEWAY_URL ?? 'http://localhost:3000';

const securityHeaders = [
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
  { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
];

const nextConfig: NextConfig = {
  output: 'standalone',
  transpilePackages: ['@ocean/ui'],
  async headers() {
    return [
      {
        source: '/:path*',
        headers: securityHeaders,
      },
    ];
  },
  async rewrites() {
    return [
      { source: '/api/:path*', destination: `${gatewayUrl}/api/:path*` },
      { source: '/public/:path*', destination: `${gatewayUrl}/public/:path*` },
    ];
  },
};

export default nextConfig;
