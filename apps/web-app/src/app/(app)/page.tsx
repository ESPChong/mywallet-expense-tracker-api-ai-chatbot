'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { AlertCircle, PiggyBank, Receipt, TrendingUp, Wallet } from 'lucide-react';
import { useDashboard } from '@/hooks/use-dashboard';
import { MonthPicker } from '@/components/month-picker';
import { StatCard, StatCardSkeleton } from '@/components/dashboard/stat-card';
import { SpendingBreakdown } from '@/components/dashboard/spending-breakdown';
import { ActivityFeed } from '@/components/dashboard/activity-feed';
import { currentMonthString, isValidMonthString, monthLabel } from '@/lib/format';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';

export default function DashboardPage() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // Month is URL state: deep-linkable, back/forward works, and the chatbot
  // drawer reads the same URL to stay in sync.
  const param = searchParams.get('month');
  const month = isValidMonthString(param) ? param : currentMonthString();

  const { data, isPending, isError, isFetching, refetch } = useDashboard(month);

  function handleMonthChange(next: string) {
    const current = currentMonthString();
    // Bare URL for the current month, ?month= for anything else
    router.push(next === current ? pathname : `${pathname}?month=${next}`, { scroll: false });
  }

  const label = monthLabel(month);
  const expenseCount = data?.spendingByCategory.reduce((sum, c) => sum + c.transactionCount, 0);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
          <p className="text-muted-foreground text-sm">{label} overview</p>
        </div>
        <MonthPicker value={month} onChange={handleMonthChange} />
      </div>

      {isPending ? (
        // First load: skeletons shaped like the real content
        <div className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <StatCardSkeleton key={i} />
            ))}
          </div>
          <div className="grid gap-6 lg:grid-cols-3">
            <Card className="lg:col-span-2">
              <CardContent className="flex items-center justify-center gap-6 p-6">
                <Skeleton className="h-40 w-40 rounded-full" />
                <div className="flex-1 space-y-4">
                  {Array.from({ length: 4 }).map((_, i) => (
                    <Skeleton key={i} className="h-6 w-full" />
                  ))}
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="space-y-3 p-6">
                {Array.from({ length: 5 }).map((_, i) => (
                  <Skeleton key={i} className="h-12 w-full" />
                ))}
              </CardContent>
            </Card>
          </div>
        </div>
      ) : isError || !data ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
            <AlertCircle className="text-destructive h-8 w-8" />
            <div>
              <p className="font-medium">Couldn&apos;t load your dashboard</p>
              <p className="text-muted-foreground text-sm">
                Something went wrong fetching your data.
              </p>
            </div>
            <Button variant="outline" onClick={() => refetch()}>
              Try again
            </Button>
          </CardContent>
        </Card>
      ) : (
        // Subtle dim while a month switch refetches (keepPreviousData at work)
        <div className={cn('space-y-6 transition-opacity', isFetching && 'opacity-60')}>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard
              label="Income"
              value={data.summary.monthIncome}
              icon={TrendingUp}
              tone="positive"
            />
            <StatCard
              label="Expenses"
              value={data.summary.monthExpenses}
              icon={Receipt}
              tone="negative"
              sub={
                expenseCount
                  ? `${expenseCount} transaction${expenseCount === 1 ? '' : 's'}`
                  : undefined
              }
            />
            <StatCard
              label="Net this month"
              value={data.summary.netThisMonth}
              icon={Wallet}
              tone={data.summary.netThisMonth >= 0 ? 'positive' : 'negative'}
              signed
            />
            <StatCard
              label="Total savings"
              value={data.summary.totalSavings}
              icon={PiggyBank}
              tone="neutral"
              sub="All time"
            />
          </div>

          <div className="grid gap-6 lg:grid-cols-3">
            <SpendingBreakdown items={data.spendingByCategory} monthLabel={label} />
            <ActivityFeed items={data.recentActivity} />
          </div>
        </div>
      )}
    </div>
  );
}
