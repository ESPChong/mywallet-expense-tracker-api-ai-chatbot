export interface DashboardSummary {
  totalSavings: number;
  monthIncome: number;
  monthExpenses: number;
  netThisMonth: number;
}

export interface SpendingByCategory {
  categoryId: string;
  name: string;
  amount: number;
  percentage: number;
  transactionCount: number;
}

export interface RecentActivityItem {
  id: string;
  type: 'expense' | 'income';
  name: string;
  amount: number;
  categoryName: string | null;
  date: string;
}

export interface DashboardData {
  period: string;
  summary: DashboardSummary;
  spendingByCategory: SpendingByCategory[];
  recentActivity: RecentActivityItem[];
}

// ── Used by the expenses page (next phase) ──

export interface Category {
  id: string;
  name: string;
  userId: string;
}

export interface Expense {
  id: string;
  date: string;
  name: string;
  amount: number;
  categoryId: string | null;
  category: { id: string; name: string } | null;
  userId: string;
}

export interface Pagination {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export interface ExpenseListResponse {
  data: Expense[];
  pagination: Pagination;
}

export interface Income {
  id: string;
  name: string | null;
  amount: number;
  dayOfMonth: number;
  createdAt: string;
  active: boolean;
  lastPostedPeriod: string | null;
  userId: string;
}
