import type { MetadataRoute } from 'next';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: ['/', '/code'],
      disallow: ['/app', '/auth', '/api'],
    },
  };
}
