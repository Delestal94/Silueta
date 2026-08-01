import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { errorResponse } from '@/lib/game/http';
import { isAdmin } from '@/lib/game/admin';
import { editPlayerSchema, newPlayerSchema } from '@/lib/game/submissions';
import { z } from 'zod';

const schema = z.object({
  decision: z.enum(['approve', 'reject']),
  note: z.string().trim().max(300).optional(),
});

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    if (!isAdmin(request.headers.get('x-admin-token'))) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }

    const { id } = await params;
    const { decision, note } = schema.parse(await request.json());
    const supabase = createAdminClient();

    // Claim it first: two moderators clicking at once must not apply the same
    // change twice.
    const { data: submission } = await supabase
      .from('player_submissions')
      .update({
        status: decision === 'approve' ? 'approved' : 'rejected',
        review_note: note ?? null,
        reviewed_at: new Date().toISOString(),
      })
      .eq('id', id)
      .eq('status', 'pending')
      .select()
      .maybeSingle();

    if (!submission) {
      return NextResponse.json({ error: 'Esa propuesta ya fue revisada' }, { status: 409 });
    }

    if (decision === 'reject') {
      return NextResponse.json({ ok: true, applied: false });
    }

    if (submission.kind === 'new') {
      const data = newPlayerSchema.parse(submission.payload);

      const { error } = await supabase.from('players').insert({
        name: data.name,
        position_type: data.positionType,
        position: data.positionType,
        gender: data.gender,
        nationality: data.nationality,
        team: data.team,
        club: data.team,
        league: 'Comunidad',
        birth_date: data.birthDate,
        prime_rating: data.rating,
        ea_overall: data.rating,
        source_image_url: data.imageUrl,
        submitted_by: data.submittedBy,
        // Not auctionable until the ingest pass turns the image into a
        // silhouette — an unprocessed link is not something we serve to players.
        notable: false,
      });

      if (error) {
        return NextResponse.json(
          { error: `No se pudo crear el jugador: ${error.message}` },
          { status: 500 }
        );
      }

      return NextResponse.json({ ok: true, applied: true, needsImage: true });
    }

    const data = editPlayerSchema.parse(submission.payload);
    const patch: Record<string, unknown> = {};
    if (data.positionType) {
      patch.position_type = data.positionType;
      patch.position = data.positionType;
    }
    if (data.nationality) patch.nationality = data.nationality;
    if (data.team) {
      patch.team = data.team;
      patch.club = data.team;
    }
    if (data.birthDate) patch.birth_date = data.birthDate;
    if (data.rating) patch.ea_overall = data.rating;

    if (!Object.keys(patch).length) {
      return NextResponse.json({ ok: true, applied: false });
    }

    const { error } = await supabase
      .from('players')
      .update(patch)
      .eq('id', data.targetPlayerId);

    if (error) {
      return NextResponse.json(
        { error: `No se pudo aplicar la corrección: ${error.message}` },
        { status: 500 }
      );
    }

    return NextResponse.json({ ok: true, applied: true });
  } catch (error) {
    return errorResponse('POST /api/submissions/[id]/review', error);
  }
}
