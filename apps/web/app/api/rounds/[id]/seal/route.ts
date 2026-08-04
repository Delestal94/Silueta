import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { errorResponse } from '@/lib/game/http';
import { z } from 'zod';

const schema = z.object({ amount: z.number().int().positive().max(100000) });

const ERRORS: Record<string, [string, number]> = {
  round_not_found: ['Ronda no encontrada', 404],
  round_closed: ['La ronda ya cerró', 409],
  round_expired: ['Se acabó el tiempo', 409],
  not_a_participant: ['No estás en esta sala', 403],
  not_sealed_room: ['Esta sala no es a sobre cerrado', 409],
  bid_too_low: ['Tenés que poner al menos 1', 400],
  insufficient_budget: ['No te alcanza el presupuesto', 400],
  position_already_full: ['Ya completaste esa posición', 400],
  locked_out: ['Te trabaron: esperá a la segunda mitad de la ronda', 409],
};

/**
 * Seals an envelope for this round.
 *
 * Deliberately a different endpoint from /bid rather than a flag on it: the two
 * differ in what they are allowed to make public. An open bid updates the
 * round for everybody to see; this one must leave no trace anybody else can
 * read until the round closes.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: roundId } = await params;
    const { amount } = schema.parse(await request.json());
    const clientToken = request.headers.get('x-client-token');

    if (!clientToken) {
      return NextResponse.json({ error: 'Falta el token de jugador' }, { status: 401 });
    }

    const supabase = createAdminClient();
    const { data, error } = await supabase.rpc('seal_bid', {
      p_round: roundId,
      p_client_token: clientToken,
      p_amount: amount,
    });

    if (error) {
      return NextResponse.json({ error: 'No se pudo guardar el sobre' }, { status: 500 });
    }

    if (data?.error) {
      const [message, status] = ERRORS[data.error] ?? ['No se pudo guardar el sobre', 400];
      return NextResponse.json({ error: message }, { status });
    }

    return NextResponse.json(data);
  } catch (error) {
    return errorResponse('POST /api/rounds/[id]/seal', error);
  }
}
