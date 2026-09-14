import type { NextConfig } from 'next';

const gatewayUrl = process.env.OCEAN_GATEWAY_URL ?? 'http://localhost:3000';

const nextConfig: NextConfig = {
  output: 'standalone',
  transpilePackages: ['@ocean/ui'],
  async rewrites() {
    return [
      { source: '/api/:path*', destination: `${gatewayUrl}/api/:path*` },
      { source: '/public/:path*', destination: `${gatewayUrl}/public/:path*` },
    ];
  },
};

export default nextConfig;
