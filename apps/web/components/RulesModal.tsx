'use client';

import { useEffect, useRef } from 'react';
import { Rules } from './Rules';

export function RulesModal({ onClose }: { onClose: () => void }) {
  const panel = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);

    // Reading the rules should not scroll the auction behind the overlay.
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    panel.current?.focus();

    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = previous;
    };
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/70 p-4 backdrop-blur-sm"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Reglas del juego"
    >
      <div
        ref={panel}
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
        className="panel animate-rise my-8 w-full max-w-2xl p-6 outline-none sm:p-8"
      >
        <div className="mb-5 flex items-start justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-[0.25em] text-lime-300/70">Siluetas</p>
            <h2 className="text-2xl font-black">Reglas</h2>
          </div>
          <button onClick={onClose} className="btn-ghost px-3 py-1.5 text-sm" autoFocus>
            Cerrar
          </button>
        </div>

        <Rules compact />

        <button onClick={onClose} className="btn-primary mt-6 w-full">
          Entendido
        </button>
      </div>
    </div>
  );
}
