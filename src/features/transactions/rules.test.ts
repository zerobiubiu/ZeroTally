import { describe, expect, it } from 'vitest';
import {
  computeBalanceDeltas,
  computeMonthlySummary,
  groupTransactionsByDay,
  invertBalanceDeltas,
  mergeBalanceDeltas,
  normalizeTransactionInput,
} from './rules';
import type { TransactionListItem } from './types';

function makeTxItem(overrides: Partial<TransactionListItem>): TransactionListItem {
  return {
    id: 'tx_1',
    type: 'expense',
    amountCents: 1000,
    categoryId: 'cat_exp_food',
    accountId: 'acc_wechat',
    toAccountId: null,
    occurredOn: '2026-11-25',
    note: '',
    createdAt: '2026-11-25T10:00:00.000Z',
    updatedAt: '2026-11-25T10:00:00.000Z',
    categoryName: '餐饮美食',
    categoryIcon: 'restaurant-outline',
    categoryColor: '#D97706',
    accountName: '微信零钱',
    toAccountName: null,
    ...overrides,
  };
}

describe('transactions 领域规则', () => {
  it('校验非正金额、非法日期与相同账户自转账', () => {
    expect(() =>
      normalizeTransactionInput({
        type: 'expense',
        amountCents: 0,
        categoryId: 'cat_exp_food',
        accountId: 'acc_wechat',
        toAccountId: null,
        occurredOn: '2026-11-25',
      })
    ).toThrow('大于 0');

    expect(() =>
      normalizeTransactionInput({
        type: 'transfer',
        amountCents: 5000,
        categoryId: null,
        accountId: 'acc_wechat',
        toAccountId: 'acc_wechat',
        occurredOn: '2026-11-25',
      })
    ).toThrow('不能相同');
  });

  it('正确计算、取反与合并余额增量', () => {
    const oldTx = {
      type: 'expense' as const,
      amountCents: 5000,
      accountId: 'acc_wechat',
      toAccountId: null,
    };
    const newTx = {
      type: 'expense' as const,
      amountCents: 8000,
      accountId: 'acc_wechat',
      toAccountId: null,
    };

    const merged = mergeBalanceDeltas([
      ...invertBalanceDeltas(computeBalanceDeltas(oldTx)),
      ...computeBalanceDeltas(newTx),
    ]);
    expect(merged).toEqual([{ accountId: 'acc_wechat', deltaCents: -3000 }]);

    const transferDeltas = computeBalanceDeltas({
      type: 'transfer',
      amountCents: 20000,
      accountId: 'acc_bank',
      toAccountId: 'acc_credit',
    });
    expect(transferDeltas).toEqual([
      { accountId: 'acc_bank', deltaCents: -20000 },
      { accountId: 'acc_credit', deltaCents: 20000 },
    ]);
  });

  it('月度汇总不把转账计入支出或收入，并按日正确分组', () => {
    const items: TransactionListItem[] = [
      makeTxItem({ id: 't1', type: 'expense', amountCents: 4500, occurredOn: '2026-11-25' }),
      makeTxItem({ id: 't2', type: 'income', amountCents: 100000, occurredOn: '2026-11-25' }),
      makeTxItem({
        id: 't3',
        type: 'transfer',
        amountCents: 50000,
        categoryId: null,
        toAccountId: 'acc_alipay',
        occurredOn: '2026-11-24',
      }),
    ];

    const summary = computeMonthlySummary(items);
    expect(summary).toEqual({
      expenseCents: 4500,
      incomeCents: 100000,
      balanceCents: 95500,
      transferCents: 50000,
      transactionCount: 3,
    });

    const sections = groupTransactionsByDay(items);
    expect(sections).toHaveLength(2);
    expect(sections[0]?.occurredOn).toBe('2026-11-25');
    expect(sections[0]?.expenseCents).toBe(4500);
    expect(sections[0]?.incomeCents).toBe(100000);
    expect(sections[1]?.occurredOn).toBe('2026-11-24');
    expect(sections[1]?.expenseCents).toBe(0);
  });
});
