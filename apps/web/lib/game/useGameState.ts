'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import type { GameState } from './types';

export function useGameState(code: string, clientToken: string | null) {
  const [state, setState] = useState<GameState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const inFlight = useRef(false);

  const refresh = useCallback(async () => {
    // Realtime can burst several events at once; collapse them into one fetch.
    if (inFlight.current) return;
    inFlight.current = true;

    try {
      const res = await fetch(`/api/rooms/${code}/state`, {
        headers: clientToken ? { 'x-client-token': clientToken } : {},
        cache: 'no-store',
      });

      if (!res.ok) {
        setError(res.status === 404 ? 'Sala no encontrada' : 'No se pudo cargar la sala');
        return;
      }

      setState(await res.json());
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

    const supabase = createClient();
    const channel = supabase.channel(`room:${roomId}`);

    for (const table of ['auction_rounds', 'room_participants', 'team_players', 'rooms']) {
      channel.on(
        'postgres_changes',
        { event: '*', schema: 'public', table },
        () => refresh()
      );
    }

    channel.subscribe();

    // Realtime can drop silently (sleeping tab, flaky network); poll as a floor.
    const poll = setInterval(refresh, 5000);

    return () => {
      clearInterval(poll);
      supabase.removeChannel(channel);
    };
  }, [roomId, refresh]);

  return { state, error, loading, refresh };
}
