import { describe, expect, it } from 'vitest';
import {
  computeReimbursementSummary,
  DEFAULT_REIMBURSEMENT_CONFIG,
  parseReimbursementConfig,
  parseReimbursementRecords,
  validateReimbursementSettleInput,
} from './rules';

describe('reimbursement 可选报销追踪纯规则', () => {
  it('默认关闭且能安全解析合法与异常配置 JSON', () => {
    expect(parseReimbursementConfig(null)).toEqual(DEFAULT_REIMBURSEMENT_CONFIG);
    expect(parseReimbursementConfig('{bad')).toEqual(DEFAULT_REIMBURSEMENT_CONFIG);
    expect(
      parseReimbursementConfig(JSON.stringify({ enabled: true, defaultSettlementMode: 'income' }))
    ).toEqual({ enabled: true, defaultSettlementMode: 'income' });
  });

  it('过滤非法与重复记录并准确汇总待报销/已报销整数分总额', () => {
    const raw = JSON.stringify([
      {
        transactionId: 'tx_1',
        status: 'pending',
        expectedCents: 12_500,
        settledCents: 0,
        settlementMode: null,
        settlementTransactionId: null,
        settledOn: null,
        settledAccountId: null,
        note: '差旅高铁',
        createdAt: '2026-11-20T08:00:00.000Z',
        updatedAt: '2026-11-20T08:00:00.000Z',
      },
      {
        transactionId: 'tx_1',
        status: 'pending',
        expectedCents: 99_999,
      },
      {
        transactionId: 'tx_2',
        status: 'reimbursed',
        expectedCents: 8_000,
        settledCents: 7_500,
        settlementMode: 'refund',
        settlementTransactionId: 'tx_ref_2',
        settledOn: '2026-11-25',
        settledAccountId: 'acc_bank',
        note: '',
        createdAt: '2026-11-18T08:00:00.000Z',
        updatedAt: '2026-11-25T08:00:00.000Z',
      },
      { transactionId: '', status: 'pending', expectedCents: 100 },
    ]);

    const parsed = parseReimbursementRecords(raw);
    expect(parsed).toHaveLength(2);
    expect(computeReimbursementSummary(parsed)).toEqual({
      pendingCount: 1,
      pendingTotalCents: 12_500,
      reimbursedCount: 1,
      reimbursedTotalCents: 7_500,
    });
  });

  it('校验报销入账金额、日期与收款账户边界', () => {
    expect(() =>
      validateReimbursementSettleInput({
        amountCents: 0,
        occurredOn: '2026-11-26',
        accountId: 'acc_1',
        mode: 'refund',
      })
    ).toThrow('大于 0');

    expect(() =>
      validateReimbursementSettleInput({
        amountCents: 5000,
        occurredOn: '2026-99-99',
        accountId: 'acc_1',
        mode: 'refund',
      })
    ).toThrow('日期格式');
  });
});
