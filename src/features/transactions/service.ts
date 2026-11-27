import type { SqlExecutor } from '../../db/types';
import { getMonthDateRange, getTodayIsoDate, getYearDateRange } from '../../shared/date/date';
import { createId } from '../../shared/id/id';
import { formatCentsPlain } from '../../shared/money/money';
import {
  applyAccountBalanceDelta,
  deleteAccountRow,
  findAccountById,
  findAllAccounts,
  setAccountBalanceExact,
} from '../accounts/repository';
import { validateAccountBalanceCents } from '../accounts/rules';
import type { Account } from '../accounts/types';
import { findCategories, findCategoryById } from '../categories/repository';
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
  normalizeRepaymentInput,
  normalizeTransactionInput,
  normalizeUpdateRepaymentInput,
} from './rules';
import type {
  BalanceDelta,
  CategoryAccountMemory,
  CreateRefundInput,
  CreateRepaymentInput,
  CreateTransactionInput,
  MonthlyLedger,
  PeriodLedger,
  Transaction,
  TransactionListItem,
  UpdateRefundInput,
  UpdateRepaymentInput,
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
    throw new Error(`账户「${sourceAccount.name}」已归档，无法用于新账目`);
  }
  if (!sourceAccount.isSelectable && !keepingOldSource) {
    throw new Error(`账户「${sourceAccount.name}」已设为不可选，无法用于新账目`);
  }

  if (input.type === 'transfer') {
    const targetAccount = await findAccountById(tx, input.toAccountId!);
    if (!targetAccount) {
      throw new Error('所选转入账户不存在');
    }
    const keepingOldTarget = existing && existing.toAccountId === input.toAccountId;
    if (targetAccount.isArchived && !keepingOldTarget) {
      throw new Error(`转入账户「${targetAccount.name}」已归档，无法转入`);
    }
    if (!targetAccount.isSelectable && !keepingOldTarget) {
      throw new Error(`转入账户「${targetAccount.name}」已设为不可选，无法转入`);
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
    if (existing.type === 'repayment') {
      throw new Error('还款记录请使用还款编辑入口修改');
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
      throw new Error(`账户「${targetAccount.name}」已归档，无法作为退款入账账户`);
    }
    if (!targetAccount.isSelectable) {
      throw new Error(`账户「${targetAccount.name}」已设为不可选，无法作为退款入账账户`);
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
      throw new Error(`账户「${targetAccount.name}」已归档，无法作为退款入账账户`);
    }
    if (!targetAccount.isSelectable && normalized.accountId !== existing.accountId) {
      throw new Error(`账户「${targetAccount.name}」已设为不可选，无法作为退款入账账户`);
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
 * 为负债账户创建一笔还款记录，并在同一事务内原子减少负债欠款（余额增加）：
 * - 指定 sourceAccountId（资产账户）时，同时从该资产账户扣减等额余额；
 * - sourceAccountId 为 null 时，仅减少负债欠款，不从任何资产账户扣款，不计入收支统计。
 */
export async function createRepaymentTransaction(
  db: SqlExecutor,
  rawInput: CreateRepaymentInput
): Promise<Transaction> {
  const input = normalizeRepaymentInput(rawInput);
  const now = new Date().toISOString();

  return db.withTransaction(async (tx) => {
    const liabilityAccount = await findAccountById(tx, input.liabilityAccountId);
    if (!liabilityAccount) {
      throw new Error('所选负债账户不存在');
    }
    if (liabilityAccount.kind !== 'liability') {
      throw new Error('仅负债类型账户支持还款操作');
    }
    if (liabilityAccount.isArchived) {
      throw new Error(`负债账户「${liabilityAccount.name}」已归档，请先恢复后再还款`);
    }

    if (input.sourceAccountId) {
      const sourceAccount = await findAccountById(tx, input.sourceAccountId);
      if (!sourceAccount) {
        throw new Error('所选付款资产账户不存在');
      }
      if (sourceAccount.kind !== 'asset') {
        throw new Error('还款资金来源仅支持选择资产账户');
      }
      if (sourceAccount.isArchived) {
        throw new Error(`付款账户「${sourceAccount.name}」已归档，无法用于还款`);
      }
      if (!sourceAccount.isSelectable) {
        throw new Error(`付款账户「${sourceAccount.name}」已设为不可选，无法用于还款`);
      }
    }

    const record: Transaction = {
      id: createId('tx'),
      type: 'repayment',
      amountCents: input.amountCents,
      categoryId: null,
      accountId: input.liabilityAccountId,
      toAccountId: input.sourceAccountId,
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
 * 编辑既有还款记录（支持修改金额、切换资产转入 / 无账户直接还款、调整付款账户与日期备注），
 * 并在同一事务内按净差额原子重算受影响账户余额。
 */
export async function updateRepaymentTransaction(
  db: SqlExecutor,
  repaymentId: string,
  rawInput: UpdateRepaymentInput
): Promise<Transaction> {
  const now = new Date().toISOString();

  return db.withTransaction(async (tx) => {
    const existing = await findTransactionById(tx, repaymentId);
    if (!existing) {
      throw new Error('还款记录不存在或已被删除');
    }
    if (existing.type !== 'repayment') {
      throw new Error('目标记录不是还款记录');
    }

    const input = normalizeUpdateRepaymentInput(existing.accountId, rawInput);

    if (input.sourceAccountId) {
      const sourceAccount = await findAccountById(tx, input.sourceAccountId);
      if (!sourceAccount) {
        throw new Error('所选付款资产账户不存在');
      }
      if (sourceAccount.kind !== 'asset') {
        throw new Error('还款资金来源仅支持选择资产账户');
      }
      const keepingOldSource = existing.toAccountId === input.sourceAccountId;
      if (sourceAccount.isArchived && !keepingOldSource) {
        throw new Error(`付款账户「${sourceAccount.name}」已归档，无法用于还款`);
      }
      if (!sourceAccount.isSelectable && !keepingOldSource) {
        throw new Error(`付款账户「${sourceAccount.name}」已设为不可选，无法用于还款`);
      }
    }

    const updated: Transaction = {
      ...existing,
      amountCents: input.amountCents,
      toAccountId: input.sourceAccountId,
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

export interface SettleAccountBalanceOptions {
  /** 是否生成一笔平账收支记录（默认不生成，仅修改余额） */
  generateRecord?: boolean;
  /** 生成记录时的归属分类；缺省自动落到「其他收入 / 其他支出」 */
  categoryId?: string;
}

/**
 * 平账：将账户净余额直接修改为目标值并返回差额；
 * 可选在同一事务内生成一笔收入 / 支出平账记录（备注「平账(旧 ~ 新)」），保证余额与流水自洽。
 */
export async function settleAccountBalance(
  db: SqlExecutor,
  id: string,
  targetBalanceCents: number,
  options?: SettleAccountBalanceOptions
): Promise<{ account: Account; deltaCents: number; record: Transaction | null }> {
  const validated = validateAccountBalanceCents(targetBalanceCents);

  return db.withTransaction(async (tx) => {
    const existing = await findAccountById(tx, id);
    if (!existing) {
      throw new Error('账户不存在');
    }
    if (existing.isArchived) {
      throw new Error('已归档账户不可平账，请先恢复归档');
    }
    const deltaCents = validated - existing.balanceCents;
    const now = new Date().toISOString();

    let record: Transaction | null = null;
    if (options?.generateRecord && deltaCents !== 0) {
      const type = deltaCents > 0 ? 'income' : 'expense';
      let categoryId = options.categoryId ?? null;
      if (categoryId) {
        const category = await findCategoryById(tx, categoryId);
        if (!category || category.isArchived || category.type !== type) {
          throw new Error('所选平账分类不可用');
        }
      } else {
        const fallbackId = type === 'income' ? 'cat_inc_other' : 'cat_exp_other';
        const categories = await findCategories(tx, { type });
        categoryId =
          categories.find((c) => c.id === fallbackId)?.id ??
          categories.find((c) => c.parentId === null)?.id ??
          null;
        if (!categoryId) {
          throw new Error('缺少可用的收入 / 支出分类，无法生成平账记录');
        }
      }

      record = {
        id: createId('tx'),
        type,
        amountCents: Math.abs(deltaCents),
        categoryId,
        accountId: id,
        toAccountId: null,
        refundOfId: null,
        occurredOn: getTodayIsoDate(),
        note: `平账(${formatCentsPlain(existing.balanceCents)} ~ ${formatCentsPlain(validated)})`,
        createdAt: now,
        updatedAt: now,
      };
      await insertTransactionRow(tx, record);
    }

    await setAccountBalanceExact(tx, id, validated, now);
    const updated = await findAccountById(tx, id);
    if (!updated) {
      throw new Error('平账后读取账户失败');
    }
    return { account: updated, deltaCents, record };
  });
}

/**
 * 删除账户：在同一事务内连带清除该账户全部关联记录（流水 / 退款 / 平账 / 快捷模板）与账户行，
 * 并复用余额增量规则回滚其对其他账户的影响（转账对手方 / 退款入账方）；
 * 本账户自身余额随账户行删除，无需回滚。被删支出的悬空退款一并清除。
 */
export async function deleteAccountWithTransactions(
  db: SqlExecutor,
  id: string
): Promise<{ removedTransactionCount: number }> {
  return db.withTransaction(async (tx) => {
    const existing = await findAccountById(tx, id);
    if (!existing) {
      throw new Error('账户不存在');
    }
    const activeAccounts = await findAllAccounts(tx, false);
    if (!existing.isArchived && activeAccounts.length <= 1) {
      throw new Error('至少需要保留一个可用账户');
    }
    // 删除最后一个可选账户同样会让记一笔无账户可用
    if (!existing.isArchived && existing.isSelectable) {
      const remainingSelectable = activeAccounts.filter(
        (acc) => acc.id !== id && acc.isSelectable
      );
      if (remainingSelectable.length === 0) {
        throw new Error('至少需要保留一个可选账户');
      }
    }

    const now = new Date().toISOString();
    const all = await findAllTransactions(tx);
    const related = all.filter((item) => item.accountId === id || item.toAccountId === id);
    const removedIds = new Set(related.map((item) => item.id));

    // 原支出被连带删除后，其退款若入账到其他账户则成为悬空记录，一并清除并回滚
    const orphanRefunds = all.filter(
      (item) =>
        item.type === 'refund' &&
        item.refundOfId !== null &&
        removedIds.has(item.refundOfId) &&
        !removedIds.has(item.id)
    );
    const removed = [...related, ...orphanRefunds];
    const rawDeltas: BalanceDelta[] = [];
    for (const item of removed) {
      for (const delta of invertBalanceDeltas(computeBalanceDeltas(item))) {
        if (delta.accountId !== id) {
          rawDeltas.push(delta);
        }
      }
    }
    // 先删退款再删原支出，满足 refund_of_id 自引用外键
    for (const item of removed.filter((t) => t.type === 'refund')) {
      await deleteTransactionRow(tx, item.id);
    }
    for (const item of removed.filter((t) => t.type !== 'refund')) {
      await deleteTransactionRow(tx, item.id);
    }
    for (const delta of mergeBalanceDeltas(rawDeltas)) {
      await applyAccountBalanceDelta(tx, delta.accountId, delta.deltaCents, now);
    }

    await tx.run('DELETE FROM quick_templates WHERE account_id = ?', [id]);
    await deleteAccountRow(tx, id);

    return { removedTransactionCount: removed.length };
  });
}

/** 统计账户关联流水笔数（含转账对手方及将被连带清除的跨账户悬空退款），与删除实际清除笔数严格一致 */
export async function countAccountTransactions(db: SqlExecutor, id: string): Promise<number> {
  const row = await db.getFirst<{ count: number }>(
    `SELECT COUNT(*) AS count
     FROM transactions
     WHERE account_id = ?
        OR to_account_id = ?
        OR refund_of_id IN (SELECT id FROM transactions WHERE account_id = ?)`,
    [id, id, id]
  );
  return row?.count ?? 0;
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
