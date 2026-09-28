import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api-client';
import type { DashboardData } from '@/types/api';

export const dashboardKeys = {
  all: ['dashboard'] as const,
  month: (month: string) => ['dashboard', month] as const,
};

export function useDashboard(month: string) {
  return useQuery({
    queryKey: dashboardKeys.month(month),
    queryFn: () => api<DashboardData>(`/api/dashboard?month=${month}`),
    placeholderData: keepPreviousData,
    // Overrides the global 15s staleTime: this GET has side effects (lazy
    // recurring-income posting), so a cached totalSavings can be stale the
    // moment another month's fetch posted new entries.
    staleTime: 0,
  });
}
