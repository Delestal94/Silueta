import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { errorResponse } from '@/lib/game/http';
import { z } from 'zod';

const schema = z.object({
  action: z.enum(['leave', 'kick', 'ready']),
  targetId: z.string().uuid().nullish(),
});

const ERRORS: Record<string, [string, number]> = {
  room_not_found: ['Sala no encontrada', 404],
  not_a_participant: ['No estás en esta sala', 403],
  not_host: ['Sólo el anfitrión puede hacer eso', 403],
  target_not_found: ['Ese jugador no está en la sala', 404],
  cannot_kick_host: ['No se puede echar al anfitrión', 400],
  round_in_progress: ['Esperá a que termine la ronda', 409],
};

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ code: string }> }
) {
  try {
    const { code } = await params;
    const { action, targetId } = schema.parse(await request.json());

    const clientToken = request.headers.get('x-client-token');
    const hostToken = request.headers.get('x-host-token');
    const supabase = createAdminClient();

    const { data: room } = await supabase
      .from('rooms')
      .select('id')
      .eq('code', code.toUpperCase())
      .single();

    if (!room) {
      return NextResponse.json({ error: 'Sala no encontrada' }, { status: 404 });
    }

    let rpc: { data: Record<string, unknown> | null; error: unknown };

    if (action === 'kick') {
      if (!hostToken) {
        return NextResponse.json({ error: 'Sólo el anfitrión puede echar' }, { status: 403 });
      }
      if (!targetId) {
        return NextResponse.json({ error: 'Falta a quién echar' }, { status: 400 });
      }
      rpc = await supabase.rpc('kick_participant', {
        p_room: room.id,
        p_host_token: hostToken,
        p_target: targetId,
      });
    } else {
      if (!clientToken) {
        return NextResponse.json({ error: 'Falta el token de jugador' }, { status: 401 });
      }
      rpc = await supabase.rpc(action === 'leave' ? 'leave_room' : 'mark_ready', {
        p_room: room.id,
        p_client_token: clientToken,
      });
    }

    if (rpc.error) {
      return NextResponse.json({ error: 'No se pudo completar la acción' }, { status: 500 });
    }

    const data = rpc.data as Record<string, unknown> | null;
    const failure = data?.error as string | undefined;

    if (failure) {
      const [message, status] = ERRORS[failure] ?? ['No se pudo completar la acción', 400];
      return NextResponse.json({ error: message }, { status });
    }

    return NextResponse.json(data ?? {});
  } catch (error) {
    return errorResponse('POST /api/rooms/[code]/members', error);
  }
}
