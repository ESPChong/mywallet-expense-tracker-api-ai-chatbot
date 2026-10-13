import { execSync } from 'node:child_process';
import { MongoMemoryReplSet } from 'mongodb-memory-server';

let replSet: MongoMemoryReplSet | undefined;

export default async function setup() {
  replSet = await MongoMemoryReplSet.create();
  const uri = `${replSet.getUri('expense-tracker-test')}&directConnection=true`;
  process.env.DATABASE_URL = uri;

  console.log(`[setup] mongo up at ${uri}`);
  try {
    execSync('npx prisma db push --skip-generate', {
      env: { ...process.env, DATABASE_URL: uri },
      stdio: ['ignore', 'inherit', 'inherit'],
      timeout: 120_000, // tripwire only — should never fire once fixed
    });
  } catch (err) {
    console.error('[setup] prisma db push failed:', err);
    throw err;
  }
}

export async function teardown() {
  if (!replSet) return;
  try {
    await Promise.race([replSet.stop(), new Promise((r) => setTimeout(r, 5000))]);
  } catch {}
}
