import type { SqlExecutor } from '../../db/types';
import type { Transaction, TransactionListItem, TransactionType } from './types';

interface TransactionRow {
  id: string;
  type: TransactionType;
  amount_cents: number;
  category_id: string | null;
  account_id: string;
  to_account_id: string | null;
  occurred_on: string;
  note: string;
  created_at: string;
  updated_at: string;
}

interface TransactionJoinRow extends TransactionRow {
  category_name: string | null;
  category_icon: string | null;
  category_color: string | null;
  account_name: string;
  to_account_name: string | null;
}

function mapTransactionRow(row: TransactionRow): Transaction {
  return {
    id: row.id,
    type: row.type,
    amountCents: row.amount_cents,
    categoryId: row.category_id,
    accountId: row.account_id,
    toAccountId: row.to_account_id,
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
    accountName: row.account_name,
    toAccountName: row.to_account_name,
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
  t.occurred_on,
  t.note,
  t.created_at,
  t.updated_at,
  c.name AS category_name,
  c.icon AS category_icon,
  c.color AS category_color,
  a1.name AS account_name,
  a2.name AS to_account_name
FROM transactions t
LEFT JOIN categories c ON c.id = t.category_id
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

export async function findAllTransactionsForExport(
  db: SqlExecutor
): Promise<TransactionListItem[]> {
  const rows = await db.getAll<TransactionJoinRow>(
    `${TRANSACTION_LIST_SELECT}
     ORDER BY t.occurred_on DESC, t.created_at DESC`
  );
  return rows.map(mapTransactionJoinRow);
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

export async function insertTransactionRow(
  db: SqlExecutor,
  txRecord: Transaction
): Promise<void> {
  await db.run(
    `INSERT INTO transactions (
      id, type, amount_cents, category_id, account_id, to_account_id,
      occurred_on, note, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      txRecord.id,
      txRecord.type,
      txRecord.amountCents,
      txRecord.categoryId,
      txRecord.accountId,
      txRecord.toAccountId,
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
         occurred_on = ?, note = ?, updated_at = ?
     WHERE id = ?`,
    [
      txRecord.type,
      txRecord.amountCents,
      txRecord.categoryId,
      txRecord.accountId,
      txRecord.toAccountId,
      txRecord.occurredOn,
      txRecord.note,
      txRecord.updatedAt,
      txRecord.id,
    ]
  );
  return res.changes;
}

export async function deleteTransactionRow(db: SqlExecutor, id: string): Promise<number> {
  const res = await db.run('DELETE FROM transactions WHERE id = ?', [id]);
  return res.changes;
}
