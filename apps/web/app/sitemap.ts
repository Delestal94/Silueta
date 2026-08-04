import type { MetadataRoute } from 'next';

const SITE = 'https://silumatch.vercel.app';

/**
 * The two pages worth indexing.
 *
 * Rooms are deliberately absent: they are short-lived, private to whoever has
 * the code, and already refused in robots.ts. So is /jugadores — the page is
 * still there for whoever moderates, but it is not linked from anywhere any
 * more, and pointing a crawler at it would undo that.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();

  return [
    { url: SITE, lastModified: now, changeFrequency: 'weekly', priority: 1 },
  ];
}
