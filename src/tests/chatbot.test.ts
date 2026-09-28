import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { resetRateLimiter } from '@/lib/rateLimit';
import { OFFLINE_MODE_PREFIX } from '@/services/chatbotService';
import { buildChatbotContext, computeProjection } from '@/services/chatbotContextService';
import { getMonthBreakdown, listExpenses } from '@/services/chatbotToolsService';
import {
  req,
  createUserWithSession,
  authenticate,
  clearAuth,
  seedCategory,
  seedExpense,
} from './helpers';
import { POST as chatbot } from '@/app/api/chatbot/route';

function currentPeriod() {
  const now = new Date();
  const year = now.getUTCFullYear();
  const month = now.getUTCMonth() + 1;
  const prevMonth = month === 1 ? 12 : month - 1;
  const prevYear = month === 1 ? year - 1 : year;
  return { year, month, prevYear, prevMonth, current: `${year}-${String(month).padStart(2, '0')}` };
}

beforeEach(() => {
  resetRateLimiter();
});

afterEach(() => {
  delete process.env.CHATBOT_DAILY_LIMIT;
});

describe('POST /api/chatbot', () => {
  it('rejects unauthenticated requests', async () => {
    clearAuth();
    const res = await chatbot(req('POST', '/api/chatbot', { message: 'hi' }));
    expect(res.status).toBe(401);
  });

  it('validates the request body', async () => {
    const { token } = await createUserWithSession();
    authenticate(token);

    expect((await chatbot(req('POST', '/api/chatbot', { message: '' }))).status).toBe(400);
    expect((await chatbot(req('POST', '/api/chatbot', { message: 'a'.repeat(2001) }))).status).toBe(
      400,
    );
    expect(
      (await chatbot(req('POST', '/api/chatbot', { message: 'hi', month: '2025-13' }))).status,
    ).toBe(400);
    expect(
      (
        await chatbot(
          req('POST', '/api/chatbot', {
            message: 'hi',
            history: [{ role: 'system', content: 'x' }],
          }),
        )
      ).status,
    ).toBe(400);
    expect(
      (
        await chatbot(
          req('POST', '/api/chatbot', {
            message: 'hi',
            history: Array.from({ length: 11 }, () => ({ role: 'user' as const, content: 'x' })),
          }),
        )
      ).status,
    ).toBe(400);
  });

  it('returns 400 for malformed JSON', async () => {
    const { token } = await createUserWithSession();
    authenticate(token);
    const raw = new Request('http://localhost/api/chatbot', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: 'not-json',
    }) as unknown as NextRequest;
    expect((await chatbot(raw)).status).toBe(400);
  });

  it('returns a deterministic offline summary built from live context', async () => {
    const { user, token } = await createUserWithSession();
    authenticate(token);
    const food = await seedCategory(user.id, 'food');
    await seedExpense(user.id, { amount: 5000, categoryId: food.id, date: new Date() });
    await prisma.income.create({
      data: { name: 'Salary', amount: 100000, dayOfMonth: 1, userId: user.id },
    });

    const res = await chatbot(
      req('POST', '/api/chatbot', { message: 'How am I doing this month?' }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.reply.startsWith(OFFLINE_MODE_PREFIX)).toBe(true);
    expect(body.reply).toContain('$50.00'); // 5000 cents
    expect(body.reply).toContain('$1,000.00'); // 100000 cents
  });

  it('exposes the model payload via ?debug=1', async () => {
    const { token } = await createUserWithSession();
    authenticate(token);

    const res = await chatbot(req('POST', '/api/chatbot?debug=1', { message: 'hi' }));
    const body = await res.json();
    expect(body.payload.messages).toHaveLength(2); // system + user, no history
    expect(body.payload.messages[0].role).toBe('system');
    expect(body.payload.messages[0].content).toContain('"amountUnit": "cents"');
    expect(body.payload.messages[1]).toMatchObject({ role: 'user', content: 'hi' });
    expect(body.payload.tools).toHaveLength(2);
  });

  it('returns 429 once the daily limit is hit', async () => {
    process.env.CHATBOT_DAILY_LIMIT = '3';
    const { token } = await createUserWithSession();
    authenticate(token);

    for (let i = 0; i < 3; i++) {
      const res = await chatbot(req('POST', '/api/chatbot', { message: `question ${i}` }));
      expect(res.status).toBe(200);
    }
    const blocked = await chatbot(req('POST', '/api/chatbot', { message: 'one more' }));
    expect(blocked.status).toBe(429);
    const body = await blocked.json();
    expect(typeof body.resetAt).toBe('string');
  });
});

describe('buildChatbotContext', () => {
  it('assembles current month, trailing months, incomes, all-time, projection', async () => {
    const { user } = await createUserWithSession();
    const { year, month, prevYear, prevMonth, current } = currentPeriod();

    const food = await seedCategory(user.id, 'food');
    await seedExpense(user.id, { amount: 5000, categoryId: food.id, date: new Date() });
    await seedExpense(user.id, {
      amount: 3000,
      date: new Date(Date.UTC(prevYear, prevMonth - 1, 15)),
    });
    await prisma.income.create({
      data: { name: 'Salary', amount: 100000, dayOfMonth: 1, userId: user.id },
    });

    const ctx = await buildChatbotContext(user.id, year, month);

    expect(ctx.currentMonth).toMatchObject({
      period: current,
      expenses: 5000,
      income: 100000, // processRecurringIncome posted it (dayOfMonth 1 has passed)
      net: 95000,
    });
    expect(ctx.currentMonth.topCategories[0]).toMatchObject({ name: 'food', amount: 5000 });

    expect(ctx.trailingMonths).toHaveLength(6);
    const prev = ctx.trailingMonths.find(
      (m) => m.period === `${prevYear}-${String(prevMonth).padStart(2, '0')}`,
    );
    expect(prev).toMatchObject({ expenses: 3000, income: 0 }); // only the requested month gets postings

    expect(ctx.activeIncomes).toEqual([{ name: 'Salary', amount: 100000, dayOfMonth: 1 }]);
    expect(ctx.allTime.totalSavings).toBe(92000); // 100000 - 8000

    expect(ctx.projection).not.toBeNull();
    expect(ctx.projection!.daysElapsed).toBeGreaterThanOrEqual(1);
  });
});

describe('computeProjection', () => {
  const base = {
    year: 2025,
    month: 6,
    monthExpenses: 7500,
    monthIncomePosted: 0,
    activeIncomes: [{ amount: 100000, dayOfMonth: 25 }],
  };

  it('extrapolates run-rate and remaining income', () => {
    const p = computeProjection({ ...base, now: new Date('2025-06-18T12:00:00Z') })!;
    expect(p).toMatchObject({
      daysElapsed: 18,
      daysInMonth: 30,
      projectedMonthExpenses: 12500, // 7500/18*30
      remainingIncome: 100000, // salary posts on the 25th
      projectedNet: 87500,
      confidence: 'high',
    });
  });

  it('grades confidence by elapsed days', () => {
    expect(computeProjection({ ...base, now: new Date('2025-06-03T00:00:00Z') })!.confidence).toBe(
      'low',
    );
    expect(computeProjection({ ...base, now: new Date('2025-06-10T00:00:00Z') })!.confidence).toBe(
      'medium',
    );
    expect(computeProjection({ ...base, now: new Date('2025-06-18T00:00:00Z') })!.confidence).toBe(
      'high',
    );
  });

  it('early-month run-rate extrapolates aggressively (why confidence matters)', () => {
    const p = computeProjection({ ...base, now: new Date('2025-06-03T00:00:00Z') })!;
    expect(p.projectedMonthExpenses).toBe(75000); // 7500/3*30
  });

  it('does not count already-passed posting days as remaining income', () => {
    const p = computeProjection({
      ...base,
      activeIncomes: [{ amount: 100000, dayOfMonth: 5 }],
      now: new Date('2025-06-18T12:00:00Z'),
    })!;
    expect(p.remainingIncome).toBe(0);
  });

  it('returns null for non-current months', () => {
    expect(
      computeProjection({ ...base, year: 2025, month: 5, now: new Date('2025-06-18T12:00:00Z') }),
    ).toBeNull();
  });
});

describe('chatbot tools', () => {
  it('getMonthBreakdown returns totals and per-category splits', async () => {
    const { user } = await createUserWithSession();
    const food = await seedCategory(user.id, 'food');
    const travel = await seedCategory(user.id, 'travel');
    await seedExpense(user.id, {
      amount: 5000,
      categoryId: food.id,
      date: new Date(Date.UTC(2025, 4, 10)),
    });
    await seedExpense(user.id, {
      amount: 2500,
      categoryId: travel.id,
      date: new Date(Date.UTC(2025, 4, 20)),
    });
    await prisma.income.create({
      data: {
        amount: 100000,
        dayOfMonth: 1,
        userId: user.id,
        createdAt: new Date(Date.UTC(2025, 3, 1)), // backdate: template existed before May 2025
      },
    });

    const result = await getMonthBreakdown(user.id, { year: 2025, month: 5 });
    expect(result).toMatchObject({
      period: '2025-05',
      totalIncome: 100000, // posted by the tool's processRecurringIncome call
      totalExpenses: 7500,
      net: 92500,
      expenseCount: 2,
    });
    expect(result.byCategory[0]).toMatchObject({ name: 'food', amount: 5000 });
    expect(result.byCategory[0].percentage).toBeCloseTo(66.7, 1);
  });

  it('listExpenses filters by category name case-insensitively and caps the limit', async () => {
    const { user } = await createUserWithSession();
    const food = await seedCategory(user.id, 'food');
    await seedExpense(user.id, {
      name: 'A',
      amount: 100,
      categoryId: food.id,
      date: new Date(Date.UTC(2025, 4, 1)),
    });
    await seedExpense(user.id, {
      name: 'B',
      amount: 200,
      categoryId: food.id,
      date: new Date(Date.UTC(2025, 4, 2)),
    });
    await seedExpense(user.id, { name: 'C', amount: 300, date: new Date(Date.UTC(2025, 4, 3)) });

    const result = await listExpenses(user.id, { month: '2025-05', category: 'FOOD', limit: 2 });
    expect(result.count).toBe(2);
    expect(result.expenses.every((e) => e.category === 'food')).toBe(true);
    expect(result.expenses.map((e) => e.name)).toEqual(['B', 'A']); // newest first

    const missing = await listExpenses(user.id, { month: '2025-05', category: 'nope' });
    expect(missing.expenses).toHaveLength(0);
    expect(missing.note).toBeDefined();
  });
});
