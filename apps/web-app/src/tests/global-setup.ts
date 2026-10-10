import { execSync } from 'node:child_process';
import { MongoMemoryReplSet } from 'mongodb-memory-server';

let replSet: MongoMemoryReplSet | undefined;

export default async function setup() {
  replSet = await MongoMemoryReplSet.create();

  const uri = `${replSet.getUri('expense-tracker-test')}&directConnection=true`;
  process.env.DATABASE_URL = uri;

  console.log(`[setup] mongo up at ${uri}`);
  console.log('[setup] pushing schema…');
  try {
    execSync('npx prisma db push --skip-generate', {
      env: { ...process.env, DATABASE_URL: uri },
      stdio: 'inherit',
      timeout: 300_000,
    });
  } catch (err) {
    console.error('[setup] prisma db push failed:', err);
    throw err;
  }
  console.log('[setup] schema pushed');
}

export async function teardown() {
  if (!replSet) return;

  try {
    await Promise.race([replSet.stop(), new Promise((resolve) => setTimeout(resolve, 5000))]);
  } catch {}
}
