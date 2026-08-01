import { createBrowserClient } from '@supabase/ssr';
import type { SupabaseClient } from '@supabase/supabase-js';

let cached: Promise<SupabaseClient> | null = null;

/**
 * Browser client, used only for realtime subscriptions.
 *
 * The connection settings come from /api/config instead of build-time
 * NEXT_PUBLIC_* inlining, so the app works even when the host keeps those
 * variables out of the build (Vercel does this for "Sensitive" ones). The
 * anon key it carries is public by design and cannot read the player catalog
 * or any room token — see migrations 0005/0006.
 */
export function getSupabaseClient(): Promise<SupabaseClient> {
  if (!cached) {
    cached = fetch('/api/config')
      .then(async (res) => {
        if (!res.ok) throw new Error('No se pudo leer la configuración del servidor');
        const { url, anonKey } = await res.json();
        return createBrowserClient(url, anonKey);
      })
      .catch((err) => {
        // Let the next caller retry rather than caching the failure forever.
        cached = null;
        throw err;
      });
  }

  return cached;
}
