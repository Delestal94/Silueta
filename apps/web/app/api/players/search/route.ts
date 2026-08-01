import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { errorResponse } from '@/lib/game/http';

export const dynamic = 'force-dynamic';

/**
 * Name search for the corrections form.
 *
 * A query is required and results are capped: the catalog must never be
 * enumerable, or anyone could pull the whole list and map silhouettes back to
 * names, which is the entire game. Silhouette URLs are never returned here.
 */
export async function GET(request: NextRequest) {
  try {
    const query = request.nextUrl.searchParams.get('q')?.trim() ?? '';

    if (query.length < 3) {
      return NextResponse.json({ players: [] });
    }

    const supabase = createAdminClient();
    const { data, error } = await supabase
      .from('players')
      .select('id, name, position_type, nationality, team, birth_date, ea_overall, gender')
      .ilike('name', `%${query}%`)
      .order('fame_rank', { nullsFirst: false })
      .limit(10);

    if (error) {
      return NextResponse.json({ error: 'No se pudo buscar' }, { status: 500 });
    }

    return NextResponse.json({ players: data ?? [] });
  } catch (error) {
    return errorResponse('GET /api/players/search', error);
  }
}
