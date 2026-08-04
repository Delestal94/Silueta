'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

export interface Ask {
  title: string;
  body?: string;
  /** Label of the button that goes through with it. */
  confirm: string;
  cancel?: string;
  /** Paints the confirm button red, for anything that loses something. */
  danger?: boolean;
}

/**
 * A confirmation the page draws itself.
 *
 * `window.confirm` prints the hostname above the question — "silumatch.vercel.app
 * dice:" — in the browser's own chrome, which reads like a warning from the
 * browser about the site rather than a question from the game. It also blocks
 * the main thread, which in a room means the ten-second round clock and the
 * realtime updates freeze until it is answered.
 *
 * Used through `useConfirm`, which keeps the caller's `if (await ask(...))`
 * shape so it reads the same as the confirm() it replaces.
 */
export function useConfirm() {
  const [ask, setAsk] = useState<Ask | null>(null);
  const decide = useRef<((ok: boolean) => void) | null>(null);

  const confirm = useCallback((question: Ask) => {
    setAsk(question);
    return new Promise<boolean>((resolve) => {
      decide.current = resolve;
    });
  }, []);

  const close = useCallback((ok: boolean) => {
    setAsk(null);
    decide.current?.(ok);
    decide.current = null;
  }, []);

  const dialog = ask ? <ConfirmDialog ask={ask} onDone={close} /> : null;

  return { confirm, dialog };
}

function ConfirmDialog({ ask, onDone }: { ask: Ask; onDone: (ok: boolean) => void }) {
  const accept = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onDone(false);
      if (e.key === 'Enter') onDone(true);
    };
    document.addEventListener('keydown', onKey);

    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    accept.current?.focus();

    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = previous;
    };
  }, [onDone]);

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
      onClick={() => onDone(false)}
      role="dialog"
      aria-modal="true"
      aria-label={ask.title}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="panel animate-rise w-full max-w-sm p-6 text-center"
      >
        <h2 className="text-xl font-black leading-tight">{ask.title}</h2>
        {ask.body && <p className="mt-2 text-sm leading-snug text-white/60">{ask.body}</p>}

        {/* Cancel first, and it is the one that keeps the focus ring by
            default on a destructive question — the cheap way out should not be
            the one you have to aim for. */}
        <div className="mt-6 flex gap-3">
          <button onClick={() => onDone(false)} className="btn-ghost flex-1">
            {ask.cancel ?? 'Cancelar'}
          </button>
          <button
            ref={accept}
            onClick={() => onDone(true)}
            className={`flex-1 rounded-xl px-4 py-3 font-bold transition ${
              ask.danger
                ? 'bg-rose-500 text-white hover:bg-rose-400'
                : 'btn-primary'
            }`}
          >
            {ask.confirm}
          </button>
        </div>
      </div>
    </div>
  );
}
