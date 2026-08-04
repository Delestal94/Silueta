'use client';

import { useEffect, useState } from 'react';

/**
 * Decorative row of real silhouettes behind the hero. It is the fastest way to
 * say what the game is: a visitor who has never heard of it sees the puzzle
 * before reading a word.
 */
export function SilhouetteStrip() {
  const [urls, setUrls] = useState<string[]>([]);

  useEffect(() => {
    fetch('/api/showcase')
      .then((r) => (r.ok ? r.json() : { silhouettes: [] }))
      .then((d) => setUrls(d.silhouettes ?? []))
      .catch(() => {});
  }, []);

  if (!urls.length) return null;

  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-x-0 bottom-0 flex select-none items-end justify-center gap-2 overflow-hidden opacity-[0.13] sm:gap-6"
    >
      {urls.map((url, i) => (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          key={url}
          src={url}
          alt=""
          className="h-32 w-auto object-contain sm:h-44 lg:h-56"
          style={{
            // Staggered so the row reads as a crowd rather than a straight line.
            transform: `translateY(${(i % 3) * 8}px)`,
            filter:
              'brightness(0) saturate(100%) invert(96%) sepia(6%) saturate(300%) hue-rotate(190deg)',
          }}
        />
      ))}
    </div>
  );
}
