import { describe, it, expect } from 'vitest';
import { prisma } from '@/lib/prisma';
import {
  req,
  createTestUser,
  createUserWithSession,
  authenticate,
  clearAuth,
  seedCategory,
  seedExpense,
} from './helpers';
import { GET as listExpenses, POST as createExpense } from '@/app/api/expenses/route';
import {
  GET as getExpense,
  PATCH as updateExpense,
  DELETE as deleteExpense,
} from '@/app/api/expenses/[id]/route';

const idParams = (id: string) => ({ params: Promise.resolve({ id }) });

describe('expenses API', () => {
  it('rejects unauthenticated requests', async () => {
    clearAuth();
    expect((await listExpenses(req('GET', '/api/expenses'))).status).toBe(401);
    expect(
      (
        await createExpense(
          req('POST', '/api/expenses', { name: 'x', amount: 100, date: '2025-06-01' }),
        )
      ).status,
    ).toBe(401);
  });

  it('creates an expense with a category', async () => {
    const { user, token } = await createUserWithSession();
    authenticate(token);
    const cat = await seedCategory(user.id, 'food');

    const res = await createExpense(
      req('POST', '/api/expenses', {
        name: 'Groceries',
        amount: 4999,
        date: '2025-06-10',
        categoryId: cat.id,
      }),
    );
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.amount).toBe(4999);
    expect(body.category.name).toBe('food');
    expect(body.userId).toBe(user.id);
  });

  it('rejects invalid payloads', async () => {
    const { token } = await createUserWithSession();
    authenticate(token);
    const badBodies = [
      { name: '', amount: 100, date: '2025-06-01' },
      { name: 'x', amount: 10.5, date: '2025-06-01' },
      { name: 'x', amount: -1, date: '2025-06-01' },
      { name: 'x', amount: 100, date: 'not-a-date' },
      { name: 'x', amount: 100 },
    ];
    for (const bad of badBodies) {
      expect((await createExpense(req('POST', '/api/expenses', bad))).status).toBe(400);
    }
  });

  it('rejects a categoryId owned by another user (IDOR regression test)', async () => {
    const attacker = await createUserWithSession();
    const victim = await createTestUser();
    const victimCategory = await seedCategory(victim.user.id, 'secret');

    authenticate(attacker.token);
    const res = await createExpense(
      req('POST', '/api/expenses', {
        name: 'x',
        amount: 100,
        date: '2025-06-01',
        categoryId: victimCategory.id,
      }),
    );
    expect(res.status).toBe(400);
    expect(await prisma.expense.count({ where: { userId: attacker.user.id } })).toBe(0);
  });

  it('lists expenses with a month filter and pagination', async () => {
    const { user, token } = await createUserWithSession();
    authenticate(token);
    const cat = await seedCategory(user.id);
    await seedExpense(user.id, { amount: 100, date: new Date(2025, 5, 15), categoryId: cat.id });
    await seedExpense(user.id, { amount: 200, date: new Date(2025, 5, 20) });
    await seedExpense(user.id, { amount: 300, date: new Date(2025, 4, 15) }); // May

    const res = await listExpenses(req('GET', '/api/expenses?month=2025-06'));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.data).toHaveLength(2);
    expect(body.pagination.total).toBe(2);

    const paged = await listExpenses(req('GET', '/api/expenses?page=1&pageSize=1'));
    const pagedBody = await paged.json();
    expect(pagedBody.data).toHaveLength(1);
    expect(pagedBody.pagination).toMatchObject({ page: 1, pageSize: 1, total: 3 });
  });

  it('GET / PATCH / DELETE a single expense, including clearing the category', async () => {
    const { user, token } = await createUserWithSession();
    authenticate(token);
    const food = await seedCategory(user.id, 'food');
    const travel = await seedCategory(user.id, 'travel');
    const expense = await seedExpense(user.id, {
      amount: 1000,
      categoryId: food.id,
      date: new Date(2025, 5, 10),
    });

    const got = await getExpense(req('GET', `/api/expenses/${expense.id}`), idParams(expense.id));
    expect(got.status).toBe(200);
    expect((await got.json()).category.name).toBe('food');

    const patched = await updateExpense(
      req('PATCH', `/api/expenses/${expense.id}`, { amount: 2500, categoryId: travel.id }),
      idParams(expense.id),
    );
    expect(patched.status).toBe(200);
    const pb = await patched.json();
    expect(pb.amount).toBe(2500);
    expect(pb.category.name).toBe('travel');

    const cleared = await updateExpense(
      req('PATCH', `/api/expenses/${expense.id}`, { categoryId: null }),
      idParams(expense.id),
    );
    expect((await cleared.json()).categoryId).toBeNull();

    expect(
      (await deleteExpense(req('DELETE', `/api/expenses/${expense.id}`), idParams(expense.id)))
        .status,
    ).toBe(204);
    expect(await prisma.expense.findUnique({ where: { id: expense.id } })).toBeNull();
  });

  it('returns 404 for other users expenses (no existence leak) and 400 for malformed ids', async () => {
    const { token } = await createUserWithSession();
    authenticate(token);
    const victim = await createTestUser();
    const victimExpense = await seedExpense(victim.user.id);

    expect(
      (
        await getExpense(
          req('GET', `/api/expenses/${victimExpense.id}`),
          idParams(victimExpense.id),
        )
      ).status,
    ).toBe(404);
    expect(
      (
        await deleteExpense(
          req('DELETE', `/api/expenses/${victimExpense.id}`),
          idParams(victimExpense.id),
        )
      ).status,
    ).toBe(404);
    expect(await prisma.expense.count({ where: { id: victimExpense.id } })).toBe(1); // untouched

    expect(
      (await getExpense(req('GET', '/api/expenses/not-an-objectid'), idParams('not-an-objectid')))
        .status,
    ).toBe(400);
  });

  it('materializes due recurring income on create (mutation side effect)', async () => {
    const { user, token } = await createUserWithSession();
    authenticate(token);
    await prisma.income.create({ data: { amount: 50000, dayOfMonth: 1, userId: user.id } });

    const res = await createExpense(
      req('POST', '/api/expenses', { name: 'trigger', amount: 100, date: '2025-06-01' }),
    );
    expect(res.status).toBe(201);
    expect(await prisma.incomeEntry.count({ where: { userId: user.id } })).toBe(1);
  });
});
