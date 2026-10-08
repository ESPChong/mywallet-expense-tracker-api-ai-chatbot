import { createHash, randomBytes } from 'crypto';

// 256-bit token (UUIDs only give ~122 bits and aren't designed as secrets)
export function generateSessionToken(): string {
  return randomBytes(32).toString('base64url');
}

// Only the hash is stored — a DB leak does not expose usable session tokens
export function hashSessionToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}
