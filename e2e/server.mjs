// E2E launcher: ephemeral MongoDB replica set + schema push + Next dev server.
// Playwright kills this process at teardown; the memory server's killer
// process reaps mongod even if we die hard.
import { execSync, spawn } from 'node:child_process';
import { MongoMemoryReplSet } from 'mongodb-memory-server';

const APP_PORT = process.env.E2E_PORT ?? '3100';
const DB_PORT = 62001; // fixed so the URI is static
const DB_URL = `mongodb://127.0.0.1:${DB_PORT}/expense-tracker-e2e?directConnection=true`;

console.log('[e2e] starting MongoDB replica set...');
const replSet = await MongoMemoryReplSet.create({
  replSetCount: 1,
  instanceOpts: [{ port: DB_PORT }],
});
console.log(`[e2e] MongoDB ready: ${DB_URL}`);

// Prisma does not auto-create indexes on MongoDB — push the schema so
// unique constraints exist during E2E.
execSync('npx prisma db push --skip-generate', {
  env: { ...process.env, DATABASE_URL: DB_URL },
  stdio: 'inherit',
});
console.log('[e2e] schema applied');

const server = spawn('npx', ['next', 'dev', '-p', APP_PORT], {
  env: {
    ...process.env,
    DATABASE_URL: DB_URL,
    REDIS_URL: '',
    LOGIN_RATE_LIMIT_IP: '1000',
    LOGIN_RATE_LIMIT_EMAIL: '1000',
    REGISTER_RATE_LIMIT_IP: '1000',
    // No Ollama in E2E: the chatbot runs in deterministic offline mode.
    CHATBOT_LLM_DISABLED: 'true',
    // Headroom in case specs are extended to send many messages.
    CHATBOT_DAILY_LIMIT: '1000',
  },
  stdio: 'inherit',
});

async function shutdown(signal) {
  server.kill(signal);
  await replSet.stop().catch(() => {});
  process.exit(0);
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
server.on('exit', (code) => process.exit(code ?? 0));