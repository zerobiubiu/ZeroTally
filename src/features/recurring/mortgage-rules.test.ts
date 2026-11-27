import { describe, expect, it } from 'vitest';
import {
  computeNextMortgageInstallment,
  simulateMortgagePrepayment,
} from './mortgage-rules';
import type { MortgageDetails } from './types';

describe('recurring 房贷还款与提前还款精确计算引擎', () => {
  it('等额本息：100 万 30 年 3.5% 月供与首期本息拆解准确', () => {
    const first = computeNextMortgageInstallment({
      method: 'equal_installment',
      remainingPrincipalCents: 100_000_000, // 100 万
      annualRateBps: 350, // 3.50%
      remainingMonths: 360,
    });
    // 理论月供 ¥4,490.45，首期利息 1000000 * 0.035 / 12 = ¥2,916.67，本金 ¥1,573.78
    expect(first.paymentCents).toBe(449_045);
    expect(first.interestCents).toBe(291_667);
    expect(first.principalCents).toBe(157_378);
    expect(first.remainingPrincipalAfterCents).toBe(100_000_000 - 157_378);
  });

  it('等额本金：100 万 30 年 3.6% 首月固定还本 + 递减利息准确', () => {
    const m1 = computeNextMortgageInstallment({
      method: 'equal_principal',
      remainingPrincipalCents: 100_000_000,
      annualRateBps: 360, // 3.60% -> 月利率 0.3%
      remainingMonths: 360,
    });
    expect(m1.principalCents).toBe(277_778);
    expect(m1.interestCents).toBe(300_000);
    expect(m1.paymentCents).toBe(577_778);

    const m2 = computeNextMortgageInstallment({
      method: 'equal_principal',
      remainingPrincipalCents: m1.remainingPrincipalAfterCents,
      annualRateBps: 360,
      remainingMonths: 359,
    });
    expect(m2.interestCents).toBeLessThan(m1.interestCents);
    expect(m2.paymentCents).toBeLessThan(m1.paymentCents);
  });

  it('提前还款（减少月供 vs 缩短期限）：精确计算结息、次月新月供与节省总利息', () => {
    const mortgage: MortgageDetails = {
      method: 'equal_installment',
      originalPrincipalCents: 100_000_000,
      remainingPrincipalCents: 80_000_000, // 剩 80 万
      annualRateBps: 360, // 3.6%（日利率 0.01%）
      totalMonths: 360,
      remainingMonths: 240, // 剩 20 年
    };

    // 提前还 20 万，占用 15 天利息：200,000 * 0.036 / 360 * 15 = 300 元 = 30,000 分
    const reducePayment = simulateMortgagePrepayment({
      mortgage,
      prepayPrincipalCents: 20_000_000,
      interestDays: 15,
      mode: 'reduce_payment',
    });
    expect(reducePayment.accruedInterestCents).toBe(30_000);
    expect(reducePayment.totalCashOutCents).toBe(20_030_000);
    expect(reducePayment.newRemainingPrincipalCents).toBe(60_000_000);
    expect(reducePayment.newRemainingMonths).toBe(240);
    expect(reducePayment.newFirstMonthPaymentCents).toBeLessThan(
      reducePayment.previousNextPaymentCents
    );
    expect(reducePayment.interestSavedCents).toBeGreaterThan(7_000_000);

    // 缩短期限：期数明显减少且节省利息比减少月供更多
    const shortenTerm = simulateMortgagePrepayment({
      mortgage,
      prepayPrincipalCents: 20_000_000,
      interestDays: 15,
      mode: 'shorten_term',
    });
    expect(shortenTerm.newRemainingMonths).toBeLessThan(200);
    expect(shortenTerm.interestSavedCents).toBeGreaterThan(reducePayment.interestSavedCents);
    expect(shortenTerm.paidOff).toBe(false);

    // 全额结清
    const payoff = simulateMortgagePrepayment({
      mortgage,
      prepayPrincipalCents: 80_000_000,
      interestDays: 10,
      mode: 'reduce_payment',
    });
    expect(payoff.paidOff).toBe(true);
    expect(payoff.newRemainingPrincipalCents).toBe(0);
    expect(payoff.newFirstMonthPaymentCents).toBe(0);
  });
});
