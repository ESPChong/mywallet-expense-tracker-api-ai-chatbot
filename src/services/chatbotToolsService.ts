import { prisma } from '@/lib/prisma';
import { z } from 'zod';
import { processRecurringIncome } from './incomeService';

// ── Tool input schemas (single source of truth — LangChain will reuse these) ──

export const getMonthBreakdownParams = z.object({
  year: z.number().int().min(2000).max(2100),
  month: z.number().int().min(1).max(12),
});

export const listExpensesParams = z.object({
  month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'Expected YYYY-MM'),
  category: z.string().trim().min(1).max(100).optional(),
  limit: z.number().int().min(1).max(50).default(10),
});

// ── Tool implementations: scoped to userId, return plain JSON ──

export async function getMonthBreakdown(userId: string, input: unknown) {
  const { year, month } = getMonthBreakdownParams.parse(input);

  // Same idempotent side effect as /api/dashboard, so current-month breakdowns
  // reflect all due income postings.
  await processRecurringIncome(userId, year, month);

  const start = new Date(Date.UTC(year, month - 1, 1));
  const end = new Date(Date.UTC(year, month, 1));

  const [expenses, incomeAgg] = await Promise.all([
    prisma.expense.findMany({
      where: { userId, date: { gte: start, lt: end } },
      include: { category: { select: { name: true } } },
    }),
    prisma.incomeEntry.aggregate({
      _sum: { amount: true },
      where: { userId, date: { gte: start, lt: end } },
    }),
  ]);

  const totalExpenses = expenses.reduce((sum, e) => sum + e.amount, 0);
  const catMap = new Map<string, { name: string; amount: number; transactionCount: number }>();
  for (const exp of expenses) {
    const name = exp.category?.name ?? 'Uncategorized';
    const entry = catMap.get(name) ?? { name, amount: 0, transactionCount: 0 };
    entry.amount += exp.amount;
    entry.transactionCount += 1;
    catMap.set(name, entry);
  }

  const totalIncome = incomeAgg._sum.amount ?? 0;

  return {
    period: `${year}-${String(month).padStart(2, '0')}`,
    amountUnit: 'cents',
    totalIncome,
    totalExpenses,
    net: totalIncome - totalExpenses,
    expenseCount: expenses.length,
    byCategory: [...catMap.values()]
      .map((c) => ({
        ...c,
        percentage: totalExpenses > 0 ? Math.round((c.amount / totalExpenses) * 1000) / 10 : 0,
      }))
      .sort((a, b) => b.amount - a.amount),
  };
}

export async function listExpenses(userId: string, input: unknown) {
  const { month, category, limit } = listExpensesParams.parse(input);
  const [year, mon] = month.split('-').map(Number);
  const start = new Date(Date.UTC(year, mon - 1, 1));
  const end = new Date(Date.UTC(year, mon, 1));

  const where: { userId: string; date: { gte: Date; lt: Date }; categoryId?: string } = {
    userId,
    date: { gte: start, lt: end },
  };

  if (category) {
    // Resolve by name, case-insensitively. Category lists are tiny, so fetch
    // and match in JS — avoids Mongo regex edge cases entirely.
    const userCategories = await prisma.category.findMany({
      where: { userId },
      select: { id: true, name: true },
    });
    const match = userCategories.find((c) => c.name.toLowerCase() === category.toLowerCase());

    if (!match) {
      return {
        month,
        amountUnit: 'cents',
        categoryQueried: category,
        count: 0,
        expenses: [],
        note: 'No category with that name exists for this user.',
      };
    }
    where.categoryId = match.id;
  }

  const expenses = await prisma.expense.findMany({
    where,
    orderBy: [{ date: 'desc' }, { amount: 'desc' }],
    take: limit,
    include: { category: { select: { name: true } } },
  });

  return {
    month,
    amountUnit: 'cents',
    categoryQueried: category ?? null,
    count: expenses.length,
    expenses: expenses.map((e) => ({
      date: e.date.toISOString(),
      name: e.name,
      amount: e.amount,
      category: e.category?.name ?? 'Uncategorized',
    })),
  };
}

// ── Manifest: what the model is told about the tools (names + descriptions) ──
// Param schemas above remain the enforcement layer — the model never gets to
// bypass zod by writing its own query.
export const chatbotToolManifest = [
  {
    name: 'get_month_breakdown',
    description:
      'Full breakdown of income and expenses for any month (past or present): totals, net, and per-category amounts with percentages.',
    params: {
      year: 'number — required',
      month: 'number 1-12 — required',
    },
  },
  {
    name: 'list_expenses',
    description:
      'Individual expense transactions for a month, newest first. Optionally filtered by category name.',
    params: {
      month: 'YYYY-MM string — required',
      category: 'category name — optional',
      limit: '1-50, default 10',
    },
  },
] as const;
