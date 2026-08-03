import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: roundId } = await params;
  const supabase = createAdminClient();

  // Two different things arrive here. The automatic close fires from every
  // client when its own clock hits zero, and must never be trusted to decide
  // the round is over — that is what let the fastest clock cut the bidding
  // short for everyone. A deliberate close by the host is authenticated and
  // legitimate, so it says so explicitly with `force`.
  const body = await request.json().catch(() => ({}));
  const hostToken = body?.force === true ? request.headers.get('x-host-token') : null;

  const { data, error } = await supabase.rpc('finalize_round', {
    p_round: roundId,
    p_host_token: hostToken,
  });

  if (error) {
    return NextResponse.json({ error: 'No se pudo cerrar la ronda' }, { status: 500 });
  }

  if (data?.error === 'round_still_open') {
    // Not a failure, just early. The remaining time lets the caller correct
    // its own clock instead of hammering the endpoint.
    return NextResponse.json(
      { error: 'La ronda todavía no terminó', ms_left: data.ms_left },
      { status: 409 }
    );
  }

  if (data?.error === 'round_not_found') {
    return NextResponse.json({ error: 'Ronda no encontrada' }, { status: 404 });
  }

  return NextResponse.json(data);
}
