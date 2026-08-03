import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

/**
 * Every client asks for this every few seconds, so it is the one endpoint
 * whose cost matters. The whole state — including which silhouette this
 * particular viewer is allowed to see — is assembled by a single database
 * function: the previous version issued nine sequential queries and spent
 * 581 ms doing it, on a 1.7 KB answer.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ code: string }> }
) {
  const { code } = await params;
  const clientToken = request.headers.get('x-client-token');
  const supabase = createAdminClient();

  const { data, error } = await supabase.rpc('room_state', {
    p_code: code,
    p_client_token: clientToken,
  });

  if (error) {
    console.error('[GET /api/rooms/[code]/state]', error);
    return NextResponse.json({ error: 'No se pudo leer la sala' }, { status: 500 });
  }

  if (!data || (data as Record<string, unknown>).error === 'room_not_found') {
    return NextResponse.json({ error: 'Sala no encontrada' }, { status: 404 });
  }

  return NextResponse.json(data);
}
