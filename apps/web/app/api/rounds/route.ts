import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { errorResponse } from '@/lib/game/http';
import { z } from 'zod';

const schema = z.object({ roomId: z.string().uuid() });

const ERRORS: Record<string, [string, number]> = {
  room_not_found: ['Sala no encontrada', 404],
  not_host: ['Solo el anfitrión puede iniciar la ronda', 403],
  round_in_progress: ['Ya hay una ronda en curso', 409],
};

export async function POST(request: NextRequest) {
  try {
    const { roomId } = schema.parse(await request.json());
    const hostToken = request.headers.get('x-host-token');

    if (!hostToken) {
      return NextResponse.json({ error: 'Falta el token de anfitrión' }, { status: 401 });
    }

    const supabase = createAdminClient();
    const { data, error } = await supabase.rpc('next_round', {
      p_room: roomId,
      p_host_token: hostToken,
    });

    if (error) {
      return NextResponse.json({ error: 'No se pudo iniciar la ronda' }, { status: 500 });
    }

    if (data?.error) {
      const [message, status] = ERRORS[data.error] ?? ['No se pudo iniciar la ronda', 400];
      return NextResponse.json({ error: message }, { status });
    }

    if (data?.finished) {
      return NextResponse.json({ finished: true });
    }

    return NextResponse.json({ round: data.round }, { status: 201 });
  } catch (error) {
    return errorResponse('POST /api/rounds', error);
  }
}
