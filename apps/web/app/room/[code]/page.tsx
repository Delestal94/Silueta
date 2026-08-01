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

const BID_STEPS = [1, 5, 10, 25];

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

  const { state, error, loading, refresh } = useGameState(code, identity?.clientToken ?? null);
  const { toasts, push } = useToasts();

  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 200);
    return () => clearInterval(t);
  }, []);

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

  // Every client races to settle the auction; the server keeps only the first.
  useEffect(() => {
    if (!round || round.status !== 'active' || msLeft > 0) return;
    if (finalizedRef.current === round.id) return;
    finalizedRef.current = round.id;

    fetch(`/api/rounds/${round.id}/finalize`, { method: 'POST' })
      .then(() => refresh())
      .catch(() => {});
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

  const castPower = useCallback(
    async (power: PowerId, targetId: string) => {
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

  return (
    <div className="min-h-screen px-4 py-5 sm:px-6 lg:px-8">
      <Toasts toasts={toasts} />
      {flipping && <CoinFlip />}
      {showRules && <RulesModal onClose={() => setShowRules(false)} />}

      <div className="mx-auto max-w-7xl">
        <Header room={room} me={meParticipant} onOpenRules={() => setShowRules(true)} />

        {room.status === 'finished' ? (
          <FinalStandings room={room} />
        ) : (
          <div className="mt-5 grid gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
            <div className="space-y-5">
              {round && round.status === 'active' ? (
                <>
                  {round.mystery && round.envelope ? (
                    <MysteryEnvelope
                      envelope={round.envelope}
                      position={round.position_type}
                      seasonYear={round.season_year}
                      eraLabel={round.era_label}
                      secondsLeft={secondsLeft}
                      totalSeconds={room.round_seconds}
                      currentBid={currentBid}
                      topBidderName={
                        room.room_participants.find((p) => p.id === round.current_bid_by)
                          ?.display_name ?? null
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
                        room.room_participants.find((p) => p.id === round.current_bid_by)
                          ?.display_name ?? null
                      }
                      hex={round.myHex?.power ?? null}
                    />
                  )}

                  {round.myHex && <HexNotice power={round.myHex.power} />}

                  <BidPanel
                    budget={budget}
                    currentBid={currentBid}
                    canBid={canBid}
                    positionFull={positionFull}
                    iAmTopBidder={iAmTopBidder}
                    passesLeft={1 - (meParticipant?.passes_used ?? 0)}
                    onBid={placeBid}
                    onPass={pass}
                    busy={busy}
                  />
                </>
              ) : round && round.revealed ? (
                <RevealCard
                  round={round}
                  winnerName={
                    room.room_participants.find((p) => p.id === round.current_bid_by)
                      ?.display_name ?? null
                  }
                  isHost={!!identity?.hostToken}
                  onNext={startRound}
                  busy={busy}
                />
              ) : (
                <Idle
                  isHost={!!identity?.hostToken}
                  onStart={startRound}
                  busy={busy}
                  playersInRoom={room.room_participants.length}
                />
              )}

              {meParticipant && (
                <MyTeam participant={meParticipant} requirements={requirements} />
              )}
            </div>

            <div className="space-y-5">
              <RosterRail
                room={room}
                meId={me?.id ?? null}
                topBidderId={round?.status === 'active' ? round.current_bid_by : null}
              />

              <PowerPanel
                rivals={room.room_participants.filter((p) => p.id !== me?.id)}
                budget={budget}
                effects={state.effects ?? []}
                meId={me?.id ?? null}
                onCast={castPower}
                busy={busy}
              />
            </div>
          </div>
        )}
      </div>
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
          <p className="mt-1 font-mono text-3xl tracking-[0.3em] text-lime-300">{code}</p>
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
        <div className="animate-flip mx-auto grid h-28 w-28 place-items-center rounded-full bg-gradient-to-br from-lime-200 to-lime-500 text-5xl shadow-[0_0_60px_-10px_rgba(182,255,59,0.9)]">
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
}: {
  room: Room;
  me: Participant | null;
  onOpenRules: () => void;
}) {
  const [copied, setCopied] = useState(false);

  return (
    <header className="panel flex flex-wrap items-center justify-between gap-4 px-5 py-4">
      <div className="flex items-center gap-4">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-white/45">Siluetas</p>
          <h1 className="text-2xl font-black leading-tight">Subasta Futbolera</h1>
        </div>
        <button
          onClick={() => {
            navigator.clipboard?.writeText(room.code);
            setCopied(true);
            setTimeout(() => setCopied(false), 1600);
          }}
          className="chip hover:bg-white/10"
          title="Copiar código"
        >
          <span className="font-mono text-base tracking-[0.25em] text-lime-300">{room.code}</span>
          <span className="text-white/50">{copied ? '¡copiado!' : 'copiar'}</span>
        </button>
      </div>

      <div className="flex items-center gap-3">
        <button
          onClick={onOpenRules}
          className="btn-ghost px-3 py-1.5 text-sm"
          title="Ver las reglas"
        >
          Reglas
        </button>
        {room.current_position && (
          <span className="chip">
            Ronda {room.round_number} · {POSITION_LABELS[room.current_position as PositionType]}
          </span>
        )}
        {me && (
          <div className="text-right">
            <p className="text-sm text-white/60">{me.display_name}</p>
            <p className="text-xl font-bold text-lime-300">{me.remaining_budget} 💰</p>
          </div>
        )}
      </div>
    </header>
  );
}

function Idle({
  isHost,
  onStart,
  busy,
  playersInRoom,
}: {
  isHost: boolean;
  onStart: () => void;
  busy: boolean;
  playersInRoom: number;
}) {
  return (
    <div className="panel animate-rise flex flex-col items-center gap-4 px-6 py-16 text-center">
      <div className="text-5xl">⚽</div>
      <h2 className="text-2xl font-bold">
        {isHost ? 'Listo para subastar' : 'Esperando al anfitrión'}
      </h2>
      <p className="max-w-md text-white/60">
        {isHost
          ? 'Cuando arranques, aparece la silueta de un jugador y todos pujan a ciegas. El nombre se revela recién cuando se cierra la puja.'
          : 'El anfitrión va a lanzar la próxima silueta en cualquier momento.'}
      </p>
      <p className="chip">{playersInRoom} jugador{playersInRoom === 1 ? '' : 'es'} en la sala</p>
      {isHost && (
        <button onClick={onStart} disabled={busy} className="btn-primary mt-2 px-8 py-3 text-lg">
          {busy ? 'Preparando…' : 'Lanzar silueta'}
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
          <p className="text-3xl font-black text-lime-300">{budget}</p>
        </div>
        {notice && (
          <p
            className={`text-sm ${iAmTopBidder ? 'text-lime-300' : 'text-amber-300'}`}
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
              <span className="text-lg font-black text-lime-300">+{step}</span>
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
          <span className="ml-1 font-black text-lime-300">{totalPoints(participant)} pts</span>
        </h3>
        {complete && <span className="chip border-lime-300/30 text-lime-300">Completo ✓</span>}
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
                done ? 'border-lime-300/40 bg-lime-300/10' : 'border-white/10 bg-white/5'
              }`}
            >
              <p className="text-[11px] uppercase tracking-wider text-white/50">
                {POSITION_SHORT[pos]}
              </p>
              <p className={`text-lg font-black ${done ? 'text-lime-300' : 'text-white'}`}>
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
                <span className="block text-sm font-black text-lime-300">
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
