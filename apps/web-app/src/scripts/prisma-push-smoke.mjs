import { execSync } from 'node:child_process';
import { MongoMemoryReplSet } from 'mongodb-memory-server';

const rs = await MongoMemoryReplSet.create();
const uri = `${rs.getUri('expense-tracker-test')}&directConnection=true`;
console.log('[smoke] mongo up:', uri);

const t0 = Date.now();
try {
  execSync('npx prisma db push --skip-generate', {
    env: { ...process.env, DATABASE_URL: uri },
    stdio: ['ignore', 'inherit', 'inherit'],
    timeout: 90_000,
  });
} finally {
  console.log(`[smoke] done in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
  await rs.stop();
}