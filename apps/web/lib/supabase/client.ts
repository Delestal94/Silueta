import { createBrowserClient } from '@supabase/ssr';

/**
 * Browser client, used only for realtime subscriptions. The anon key it
 * carries is public by design and cannot read the player catalog or any room
 * token — see migrations 0005/0006.
 *
 * NEXT_PUBLIC_* values are inlined at build time, so if they were added to the
 * host after a deployment, that deployment still has them undefined and needs
 * rebuilding.
 */
export function createClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !key) {
    throw new Error(
      'Faltan NEXT_PUBLIC_SUPABASE_URL o NEXT_PUBLIC_SUPABASE_ANON_KEY en este build.'
    );
  }

  return createBrowserClient(url, key);
}
