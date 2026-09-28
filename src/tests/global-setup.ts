import { execSync } from 'node:child_process';
import { MongoMemoryReplSet } from 'mongodb-memory-server';

let replSet: MongoMemoryReplSet | undefined;

export default async function setup() {
  replSet = await MongoMemoryReplSet.create();
  const uri = replSet.getUri('expense-tracker-test');
  process.env.DATABASE_URL = uri;

  execSync('npx prisma db push --skip-generate', {
    env: { ...process.env, DATABASE_URL: uri },
    stdio: 'pipe', // keep npx/prisma chatter out of the test output
  });
}

export async function teardown() {
  if (!replSet) return;

  try {
    await Promise.race([replSet.stop(), new Promise((resolve) => setTimeout(resolve, 5000))]);
  } catch {}
}
