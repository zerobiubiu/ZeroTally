import type { SqlExecutor } from '../../db/types';
import { getMonthDateRange, getTodayIsoDate, shiftMonthKey } from '../../shared/date/date';
import { findTransactionsByDateRange } from '../transactions/repository';
import { computeMonthlySummary } from '../transactions/rules';
import {
  buildAccountBreakdown,
  buildCategoryBreakdown,
  buildSixMonthTrend,
  computeDailyAvgExpenseCents,
  computeSavingsRatePercent,
} from './rules';
import type { MonthlyAnalyticsReport } from './types';

/**
 * 获取指定月份的完整账务分析报告（单次 SQLite 范围查询覆盖 6 个月趋势与当月分类/账户分布）。
 */
export async function getMonthlyAnalytics(
  db: SqlExecutor,
  monthKey: string,
  todayIso: string = getTodayIsoDate()
): Promise<MonthlyAnalyticsReport> {
  const startMonthKey = shiftMonthKey(monthKey, -5);
  const { start } = getMonthDateRange(startMonthKey);
  const { end } = getMonthDateRange(monthKey);

  const sixMonthItems = await findTransactionsByDateRange(db, start, end);
  const monthItems = sixMonthItems.filter((item) => item.occurredOn.startsWith(`${monthKey}-`));
  const summary = computeMonthlySummary(monthItems);

  return {
    monthKey,
    summary,
    dailyAvgExpenseCents: computeDailyAvgExpenseCents(summary.expenseCents, monthKey, todayIso),
    savingsRatePercent: computeSavingsRatePercent(summary.incomeCents, summary.expenseCents),
    expenseByCategory: buildCategoryBreakdown(monthItems, 'expense'),
    incomeByCategory: buildCategoryBreakdown(monthItems, 'income'),
    expenseByAccount: buildAccountBreakdown(monthItems, 'expense'),
    incomeByAccount: buildAccountBreakdown(monthItems, 'income'),
    trend6Months: buildSixMonthTrend(monthKey, sixMonthItems),
  };
}
