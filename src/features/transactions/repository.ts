import type { SqlExecutor } from '../../db/types';
import { buildTransactionSearchWhere, normalizeSearchPagination } from './search-rules';
import type {
  CategoryAccountMemory,
  Transaction,
  TransactionListItem,
  TransactionSearchFilter,
  TransactionSearchPage,
  TransactionType,
} from './types';

interface TransactionRow {
  id: string;
  type: TransactionType;
  amount_cents: number;
  category_id: string | null;
  account_id: string;
  to_account_id: string | null;
  refund_of_id: string | null;
  occurred_on: string;
  note: string;
  created_at: string;
  updated_at: string;
}

interface TransactionJoinRow extends TransactionRow {
  category_name: string | null;
  category_icon: string | null;
  category_color: string | null;
  category_parent_id: string | null;
  category_parent_name: string | null;
  category_parent_icon: string | null;
  category_parent_color: string | null;
  account_name: string;
  to_account_name: string | null;
  refunded_cents: number;
}

interface SumRow {
  total: number | null;
}

interface SearchSummaryRow {
  total_count: number;
  expense_cents: number | null;
  income_cents: number | null;
  refund_cents: number | null;
}

interface CategoryAccountMemoryRow {
  type: 'expense' | 'income';
  category_id: string;
  root_category_id: string;
  account_id: string;
}

function mapTransactionRow(row: TransactionRow): Transaction {
  return {
    id: row.id,
    type: row.type,
    amountCents: row.amount_cents,
    categoryId: row.category_id,
    accountId: row.account_id,
    toAccountId: row.to_account_id,
    refundOfId: row.refund_of_id,
    occurredOn: row.occurred_on,
    note: row.note,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapTransactionJoinRow(row: TransactionJoinRow): TransactionListItem {
  return {
    ...mapTransactionRow(row),
    categoryName: row.category_name,
    categoryIcon: row.category_icon,
    categoryColor: row.category_color,
    categoryParentId: row.category_parent_id,
    categoryParentName: row.category_parent_name,
    categoryParentIcon: row.category_parent_icon,
    categoryParentColor: row.category_parent_color,
    accountName: row.account_name,
    toAccountName: row.to_account_name,
    refundedCents: row.refunded_cents ?? 0,
  };
}

const TRANSACTION_LIST_SELECT = `
SELECT
  t.id,
  t.type,
  t.amount_cents,
  t.category_id,
  t.account_id,
  t.to_account_id,
  t.refund_of_id,
  t.occurred_on,
  t.note,
  t.created_at,
  t.updated_at,
  c.name AS category_name,
  c.icon AS category_icon,
  c.color AS category_color,
  p.id AS category_parent_id,
  p.name AS category_parent_name,
  p.icon AS category_parent_icon,
  p.color AS category_parent_color,
  a1.name AS account_name,
  a2.name AS to_account_name,
  COALESCE(
    (SELECT SUM(r.amount_cents) FROM transactions r WHERE r.refund_of_id = t.id),
    0
  ) AS refunded_cents
FROM transactions t
LEFT JOIN categories c ON c.id = t.category_id
LEFT JOIN categories p ON p.id = c.parent_id
INNER JOIN accounts a1 ON a1.id = t.account_id
LEFT JOIN accounts a2 ON a2.id = t.to_account_id
`;

export async function findTransactionById(
  db: SqlExecutor,
  id: string
): Promise<Transaction | null> {
  const row = await db.getFirst<TransactionRow>('SELECT * FROM transactions WHERE id = ?', [id]);
  return row ? mapTransactionRow(row) : null;
}

export async function findTransactionDetailById(
  db: SqlExecutor,
  id: string
): Promise<TransactionListItem | null> {
  const row = await db.getFirst<TransactionJoinRow>(
    `${TRANSACTION_LIST_SELECT} WHERE t.id = ?`,
    [id]
  );
  return row ? mapTransactionJoinRow(row) : null;
}

export async function findTransactionsByDateRange(
  db: SqlExecutor,
  startIso: string,
  endIso: string
): Promise<TransactionListItem[]> {
  const rows = await db.getAll<TransactionJoinRow>(
    `${TRANSACTION_LIST_SELECT}
     WHERE t.occurred_on >= ? AND t.occurred_on <= ?
     ORDER BY t.occurred_on DESC, t.created_at DESC`,
    [startIso, endIso]
  );
  return rows.map(mapTransactionJoinRow);
}

export async function findAllTransactions(db: SqlExecutor): Promise<TransactionListItem[]> {
  const rows = await db.getAll<TransactionJoinRow>(
    `${TRANSACTION_LIST_SELECT}
     ORDER BY t.occurred_on DESC, t.created_at DESC`
  );
  return rows.map(mapTransactionJoinRow);
}

export async function findAllTransactionsForExport(
  db: SqlExecutor
): Promise<TransactionListItem[]> {
  return findAllTransactions(db);
}

export async function findTransactionsByAccountId(
  db: SqlExecutor,
  accountId: string,
  limit = 100
): Promise<TransactionListItem[]> {
  const rows = await db.getAll<TransactionJoinRow>(
    `${TRANSACTION_LIST_SELECT}
     WHERE t.account_id = ? OR t.to_account_id = ?
     ORDER BY t.occurred_on DESC, t.created_at DESC
     LIMIT ?`,
    [accountId, accountId, limit]
  );
  return rows.map(mapTransactionJoinRow);
}

/**
 * 多维账单搜索与分页查询（参数化 WHERE + 单次汇总统计 + LIMIT/OFFSET 懒加载）。
 */
export async function searchTransactionsPage(
  db: SqlExecutor,
  filter: TransactionSearchFilter
): Promise<TransactionSearchPage> {
  const { whereSql, params } = buildTransactionSearchWhere(filter);
  const { limit, offset } = normalizeSearchPagination(filter);

  const summaryRow = await db.getFirst<SearchSummaryRow>(
    `SELECT
       COUNT(*) AS total_count,
       SUM(CASE WHEN t.type = 'expense' THEN t.amount_cents ELSE 0 END) AS expense_cents,
       SUM(CASE WHEN t.type = 'income' THEN t.amount_cents ELSE 0 END) AS income_cents,
       SUM(CASE WHEN t.type = 'refund' THEN t.amount_cents ELSE 0 END) AS refund_cents
     FROM transactions t
     LEFT JOIN categories c ON c.id = t.category_id
     LEFT JOIN categories p ON p.id = c.parent_id
     INNER JOIN accounts a1 ON a1.id = t.account_id
     LEFT JOIN accounts a2 ON a2.id = t.to_account_id
     ${whereSql}`,
    params
  );

  const totalCount = summaryRow?.total_count ?? 0;
  const rows = await db.getAll<TransactionJoinRow>(
    `${TRANSACTION_LIST_SELECT}
     ${whereSql}
     ORDER BY t.occurred_on DESC, t.created_at DESC
     LIMIT ? OFFSET ?`,
    [...params, limit, offset]
  );

  return {
    items: rows.map(mapTransactionJoinRow),
    totalCount,
    totalExpenseCents: summaryRow?.expense_cents ?? 0,
    totalIncomeCents: summaryRow?.income_cents ?? 0,
    totalRefundCents: summaryRow?.refund_cents ?? 0,
    hasMore: offset + rows.length < totalCount,
  };
}

export async function findRefundRowsByOriginalId(
  db: SqlExecutor,
  originalTransactionId: string
): Promise<Transaction[]> {
  const rows = await db.getAll<TransactionRow>(
    'SELECT * FROM transactions WHERE refund_of_id = ? ORDER BY occurred_on DESC, created_at DESC',
    [originalTransactionId]
  );
  return rows.map(mapTransactionRow);
}

export async function findRefundDetailsByOriginalId(
  db: SqlExecutor,
  originalTransactionId: string
): Promise<TransactionListItem[]> {
  const rows = await db.getAll<TransactionJoinRow>(
    `${TRANSACTION_LIST_SELECT}
     WHERE t.refund_of_id = ?
     ORDER BY t.occurred_on DESC, t.created_at DESC`,
    [originalTransactionId]
  );
  return rows.map(mapTransactionJoinRow);
}

export async function sumRefundsByOriginalId(
  db: SqlExecutor,
  originalTransactionId: string,
  excludeRefundId?: string
): Promise<number> {
  if (excludeRefundId) {
    const row = await db.getFirst<SumRow>(
      'SELECT SUM(amount_cents) AS total FROM transactions WHERE refund_of_id = ? AND id != ?',
      [originalTransactionId, excludeRefundId]
    );
    return row?.total ?? 0;
  }
  const row = await db.getFirst<SumRow>(
    'SELECT SUM(amount_cents) AS total FROM transactions WHERE refund_of_id = ?',
    [originalTransactionId]
  );
  return row?.total ?? 0;
}

export async function insertTransactionRow(
  db: SqlExecutor,
  txRecord: Transaction
): Promise<void> {
  await db.run(
    `INSERT INTO transactions (
      id, type, amount_cents, category_id, account_id, to_account_id, refund_of_id,
      occurred_on, note, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      txRecord.id,
      txRecord.type,
      txRecord.amountCents,
      txRecord.categoryId,
      txRecord.accountId,
      txRecord.toAccountId,
      txRecord.refundOfId,
      txRecord.occurredOn,
      txRecord.note,
      txRecord.createdAt,
      txRecord.updatedAt,
    ]
  );
}

export async function updateTransactionRow(
  db: SqlExecutor,
  txRecord: Transaction
): Promise<number> {
  const res = await db.run(
    `UPDATE transactions
     SET type = ?, amount_cents = ?, category_id = ?, account_id = ?, to_account_id = ?,
         refund_of_id = ?, occurred_on = ?, note = ?, updated_at = ?
     WHERE id = ?`,
    [
      txRecord.type,
      txRecord.amountCents,
      txRecord.categoryId,
      txRecord.accountId,
      txRecord.toAccountId,
      txRecord.refundOfId,
      txRecord.occurredOn,
      txRecord.note,
      txRecord.updatedAt,
      txRecord.id,
    ]
  );
  return res.changes;
}

export async function updateRefundsCategoryByOriginalId(
  db: SqlExecutor,
  originalTransactionId: string,
  categoryId: string,
  updatedAt: string
): Promise<number> {
  const res = await db.run(
    'UPDATE transactions SET category_id = ?, updated_at = ? WHERE refund_of_id = ?',
    [categoryId, updatedAt, originalTransactionId]
  );
  return res.changes;
}

export async function deleteRefundsByOriginalId(
  db: SqlExecutor,
  originalTransactionId: string
): Promise<number> {
  const res = await db.run('DELETE FROM transactions WHERE refund_of_id = ?', [
    originalTransactionId,
  ]);
  return res.changes;
}

export async function deleteTransactionRow(db: SqlExecutor, id: string): Promise<number> {
  const res = await db.run('DELETE FROM transactions WHERE id = ?', [id]);
  return res.changes;
}

/**
 * 从既有收支流水实时派生「分类 → 最近使用活跃账户」记忆快照：
 * - 仅统计 expense / income（排除 transfer 与 refund，防止退款入账污染消费分类记忆）
 * - 仅匹配当前未归档且可选账户（is_archived = 0 且 is_selectable = 1），归档或关闭可选后自动平滑退回历史活跃账户
 * - 按操作时间 created_at DESC（同毫秒以 rowid DESC 决胜），而非账单日期 occurred_on
 */
export async function findCategoryAccountMemory(
  db: SqlExecutor
): Promise<CategoryAccountMemory> {
  const rows = await db.getAll<CategoryAccountMemoryRow>(
    `WITH ranked AS (
      SELECT
        t.type,
        t.category_id,
        COALESCE(c.parent_id, c.id) AS root_category_id,
        t.account_id,
        t.created_at,
        t.rowid AS row_seq,
        ROW_NUMBER() OVER (
          PARTITION BY t.category_id
          ORDER BY t.created_at DESC, t.rowid DESC
        ) AS rn
      FROM transactions t
      INNER JOIN accounts a ON a.id = t.account_id
      INNER JOIN categories c ON c.id = t.category_id
      WHERE t.type IN ('expense', 'income')
        AND a.is_archived = 0
        AND a.is_selectable = 1
    )
    SELECT type, category_id, root_category_id, account_id
    FROM ranked
    WHERE rn = 1
    ORDER BY created_at DESC, row_seq DESC`
  );

  const byCategoryId: Record<string, string> = {};
  const byRootCategoryId: Record<string, string> = {};
  const byType: Partial<Record<'expense' | 'income', string>> = {};

  for (const row of rows) {
    if (!byCategoryId[row.category_id]) {
      byCategoryId[row.category_id] = row.account_id;
    }
    if (!byRootCategoryId[row.root_category_id]) {
      byRootCategoryId[row.root_category_id] = row.account_id;
    }
    if (!byType[row.type]) {
      byType[row.type] = row.account_id;
    }
  }

  return { byCategoryId, byRootCategoryId, byType };
}
