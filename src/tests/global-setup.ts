import { execSync } from 'node:child_process';
import { MongoMemoryReplSet } from 'mongodb-memory-server';

let replSet: MongoMemoryReplSet | undefined;

export default async function setup() {
  replSet = await MongoMemoryReplSet.create();
  const uri = replSet.getUri('expense-tracker-test');
  process.env.DATABASE_URL = uri;

  // Prisma does NOT auto-create indexes on MongoDB — without this push, the
  // in-memory instance has no unique constraints, and every P2002-dependent
  // code path (categories 409, register race, income idempotency guard)
  // silently never fires.
  execSync('npx prisma db push --skip-generate', {
    env: { ...process.env, DATABASE_URL: uri },
    stdio: 'pipe', // keep npx/prisma chatter out of the test output
  });
}

export async function teardown() {
  if (!replSet) return;
  // Race the graceful stop against a hard timeout: a mongod that ignores
  // SIGTERM must not hold the whole run hostage. (The library also spawns a
  // "killer" process that reaps mongod when this process exits regardless.)
  try {
    await Promise.race([replSet.stop(), new Promise((resolve) => setTimeout(resolve, 5000))]);
  } catch {
    // graceful stop failed — killer process handles it
  }
}
