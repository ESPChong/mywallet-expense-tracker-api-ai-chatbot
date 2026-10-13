
import { execSync, spawn } from 'node:child_process';
import fs from 'node:fs';
import { MongoMemoryReplSet, MongoMemoryServer } from 'mongodb-memory-server';
import { MongoClient } from 'mongodb';

const single = process.env.SMOKE_SERVER === 'single';
const plain  = process.env.SMOKE_URI === 'plain';

const server = single
  ? await MongoMemoryServer.create()
  : await MongoMemoryReplSet.create();

const baseUri = server.getUri('expense-tracker-test'); // exact pre-restructure form
const uri = plain || single ? baseUri : `${baseUri}&directConnection=true`;
const safeUri = uri.split('?')[0];
console.log(`[smoke] server=${single ? 'single' : 'replset'} uri=${uri}`);
process.env.DATABASE_URL = uri;

const watcher = spawn('sh', ['-c', `
  for i in $(seq 1 9); do
    sleep 10
    echo; echo "== t+$((i*10))s =="
    ps -eo pid,ppid,stat,wchan:28,etime,cmd | grep -E '[p]risma|[s]chema-engine|[m]ongod' || true
    ss -tnp 2>/dev/null | grep -E '127.0.0.1|::1' || true
    P=$(pgrep -f schema-engine | head -1)
    if [ -n "$P" ] && [ "$i" = "2" ] && command -v strace >/dev/null 2>&1; then
      timeout 20 strace -f -p "$P" -o /tmp/engine-trace.txt 2>/dev/null &
    fi
  done
`], { stdio: 'inherit' });

let ok = false;
try {
  execSync('npx prisma db push --skip-generate', {
    env: { ...process.env, DATABASE_URL: uri },
    stdio: ['ignore', 'inherit', 'inherit'],
    timeout: 90_000,
  });
  ok = true;
  console.log('[smoke] SUCCESS');
} catch (e) {
  console.error(`[smoke] prisma failed (${e.code ?? String(e).slice(0, 60)})`);
} finally {
  watcher.kill();
  await Promise.race([
    (async () => {
      const client = new MongoClient(safeUri, { serverSelectionTimeoutMS: 5000, directConnection: true });
      await client.connect();
      const db = client.db('expense-tracker-test');
      const cols = (await db.listCollections().toArray()).map((c) => c.name).sort();
      console.log(`[post-mortem] collections (${cols.length}):`, cols);
      for (const name of cols) {
        const idx = await db.collection(name).listIndexes().toArray();
        console.log(`[post-mortem] ${name} indexes:`, idx.map((i) => i.name).join(', '));
      }
      await client.close();
    })(),
    new Promise((r) => setTimeout(() => { console.log('[post-mortem] timed out'); r(); }, 15_000)),
  ]);
  if (fs.existsSync('/tmp/engine-trace.txt')) {
    console.log('[strace] last 40 lines:');
    execSync('tail -n 40 /tmp/engine-trace.txt', { stdio: 'inherit' });
  }
  try { await Promise.race([server.stop(), new Promise((r) => setTimeout(r, 5000))]); } catch {}
  process.exitCode = ok ? 0 : 1;
}