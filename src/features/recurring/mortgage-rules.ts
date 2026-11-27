import type {
  MortgageDetails,
  MortgageInstallmentPreview,
  MortgagePrepaymentMode,
  MortgagePrepaymentSimulation,
  MortgageRepaymentMethod,
} from './types';

/**
 * 将年利率（万分比 bps，如 3.45% = 345）转换为月利率小数。
 */
export function annualBpsToMonthlyRate(annualRateBps: number): number {
  return Math.max(0, annualRateBps) / 10_000 / 12;
}

/**
 * 计算下一期月供拆解（严格以整数「分」输出）：
 * - equal_installment（等额本息）：月供 = P * r * (1+r)^n / ((1+r)^n - 1)
 * - equal_principal（等额本金）：当期本金 = round(P / n)，当期利息 = round(P * r)
 */
export function computeNextMortgageInstallment(params: {
  method: MortgageRepaymentMethod;
  remainingPrincipalCents: number;
  annualRateBps: number;
  remainingMonths: number;
}): MortgageInstallmentPreview {
  const P = Math.max(0, Math.trunc(params.remainingPrincipalCents));
  const n = Math.max(0, Math.trunc(params.remainingMonths));
  if (P === 0 || n === 0) {
    return {
      paymentCents: 0,
      principalCents: 0,
      interestCents: 0,
      remainingPrincipalAfterCents: 0,
    };
  }

  const r = annualBpsToMonthlyRate(params.annualRateBps);
  const interestCents = Math.round(P * r);

  if (n === 1) {
    return {
      paymentCents: P + interestCents,
      principalCents: P,
      interestCents,
      remainingPrincipalAfterCents: 0,
    };
  }

  if (params.method === 'equal_principal') {
    const principalCents = Math.min(P, Math.round(P / n));
    return {
      paymentCents: principalCents + interestCents,
      principalCents,
      interestCents,
      remainingPrincipalAfterCents: Math.max(0, P - principalCents),
    };
  }

  // 等额本息
  if (r === 0) {
    const principalCents = Math.min(P, Math.round(P / n));
    return {
      paymentCents: principalCents,
      principalCents,
      interestCents: 0,
      remainingPrincipalAfterCents: Math.max(0, P - principalCents),
    };
  }

  const factor = Math.pow(1 + r, n);
  const paymentCents = Math.round((P * r * factor) / (factor - 1));
  const principalCents = Math.min(P, Math.max(0, paymentCents - interestCents));
  return {
    paymentCents: principalCents + interestCents,
    principalCents,
    interestCents,
    remainingPrincipalAfterCents: Math.max(0, P - principalCents),
  };
}

/**
 * 估算剩余全部期数的总利息支出（分），用于计算提前还款节省的总利息。
 */
export function computeTotalRemainingInterestCents(params: {
  method: MortgageRepaymentMethod;
  remainingPrincipalCents: number;
  annualRateBps: number;
  remainingMonths: number;
}): number {
  let remP = Math.max(0, Math.trunc(params.remainingPrincipalCents));
  let remN = Math.max(0, Math.trunc(params.remainingMonths));
  let totalInterest = 0;

  while (remP > 0 && remN > 0) {
    const next = computeNextMortgageInstallment({
      method: params.method,
      remainingPrincipalCents: remP,
      annualRateBps: params.annualRateBps,
      remainingMonths: remN,
    });
    totalInterest += next.interestCents;
    remP = next.remainingPrincipalAfterCents;
    remN -= 1;
  }
  return totalInterest;
}

/**
 * 估算在“缩短期限（保持原月供相近）”模式下的新剩余期数（月）。
 */
function solveShortenedMonths(params: {
  method: MortgageRepaymentMethod;
  newPrincipalCents: number;
  annualRateBps: number;
  targetPaymentCents: number;
  oldRemainingMonths: number;
}): number {
  const P = params.newPrincipalCents;
  const r = annualBpsToMonthlyRate(params.annualRateBps);
  const M = Math.max(1, params.targetPaymentCents);

  if (P <= 0) {
    return 0;
  }

  if (params.method === 'equal_principal') {
    // 等额本金缩短期限：保持原每月固定本金近似不变 -> 新期数 = ceil(新本金 / 原每期本金)
    const oldPrincipalPerMonth = Math.max(
      1,
      Math.round((M - Math.round(P * r)) || P / Math.max(1, params.oldRemainingMonths))
    );
    const est = Math.ceil(P / oldPrincipalPerMonth);
    return Math.max(1, Math.min(params.oldRemainingMonths, est));
  }

  if (r === 0) {
    return Math.max(1, Math.min(params.oldRemainingMonths, Math.ceil(P / M)));
  }

  // 等额本息反解期数：n = ceil(-ln(1 - P*r/M) / ln(1 + r))
  const ratio = (P * r) / M;
  if (ratio >= 0.999) {
    return Math.max(1, params.oldRemainingMonths);
  }
  const n = Math.ceil(-Math.log(1 - ratio) / Math.log(1 + r));
  return Math.max(1, Math.min(params.oldRemainingMonths, n));
}

/**
 * 房贷提前还款精确试算引擎：
 * - 支持「减少月供（期限不变）」与「缩短期限（月供近似不变）」两种银行主流模式；
 * - 按银行通行实际占用天数（年利率 / 360 × 天数）计算提前还款当日应结清利息；
 * - 精准给出提前还款后首月（次月）月供总额、本金、利息以及累计节省利息。
 */
export function simulateMortgagePrepayment(params: {
  mortgage: MortgageDetails;
  prepayPrincipalCents: number;
  /** 距离上次还款日的计息天数（0~31，银行常见按天计息） */
  interestDays: number;
  mode: MortgagePrepaymentMode;
}): MortgagePrepaymentSimulation {
  const { mortgage, mode } = params;
  const currentP = Math.max(0, Math.trunc(mortgage.remainingPrincipalCents));
  const currentN = Math.max(0, Math.trunc(mortgage.remainingMonths));
  const prepayP = Math.min(currentP, Math.max(0, Math.trunc(params.prepayPrincipalCents)));
  const interestDays = Math.max(0, Math.min(365, Math.trunc(params.interestDays)));

  const beforeNext = computeNextMortgageInstallment({
    method: mortgage.method,
    remainingPrincipalCents: currentP,
    annualRateBps: mortgage.annualRateBps,
    remainingMonths: currentN,
  });

  const beforeTotalInterest = computeTotalRemainingInterestCents({
    method: mortgage.method,
    remainingPrincipalCents: currentP,
    annualRateBps: mortgage.annualRateBps,
    remainingMonths: currentN,
  });

  // 银行通行日利率 = 年利率 / 360，按实际占用天数计息（针对全部未还本金或提前还本部分，这里采用国内主流按提前归还本金占用天数结息）
  const dailyRate = Math.max(0, mortgage.annualRateBps) / 10_000 / 360;
  const accruedInterestCents = Math.round(prepayP * dailyRate * interestDays);
  const newRemainingPrincipalCents = Math.max(0, currentP - prepayP);
  const paidOff = newRemainingPrincipalCents === 0;

  let newRemainingMonths = paidOff ? 0 : currentN;
  if (!paidOff && mode === 'shorten_term') {
    if (mortgage.method === 'equal_principal') {
      const oldPrincipalPerMonth = Math.max(1, Math.round(currentP / Math.max(1, currentN)));
      newRemainingMonths = Math.max(1, Math.min(currentN, Math.ceil(newRemainingPrincipalCents / oldPrincipalPerMonth)));
    } else {
      newRemainingMonths = solveShortenedMonths({
        method: mortgage.method,
        newPrincipalCents: newRemainingPrincipalCents,
        annualRateBps: mortgage.annualRateBps,
        targetPaymentCents: beforeNext.paymentCents,
        oldRemainingMonths: currentN,
      });
    }
  }

  const afterNext = paidOff
    ? {
        paymentCents: 0,
        principalCents: 0,
        interestCents: 0,
        remainingPrincipalAfterCents: 0,
      }
    : computeNextMortgageInstallment({
        method: mortgage.method,
        remainingPrincipalCents: newRemainingPrincipalCents,
        annualRateBps: mortgage.annualRateBps,
        remainingMonths: newRemainingMonths,
      });

  const afterTotalInterest = paidOff
    ? accruedInterestCents
    : accruedInterestCents +
      computeTotalRemainingInterestCents({
        method: mortgage.method,
        remainingPrincipalCents: newRemainingPrincipalCents,
        annualRateBps: mortgage.annualRateBps,
        remainingMonths: newRemainingMonths,
      });

  return {
    prepayPrincipalCents: prepayP,
    accruedInterestCents,
    totalCashOutCents: prepayP + accruedInterestCents,
    interestDays,
    newRemainingPrincipalCents,
    newRemainingMonths,
    previousNextPaymentCents: beforeNext.paymentCents,
    newFirstMonthPaymentCents: afterNext.paymentCents,
    newFirstMonthPrincipalCents: afterNext.principalCents,
    newFirstMonthInterestCents: afterNext.interestCents,
    interestSavedCents: Math.max(0, beforeTotalInterest - afterTotalInterest),
    paidOff,
  };
}
