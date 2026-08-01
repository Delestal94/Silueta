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
  bid_too_low: ['Tu puja debe superar la actual', 400],
  insufficient_budget: ['No te alcanza el presupuesto', 400],
  position_already_full: ['Ya completaste esa posición', 400],
};

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
    const { data, error } = await supabase.rpc('place_bid', {
      p_round: roundId,
      p_client_token: clientToken,
      p_amount: amount,
    });

    if (error) {
      return NextResponse.json({ error: 'No se pudo registrar la puja' }, { status: 500 });
    }

    if (data?.error) {
      const [message, status] = ERRORS[data.error] ?? ['No se pudo pujar', 400];
      return NextResponse.json({ error: message }, { status });
    }

    return NextResponse.json({ round: data.round }, { status: 201 });
  } catch (error) {
    return errorResponse('POST /api/rounds/[id]/bid', error);
  }
}
