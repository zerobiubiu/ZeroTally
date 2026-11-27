import { describe, expect, it } from 'vitest';
import {
  computeBalanceDeltas,
  computeMonthlySummary,
  EMPTY_CATEGORY_ACCOUNT_MEMORY,
  groupTransactionsByDay,
  invertBalanceDeltas,
  mergeBalanceDeltas,
  normalizeTransactionInput,
  recordCategoryAccountMemory,
  resolveRememberedAccountId,
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
    refundOfId: null,
    occurredOn: '2026-11-25',
    note: '',
    createdAt: '2026-11-25T10:00:00.000Z',
    updatedAt: '2026-11-25T10:00:00.000Z',
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
      refundOfId: null,
    };
    const newTx = {
      type: 'expense' as const,
      amountCents: 8000,
      accountId: 'acc_wechat',
      toAccountId: null,
      refundOfId: null,
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
      refundCents: 0,
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

  it('单日分组小计将退款归入当日收入且不扣减当日支出，同时保持月度净支出统计不变', () => {
    const items: TransactionListItem[] = [
      makeTxItem({ id: 'e1', type: 'expense', amountCents: 900, occurredOn: '2026-11-27' }),
      makeTxItem({ id: 'i1', type: 'income', amountCents: 2000, occurredOn: '2026-11-27' }),
      makeTxItem({
        id: 'r1',
        type: 'refund',
        amountCents: 100,
        refundOfId: 'e1',
        occurredOn: '2026-11-27',
      }),
      makeTxItem({
        id: 'r2',
        type: 'refund',
        amountCents: 500,
        refundOfId: 'e1',
        occurredOn: '2026-11-26',
      }),
    ];

    // 月度汇总口径不变：退款仍抵扣月度净支出，不计入月度收入
    const summary = computeMonthlySummary(items);
    expect(summary.expenseCents).toBe(300);
    expect(summary.incomeCents).toBe(2000);
    expect(summary.refundCents).toBe(600);
    expect(summary.balanceCents).toBe(1700);

    // 单日分组小计：只算收和支，退款归入当日收入
    const sections = groupTransactionsByDay(items);
    expect(sections).toHaveLength(2);
    expect(sections[0]).toMatchObject({
      occurredOn: '2026-11-27',
      expenseCents: 900,
      incomeCents: 2100,
      refundCents: 100,
    });
    expect(sections[1]).toMatchObject({
      occurredOn: '2026-11-26',
      expenseCents: 0,
      incomeCents: 500,
      refundCents: 500,
    });
  });

  it('分类账户记忆按精确分类 -> 所属大类 -> 同收支类型 -> 默认首活跃账户四层回退', () => {
    const categories = [
      { id: 'cat_food', parentId: null },
      { id: 'cat_food_lunch', parentId: 'cat_food' },
      { id: 'cat_food_coffee', parentId: 'cat_food' },
      { id: 'cat_health', parentId: null },
      { id: 'cat_salary', parentId: null },
    ];
    const accounts = [
      { id: 'acc_cash', isArchived: false },
      { id: 'acc_wechat', isArchived: false },
      { id: 'acc_alipay', isArchived: false },
      { id: 'acc_bank', isArchived: false },
      { id: 'acc_old_card', isArchived: true },
    ];
    const memory = {
      byCategoryId: {
        cat_food_lunch: 'acc_wechat',
        cat_salary: 'acc_old_card', // 已停用，需跳过
      },
      byRootCategoryId: {
        cat_food: 'acc_alipay',
      },
      byType: {
        expense: 'acc_bank',
      },
    };

    // 第 1 层：精确分类记忆命中
    expect(
      resolveRememberedAccountId({
        txType: 'expense',
        categoryId: 'cat_food_lunch',
        categories,
        accounts,
        memory,
      })
    ).toBe('acc_wechat');

    // 第 2 层：新二级分类自动回退到所属一级大类记忆
    expect(
      resolveRememberedAccountId({
        txType: 'expense',
        categoryId: 'cat_food_coffee',
        categories,
        accounts,
        memory,
      })
    ).toBe('acc_alipay');

    // 第 2 层：一级大类自身无直接记录时，回退至其大类聚合记忆
    expect(
      resolveRememberedAccountId({
        txType: 'expense',
        categoryId: 'cat_food',
        categories,
        accounts,
        memory,
      })
    ).toBe('acc_alipay');

    // 第 3 层：从未记账的新大类回退到同收支类型最近账户
    expect(
      resolveRememberedAccountId({
        txType: 'expense',
        categoryId: 'cat_health',
        categories,
        accounts,
        memory,
      })
    ).toBe('acc_bank');

    // 第 4 层：记忆命中已停用账户且收入无其他历史记录时，退回首个活跃账户
    expect(
      resolveRememberedAccountId({
        txType: 'income',
        categoryId: 'cat_salary',
        categories,
        accounts,
        memory,
      })
    ).toBe('acc_cash');

    // 乐观更新：保存并再记后立即刷新精确分类、所属大类与收支类型记忆
    const updated = recordCategoryAccountMemory(EMPTY_CATEGORY_ACCOUNT_MEMORY, {
      txType: 'expense',
      categoryId: 'cat_food_coffee',
      accountId: 'acc_alipay',
      categories,
    });
    expect(updated.byCategoryId.cat_food_coffee).toBe('acc_alipay');
    expect(updated.byRootCategoryId.cat_food).toBe('acc_alipay');
    expect(updated.byType.expense).toBe('acc_alipay');
  });
});
