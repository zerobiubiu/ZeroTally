import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createNodeTestDatabase } from '../../db/node-test-client';
import { initializeSchema } from '../../db/schema';
import { seedDefaultData } from '../../db/seed';
import type { SqlExecutor } from '../../db/types';
import { createRefundTransaction, createTransaction } from '../transactions/service';
import { getMonthlyAnalytics, getScopedAnalytics } from './service';

describe('analytics 账务分析服务集成测试（真实 SQLite）', () => {
  let db: SqlExecutor;
  let close: () => void;

  beforeEach(async () => {
    const conn = createNodeTestDatabase(':memory:');
    db = conn.db;
    close = conn.close;
    await initializeSchema(db);
    await seedDefaultData(db);

    const now = new Date().toISOString();
    const extraAccounts = [
      ['acc_wechat', '微信零钱', 'asset', 'digital', 0, 1, 'chatbubble-ellipses-outline', '#059669', 15],
      ['acc_alipay', '支付宝', 'asset', 'digital', 0, 1, 'phone-portrait-outline', '#0284C7', 20],
      ['acc_bank', '银行储蓄卡', 'asset', 'bank', 0, 1, 'card-outline', '#0F766E', 30],
      ['acc_credit', '信用卡', 'liability', 'credit', 0, 1, 'card-outline', '#E11D48', 50],
    ] as const;
    for (const [id, name, kind, category, bal, include, icon, color, sortOrder] of extraAccounts) {
      await db.run(
        `INSERT INTO accounts (
          id, name, kind, category, balance_cents, include_in_net_worth,
          icon, color, note, is_archived, sort_order, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, '', 0, ?, ?, ?)`,
        [id, name, kind, category, bal, include, icon, color, sortOrder, now, now]
      );
    }
  });

  afterEach(() => {
    close();
  });

  it('单次查询聚合指定月份收支分布、日均、结余率与近 6 月趋势', async () => {
    await createTransaction(db, {
      type: 'income',
      amountCents: 1_000_000,
      categoryId: 'cat_inc_salary',
      accountId: 'acc_bank',
      toAccountId: null,
      occurredOn: '2026-11-05',
    });
    await createTransaction(db, {
      type: 'expense',
      amountCents: 150_000,
      categoryId: 'cat_exp_food',
      accountId: 'acc_wechat',
      toAccountId: null,
      occurredOn: '2026-11-10',
    });
    await createTransaction(db, {
      type: 'expense',
      amountCents: 50_000,
      categoryId: 'cat_exp_transport',
      accountId: 'acc_alipay',
      toAccountId: null,
      occurredOn: '2026-11-12',
    });
    await createTransaction(db, {
      type: 'expense',
      amountCents: 80_000,
      categoryId: 'cat_exp_shopping',
      accountId: 'acc_credit',
      toAccountId: null,
      occurredOn: '2026-09-18',
    });

    const report = await getMonthlyAnalytics(db, '2026-11', '2026-11-20');
    expect(report.summary.expenseCents).toBe(200_000);
    expect(report.summary.incomeCents).toBe(1_000_000);
    expect(report.summary.balanceCents).toBe(800_000);
    expect(report.dailyAvgExpenseCents).toBe(10_000);
    expect(report.savingsRatePercent).toBe(80);
    expect(report.expenseByCategory[0]?.categoryId).toBe('cat_exp_food');
    expect(report.expenseByCategory[0]?.percentage).toBe(75);
    expect(report.expenseByAccount).toHaveLength(2);
    expect(report.trend6Months).toHaveLength(6);
    expect(report.trend6Months.find((p) => p.monthKey === '2026-09')?.expenseCents).toBe(80_000);
  });

  it('真实 SQLite 查询时将二级分类流水并入对应一级分类排行', async () => {
    await createTransaction(db, {
      type: 'expense',
      amountCents: 3_000,
      categoryId: 'cat_exp_food_lunch',
      accountId: 'acc_wechat',
      toAccountId: null,
      occurredOn: '2026-11-10',
    });
    await createTransaction(db, {
      type: 'expense',
      amountCents: 2_000,
      categoryId: 'cat_exp_food_drinks',
      accountId: 'acc_wechat',
      toAccountId: null,
      occurredOn: '2026-11-11',
    });
    await createTransaction(db, {
      type: 'income',
      amountCents: 500_000,
      categoryId: 'cat_inc_salary_base',
      accountId: 'acc_bank',
      toAccountId: null,
      occurredOn: '2026-11-05',
    });

    const report = await getMonthlyAnalytics(db, '2026-11', '2026-11-20');
    expect(report.expenseByCategory).toHaveLength(1);
    expect(report.expenseByCategory[0]).toMatchObject({
      categoryId: 'cat_exp_food',
      name: '餐饮美食',
      totalCents: 5_000,
      count: 2,
      percentage: 100,
    });
    expect(report.incomeByCategory[0]).toMatchObject({
      categoryId: 'cat_inc_salary',
      name: '工资薪金',
      totalCents: 500_000,
    });
  });

  it('关联退款在统计中抵扣原支出分类金额且不虚增收入', async () => {
    const exp = await createTransaction(db, {
      type: 'expense',
      amountCents: 10_000,
      categoryId: 'cat_exp_shopping_daily',
      accountId: 'acc_wechat',
      toAccountId: null,
      occurredOn: '2026-11-10',
    });
    await createRefundTransaction(db, {
      originalTransactionId: exp.id,
      amountCents: 4_000,
      accountId: 'acc_wechat',
      occurredOn: '2026-11-12',
    });

    const report = await getMonthlyAnalytics(db, '2026-11', '2026-11-20');
    expect(report.summary.expenseCents).toBe(6_000);
    expect(report.summary.incomeCents).toBe(0);
    expect(report.expenseByCategory).toHaveLength(1);
    expect(report.expenseByCategory[0]).toMatchObject({
      categoryId: 'cat_exp_shopping',
      totalCents: 6_000,
      count: 1,
      percentage: 100,
    });
    expect(report.incomeByCategory).toHaveLength(0);
  });

  it('支持按年与全部时间维度生成统计汇总及趋势', async () => {
    await createTransaction(db, {
      type: 'expense',
      amountCents: 12_000,
      categoryId: 'cat_exp_food_lunch',
      accountId: 'acc_wechat',
      toAccountId: null,
      occurredOn: '2025-12-20',
    });
    await createTransaction(db, {
      type: 'income',
      amountCents: 300_000,
      categoryId: 'cat_inc_salary',
      accountId: 'acc_bank',
      toAccountId: null,
      occurredOn: '2026-03-05',
    });
    await createTransaction(db, {
      type: 'expense',
      amountCents: 50_000,
      categoryId: 'cat_exp_transport_metro',
      accountId: 'acc_alipay',
      toAccountId: null,
      occurredOn: '2026-11-15',
    });

    const yearReport = await getScopedAnalytics(db, {
      scope: 'year',
      monthKey: '2026-11',
      year: 2026,
      todayIso: '2026-11-26',
    });
    expect(yearReport.summary.incomeCents).toBe(300_000);
    expect(yearReport.summary.expenseCents).toBe(50_000);
    expect(yearReport.trendPoints).toHaveLength(12);
    expect(yearReport.trendPoints[2]?.incomeCents).toBe(300_000);
    expect(yearReport.trendPoints[10]?.expenseCents).toBe(50_000);

    const allReport = await getScopedAnalytics(db, {
      scope: 'all',
      monthKey: '2026-11',
      year: 2026,
      todayIso: '2026-11-26',
    });
    expect(allReport.summary.expenseCents).toBe(62_000);
    expect(allReport.summary.incomeCents).toBe(300_000);
    expect(allReport.dateRangeLabel).toBe('2025-12-20 至 2026-11-15');
    expect(allReport.trendPoints.map((pt) => pt.key)).toEqual(['2025', '2026']);
  });

  it('按月与按年分析输出环比/同比增减、二级分类 children 及大额单笔排行', async () => {
    // 去年同月
    await createTransaction(db, {
      type: 'expense',
      amountCents: 10_000,
      categoryId: 'cat_exp_food_lunch',
      accountId: 'acc_wechat',
      toAccountId: null,
      occurredOn: '2025-11-10',
    });
    // 上月
    await createTransaction(db, {
      type: 'expense',
      amountCents: 20_000,
      categoryId: 'cat_exp_food_lunch',
      accountId: 'acc_wechat',
      toAccountId: null,
      occurredOn: '2026-10-12',
    });
    // 本月两笔二级分类支出
    await createTransaction(db, {
      type: 'expense',
      amountCents: 18_000,
      categoryId: 'cat_exp_food_lunch',
      accountId: 'acc_wechat',
      toAccountId: null,
      occurredOn: '2026-11-08',
    });
    await createTransaction(db, {
      type: 'expense',
      amountCents: 12_000,
      categoryId: 'cat_exp_food_drinks',
      accountId: 'acc_alipay',
      toAccountId: null,
      occurredOn: '2026-11-08',
    });

    const report = await getScopedAnalytics(db, {
      scope: 'month',
      monthKey: '2026-11',
      year: 2026,
      todayIso: '2026-11-20',
    });

    expect(report.comparison?.previous.expenseDelta).toEqual({
      deltaCents: 10_000,
      changePercent: 50,
    });
    expect(report.comparison?.yearOverYear?.expenseDelta).toEqual({
      deltaCents: 20_000,
      changePercent: 200,
    });
    expect(report.expenseByCategory[0]?.children).toHaveLength(2);
    expect(report.expenseByCategory[0]?.children[0]?.categoryId).toBe('cat_exp_food_lunch');
    expect(report.highlights.activeExpenseDays).toBe(1);
    expect(report.highlights.peakExpenseDay).toEqual({
      occurredOn: '2026-11-08',
      totalCents: 30_000,
    });
    expect(report.topExpenses).toHaveLength(2);
    expect(report.topExpenses[0]?.effectiveCents).toBe(18_000);
  });
});
