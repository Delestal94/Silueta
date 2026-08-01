import { NextResponse } from 'next/server';
import { supabaseAnonKey, supabaseUrl } from '@/lib/supabase/env';

export const dynamic = 'force-dynamic';

/**
 * Public Supabase settings for the browser's realtime connection.
 *
 * Both values are public by design — the anon key ships to every visitor and
 * cannot read the player catalog or any room token (migrations 0005/0006).
 * They are served from here rather than inlined at build time so the app works
 * regardless of how the host classifies its environment variables.
 */
export async function GET() {
  const url = supabaseUrl();
  const anonKey = supabaseAnonKey();

  if (!url || !anonKey) {
    return NextResponse.json(
      { error: 'El despliegue no tiene configurado Supabase.' },
      { status: 500 }
    );
  }

  return NextResponse.json(
    { url, anonKey },
    // Public, unchanging per deployment — let the edge hold onto it.
    { headers: { 'Cache-Control': 'public, max-age=300' } }
  );
}
