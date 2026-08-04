import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { errorResponse } from '@/lib/game/http';

export const dynamic = 'force-dynamic';

/**
 * A handful of silhouettes for the landing page, so the first thing a visitor
 * sees is the thing the game is about.
 *
 * Images only — no names, no ids, nothing that could be paired back to a
 * player. That is the same deal the game itself offers during a round.
 */
export async function GET() {
  try {
    const supabase = createAdminClient();

    // Drawn from the famous pool: recognisable shapes read better as a
    // decorative strip than an anonymous squad player.
    const { data, error } = await supabase
      .from('players')
      .select('silhouette_url')
      .eq('notable', true)
      .lte('fame_rank', 20)
      .limit(60);

    if (error) {
      return NextResponse.json({ silhouettes: [] });
    }

    const urls = (data ?? [])
      .map((p) => p.silhouette_url as string)
      .filter(Boolean)
      .sort(() => Math.random() - 0.5)
      .slice(0, 7);

    return NextResponse.json(
      { silhouettes: urls },
      { headers: { 'Cache-Control': 'public, max-age=120' } }
    );
  } catch (error) {
    return errorResponse('GET /api/showcase', error);
  }
}
