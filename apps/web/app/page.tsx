'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

type Mode = 'menu' | 'create' | 'join';

export default function Home() {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>('menu');
  const [displayName, setDisplayName] = useState('');
  const [roomCode, setRoomCode] = useState('');
  const [budget, setBudget] = useState(200);
  const [roundSeconds, setRoundSeconds] = useState(20);
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

  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-10">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <p className="text-xs uppercase tracking-[0.35em] text-lime-300/70">Subasta futbolera</p>
          <h1 className="mt-2 text-5xl font-black tracking-tight">SILUETAS</h1>
          <p className="mt-3 text-white/55">
            Aparece la silueta de un futbolista. Pujás a ciegas. El nombre se revela recién cuando
            cierra la puja.
          </p>
        </div>

        {stuckAt && (
          <div className="panel animate-rise mb-4 border-lime-300/30 p-4 text-center">
            <p className="text-sm text-white/70">Ya estás en la sala, pero no te redirigió.</p>
            {/* Deliberately a full page load: if the client-side router is the
                thing that stalled, a <Link> would stall with it. */}
            {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
            <a href={`/room/${stuckAt}`} className="btn-primary mt-3 w-full">
              Entrar a {stuckAt}
            </a>
          </div>
        )}

        <div className="panel p-6">
          {mode === 'menu' && (
            <div className="animate-rise space-y-3">
              <button onClick={() => setMode('create')} className="btn-primary w-full py-3 text-lg">
                Crear sala
              </button>
              <button onClick={() => setMode('join')} className="btn-ghost w-full py-3 text-lg">
                Unirme con un código
              </button>
            </div>
          )}

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
                    min={8}
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

        <p className="mt-6 text-center text-xs text-white/35">
          Armá tu equipo: 1 arquero, 2 defensas, 1 mediocampista y 1 delantero.
        </p>
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
                ? 'bg-lime-300 text-emerald-950'
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
