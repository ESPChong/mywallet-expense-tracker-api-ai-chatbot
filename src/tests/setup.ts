import { beforeEach, afterAll } from 'vitest';
import { prisma } from '@/lib/prisma';
import { resetRateLimiter } from '@/lib/rateLimit';
import { cookieStore } from './mocks/next-headers';

// Deterministic chatbot behavior in tests: never reach for a real Ollama
process.env.CHATBOT_LLM_DISABLED = 'true';

beforeEach(async () => {
  resetRateLimiter();

  // Safety tripwire: refuse to run against anything that isn't the in-memory server
  if (!process.env.DATABASE_URL?.startsWith('mongodb://127.0.0.1')) {
    throw new Error(
      `Tests refuse to run against "${process.env.DATABASE_URL}" — expected the in-memory replica set.`,
    );
  }

  await prisma.incomeEntry.deleteMany();
  await prisma.income.deleteMany();
  await prisma.expense.deleteMany();
  await prisma.category.deleteMany();
  await prisma.session.deleteMany();
  await prisma.user.deleteMany();
  cookieStore.clear();
});

afterAll(async () => {
  await prisma.$disconnect();
});
