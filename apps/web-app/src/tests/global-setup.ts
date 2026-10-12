// import { execSync } from 'node:child_process';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';

let replSet: MongoMemoryReplSet | undefined;

const require = createRequire(import.meta.url);
const prismaCli = require.resolve('prisma');

export default async function setup() {
  replSet = await MongoMemoryReplSet.create();

  const uri = `${replSet.getUri('expense-tracker-test')}&directConnection=true`;
  process.env.DATABASE_URL = uri;

  console.log(`[setup] mongo up at ${uri}`);
  console.log('[setup] pushing schema…');
  try {
    execFileSync(process.execPath, [prismaCli, 'db', 'push', '--skip-generate'], {
      env: { ...process.env, DATABASE_URL: uri },
      stdio: ['ignore', 'inherit', 'inherit'],
      timeout: 120_000,
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
