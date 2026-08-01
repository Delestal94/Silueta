import { timingSafeEqual } from 'crypto';

/**
 * Moderation is gated by a single shared token in ADMIN_TOKEN.
 *
 * Compared in constant time so the endpoint cannot be used as an oracle to
 * recover the token one character at a time.
 */
export function isAdmin(token: string | null): boolean {
  const expected = process.env.ADMIN_TOKEN;
  if (!expected || !token) return false;

  const a = Buffer.from(token);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;

  return timingSafeEqual(a, b);
}

export function adminConfigured(): boolean {
  return !!process.env.ADMIN_TOKEN;
}
