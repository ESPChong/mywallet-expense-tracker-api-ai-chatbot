import { MongoMemoryReplSet } from 'mongodb-memory-server';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';

const rs = await MongoMemoryReplSet.create();
const require = createRequire(import.meta.url);
const prismaCli = require.resolve('prisma');

const uri = `${rs.getUri('expense-tracker-test')}&directConnection=true`;
console.log('[smoke] mongo up:', uri);

const t0 = Date.now();
try {
  execFileSync(process.execPath, [prismaCli, 'db', 'push', '--skip-generate'], {
    env: { ...process.env, DATABASE_URL: uri },
    stdio: ['ignore', 'inherit', 'inherit'],
    timeout: 120_000,
    });
} finally {
  console.log(`[smoke] done in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
  await rs.stop();
}