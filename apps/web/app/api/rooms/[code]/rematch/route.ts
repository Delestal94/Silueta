import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { errorResponse } from '@/lib/game/http';
import { z } from 'zod';

/**
 * Los mismos límites que al crear una sala. Van opcionales porque la revancha
 * puede no cambiar nada: lo que no llega, queda como estaba.
 */
const schema = z.object({
  startingBudget: z.number().int().min(50).max(1000).optional(),
  roundSeconds: z.number().int().min(5).max(120).optional(),
  genderFilter: z.enum(['men', 'women', 'any']).optional(),
  pool: z.enum(['famous', 'all']).optional(),
  auctionMode: z.enum(['open', 'sealed']).optional(),
  includeLegends: z.boolean().optional(),
});

const ERRORS: Record<string, [string, number]> = {
  room_not_found: ['Sala no encontrada', 404],
  not_host: ['Sólo el anfitrión puede empezar otra partida', 403],
};

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ code: string }> }
) {
  try {
    const { code } = await params;
    const input = schema.parse(await request.json().catch(() => ({})));

    // El token de anfitrión viaja en la cabecera, no en el cuerpo: es lo que
    // autoriza a borrar la partida de todos los demás.
    const hostToken = request.headers.get('x-host-token');
    if (!hostToken) {
      return NextResponse.json({ error: 'Falta el token de anfitrión' }, { status: 401 });
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

    const { data, error } = await supabase.rpc('rematch', {
      p_room: room.id,
      p_host_token: hostToken,
      p_starting_budget: input.startingBudget ?? null,
      p_round_seconds: input.roundSeconds ?? null,
      p_gender_filter: input.genderFilter ?? null,
      p_pool: input.pool ?? null,
      p_auction_mode: input.auctionMode ?? null,
      p_include_legends: input.includeLegends ?? null,
    });

    if (error) {
      return NextResponse.json({ error: 'No se pudo empezar otra partida' }, { status: 500 });
    }

    if (data?.error) {
      const [message, status] = ERRORS[data.error] ?? ['No se pudo empezar otra partida', 400];
      return NextResponse.json({ error: message }, { status });
    }

    return NextResponse.json(data);
  } catch (error) {
    return errorResponse('POST /api/rooms/[code]/rematch', error);
  }
}
