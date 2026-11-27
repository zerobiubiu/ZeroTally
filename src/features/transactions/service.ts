import type { SqlExecutor } from '../../db/types';
import { getMonthDateRange, getYearDateRange } from '../../shared/date/date';
import { createId } from '../../shared/id/id';
import { applyAccountBalanceDelta, findAccountById } from '../accounts/repository';
import { findCategoryById } from '../categories/repository';
import {
  deleteRefundsByOriginalId,
  deleteTransactionRow,
  findAllTransactions,
  findCategoryAccountMemory,
  findRefundDetailsByOriginalId,
  findRefundRowsByOriginalId,
  findTransactionById,
  findTransactionDetailById,
  findTransactionsByAccountId,
  findTransactionsByDateRange,
  insertTransactionRow,
  sumRefundsByOriginalId,
  updateRefundsCategoryByOriginalId,
  updateTransactionRow,
} from './repository';
import {
  computeBalanceDeltas,
  computeMonthlySummary,
  groupTransactionsByDay,
  invertBalanceDeltas,
  mergeBalanceDeltas,
  normalizeRefundInput,
  normalizeTransactionInput,
} from './rules';
import type {
  BalanceDelta,
  CategoryAccountMemory,
  CreateRefundInput,
  CreateTransactionInput,
  MonthlyLedger,
  PeriodLedger,
  Transaction,
  TransactionListItem,
  UpdateRefundInput,
  UpdateTransactionInput,
} from './types';

async function verifyTransactionReferences(
  tx: SqlExecutor,
  input: CreateTransactionInput,
  existing?: Transaction
): Promise<void> {
  const sourceAccount = await findAccountById(tx, input.accountId);
  if (!sourceAccount) {
    throw new Error('所选账户不存在');
  }
  const keepingOldSource = existing && existing.accountId === input.accountId;
  if (sourceAccount.isArchived && !keepingOldSource) {
    throw new Error(`账户「${sourceAccount.name}」已停用，无法用于新账目`);
  }

  if (input.type === 'transfer') {
    const targetAccount = await findAccountById(tx, input.toAccountId!);
    if (!targetAccount) {
      throw new Error('所选转入账户不存在');
    }
    const keepingOldTarget = existing && existing.toAccountId === input.toAccountId;
    if (targetAccount.isArchived && !keepingOldTarget) {
      throw new Error(`转入账户「${targetAccount.name}」已停用，无法转入`);
    }
    return;
  }

  const category = await findCategoryById(tx, input.categoryId!);
  if (!category) {
    throw new Error('所选分类不存在');
  }
  if (category.type !== input.type) {
    throw new Error('分类类型与当前记账类型不匹配');
  }
  const keepingOldCategory = existing && existing.categoryId === input.categoryId;
  if (category.isArchived && !keepingOldCategory) {
    throw new Error(`分类「${category.name}」已停用，请改选其他分类`);
  }
}

/**
 * 新增一笔支出、收入或转账，并在同一事务内原子更新受影响账户余额。
 */
export async function createTransaction(
  db: SqlExecutor,
  rawInput: CreateTransactionInput
): Promise<Transaction> {
  const input = normalizeTransactionInput(rawInput);
  const now = new Date().toISOString();

  return db.withTransaction(async (tx) => {
    await verifyTransactionReferences(tx, input);

    const record: Transaction = {
      id: createId('tx'),
      type: input.type,
      amountCents: input.amountCents,
      categoryId: input.categoryId,
      accountId: input.accountId,
      toAccountId: input.toAccountId,
      refundOfId: null,
      occurredOn: input.occurredOn,
      note: input.note ?? '',
      createdAt: now,
      updatedAt: now,
    };

    await insertTransactionRow(tx, record);

    const deltas = computeBalanceDeltas(record);
    for (const delta of deltas) {
      await applyAccountBalanceDelta(tx, delta.accountId, delta.deltaCents, now);
    }

    return record;
  });
}

/**
 * 编辑既有支出、收入或转账：在同一事务内回滚原余额影响并应用新增量。
 * 若原支出已存在关联退款，则禁止切换类型、禁止将金额改小至已退总额以下，并同步更新关联退款的归属分类。
 */
export async function updateTransaction(
  db: SqlExecutor,
  id: string,
  rawInput: UpdateTransactionInput
): Promise<Transaction> {
  const input = normalizeTransactionInput(rawInput);
  const now = new Date().toISOString();

  return db.withTransaction(async (tx) => {
    const existing = await findTransactionById(tx, id);
    if (!existing) {
      throw new Error('账目不存在或已被删除');
    }
    if (existing.type === 'refund') {
      throw new Error('退款记录请使用退款编辑入口修改');
    }

    if (existing.type === 'expense') {
      const refundedCents = await sumRefundsByOriginalId(tx, id);
      if (refundedCents > 0 && input.type !== 'expense') {
        throw new Error('该支出存在关联退款，请先删除退款后再更改类型');
      }
    }

    await verifyTransactionReferences(tx, input, existing);

    const updated: Transaction = {
      ...existing,
      type: input.type,
      amountCents: input.amountCents,
      categoryId: input.categoryId,
      accountId: input.accountId,
      toAccountId: input.toAccountId,
      refundOfId: null,
      occurredOn: input.occurredOn,
      note: input.note ?? '',
      updatedAt: now,
    };

    await updateTransactionRow(tx, updated);

    if (existing.type === 'expense' && updated.categoryId && updated.categoryId !== existing.categoryId) {
      await updateRefundsCategoryByOriginalId(tx, id, updated.categoryId, now);
    }

    const oldDeltas = computeBalanceDeltas(existing);
    const newDeltas = computeBalanceDeltas(updated);
    const netDeltas = mergeBalanceDeltas([...invertBalanceDeltas(oldDeltas), ...newDeltas]);

    for (const delta of netDeltas) {
      await applyAccountBalanceDelta(tx, delta.accountId, delta.deltaCents, now);
    }

    return updated;
  });
}

/**
 * 为一笔支出记录创建关联退款（支持全额、部分、多次及含运费/补偿金的超额退款，只需金额 > 0），
 * 并在同一事务内将退款金额增加至指定入账账户。
 */
export async function createRefundTransaction(
  db: SqlExecutor,
  rawInput: CreateRefundInput
): Promise<Transaction> {
  const normalized = normalizeRefundInput(rawInput);
  const now = new Date().toISOString();

  return db.withTransaction(async (tx) => {
    const original = await findTransactionById(tx, rawInput.originalTransactionId);
    if (!original) {
      throw new Error('原支出记录不存在或已被删除');
    }
    if (original.type !== 'expense' || !original.categoryId) {
      throw new Error('仅支出记录支持退款');
    }

    const targetAccount = await findAccountById(tx, normalized.accountId);
    if (!targetAccount) {
      throw new Error('所选退款账户不存在');
    }
    if (targetAccount.isArchived) {
      throw new Error(`账户「${targetAccount.name}」已停用，无法作为退款入账账户`);
    }

    const record: Transaction = {
      id: createId('tx'),
      type: 'refund',
      amountCents: normalized.amountCents,
      categoryId: original.categoryId,
      accountId: normalized.accountId,
      toAccountId: null,
      refundOfId: original.id,
      occurredOn: normalized.occurredOn,
      note: normalized.note ?? '',
      createdAt: now,
      updatedAt: now,
    };

    await insertTransactionRow(tx, record);

    const deltas = computeBalanceDeltas(record);
    for (const delta of deltas) {
      await applyAccountBalanceDelta(tx, delta.accountId, delta.deltaCents, now);
    }

    return record;
  });
}

/**
 * 编辑既有退款记录（金额、退回账户、日期、备注），并在同一事务内重算账户余额（不设金额上限）。
 */
export async function updateRefundTransaction(
  db: SqlExecutor,
  refundId: string,
  rawInput: UpdateRefundInput
): Promise<Transaction> {
  const normalized = normalizeRefundInput(rawInput);
  const now = new Date().toISOString();

  return db.withTransaction(async (tx) => {
    const existing = await findTransactionById(tx, refundId);
    if (!existing) {
      throw new Error('退款记录不存在或已被删除');
    }
    if (existing.type !== 'refund' || !existing.refundOfId) {
      throw new Error('目标记录不是退款记录');
    }

    const original = await findTransactionById(tx, existing.refundOfId);
    if (!original) {
      throw new Error('原支出记录不存在');
    }

    const targetAccount = await findAccountById(tx, normalized.accountId);
    if (!targetAccount) {
      throw new Error('所选退款账户不存在');
    }
    if (targetAccount.isArchived && normalized.accountId !== existing.accountId) {
      throw new Error(`账户「${targetAccount.name}」已停用，无法作为退款入账账户`);
    }

    const updated: Transaction = {
      ...existing,
      amountCents: normalized.amountCents,
      accountId: normalized.accountId,
      occurredOn: normalized.occurredOn,
      note: normalized.note ?? '',
      updatedAt: now,
    };

    await updateTransactionRow(tx, updated);

    const oldDeltas = computeBalanceDeltas(existing);
    const newDeltas = computeBalanceDeltas(updated);
    const netDeltas = mergeBalanceDeltas([...invertBalanceDeltas(oldDeltas), ...newDeltas]);
    for (const delta of netDeltas) {
      await applyAccountBalanceDelta(tx, delta.accountId, delta.deltaCents, now);
    }

    return updated;
  });
}

/**
 * 删除账目并在同一事务内回滚受影响账户余额。
 * 若删除的支出记录存在关联退款，将在同一事务内连带删除全部关联退款并合并回滚全部相关账户余额。
 */
export async function deleteTransaction(db: SqlExecutor, id: string): Promise<void> {
  const now = new Date().toISOString();

  await db.withTransaction(async (tx) => {
    const existing = await findTransactionById(tx, id);
    if (!existing) {
      throw new Error('账目不存在或已被删除');
    }

    const linkedRefunds =
      existing.type === 'expense' ? await findRefundRowsByOriginalId(tx, id) : [];

    if (linkedRefunds.length > 0) {
      await deleteRefundsByOriginalId(tx, id);
    }
    await deleteTransactionRow(tx, id);

    const rawDeltas: BalanceDelta[] = [...invertBalanceDeltas(computeBalanceDeltas(existing))];
    for (const refund of linkedRefunds) {
      rawDeltas.push(...invertBalanceDeltas(computeBalanceDeltas(refund)));
    }
    const netDeltas = mergeBalanceDeltas(rawDeltas);

    for (const delta of netDeltas) {
      await applyAccountBalanceDelta(tx, delta.accountId, delta.deltaCents, now);
    }
  });
}

export async function getTransactionById(
  db: SqlExecutor,
  id: string
): Promise<TransactionListItem | null> {
  return findTransactionDetailById(db, id);
}

export async function listTransactionRefunds(
  db: SqlExecutor,
  originalTransactionId: string
): Promise<TransactionListItem[]> {
  return findRefundDetailsByOriginalId(db, originalTransactionId);
}

/**
 * 获取指定月份（YYYY-MM）的账单汇总与按日分组流水。
 */
export async function getMonthlyLedger(
  db: SqlExecutor,
  monthKey: string
): Promise<MonthlyLedger> {
  const { start, end } = getMonthDateRange(monthKey);
  const items = await findTransactionsByDateRange(db, start, end);
  return {
    monthKey,
    summary: computeMonthlySummary(items),
    sections: groupTransactionsByDay(items),
  };
}

/**
 * 获取指定年份（如 2026）的全年账单汇总与按日分组流水。
 */
export async function getYearlyLedger(db: SqlExecutor, year: number): Promise<PeriodLedger> {
  const { start, end } = getYearDateRange(year);
  const items = await findTransactionsByDateRange(db, start, end);
  return {
    mode: 'year',
    periodKey: String(year),
    summary: computeMonthlySummary(items),
    sections: groupTransactionsByDay(items),
  };
}

/**
 * 获取全部历史时间的账单汇总与按日分组流水。
 */
export async function getAllLedger(db: SqlExecutor): Promise<PeriodLedger> {
  const items = await findAllTransactions(db);
  return {
    mode: 'all',
    periodKey: 'all',
    summary: computeMonthlySummary(items),
    sections: groupTransactionsByDay(items),
  };
}

/**
 * 查询单个账户关联的最近流水（包括作为支出/收入/退款账户以及转账转出/转入账户）。
 */
export async function listAccountTransactions(
  db: SqlExecutor,
  accountId: string,
  limit = 100
): Promise<TransactionListItem[]> {
  return findTransactionsByAccountId(db, accountId, limit);
}

/**
 * 获取基于历史收支流水派生的分类账户记忆快照，用于记账页按分类自动带出上次使用账户。
 */
export async function getCategoryAccountMemory(
  db: SqlExecutor
): Promise<CategoryAccountMemory> {
  return findCategoryAccountMemory(db);
}
