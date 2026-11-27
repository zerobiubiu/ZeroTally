import { describe, expect, it } from 'vitest';
import {
  computeCreditCardCycleStatus,
  diffIsoDays,
  getPeriodKeyForDate,
  isPlanDueForDate,
  resolveSalaryPosting,
} from './rules';
import type { RecurringPlan } from './types';

function makePlan(overrides: Partial<RecurringPlan>): RecurringPlan {
  return {
    id: 'rec_1',
    name: '房租',
    kind: 'fixed_expense',
    frequency: 'monthly',
    dayOfCycle: 5,
    amountCents: 350_000,
    accountId: 'acc_bank',
    categoryId: 'cat_exp_housing',
    autoPost: true,
    enabled: true,
    lastPostedPeriod: null,
    lastPostedDate: null,
    note: '',
    createdAt: '2026-11-01T00:00:00.000Z',
    updatedAt: '2026-11-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('recurring 周期规则、弹性月薪与信用卡还款日', () => {
  it('按周期键幂等判定是否到期', () => {
    expect(getPeriodKeyForDate('2026-11-27', 'monthly')).toBe('2026-11');
    expect(getPeriodKeyForDate('2026-11-27', 'quarterly')).toBe('2026-Q4');
    expect(getPeriodKeyForDate('2026-11-27', 'yearly')).toBe('2026');

    const plan = makePlan({ dayOfCycle: 10 });
    expect(isPlanDueForDate(plan, '2026-11-09')).toBe(false);
    expect(isPlanDueForDate(plan, '2026-11-10')).toBe(true);
    expect(isPlanDueForDate({ ...plan, lastPostedPeriod: '2026-11' }, '2026-11-15')).toBe(false);
    expect(isPlanDueForDate({ ...plan, lastPostedPeriod: '2026-11' }, '2026-12-10')).toBe(true);
  });

  it('弹性月薪支持提前/延时发放与当月扣款/补贴实时核算', () => {
    const salaryPlan = makePlan({
      name: '月薪',
      kind: 'salary',
      dayOfCycle: 10,
      amountCents: 1_500_000, // 15,000 元
      note: '税后基本',
    });

    const delayed = resolveSalaryPosting({
      plan: salaryPlan,
      adjustment: {
        occurredOn: '2026-11-12',
        deductionCents: 30_000, // 扣款 300
        bonusCents: 50_000, // 补贴 500
      },
    });
    expect(delayed.netAmountCents).toBe(1_520_000);
    expect(delayed.timingTag).toBe('delayed');
    expect(delayed.note).toContain('延时发放');
    expect(delayed.note).toContain('扣款');
    expect(delayed.note).toContain('加项');

    const early = resolveSalaryPosting({
      plan: salaryPlan,
      adjustment: {
        occurredOn: '2026-11-08',
        deductionCents: 0,
        bonusCents: 0,
      },
    });
    expect(early.timingTag).toBe('early');
    expect(early.netAmountCents).toBe(1_500_000);
  });

  it('信用卡账单日与还款日倒计时计算准确', () => {
    const status = computeCreditCardCycleStatus({ statementDay: 5, dueDay: 25 }, '2026-11-22');
    expect(status.daysUntilDue).toBe(3);
    expect(status.dueSoon).toBe(true);
    expect(status.daysUntilStatement).toBe(13); // 11-22 -> 12-05
    expect(diffIsoDays('2026-11-10', '2026-11-25')).toBe(15);
  });
});
