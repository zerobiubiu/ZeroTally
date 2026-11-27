import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createNodeTestDatabase } from '../../db/node-test-client';
import { initializeSchema } from '../../db/schema';
import { DEFAULT_WALLET_ACCOUNT_ID, seedDefaultData } from '../../db/seed';
import type { SqlExecutor } from '../../db/types';
import { getAccountById } from '../accounts/service';
import {
  executeMortgagePrepayment,
  listRecurringPlans,
  postMortgageInstallment,
  postSalaryPlan,
  processAutoDueRecurringPlans,
  upsertRecurringPlan,
} from './service';

describe('recurring 周期账单、弹性月薪与房贷服务（真实 SQLite）', () => {
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

  it('固定支出自动入账具备周期幂等性，弹性月薪支持扣款延时入账', async () => {
    await upsertRecurringPlan(db, {
      name: '家庭宽带',
      kind: 'fixed_expense',
      frequency: 'monthly',
      dayOfCycle: 10,
      amountCents: 12_900,
      accountId: DEFAULT_WALLET_ACCOUNT_ID,
      categoryId: 'cat_exp_housing',
      autoPost: true,
      enabled: true,
      lastPostedPeriod: null,
      lastPostedDate: null,
      note: '千兆宽带',
    });

    const run1 = await processAutoDueRecurringPlans(db, '2026-11-12');
    expect(run1.postedCount).toBe(1);
    expect((await getAccountById(db, DEFAULT_WALLET_ACCOUNT_ID))!.balanceCents).toBe(-12_900);

    // 同月再次运行严格幂等，不重复扣款
    const run2 = await processAutoDueRecurringPlans(db, '2026-11-20');
    expect(run2.postedCount).toBe(0);
    expect((await getAccountById(db, DEFAULT_WALLET_ACCOUNT_ID))!.balanceCents).toBe(-12_900);

    // 弹性月薪：延时发放 + 扣款 200 元 + 补贴 500 元
    const salary = await upsertRecurringPlan(db, {
      name: '月薪',
      kind: 'salary',
      frequency: 'monthly',
      dayOfCycle: 10,
      amountCents: 1_000_000,
      accountId: DEFAULT_WALLET_ACCOUNT_ID,
      categoryId: 'cat_inc_salary',
      autoPost: false,
      enabled: true,
      lastPostedPeriod: null,
      lastPostedDate: null,
      note: '',
    });

    const posted = await postSalaryPlan(db, salary.id, {
      occurredOn: '2026-11-15',
      deductionCents: 20_000,
      bonusCents: 50_000,
    });
    expect(posted.transaction.amountCents).toBe(1_030_000);
    expect((await getAccountById(db, DEFAULT_WALLET_ACCOUNT_ID))!.balanceCents).toBe(
      1_030_000 - 12_900
    );
  });

  it('房贷按期扣款与提前还款同步更新剩余本金、剩余期数与账户余额', async () => {
    const mortgagePlan = await upsertRecurringPlan(db, {
      name: '首套房贷',
      kind: 'mortgage',
      frequency: 'monthly',
      dayOfCycle: 20,
      amountCents: 0,
      accountId: DEFAULT_WALLET_ACCOUNT_ID,
      categoryId: 'cat_exp_housing',
      autoPost: false,
      enabled: true,
      lastPostedPeriod: null,
      lastPostedDate: null,
      note: '',
      mortgage: {
        method: 'equal_installment',
        originalPrincipalCents: 100_000_000,
        remainingPrincipalCents: 80_000_000,
        annualRateBps: 360,
        totalMonths: 360,
        remainingMonths: 240,
        lastPaymentDate: '2026-10-20',
      },
    });

    // 1. 记 1 期月供
    const p1 = await postMortgageInstallment(db, mortgagePlan.id, '2026-11-20');
    expect(p1.plan.mortgage!.remainingMonths).toBe(239);
    expect(p1.plan.mortgage!.remainingPrincipalCents).toBeLessThan(80_000_000);

    // 2. 执行提前还款 20 万（缩短期限，占用 10 天利息）
    const prepay = await executeMortgagePrepayment(db, mortgagePlan.id, {
      prepayPrincipalCents: 20_000_000,
      interestDays: 10,
      mode: 'shorten_term',
      occurredOn: '2026-11-30',
    });
    expect(prepay.simulation.accruedInterestCents).toBe(20_000);
    expect(prepay.transaction.amountCents).toBe(20_020_000);
    expect(prepay.plan.mortgage!.remainingMonths).toBeLessThan(200);

    const savedPlans = await listRecurringPlans(db);
    expect(savedPlans[0]?.mortgage?.remainingPrincipalCents).toBe(
      prepay.simulation.newRemainingPrincipalCents
    );
  });
});
