// In-memory rate limiting. Fine for a single dev process; swap for a Mongo
// counter or Redis before deploying multi-instance.

// ── Fixed daily buckets (chatbot) ──────────────────────────────────────────

const buckets = new Map<string, { day: string; count: number }>();

function nextUtcMidnight(now: Date): string {
  return new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1),
  ).toISOString();
}

export function checkRateLimit(key: string, limit: number) {
  const now = new Date();
  const day = now.toISOString().slice(0, 10);
  const bucket = buckets.get(key);

  if (!bucket || bucket.day !== day) {
    buckets.set(key, { day, count: 1 });
    return { allowed: true, remaining: limit - 1, resetAt: nextUtcMidnight(now) };
  }
  if (bucket.count >= limit) {
    return { allowed: false, remaining: 0, resetAt: nextUtcMidnight(now) };
  }
  bucket.count += 1;
  return { allowed: true, remaining: limit - bucket.count, resetAt: nextUtcMidnight(now) };
}

// ── Fixed time windows (login/register) ────────────────────────────────────

const windowBuckets = new Map<string, { windowStart: number; count: number }>();

export interface WindowRateLimitResult {
  allowed: boolean;
  remaining: number;
  retryAfterSeconds: number;
}

export function checkWindowRateLimit(
  key: string,
  limit: number,
  windowMs: number,
): WindowRateLimitResult {
  const now = Date.now();
  const bucket = windowBuckets.get(key);

  if (!bucket || now >= bucket.windowStart + windowMs) {
    windowBuckets.set(key, { windowStart: now, count: 1 });
    return { allowed: true, remaining: limit - 1, retryAfterSeconds: 0 };
  }
  if (bucket.count >= limit) {
    const retryAfterSeconds = Math.ceil((bucket.windowStart + windowMs - now) / 1000);
    return { allowed: false, remaining: 0, retryAfterSeconds };
  }
  bucket.count += 1;
  return { allowed: true, remaining: limit - bucket.count, retryAfterSeconds: 0 };
}

export function resetWindowRateLimit(key: string) {
  windowBuckets.delete(key);
}

/** Read a positive integer limit from env, with fallback. */
export function envLimit(name: string, fallback: number): number {
  const parsed = Number(process.env[name]);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
}

/**
 * Best-effort client IP. Behind a proxy (Vercel etc.) trusts x-forwarded-for;
 * locally everyone is 'unknown' (one shared bucket — acceptable for dev).
 */
export function clientIpFromRequest(request: Request): string {
  const xff = request.headers.get('x-forwarded-for');
  if (xff) return xff.split(',')[0].trim();
  return request.headers.get('x-real-ip') ?? 'unknown';
}

// Test-only: clears both maps.
export function resetRateLimiter() {
  buckets.clear();
  windowBuckets.clear();
}
