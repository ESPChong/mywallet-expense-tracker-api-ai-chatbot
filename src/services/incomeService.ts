import { prisma } from '@/lib/prisma';

// ── Period helpers ("YYYY-MM"; zero-padding makes plain string comparison correct) ──

function periodString(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, '0')}`;
}

function periodOf(date: Date): string {
  return periodString(date.getUTCFullYear(), date.getUTCMonth() + 1);
}

function addPeriods(period: string, delta: number): string {
  const [year, month] = period.split('-').map(Number);
  const d = new Date(Date.UTC(year, month - 1 + delta, 1));
  return periodString(d.getUTCFullYear(), d.getUTCMonth() + 1);
}

function lastDayOf(period: string): number {
  const [year, month] = period.split('-').map(Number);
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/**
 * Materializes due recurring-income entries for each template, from its
 * creation period through the requested month.
 *
 * Guarantees:
 * 1. Never posts for a period before the template existed (createdAt) —
 *    viewing an old dashboard must not invent income history.
 * 2. Back-fills every missing period from creation through the requested
 *    month — all-time totals don't depend on which months were browsed.
 * 3. Idempotent: the (incomeId, period) unique constraint plus the
 *    existence pre-check prevent duplicates.
 */
export async function processRecurringIncome(userId: string, year: number, month: number) {
  const requestedPeriod = periodString(year, month);

  const now = new Date();
  const currentPeriod = periodOf(now);
  const currentDay = now.getUTCDate();

  const activeIncomes = await prisma.income.findMany({
    where: { userId, active: true },
  });

  for (const income of activeIncomes) {
    const creationPeriod = periodOf(income.createdAt);
    if (requestedPeriod < creationPeriod) continue; // ← the missing guard

    // Which periods in [creation, requested] already have entries?
    const existing = await prisma.incomeEntry.findMany({
      where: { incomeId: income.id, period: { gte: creationPeriod, lte: requestedPeriod } },
      select: { period: true },
    });
    const posted = new Set(existing.map((e) => e.period));

    for (let p = creationPeriod; p <= requestedPeriod && p <= currentPeriod; p = addPeriods(p, 1)) {
      if (posted.has(p)) continue;

      // Past periods are always due; the current period only once dayOfMonth
      // has passed. Cap per-period so dayOfMonth 31 → Feb 28 correctly.
      const targetDay = Math.min(income.dayOfMonth, lastDayOf(p));
      const due = p < currentPeriod || currentDay >= targetDay;
      if (!due) continue;

      const [pYear, pMonth] = p.split('-').map(Number);
      try {
        await prisma.incomeEntry.create({
          data: {
            amount: income.amount,
            date: new Date(Date.UTC(pYear, pMonth - 1, targetDay)),
            period: p,
            incomeId: income.id,
            userId,
          },
        });
      } catch (error) {
        // A concurrent request posted this period first — the unique
        // constraint fired; safe to ignore.
        if ((error as { code?: string }).code !== 'P2002') throw error;
      }
    }
  }
}
