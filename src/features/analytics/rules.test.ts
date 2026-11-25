import { describe, expect, it } from 'vitest';
import type { TransactionListItem } from '../transactions/types';
import {
  buildAccountBreakdown,
  buildCategoryBreakdown,
  buildSixMonthTrend,
  computeDailyAvgExpenseCents,
  computeSavingsRatePercent,
} from './rules';

function makeItem(overrides: Partial<TransactionListItem>): TransactionListItem {
  return {
    id: 'tx_1',
    type: 'expense',
    amountCents: 1000,
    categoryId: 'cat_exp_food',
    accountId: 'acc_wechat',
    toAccountId: null,
    occurredOn: '2026-11-20',
    note: '',
    createdAt: '2026-11-20T10:00:00.000Z',
    updatedAt: '2026-11-20T10:00:00.000Z',
    categoryName: '餐饮美食',
    categoryIcon: 'restaurant-outline',
    categoryColor: '#D97706',
    accountName: '微信零钱',
    toAccountName: null,
    ...overrides,
  };
}

describe('analytics 账务分析纯规则', () => {
  it('按金额降序聚合分类与账户占比，且忽略转账记录', () => {
    const items: TransactionListItem[] = [
      makeItem({ id: '1', categoryId: 'c1', categoryName: '餐饮', accountId: 'a1', accountName: '微信', amountCents: 3000 }),
      makeItem({ id: '2', categoryId: 'c2', categoryName: '交通', accountId: 'a2', accountName: '支付宝', amountCents: 7000 }),
      makeItem({ id: '3', type: 'transfer', categoryId: null, categoryName: null, accountId: 'a1', toAccountId: 'a2', amountCents: 50000 }),
    ];

    const cats = buildCategoryBreakdown(items, 'expense');
    expect(cats).toHaveLength(2);
    expect(cats[0]?.name).toBe('交通');
    expect(cats[0]?.percentage).toBe(70);
    expect(cats[1]?.name).toBe('餐饮');
    expect(cats[1]?.percentage).toBe(30);

    const accs = buildAccountBreakdown(items, 'expense');
    expect(accs[0]?.name).toBe('支付宝');
    expect(accs[0]?.percentage).toBe(70);
  });

  it('正确计算当月已过天数与历史整月日均支出及结余率', () => {
    expect(computeDailyAvgExpenseCents(10000, '2026-11', '2026-11-10')).toBe(1000);
    expect(computeDailyAvgExpenseCents(31000, '2026-10', '2026-11-10')).toBe(1000);
    expect(computeDailyAvgExpenseCents(29000, '2024-02', '2026-11-10')).toBe(1000);
    expect(computeSavingsRatePercent(100000, 40000)).toBe(60);
    expect(computeSavingsRatePercent(0, 40000)).toBeNull();
  });

  it('生成跨年的连续 6 个月趋势且转账不计入收支', () => {
    const trend = buildSixMonthTrend('2026-02', [
      makeItem({ id: '1', type: 'expense', amountCents: 5000, occurredOn: '2025-12-15' }),
      makeItem({ id: '2', type: 'income', amountCents: 20000, occurredOn: '2026-02-05' }),
      makeItem({ id: '3', type: 'transfer', amountCents: 99900, occurredOn: '2026-02-06' }),
    ]);

    expect(trend.map((t) => t.monthKey)).toEqual([
      '2025-09',
      '2025-10',
      '2025-11',
      '2025-12',
      '2026-01',
      '2026-02',
    ]);
    expect(trend[3]?.expenseCents).toBe(5000);
    expect(trend[5]?.incomeCents).toBe(20000);
    expect(trend[5]?.expenseCents).toBe(0);
  });
});
