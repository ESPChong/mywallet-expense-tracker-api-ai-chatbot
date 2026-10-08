import { describe, it, expect } from 'vitest';
import { prisma } from '@/lib/prisma';
import { processRecurringIncome } from '@/services/incomeService';
import {
  req,
  createUserWithSession,
  authenticate,
  clearAuth,
  seedCategory,
  seedExpense,
} from './helpers';
import { GET as getDashboard } from '@/app/api/dashboard/route';

function currentPeriod() {
  const now = new Date();
  const year = now.getUTCFullYear();
  const month = now.getUTCMonth() + 1;
  const prevMonth = month === 1 ? 12 : month - 1;
  const prevYear = month === 1 ? year - 1 : year;
  return { year, month, prevYear, prevMonth, current: `${year}-${String(month).padStart(2, '0')}` };
}

describe('GET /api/dashboard', () => {
  it('aggregates summary, category breakdown and recent activity', async () => {
    const { user, token } = await createUserWithSession();
    authenticate(token);
    const { year, month, prevYear, prevMonth, current } = currentPeriod();

    const food = await seedCategory(user.id, 'food');
    const travel = await seedCategory(user.id, 'travel');
    await seedExpense(user.id, {
      name: 'A',
      amount: 5000,
      date: new Date(year, month - 1, 10),
      categoryId: food.id,
    });
    await seedExpense(user.id, {
      name: 'B',
      amount: 2500,
      date: new Date(year, month - 1, 12),
      categoryId: travel.id,
    });
    await seedExpense(user.id, {
      name: 'C',
      amount: 10000,
      date: new Date(prevYear, prevMonth - 1, 10),
    });
    await prisma.income.create({
      data: { name: 'Salary', amount: 100000, dayOfMonth: 1, userId: user.id },
    });

    // Materialization is no longer the GET's job — trigger it explicitly
    await processRecurringIncome(user.id, year, month);

    const res = await getDashboard(req('GET', `/api/dashboard?month=${current}`));
    expect(res.status).toBe(200);
    const body = await res.json();

    expect(body.summary).toEqual({
      totalSavings: 82500,
      monthIncome: 100000,
      monthExpenses: 7500,
      netThisMonth: 92500,
    });

    expect(body.spendingByCategory[0]).toMatchObject({ name: 'food', amount: 5000 });
    expect(body.spendingByCategory[0].percentage).toBeCloseTo(66.67, 1);

    expect(body.recentActivity).toHaveLength(4);
    for (let i = 1; i < body.recentActivity.length; i++) {
      expect(new Date(body.recentActivity[i - 1].date).getTime()).toBeGreaterThanOrEqual(
        new Date(body.recentActivity[i].date).getTime(),
      );
    }
  });

  it('is idempotent — recurring income is posted exactly once per period', async () => {
    const { user, token } = await createUserWithSession();
    authenticate(token);
    await prisma.income.create({ data: { amount: 50000, dayOfMonth: 1, userId: user.id } });
    const { year, month, current } = currentPeriod();

    // Idempotency now lives in the service — call it twice directly
    await processRecurringIncome(user.id, year, month);
    await processRecurringIncome(user.id, year, month);

    expect(await prisma.incomeEntry.count({ where: { userId: user.id, period: current } })).toBe(1);
  });

  it('GET does not materialize income postings (pure read)', async () => {
    const { user, token } = await createUserWithSession();
    authenticate(token);
    await prisma.income.create({ data: { amount: 50000, dayOfMonth: 1, userId: user.id } });
    const { current } = currentPeriod();

    const res = await getDashboard(req('GET', `/api/dashboard?month=${current}`));
    expect(res.status).toBe(200);
    expect(await prisma.incomeEntry.count({ where: { userId: user.id } })).toBe(0);
  });

  it('rejects unauthorized requests and invalid months', async () => {
    clearAuth();
    expect((await getDashboard(req('GET', '/api/dashboard'))).status).toBe(401);

    const { token } = await createUserWithSession();
    authenticate(token);
    expect((await getDashboard(req('GET', '/api/dashboard?month=2025-13'))).status).toBe(400);
    expect((await getDashboard(req('GET', '/api/dashboard?month=banana'))).status).toBe(400);
  });
});

describe('processRecurringIncome guards (retroactive-posting regression)', () => {
  it('never posts for months before the template existed', async () => {
    const { user } = await createUserWithSession();
    await prisma.income.create({
      data: { amount: 100000, dayOfMonth: 1, userId: user.id }, // createdAt = now
    });

    // Direct service call — no HTTP, no auth needed
    await processRecurringIncome(user.id, 2020, 1);

    expect(await prisma.incomeEntry.count({ where: { userId: user.id } })).toBe(0);
  });

  it('back-fills every period from creation through the requested month', async () => {
    const { user } = await createUserWithSession();
    const now = new Date();
    await prisma.income.create({
      data: {
        amount: 50000,
        dayOfMonth: 1,
        userId: user.id,
        createdAt: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 3, 1)),
      },
    });

    const target = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
    await processRecurringIncome(user.id, target.getUTCFullYear(), target.getUTCMonth() + 1);

    // creation month, the following month, and the requested month
    expect(await prisma.incomeEntry.count({ where: { userId: user.id } })).toBe(3);
  });
});
