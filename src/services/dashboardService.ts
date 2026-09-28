import { prisma } from '@/lib/prisma';

// Main service function to assemble dashboard data
export async function getDashboardData(userId: string, year: number, month: number) {
  const periodString = `${year}-${String(month).padStart(2, '0')}`;

  // Define date boundaries for the target month
  const startDate = new Date(year, month - 1, 1);
  const endDate = new Date(year, month, 1);

  // Execute summary queries in parallel
  const [
    totalIncomeSum,
    totalExpenseSum,
    monthIncomeSum,
    monthExpenses,
    recentExpenses,
    recentIncomes,
  ] = await Promise.all([
    // All-time income sum for total savings calculation
    prisma.incomeEntry.aggregate({
      _sum: { amount: true },
      where: { userId },
    }),
    // All-time expense sum for total savings calculation
    prisma.expense.aggregate({
      _sum: { amount: true },
      where: { userId },
    }),
    // Current month income sum
    prisma.incomeEntry.aggregate({
      _sum: { amount: true },
      where: { userId, date: { gte: startDate, lt: endDate } },
    }),
    // Current month expenses with category data for donut chart
    prisma.expense.findMany({
      where: { userId, date: { gte: startDate, lt: endDate } },
      include: { category: true },
    }),
    // Last 5 expenses
    prisma.expense.findMany({
      where: { userId },
      include: { category: true },
      orderBy: { date: 'desc' },
      take: 5,
    }),
    // Last 5 income entries
    prisma.incomeEntry.findMany({
      where: { userId },
      orderBy: { date: 'desc' },
      take: 5,
    }),
  ]);

  // Calculate summary metrics
  const monthIncome = monthIncomeSum._sum.amount || 0;
  const monthExpensesTotal = monthExpenses.reduce((sum, exp) => sum + exp.amount, 0);
  const totalSavings = (totalIncomeSum._sum.amount || 0) - (totalExpenseSum._sum.amount || 0);
  const netThisMonth = monthIncome - monthExpensesTotal;

  // Group expenses by category for the donut chart
  const categoryMap = new Map<string, { amount: number; count: number; name: string }>();

  for (const exp of monthExpenses) {
    const categoryId = exp.categoryId || 'uncategorized';
    const categoryName = exp.category?.name || 'Uncategorized';

    if (!categoryMap.has(categoryId)) {
      categoryMap.set(categoryId, { amount: 0, count: 0, name: categoryName });
    }

    const catData = categoryMap.get(categoryId)!;
    catData.amount += exp.amount;
    catData.count += 1;
  }

  // Format category breakdown
  const spendingByCategory = Array.from(categoryMap.entries())
    .map(([categoryId, data]) => ({
      categoryId,
      name: data.name,
      amount: data.amount,
      percentage: monthExpensesTotal > 0 ? (data.amount / monthExpensesTotal) * 100 : 0,
      transactionCount: data.count,
    }))
    .sort((a, b) => b.amount - a.amount);

  // Merge and format recent activity
  const recentActivity = [
    ...recentExpenses.map((exp) => ({
      id: exp.id,
      type: 'expense' as const,
      name: exp.name,
      amount: exp.amount,
      categoryName: exp.category?.name || 'Uncategorized',
      date: exp.date,
    })),
    ...recentIncomes.map((inc) => ({
      id: inc.id,
      type: 'income' as const,
      name: 'Income Entry',
      amount: inc.amount,
      categoryName: null,
      date: inc.date,
    })),
  ]
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
    .slice(0, 5);

  return {
    period: periodString,
    summary: {
      totalSavings,
      monthIncome,
      monthExpenses: monthExpensesTotal,
      netThisMonth,
    },
    spendingByCategory,
    recentActivity,
  };
}
