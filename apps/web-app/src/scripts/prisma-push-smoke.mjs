import { execSync, spawn } from 'node:child_process';
import { MongoMemoryReplSet } from 'mongodb-memory-server';

const rs = await MongoMemoryReplSet.create();

const uri = `${rs.getUri('expense-tracker-test')}&directConnection=true`;
process.env.DATABASE_URL = uri;
console.log('[smoke] mongo up:', uri);

const watcher = spawn('sh', ['-c', `
  for i in $(seq 1 11); do
    sleep 10
    echo; echo "== t+$((i*10))s =="
    ps -eo pid,ppid,stat,wchan:28,etime,cmd | grep -E '[p]risma|[s]chema-engine|[m]ongod' || true
    ss -tnp 2>/dev/null | grep ESTAB || true
  done
`], { stdio: 'inherit' });

try {
  execSync('npx prisma db push --skip-generate', {
    env: { ...process.env, DATABASE_URL: uri },
    stdio: ['ignore', 'inherit', 'inherit'],
    timeout: 120_000,
  });
  console.log('[smoke] SUCCESS');
} finally {
  watcher.kill();
  try { await Promise.race([rs.stop(), new Promise((r) => setTimeout(r, 5000))]); } catch {}
}