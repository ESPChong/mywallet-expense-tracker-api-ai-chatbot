import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { api } from '@/lib/api-client';
import { dashboardKeys } from './use-dashboard';
import type { Income } from '@/types/api';

export const incomeKeys = {
  all: ['incomes'] as const,
};

export function useIncomes() {
  return useQuery({
    queryKey: incomeKeys.all,
    queryFn: () => api<{ data: Income[] }>('/api/incomes'),
  });
}

// Income changes ripple into dashboard totals (new postings, deletions,
// and amount changes affecting future postings) — invalidate both families.
function useIncomeInvalidations() {
  const queryClient = useQueryClient();
  return () => {
    queryClient.invalidateQueries({ queryKey: incomeKeys.all });
    queryClient.invalidateQueries({ queryKey: dashboardKeys.all });
  };
}

export function useCreateIncome() {
  const invalidate = useIncomeInvalidations();
  return useMutation({
    mutationFn: (input: { name?: string; amount: number; dayOfMonth: number }) =>
      api<Income>('/api/incomes', { method: 'POST', body: input }),
    onSuccess: () => {
      toast.success('Income added');
      invalidate();
    },
  });
}

export function useUpdateIncome() {
  const invalidate = useIncomeInvalidations();
  return useMutation({
    mutationFn: ({
      id,
      input,
    }: {
      id: string;
      input: { name: string | null; amount: number; dayOfMonth: number };
    }) => api<Income>(`/api/incomes/${id}`, { method: 'PATCH', body: input }),
    onSuccess: () => {
      toast.success('Income updated');
      invalidate();
    },
  });
}

export function useToggleIncome() {
  const queryClient = useQueryClient();
  const invalidate = useIncomeInvalidations();

  return useMutation({
    mutationFn: ({ id, active }: { id: string; active: boolean }) =>
      api<Income>(`/api/incomes/${id}`, { method: 'PATCH', body: { active } }),

    // Optimistic update: the switch position is the feedback, so success
    // stays silent; errors roll the cache back and toast.
    onMutate: async ({ id, active }) => {
      await queryClient.cancelQueries({ queryKey: incomeKeys.all });
      const previous = queryClient.getQueryData<{ data: Income[] }>(incomeKeys.all);
      if (previous) {
        queryClient.setQueryData(incomeKeys.all, {
          data: previous.data.map((inc) => (inc.id === id ? { ...inc, active } : inc)),
        });
      }
      return { previous };
    },
    onError: (_error, _variables, context) => {
      if (context?.previous) {
        queryClient.setQueryData(incomeKeys.all, context.previous);
      }
      toast.error('Could not update — try again');
    },
    onSettled: () => invalidate(),
  });
}

export function useDeleteIncome() {
  const invalidate = useIncomeInvalidations();
  return useMutation({
    mutationFn: (id: string) => api<void>(`/api/incomes/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      toast.success('Income deleted');
      invalidate();
    },
  });
}
