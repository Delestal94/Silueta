import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: roundId } = await params;
  const supabase = createAdminClient();

  // Idempotent by design: every client races to call this when the timer
  // hits zero, and only the first one actually settles the auction.
  const { data, error } = await supabase.rpc('finalize_round', { p_round: roundId });

  if (error) {
    return NextResponse.json({ error: 'No se pudo cerrar la ronda' }, { status: 500 });
  }

  return NextResponse.json(data);
}
