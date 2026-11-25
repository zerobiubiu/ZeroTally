import type { SqlExecutor } from '../../db/types';
import type { Account, AccountCategory, AccountKind } from './types';

interface AccountRow {
  id: string;
  name: string;
  kind: AccountKind;
  category: AccountCategory;
  balance_cents: number;
  include_in_net_worth: number;
  icon: string;
  color: string;
  note: string;
  is_archived: number;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

interface CountRow {
  count: number;
}

interface MaxSortRow {
  max_order: number | null;
}

function mapAccountRow(row: AccountRow): Account {
  return {
    id: row.id,
    name: row.name,
    kind: row.kind,
    category: row.category,
    balanceCents: row.balance_cents,
    includeInNetWorth: row.include_in_net_worth === 1,
    icon: row.icon,
    color: row.color,
    note: row.note,
    isArchived: row.is_archived === 1,
    sortOrder: row.sort_order,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function findAllAccounts(
  db: SqlExecutor,
  includeArchived = false
): Promise<Account[]> {
  const sql = includeArchived
    ? `SELECT * FROM accounts ORDER BY is_archived ASC, sort_order ASC, created_at ASC`
    : `SELECT * FROM accounts WHERE is_archived = 0 ORDER BY sort_order ASC, created_at ASC`;
  const rows = await db.getAll<AccountRow>(sql);
  return rows.map(mapAccountRow);
}

export async function findAccountById(db: SqlExecutor, id: string): Promise<Account | null> {
  const row = await db.getFirst<AccountRow>('SELECT * FROM accounts WHERE id = ?', [id]);
  return row ? mapAccountRow(row) : null;
}

export async function getNextAccountSortOrder(db: SqlExecutor): Promise<number> {
  const row = await db.getFirst<MaxSortRow>('SELECT MAX(sort_order) AS max_order FROM accounts');
  return (row?.max_order ?? 0) + 10;
}

export async function insertAccountRow(db: SqlExecutor, account: Account): Promise<void> {
  await db.run(
    `INSERT INTO accounts (
      id, name, kind, category, balance_cents, include_in_net_worth,
      icon, color, note, is_archived, sort_order, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      account.id,
      account.name,
      account.kind,
      account.category,
      account.balanceCents,
      account.includeInNetWorth ? 1 : 0,
      account.icon,
      account.color,
      account.note,
      account.isArchived ? 1 : 0,
      account.sortOrder,
      account.createdAt,
      account.updatedAt,
    ]
  );
}

export async function updateAccountRow(
  db: SqlExecutor,
  id: string,
  fields: {
    name: string;
    kind: AccountKind;
    category: AccountCategory;
    includeInNetWorth: boolean;
    icon: string;
    color: string;
    note: string;
    updatedAt: string;
  }
): Promise<number> {
  const res = await db.run(
    `UPDATE accounts
     SET name = ?, kind = ?, category = ?, include_in_net_worth = ?,
         icon = ?, color = ?, note = ?, updated_at = ?
     WHERE id = ?`,
    [
      fields.name,
      fields.kind,
      fields.category,
      fields.includeInNetWorth ? 1 : 0,
      fields.icon,
      fields.color,
      fields.note,
      fields.updatedAt,
      id,
    ]
  );
  return res.changes;
}

/**
 * 原子增减账户余额（供交易服务在事务内调用）
 */
export async function applyAccountBalanceDelta(
  db: SqlExecutor,
  id: string,
  deltaCents: number,
  updatedAt: string
): Promise<number> {
  const res = await db.run(
    `UPDATE accounts
     SET balance_cents = balance_cents + ?, updated_at = ?
     WHERE id = ?`,
    [deltaCents, updatedAt, id]
  );
  return res.changes;
}

export async function setAccountBalanceExact(
  db: SqlExecutor,
  id: string,
  balanceCents: number,
  updatedAt: string
): Promise<number> {
  const res = await db.run(
    `UPDATE accounts
     SET balance_cents = ?, updated_at = ?
     WHERE id = ?`,
    [balanceCents, updatedAt, id]
  );
  return res.changes;
}

export async function setAccountArchivedFlag(
  db: SqlExecutor,
  id: string,
  isArchived: boolean,
  updatedAt: string
): Promise<number> {
  const res = await db.run(
    `UPDATE accounts
     SET is_archived = ?, updated_at = ?
     WHERE id = ?`,
    [isArchived ? 1 : 0, updatedAt, id]
  );
  return res.changes;
}

export async function countAccountTransactions(db: SqlExecutor, id: string): Promise<number> {
  const row = await db.getFirst<CountRow>(
    `SELECT COUNT(*) AS count FROM transactions WHERE account_id = ? OR to_account_id = ?`,
    [id, id]
  );
  return row?.count ?? 0;
}

export async function deleteAccountRow(db: SqlExecutor, id: string): Promise<number> {
  const res = await db.run('DELETE FROM accounts WHERE id = ?', [id]);
  return res.changes;
}
