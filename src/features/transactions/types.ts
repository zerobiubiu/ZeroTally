/**
 * 支出、收入与转账交易领域类型定义
 */

export type TransactionType = 'expense' | 'income' | 'transfer' | 'refund' | 'repayment';

export interface Transaction {
  id: string;
  type: TransactionType;
  /** 交易金额（恒为正整数，单位：分） */
  amountCents: number;
  /** 支出、收入或退款归属分类 ID（退款沿用原支出分类）；转账与还款为 null */
  categoryId: string | null;
  /** 支出账户 / 收入账户 / 转账转出账户 / 退款入账账户 / 还款负债账户 ID */
  accountId: string;
  /** 转账转入账户 ID 或还款资金来源资产账户 ID（无账户直接还款为 null） */
  toAccountId: string | null;
  /** 关联的原支出交易 ID；仅 refund 类型非空 */
  refundOfId: string | null;
  /** 交易日期（YYYY-MM-DD） */
  occurredOn: string;
  note: string;
  createdAt: string;
  updatedAt: string;
}

/** 附带分类名称/图标、账户名称及已退汇总金额的流水展示视图 */
export interface TransactionListItem extends Transaction {
  categoryName: string | null;
  categoryIcon: string | null;
  categoryColor: string | null;
  /** 所选分类为二级时其一级分类信息；一级分类或转账为 null */
  categoryParentId: string | null;
  categoryParentName: string | null;
  categoryParentIcon: string | null;
  categoryParentColor: string | null;
  accountName: string;
  toAccountName: string | null;
  /** 该笔支出累计已退款金额（分）；非支出或未退款为 0 */
  refundedCents: number;
}

export interface CreateTransactionInput {
  type: Exclude<TransactionType, 'refund' | 'repayment'>;
  amountCents: number;
  categoryId: string | null;
  accountId: string;
  toAccountId: string | null;
  occurredOn: string;
  note?: string;
}

export type UpdateTransactionInput = CreateTransactionInput;

export interface CreateRepaymentInput {
  /** 被还款的负债账户 ID */
  liabilityAccountId: string;
  /** 资金来源资产账户 ID；传 null 表示不使用转入，直接无账户支出还款 */
  sourceAccountId: string | null;
  /** 还款金额（分，须 > 0 且在系统安全范围内） */
  amountCents: number;
  /** 还款日期（YYYY-MM-DD） */
  occurredOn: string;
  note?: string;
}

export interface UpdateRepaymentInput {
  /** 资金来源资产账户 ID；传 null 表示无账户直接还款 */
  sourceAccountId: string | null;
  amountCents: number;
  occurredOn: string;
  note?: string;
}

export interface CreateRefundInput {
  /** 被退款的原支出交易 ID */
  originalTransactionId: string;
  /** 本次退款金额（分，须 > 0，不限制金额上限以兼容含运费/补偿金场景） */
  amountCents: number;
  /** 退款退回的资金账户 ID */
  accountId: string;
  /** 退款日期（YYYY-MM-DD） */
  occurredOn: string;
  note?: string;
}

export interface UpdateRefundInput {
  amountCents: number;
  accountId: string;
  occurredOn: string;
  note?: string;
}

export interface MonthlySummary {
  /** 当月净支出（原支出扣减当月退款，单位：分） */
  expenseCents: number;
  incomeCents: number;
  balanceCents: number;
  transferCents: number;
  /** 当月退款总额（单位：分） */
  refundCents: number;
  transactionCount: number;
}

export interface DailyTransactionSection {
  occurredOn: string;
  /** 当日支出总额（单位：分） */
  expenseCents: number;
  /** 当日收入总额（含当日退款，单位：分） */
  incomeCents: number;
  refundCents: number;
  items: TransactionListItem[];
}

export interface MonthlyLedger {
  monthKey: string;
  summary: MonthlySummary;
  sections: DailyTransactionSection[];
}

export type LedgerPeriodMode = 'month' | 'year' | 'all';

export interface PeriodLedger {
  mode: LedgerPeriodMode;
  periodKey: string;
  summary: MonthlySummary;
  sections: DailyTransactionSection[];
}

export interface BalanceDelta {
  accountId: string;
  deltaCents: number;
}

/**
 * 基于历史收支流水实时派生的「分类 → 最近使用活跃账户」记忆快照（仅统计未停用账户，排除转账与退款）
 */
export interface CategoryAccountMemory {
  /** 精确分类 ID（一级或二级）最近一次使用的活跃账户 ID */
  byCategoryId: Readonly<Record<string, string>>;
  /** 一级大类 ID（聚合该一级分类自身及其下属全部二级分类）最近一次使用的活跃账户 ID */
  byRootCategoryId: Readonly<Record<string, string>>;
  /** 收支类型（expense / income）全局最近一次使用的活跃账户 ID */
  byType: Partial<Readonly<Record<'expense' | 'income', string>>>;
}
