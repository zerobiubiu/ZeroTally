import { describe, expect, it } from 'vitest';
import type { TransactionListItem } from '../transactions/types';
import {
  buildAccountBreakdown,
  buildCategoryBreakdown,
  buildPeriodHighlights,
  buildSixMonthTrend,
  buildTopTransactions,
  computeDailyAvgExpenseCents,
  computeMetricDelta,
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
    refundOfId: null,
    occurredOn: '2026-11-20',
    note: '',
    createdAt: '2026-11-20T10:00:00.000Z',
    updatedAt: '2026-11-20T10:00:00.000Z',
    categoryName: '餐饮美食',
    categoryIcon: 'restaurant-outline',
    categoryColor: '#D97706',
    categoryParentId: null,
    categoryParentName: null,
    categoryParentIcon: null,
    categoryParentColor: null,
    accountName: '微信零钱',
    toAccountName: null,
    refundedCents: 0,
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

  it('将二级分类金额与笔数并入所属一级分类汇总', () => {
    const items: TransactionListItem[] = [
      makeItem({
        id: '1',
        categoryId: 'cat_exp_food_lunch',
        categoryName: '午餐',
        categoryIcon: 'fast-food-outline',
        categoryParentId: 'cat_exp_food',
        categoryParentName: '餐饮美食',
        categoryParentIcon: 'restaurant-outline',
        categoryParentColor: '#D97706',
        amountCents: 3500,
      }),
      makeItem({
        id: '2',
        categoryId: 'cat_exp_food',
        categoryName: '餐饮美食',
        amountCents: 2500,
      }),
      makeItem({
        id: '3',
        categoryId: 'cat_exp_transport_metro',
        categoryName: '公交地铁',
        categoryIcon: 'subway-outline',
        categoryParentId: 'cat_exp_transport',
        categoryParentName: '交通出行',
        categoryParentIcon: 'bus-outline',
        categoryParentColor: '#0284C7',
        amountCents: 4000,
      }),
    ];

    const cats = buildCategoryBreakdown(items, 'expense');
    expect(cats).toHaveLength(2);
    expect(cats[0]).toMatchObject({
      categoryId: 'cat_exp_food',
      name: '餐饮美食',
      icon: 'restaurant-outline',
      totalCents: 6000,
      count: 2,
      percentage: 60,
    });
    expect(cats[1]).toMatchObject({
      categoryId: 'cat_exp_transport',
      name: '交通出行',
      totalCents: 4000,
      count: 1,
      percentage: 40,
    });
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

  it('为存在二级子分类的一级分类生成降序 children 拆分，并保留直接记在一级上的未细分项', () => {
    const items: TransactionListItem[] = [
      makeItem({
        id: '1',
        categoryId: 'cat_exp_food_lunch',
        categoryName: '午餐',
        categoryParentId: 'cat_exp_food',
        categoryParentName: '餐饮美食',
        amountCents: 6000,
      }),
      makeItem({
        id: '2',
        categoryId: 'cat_exp_food_drinks',
        categoryName: '饮品',
        categoryParentId: 'cat_exp_food',
        categoryParentName: '餐饮美食',
        amountCents: 1500,
      }),
      makeItem({
        id: '3',
        categoryId: 'cat_exp_food',
        categoryName: '餐饮美食',
        amountCents: 2500,
      }),
    ];

    const cats = buildCategoryBreakdown(items, 'expense');
    expect(cats).toHaveLength(1);
    expect(cats[0]?.children).toHaveLength(3);
    expect(cats[0]?.children[0]).toMatchObject({
      categoryId: 'cat_exp_food_lunch',
      name: '午餐',
      totalCents: 6000,
      percentage: 60,
    });
    expect(cats[0]?.children[1]).toMatchObject({
      categoryId: 'cat_exp_food',
      name: '未细分',
      totalCents: 2500,
      percentage: 25,
      isDirectParent: true,
    });
    expect(cats[0]?.children[2]).toMatchObject({
      categoryId: 'cat_exp_food_drinks',
      name: '饮品',
      totalCents: 1500,
      percentage: 15,
    });
  });

  it('正确计算环比/同比增减百分比、消费节奏洞察与大额单笔排行', () => {
    expect(computeMetricDelta(12000, 10000)).toEqual({ deltaCents: 2000, changePercent: 20 });
    expect(computeMetricDelta(8000, 0)).toEqual({ deltaCents: 8000, changePercent: null });

    const items: TransactionListItem[] = [
      makeItem({ id: '1', amountCents: 5000, occurredOn: '2026-11-01', refundedCents: 2000 }),
      makeItem({ id: '2', amountCents: 8000, occurredOn: '2026-11-01' }),
      makeItem({ id: '3', type: 'refund', amountCents: 2000, occurredOn: '2026-11-01', refundOfId: '1' }),
      makeItem({ id: '4', amountCents: 4000, occurredOn: '2026-11-05' }),
    ];

    const highlights = buildPeriodHighlights(items);
    expect(highlights.activeExpenseDays).toBe(2);
    expect(highlights.peakExpenseDay).toEqual({ occurredOn: '2026-11-01', totalCents: 11000 });
    expect(highlights.avgExpensePerTxCents).toBe(5000);

    const top = buildTopTransactions(items, 'expense', 2);
    expect(top).toHaveLength(2);
    expect(top[0]?.transaction.id).toBe('2');
    expect(top[0]?.effectiveCents).toBe(8000);
    expect(top[1]?.transaction.id).toBe('4');
    expect(top[1]?.effectiveCents).toBe(4000);
  });
});
