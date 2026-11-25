import type { SqlExecutor } from '../../db/types';
import { getMonthDateRange } from '../../shared/date/date';
import { createId } from '../../shared/id/id';
import { applyAccountBalanceDelta, findAccountById } from '../accounts/repository';
import { findCategoryById } from '../categories/repository';
import {
  deleteTransactionRow,
  findTransactionById,
  findTransactionDetailById,
  findTransactionsByAccountId,
  findTransactionsByDateRange,
  insertTransactionRow,
  updateTransactionRow,
} from './repository';
import {
  computeBalanceDeltas,
  computeMonthlySummary,
  groupTransactionsByDay,
  invertBalanceDeltas,
  mergeBalanceDeltas,
  normalizeTransactionInput,
} from './rules';
import type {
  CreateTransactionInput,
  MonthlyLedger,
  Transaction,
  TransactionListItem,
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
 * 编辑既有账目：在同一事务内先回滚原记录对余额的影响，再应用新记录的余额增量。
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

    await verifyTransactionReferences(tx, input, existing);

    const updated: Transaction = {
      ...existing,
      type: input.type,
      amountCents: input.amountCents,
      categoryId: input.categoryId,
      accountId: input.accountId,
      toAccountId: input.toAccountId,
      occurredOn: input.occurredOn,
      note: input.note ?? '',
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
 */
export async function deleteTransaction(db: SqlExecutor, id: string): Promise<void> {
  const now = new Date().toISOString();

  await db.withTransaction(async (tx) => {
    const existing = await findTransactionById(tx, id);
    if (!existing) {
      throw new Error('账目不存在或已被删除');
    }

    await deleteTransactionRow(tx, id);

    const rollbackDeltas = invertBalanceDeltas(computeBalanceDeltas(existing));
    for (const delta of rollbackDeltas) {
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
 * 查询单个账户关联的最近流水（包括作为支出/收入账户以及转账转出/转入账户）。
 */
export async function listAccountTransactions(
  db: SqlExecutor,
  accountId: string,
  limit = 100
): Promise<TransactionListItem[]> {
  return findTransactionsByAccountId(db, accountId, limit);
}
