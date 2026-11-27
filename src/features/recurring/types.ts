/**
 * 周期性账单、弹性月薪、房贷（含提前还款）与信用卡账单/还款日领域类型定义
 */

export type RecurringPlanKind = 'fixed_expense' | 'salary' | 'mortgage' | 'credit_card';

export type RecurringFrequency = 'monthly' | 'quarterly' | 'yearly' | 'weekly';

export type MortgageRepaymentMethod = 'equal_installment' | 'equal_principal';

export type MortgagePrepaymentMode = 'reduce_payment' | 'shorten_term';

export interface MortgageDetails {
  /** 还款模式：equal_installment（等额本息）| equal_principal（等额本金） */
  method: MortgageRepaymentMethod;
  /** 原始贷款总额（分） */
  originalPrincipalCents: number;
  /** 当前剩余未还本金（分） */
  remainingPrincipalCents: number;
  /** 年利率（万分比 bps，如 3.45% = 345，杜绝浮点误差） */
  annualRateBps: number;
  /** 原始总期数（月） */
  totalMonths: number;
  /** 当前剩余期数（月） */
  remainingMonths: number;
  /** 上次还款/计息基准日期（YYYY-MM-DD，用于提前还款按日计算应结利息） */
  lastPaymentDate?: string;
}

export interface CreditCardCycleDetails {
  /** 账单日（1~28） */
  statementDay: number;
  /** 还款日（1~28） */
  dueDay: number;
}

export interface RecurringPlan {
  id: string;
  name: string;
  kind: RecurringPlanKind;
  /** 周期频率（月薪 / 房贷 / 信用卡固定为 monthly） */
  frequency: RecurringFrequency;
  /** 每月/每季/每年触发日（1~28，或周几 1~7 当 frequency=weekly） */
  dayOfCycle: number;
  /** 基准金额（分）：固定支出金额 / 基准月薪；房贷自动按剩余本息计算；信用卡读取账户实时欠款 */
  amountCents: number;
  /** 关联账户 ID（支出扣款户 / 月薪入账户 / 房贷扣款户 / 信用卡负债账户） */
  accountId: string;
  /** 关联分类 ID（信用卡模式可为 null） */
  categoryId: string | null;
  /** 是否开启到期自动入账（弹性月薪与信用卡默认关闭，由用户确认或一键触发） */
  autoPost: boolean;
  /** 是否启用本计划 */
  enabled: boolean;
  /** 最近一次已入账的周期键（如 YYYY-MM / YYYY-Q1 / YYYY / YYYY-Wxx），用于严格幂等防重 */
  lastPostedPeriod: string | null;
  /** 最近一次入账日期（YYYY-MM-DD） */
  lastPostedDate: string | null;
  note: string;
  mortgage?: MortgageDetails;
  creditCard?: CreditCardCycleDetails;
  createdAt: string;
  updatedAt: string;
}

export interface MortgageInstallmentPreview {
  /** 本期月供总额（分） */
  paymentCents: number;
  /** 其中偿还本金（分） */
  principalCents: number;
  /** 其中偿还利息（分） */
  interestCents: number;
  /** 还完本期后的剩余本金（分） */
  remainingPrincipalAfterCents: number;
}

export interface MortgagePrepaymentSimulation {
  /** 本次提前归还本金（分） */
  prepayPrincipalCents: number;
  /** 自上次还款日至提前还款日按日计息的应结利息（分） */
  accruedInterestCents: number;
  /** 本次提前还款总需支付（提前还本 + 结清当期占用利息，分） */
  totalCashOutCents: number;
  /** 计息天数 */
  interestDays: number;
  /** 提前还款后的新剩余本金（分） */
  newRemainingPrincipalCents: number;
  /** 提前还款后的新剩余期数（月） */
  newRemainingMonths: number;
  /** 提前还款前原本下月月供（分） */
  previousNextPaymentCents: number;
  /** 提前还款后首月（次月）新月供总额（分） */
  newFirstMonthPaymentCents: number;
  /** 提前还款后首月（次月）本金部分（分） */
  newFirstMonthPrincipalCents: number;
  /** 提前还款后首月（次月）利息部分（分） */
  newFirstMonthInterestCents: number;
  /** 提前还款累计节省总利息估算（分） */
  interestSavedCents: number;
  /** 是否已全额结清房贷 */
  paidOff: boolean;
}

export interface SalaryAdjustmentInput {
  /** 实际到账日期（YYYY-MM-DD，支持提前或延时发放） */
  occurredOn: string;
  /** 当月扣款金额（分，如迟到/请假/个税补扣，>= 0） */
  deductionCents: number;
  /** 当月额外补贴/绩效（分，>= 0） */
  bonusCents: number;
  /** 覆盖备注 */
  extraNote?: string;
}
