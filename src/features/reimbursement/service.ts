import type { SqlExecutor } from '../../db/types';
import { getTodayIsoDate } from '../../shared/date/date';
import { listCategories } from '../categories/service';
import {
  findTransactionDetailById,
  findTransactionsPageByDateRange,
} from '../transactions/repository';
import { createRefundTransaction, createTransaction } from '../transactions/service';
import type { TransactionListItem } from '../transactions/types';
import {
  getReimbursementConfig,
  listRawReimbursementRecords,
  removeReimbursementRecord,
  saveRawReimbursementRecords,
  saveReimbursementConfig,
  upsertPendingReimbursementRecord,
} from './repository';
import {
  computeReimbursementSummary,
  validateReimbursementExpectedCents,
  validateReimbursementSettleInput,
} from './rules';
import type {
  ReimbursementConfig,
  ReimbursementRecord,
  ReimbursementSettlementMode,
  ReimbursementSummary,
} from './types';

export { getReimbursementConfig, saveReimbursementConfig };

export interface ReimbursementItemView {
  record: ReimbursementRecord;
  transaction: TransactionListItem;
}

export interface ReimbursementOverview {
  config: ReimbursementConfig;
  summary: ReimbursementSummary;
  pending: ReimbursementItemView[];
  reimbursed: ReimbursementItemView[];
}

/**
 * 读取报销追踪总览：按实时账目水合每条报销记录，并自动清理原支出已被删除的残留索引。
 */
export async function getReimbursementOverview(db: SqlExecutor): Promise<ReimbursementOverview> {
  const [config, rawRecords] = await Promise.all([
    getReimbursementConfig(db),
    listRawReimbursementRecords(db),
  ]);

  const aliveRecords: ReimbursementRecord[] = [];
  const views: ReimbursementItemView[] = [];
  let pruned = false;

  for (const record of rawRecords) {
    const tx = await findTransactionDetailById(db, record.transactionId);
    if (!tx || tx.type !== 'expense') {
      pruned = true;
      continue;
    }
    aliveRecords.push(record);
    views.push({ record, transaction: tx });
  }

  if (pruned) {
    await saveRawReimbursementRecords(db, aliveRecords);
  }

  const pending = views
    .filter((v) => v.record.status === 'pending')
    .sort((a, b) => b.transaction.occurredOn.localeCompare(a.transaction.occurredOn));
  const reimbursed = views
    .filter((v) => v.record.status === 'reimbursed')
    .sort((a, b) => (b.record.settledOn ?? '').localeCompare(a.record.settledOn ?? ''));

  return {
    config,
    summary: computeReimbursementSummary(aliveRecords),
    pending,
    reimbursed,
  };
}

/**
 * 获取近期尚未加入报销追踪的支出流水，供用户在报销中心一键挑选。
 */
export async function listRecentUnmarkedExpenses(
  db: SqlExecutor,
  limit = 40
): Promise<TransactionListItem[]> {
  const [records, page] = await Promise.all([
    listRawReimbursementRecords(db),
    findTransactionsPageByDateRange(db, { limit: Math.max(limit * 2, 60), offset: 0 }),
  ]);
  const trackedIds = new Set(records.map((r) => r.transactionId));
  return page.items
    .filter((item) => item.type === 'expense' && !trackedIds.has(item.id))
    .slice(0, limit);
}

/**
 * 将一笔已有支出标记为「待报销」（仅影响报销追踪表，不改动原支出余额）。
 */
export async function markExpenseForReimbursement(
  db: SqlExecutor,
  params: {
    transactionId: string;
    expectedCents?: number;
    note?: string;
  }
): Promise<ReimbursementRecord> {
  const tx = await findTransactionDetailById(db, params.transactionId);
  if (!tx) {
    throw new Error('找不到对应的支出记录');
  }
  if (tx.type !== 'expense') {
    throw new Error('仅支持将支出记录标记为待报销');
  }
  const defaultExpected = Math.max(1, tx.amountCents - tx.refundedCents);
  const expectedCents = validateReimbursementExpectedCents(params.expectedCents ?? defaultExpected);

  return upsertPendingReimbursementRecord(db, {
    transactionId: tx.id,
    expectedCents,
    note: params.note ?? tx.note,
  });
}

/**
 * 取消一条待报销标记（不影响已有交易流水与余额）。
 */
export async function unmarkExpenseReimbursement(
  db: SqlExecutor,
  transactionId: string
): Promise<void> {
  await removeReimbursementRecord(db, transactionId);
}

/**
 * 执行报销到账核销：
 * - mode='refund'：调用 createRefundTransaction 生成关联退款，自动抵扣原支出统计且增加收款账户余额；
 * - mode='income'：调用 createTransaction 生成一笔收入记录，计入指定或默认收入分类并增加收款账户余额。
 */
export async function settleReimbursement(
  db: SqlExecutor,
  params: {
    transactionId: string;
    amountCents: number;
    accountId: string;
    mode: ReimbursementSettlementMode;
    occurredOn?: string;
    incomeCategoryId?: string | null;
    note?: string;
  }
): Promise<ReimbursementRecord> {
  const occurredOn = params.occurredOn ?? getTodayIsoDate();
  validateReimbursementSettleInput({
    amountCents: params.amountCents,
    occurredOn,
    accountId: params.accountId,
    mode: params.mode,
  });

  const records = await listRawReimbursementRecords(db);
  const idx = records.findIndex((item) => item.transactionId === params.transactionId);
  if (idx < 0) {
    throw new Error('未找到对应的待报销条目');
  }
  const current = records[idx]!;
  if (current.status === 'reimbursed') {
    throw new Error('该条目已完成报销核销，请勿重复操作');
  }

  const originalTx = await findTransactionDetailById(db, params.transactionId);
  if (!originalTx || originalTx.type !== 'expense') {
    throw new Error('原支出记录已不存在，无法执行报销核销');
  }

  const settleNote =
    (params.note ?? '').trim() ||
    (originalTx.note.trim() ? `报销：${originalTx.note.trim()}` : `报销：${originalTx.categoryName ?? '支出'}`);

  let settlementTransactionId: string;

  if (params.mode === 'refund') {
    const refundTx = await createRefundTransaction(db, {
      originalTransactionId: originalTx.id,
      amountCents: params.amountCents,
      accountId: params.accountId,
      occurredOn,
      note: settleNote,
    });
    settlementTransactionId = refundTx.id;
  } else {
    let categoryId = params.incomeCategoryId ?? null;
    if (!categoryId) {
      const incomeCats = await listCategories(db, { type: 'income', includeArchived: false });
      const preferred =
        incomeCats.find((c) => c.id === 'cat_inc_reimburse') ??
        incomeCats.find((c) => c.name.includes('报销')) ??
        incomeCats.find((c) => c.id === 'cat_inc_other') ??
        incomeCats[0];
      if (!preferred) {
        throw new Error('缺少可用的收入分类，请先启用至少一个收入分类');
      }
      categoryId = preferred.id;
    }

    const incomeTx = await createTransaction(db, {
      type: 'income',
      amountCents: params.amountCents,
      categoryId,
      accountId: params.accountId,
      toAccountId: null,
      occurredOn,
      note: settleNote,
    });
    settlementTransactionId = incomeTx.id;
  }

  const now = new Date().toISOString();
  const updated: ReimbursementRecord = {
    ...current,
    status: 'reimbursed',
    settledCents: params.amountCents,
    settlementMode: params.mode,
    settlementTransactionId,
    settledOn: occurredOn,
    settledAccountId: params.accountId,
    updatedAt: now,
  };

  const next = [...records];
  next[idx] = updated;
  await saveRawReimbursementRecords(db, next);
  return updated;
}
