'use client';

import { useEffect, useState } from 'react';

/**
 * One large silhouette, cycling.
 *
 * The previous landing scattered seven of them at 13% opacity behind the copy,
 * where they read as smudges rather than as the game. The silhouette is the
 * only genuinely striking thing this product has; it belongs at full contrast,
 * at size, with the question the game actually asks written under it.
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
    // The glow below is a 420px box on what can be a 390px screen, which gave
    // the phone 15px of sideways scroll. Its gradient is already transparent
    // well before the box edge, so clipping costs nothing visually.
    <div className="relative flex min-h-[260px] items-center justify-center overflow-hidden sm:min-h-[420px] lg:min-h-[520px]">
      <div
        aria-hidden
        className="pointer-events-none absolute left-1/2 top-1/2 h-[420px] w-[420px] -translate-x-1/2 -translate-y-1/2 rounded-full blur-3xl sm:h-[560px] sm:w-[560px]"
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

      <span className="absolute bottom-0 rounded-full border border-orange-400/30 bg-black/40 px-4 py-1.5 text-sm font-semibold text-orange-300 backdrop-blur">
        ¿Quién es?
      </span>
    </div>
  );
}
