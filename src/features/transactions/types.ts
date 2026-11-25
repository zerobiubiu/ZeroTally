/**
 * 支出、收入与转账交易领域类型定义
 */

export type TransactionType = 'expense' | 'income' | 'transfer';

export interface Transaction {
  id: string;
  type: TransactionType;
  /** 交易金额（恒为正整数，单位：分） */
  amountCents: number;
  /** 支出或收入归属分类 ID；转账为 null */
  categoryId: string | null;
  /** 支出账户 / 收入账户 / 转账转出账户 ID */
  accountId: string;
  /** 转账转入账户 ID；非转账为 null */
  toAccountId: string | null;
  /** 交易日期（YYYY-MM-DD） */
  occurredOn: string;
  note: string;
  createdAt: string;
  updatedAt: string;
}

/** 附带分类名称/图标及账户名称的流水展示视图 */
export interface TransactionListItem extends Transaction {
  categoryName: string | null;
  categoryIcon: string | null;
  categoryColor: string | null;
  accountName: string;
  toAccountName: string | null;
}

export interface CreateTransactionInput {
  type: TransactionType;
  amountCents: number;
  categoryId: string | null;
  accountId: string;
  toAccountId: string | null;
  occurredOn: string;
  note?: string;
}

export type UpdateTransactionInput = CreateTransactionInput;

export interface MonthlySummary {
  expenseCents: number;
  incomeCents: number;
  balanceCents: number;
  transferCents: number;
  transactionCount: number;
}

export interface DailyTransactionSection {
  occurredOn: string;
  expenseCents: number;
  incomeCents: number;
  items: TransactionListItem[];
}

export interface MonthlyLedger {
  monthKey: string;
  summary: MonthlySummary;
  sections: DailyTransactionSection[];
}

export interface BalanceDelta {
  accountId: string;
  deltaCents: number;
}
