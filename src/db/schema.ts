import type { SqlExecutor } from './types';

export const CURRENT_SCHEMA_VERSION = 1;

const MIGRATION_V1_SQL = `
CREATE TABLE IF NOT EXISTS accounts (
  id TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('asset', 'liability')),
  category TEXT NOT NULL CHECK (category IN ('cash', 'bank', 'digital', 'investment', 'credit', 'loan', 'other')),
  balance_cents INTEGER NOT NULL DEFAULT 0,
  include_in_net_worth INTEGER NOT NULL DEFAULT 1 CHECK (include_in_net_worth IN (0, 1)),
  icon TEXT NOT NULL,
  color TEXT NOT NULL,
  note TEXT NOT NULL DEFAULT '',
  is_archived INTEGER NOT NULL DEFAULT 0 CHECK (is_archived IN (0, 1)),
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS categories (
  id TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('expense', 'income')),
  icon TEXT NOT NULL,
  color TEXT NOT NULL,
  is_system INTEGER NOT NULL DEFAULT 0 CHECK (is_system IN (0, 1)),
  is_archived INTEGER NOT NULL DEFAULT 0 CHECK (is_archived IN (0, 1)),
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS transactions (
  id TEXT PRIMARY KEY NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('expense', 'income', 'transfer')),
  amount_cents INTEGER NOT NULL CHECK (amount_cents > 0),
  category_id TEXT REFERENCES categories(id),
  account_id TEXT NOT NULL REFERENCES accounts(id),
  to_account_id TEXT REFERENCES accounts(id),
  occurred_on TEXT NOT NULL,
  note TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  CHECK (
    (type = 'transfer' AND category_id IS NULL AND to_account_id IS NOT NULL AND to_account_id != account_id)
    OR
    (type IN ('expense', 'income') AND category_id IS NOT NULL AND to_account_id IS NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_transactions_occurred_on
  ON transactions (occurred_on DESC, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_transactions_account_id
  ON transactions (account_id);

CREATE INDEX IF NOT EXISTS idx_transactions_to_account_id
  ON transactions (to_account_id);

CREATE INDEX IF NOT EXISTS idx_transactions_category_id
  ON transactions (category_id);
`;

interface MigrationRow {
  version: number;
}

/**
 * 初始化数据库外键约束并执行版本迁移（幂等）
 */
export async function initializeSchema(db: SqlExecutor): Promise<void> {
  await db.exec('PRAGMA foreign_keys = ON;');
  await db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY NOT NULL,
      applied_at TEXT NOT NULL
    );
  `);

  const applied = await db.getFirst<MigrationRow>(
    'SELECT MAX(version) AS version FROM schema_migrations'
  );
  const currentVersion = applied?.version ?? 0;

  if (currentVersion < 1) {
    await db.withTransaction(async (tx) => {
      await tx.exec(MIGRATION_V1_SQL);
      await tx.run(
        'INSERT OR IGNORE INTO schema_migrations (version, applied_at) VALUES (?, ?)',
        [1, new Date().toISOString()]
      );
    });
  }
}
