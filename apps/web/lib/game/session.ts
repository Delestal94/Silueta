import { createClient } from '@/lib/supabase/server';

export interface Account {
  id: string;
  name: string | null;
  email: string | null;
  avatar: string | null;
}

/**
 * The signed-in account, or null.
 *
 * Reads the session from the request cookies and asks Supabase to verify it,
 * rather than trusting whatever the browser sent. The id this returns is the
 * only thing allowed to end up in `room_participants.user_id`: if a route took
 * it from the request body instead, anyone could file their game under
 * somebody else's name and take over their ranking row.
 */
export async function currentAccount(): Promise<Account | null> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) return null;

    const meta = data.user.user_metadata ?? {};

    return {
      id: data.user.id,
      name: meta.full_name ?? meta.name ?? null,
      email: data.user.email ?? null,
      avatar: meta.avatar_url ?? meta.picture ?? null,
    };
  } catch {
    // Signing in is optional, so a broken session must never be the reason
    // somebody cannot start a game. They play as a guest.
    return null;
  }
}
