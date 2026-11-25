import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createNodeTestDatabase } from './node-test-client';
import { CURRENT_SCHEMA_VERSION, initializeSchema } from './schema';
import { getDatabaseStats, resetDatabase, seedDefaultData } from './seed';
import type { SqlExecutor } from './types';

describe('db Schema 迁移与种子数据', () => {
  let db: SqlExecutor;
  let close: () => void;

  beforeEach(async () => {
    const conn = createNodeTestDatabase(':memory:');
    db = conn.db;
    close = conn.close;
    await initializeSchema(db);
    await seedDefaultData(db);
  });

  afterEach(() => {
    close();
  });

  it('幂等执行 Schema 迁移与默认种子写入', async () => {
    await initializeSchema(db);
    await seedDefaultData(db);

    const versionRow = await db.getFirst<{ version: number }>(
      'SELECT MAX(version) AS version FROM schema_migrations'
    );
    expect(versionRow?.version).toBe(CURRENT_SCHEMA_VERSION);

    const stats = await getDatabaseStats(db);
    expect(stats.activeAccountCount).toBe(5);
    expect(stats.activeCategoryCount).toBe(18);
    expect(stats.transactionCount).toBe(0);
  });

  it('数据库层 CHECK 约束拒绝非正金额与自转账', async () => {
    const now = new Date().toISOString();

    await expect(
      db.run(
        `INSERT INTO transactions (
          id, type, amount_cents, category_id, account_id, to_account_id,
          occurred_on, note, created_at, updated_at
        ) VALUES (?, 'expense', 0, 'cat_exp_food', 'acc_wechat', NULL, '2026-11-25', '', ?, ?)`,
        ['tx_invalid_zero', now, now]
      )
    ).rejects.toThrow();

    await expect(
      db.run(
        `INSERT INTO transactions (
          id, type, amount_cents, category_id, account_id, to_account_id,
          occurred_on, note, created_at, updated_at
        ) VALUES (?, 'transfer', 1000, NULL, 'acc_wechat', 'acc_wechat', '2026-11-25', '', ?, ?)`,
        ['tx_invalid_self', now, now]
      )
    ).rejects.toThrow();
  });

  it('resetDatabase 清空交易并恢复默认账户和分类', async () => {
    const now = new Date().toISOString();
    await db.run(
      `INSERT INTO transactions (
        id, type, amount_cents, category_id, account_id, to_account_id,
        occurred_on, note, created_at, updated_at
      ) VALUES ('tx_1', 'expense', 2500, 'cat_exp_food', 'acc_wechat', NULL, '2026-11-25', '午餐', ?, ?)`,
      [now, now]
    );

    const before = await getDatabaseStats(db);
    expect(before.transactionCount).toBe(1);

    await resetDatabase(db);

    const after = await getDatabaseStats(db);
    expect(after.transactionCount).toBe(0);
    expect(after.activeAccountCount).toBe(5);
    expect(after.activeCategoryCount).toBe(18);
  });
});
