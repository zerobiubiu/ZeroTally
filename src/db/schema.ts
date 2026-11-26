import type { SqlExecutor } from './types';

export const CURRENT_SCHEMA_VERSION = 4;

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

/** v2：分类支持两级（一级 parent_id 为 NULL，二级指向同类型一级分类） */
const MIGRATION_V2_SQL = `
ALTER TABLE categories ADD COLUMN parent_id TEXT REFERENCES categories(id);

CREATE INDEX IF NOT EXISTS idx_categories_parent_id
  ON categories (parent_id);
`;

/**
 * v3：交易表支持关联抵扣式退款（type 新增 'refund'，新增 refund_of_id 指向原支出记录）。
 * 因 SQLite 不支持直接 ALTER 修改 CHECK 约束，需在关闭外键检查后原子重建表并恢复索引。
 */
const MIGRATION_V3_REBUILD_SQL = `
CREATE TABLE transactions_v3 (
  id TEXT PRIMARY KEY NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('expense', 'income', 'transfer', 'refund')),
  amount_cents INTEGER NOT NULL CHECK (amount_cents > 0),
  category_id TEXT REFERENCES categories(id),
  account_id TEXT NOT NULL REFERENCES accounts(id),
  to_account_id TEXT REFERENCES accounts(id),
  refund_of_id TEXT REFERENCES transactions_v3(id),
  occurred_on TEXT NOT NULL,
  note TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  CHECK (
    (type = 'transfer' AND category_id IS NULL AND to_account_id IS NOT NULL AND to_account_id != account_id AND refund_of_id IS NULL)
    OR
    (type IN ('expense', 'income') AND category_id IS NOT NULL AND to_account_id IS NULL AND refund_of_id IS NULL)
    OR
    (type = 'refund' AND category_id IS NOT NULL AND to_account_id IS NULL AND refund_of_id IS NOT NULL AND refund_of_id != id)
  )
);

INSERT INTO transactions_v3 (
  id, type, amount_cents, category_id, account_id, to_account_id, refund_of_id,
  occurred_on, note, created_at, updated_at
)
SELECT
  id, type, amount_cents, category_id, account_id, to_account_id, NULL,
  occurred_on, note, created_at, updated_at
FROM transactions;

DROP TABLE transactions;
ALTER TABLE transactions_v3 RENAME TO transactions;

CREATE INDEX IF NOT EXISTS idx_transactions_occurred_on
  ON transactions (occurred_on DESC, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_transactions_account_id
  ON transactions (account_id);

CREATE INDEX IF NOT EXISTS idx_transactions_to_account_id
  ON transactions (to_account_id);

CREATE INDEX IF NOT EXISTS idx_transactions_category_id
  ON transactions (category_id);

CREATE INDEX IF NOT EXISTS idx_transactions_refund_of_id
  ON transactions (refund_of_id);
`;

/**
 * v4：新增应用配置表（持久化主题偏好等设置）与快捷记账模板表（支持底栏上滑一键快记与完整 JSON 导入导出）。
 */
const MIGRATION_V4_SQL = `
CREATE TABLE IF NOT EXISTS app_settings (
  key TEXT PRIMARY KEY NOT NULL,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS quick_templates (
  id TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('expense', 'income')),
  amount_cents INTEGER NOT NULL CHECK (amount_cents > 0),
  category_id TEXT NOT NULL REFERENCES categories(id),
  account_id TEXT NOT NULL REFERENCES accounts(id),
  note TEXT NOT NULL DEFAULT '',
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_quick_templates_sort
  ON quick_templates (sort_order ASC, created_at ASC);
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

  if (currentVersion < 2) {
    await db.withTransaction(async (tx) => {
      await tx.exec(MIGRATION_V2_SQL);
      await tx.run(
        'INSERT OR IGNORE INTO schema_migrations (version, applied_at) VALUES (?, ?)',
        [2, new Date().toISOString()]
      );
    });
  }

  if (currentVersion < 3) {
    // SQLite 要求在事务外临时关闭外键检查以安全执行表重建
    await db.exec('PRAGMA foreign_keys = OFF;');
    try {
      await db.withTransaction(async (tx) => {
        await tx.exec(MIGRATION_V3_REBUILD_SQL);
        await tx.run(
          'INSERT OR IGNORE INTO schema_migrations (version, applied_at) VALUES (?, ?)',
          [3, new Date().toISOString()]
        );
      });
    } finally {
      await db.exec('PRAGMA foreign_keys = ON;');
    }
  }

  if (currentVersion < 4) {
    await db.withTransaction(async (tx) => {
      await tx.exec(MIGRATION_V4_SQL);
      await tx.run(
        'INSERT OR IGNORE INTO schema_migrations (version, applied_at) VALUES (?, ?)',
        [4, new Date().toISOString()]
      );
    });
  }
}
