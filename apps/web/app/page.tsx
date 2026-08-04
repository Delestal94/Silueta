'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Rules } from '@/components/Rules';
import { Leaderboard } from '@/components/Leaderboard';
import { SilhouetteStrip } from '@/components/SilhouetteStrip';
import { Logo } from '@/components/Logo';

type Mode = 'menu' | 'create' | 'join';

export default function Home() {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>('menu');
  const [displayName, setDisplayName] = useState('');
  const [roomCode, setRoomCode] = useState('');
  const [budget, setBudget] = useState(200);
  const [roundSeconds, setRoundSeconds] = useState(10);
  const [genderFilter, setGenderFilter] = useState<'men' | 'women' | 'any'>('any');
  const [pool, setPool] = useState<'famous' | 'all'>('famous');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [stuckAt, setStuckAt] = useState<string | null>(null);

  const enterRoom = (code: string, tokens: { clientToken: string; hostToken?: string }) => {
    try {
      localStorage.setItem(
        `room_${code}`,
        JSON.stringify({ ...tokens, displayName: displayName.trim() })
      );
    } catch {
      // Private browsing and some hardened setups block storage outright.
      throw new Error(
        'Tu navegador está bloqueando el almacenamiento local. Probá sin modo incógnito.'
      );
    }

    // replace, not push: the back button should not return to a form whose
    // submission already happened.
    router.replace(`/room/${code}`);

    // The seat is already taken on the server at this point. If the client-side
    // navigation stalls, the player would sit on "Entrando…" with no way out,
    // so offer a plain link instead.
    setTimeout(() => setStuckAt(code), 5000);
  };

  const createRoom = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const res = await fetch('/api/rooms', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          displayName: displayName.trim(),
          startingBudget: budget,
          roundSeconds,
          genderFilter,
          pool,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'No se pudo crear la sala');
      enterRoom(data.code, { clientToken: data.clientToken, hostToken: data.hostToken });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo crear la sala');
      setLoading(false);
    }
  };

  const joinRoom = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    const code = roomCode.trim().toUpperCase();

    try {
      // Already holding a seat in this room (a retry after a stalled
      // navigation): go straight in, or the server would reject the name as
      // taken — by us.
      const existing = localStorage.getItem(`room_${code}`);
      if (existing) {
        router.replace(`/room/${code}`);
        setTimeout(() => setStuckAt(code), 5000);
        return;
      }

      const res = await fetch(`/api/rooms/${code}/join`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code, displayName: displayName.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'No se pudo entrar');
      enterRoom(code, { clientToken: data.clientToken });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo entrar');
      setLoading(false);
    }
  };

  // Away from the menu the page is a single form, and a form reads better
  // narrow than spread across a desktop monitor.
  const focused = mode !== 'menu';

  return (
    <main className="min-h-screen px-4 py-8 sm:px-6 sm:py-12">
      <div className={`mx-auto w-full ${focused ? 'max-w-md' : 'max-w-6xl'}`}>

        {stuckAt && (
          <div className="panel animate-rise mb-4 border-orange-400/30 p-4 text-center">
            <p className="text-sm text-white/70">Ya estás en la sala, pero no te redirigió.</p>
            {/* Deliberately a full page load: if the client-side router is the
                thing that stalled, a <Link> would stall with it. */}
            {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
            <a href={`/room/${stuckAt}`} className="btn-primary mt-3 w-full">
              Entrar a {stuckAt}
            </a>
          </div>
        )}

        {/* Hero and ranking sit side by side on a wide screen: stacking them
            left a 576px column adrift in two thousand pixels of nothing. */}
        <div
          className={
            focused ? '' : 'grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,420px)]'
          }
        >
          <div>
            {/* Hidden once a form is open: leaving it up meant two "Crear
                sala" buttons on screen at the same time. */}
            {!focused && (
            <section className="panel relative isolate overflow-hidden px-6 py-10 text-center lg:py-14">
              <SilhouetteStrip />
              <div
                aria-hidden
                className="pointer-events-none absolute left-1/2 top-0 h-[460px] w-[460px] -translate-x-1/2 -translate-y-1/2 rounded-full blur-3xl"
                style={{
                  background: 'radial-gradient(circle, rgba(245,130,31,0.24), transparent 65%)',
                }}
              />
              <div className="relative">
                {/* The badge already carries the wordmark, so repeating it as
                    a heading said the name twice. The h1 stays for structure
                    and screen readers. */}
                <h1 className="sr-only">Silumatch — El juego de adivinar futbolistas</h1>
                <Logo size={168} className="mx-auto" />
                <p className="mt-4 text-xs uppercase tracking-[0.3em] text-white/40">
                  El juego de adivinar · Fútbol &amp; Siluetas
                </p>

                <p className="mx-auto mt-5 max-w-lg text-white/60 sm:text-lg">
                  Aparece la silueta de un futbolista. Pujás a ciegas, sin saber quién es{' '}
                  <em className="not-italic text-white/85">ni de qué momento de su carrera</em>. El
                  nombre se revela recién cuando cierra la puja.
                </p>

                <div className="mx-auto mt-7 flex max-w-md flex-col gap-3 sm:flex-row">
                  <button
                    onClick={() => setMode('create')}
                    className="btn-primary flex-1 py-3 text-lg"
                  >
                    Crear sala
                  </button>
                  <button
                    onClick={() => setMode('join')}
                    className="btn-ghost flex-1 py-3 text-lg"
                  >
                    Unirme con un código
                  </button>
                </div>

                <p className="mt-5 text-xs text-white/40">
                  1 arquero · 2 defensas · 1 mediocampista · 1 delantero
                </p>
                <p className="mt-2 text-sm">
                  <Link href="/jugadores" className="text-white/45 underline hover:text-white">
                    ¿Falta un jugador? Proponelo
                  </Link>
                </p>
              </div>
            </section>
            )}

            {!focused && (
              <div className="mt-6 grid gap-4 sm:grid-cols-3">
                {(
                  [
                    ['🕵️', 'Adiviná a ciegas', 'Sólo ves la silueta. El nombre aparece al cerrar la puja.'],
                    ['⏳', 'Y de qué época', 'Cada ronda sortea un momento de su carrera. No es lo mismo el 86 que el 96.'],
                    ['🪄', 'Saboteá al rival', 'Gastá presupuesto en poderes: apagones, espejismos, impuestos.'],
                  ] as [string, string, string][]
                ).map(([icon, title, text]) => (
                  <div key={title} className="panel p-5 text-left">
                    <span className="text-2xl" aria-hidden>
                      {icon}
                    </span>
                    <h3 className="mt-2 font-bold">{title}</h3>
                    <p className="mt-1 text-sm leading-snug text-white/55">{text}</p>
                  </div>
                ))}
              </div>
            )}
          </div>

          {!focused && (
            <div className="lg:sticky lg:top-8">
              <Leaderboard />
            </div>
          )}
        </div>

        <div className={focused ? 'panel p-6' : 'hidden'}>

          {mode === 'create' && (
            <form onSubmit={createRoom} className="animate-rise space-y-4">
              <Field label="Tu nombre">
                <input
                  autoFocus
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  maxLength={24}
                  placeholder="Ej: Davo"
                  className="field"
                />
              </Field>

              <div className="grid grid-cols-2 gap-3">
                <Field label="Presupuesto">
                  <input
                    type="number"
                    value={budget}
                    min={50}
                    max={1000}
                    step={10}
                    onChange={(e) => setBudget(Number(e.target.value))}
                    className="field"
                  />
                </Field>
                <Field label="Segundos por ronda">
                  <input
                    type="number"
                    value={roundSeconds}
                    min={5}
                    max={120}
                    onChange={(e) => setRoundSeconds(Number(e.target.value))}
                    className="field"
                  />
                </Field>
              </div>

              <Choice
                label="Jugadores"
                value={genderFilter}
                onChange={setGenderFilter}
                options={[
                  { value: 'any', label: 'Ambos' },
                  { value: 'men', label: 'Masculino' },
                  { value: 'women', label: 'Femenino' },
                ]}
              />

              <Choice
                label="Catálogo"
                value={pool}
                onChange={setPool}
                options={[
                  { value: 'famous', label: 'Más famosos' },
                  { value: 'all', label: 'Todos' },
                ]}
                hint={
                  pool === 'famous'
                    ? 'Sólo el top del ranking de EA — más fáciles de reconocer.'
                    : 'Todo el catálogo, incluidos jugadores menos conocidos.'
                }
              />

              {error && <Alert>{error}</Alert>}

              <button
                type="submit"
                disabled={loading || !displayName.trim()}
                className="btn-primary w-full py-3"
              >
                {loading ? 'Creando…' : 'Crear sala'}
              </button>
              <BackButton onClick={() => setMode('menu')} />
            </form>
          )}

          {mode === 'join' && (
            <form onSubmit={joinRoom} className="animate-rise space-y-4">
              <Field label="Código de sala">
                <input
                  autoFocus
                  value={roomCode}
                  onChange={(e) => setRoomCode(e.target.value.toUpperCase())}
                  maxLength={10}
                  placeholder="ABC123"
                  className="field text-center font-mono text-2xl tracking-[0.4em]"
                />
              </Field>

              <Field label="Tu nombre">
                <input
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  maxLength={24}
                  placeholder="Ej: La Cobra"
                  className="field"
                />
              </Field>

              {error && <Alert>{error}</Alert>}

              <button
                type="submit"
                disabled={loading || !displayName.trim() || roomCode.trim().length < 3}
                className="btn-primary w-full py-3"
              >
                {loading ? 'Entrando…' : 'Entrar'}
              </button>
              <BackButton onClick={() => setMode('menu')} />
            </form>
          )}
        </div>


        {!focused && (
          <section className="panel mt-6 p-6 sm:p-8">
            <h2 className="mb-6 text-center text-2xl font-black">Cómo se juega</h2>
            {/* Two columns on a wide screen: one long ribbon of text was the
                least readable shape for the widest viewport. */}
            <Rules columns />
          </section>
        )}
      </div>
    </main>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs uppercase tracking-wider text-white/50">{label}</span>
      {children}
    </label>
  );
}

function Choice<T extends string>({
  label,
  value,
  onChange,
  options,
  hint,
}: {
  label: string;
  value: T;
  onChange: (value: T) => void;
  options: { value: T; label: string }[];
  hint?: string;
}) {
  return (
    <div>
      <span className="mb-1.5 block text-xs uppercase tracking-wider text-white/50">{label}</span>
      <div
        role="radiogroup"
        aria-label={label}
        className="grid gap-1.5 rounded-xl border border-white/10 bg-black/25 p-1"
        style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}
      >
        {options.map((o) => (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={value === o.value}
            onClick={() => onChange(o.value)}
            className={`rounded-lg px-2 py-2 text-sm font-semibold transition ${
              value === o.value
                ? 'bg-orange-500 text-white'
                : 'text-white/60 hover:bg-white/5 hover:text-white'
            }`}
          >
            {o.label}
          </button>
        ))}
      </div>
      {hint && <p className="mt-1.5 text-xs text-white/40">{hint}</p>}
    </div>
  );
}

function Alert({ children }: { children: React.ReactNode }) {
  return (
    <p className="rounded-xl border border-rose-400/40 bg-rose-500/15 px-3 py-2 text-sm text-rose-100">
      {children}
    </p>
  );
}

function BackButton({ onClick }: { onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="w-full text-sm text-white/45 hover:text-white">
      Atrás
    </button>
  );
}
