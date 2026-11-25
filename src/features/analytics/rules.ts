import { getTodayIsoDate, shiftMonthKey } from '../../shared/date/date';
import type { TransactionListItem } from '../transactions/types';
import type {
  AccountBreakdownItem,
  AnalyticsKind,
  CategoryBreakdownItem,
  MonthlyTrendPoint,
} from './types';

function roundPercent(part: number, total: number): number {
  if (total <= 0) {
    return 0;
  }
  return Math.round((part / total) * 1000) / 10;
}

/**
 * 按分类聚合支出或收入排行（金额降序，附带笔数与占比）。
 */
export function buildCategoryBreakdown(
  items: readonly TransactionListItem[],
  kind: AnalyticsKind
): CategoryBreakdownItem[] {
  const map = new Map<string, Omit<CategoryBreakdownItem, 'percentage'>>();
  let grandTotal = 0;

  for (const item of items) {
    if (item.type !== kind) {
      continue;
    }
    grandTotal += item.amountCents;
    const key = item.categoryId ?? 'uncategorized';
    const prev = map.get(key);
    if (prev) {
      prev.totalCents += item.amountCents;
      prev.count += 1;
    } else {
      map.set(key, {
        categoryId: key,
        name: item.categoryName ?? '未分类',
        icon: item.categoryIcon ?? 'pricetag-outline',
        color: item.categoryColor ?? '#5C6479',
        totalCents: item.amountCents,
        count: 1,
      });
    }
  }

  return Array.from(map.values())
    .sort((a, b) => b.totalCents - a.totalCents)
    .map((entry) => ({
      ...entry,
      percentage: roundPercent(entry.totalCents, grandTotal),
    }));
}

/**
 * 按资金账户聚合当月支出或收入分布（金额降序）。
 */
export function buildAccountBreakdown(
  items: readonly TransactionListItem[],
  kind: AnalyticsKind
): AccountBreakdownItem[] {
  const map = new Map<string, Omit<AccountBreakdownItem, 'percentage'>>();
  let grandTotal = 0;

  for (const item of items) {
    if (item.type !== kind) {
      continue;
    }
    grandTotal += item.amountCents;
    const prev = map.get(item.accountId);
    if (prev) {
      prev.totalCents += item.amountCents;
      prev.count += 1;
    } else {
      map.set(item.accountId, {
        accountId: item.accountId,
        name: item.accountName,
        totalCents: item.amountCents,
        count: 1,
      });
    }
  }

  return Array.from(map.values())
    .sort((a, b) => b.totalCents - a.totalCents)
    .map((entry) => ({
      ...entry,
      percentage: roundPercent(entry.totalCents, grandTotal),
    }));
}

/**
 * 计算日均支出（分）：当前月份按本月已过天数，非当月按整月自然天数。
 */
export function computeDailyAvgExpenseCents(
  expenseCents: number,
  monthKey: string,
  todayIso: string = getTodayIsoDate()
): number {
  if (expenseCents <= 0) {
    return 0;
  }
  const [yearStr, monthStr] = monthKey.split('-');
  const year = Number(yearStr);
  const month = Number(monthStr);
  const daysInMonth = new Date(year, month, 0).getDate();
  const todayMonth = todayIso.slice(0, 7);

  let divisor = daysInMonth;
  if (monthKey === todayMonth) {
    const todayDay = Number(todayIso.slice(8, 10));
    divisor = Math.max(1, Math.min(daysInMonth, todayDay));
  }
  return Math.round(expenseCents / divisor);
}

/**
 * 计算月度结余率（(收入 - 支出) / 收入，保留 1 位小数）；当月无收入返回 null。
 */
export function computeSavingsRatePercent(
  incomeCents: number,
  expenseCents: number
): number | null {
  if (incomeCents <= 0) {
    return null;
  }
  return Math.round(((incomeCents - expenseCents) / incomeCents) * 1000) / 10;
}

/**
 * 构建以 endMonthKey 结尾的连续 6 个月收支趋势（转账不计入支出/收入）。
 */
export function buildSixMonthTrend(
  endMonthKey: string,
  items: readonly TransactionListItem[]
): MonthlyTrendPoint[] {
  const monthKeys: string[] = [];
  for (let offset = -5; offset <= 0; offset += 1) {
    monthKeys.push(shiftMonthKey(endMonthKey, offset));
  }

  const map = new Map<string, MonthlyTrendPoint>();
  for (const key of monthKeys) {
    const monthNum = Number(key.slice(5, 7));
    map.set(key, {
      monthKey: key,
      label: `${monthNum}月`,
      expenseCents: 0,
      incomeCents: 0,
      balanceCents: 0,
    });
  }

  for (const item of items) {
    const key = item.occurredOn.slice(0, 7);
    const point = map.get(key);
    if (!point) {
      continue;
    }
    if (item.type === 'expense') {
      point.expenseCents += item.amountCents;
    } else if (item.type === 'income') {
      point.incomeCents += item.amountCents;
    }
    point.balanceCents = point.incomeCents - point.expenseCents;
  }

  return monthKeys.map((key) => map.get(key)!);
}
