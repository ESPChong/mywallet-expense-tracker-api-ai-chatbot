'use client';

import { useState } from 'react';
import { AlertCircle, Pencil, Plus, Trash2, TrendingUp } from 'lucide-react';
import { useIncomes, useToggleIncome } from '@/hooks/use-incomes';
import { IncomeFormDialog } from '@/components/incomes/income-form-dialog';
import { DeleteIncomeDialog } from '@/components/incomes/delete-income-dialog';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { formatCents, monthLabel, ordinalDay } from '@/lib/format';
import type { Income } from '@/types/api';

type ToggleMutation = ReturnType<typeof useToggleIncome>;

function IncomeCard({
  income,
  toggle,
  onEdit,
  onDelete,
}: {
  income: Income;
  toggle: ToggleMutation;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const isToggling = toggle.isPending && toggle.variables?.id === income.id;

  return (
    <Card className={cn('transition-opacity', !income.active && 'opacity-60')}>
      <CardContent className="p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate font-medium">{income.name ?? 'Recurring income'}</p>
            <p className="mt-1 text-xl font-semibold tracking-tight text-emerald-600 tabular-nums dark:text-emerald-400">
              {formatCents(income.amount)}
            </p>
          </div>
          <Switch
            checked={income.active}
            disabled={isToggling}
            ariaLabel={
              income.active
                ? `Pause ${income.name ?? 'income'}`
                : `Resume ${income.name ?? 'income'}`
            }
            onCheckedChange={(active) => toggle.mutate({ id: income.id, active })}
          />
        </div>

        <div className="text-muted-foreground mt-3 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs">
          <span className="bg-muted inline-flex items-center rounded-full px-2.5 py-0.5 font-medium">
            Posts on the {ordinalDay(income.dayOfMonth)}
          </span>
          {income.lastPostedPeriod && (
            <span>Last posted {monthLabel(income.lastPostedPeriod)}</span>
          )}
          {!income.active && <span className="font-medium">Paused</span>}
        </div>

        <div className="mt-4 flex justify-end gap-1">
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            aria-label={`Edit ${income.name ?? 'income'}`}
            onClick={onEdit}
          >
            <Pencil className="h-3.5 w-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="text-muted-foreground hover:text-destructive h-8 w-8"
            aria-label={`Delete ${income.name ?? 'income'}`}
            onClick={onDelete}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

export default function IncomesPage() {
  const { data, isPending, isError, refetch } = useIncomes();
  const toggleIncome = useToggleIncome();

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Income | null>(null);
  const [deleting, setDeleting] = useState<Income | null>(null);

  const incomes = data?.data ?? [];
  const activeCount = incomes.filter((i) => i.active).length;
  const monthlyTotal = incomes.filter((i) => i.active).reduce((sum, i) => sum + i.amount, 0);

  function openCreate() {
    setEditing(null);
    setFormOpen(true);
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Incomes</h1>
          <p className="text-muted-foreground text-sm">
            {isPending
              ? 'Recurring income templates'
              : incomes.length === 0
                ? 'Recurring income templates'
                : `${activeCount} active · ${formatCents(monthlyTotal)} expected per month`}
          </p>
        </div>
        <Button onClick={openCreate}>
          <Plus className="h-4 w-4" />
          Add income
        </Button>
      </div>

      {isError ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
            <AlertCircle className="text-destructive h-8 w-8" />
            <div>
              <p className="font-medium">Couldn&apos;t load your incomes</p>
              <p className="text-muted-foreground text-sm">
                Something went wrong fetching your data.
              </p>
            </div>
            <Button variant="outline" onClick={() => refetch()}>
              Try again
            </Button>
          </CardContent>
        </Card>
      ) : isPending ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Card key={i}>
              <CardContent className="space-y-4 p-5">
                <div className="flex justify-between">
                  <div className="space-y-2">
                    <Skeleton className="h-4 w-24" />
                    <Skeleton className="h-7 w-28" />
                  </div>
                  <Skeleton className="h-5 w-9 rounded-full" />
                </div>
                <Skeleton className="h-5 w-36 rounded-full" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : incomes.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
            <div className="bg-muted flex h-12 w-12 items-center justify-center rounded-full">
              <TrendingUp className="text-muted-foreground h-5 w-5" />
            </div>
            <div>
              <p className="font-medium">No recurring incomes yet</p>
              <p className="text-muted-foreground text-sm">
                Add your salary or other regular income — it posts automatically each month.
              </p>
            </div>
            <Button variant="outline" size="sm" onClick={openCreate}>
              <Plus className="h-4 w-4" />
              Add income
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {incomes.map((income) => (
            <IncomeCard
              key={income.id}
              income={income}
              toggle={toggleIncome}
              onEdit={() => {
                setEditing(income);
                setFormOpen(true);
              }}
              onDelete={() => setDeleting(income)}
            />
          ))}
        </div>
      )}

      <IncomeFormDialog open={formOpen} onOpenChange={setFormOpen} income={editing} />
      <DeleteIncomeDialog
        open={deleting !== null}
        income={deleting}
        onOpenChange={(o) => {
          if (!o) setDeleting(null);
        }}
      />
    </div>
  );
}
