'use client';

import { useCallback, useState } from 'react';

export interface Toast {
  id: number;
  message: string;
  tone: 'error' | 'success' | 'info';
}

export function useToasts() {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const push = useCallback((message: string, tone: Toast['tone'] = 'info') => {
    const id = Date.now() + Math.random();
    setToasts((prev) => [...prev, { id, message, tone }]);
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 3600);
  }, []);

  return { toasts, push };
}

const TONES: Record<Toast['tone'], string> = {
  error: 'border-rose-400/40 bg-rose-500/15 text-rose-100',
  success: 'border-orange-400/40 bg-orange-400/15 text-orange-100',
  info: 'border-white/20 bg-white/10 text-white',
};

export function Toasts({ toasts }: { toasts: Toast[] }) {
  return (
    <div
      className="pointer-events-none fixed inset-x-0 top-4 z-50 flex flex-col items-center gap-2 px-4"
      role="status"
      aria-live="polite"
    >
      {toasts.map((t) => (
        <div
          key={t.id}
          className={`animate-rise max-w-md rounded-xl border px-4 py-2.5 text-sm font-medium shadow-lg backdrop-blur-xl ${TONES[t.tone]}`}
        >
          {t.message}
        </div>
      ))}
    </div>
  );
}
