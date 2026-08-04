'use client';

import { useState } from 'react';

/**
 * The badge, with a wordmark fallback.
 *
 * The image lives in `public/logo.png`. If it is missing the page still reads
 * as branded rather than showing a broken image — a landing page is the worst
 * place to advertise a missing file.
 */
export function Logo({ size = 128, className = '' }: { size?: number; className?: string }) {
  const [failed, setFailed] = useState(false);

  if (failed) {
    return (
      <span
        className={`flex items-baseline justify-center font-black tracking-tight ${className}`}
        style={{ fontSize: size * 0.32, lineHeight: 1.1 }}
      >
        <span className="text-white">SILU</span>
        <span className="text-orange-500">MATCH</span>
      </span>
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src="/logo.png"
      alt="Silumatch"
      width={size}
      height={size}
      onError={() => setFailed(true)}
      className={`object-contain drop-shadow-[0_10px_40px_rgba(245,130,31,0.35)] ${className}`}
      style={{ width: size, height: size }}
    />
  );
}
