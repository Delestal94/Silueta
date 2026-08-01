import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { errorResponse } from '@/lib/game/http';
import { isAdmin } from '@/lib/game/admin';
import { editPlayerSchema, newPlayerSchema } from '@/lib/game/submissions';
import { z } from 'zod';

export const dynamic = 'force-dynamic';

const body = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('new'), data: newPlayerSchema }),
  z.object({ kind: z.literal('edit'), data: editPlayerSchema }),
]);

/** Anyone may propose. Nothing here touches the catalog. */
export async function POST(request: NextRequest) {
  try {
    const input = body.parse(await request.json());
    const supabase = createAdminClient();

    if (input.kind === 'edit') {
      const { data: target } = await supabase
        .from('players')
        .select('id')
        .eq('id', input.data.targetPlayerId)
        .maybeSingle();

      if (!target) {
        return NextResponse.json({ error: 'Ese jugador no existe' }, { status: 404 });
      }
    }

    // One pending proposal per person at a time, so the queue cannot be
    // flooded from a single tab.
    const { count } = await supabase
      .from('player_submissions')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'pending')
      .eq('submitted_by', input.data.submittedBy);

    if ((count ?? 0) >= 5) {
      return NextResponse.json(
        { error: 'Ya tenés 5 propuestas esperando revisión' },
        { status: 429 }
      );
    }

    const { error } = await supabase.from('player_submissions').insert({
      kind: input.kind,
      target_player_id: input.kind === 'edit' ? input.data.targetPlayerId : null,
      submitted_by: input.data.submittedBy,
      payload: input.data,
    });

    if (error) {
      return NextResponse.json({ error: 'No se pudo guardar la propuesta' }, { status: 500 });
    }

    return NextResponse.json({ ok: true }, { status: 201 });
  } catch (error) {
    return errorResponse('POST /api/submissions', error);
  }
}

/** Reviewing the queue requires the moderation token. */
export async function GET(request: NextRequest) {
  try {
    if (!isAdmin(request.headers.get('x-admin-token'))) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }

    const supabase = createAdminClient();
    const { data, error } = await supabase
      .from('player_submissions')
      .select('id, kind, target_player_id, submitted_by, payload, status, created_at')
      .eq('status', 'pending')
      .order('created_at', { ascending: true })
      .limit(100);

    if (error) {
      return NextResponse.json({ error: 'No se pudo leer la cola' }, { status: 500 });
    }

    // Attach the current values so a correction can be judged against them.
    const targetIds = (data ?? [])
      .map((s) => s.target_player_id)
      .filter((id): id is string => !!id);

    const targets = targetIds.length
      ? (
          await supabase
            .from('players')
            .select('id, name, position_type, nationality, team, birth_date, ea_overall')
            .in('id', targetIds)
        ).data ?? []
      : [];

    const byId = new Map(targets.map((t) => [t.id, t]));

    return NextResponse.json({
      submissions: (data ?? []).map((s) => ({
        ...s,
        current: s.target_player_id ? (byId.get(s.target_player_id) ?? null) : null,
      })),
    });
  } catch (error) {
    return errorResponse('GET /api/submissions', error);
  }
}
