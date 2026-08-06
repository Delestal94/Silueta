import type { MetadataRoute } from 'next';

const SITE = 'https://silumatch.vercel.app';

/**
 * Crawlers are welcome on the landing page and nowhere else.
 *
 * A room lives behind a code that people paste into a group chat; having those
 * URLs turn up in a search result would let a stranger walk into somebody's
 * game. The moderation panel and the API have nothing to offer an index
 * either, y /demo es una planilla interna de consulta.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: ['/room/', '/api/', '/auth/', '/demo'],
    },
    sitemap: `${SITE}/sitemap.xml`,
  };
}
