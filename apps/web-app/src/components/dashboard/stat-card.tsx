import type { LucideIcon } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { formatCents, formatSignedCents } from '@/lib/format';

const VALUE_TONES = {
  positive: 'text-emerald-600 dark:text-emerald-400',
  negative: 'text-rose-600 dark:text-rose-400',
  neutral: 'text-foreground',
} as const;

const ICON_TONES = {
  positive: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
  negative: 'bg-rose-500/10 text-rose-600 dark:text-rose-400',
  neutral: 'bg-primary/10 text-primary',
} as const;

interface StatCardProps {
  label: string;
  value: number;
  icon: LucideIcon;
  tone?: keyof typeof VALUE_TONES;
  /** Show an explicit +/- sign (for net values) */
  signed?: boolean;
  sub?: string;
}

export function StatCard({
  label,
  value,
  icon: Icon,
  tone = 'neutral',
  signed,
  sub,
}: StatCardProps) {
  return (
    <Card>
      <CardContent className="flex items-center gap-4 p-5">
        <div
          className={cn(
            'flex h-10 w-10 shrink-0 items-center justify-center rounded-lg',
            ICON_TONES[tone],
          )}
        >
          <Icon className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-muted-foreground truncate text-sm">{label}</p>
          <p
            className={cn(
              'truncate text-xl font-semibold tracking-tight tabular-nums',
              VALUE_TONES[tone],
            )}
          >
            {signed ? formatSignedCents(value) : formatCents(value)}
          </p>
          {sub && <p className="text-muted-foreground truncate text-xs">{sub}</p>}
        </div>
      </CardContent>
    </Card>
  );
}

export function StatCardSkeleton() {
  return (
    <Card>
      <CardContent className="flex items-center gap-4 p-5">
        <Skeleton className="h-10 w-10 shrink-0 rounded-lg" />
        <div className="flex-1 space-y-2">
          <Skeleton className="h-3.5 w-16" />
          <Skeleton className="h-6 w-24" />
        </div>
      </CardContent>
    </Card>
  );
}
