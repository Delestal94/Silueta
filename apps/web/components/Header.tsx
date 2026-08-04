'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { getSupabaseClient } from '@/lib/supabase/client';
import { Logo } from './Logo';

interface Account {
  id: string;
  name: string;
  email: string | null;
  avatar: string | null;
}

/**
 * The bar at the top of the landing page.
 *
 * Signing in is optional and stays that way: the game is a code you paste into
 * WhatsApp, and putting a login in front of that would lose half the table. An
 * account buys exactly one thing, so that is what the button says — a row in
 * the ranking that is yours and nobody else's.
 */
export function Header() {
  const [account, setAccount] = useState<Account | null>(null);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const [open, setOpen] = useState(false);
  const menu = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (new URLSearchParams(window.location.search).get('auth') === 'error') setFailed(true);

    let live = true;

    getSupabaseClient()
      .then(async (supabase) => {
        // Un código de Google que aterrizó donde no debía.
        //
        // El flujo pide volver a /auth/callback, que lo canjea en el servidor.
        // Si esa URL no está en la lista de permitidas de Supabase, Supabase
        // descarta la ruta y devuelve al visitante a la Site URL con el código
        // colgando en la query — la sesión nunca se completa y el botón sigue
        // diciendo "Entrar con Google" sin explicar nada.
        //
        // El canje también se puede hacer acá: el verificador PKCE vive en una
        // cookie de este navegador, así que el código sirve igual. Arreglar la
        // configuración es lo correcto, pero un login que depende de que una
        // lista esté bien escrita se rompe en silencio, y esto no.
        const params = new URLSearchParams(window.location.search);
        const code = params.get('code');

        if (code) {
          await supabase.auth.exchangeCodeForSession(code).catch(() => {});
          // Fuera de la URL: recargar reintentaría un código ya gastado, y
          // además no es algo que uno quiera compartir por copiar y pegar.
          params.delete('code');
          const rest = params.toString();
          window.history.replaceState(
            {},
            '',
            window.location.pathname + (rest ? `?${rest}` : '')
          );
        }

        const read = async () => {
          const { data } = await supabase.auth.getUser();
          const u = data.user;
          if (!live) return;

          setAccount(
            u
              ? {
                  id: u.id,
                  name: u.user_metadata?.full_name ?? u.user_metadata?.name ?? 'Vos',
                  email: u.email ?? null,
                  avatar: u.user_metadata?.avatar_url ?? u.user_metadata?.picture ?? null,
                }
              : null
          );
          setReady(true);
        };

        await read();
        // Signing in and out both happen without a reload.
        const { data } = supabase.auth.onAuthStateChange(() => read());
        return () => data.subscription.unsubscribe();
      })
      .catch(() => live && setReady(true));

    return () => {
      live = false;
    };
  }, []);

  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent) =>
      menu.current && !menu.current.contains(e.target as Node) && setOpen(false);
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);

    document.addEventListener('mousedown', away);
    document.addEventListener('keydown', esc);
    return () => {
      document.removeEventListener('mousedown', away);
      document.removeEventListener('keydown', esc);
    };
  }, [open]);

  const signIn = async () => {
    const supabase = await getSupabaseClient();
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        // Back to where they were, not always the home page.
        redirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(
          window.location.pathname
        )}`,
      },
    });
  };

  const signOut = async () => {
    const supabase = await getSupabaseClient();
    await supabase.auth.signOut();
    setOpen(false);
  };

  return (
    <header className="mx-auto mb-6 flex w-full max-w-[1700px] items-center justify-between gap-4">
      <Link href="/" className="flex items-center gap-2.5" aria-label="Silumatch">
        <Logo size={40} />
        <span className="hidden text-lg font-black tracking-tight sm:block">
          SILU<span className="text-orange-500">MATCH</span>
        </span>
      </Link>

      <div className="flex items-center gap-2">
        {failed && (
          <span className="hidden text-xs text-rose-300 sm:block">No se pudo entrar con Google.</span>
        )}

        {/* Nothing until we know: a "sign in" button that flips to an avatar a
            moment later reads as a glitch. */}
        {!ready ? null : account ? (
          <div className="relative" ref={menu}>
            <button
              onClick={() => setOpen((v) => !v)}
              aria-expanded={open}
              aria-haspopup="menu"
              className="flex min-h-[44px] items-center gap-2 rounded-xl border border-white/15 bg-white/5 px-2.5 py-1.5 transition hover:bg-white/10"
            >
              <Avatar account={account} />
              <span className="hidden max-w-[9rem] truncate text-sm font-semibold sm:block">
                {account.name}
              </span>
            </button>

            {open && (
              <div
                role="menu"
                className="panel animate-rise absolute right-0 top-full z-50 mt-2 w-60 p-3 text-left"
              >
                <p className="truncate text-sm font-semibold">{account.name}</p>
                {account.email && (
                  <p className="truncate text-xs text-white/40">{account.email}</p>
                )}
                <p className="mt-2 rounded-lg bg-orange-400/10 px-2 py-1.5 text-[11px] leading-snug text-orange-300/80">
                  Tus partidas se guardan en tu propia fila del ranking.
                </p>
                <button
                  onClick={signOut}
                  role="menuitem"
                  className="mt-2 w-full rounded-lg border border-white/10 py-2 text-sm text-white/60 transition hover:border-white/25 hover:text-white"
                >
                  Cerrar sesión
                </button>
              </div>
            )}
          </div>
        ) : (
          <button
            onClick={signIn}
            className="flex min-h-[44px] items-center gap-2 rounded-xl border border-white/15 bg-white/5 px-3.5 py-2 text-sm font-semibold transition hover:bg-white/10"
          >
            <GoogleMark />
            <span className="hidden sm:block">Entrar con Google</span>
            <span className="sm:hidden">Entrar</span>
          </button>
        )}
      </div>
    </header>
  );
}

function Avatar({ account }: { account: Account }) {
  const [broken, setBroken] = useState(false);

  if (account.avatar && !broken) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={account.avatar}
        alt=""
        onError={() => setBroken(true)}
        className="h-7 w-7 shrink-0 rounded-full object-cover"
      />
    );
  }

  return (
    <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-orange-500 text-xs font-black">
      {account.name.trim().charAt(0).toUpperCase() || '?'}
    </span>
  );
}

/** Google asks that the mark keep its own colours, so it is not currentColor. */
function GoogleMark() {
  return (
    <svg viewBox="0 0 48 48" className="h-4 w-4 shrink-0" aria-hidden>
      <path
        fill="#4285F4"
        d="M45.1 24.5c0-1.6-.1-3.1-.4-4.5H24v8.5h11.8c-.5 2.7-2 5-4.4 6.6v5.5h7.1c4.2-3.8 6.6-9.5 6.6-16.1z"
      />
      <path
        fill="#34A853"
        d="M24 46c6 0 11-2 14.6-5.4l-7.1-5.5c-2 1.3-4.5 2.1-7.5 2.1-5.8 0-10.6-3.9-12.4-9.1H4.3v5.7C7.9 41.1 15.4 46 24 46z"
      />
      <path
        fill="#FBBC05"
        d="M11.6 28.1c-.5-1.3-.7-2.7-.7-4.1s.3-2.8.7-4.1v-5.7H4.3C2.8 17.1 2 20.4 2 24s.8 6.9 2.3 9.8l7.3-5.7z"
      />
      <path
        fill="#EA4335"
        d="M24 10.8c3.3 0 6.2 1.1 8.5 3.3l6.3-6.3C35 4.2 30 2 24 2 15.4 2 7.9 6.9 4.3 14.2l7.3 5.7c1.8-5.2 6.6-9.1 12.4-9.1z"
      />
    </svg>
  );
}
