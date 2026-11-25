import { isValidIsoDate } from '../../shared/date/date';
import { MAX_AMOUNT_CENTS } from '../../shared/money/money';
import type {
  BalanceDelta,
  CreateTransactionInput,
  DailyTransactionSection,
  MonthlySummary,
  Transaction,
  TransactionListItem,
} from './types';

export const MAX_TRANSACTION_NOTE_LENGTH = 120;

export function normalizeTransactionInput(input: CreateTransactionInput): CreateTransactionInput {
  if (
    !Number.isSafeInteger(input.amountCents) ||
    input.amountCents <= 0 ||
    input.amountCents > MAX_AMOUNT_CENTS
  ) {
    throw new Error('请输入大于 0 且在有效范围内的金额');
  }

  if (!isValidIsoDate(input.occurredOn)) {
    throw new Error('交易日期格式无效，应为 YYYY-MM-DD');
  }

  if (!input.accountId.trim()) {
    throw new Error('请选择账户');
  }

  const note = (input.note ?? '').trim();
  if (note.length > MAX_TRANSACTION_NOTE_LENGTH) {
    throw new Error(`备注不能超过 ${MAX_TRANSACTION_NOTE_LENGTH} 个字符`);
  }

  if (input.type === 'transfer') {
    if (!input.toAccountId || !input.toAccountId.trim()) {
      throw new Error('请选择转入账户');
    }
    if (input.toAccountId === input.accountId) {
      throw new Error('转出账户与转入账户不能相同');
    }
    return {
      ...input,
      categoryId: null,
      toAccountId: input.toAccountId,
      note,
    };
  }

  if (!input.categoryId || !input.categoryId.trim()) {
    throw new Error('请选择收支分类');
  }

  return {
    ...input,
    categoryId: input.categoryId,
    toAccountId: null,
    note,
  };
}

/**
 * 权威余额联动规则：根据交易类型与金额计算受影响账户的余额增量。
 * - expense：支出账户扣减 amountCents
 * - income：收入账户增加 amountCents
 * - transfer：转出账户扣减 amountCents，转入账户增加 amountCents
 */
export function computeBalanceDeltas(
  tx: Pick<Transaction, 'type' | 'amountCents' | 'accountId' | 'toAccountId'>
): BalanceDelta[] {
  switch (tx.type) {
    case 'expense':
      return [{ accountId: tx.accountId, deltaCents: -tx.amountCents }];
    case 'income':
      return [{ accountId: tx.accountId, deltaCents: tx.amountCents }];
    case 'transfer':
      if (!tx.toAccountId) {
        throw new Error('转账记录缺少转入账户');
      }
      return [
        { accountId: tx.accountId, deltaCents: -tx.amountCents },
        { accountId: tx.toAccountId, deltaCents: tx.amountCents },
      ];
    default: {
      const exhaustive: never = tx.type;
      throw new Error(`不支持的交易类型：${String(exhaustive)}`);
    }
  }
}

/**
 * 取反余额增量，用于编辑或删除账目时回滚历史影响。
 */
export function invertBalanceDeltas(deltas: readonly BalanceDelta[]): BalanceDelta[] {
  return deltas.map((item) => ({
    accountId: item.accountId,
    deltaCents: -item.deltaCents,
  }));
}

/**
 * 合并同一账户的多笔增量，剔除净变动为 0 的冗余更新。
 */
export function mergeBalanceDeltas(deltas: readonly BalanceDelta[]): BalanceDelta[] {
  const byAccount = new Map<string, number>();
  for (const item of deltas) {
    byAccount.set(item.accountId, (byAccount.get(item.accountId) ?? 0) + item.deltaCents);
  }

  const merged: BalanceDelta[] = [];
  for (const [accountId, deltaCents] of byAccount.entries()) {
    if (deltaCents !== 0) {
      merged.push({ accountId, deltaCents });
    }
  }
  return merged;
}

/**
 * 权威月度统计规则：
 * - 转账仅在账户间迁移资金，不计入当月支出或收入。
 * - 月度结余 = 当月收入 - 当月支出。
 */
export function computeMonthlySummary(items: readonly Transaction[]): MonthlySummary {
  let expenseCents = 0;
  let incomeCents = 0;
  let transferCents = 0;

  for (const item of items) {
    if (item.type === 'expense') {
      expenseCents += item.amountCents;
    } else if (item.type === 'income') {
      incomeCents += item.amountCents;
    } else {
      transferCents += item.amountCents;
    }
  }

  return {
    expenseCents,
    incomeCents,
    balanceCents: incomeCents - expenseCents,
    transferCents,
    transactionCount: items.length,
  };
}

/**
 * 将已按 occurredOn DESC 排序的交易流水按日分组，并计算每日收支小计。
 */
export function groupTransactionsByDay(
  items: readonly TransactionListItem[]
): DailyTransactionSection[] {
  const sections: DailyTransactionSection[] = [];
  const sectionMap = new Map<string, DailyTransactionSection>();

  for (const item of items) {
    let section = sectionMap.get(item.occurredOn);
    if (!section) {
      section = {
        occurredOn: item.occurredOn,
        expenseCents: 0,
        incomeCents: 0,
        items: [],
      };
      sectionMap.set(item.occurredOn, section);
      sections.push(section);
    }

    section.items.push(item);
    if (item.type === 'expense') {
      section.expenseCents += item.amountCents;
    } else if (item.type === 'income') {
      section.incomeCents += item.amountCents;
    }
  }

  return sections;
}
