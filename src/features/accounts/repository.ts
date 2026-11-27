import type { SqlExecutor } from '../../db/types';
import type { Account, AccountCategory, AccountKind } from './types';

interface AccountRow {
  id: string;
  name: string;
  kind: AccountKind;
  category: AccountCategory;
  balance_cents: number;
  include_in_net_worth: number;
  include_in_total_assets: number;
  is_selectable: number;
  icon: string;
  color: string;
  note: string;
  card_number: string;
  bank_name: string;
  bank_branch: string;
  opened_on: string;
  is_archived: number;
  sort_order: number;
  created_at: string;
  updated_at: string;
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
    includeInTotalAssets: row.include_in_total_assets === 1,
    isSelectable: row.is_selectable === 1,
    icon: row.icon,
    color: row.color,
    note: row.note,
    cardNumber: row.card_number,
    bankName: row.bank_name,
    bankBranch: row.bank_branch,
    openedOn: row.opened_on,
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
      id, name, kind, category, balance_cents, include_in_net_worth, include_in_total_assets,
      is_selectable, icon, color, note, card_number, bank_name, bank_branch, opened_on,
      is_archived, sort_order, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      account.id,
      account.name,
      account.kind,
      account.category,
      account.balanceCents,
      account.includeInNetWorth ? 1 : 0,
      account.includeInTotalAssets ? 1 : 0,
      account.isSelectable ? 1 : 0,
      account.icon,
      account.color,
      account.note,
      account.cardNumber,
      account.bankName,
      account.bankBranch,
      account.openedOn,
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
    includeInTotalAssets: boolean;
    isSelectable: boolean;
    icon: string;
    color: string;
    note: string;
    cardNumber: string;
    bankName: string;
    bankBranch: string;
    openedOn: string;
    updatedAt: string;
  }
): Promise<number> {
  const res = await db.run(
    `UPDATE accounts
     SET name = ?, kind = ?, category = ?, include_in_net_worth = ?, include_in_total_assets = ?,
         is_selectable = ?, icon = ?, color = ?, note = ?,
         card_number = ?, bank_name = ?, bank_branch = ?, opened_on = ?, updated_at = ?
     WHERE id = ?`,
    [
      fields.name,
      fields.kind,
      fields.category,
      fields.includeInNetWorth ? 1 : 0,
      fields.includeInTotalAssets ? 1 : 0,
      fields.isSelectable ? 1 : 0,
      fields.icon,
      fields.color,
      fields.note,
      fields.cardNumber,
      fields.bankName,
      fields.bankBranch,
      fields.openedOn,
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


export async function deleteAccountRow(db: SqlExecutor, id: string): Promise<number> {
  const res = await db.run('DELETE FROM accounts WHERE id = ?', [id]);
  return res.changes;
}
