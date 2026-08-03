import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { errorResponse } from '@/lib/game/http';

export const dynamic = 'force-dynamic';

/** Top scores across every finished game. */
export async function GET() {
  try {
    const supabase = createAdminClient();

    const { data, error } = await supabase
      .from('leaderboard')
      .select('display_name, games, wins, best_score, average_score, best_signing, total_points')
      .limit(20);

    if (error) {
      return NextResponse.json({ error: 'No se pudo leer el ranking' }, { status: 500 });
    }

    return NextResponse.json({ entries: data ?? [] });
  } catch (error) {
    return errorResponse('GET /api/leaderboard', error);
  }
}
