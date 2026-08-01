import { createClient } from '@supabase/supabase-js';

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    // A missing variable used to surface as "Petición inválida" from the
    // route's catch-all, which reads like the user typed something wrong.
    // Name the variable instead — this is a deployment problem, not input.
    throw new Error(
      `Falta la variable de entorno ${name}. Cargala en Vercel (Settings → Environment Variables).`
    );
  }
  return value;
}

/**
 * Server-only client. Uses the service-role key, which bypasses RLS entirely,
 * so it must never be imported from a client component.
 */
export function createAdminClient() {
  return createClient(required('NEXT_PUBLIC_SUPABASE_URL'), required('SUPABASE_SERVICE_ROLE_KEY'), {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}
