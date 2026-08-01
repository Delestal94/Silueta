import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { errorResponse } from '@/lib/game/http';
import { z } from 'zod';

const schema = z.object({
  power: z.enum(['niebla', 'apagon', 'espejismo', 'impuesto', 'traba', 'manotazo']),
  targetId: z.string().uuid(),
});

const ERRORS: Record<string, [string, number]> = {
  unknown_power: ['Ese poder no existe', 400],
  not_a_participant: ['No estás en esta sala', 403],
  cannot_target_self: ['No podés tirártelo a vos mismo', 400],
  target_not_found: ['Ese jugador no está en la sala', 404],
  insufficient_budget: ['No te alcanza para ese poder', 400],
  target_already_hexed: ['Ya tiene un poder encima esperando', 409],
  target_has_no_pass: ['Ya usó su pase, no hay nada que quemar', 400],
};

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ code: string }> }
) {
  try {
    const { code } = await params;
    const { power, targetId } = schema.parse(await request.json());
    const clientToken = request.headers.get('x-client-token');

    if (!clientToken) {
      return NextResponse.json({ error: 'Falta el token de jugador' }, { status: 401 });
    }

    const supabase = createAdminClient();

    const { data: room } = await supabase
      .from('rooms')
      .select('id')
      .eq('code', code.toUpperCase())
      .single();

    if (!room) {
      return NextResponse.json({ error: 'Sala no encontrada' }, { status: 404 });
    }

    const { data, error } = await supabase.rpc('cast_power', {
      p_room: room.id,
      p_client_token: clientToken,
      p_power: power,
      p_target: targetId,
    });

    if (error) {
      return NextResponse.json({ error: 'No se pudo lanzar el poder' }, { status: 500 });
    }

    if (data?.error) {
      const [message, status] = ERRORS[data.error] ?? ['No se pudo lanzar el poder', 400];
      return NextResponse.json({ error: message }, { status });
    }

    // The response never names the decoy: the caster could relay it, but more
    // to the point it would sit in the victim's own network tab on the refresh
    // that follows.
    return NextResponse.json(
      { power, immediate: data?.immediate ?? false },
      { status: 201 }
    );
  } catch (error) {
    return errorResponse('POST /api/rooms/[code]/powers', error);
  }
}
