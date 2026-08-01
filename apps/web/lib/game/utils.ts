import { randomBytes, randomInt } from 'crypto';

// Ambiguous glyphs (0/O, 1/I) are omitted so codes survive being read aloud.
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export function generateRoomCode(length = 6): string {
  let code = '';
  for (let i = 0; i < length; i++) {
    code += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
  }
  return code;
}

// These tokens are the only thing authorizing host actions, so they must not
// come from Math.random().
export function generateToken(): string {
  return randomBytes(24).toString('base64url');
}
