import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

/**
 * Where Google sends the player back.
 *
 * Supabase hands over a one-time code; this trades it for a session and writes
 * the cookies. It has to be a route handler rather than a page because that
 * exchange must happen server-side — the browser never sees the secret half.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get('code');

  // Only same-origin paths: `next` arrives in the query string, and taking an
  // absolute URL from there would turn this into an open redirect.
  const raw = url.searchParams.get('next') ?? '/';
  const next = raw.startsWith('/') && !raw.startsWith('//') ? raw : '/';

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(new URL(next, url.origin));
  }

  // Signing in is optional, so a failure is not a dead end: back to the page
  // with a flag the header can turn into a readable message.
  return NextResponse.redirect(new URL(`${next}${next.includes('?') ? '&' : '?'}auth=error`, url.origin));
}
