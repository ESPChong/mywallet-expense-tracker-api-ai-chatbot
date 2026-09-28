'use client';

import { useCallback, useEffect, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { AlertCircle, Pencil, Plus, Receipt, Trash2 } from 'lucide-react';
import { useExpenses } from '@/hooks/use-expenses';
import { useCategories } from '@/hooks/use-categories';
import { MonthPicker } from '@/components/month-picker';
import { NativeSelect } from '@/components/ui/native-select';
import { ExpenseFormDialog } from '@/components/expenses/expense-form-dialog';
import { DeleteExpenseDialog } from '@/components/expenses/delete-expense-dialog';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { currentMonthString, formatCents, formatDateShort, isValidMonthString } from '@/lib/format';
import type { Expense } from '@/types/api';

export default function ExpensesPage() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // All filters are URL state (deep-linkable; back/forward traverses them)
  const monthParam = searchParams.get('month');
  const month = isValidMonthString(monthParam) ? monthParam : currentMonthString();
  const categoryId = searchParams.get('categoryId') ?? '';
  const page = Math.max(1, parseInt(searchParams.get('page') ?? '1', 10) || 1);

  const { data: catData } = useCategories();
  const categories = catData?.data ?? [];

  const { data, isPending, isError, refetch, isFetching } = useExpenses({
    month,
    categoryId: categoryId || undefined,
    page,
  });

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Expense | null>(null);
  const [deleting, setDeleting] = useState<Expense | null>(null);

  const setParam = useCallback(
    (key: string, value: string) => {
      const params = new URLSearchParams(searchParams.toString());
      if (value) params.set(key, value);
      else params.delete(key);
      // Changing a filter invalidates position — reset pagination
      if (key !== 'page') params.delete('page');
      const qs = params.toString();
      router.push(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [pathname, router, searchParams],
  );

  // Clamp: if deletes/filters shrank results and we're past the last page,
  // jump back to it instead of showing an empty page
  const totalPages = data?.pagination.totalPages ?? 0;
  useEffect(() => {
    if (totalPages > 0 && page > totalPages) setParam('page', String(totalPages));
  }, [totalPages, page, setParam]);

  function openCreate() {
    setEditing(null);
    setFormOpen(true);
  }
  function openEdit(expense: Expense) {
    setEditing(expense);
    setFormOpen(true);
  }

  const expenses = data?.data ?? [];
  const pagination = data?.pagination;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Expenses</h1>
          <p className="text-muted-foreground text-sm">Track and manage your spending</p>
        </div>
        <Button onClick={openCreate}>
          <Plus className="h-4 w-4" />
          Add expense
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <MonthPicker value={month} onChange={(m) => setParam('month', m)} />
        <NativeSelect
          value={categoryId}
          onChange={(v) => setParam('categoryId', v)}
          ariaLabel="Filter by category"
          className="w-44"
        >
          <option value="">All categories</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </NativeSelect>
      </div>

      {isError ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
            <AlertCircle className="text-destructive h-8 w-8" />
            <div>
              <p className="font-medium">Couldn&apos;t load your expenses</p>
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
        <Card className="overflow-hidden p-0">
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-muted/50 text-muted-foreground border-b text-left text-xs font-medium tracking-wide uppercase">
                    <th className="px-4 py-3">Date</th>
                    <th className="px-4 py-3">Name</th>
                    <th className="px-4 py-3">Category</th>
                    <th className="px-4 py-3 text-right">Amount</th>
                    <th className="w-24 px-4 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className={cn('transition-opacity', isFetching && 'opacity-60')}>
                  {isPending ? (
                    // First-load skeleton shaped like the table itself
                    Array.from({ length: 6 }).map((_, i) => (
                      <tr key={i} className="border-b last:border-0">
                        <td className="px-4 py-3.5">
                          <Skeleton className="h-4 w-16" />
                        </td>
                        <td className="px-4 py-3.5">
                          <Skeleton className="h-4 w-40" />
                        </td>
                        <td className="px-4 py-3.5">
                          <Skeleton className="h-5 w-20 rounded-full" />
                        </td>
                        <td className="px-4 py-3.5">
                          <Skeleton className="ml-auto h-4 w-16" />
                        </td>
                        <td className="px-4 py-3.5" />
                      </tr>
                    ))
                  ) : expenses.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="px-4 py-12">
                        <div className="flex flex-col items-center gap-3 text-center">
                          <div className="bg-muted flex h-12 w-12 items-center justify-center rounded-full">
                            <Receipt className="text-muted-foreground h-5 w-5" />
                          </div>
                          <div>
                            <p className="font-medium">
                              {categoryId
                                ? 'No expenses match these filters'
                                : 'No expenses this month'}
                            </p>
                            <p className="text-muted-foreground text-sm">
                              {categoryId
                                ? 'Try a different category or month.'
                                : 'Add your first expense to get started.'}
                            </p>
                          </div>
                          {!categoryId && (
                            <Button variant="outline" size="sm" onClick={openCreate}>
                              <Plus className="h-4 w-4" />
                              Add expense
                            </Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ) : (
                    expenses.map((e) => (
                      <tr
                        key={e.id}
                        className="hover:bg-accent/50 border-b transition-colors last:border-0"
                      >
                        <td className="text-muted-foreground px-4 py-3 whitespace-nowrap tabular-nums">
                          {formatDateShort(e.date)}
                        </td>
                        <td className="max-w-64 truncate px-4 py-3 font-medium">{e.name}</td>
                        <td className="px-4 py-3">
                          {e.category ? (
                            <span className="bg-muted inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium">
                              {e.category.name}
                            </span>
                          ) : (
                            <span className="text-muted-foreground text-xs">—</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right font-medium whitespace-nowrap tabular-nums">
                          {formatCents(e.amount)}
                        </td>
                        <td className="px-4 py-3 text-right whitespace-nowrap">
                          <div className="inline-flex gap-1">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8"
                              aria-label={`Edit ${e.name}`}
                              onClick={() => openEdit(e)}
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="text-muted-foreground hover:text-destructive h-8 w-8"
                              aria-label={`Delete ${e.name}`}
                              onClick={() => setDeleting(e)}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {pagination && pagination.total > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-muted-foreground text-sm">
            {pagination.total} expense{pagination.total === 1 ? '' : 's'}
            {pagination.totalPages > 1 && ` · page ${pagination.page} of ${pagination.totalPages}`}
          </p>
          {pagination.totalPages > 1 && (
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={page <= 1}
                onClick={() => setParam('page', String(page - 1))}
              >
                Previous
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={page >= pagination.totalPages}
                onClick={() => setParam('page', String(page + 1))}
              >
                Next
              </Button>
            </div>
          )}
        </div>
      )}

      <ExpenseFormDialog open={formOpen} onOpenChange={setFormOpen} expense={editing} />
      <DeleteExpenseDialog
        open={deleting !== null}
        expense={deleting}
        onOpenChange={(o) => {
          if (!o) setDeleting(null);
        }}
      />
    </div>
  );
}
