import { describe, expect, it } from 'vitest';
import { computeNetWorthSummary, describeAccountBalance } from './rules';
import type { Account } from './types';

function makeAccount(overrides: Partial<Account>): Account {
  return {
    id: 'acc_test',
    name: '测试账户',
    kind: 'asset',
    category: 'bank',
    balanceCents: 0,
    includeInNetWorth: true,
    icon: 'card-outline',
    color: '#0F766E',
    note: '',
    isArchived: false,
    sortOrder: 10,
    createdAt: '2026-11-25T00:00:00.000Z',
    updatedAt: '2026-11-25T00:00:00.000Z',
    ...overrides,
  };
}

describe('accounts 净资产汇总与余额展示规则', () => {
  it('准确计算总资产、总负债与净资产，并处理不计入与已归档账户', () => {
    const accounts: Account[] = [
      makeAccount({ id: 'a1', kind: 'asset', balanceCents: 100000 }), // +1000 元
      makeAccount({ id: 'a2', kind: 'asset', balanceCents: 25000 }), // +250 元
      makeAccount({ id: 'l1', kind: 'liability', balanceCents: -30000 }), // 欠 300 元
      makeAccount({ id: 'l2', kind: 'liability', balanceCents: 5000 }), // 溢缴款 +50 元
      makeAccount({ id: 'a3', kind: 'asset', balanceCents: 500000, includeInNetWorth: false }), // 不计入
      makeAccount({ id: 'a4', kind: 'asset', balanceCents: 80000, isArchived: true }), // 已归档
    ];

    const summary = computeNetWorthSummary(accounts);
    expect(summary.totalAssetsCents).toBe(130000);
    expect(summary.totalLiabilitiesCents).toBe(30000);
    expect(summary.netWorthCents).toBe(100000);
    expect(summary.includedCount).toBe(4);
    expect(summary.excludedCount).toBe(1);
  });

  it('资产账户透支时自动归入总负债', () => {
    const summary = computeNetWorthSummary([
      makeAccount({ id: 'a1', kind: 'asset', balanceCents: -15000 }),
    ]);
    expect(summary.totalAssetsCents).toBe(0);
    expect(summary.totalLiabilitiesCents).toBe(15000);
    expect(summary.netWorthCents).toBe(-15000);
  });

  it('将负债欠款、溢缴款与正常余额转为清晰中文文案', () => {
    expect(describeAccountBalance({ kind: 'liability', balanceCents: -50000 })).toEqual({
      caption: '待还欠款',
      amountText: '¥500.00',
      isDebt: true,
    });
    expect(describeAccountBalance({ kind: 'liability', balanceCents: 1200 })).toEqual({
      caption: '溢缴款',
      amountText: '¥12.00',
      isDebt: false,
    });
    expect(describeAccountBalance({ kind: 'asset', balanceCents: 88800 })).toEqual({
      caption: '当前余额',
      amountText: '¥888.00',
      isDebt: false,
    });
  });
});
