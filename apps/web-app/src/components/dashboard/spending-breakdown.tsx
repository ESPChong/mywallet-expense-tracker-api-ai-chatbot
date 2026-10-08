'use client';

import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts';
import { ChartPie } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { formatCents, formatCentsCompact } from '@/lib/format';
import type { SpendingByCategory } from '@/types/api';

// Categorical palette (token-based, so dark mode follows automatically).
// Emerald/rose deliberately absent — those mean income/expense, not categories.
const PALETTE = [
  'var(--chart-1)',
  'var(--chart-2)',
  'var(--chart-3)',
  'var(--chart-4)',
  'var(--chart-5)',
];

type ColoredItem = SpendingByCategory & { color: string };

interface DonutTooltipProps {
  active?: boolean;
  payload?: { payload: ColoredItem }[];
}

function DonutTooltip({ active, payload }: DonutTooltipProps) {
  if (!active || !payload?.length) return null;
  const item = payload[0].payload;
  return (
    <div className="bg-popover rounded-lg border px-3 py-2 text-sm shadow-md">
      <div className="flex items-center gap-2">
        <span className="h-2 w-2 rounded-full" style={{ backgroundColor: item.color }} />
        <span className="font-medium">{item.name}</span>
      </div>
      <div className="text-muted-foreground mt-1 tabular-nums">
        {formatCents(item.amount)} · {Math.round(item.percentage)}%
      </div>
    </div>
  );
}

export function SpendingBreakdown({
  items,
  monthLabel,
}: {
  items: SpendingByCategory[];
  monthLabel: string;
}) {
  const total = items.reduce((sum, item) => sum + item.amount, 0);

  if (total === 0) {
    return (
      <Card className="lg:col-span-2">
        <CardHeader>
          <CardTitle>Spending by category</CardTitle>
          <CardDescription>{monthLabel}</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col items-center justify-center gap-2 py-12 text-center">
            <div className="bg-muted flex h-12 w-12 items-center justify-center rounded-full">
              <ChartPie className="text-muted-foreground h-5 w-5" />
            </div>
            <p className="text-sm font-medium">No expenses in {monthLabel}</p>
            <p className="text-muted-foreground text-sm">
              Add an expense to see your category breakdown.
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  const data: ColoredItem[] = items.map((item, i) => ({
    ...item,
    color: PALETTE[i % PALETTE.length],
  }));

  return (
    <Card className="lg:col-span-2">
      <CardHeader>
        <CardTitle>Spending by category</CardTitle>
        <CardDescription>{monthLabel}</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid gap-6 sm:grid-cols-2">
          {/* Donut with center total */}
          <div className="relative mx-auto h-52 w-52">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={data}
                  dataKey="amount"
                  nameKey="name"
                  innerRadius={58}
                  outerRadius={88}
                  paddingAngle={2}
                  strokeWidth={0}
                >
                  {data.map((entry) => (
                    <Cell key={entry.categoryId} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip
                  cursor={false}
                  // Recharts passes its own props object; we only use
                  // active + payload — hence this single localized cast.
                  content={(props) => <DonutTooltip {...(props as unknown as DonutTooltipProps)} />}
                />
              </PieChart>
            </ResponsiveContainer>
            <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-muted-foreground text-xs">Spent</span>
              <span className="text-lg font-semibold tabular-nums">
                {formatCentsCompact(total)}
              </span>
            </div>
          </div>

          {/* Ranked category bars — doubles as the donut legend */}
          <div className="flex flex-col justify-center space-y-4">
            {data.map((item) => (
              <div key={item.categoryId} className="space-y-1.5">
                <div className="flex items-baseline justify-between gap-2 text-sm">
                  <span className="flex min-w-0 items-center gap-2">
                    <span
                      className="h-2.5 w-2.5 shrink-0 rounded-full"
                      style={{ backgroundColor: item.color }}
                    />
                    <span className="truncate">
                      {item.name}
                      <span className="text-muted-foreground ml-1.5 text-xs">
                        ×{item.transactionCount}
                      </span>
                    </span>
                  </span>
                  <span className="shrink-0 font-medium tabular-nums">
                    {formatCents(item.amount)}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="bg-muted h-1.5 flex-1 overflow-hidden rounded-full">
                    <div
                      className="h-full rounded-full"
                      style={{
                        width: `${Math.min(100, item.percentage)}%`,
                        backgroundColor: item.color,
                      }}
                    />
                  </div>
                  <span className="text-muted-foreground w-9 shrink-0 text-right text-xs tabular-nums">
                    {Math.round(item.percentage)}%
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
