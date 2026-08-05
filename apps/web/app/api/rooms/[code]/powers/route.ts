import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { errorResponse } from '@/lib/game/http';
import { z } from 'zod';
import { POWERS, type PowerId } from '@/lib/game/powers';

const schema = z.object({
  // Derivado del catálogo, no escrito a mano: con la lista repetida acá, un
  // poder nuevo pasaba el tipado y el panel lo dibujaba, pero esta ruta lo
  // rechazaba antes de llegar a la base — y sin error visible en pantalla.
  power: z.enum(POWERS.map((p) => p.id) as [PowerId, ...PowerId[]]),
  // "soplo" is bought for yourself, so it carries no target.
  targetId: z.string().uuid().nullish(),
});

const ERRORS: Record<string, [string, number]> = {
  unknown_power: ['Ese poder no existe', 400],
  already_defended: ['Ya tenés esa defensa puesta', 409],
  not_a_participant: ['No estás en esta sala', 403],
  cannot_target_self: ['No podés tirártelo a vos mismo', 400],
  target_not_found: ['Ese jugador no está en la sala', 404],
  insufficient_budget: ['No te alcanza para ese poder', 400],
  target_already_hexed: ['Ya tiene un poder encima esperando', 409],
  target_has_no_pass: ['Ya usó su pase, no hay nada que quemar', 400],
  no_active_round: ['No hay ninguna ronda en curso', 409],
  already_bought_tip: ['Ya compraste el soplo de esta ronda', 409],
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
      p_target: targetId ?? null,
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
    // `blocked` sí viaja: el que tiró tiene que enterarse de que se lo pararon.
    // `reflected` no, a propósito — si la reversa avisara, dejaría de ser una
    // trampa y se volvería un escudo más caro.
    return NextResponse.json(
      { power, immediate: data?.immediate ?? false, blocked: data?.blocked ?? false },
      { status: 201 }
    );
  } catch (error) {
    return errorResponse('POST /api/rooms/[code]/powers', error);
  }
}
