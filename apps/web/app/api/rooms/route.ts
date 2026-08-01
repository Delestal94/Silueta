import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { errorResponse } from '@/lib/game/http';
import { createRoomSchema } from '@/lib/game/validators';
import { generateRoomCode, generateToken } from '@/lib/game/utils';

export async function POST(request: NextRequest) {
  try {
    const input = createRoomSchema.parse(await request.json());
    const supabase = createAdminClient();
    const hostToken = generateToken();
    const clientToken = generateToken();

    // Codes are short and random, so a collision is possible; retry a few times.
    let room = null;
    for (let attempt = 0; attempt < 5 && !room; attempt++) {
      const { data, error } = await supabase
        .from('rooms')
        .insert({
          code: generateRoomCode(),
          host_token: hostToken,
          starting_budget: input.startingBudget,
          round_seconds: input.roundSeconds,
          gender_filter: input.genderFilter,
          pool: input.pool,
          status: 'lobby',
        })
        .select()
        .single();

      if (!error) room = data;
      else if (error.code !== '23505') {
        return NextResponse.json({ error: 'No se pudo crear la sala' }, { status: 500 });
      }
    }

    if (!room) {
      return NextResponse.json({ error: 'No se pudo crear la sala' }, { status: 500 });
    }

    const { error: participantError } = await supabase.from('room_participants').insert({
      room_id: room.id,
      display_name: input.displayName,
      client_token: clientToken,
      remaining_budget: input.startingBudget,
      is_host: true,
    });

    if (participantError) {
      return NextResponse.json({ error: 'No se pudo crear la sala' }, { status: 500 });
    }

    return NextResponse.json(
      { roomId: room.id, code: room.code, hostToken, clientToken },
      { status: 201 }
    );
  } catch (error) {
    return errorResponse('POST /api/rooms', error);
  }
}
