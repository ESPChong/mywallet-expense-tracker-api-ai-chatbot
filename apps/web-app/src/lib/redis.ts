import Redis from 'ioredis';

// Shared store for rate-limit counters.
// REDIS_URL unset → callers fall back to in-memory limiting (tests always do).

let client: Redis | null = null;

export function isRedisEnabled(): boolean {
  return Boolean(process.env.REDIS_URL);
}

export function getRedisClient(): Redis | null {
  if (!process.env.REDIS_URL) return null;
  if (!client) {
    client = new Redis(process.env.REDIS_URL, {
      maxRetriesPerRequest: 1, // surface failures fast → fail-open in the limiter
      enableOfflineQueue: false, // error immediately while disconnected
    });
    client.on('error', (err) => console.error('Redis error:', err.message));
  }
  return client;
}

export async function pingRedis(): Promise<boolean> {
  const c = getRedisClient();
  if (!c) return false;
  try {
    return (await c.ping()) === 'PONG';
  } catch {
    return false;
  }
}
