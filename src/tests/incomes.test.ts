import { describe, it, expect } from 'vitest';
import { prisma } from '@/lib/prisma';
import { req, createTestUser, createUserWithSession, authenticate } from './helpers';
import { GET as listIncomes, POST as createIncome } from '@/app/api/incomes/route';
import {
  GET as getIncome,
  PATCH as updateIncome,
  DELETE as deleteIncome,
} from '@/app/api/incomes/[id]/route';

const idParams = (id: string) => ({ params: Promise.resolve({ id }) });

describe('incomes API', () => {
  it('creates and lists recurring income templates', async () => {
    const { user, token } = await createUserWithSession();
    authenticate(token);

    const res = await createIncome(
      req('POST', '/api/incomes', { name: 'Salary', amount: 500000, dayOfMonth: 1 }),
    );
    expect(res.status).toBe(201);
    expect(await res.json()).toMatchObject({
      name: 'Salary',
      amount: 500000,
      dayOfMonth: 1,
      active: true,
      userId: user.id,
    });

    const list = await listIncomes(req('GET', '/api/incomes'));
    expect((await list.json()).data).toHaveLength(1);
  });

  it('validates amount and dayOfMonth', async () => {
    const { token } = await createUserWithSession();
    authenticate(token);
    expect(
      (await createIncome(req('POST', '/api/incomes', { amount: 100, dayOfMonth: 32 }))).status,
    ).toBe(400);
    expect(
      (await createIncome(req('POST', '/api/incomes', { amount: 10.5, dayOfMonth: 15 }))).status,
    ).toBe(400);
    expect((await createIncome(req('POST', '/api/incomes', { dayOfMonth: 15 }))).status).toBe(400);
  });

  it('updates a template without rewriting historical entries', async () => {
    const { user, token } = await createUserWithSession();
    authenticate(token);
    const income = await prisma.income.create({
      data: { name: 'Salary', amount: 100000, dayOfMonth: 1, userId: user.id },
    });
    await prisma.incomeEntry.create({
      data: {
        amount: 100000,
        date: new Date(2025, 4, 1),
        period: '2025-05',
        incomeId: income.id,
        userId: user.id,
      },
    });

    const res = await updateIncome(
      req('PATCH', `/api/incomes/${income.id}`, { amount: 120000, active: false }),
      idParams(income.id),
    );
    expect(res.status).toBe(200);
    expect(
      await prisma.income.count({ where: { id: income.id, amount: 120000, active: false } }),
    ).toBe(1);

    const entry = await prisma.incomeEntry.findUnique({
      where: { incomeId_period: { incomeId: income.id, period: '2025-05' } },
    });
    expect(entry?.amount).toBe(100000); // history untouched
  });

  it('deleting a template also removes its entries (documented cascade)', async () => {
    const { user, token } = await createUserWithSession();
    authenticate(token);
    const income = await prisma.income.create({
      data: { amount: 50000, dayOfMonth: 1, userId: user.id },
    });
    await prisma.incomeEntry.create({
      data: {
        amount: 50000,
        date: new Date(2025, 4, 1),
        period: '2025-05',
        incomeId: income.id,
        userId: user.id,
      },
    });

    const res = await deleteIncome(req('DELETE', `/api/incomes/${income.id}`), idParams(income.id));
    expect(res.status).toBe(204);
    expect(await prisma.incomeEntry.count({ where: { incomeId: income.id } })).toBe(0);
  });

  it('materializes due recurring income on template create', async () => {
    const { user, token } = await createUserWithSession();
    authenticate(token);
    await prisma.income.create({ data: { amount: 50000, dayOfMonth: 1, userId: user.id } });
    // POST /api/incomes with a second template triggers materialization for both
    const res = await createIncome(req('POST', '/api/incomes', { amount: 100, dayOfMonth: 15 }));
    expect(res.status).toBe(201);
    expect(await prisma.incomeEntry.count({ where: { userId: user.id } })).toBe(1); // the day-1 template, now due
  });

  it('returns 404 for other users templates', async () => {
    const { token } = await createUserWithSession();
    authenticate(token);
    const victim = await createTestUser();
    const victimIncome = await prisma.income.create({
      data: { amount: 50000, dayOfMonth: 1, userId: victim.user.id },
    });

    expect(
      (await getIncome(req('GET', `/api/incomes/${victimIncome.id}`), idParams(victimIncome.id)))
        .status,
    ).toBe(404);
    expect(
      (
        await updateIncome(
          req('PATCH', `/api/incomes/${victimIncome.id}`, { active: false }),
          idParams(victimIncome.id),
        )
      ).status,
    ).toBe(404);
    expect(await prisma.income.count({ where: { id: victimIncome.id } })).toBe(1);
  });
});
