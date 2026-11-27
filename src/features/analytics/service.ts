import type { SqlExecutor } from '../../db/types';
import {
  getMonthDateRange,
  getTodayIsoDate,
  getYearDateRange,
  shiftMonthKey,
} from '../../shared/date/date';
import {
  findAllTransactionsForExport,
  findTransactionsByDateRange,
  summarizeTransactionsByDateRange,
} from '../transactions/repository';
import { computeMonthlySummary } from '../transactions/rules';
import {
  buildAccountBreakdown,
  buildAllYearsTrend,
  buildCategoryBreakdown,
  buildPeriodComparisonSnapshot,
  buildPeriodHighlights,
  buildSixMonthTrend,
  buildTopTransactions,
  buildYearMonthlyTrend,
  computeAllTimeDailyAvgExpenseCents,
  computeDailyAvgExpenseCents,
  computeSavingsRatePercent,
  computeYearDailyAvgExpenseCents,
} from './rules';
import type {
  AnalyticsScope,
  MonthlyAnalyticsReport,
  ScopedAnalyticsReport,
} from './types';

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
    highlights: buildPeriodHighlights(monthItems),
    topExpenses: buildTopTransactions(monthItems, 'expense', 5),
    topIncomes: buildTopTransactions(monthItems, 'income', 5),
  };
}

/**
 * 按「月 / 年 / 全部」三种周期维度生成完整账务分析报告（含环比/同比、二级分类下钻、消费洞察与大额排行）。
 */
export async function getScopedAnalytics(
  db: SqlExecutor,
  params: {
    scope: AnalyticsScope;
    monthKey: string;
    year: number;
    todayIso?: string;
  }
): Promise<ScopedAnalyticsReport> {
  const todayIso = params.todayIso ?? getTodayIsoDate();

  if (params.scope === 'month') {
    const monthly = await getMonthlyAnalytics(db, params.monthKey, todayIso);
    const prevMonthKey = shiftMonthKey(params.monthKey, -1);
    const yoyMonthKey = shiftMonthKey(params.monthKey, -12);
    const prevPoint = monthly.trend6Months.find((pt) => pt.monthKey === prevMonthKey);
    const prevSummary = prevPoint
      ? {
          expenseCents: prevPoint.expenseCents,
          incomeCents: prevPoint.incomeCents,
          balanceCents: prevPoint.balanceCents,
        }
      : { expenseCents: 0, incomeCents: 0, balanceCents: 0 };

    const yoyRange = getMonthDateRange(yoyMonthKey);
    const yoySummary = await summarizeTransactionsByDateRange(db, yoyRange.start, yoyRange.end);

    return {
      scope: 'month',
      periodKey: monthly.monthKey,
      dateRangeLabel: null,
      summary: monthly.summary,
      dailyAvgExpenseCents: monthly.dailyAvgExpenseCents,
      savingsRatePercent: monthly.savingsRatePercent,
      comparison: {
        previous: buildPeriodComparisonSnapshot('环比上月', monthly.summary, prevSummary),
        yearOverYear: buildPeriodComparisonSnapshot('同比去年', monthly.summary, yoySummary),
      },
      highlights: monthly.highlights,
      expenseByCategory: monthly.expenseByCategory,
      incomeByCategory: monthly.incomeByCategory,
      expenseByAccount: monthly.expenseByAccount,
      incomeByAccount: monthly.incomeByAccount,
      topExpenses: monthly.topExpenses,
      topIncomes: monthly.topIncomes,
      trendTitle: '近 6 个月趋势',
      trendGranularity: 'month',
      trendPoints: monthly.trend6Months.map((pt) => ({
        key: pt.monthKey,
        label: pt.label,
        expenseCents: pt.expenseCents,
        incomeCents: pt.incomeCents,
        balanceCents: pt.balanceCents,
      })),
    };
  }

  if (params.scope === 'year') {
    const { start, end } = getYearDateRange(params.year);
    const prevYearRange = getYearDateRange(params.year - 1);
    const [yearItems, prevYearSummary] = await Promise.all([
      findTransactionsByDateRange(db, start, end),
      summarizeTransactionsByDateRange(db, prevYearRange.start, prevYearRange.end),
    ]);
    const summary = computeMonthlySummary(yearItems);

    return {
      scope: 'year',
      periodKey: String(params.year),
      dateRangeLabel: null,
      summary,
      dailyAvgExpenseCents: computeYearDailyAvgExpenseCents(
        summary.expenseCents,
        params.year,
        todayIso
      ),
      savingsRatePercent: computeSavingsRatePercent(summary.incomeCents, summary.expenseCents),
      comparison: {
        previous: buildPeriodComparisonSnapshot('同比上年', summary, prevYearSummary),
        yearOverYear: null,
      },
      highlights: buildPeriodHighlights(yearItems),
      expenseByCategory: buildCategoryBreakdown(yearItems, 'expense'),
      incomeByCategory: buildCategoryBreakdown(yearItems, 'income'),
      expenseByAccount: buildAccountBreakdown(yearItems, 'expense'),
      incomeByAccount: buildAccountBreakdown(yearItems, 'income'),
      topExpenses: buildTopTransactions(yearItems, 'expense', 5),
      topIncomes: buildTopTransactions(yearItems, 'income', 5),
      trendTitle: `${params.year}年各月趋势`,
      trendGranularity: 'month',
      trendPoints: buildYearMonthlyTrend(params.year, yearItems),
    };
  }

  // all：全周期汇总
  const allItems = await findAllTransactionsForExport(db);
  const summary = computeMonthlySummary(allItems);

  let dateRangeLabel: string | null = null;
  if (allItems.length > 0) {
    let earliest = allItems[0]!.occurredOn;
    let latest = allItems[0]!.occurredOn;
    for (const item of allItems) {
      if (item.occurredOn < earliest) earliest = item.occurredOn;
      if (item.occurredOn > latest) latest = item.occurredOn;
    }
    dateRangeLabel = earliest === latest ? earliest : `${earliest} 至 ${latest}`;
  }

  return {
    scope: 'all',
    periodKey: 'all',
    dateRangeLabel,
    summary,
    dailyAvgExpenseCents: computeAllTimeDailyAvgExpenseCents(
      summary.expenseCents,
      allItems,
      todayIso
    ),
    savingsRatePercent: computeSavingsRatePercent(summary.incomeCents, summary.expenseCents),
    comparison: null,
    highlights: buildPeriodHighlights(allItems),
    expenseByCategory: buildCategoryBreakdown(allItems, 'expense'),
    incomeByCategory: buildCategoryBreakdown(allItems, 'income'),
    expenseByAccount: buildAccountBreakdown(allItems, 'expense'),
    incomeByAccount: buildAccountBreakdown(allItems, 'income'),
    topExpenses: buildTopTransactions(allItems, 'expense', 5),
    topIncomes: buildTopTransactions(allItems, 'income', 5),
    trendTitle: '年度收支趋势',
    trendGranularity: 'year',
    trendPoints: buildAllYearsTrend(allItems, todayIso),
  };
}
