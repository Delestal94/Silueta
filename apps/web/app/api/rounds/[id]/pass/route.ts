import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

const ERRORS: Record<string, [string, number]> = {
  round_closed: ['La ronda ya cerró', 409],
  not_a_participant: ['No estás en esta sala', 403],
  no_passes_left: ['Ya usaste tu único pase', 400],
  already_passed: ['Ya pasaste en esta ronda', 400],
  position_already_full: ['Ya completaste esa posición', 400],
};

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: roundId } = await params;
  const clientToken = request.headers.get('x-client-token');

  if (!clientToken) {
    return NextResponse.json({ error: 'Falta el token de jugador' }, { status: 401 });
  }

  const supabase = createAdminClient();
  const { data, error } = await supabase.rpc('pass_round', {
    p_round: roundId,
    p_client_token: clientToken,
  });

  if (error) {
    return NextResponse.json({ error: 'No se pudo pasar' }, { status: 500 });
  }

  if (data?.error) {
    const [message, status] = ERRORS[data.error] ?? ['No se pudo pasar', 400];
    return NextResponse.json({ error: message }, { status });
  }

  return NextResponse.json(data);
}
