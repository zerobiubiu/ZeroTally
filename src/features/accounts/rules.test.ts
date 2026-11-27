import { describe, expect, it } from 'vitest';
import {
  computeNetWorthSummary,
  describeAccountBalance,
  formatAccountCardCopyText,
} from './rules';
import type { Account } from './types';

function makeAccount(overrides: Partial<Account>): Account {
  return {
    id: 'acc_test',
    name: '测试账户',
    kind: 'asset',
    category: 'bank',
    balanceCents: 0,
    includeInNetWorth: true,
    includeInTotalAssets: true,
    isSelectable: true,
    icon: 'card-outline',
    color: '#0F766E',
    note: '',
    cardNumber: '',
    bankName: '',
    bankBranch: '',
    openedOn: '',
    isArchived: false,
    sortOrder: 10,
    createdAt: '2026-11-25T00:00:00.000Z',
    updatedAt: '2026-11-25T00:00:00.000Z',
    ...overrides,
  };
}

describe('accounts 净资产汇总与余额展示规则', () => {
  it('三开关独立生效：总资产 / 净资产 / 总负债分别按各自开关统计，归档一律排除', () => {
    const accounts: Account[] = [
      makeAccount({ id: 'a1', kind: 'asset', balanceCents: 100000 }), // +1000 元
      makeAccount({ id: 'a2', kind: 'asset', balanceCents: 25000 }), // +250 元
      makeAccount({ id: 'l1', kind: 'liability', balanceCents: -30000 }), // 欠 300 元
      makeAccount({ id: 'l2', kind: 'liability', balanceCents: 5000 }), // 溢缴款 +50 元
      makeAccount({
        id: 'a3',
        kind: 'asset',
        balanceCents: 500000,
        includeInNetWorth: false,
        includeInTotalAssets: false,
      }), // 双关：完全不计入
      makeAccount({ id: 'a4', kind: 'asset', balanceCents: 80000, isArchived: true }), // 已归档
      makeAccount({
        id: 'a5',
        kind: 'asset',
        balanceCents: 40000,
        includeInTotalAssets: false,
      }), // 仅关总资产：净资产仍含 +400 元
    ];

    const summary = computeNetWorthSummary(accounts);
    expect(summary.totalAssetsCents).toBe(130000);
    expect(summary.totalLiabilitiesCents).toBe(30000);
    expect(summary.netWorthCents).toBe(140000);
    expect(summary.includedCount).toBe(5);
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

  it('银行卡一键复制文本按字段汇总并自动省略空项', () => {
    expect(
      formatAccountCardCopyText({
        name: '招商工资卡',
        cardNumber: '6225 8801 2345 6789',
        bankName: '招商银行',
        bankBranch: '深圳科技园支行',
        openedOn: '2021-06-01',
      })
    ).toBe(
      '名称：招商工资卡\n银行：招商银行\n开户行：深圳科技园支行\n卡号：6225 8801 2345 6789\n开户日期：2021-06-01'
    );

    expect(
      formatAccountCardCopyText({
        name: '备用卡',
        cardNumber: '6217 0000',
        bankName: '',
        bankBranch: '',
        openedOn: '',
      })
    ).toBe('名称：备用卡\n卡号：6217 0000');
  });
});
