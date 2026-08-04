'use client';

import { useEffect, useState } from 'react';

/**
 * One large silhouette, cycling.
 *
 * The previous landing scattered seven of them at 13% opacity behind the copy,
 * where they read as smudges rather than as the game. The silhouette is the
 * only genuinely striking thing this product has; it belongs at full contrast
 * and at size, on its own — the headline beside it already says what the game
 * is, so a caption under the figure only repeated it.
 */
export function HeroSilhouette() {
  const [urls, setUrls] = useState<string[]>([]);
  const [index, setIndex] = useState(0);
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    fetch('/api/showcase')
      .then((r) => (r.ok ? r.json() : { silhouettes: [] }))
      .then((d) => setUrls(d.silhouettes ?? []))
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (urls.length < 2) return;

    const swap = setInterval(() => {
      // Fade out, change, fade back in — a hard cut reads as a glitch.
      setVisible(false);
      setTimeout(() => {
        setIndex((i) => (i + 1) % urls.length);
        setVisible(true);
      }, 420);
    }, 3600);

    return () => clearInterval(swap);
  }, [urls]);

  return (
    <div className="relative flex min-h-[260px] items-center justify-center sm:min-h-[420px] lg:min-h-[520px]">
      {/* The glow is capped at the container width rather than clipped by it.
          A fixed 420px box overflowed a 390px phone, and hiding the overflow
          traded the sideways scroll for a visible rectangular edge across the
          blur — the blur reaches the box corners, so there was nothing safe to
          cut. Capping the width means there is no overflow to hide. */}
      <div
        aria-hidden
        className="pointer-events-none absolute left-1/2 top-1/2 h-[420px] w-full max-w-[420px] -translate-x-1/2 -translate-y-1/2 rounded-full blur-3xl sm:h-[560px] sm:max-w-[560px]"
        style={{ background: 'radial-gradient(circle, rgba(245,130,31,0.35), transparent 62%)' }}
      />

      {urls.length > 0 && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={urls[index]}
          alt="Silueta de un futbolista por identificar"
          className="relative max-h-[240px] w-auto object-contain transition-all duration-500 sm:max-h-[400px] lg:max-h-[500px]"
          style={{
            opacity: visible ? 1 : 0,
            transform: visible ? 'scale(1)' : 'scale(0.96)',
            filter:
              'brightness(0) saturate(100%) invert(96%) sepia(6%) saturate(300%) hue-rotate(190deg) drop-shadow(0 0 40px rgba(245,130,31,0.45))',
          }}
        />
      )}
    </div>
  );
}
