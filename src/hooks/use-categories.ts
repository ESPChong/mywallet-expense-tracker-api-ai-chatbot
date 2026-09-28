import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { api } from '@/lib/api-client';
import type { Category } from '@/types/api';

export const categoryKeys = {
  all: ['categories'] as const,
};

export function useCategories() {
  return useQuery({
    queryKey: categoryKeys.all,
    queryFn: () => api<{ data: Category[] }>('/api/categories'),
    // Categories change rarely; a minute of staleness keeps forms snappy
    staleTime: 60_000,
  });
}

export function useCreateCategory() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (name: string) =>
      api<Category>('/api/categories', { method: 'POST', body: { name } }),
    onSuccess: () => {
      toast.success('Category added');
      queryClient.invalidateQueries({ queryKey: categoryKeys.all });
    },
  });
}
