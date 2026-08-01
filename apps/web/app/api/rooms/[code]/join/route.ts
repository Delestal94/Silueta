import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { joinRoomSchema } from '@/lib/game/validators';
import { generateToken } from '@/lib/game/utils';

const MAX_PARTICIPANTS = 12;

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ code: string }> }
) {
  try {
    const { code } = await params;
    const input = joinRoomSchema.parse(await request.json());
    const supabase = createAdminClient();

    const { data: room } = await supabase
      .from('rooms')
      .select('id, starting_budget, status, room_participants (id, display_name)')
      .eq('code', code.toUpperCase())
      .single();

    if (!room) {
      return NextResponse.json({ error: 'Sala no encontrada' }, { status: 404 });
    }

    if (room.status === 'finished') {
      return NextResponse.json({ error: 'Esta subasta ya terminó' }, { status: 409 });
    }

    const participants = room.room_participants ?? [];

    if (participants.length >= MAX_PARTICIPANTS) {
      return NextResponse.json({ error: 'La sala está llena' }, { status: 409 });
    }

    const taken = participants.some(
      (p) => p.display_name.toLowerCase() === input.displayName.toLowerCase()
    );
    if (taken) {
      return NextResponse.json({ error: 'Ese nombre ya está en uso en la sala' }, { status: 409 });
    }

    const clientToken = generateToken();

    const { error } = await supabase.from('room_participants').insert({
      room_id: room.id,
      display_name: input.displayName,
      client_token: clientToken,
      remaining_budget: room.starting_budget,
      is_host: false,
    });

    if (error) {
      return NextResponse.json({ error: 'No se pudo entrar a la sala' }, { status: 500 });
    }

    return NextResponse.json({ roomId: room.id, clientToken }, { status: 201 });
  } catch {
    return NextResponse.json({ error: 'Petición inválida' }, { status: 400 });
  }
}
