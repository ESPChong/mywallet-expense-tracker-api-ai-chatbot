import { prisma } from '@/lib/prisma';
import { processRecurringIncome } from './incomeService';
import { CURRENCY } from '@/lib/format';

export interface CategorySummary {
  name: string;
  amount: number;
  percentage: number;
  transactionCount: number;
}

export interface MonthSummary {
  period: string; // YYYY-MM
  income: number;
  expenses: number;
  net: number;
}

export interface ProjectionInfo {
  daysElapsed: number;
  daysInMonth: number;
  projectedMonthExpenses: number;
  remainingIncome: number;
  projectedNet: number;
  confidence: 'low' | 'medium' | 'high';
}

export interface ChatbotContext {
  asOf: string;
  currency: string;
  amountUnit: 'cents';
  currentMonth: {
    period: string;
    income: number;
    expenses: number;
    net: number;
    expenseCount: number;
    topCategories: CategorySummary[];
  };
  trailingMonths: MonthSummary[];
  activeIncomes: { name: string | null; amount: number; dayOfMonth: number }[];
  allTime: { totalSavings: number };
  projection: ProjectionInfo | null;
}

function periodOf(date: Date): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
}

// Pure function on purpose: projection math must be exactly right, so it gets
// direct unit tests with a fixed clock. Returns null for non-current months.
export function computeProjection(params: {
  now: Date;
  year: number;
  month: number;
  monthExpenses: number;
  monthIncomePosted: number;
  activeIncomes: { amount: number; dayOfMonth: number }[];
}): ProjectionInfo | null {
  const { now, year, month, monthExpenses, monthIncomePosted, activeIncomes } = params;

  const isCurrentMonth = now.getUTCFullYear() === year && now.getUTCMonth() + 1 === month;
  if (!isCurrentMonth) return null;

  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const daysElapsed = Math.min(now.getUTCDate(), daysInMonth);

  const remainingIncome = activeIncomes.reduce((sum, inc) => {
    const postingDay = Math.min(inc.dayOfMonth, daysInMonth);
    return postingDay > daysElapsed ? sum + inc.amount : sum;
  }, 0);

  const projectedMonthExpenses = Math.round((monthExpenses / daysElapsed) * daysInMonth);
  const projectedNet = monthIncomePosted + remainingIncome - projectedMonthExpenses;
  const confidence = daysElapsed < 7 ? 'low' : daysElapsed < 14 ? 'medium' : 'high';

  return {
    daysElapsed,
    daysInMonth,
    projectedMonthExpenses,
    remainingIncome,
    projectedNet,
    confidence,
  };
}

export async function buildChatbotContext(
  userId: string,
  year: number,
  month: number,
): Promise<ChatbotContext> {
  // Same idempotent side effect as the chatbot route: post any due recurring
  // income first, so the snapshot is fresh.
  await processRecurringIncome(userId, year, month);

  const monthStart = new Date(Date.UTC(year, month - 1, 1));
  const monthEnd = new Date(Date.UTC(year, month, 1));
  const trailStart = new Date(Date.UTC(year, month - 7, 1)); // 6 months before target

  const [
    monthExpenses,
    monthIncomeAgg,
    trailingExpenses,
    trailingIncomeEntries,
    activeIncomes,
    allTimeIncomeAgg,
    allTimeExpenseAgg,
  ] = await Promise.all([
    prisma.expense.findMany({
      where: { userId, date: { gte: monthStart, lt: monthEnd } },
      include: { category: { select: { name: true } } },
    }),
    prisma.incomeEntry.aggregate({
      _sum: { amount: true },
      where: { userId, date: { gte: monthStart, lt: monthEnd } },
    }),
    prisma.expense.findMany({
      where: { userId, date: { gte: trailStart, lt: monthStart } },
      select: { amount: true, date: true },
    }),
    prisma.incomeEntry.findMany({
      where: { userId, date: { gte: trailStart, lt: monthStart } },
      select: { amount: true, date: true },
    }),
    prisma.income.findMany({
      where: { userId, active: true },
      select: { name: true, amount: true, dayOfMonth: true },
    }),
    prisma.incomeEntry.aggregate({ _sum: { amount: true }, where: { userId } }),
    prisma.expense.aggregate({ _sum: { amount: true }, where: { userId } }),
  ]);

  const monthIncome = monthIncomeAgg._sum.amount ?? 0;
  const monthExpensesTotal = monthExpenses.reduce((sum, e) => sum + e.amount, 0);

  // Current-month category breakdown (top 5)
  const catMap = new Map<string, CategorySummary>();
  for (const exp of monthExpenses) {
    const name = exp.category?.name ?? 'Uncategorized';
    const entry = catMap.get(name) ?? { name, amount: 0, percentage: 0, transactionCount: 0 };
    entry.amount += exp.amount;
    entry.transactionCount += 1;
    catMap.set(name, entry);
  }
  const topCategories = [...catMap.values()]
    .map((c) => ({
      ...c,
      percentage:
        monthExpensesTotal > 0 ? Math.round((c.amount / monthExpensesTotal) * 1000) / 10 : 0,
    }))
    .sort((a, b) => b.amount - a.amount)
    .slice(0, 5);

  // Trailing months: fixed 6 slots, zero-data months included explicitly so
  // the model can tell "no spending" apart from "no data".
  const trailMap = new Map<string, MonthSummary>();
  for (let i = 6; i >= 1; i--) {
    const p = periodOf(new Date(Date.UTC(year, month - 1 - i, 1)));
    trailMap.set(p, { period: p, income: 0, expenses: 0, net: 0 });
  }
  for (const exp of trailingExpenses) {
    const m = trailMap.get(periodOf(exp.date));
    if (m) m.expenses += exp.amount;
  }
  for (const inc of trailingIncomeEntries) {
    const m = trailMap.get(periodOf(inc.date));
    if (m) m.income += inc.amount;
  }
  for (const m of trailMap.values()) m.net = m.income - m.expenses;

  const projection = computeProjection({
    now: new Date(),
    year,
    month,
    monthExpenses: monthExpensesTotal,
    monthIncomePosted: monthIncome,
    activeIncomes,
  });

  return {
    asOf: new Date().toISOString(),
    currency: CURRENCY, // TODO: user-configurable currency
    amountUnit: 'cents',
    currentMonth: {
      period: `${year}-${String(month).padStart(2, '0')}`,
      income: monthIncome,
      expenses: monthExpensesTotal,
      net: monthIncome - monthExpensesTotal,
      expenseCount: monthExpenses.length,
      topCategories,
    },
    trailingMonths: [...trailMap.values()], // oldest → newest
    activeIncomes: activeIncomes.map((i) => ({
      name: i.name,
      amount: i.amount,
      dayOfMonth: i.dayOfMonth,
    })),
    allTime: {
      totalSavings: (allTimeIncomeAgg._sum.amount ?? 0) - (allTimeExpenseAgg._sum.amount ?? 0),
    },
    projection,
  };
}

// ── Model-facing display conversion ─────────────────────────────────────────
// The model NEVER sees raw cents — small LLMs are unreliable at unit
// conversion and inline arithmetic. Every amount the model can quote is
// pre-converted here, once, at the LLM boundary. Cents remain the unit of
// record in the DB, the API, and everywhere else in the app.

const dollars = (cents: number) => (cents / 100).toFixed(2);

/** Dollar-denominated view of the context, for the system prompt only. */
export function toDisplayContext(ctx: ChatbotContext) {
  return {
    asOf: ctx.asOf,
    currency: ctx.currency,
    amountUnit: 'dollars' as const,
    currentMonth: {
      period: ctx.currentMonth.period,
      income: dollars(ctx.currentMonth.income),
      expenses: dollars(ctx.currentMonth.expenses),
      net: dollars(ctx.currentMonth.net),
      expenseCount: ctx.currentMonth.expenseCount,
      topCategories: ctx.currentMonth.topCategories.map((c) => ({
        name: c.name,
        amount: dollars(c.amount),
        percentage: c.percentage,
        transactionCount: c.transactionCount,
      })),
    },
    trailingMonths: ctx.trailingMonths.map((m) => ({
      period: m.period,
      income: dollars(m.income),
      expenses: dollars(m.expenses),
      net: dollars(m.net),
    })),
    activeIncomes: ctx.activeIncomes.map((i) => ({
      name: i.name,
      amount: dollars(i.amount),
      dayOfMonth: i.dayOfMonth,
    })),
    allTime: { totalSavings: dollars(ctx.allTime.totalSavings) },
    projection: ctx.projection && {
      daysElapsed: ctx.projection.daysElapsed,
      daysInMonth: ctx.projection.daysInMonth,
      projectedMonthExpenses: dollars(ctx.projection.projectedMonthExpenses),
      remainingIncome: dollars(ctx.projection.remainingIncome),
      projectedNet: dollars(ctx.projection.projectedNet),
      confidence: ctx.projection.confidence,
    },
  };
}
