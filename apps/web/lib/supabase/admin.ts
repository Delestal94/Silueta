import { createClient } from '@supabase/supabase-js';
import { requireServiceKey, requireUrl } from './env';

/**
 * Server-only client. Uses the service-role key, which bypasses RLS entirely,
 * so it must never be imported from a client component.
 */
export function createAdminClient() {
  return createClient(requireUrl(), requireServiceKey(), {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}
