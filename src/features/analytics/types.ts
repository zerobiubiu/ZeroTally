import type { MonthlySummary, TransactionListItem } from '../transactions/types';

export type AnalyticsKind = 'expense' | 'income';

export type AnalyticsScope = 'month' | 'year' | 'all';

export interface SubcategoryBreakdownItem {
  categoryId: string;
  name: string;
  icon: string;
  totalCents: number;
  count: number;
  /** 占所属一级分类净额的百分比（保留 1 位小数，0 - 100） */
  percentage: number;
  /** 是否为直接挂在一级分类（未选二级子类）上的交易汇总 */
  isDirectParent?: boolean;
}

export interface CategoryBreakdownItem {
  categoryId: string;
  name: string;
  icon: string;
  color: string;
  totalCents: number;
  count: number;
  /** 占当前类型总额百分比（保留 1 位小数，0 - 100） */
  percentage: number;
  /** 二级子分类拆分（仅当该一级分类下存在二级分类流水时非空） */
  children: SubcategoryBreakdownItem[];
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

export interface AnalyticsTrendPoint {
  /** 趋势节点标识：按月/年趋势为 YYYY-MM，全量按年趋势为 YYYY */
  key: string;
  label: string;
  expenseCents: number;
  incomeCents: number;
  balanceCents: number;
}

export interface MetricDelta {
  deltaCents: number;
  /** 相对对比基期的变化百分比（保留 1 位小数）；基期金额 <= 0 时为 null */
  changePercent: number | null;
}

export interface PeriodComparisonSnapshot {
  label: string;
  expenseCents: number;
  incomeCents: number;
  balanceCents: number;
  expenseDelta: MetricDelta;
  incomeDelta: MetricDelta;
}

export interface PeriodComparison {
  /** 按月为「环比上月」，按年为「同比上年」 */
  previous: PeriodComparisonSnapshot;
  /** 按月提供「同比去年同月」，按年为 null */
  yearOverYear: PeriodComparisonSnapshot | null;
}

export interface PeriodHighlights {
  /** 本周期发生正净支出的活跃天数 */
  activeExpenseDays: number;
  /** 单日净支出最高日（无正支出日时为 null） */
  peakExpenseDay: { occurredOn: string; totalCents: number } | null;
  /** 单笔平均支出（整数分，按净支出 / 支出笔数） */
  avgExpensePerTxCents: number;
}

export interface TopTransactionItem {
  transaction: TransactionListItem;
  /** 支出扣减关联退款后的净额；收入为原金额 */
  effectiveCents: number;
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
  highlights: PeriodHighlights;
  topExpenses: TopTransactionItem[];
  topIncomes: TopTransactionItem[];
}

export interface ScopedAnalyticsReport {
  scope: AnalyticsScope;
  /** month: YYYY-MM；year: YYYY；all: 'all' */
  periodKey: string;
  /** 全部模式下的起止日期提示（无数据时为 null） */
  dateRangeLabel: string | null;
  summary: MonthlySummary;
  dailyAvgExpenseCents: number;
  savingsRatePercent: number | null;
  comparison: PeriodComparison | null;
  highlights: PeriodHighlights;
  expenseByCategory: CategoryBreakdownItem[];
  incomeByCategory: CategoryBreakdownItem[];
  expenseByAccount: AccountBreakdownItem[];
  incomeByAccount: AccountBreakdownItem[];
  topExpenses: TopTransactionItem[];
  topIncomes: TopTransactionItem[];
  trendTitle: string;
  trendGranularity: 'month' | 'year';
  trendPoints: AnalyticsTrendPoint[];
}
