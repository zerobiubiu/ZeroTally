import { isValidIsoDate } from '../../shared/date/date';
import { MAX_AMOUNT_CENTS } from '../../shared/money/money';
import type { Account } from '../accounts/types';
import type { Category } from '../categories/types';
import type {
  BalanceDelta,
  CategoryAccountMemory,
  CreateTransactionInput,
  DailyTransactionSection,
  MonthlySummary,
  Transaction,
  TransactionListItem,
  UpdateRefundInput,
} from './types';

export const MAX_TRANSACTION_NOTE_LENGTH = 120;

export function normalizeRefundInput(input: UpdateRefundInput): UpdateRefundInput {
  if (
    !Number.isSafeInteger(input.amountCents) ||
    input.amountCents <= 0 ||
    input.amountCents > MAX_AMOUNT_CENTS
  ) {
    throw new Error('请输入大于 0 且在有效范围内的退款金额');
  }

  if (!isValidIsoDate(input.occurredOn)) {
    throw new Error('退款日期格式无效，应为 YYYY-MM-DD');
  }

  if (!input.accountId.trim()) {
    throw new Error('请选择退款入账账户');
  }

  const note = (input.note ?? '').trim();
  if (note.length > MAX_TRANSACTION_NOTE_LENGTH) {
    throw new Error(`备注不能超过 ${MAX_TRANSACTION_NOTE_LENGTH} 个字符`);
  }

  return {
    amountCents: input.amountCents,
    accountId: input.accountId,
    occurredOn: input.occurredOn,
    note,
  };
}

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
 * - refund：退款入账账户增加 amountCents（资金退回）
 * - transfer：转出账户扣减 amountCents，转入账户增加 amountCents
 */
export function computeBalanceDeltas(
  tx: Pick<Transaction, 'type' | 'amountCents' | 'accountId' | 'toAccountId'>
): BalanceDelta[] {
  switch (tx.type) {
    case 'expense':
      return [{ accountId: tx.accountId, deltaCents: -tx.amountCents }];
    case 'income':
    case 'refund':
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
 * - 退款抵扣当月支出（不虚增收入），月度净支出 = 支出 - 退款。
 * - 月度结余 = 当月收入 - 当月净支出。
 */
export function computeMonthlySummary(items: readonly Transaction[]): MonthlySummary {
  let expenseCents = 0;
  let incomeCents = 0;
  let transferCents = 0;
  let refundCents = 0;

  for (const item of items) {
    if (item.type === 'expense') {
      expenseCents += item.amountCents;
    } else if (item.type === 'refund') {
      expenseCents -= item.amountCents;
      refundCents += item.amountCents;
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
    refundCents,
    transactionCount: items.length,
  };
}

/**
 * 将已按 occurredOn DESC 排序的交易流水按日分组，并计算每日支出与收入小计：
 * - 单日仅统计「支」与「收」（不展示「退」），当日退款归入当日收入小计，不影响月度/周期净支出统计。
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
        refundCents: 0,
        items: [],
      };
      sectionMap.set(item.occurredOn, section);
      sections.push(section);
    }

    section.items.push(item);
    if (item.type === 'expense') {
      section.expenseCents += item.amountCents;
    } else if (item.type === 'refund') {
      section.incomeCents += item.amountCents;
      section.refundCents += item.amountCents;
    } else if (item.type === 'income') {
      section.incomeCents += item.amountCents;
    }
  }

  return sections;
}

export const EMPTY_CATEGORY_ACCOUNT_MEMORY: CategoryAccountMemory = {
  byCategoryId: {},
  byRootCategoryId: {},
  byType: {},
};

export interface ResolveRememberedAccountParams {
  txType: 'expense' | 'income';
  categoryId: string | null;
  categories: readonly Pick<Category, 'id' | 'parentId'>[];
  accounts: readonly Pick<Account, 'id' | 'isArchived' | 'isSelectable'>[];
  memory: CategoryAccountMemory;
}

/**
 * 权威收支分类账户记忆解析规则（四层回退，始终优先返回活跃可用账户）：
 * 1. 精确分类记忆：该分类（一级或二级）最近一次使用的活跃账户；
 * 2. 所属大类兜底：回退至所属一级大类（含自身及同级兄弟子分类）最近一次使用的活跃账户；
 * 3. 同收支类型兜底：回退至同类型（expense / income）全局最近一次使用的活跃账户；
 * 4. 默认首账户：无历史匹配时返回第 1 个活跃账户。
 */
export function resolveRememberedAccountId({
  txType,
  categoryId,
  categories,
  accounts,
  memory,
}: ResolveRememberedAccountParams): string {
  const activeAccountIds = new Set<string>();
  let firstActiveAccountId = '';
  for (const acc of accounts) {
    if (!acc.isArchived && acc.isSelectable) {
      activeAccountIds.add(acc.id);
      if (!firstActiveAccountId) {
        firstActiveAccountId = acc.id;
      }
    }
  }

  const pickIfActive = (candidateId: string | undefined): string | null =>
    candidateId && activeAccountIds.has(candidateId) ? candidateId : null;

  if (categoryId) {
    const exactMatch = pickIfActive(memory.byCategoryId[categoryId]);
    if (exactMatch) {
      return exactMatch;
    }

    const currentCat = categories.find((c) => c.id === categoryId);
    const rootId = currentCat?.parentId ?? categoryId;
    const rootMatch = pickIfActive(memory.byRootCategoryId[rootId]);
    if (rootMatch) {
      return rootMatch;
    }
  }

  const typeMatch = pickIfActive(memory.byType[txType]);
  if (typeMatch) {
    return typeMatch;
  }

  return firstActiveAccountId || accounts[0]?.id || '';
}

/**
 * 在「保存并再记」后立即在内存中同步刚写入的收支记忆，避免异步刷新窗口内切换分类读到旧值。
 */
export function recordCategoryAccountMemory(
  memory: CategoryAccountMemory,
  params: {
    txType: 'expense' | 'income';
    categoryId: string;
    accountId: string;
    categories: readonly Pick<Category, 'id' | 'parentId'>[];
  }
): CategoryAccountMemory {
  const currentCat = params.categories.find((c) => c.id === params.categoryId);
  const rootId = currentCat?.parentId ?? params.categoryId;
  return {
    byCategoryId: {
      ...memory.byCategoryId,
      [params.categoryId]: params.accountId,
    },
    byRootCategoryId: {
      ...memory.byRootCategoryId,
      [rootId]: params.accountId,
    },
    byType: {
      ...memory.byType,
      [params.txType]: params.accountId,
    },
  };
}
