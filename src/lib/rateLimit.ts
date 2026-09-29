import { getRedisClient } from './redis';

// ── Store layer ────────────────────────────────────────────────────────────
// One primitive backs both limiter shapes: hit(key, windowSeconds), with
// first-hit-anchored windows (EXPIRE NX in Redis; expiresAt in memory).
// REDIS_URL set → shared counters (survive restarts, work across instances).
// Unset → in-memory per process (previous behavior; what tests use).

interface HitResult {
  count: number;
  ttlSeconds: number;
}

// Fail-open: a Redis outage must not take the app down or lock everyone out.
// (If you'd rather hard-fail brute-force protection, flip this to throw.)
async function hit(key: string, windowSeconds: number): Promise<HitResult> {
  const client = getRedisClient();
  if (!client) return memoryHit(key, windowSeconds);

  try {
    const results = await client
      .pipeline()
      .incr(key)
      .expire(key, windowSeconds, 'NX') // anchor the window at the first hit only
      .ttl(key)
      .exec();

    const count = Number(results?.[0]?.[1] ?? 1);
    let ttl = Number(results?.[2]?.[1] ?? windowSeconds);

    if (ttl < 0) {
      // Key exists without an expiry (e.g. EXPIRE failed once) — repair it
      // so counters can't leak forever.
      await client.expire(key, windowSeconds).catch(() => {});
      ttl = windowSeconds;
    }
    return { count, ttlSeconds: ttl };
  } catch (error) {
    console.error('Rate limiter Redis failure (fail-open):', error);
    return { count: 1, ttlSeconds: windowSeconds };
  }
}

const memoryBuckets = new Map<string, { count: number; expiresAt: number }>();

function memoryHit(key: string, windowSeconds: number): HitResult {
  const now = Date.now();
  const bucket = memoryBuckets.get(key);
  if (!bucket || now >= bucket.expiresAt) {
    memoryBuckets.set(key, { count: 1, expiresAt: now + windowSeconds * 1000 });
    return { count: 1, ttlSeconds: windowSeconds };
  }
  bucket.count += 1;
  return { count: bucket.count, ttlSeconds: Math.ceil((bucket.expiresAt - now) / 1000) };
}

async function resetKey(key: string): Promise<void> {
  const client = getRedisClient();
  if (client) {
    await client.del(key).catch((error) => console.error('Rate limiter reset failed:', error));
  } else {
    memoryBuckets.delete(key);
  }
}

// ── Daily buckets (chatbot) ────────────────────────────────────────────────

function nextUtcMidnight(now: Date): string {
  return new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1),
  ).toISOString();
}

export async function checkRateLimit(key: string, limit: number) {
  const now = new Date();
  const day = now.toISOString().slice(0, 10);
  const secondsUntilMidnight = Math.max(
    1,
    Math.ceil((Date.parse(nextUtcMidnight(now)) - now.getTime()) / 1000),
  );

  const { count, ttlSeconds } = await hit(`day:${key}:${day}`, secondsUntilMidnight);
  return {
    allowed: count <= limit,
    remaining: Math.max(0, limit - count),
    resetAt: new Date(Date.now() + ttlSeconds * 1000).toISOString(),
  };
}

// ── Rolling windows (login/register) ───────────────────────────────────────

export interface WindowRateLimitResult {
  allowed: boolean;
  remaining: number;
  retryAfterSeconds: number;
}

export async function checkWindowRateLimit(
  key: string,
  limit: number,
  windowMs: number,
): Promise<WindowRateLimitResult> {
  const { count, ttlSeconds } = await hit(`win:${key}`, Math.ceil(windowMs / 1000));
  return {
    allowed: count <= limit,
    remaining: Math.max(0, limit - count),
    retryAfterSeconds: ttlSeconds,
  };
}

export async function resetWindowRateLimit(key: string): Promise<void> {
  await resetKey(`win:${key}`);
}

// ── Helpers ────────────────────────────────────────────────────────────────

/** Read a positive integer limit from env, with fallback. */
export function envLimit(name: string, fallback: number): number {
  const parsed = Number(process.env[name]);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
}

export function clientIpFromRequest(request: Request): string {
  const xff = request.headers.get('x-forwarded-for');
  if (xff) return xff.split(',')[0].trim();
  return request.headers.get('x-real-ip') ?? 'unknown';
}

// Test-only: clears the in-memory store.
export function resetRateLimiter() {
  memoryBuckets.clear();
}
