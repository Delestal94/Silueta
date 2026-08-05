'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Leaderboard } from '@/components/Leaderboard';
import { Scoreboard } from '@/components/Scoreboard';
import { HeroSilhouette } from '@/components/HeroSilhouette';
import { RulesModal } from '@/components/RulesModal';
import { Footer } from '@/components/Footer';
import { Header } from '@/components/Header';

type Mode = 'menu' | 'create' | 'join';

export default function Home() {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>('menu');
  const [displayName, setDisplayName] = useState('');
  const [roomCode, setRoomCode] = useState('');
  const [budget, setBudget] = useState(200);
  const [roundSeconds, setRoundSeconds] = useState(10);
  const [genderFilter, setGenderFilter] = useState<'men' | 'women' | 'any'>('any');
  const [pool, setPool] = useState<'famous' | 'all' | 'balanced'>('famous');
  const [auctionMode, setAuctionMode] = useState<'open' | 'sealed'>('open');
  const [includeLegends, setIncludeLegends] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [stuckAt, setStuckAt] = useState<string | null>(null);
  const [showRules, setShowRules] = useState(false);

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
          auctionMode,
          includeLegends,
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
      {showRules && <RulesModal onClose={() => setShowRules(false)} />}
      <Header />
      <div
        className={
          focused
            ? 'mx-auto w-full max-w-md'
            : // The rails live at the far edges of the viewport; a centred
              // 1152px container left a third of a wide monitor empty beside it.
              // Flex below xl rather than plain block, because `order` only
              // applies to flex and grid children — as a block the scoreboard
              // sat first in the DOM and pushed the headline off a phone screen.
              'mx-auto flex w-full max-w-[1700px] flex-col xl:grid xl:grid-cols-[300px_minmax(0,1fr)_340px] xl:items-start xl:gap-6'
        }
      >
        {!focused && (
          <aside className="order-2 mt-6 xl:order-none xl:sticky xl:top-8 xl:mt-0">
            <Scoreboard />
          </aside>
        )}

        <div className="order-1 min-w-0 xl:order-none">

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

        {!focused && (
          <>
            {/* Split hero: the copy earns the left, the silhouette owns the
                right. Centring text in a panel gave the widest viewport
                nothing to look at. */}
            <section className="relative isolate grid items-center gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,46%)]">
              <div className="relative text-center lg:text-left">
                {/* No badge here any more: the header carries it a few pixels
                    above, and two of the same logo on one screen just reads as
                    a mistake. */}
                <h1 className="text-[2.6rem] font-black leading-[0.95] tracking-tight sm:text-6xl lg:text-7xl">
                  Adiviná al
                  <br />
                  futbolista
                  <br />
                  <span className="text-orange-500">a ciegas.</span>
                </h1>

                <p className="mx-auto mt-4 max-w-md text-white/60 sm:text-lg lg:mx-0 lg:mt-6">
                  Aparece una silueta y todos ofertan sin saber quién es{' '}
                  <em className="not-italic text-white">ni de qué momento de su carrera</em>. El
                  nombre se revela recién cuando cierra la ronda.
                </p>

                <div className="mt-6 flex flex-col gap-2.5 sm:flex-row sm:justify-center lg:mt-8 lg:justify-start">
                  <button
                    onClick={() => setMode('create')}
                    className="btn-primary px-8 py-3 text-lg"
                  >
                    Crear sala
                  </button>
                  <button
                    onClick={() => setMode('join')}
                    className="btn-ghost px-8 py-3 text-lg"
                  >
                    Unirme con un código
                  </button>
                </div>

                <p className="mt-5 text-sm text-white/40">
                  Gratis · sin cuenta · de 2 a 12 jugadores
                </p>
                {/* Proponer jugadores queda deshabilitado por seguridad: es la
                    única puerta por la que entra contenido de gente de afuera,
                    y hasta que la moderación esté cerrada no conviene
                    anunciarla. La página sigue existiendo para el moderador.
                    Para volver a habilitarlo hay que reponer el import de Link.
                <p className="mt-2 text-sm">
                  <Link href="/jugadores" className="text-white/45 underline hover:text-white">
                    ¿Falta un jugador? Proponelo
                  </Link>
                </p>
                */}
              </div>

              <HeroSilhouette />
            </section>

            {/* Four beats instead of nine hundred pixels of documentation. */}
            <section className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {(
                [
                  ['silueta', 'Sólo la silueta', 'Ni nombre ni club hasta que cierra la ronda.'],
                  ['epoca', 'Y qué época', 'El Maradona del 86 vale 95. El del 96, 86.'],
                  ['poderes', 'Poderes', 'Apagones, espejismos e impuestos para el rival.'],
                  ['trofeo', 'Gana el mejor equipo', 'Cinco fichajes, más puntos, menos gastado.'],
                ] as [string, string, string][]
              ).map(([icon, title, text]) => (
                <div
                  key={title}
                  className="panel border-t-2 border-t-orange-500/50 p-5 transition hover:bg-white/[0.06]"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={`/icons/${icon}.png`}
                    alt=""
                    width={44}
                    height={44}
                    loading="lazy"
                    className="h-11 w-11"
                  />
                  <h3 className="mt-2.5 font-bold">{title}</h3>
                  <p className="mt-1 text-sm leading-snug text-white/55">{text}</p>
                </div>
              ))}
            </section>

            <div className="mt-6">
              <section className="panel relative overflow-hidden p-6 sm:p-8">
                <div
                  aria-hidden
                  className="pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full blur-3xl"
                  style={{
                    background: 'radial-gradient(circle, rgba(245,130,31,0.22), transparent 65%)',
                  }}
                />
                <div className="relative">
                  <h2 className="text-2xl font-black sm:text-3xl">
                    ¿Cómo se <span className="text-orange-500">juega</span>?
                  </h2>

                  <div className="mt-5 grid gap-5 sm:grid-cols-2">
                    <div>
                      <h3 className="font-bold text-white">Las rondas van por puesto</h3>
                      <p className="mt-1.5 text-white/60">
                        Primero todos los arqueros, después los defensas, y así. Cuando nadie
                        necesita más de un puesto, se pasa al siguiente solo.
                      </p>
                    </div>
                    <div>
                      <h3 className="font-bold text-white">Dos formas de ofertar</h3>
                      <p className="mt-1.5 text-white/60">
                        A puja abierta ves lo que ofrece el resto y cada puja reinicia el reloj. A
                        sobre cerrado anotás en secreto tu máximo y todos se abren al final.
                      </p>
                    </div>
                    <div>
                      <h3 className="font-bold text-white">Un pase por puesto</h3>
                      <p className="mt-1.5 text-white/60">
                        Y si nadie oferta, el jugador se sortea igual entre los que todavía lo
                        necesitan. Quedarte quieto no te salva.
                      </p>
                    </div>
                    <div>
                      <h3 className="font-bold text-white">La ronda a ciegas</h3>
                      <p className="mt-1.5 text-white/60">
                        De vez en cuando llega una ronda sin silueta para nadie: sólo la
                        nacionalidad, la temporada y los títulos que ganó.
                      </p>
                    </div>
                  </div>

                  <button onClick={() => setShowRules(true)} className="btn-ghost mt-7">
                    Ver las reglas completas
                  </button>
                </div>
              </section>
            </div>
          </>
        )}

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
                  { value: 'balanced', label: 'Equilibrado' },
                  { value: 'all', label: 'Todos' },
                ]}
                hint={
                  pool === 'famous'
                    ? 'Sólo el top del ranking de fama — más fáciles de reconocer.'
                    : pool === 'balanced'
                      ? 'Mitad y mitad: cada ronda sortea si el jugador sale de los famosos o del resto.'
                      : 'Todo el catálogo, incluidos jugadores menos conocidos.'
                }
              />

              <Choice
                label="Modo de subasta"
                value={auctionMode}
                onChange={setAuctionMode}
                options={[
                  { value: 'open', label: 'Puja abierta' },
                  { value: 'sealed', label: 'Sobre cerrado' },
                ]}
                hint={
                  auctionMode === 'open'
                    ? 'Se ve lo que puja el resto y se puede responder. Cada puja reinicia el reloj.'
                    : 'Cada uno anota en secreto el máximo que pagaría. Al cerrar se abren todos los sobres y gana el más alto.'
                }
              />

              <Toggle
                label="Leyendas retiradas"
                hint="Maradona, Pelé, Cruyff y compañía entran al sorteo. Como su fama está puesta a mano y bien alta, en «más famosos» salen seguido."
                checked={includeLegends}
                onChange={setIncludeLegends}
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
        </div>

        {!focused && (
          <aside className="order-3 mt-6 xl:order-none xl:sticky xl:top-8 xl:mt-0">
            <Leaderboard />
          </aside>
        )}
      </div>

      {/* Not while a form has the screen: the footer belongs to the landing
          page, not to the two fields you are filling in. */}
      {!focused && <Footer />}
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

function Toggle({
  label,
  hint,
  checked,
  onChange,
}: {
  label: string;
  hint: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-white/10 bg-black/25 p-3">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-0.5 h-5 w-5 shrink-0 accent-orange-500"
      />
      <span className="min-w-0">
        <span className="block text-sm font-semibold">{label}</span>
        <span className="block text-xs leading-snug text-white/45">{hint}</span>
      </span>
    </label>
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
