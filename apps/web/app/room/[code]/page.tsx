'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useGameState } from '@/lib/game/useGameState';
import {
  POSITION_LABELS,
  POSITION_ORDER,
  POSITION_SHORT,
  countByPosition,
  hasPass,
  isTeamComplete,
  totalPoints,
  type Participant,
  type PositionType,
  type Room,
} from '@/lib/game/types';
import { SilhouetteStage } from '@/components/SilhouetteStage';
import { MysteryEnvelope } from '@/components/MysteryEnvelope';
import { RevealCard } from '@/components/RevealCard';
import { RosterRail } from '@/components/RosterRail';
import { FinalStandings } from '@/components/FinalStandings';
import { Toasts, useToasts } from '@/components/Toasts';
import { PowerPanel } from '@/components/PowerPanel';
import { RulesModal } from '@/components/RulesModal';
import { POWER_BY_ID, type PowerId } from '@/lib/game/powers';
import type { GameState } from '@/lib/game/types';

const BID_STEPS = [3, 5, 10, 25];

export default function RoomPage() {
  const { code } = useParams<{ code: string }>();
  const [identity, setIdentity] = useState<{
    clientToken: string;
    hostToken?: string;
    displayName: string;
  } | null>(null);
  const [identityMissing, setIdentityMissing] = useState(false);

  useEffect(() => {
    const stored = localStorage.getItem(`room_${code}`);
    if (!stored) {
      setIdentityMissing(true);
      return;
    }
    try {
      setIdentity(JSON.parse(stored));
    } catch {
      setIdentityMissing(true);
    }
  }, [code]);

  const { state, error, loading, refresh, serverNow } = useGameState(
    code,
    identity?.clientToken ?? null
  );
  const { toasts, push } = useToasts();

  // Ticks on the server's clock, not this device's.
  const [now, setNow] = useState(() => serverNow());
  useEffect(() => {
    const t = setInterval(() => setNow(serverNow()), 200);
    return () => clearInterval(t);
  }, [serverNow]);

  const [busy, setBusy] = useState(false);
  const [flipping, setFlipping] = useState(false);
  const [showRules, setShowRules] = useState(false);
  const finalizedRef = useRef<string | null>(null);

  const room = state?.room;
  const round = state?.currentRound;
  const me = state?.me;

  const meParticipant = useMemo(
    () => room?.room_participants.find((p) => p.id === me?.id) ?? null,
    [room, me]
  );

  const msLeft = round?.status === 'active' ? new Date(round.ends_at).getTime() - now : 0;
  const secondsLeft = Math.max(0, Math.ceil(msLeft / 1000));

  // When our timer runs out we just re-read the room: the state endpoint
  // settles any round whose time is up, on the server's clock. Asking the
  // finalize endpoint directly would be the same request with an extra way to
  // fail — a bid placed at the last instant restarts the clock, so a client
  // holding the previous deadline would be told, correctly, that it asked too
  // early. Reading is never wrong, and the poll keeps trying by itself.
  useEffect(() => {
    if (!round || round.status !== 'active' || msLeft > -500) return;
    if (finalizedRef.current === round.id) return;
    finalizedRef.current = round.id;

    refresh().finally(() => {
      // A late bid may have pushed the deadline out; allow another attempt.
      finalizedRef.current = null;
    });
  }, [round, msLeft, refresh]);

  const act = useCallback(
    async (url: string, body?: unknown) => {
      if (!identity) return null;
      setBusy(true);
      try {
        const res = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-client-token': identity.clientToken,
            ...(identity.hostToken ? { 'x-host-token': identity.hostToken } : {}),
          },
          body: body ? JSON.stringify(body) : undefined,
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          push(data.error || 'Algo salió mal', 'error');
          return null;
        }
        await refresh();
        return data;
      } catch {
        push('Sin conexión con el servidor', 'error');
        return null;
      } finally {
        setBusy(false);
      }
    },
    [identity, push, refresh]
  );

  const startRound = useCallback(async () => {
    const data = await act('/api/rounds', { roomId: room?.id });
    if (data?.finished) push('¡Subasta terminada! Todos los equipos están completos.', 'success');
  }, [act, room?.id, push]);

  const placeBid = useCallback(
    (amount: number) => act(`/api/rounds/${round?.id}/bid`, { amount }),
    [act, round?.id]
  );

  const pass = useCallback(async () => {
    const data = await act(`/api/rounds/${round?.id}/pass`);
    if (data?.coin_flip) {
      setFlipping(true);
      setTimeout(() => setFlipping(false), 1900);
    } else if (data?.passed) {
      push('Pasaste. Si todos pasan, se sortea.', 'info');
    }
  }, [act, round?.id, push]);

  const markReady = useCallback(async () => {
    const data = await act(`/api/rooms/${code}/members`, { action: 'ready' });
    if (data && !data.started && data.total) {
      push(`Listo. Faltan ${data.total - data.ready}.`, 'info');
    }
  }, [act, code, push]);

  const leaveRoom = useCallback(async () => {
    if (!confirm('¿Salir de la sala? Perdés los jugadores que compraste.')) return;
    const data = await act(`/api/rooms/${code}/members`, { action: 'leave' });
    if (data) {
      localStorage.removeItem(`room_${code}`);
      window.location.href = '/';
    }
  }, [act, code]);

  const kick = useCallback(
    async (targetId: string, name: string) => {
      if (!confirm(`¿Echar a ${name} de la sala?`)) return;
      const data = await act(`/api/rooms/${code}/members`, { action: 'kick', targetId });
      if (data) push(`${name} salió de la sala`, 'info');
    },
    [act, code, push]
  );

  const castPower = useCallback(
    async (power: PowerId, targetId: string | null) => {
      const data = await act(`/api/rooms/${code}/powers`, { power, targetId });
      if (data) {
        const label = POWER_BY_ID[power].name;
        push(
          data.immediate ? `${label} aplicado` : `${label} listo para la próxima ronda`,
          'success'
        );
      }
    },
    [act, code, push]
  );

  // Someone opening a shared room link has no stored identity yet — let them
  // join right here instead of bouncing them to the home page.
  if (identityMissing) {
    return <JoinHere code={code} onJoined={setIdentity} />;
  }

  if (loading && !state) return <Centered>Cargando la sala…</Centered>;
  if (error && !state) {
    return (
      <Centered>
        <p className="text-red-300">{error}</p>
        <Link href="/" className="btn-ghost mt-4">
          Volver
        </Link>
      </Centered>
    );
  }
  if (!room || !state) return <Centered>Cargando…</Centered>;

  const requirements = room.requirements;
  const myCounts = meParticipant ? countByPosition(meParticipant) : null;
  const currentPos = (round?.position_type || room.current_position) as PositionType | null;

  const positionFull =
    currentPos && myCounts ? myCounts[currentPos] >= (requirements[currentPos] ?? 0) : false;

  const currentBid = round?.current_bid ?? 0;
  const iAmTopBidder = !!me && round?.current_bid_by === me.id;
  const budget = meParticipant?.remaining_budget ?? 0;

  const canBid =
    !!round &&
    round.status === 'active' &&
    secondsLeft > 0 &&
    !positionFull &&
    !iAmTopBidder &&
    !busy;

  const rivals = room.room_participants.filter((p) => p.id !== me?.id);
  const liveRound = round && round.status === 'active';

  const stage = liveRound ? (
    round.mystery && round.envelope ? (
      <MysteryEnvelope
        envelope={round.envelope}
        position={round.position_type}
        seasonYear={round.season_year}
        eraLabel={round.era_label}
        secondsLeft={secondsLeft}
        totalSeconds={room.round_seconds}
        currentBid={currentBid}
        topBidderName={
          room.room_participants.find((p) => p.id === round.current_bid_by)?.display_name ?? null
        }
      />
    ) : (
      <SilhouetteStage
        silhouetteUrl={round.player.silhouette_url}
        position={round.position_type}
        secondsLeft={secondsLeft}
        totalSeconds={room.round_seconds}
        currentBid={currentBid}
        topBidderName={
          room.room_participants.find((p) => p.id === round.current_bid_by)?.display_name ?? null
        }
        hex={round.myHex?.power ?? null}
      />
    )
  ) : round && round.revealed ? (
    <RevealCard
      round={round}
      winnerName={
        room.room_participants.find((p) => p.id === round.current_bid_by)?.display_name ?? null
      }
      isHost={!!identity?.hostToken}
      onNext={startRound}
      busy={busy}
    />
  ) : (
    <Idle
      isHost={!!identity?.hostToken}
      onStart={startRound}
      onReady={markReady}
      busy={busy}
      participants={room.room_participants}
      meId={me?.id ?? null}
    />
  );

  const controls = liveRound ? (
    <>
      {round.myHex && <HexNotice power={round.myHex.power} />}
      {round.tip && <TipNotice tip={round.tip} />}
      <BidPanel
        budget={budget}
        currentBid={currentBid}
        canBid={canBid}
        positionFull={positionFull}
        iAmTopBidder={iAmTopBidder}
        passesLeft={meParticipant && currentPos && hasPass(meParticipant, currentPos) ? 1 : 0}
        onBid={placeBid}
        onPass={pass}
        busy={busy}
      />
    </>
  ) : null;

  const rail = (
    <>
      <RosterRail
        room={room}
        meId={me?.id ?? null}
        topBidderId={liveRound ? round.current_bid_by : null}
        onKick={identity?.hostToken ? kick : undefined}
      />
      <PowerPanel
        rivals={rivals}
        budget={budget}
        effects={state.effects ?? []}
        meId={me?.id ?? null}
        onCast={castPower}
        busy={busy}
      />
      {meParticipant && <MyTeam participant={meParticipant} requirements={requirements} />}
    </>
  );

  return (
    <div className="min-h-screen px-3 py-3 sm:px-6 sm:py-5 lg:px-8">
      <Toasts toasts={toasts} />
      {flipping && <CoinFlip />}
      {showRules && <RulesModal onClose={() => setShowRules(false)} />}

      <div className="mx-auto max-w-7xl">
        <Header
          room={room}
          me={meParticipant}
          onOpenRules={() => setShowRules(true)}
          onLeave={leaveRoom}
        />

        {room.status === 'finished' ? (
          <FinalStandings room={room} />
        ) : (
          <>
            {/* Desktop: the stage takes the height left over so the bid
                controls stay on screen. Scrolling away from the silhouette to
                place a bid is fatal in a ten-second round. */}
            <div className="mt-4 hidden gap-5 lg:grid lg:grid-cols-[minmax(0,1fr)_360px]">
              <div className="flex flex-col gap-4 lg:h-[calc(100vh-9rem)]">
                {stage}
                {controls}
              </div>
              <div className="space-y-4 lg:h-[calc(100vh-9rem)] lg:overflow-y-auto lg:pr-1">
                {rail}
              </div>
            </div>

            {/* Mobile: the stage and the controls own the screen; everything
                else moves behind tabs instead of a two-thousand-pixel scroll. */}
            <div className="mt-3 lg:hidden">
              <div className="flex flex-col gap-3">{stage}</div>
              {controls && <div className="mt-3 space-y-3">{controls}</div>}
              <MobileTabs
                room={room}
                meId={me?.id ?? null}
                topBidderId={liveRound ? round.current_bid_by : null}
                rivals={rivals}
                budget={budget}
                effects={state.effects ?? []}
                onCast={castPower}
                busy={busy}
                meParticipant={meParticipant}
                requirements={requirements}
                onKick={identity?.hostToken ? kick : undefined}
              />
            </div>
          </>
        )}
      </div>
    </div>
  );
}

/**
 * On a phone the roster, the powers and your squad add up to more scrolling
 * than the auction itself. Tabs keep them one tap away without burying the
 * silhouette.
 */
function MobileTabs({
  room,
  meId,
  topBidderId,
  rivals,
  budget,
  effects,
  onCast,
  busy,
  meParticipant,
  requirements,
  onKick,
}: {
  room: Room;
  meId: string | null;
  topBidderId: string | null;
  rivals: Participant[];
  budget: number;
  effects: GameState['effects'];
  onCast: (power: PowerId, targetId: string | null) => void;
  busy: boolean;
  meParticipant: Participant | null;
  requirements: Record<PositionType, number>;
  onKick?: (id: string, name: string) => void;
}) {
  const [tab, setTab] = useState<'tabla' | 'poderes' | 'equipo'>('tabla');

  const tabs: [typeof tab, string][] = [
    ['tabla', `Tabla (${room.room_participants.length})`],
    ['poderes', 'Poderes'],
    ['equipo', 'Tu equipo'],
  ];

  return (
    <div className="mt-4">
      <div
        role="tablist"
        className="panel mb-3 flex gap-1 p-1"
        aria-label="Información de la sala"
      >
        {tabs.map(([id, label]) => (
          <button
            key={id}
            role="tab"
            aria-selected={tab === id}
            onClick={() => setTab(id)}
            className={`min-h-[44px] flex-1 rounded-lg px-2 text-sm font-semibold transition ${
              tab === id ? 'bg-orange-500 text-white' : 'text-white/60'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === 'tabla' && (
        <RosterRail
          room={room}
          meId={meId}
          topBidderId={topBidderId}
          showHeading={false}
          onKick={onKick}
        />
      )}
      {tab === 'poderes' && (
        <PowerPanel
          rivals={rivals}
          budget={budget}
          effects={effects}
          meId={meId}
          onCast={onCast}
          busy={busy}
        />
      )}
      {tab === 'equipo' && meParticipant && (
        <MyTeam participant={meParticipant} requirements={requirements} />
      )}
    </div>
  );
}

function JoinHere({
  code,
  onJoined,
}: {
  code: string;
  onJoined: (identity: { clientToken: string; displayName: string }) => void;
}) {
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const res = await fetch(`/api/rooms/${code}/join`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code, displayName: name.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'No se pudo entrar');

      const identity = { clientToken: data.clientToken, displayName: name.trim() };
      localStorage.setItem(`room_${code}`, JSON.stringify(identity));
      onJoined(identity);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo entrar');
      setLoading(false);
    }
  };

  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <form onSubmit={submit} className="panel animate-rise w-full max-w-sm space-y-4 p-6">
        <div className="text-center">
          <p className="text-xs uppercase tracking-[0.3em] text-white/45">Entrar a la sala</p>
          <p className="mt-1 font-mono text-3xl tracking-[0.3em] text-orange-400">{code}</p>
        </div>

        <label className="block">
          <span className="mb-1.5 block text-xs uppercase tracking-wider text-white/50">
            Tu nombre
          </span>
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={24}
            placeholder="Ej: Teo"
            className="field"
          />
        </label>

        {error && (
          <p className="rounded-xl border border-rose-400/40 bg-rose-500/15 px-3 py-2 text-sm text-rose-100">
            {error}
          </p>
        )}

        <button type="submit" disabled={loading || !name.trim()} className="btn-primary w-full py-3">
          {loading ? 'Entrando…' : 'Entrar'}
        </button>
        <Link href="/" className="block text-center text-sm text-white/45 hover:text-white">
          Volver al inicio
        </Link>
      </form>
    </main>
  );
}

function TipNotice({ tip }: { tip: { nationality: string | null; team: string | null } }) {
  return (
    <div className="panel animate-rise flex items-center gap-3 border-sky-400/40 bg-sky-500/10 px-4 py-3">
      <span className="text-2xl" aria-hidden>
        🔍
      </span>
      <p className="text-sm text-sky-100">
        Tu soplo: es de <strong>{tip.nationality ?? 'nacionalidad desconocida'}</strong> y juega
        en <strong>{tip.team ?? 'un club desconocido'}</strong>.
      </p>
    </div>
  );
}

function HexNotice({ power }: { power: string }) {
  const info = POWER_BY_ID[power as PowerId];
  if (!info) return null;

  return (
    <div
      className="panel animate-rise flex items-center gap-3 border-rose-400/40 bg-rose-500/10 px-4 py-3"
      role="status"
    >
      <span className="text-2xl" aria-hidden>
        {info.icon}
      </span>
      <p className="text-sm text-rose-100">{info.victimNotice}</p>
    </div>
  );
}

function CoinFlip() {
  return (
    <div className="fixed inset-0 z-40 grid place-items-center bg-black/70 backdrop-blur-sm">
      <div className="text-center">
        <div className="animate-flip mx-auto grid h-28 w-28 place-items-center rounded-full bg-gradient-to-br from-orange-300 to-orange-600 text-5xl shadow-[0_0_60px_-10px_rgba(245,130,31,0.9)]">
          ⚽
        </div>
        <p className="mt-5 text-lg font-bold">Todos pasaron — se sortea</p>
      </div>
    </div>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-6 text-center">
      {children}
    </div>
  );
}

function Header({
  room,
  me,
  onOpenRules,
  onLeave,
}: {
  room: Room;
  me: Participant | null;
  onOpenRules: () => void;
  onLeave: () => void;
}) {
  const [copied, setCopied] = useState(false);

  return (
    <header className="panel flex items-center justify-between gap-3 px-3 py-2.5 sm:px-5 sm:py-4">
      <div className="flex min-w-0 items-center gap-3">
        <div className="min-w-0">
          <p className="hidden text-xs uppercase tracking-[0.2em] text-white/45 sm:block">
            Siluetas
          </p>
          {/* The full title is a luxury a phone header cannot afford; it wrapped
              onto three rows and pushed the auction down the page. */}
          <h1 className="truncate text-lg font-black leading-tight sm:text-2xl">
            <span className="sm:hidden">Silumatch</span>
            <span className="hidden sm:inline">Silumatch</span>
          </h1>
        </div>

        <button
          onClick={() => {
            navigator.clipboard?.writeText(room.code);
            setCopied(true);
            setTimeout(() => setCopied(false), 1600);
          }}
          className="chip min-h-[44px] shrink-0 hover:bg-white/10"
          title="Copiar código de sala"
        >
          <span className="font-mono text-sm tracking-[0.2em] text-orange-400 sm:text-base sm:tracking-[0.25em]">
            {room.code}
          </span>
          <span className="hidden text-white/50 sm:inline">{copied ? '¡copiado!' : 'copiar'}</span>
          <span className="text-white/50 sm:hidden" aria-hidden>
            {copied ? '✓' : '⧉'}
          </span>
        </button>
      </div>

      <div className="flex shrink-0 items-center gap-2 sm:gap-3">
        {room.current_position && (
          <span className="chip hidden sm:inline-flex">
            Ronda {room.round_number} · {POSITION_LABELS[room.current_position as PositionType]}
          </span>
        )}

        {me && (
          <div className="text-right leading-tight">
            <p className="hidden text-sm text-white/60 sm:block">{me.display_name}</p>
            <p className="text-lg font-bold text-orange-400 sm:text-xl">
              {me.remaining_budget} <span aria-hidden>💰</span>
            </p>
          </div>
        )}

        <button
          onClick={onOpenRules}
          className="btn-ghost grid min-h-[44px] min-w-[44px] place-items-center px-3 text-sm"
          title="Ver las reglas"
          aria-label="Ver las reglas"
        >
          <span className="hidden sm:inline">Reglas</span>
          <span className="text-lg sm:hidden" aria-hidden>
            ?
          </span>
        </button>

        <button
          onClick={onLeave}
          className="btn-ghost grid min-h-[44px] min-w-[44px] place-items-center px-3 text-sm hover:border-rose-400/40 hover:text-rose-200"
          title="Salir de la sala"
          aria-label="Salir de la sala"
        >
          <span className="hidden sm:inline">Salir</span>
          <span className="text-lg sm:hidden" aria-hidden>
            ⏻
          </span>
        </button>
      </div>
    </header>
  );
}

/**
 * Between rounds everyone votes to continue. The host keeps a way to force it,
 * for the common case of somebody who wandered off — but the default is
 * agreement, not one person the others have to wait on.
 */
function Idle({
  isHost,
  onStart,
  onReady,
  busy,
  participants,
  meId,
}: {
  isHost: boolean;
  onStart: () => void;
  onReady: () => void;
  busy: boolean;
  participants: Participant[];
  meId: string | null;
}) {
  const ready = participants.filter((p) => p.is_ready);
  const iAmReady = participants.some((p) => p.id === meId && p.is_ready);
  const waiting = participants.filter((p) => !p.is_ready);

  return (
    <div className="panel animate-rise flex flex-col items-center gap-4 px-5 py-10 text-center sm:py-14">
      <div className="text-4xl sm:text-5xl">⚽</div>
      <h2 className="text-xl font-bold sm:text-2xl">
        {iAmReady ? 'Esperando al resto' : 'Listo para la próxima silueta'}
      </h2>

      <p className="max-w-md text-sm text-white/60 sm:text-base">
        {iAmReady
          ? 'La ronda arranca sola apenas todos digan que están listos.'
          : 'Cuando todos estén listos aparece la silueta y se puja a ciegas. El nombre se revela recién al cerrar.'}
      </p>

      <div className="flex flex-wrap items-center justify-center gap-1.5">
        {participants.map((p) => (
          <span
            key={p.id}
            className={`chip ${
              p.is_ready ? 'border-orange-400/40 bg-orange-400/15 text-orange-300' : 'text-white/45'
            }`}
          >
            {p.is_ready ? '✓' : '⋯'} {p.display_name}
          </span>
        ))}
      </div>

      <p className="text-sm text-white/45">
        {ready.length} de {participants.length} listos
      </p>

      {!iAmReady ? (
        <button onClick={onReady} disabled={busy} className="btn-primary mt-1 px-8 py-3 text-lg">
          {busy ? 'Un segundo…' : 'Estoy listo'}
        </button>
      ) : (
        <p className="chip mt-1 border-orange-400/40 text-orange-300">Marcaste que estás listo</p>
      )}

      {isHost && waiting.length > 0 && (
        <button
          onClick={onStart}
          disabled={busy}
          className="btn-ghost text-sm"
          title="Arrancar sin esperar al resto"
        >
          Arrancar igual ({waiting.length} sin marcar)
        </button>
      )}
    </div>
  );
}

function BidPanel({
  budget,
  currentBid,
  canBid,
  positionFull,
  iAmTopBidder,
  passesLeft,
  onBid,
  onPass,
  busy,
}: {
  budget: number;
  currentBid: number;
  canBid: boolean;
  positionFull: boolean;
  iAmTopBidder: boolean;
  passesLeft: number;
  onBid: (amount: number) => void;
  onPass: () => void;
  busy: boolean;
}) {
  let notice: string | null = null;
  if (positionFull) notice = 'Ya completaste esta posición — no podés pujar en esta ronda.';
  else if (iAmTopBidder) notice = 'Vas ganando la puja.';

  return (
    <div className="panel animate-rise p-5">
      <div className="mb-4 flex items-end justify-between">
        <div>
          <p className="text-xs uppercase tracking-widest text-white/45">Tu presupuesto</p>
          <p className="text-3xl font-black text-orange-400">{budget}</p>
        </div>
        {notice && (
          <p
            className={`text-sm ${iAmTopBidder ? 'text-orange-400' : 'text-amber-300'}`}
            role="status"
          >
            {notice}
          </p>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {BID_STEPS.map((step) => {
          const amount = currentBid + step;
          const affordable = amount <= budget;
          return (
            <button
              key={step}
              onClick={() => onBid(amount)}
              disabled={!canBid || !affordable}
              className="btn-ghost flex-col gap-0 py-3 disabled:opacity-30"
              title={affordable ? `Pujar ${amount}` : 'No te alcanza'}
            >
              <span className="text-lg font-black text-orange-400">+{step}</span>
              <span className="text-xs text-white/50">= {amount}</span>
            </button>
          );
        })}
      </div>

      <button
        onClick={onPass}
        disabled={busy || passesLeft <= 0 || positionFull}
        className="btn-ghost mt-3 w-full flex-col gap-0"
      >
        <span>{passesLeft > 0 ? 'Pasar' : 'Ya usaste tu pase'}</span>
        {passesLeft > 0 && (
          <span className="text-xs font-normal text-white/45">
            tenés 1 en toda la partida · si todos pasan, se sortea
          </span>
        )}
      </button>
    </div>
  );
}

function MyTeam({
  participant,
  requirements,
}: {
  participant: Participant;
  requirements: Record<PositionType, number>;
}) {
  const counts = countByPosition(participant);
  const complete = isTeamComplete(participant, requirements);

  return (
    <div className="panel p-5">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="font-bold">
          Tu equipo{' '}
          <span className="ml-1 font-black text-orange-400">{totalPoints(participant)} pts</span>
        </h3>
        {complete && <span className="chip border-orange-400/30 text-orange-400">Completo ✓</span>}
      </div>

      <div className="grid grid-cols-4 gap-2">
        {POSITION_ORDER.map((pos) => {
          const have = counts[pos];
          const need = requirements[pos] ?? 0;
          const done = have >= need;
          return (
            <div
              key={pos}
              className={`rounded-xl border px-3 py-2.5 text-center transition ${
                done ? 'border-orange-400/40 bg-orange-500/10' : 'border-white/10 bg-white/5'
              }`}
            >
              <p className="text-[11px] uppercase tracking-wider text-white/50">
                {POSITION_SHORT[pos]}
              </p>
              <p className={`text-lg font-black ${done ? 'text-orange-400' : 'text-white'}`}>
                {have}/{need}
              </p>
            </div>
          );
        })}
      </div>

      {participant.team_players.length > 0 && (
        <ul className="mt-4 space-y-2">
          {participant.team_players.map((signing) => (
            <li
              key={signing.players.id}
              className="flex items-center gap-3 rounded-xl bg-black/25 px-3 py-2"
            >
              {signing.players.photo_url && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={signing.players.photo_url}
                  alt=""
                  className="h-9 w-9 rounded-full object-cover"
                />
              )}
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold">{signing.players.name}</p>
                <p className="truncate text-xs text-white/45">
                  {POSITION_SHORT[signing.players.position_type]}
                  {signing.season_year ? ` · ${signing.season_year}` : ''}
                  {signing.era_label ? ` · ${signing.era_label}` : ''}
                </p>
              </div>
              <div className="shrink-0 text-right leading-tight">
                <span className="block text-sm font-black text-orange-400">
                  {signing.rating ?? '—'}
                </span>
                <span className="block text-[10px] text-white/35">pagó {signing.purchase_price}</span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
