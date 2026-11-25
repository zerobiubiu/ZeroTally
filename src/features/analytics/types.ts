import type { MonthlySummary } from '../transactions/types';

export type AnalyticsKind = 'expense' | 'income';

export interface CategoryBreakdownItem {
  categoryId: string;
  name: string;
  icon: string;
  color: string;
  totalCents: number;
  count: number;
  /** 占当前类型总额百分比（保留 1 位小数，0 - 100） */
  percentage: number;
}

export interface AccountBreakdownItem {
  accountId: string;
  name: string;
  totalCents: number;
  count: number;
  percentage: number;
}

export interface MonthlyTrendPoint {
  monthKey: string;
  label: string;
  expenseCents: number;
  incomeCents: number;
  balanceCents: number;
}

export interface MonthlyAnalyticsReport {
  monthKey: string;
  summary: MonthlySummary;
  dailyAvgExpenseCents: number;
  /** 当月收入 > 0 时计算结余率（保留 1 位小数）；无收入时为 null */
  savingsRatePercent: number | null;
  expenseByCategory: CategoryBreakdownItem[];
  incomeByCategory: CategoryBreakdownItem[];
  expenseByAccount: AccountBreakdownItem[];
  incomeByAccount: AccountBreakdownItem[];
  trend6Months: MonthlyTrendPoint[];
}
