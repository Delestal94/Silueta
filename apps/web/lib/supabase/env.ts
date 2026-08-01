/**
 * Server-side resolution of the Supabase connection settings.
 *
 * Accepts both the NEXT_PUBLIC_* names and plain ones. Vercel withholds
 * variables marked "Sensitive" from the build step, and NEXT_PUBLIC_* values
 * are inlined at build time — so a sensitive NEXT_PUBLIC_SUPABASE_URL compiles
 * to `undefined` and the deployment fails at runtime with a variable the
 * dashboard clearly shows as set. Reading them here, on the server at request
 * time, sidesteps that entirely.
 */
function firstSet(...names: string[]): string | null {
  for (const name of names) {
    const value = process.env[name];
    if (value) return value;
  }
  return null;
}

export function supabaseUrl(): string | null {
  return firstSet('SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_URL');
}

export function supabaseAnonKey(): string | null {
  return firstSet('SUPABASE_ANON_KEY', 'NEXT_PUBLIC_SUPABASE_ANON_KEY');
}

export function supabaseServiceKey(): string | null {
  return firstSet('SUPABASE_SERVICE_ROLE_KEY');
}

export function requireUrl(): string {
  const value = supabaseUrl();
  if (!value) {
    throw new Error(
      'Falta SUPABASE_URL (o NEXT_PUBLIC_SUPABASE_URL) en las variables de entorno del despliegue.'
    );
  }
  return value;
}

export function requireServiceKey(): string {
  const value = supabaseServiceKey();
  if (!value) {
    throw new Error(
      'Falta SUPABASE_SERVICE_ROLE_KEY en las variables de entorno del despliegue.'
    );
  }
  return value;
}
