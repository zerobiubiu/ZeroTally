import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createNodeTestDatabase } from '../../db/node-test-client';
import { initializeSchema } from '../../db/schema';
import { seedDefaultData } from '../../db/seed';
import type { SqlExecutor } from '../../db/types';
import { createTransaction } from '../transactions/service';
import { getMonthlyAnalytics } from './service';

describe('analytics 账务分析服务集成测试（真实 SQLite）', () => {
  let db: SqlExecutor;
  let close: () => void;

  beforeEach(async () => {
    const conn = createNodeTestDatabase(':memory:');
    db = conn.db;
    close = conn.close;
    await initializeSchema(db);
    await seedDefaultData(db);
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
});
