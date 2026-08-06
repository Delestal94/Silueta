import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

const ERRORS: Record<string, [string, number]> = {
  round_not_found: ['Ronda no encontrada', 404],
  not_a_participant: ['No estás en esta sala', 403],
  // Que sólo pueda el ganador no es una cortesía: sin eso cualquiera de la
  // sala podría tirar por un fichaje ajeno.
  not_the_winner: ['No te llevaste a este jugador', 403],
  signing_not_found: ['No figura el fichaje', 404],
  already_bet: ['Ya decidiste con este jugador', 409],
};

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: roundId } = await params;
  const clientToken = request.headers.get('x-client-token');

  if (!clientToken) {
    return NextResponse.json({ error: 'Falta el token de jugador' }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  // Cualquier cosa que no sea "va" es no aceptar el reto. La tirada la hace
  // Postgres: el navegador no decide nada acá.
  const decision = body?.decision === 'va' ? 'va' : 'paso';

  const supabase = createAdminClient();
  const { data, error } = await supabase.rpc('apostar_ovr', {
    p_round: roundId,
    p_client_token: clientToken,
    p_decision: decision,
  });

  if (error) {
    return NextResponse.json({ error: 'No se pudo resolver la apuesta' }, { status: 500 });
  }

  if (data?.error) {
    const [message, status] = ERRORS[data.error] ?? ['No se pudo resolver la apuesta', 400];
    return NextResponse.json({ error: message }, { status });
  }

  return NextResponse.json(data);
}
