'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { getSupabaseClient } from '@/lib/supabase/client';
import type { GameState } from './types';

export function useGameState(code: string, clientToken: string | null) {
  const [state, setState] = useState<GameState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const inFlight = useRef(false);

  // How far this device's clock sits from the server's. Every countdown is
  // drawn against the corrected time, so two players with skewed clocks still
  // see the same seconds left.
  const [clockOffset, setClockOffset] = useState(0);

  const refresh = useCallback(async () => {
    // Realtime can burst several events at once; collapse them into one fetch.
    if (inFlight.current) return;
    inFlight.current = true;

    const sentAt = Date.now();

    try {
      const res = await fetch(`/api/rooms/${code}/state`, {
        headers: clientToken ? { 'x-client-token': clientToken } : {},
        cache: 'no-store',
      });

      if (!res.ok) {
        setError(res.status === 404 ? 'Sala no encontrada' : 'No se pudo cargar la sala');
        return;
      }

      const data = (await res.json()) as GameState;
      const receivedAt = Date.now();

      if (data.serverTime) {
        // Assume the response spent half the round trip coming back, which is
        // the usual NTP-style correction and plenty for a countdown.
        const latency = (receivedAt - sentAt) / 2;
        setClockOffset(new Date(data.serverTime).getTime() + latency - receivedAt);
      }

      setState(data);
      setError(null);
    } catch {
      setError('Sin conexión con el servidor');
    } finally {
      inFlight.current = false;
      setLoading(false);
    }
  }, [code, clientToken]);

  useEffect(() => {
    if (code) refresh();
  }, [code, refresh]);

  const roomId = state?.room?.id;

  useEffect(() => {
    if (!roomId) return;

    let cleanup: (() => void) | null = null;
    let cancelled = false;

    getSupabaseClient()
      .then((supabase) => {
        if (cancelled) return;

        const channel = supabase.channel(`room:${roomId}`);

        for (const table of ['auction_rounds', 'room_participants', 'team_players', 'rooms']) {
          channel.on('postgres_changes', { event: '*', schema: 'public', table }, () => refresh());
        }

        channel.subscribe();
        cleanup = () => supabase.removeChannel(channel);
      })
      // Realtime is an optimisation; polling below keeps the game playable.
      .catch(() => {});

    // Realtime can drop silently (sleeping tab, flaky network); poll as a floor.
    const poll = setInterval(refresh, 5000);

    return () => {
      cancelled = true;
      clearInterval(poll);
      cleanup?.();
    };
  }, [roomId, refresh]);

  /** Server time as this device best understands it. */
  const serverNow = useCallback(() => Date.now() + clockOffset, [clockOffset]);

  return { state, error, loading, refresh, serverNow };
}
