import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { api } from '@/lib/api-client';
import { dashboardKeys } from './use-dashboard';
import type { Expense, ExpenseListResponse } from '@/types/api';

export interface ExpenseFilters {
  month: string;
  categoryId?: string;
  page: number;
}

export interface ExpenseCreateInput {
  name: string;
  amount: number; // integer cents
  date: string; // YYYY-MM-DD
  categoryId?: string; // omitted → uncategorized
}

export interface ExpenseUpdateInput {
  name: string;
  amount: number;
  date: string;
  categoryId: string | null; // null → explicitly clear the category
}

export const expenseKeys = {
  all: ['expenses'] as const,
  list: (filters: ExpenseFilters) => ['expenses', 'list', filters] as const,
};

export function useExpenses(filters: ExpenseFilters) {
  return useQuery({
    queryKey: expenseKeys.list(filters),
    queryFn: () => {
      const params = new URLSearchParams({ month: filters.month, page: String(filters.page) });
      if (filters.categoryId) params.set('categoryId', filters.categoryId);
      return api<ExpenseListResponse>(`/api/expenses?${params.toString()}`);
    },
    placeholderData: keepPreviousData,
  });
}

// Both expense lists AND dashboard aggregates depend on expense data —
// every mutation invalidates both key families. This is the "new expense
// appears on the dashboard instantly" loop.
function useExpenseInvalidations() {
  const queryClient = useQueryClient();
  return () => {
    queryClient.invalidateQueries({ queryKey: expenseKeys.all });
    queryClient.invalidateQueries({ queryKey: dashboardKeys.all });
  };
}

export function useCreateExpense() {
  const invalidate = useExpenseInvalidations();
  return useMutation({
    mutationFn: (input: ExpenseCreateInput) =>
      api<Expense>('/api/expenses', { method: 'POST', body: input }),
    onSuccess: () => {
      toast.success('Expense added');
      invalidate();
    },
  });
}

export function useUpdateExpense() {
  const invalidate = useExpenseInvalidations();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: ExpenseUpdateInput }) =>
      api<Expense>(`/api/expenses/${id}`, { method: 'PATCH', body: input }),
    onSuccess: () => {
      toast.success('Expense updated');
      invalidate();
    },
  });
}

export function useDeleteExpense() {
  const invalidate = useExpenseInvalidations();
  return useMutation({
    mutationFn: (id: string) => api<void>(`/api/expenses/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      toast.success('Expense deleted');
      invalidate();
    },
  });
}
