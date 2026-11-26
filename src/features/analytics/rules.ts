import {
  countInclusiveDaysBetween,
  getDaysInYear,
  getTodayIsoDate,
  shiftMonthKey,
} from '../../shared/date/date';
import type { TransactionListItem } from '../transactions/types';
import type {
  AccountBreakdownItem,
  AnalyticsKind,
  AnalyticsTrendPoint,
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
 * 按一级分类聚合支出或收入排行（二级分类金额并入所属一级；支出维度下退款自动抵扣对应一级分类支出）。
 */
export function buildCategoryBreakdown(
  items: readonly TransactionListItem[],
  kind: AnalyticsKind
): CategoryBreakdownItem[] {
  const map = new Map<string, Omit<CategoryBreakdownItem, 'percentage'>>();

  for (const item of items) {
    const isMatch = item.type === kind;
    const isExpenseRefund = kind === 'expense' && item.type === 'refund';
    if (!isMatch && !isExpenseRefund) {
      continue;
    }

    const isChild = item.categoryParentId !== null;
    const key = (isChild ? item.categoryParentId : item.categoryId) ?? 'uncategorized';
    const delta = isExpenseRefund ? -item.amountCents : item.amountCents;
    const countDelta = isExpenseRefund ? 0 : 1;

    const prev = map.get(key);
    if (prev) {
      prev.totalCents += delta;
      prev.count += countDelta;
    } else {
      map.set(key, {
        categoryId: key,
        name: (isChild ? item.categoryParentName : item.categoryName) ?? '未分类',
        icon: (isChild ? item.categoryParentIcon : item.categoryIcon) ?? 'pricetag-outline',
        color: (isChild ? item.categoryParentColor : item.categoryColor) ?? '#5C6479',
        totalCents: delta,
        count: countDelta,
      });
    }
  }

  const positiveEntries = Array.from(map.values()).filter((entry) => entry.totalCents > 0);
  const grandTotal = positiveEntries.reduce((sum, entry) => sum + entry.totalCents, 0);

  return positiveEntries
    .sort((a, b) => b.totalCents - a.totalCents)
    .map((entry) => ({
      ...entry,
      percentage: roundPercent(entry.totalCents, grandTotal),
    }));
}

/**
 * 按资金账户聚合当月支出或收入分布（支出维度下退款抵扣对应退款账户支出，金额降序）。
 */
export function buildAccountBreakdown(
  items: readonly TransactionListItem[],
  kind: AnalyticsKind
): AccountBreakdownItem[] {
  const map = new Map<string, Omit<AccountBreakdownItem, 'percentage'>>();

  for (const item of items) {
    const isMatch = item.type === kind;
    const isExpenseRefund = kind === 'expense' && item.type === 'refund';
    if (!isMatch && !isExpenseRefund) {
      continue;
    }

    const delta = isExpenseRefund ? -item.amountCents : item.amountCents;
    const countDelta = isExpenseRefund ? 0 : 1;

    const prev = map.get(item.accountId);
    if (prev) {
      prev.totalCents += delta;
      prev.count += countDelta;
    } else {
      map.set(item.accountId, {
        accountId: item.accountId,
        name: item.accountName,
        totalCents: delta,
        count: countDelta,
      });
    }
  }

  const positiveEntries = Array.from(map.values()).filter((entry) => entry.totalCents > 0);
  const grandTotal = positiveEntries.reduce((sum, entry) => sum + entry.totalCents, 0);

  return positiveEntries
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
    } else if (item.type === 'refund') {
      point.expenseCents -= item.amountCents;
    } else if (item.type === 'income') {
      point.incomeCents += item.amountCents;
    }
    point.balanceCents = point.incomeCents - point.expenseCents;
  }

  return monthKeys.map((key) => map.get(key)!);
}

/**
 * 计算年度日均支出（分）：当年按 1 月 1 日至今日已过天数，非当年按整年天数。
 */
export function computeYearDailyAvgExpenseCents(
  expenseCents: number,
  year: number,
  todayIso: string = getTodayIsoDate()
): number {
  if (expenseCents <= 0) {
    return 0;
  }
  const todayYear = Number(todayIso.slice(0, 4));
  const divisor =
    year === todayYear
      ? countInclusiveDaysBetween(`${year}-01-01`, todayIso)
      : getDaysInYear(year);
  return Math.round(expenseCents / Math.max(1, divisor));
}

/**
 * 计算全周期日均支出（分）：按最早交易日至最晚交易日/今日中较晚者的闭区间天数。
 */
export function computeAllTimeDailyAvgExpenseCents(
  expenseCents: number,
  items: readonly TransactionListItem[],
  todayIso: string = getTodayIsoDate()
): number {
  if (expenseCents <= 0 || items.length === 0) {
    return 0;
  }
  let earliest = items[0]!.occurredOn;
  let latest = items[0]!.occurredOn;
  for (const item of items) {
    if (item.occurredOn < earliest) earliest = item.occurredOn;
    if (item.occurredOn > latest) latest = item.occurredOn;
  }
  const endIso = todayIso > latest ? todayIso : latest;
  const divisor = countInclusiveDaysBetween(earliest, endIso);
  return Math.round(expenseCents / divisor);
}

/**
 * 构建指定年份 1 月至 12 月的收支趋势（转账不计入，退款抵扣当月支出）。
 */
export function buildYearMonthlyTrend(
  year: number,
  items: readonly TransactionListItem[]
): AnalyticsTrendPoint[] {
  const map = new Map<string, AnalyticsTrendPoint>();
  const keys: string[] = [];

  for (let m = 1; m <= 12; m += 1) {
    const key = `${year}-${String(m).padStart(2, '0')}`;
    keys.push(key);
    map.set(key, {
      key,
      label: `${m}月`,
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
    } else if (item.type === 'refund') {
      point.expenseCents -= item.amountCents;
    } else if (item.type === 'income') {
      point.incomeCents += item.amountCents;
    }
    point.balanceCents = point.incomeCents - point.expenseCents;
  }

  return keys.map((key) => map.get(key)!);
}

/**
 * 构建全部时间跨度的按年趋势（按升序覆盖所有涉及年份，最多取最近 6 个有记录年份区间）。
 */
export function buildAllYearsTrend(
  items: readonly TransactionListItem[],
  todayIso: string = getTodayIsoDate()
): AnalyticsTrendPoint[] {
  const yearMap = new Map<number, AnalyticsTrendPoint>();

  for (const item of items) {
    const year = Number(item.occurredOn.slice(0, 4));
    if (!Number.isFinite(year)) {
      continue;
    }
    let point = yearMap.get(year);
    if (!point) {
      point = {
        key: String(year),
        label: `${year}年`,
        expenseCents: 0,
        incomeCents: 0,
        balanceCents: 0,
      };
      yearMap.set(year, point);
    }
    if (item.type === 'expense') {
      point.expenseCents += item.amountCents;
    } else if (item.type === 'refund') {
      point.expenseCents -= item.amountCents;
    } else if (item.type === 'income') {
      point.incomeCents += item.amountCents;
    }
    point.balanceCents = point.incomeCents - point.expenseCents;
  }

  if (yearMap.size === 0) {
    const currentYear = Number(todayIso.slice(0, 4));
    return [
      {
        key: String(currentYear),
        label: `${currentYear}年`,
        expenseCents: 0,
        incomeCents: 0,
        balanceCents: 0,
      },
    ];
  }

  return Array.from(yearMap.entries())
    .sort((a, b) => a[0] - b[0])
    .slice(-6)
    .map(([, pt]) => pt);
}
