export type ReimbursementStatus = 'pending' | 'reimbursed';

export type ReimbursementSettlementMode = 'refund' | 'income';

export interface ReimbursementConfig {
  /** 是否开启报销追踪（默认关闭，对普通记账零干扰） */
  enabled: boolean;
  /** 默认报销入账口径：refund=关联退款抵扣原支出（推荐）；income=独立记为报销收入 */
  defaultSettlementMode: ReimbursementSettlementMode;
}

export interface ReimbursementRecord {
  /** 关联的原支出交易 ID */
  transactionId: string;
  status: ReimbursementStatus;
  /** 预计报销金额（正整数分） */
  expectedCents: number;
  /** 实际已报销入账金额（整数分，未报销时为 0） */
  settledCents: number;
  settlementMode: ReimbursementSettlementMode | null;
  /** 报销入账生成的退款或收入交易 ID */
  settlementTransactionId: string | null;
  settledOn: string | null;
  settledAccountId: string | null;
  note: string;
  createdAt: string;
  updatedAt: string;
}

export interface ReimbursementSummary {
  pendingCount: number;
  pendingTotalCents: number;
  reimbursedCount: number;
  reimbursedTotalCents: number;
}
