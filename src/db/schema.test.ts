import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createNodeTestDatabase } from './node-test-client';
import { CURRENT_SCHEMA_VERSION, initializeSchema } from './schema';
import {
  DEFAULT_WALLET_ACCOUNT_ID,
  getDatabaseStats,
  resetDatabase,
  seedDefaultData,
} from './seed';
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

  it('幂等执行 Schema 迁移与默认种子写入（仅含唯一钱包账户 ¥0.00）', async () => {
    await initializeSchema(db);
    await seedDefaultData(db);

    const versionRow = await db.getFirst<{ version: number }>(
      'SELECT MAX(version) AS version FROM schema_migrations'
    );
    expect(versionRow?.version).toBe(CURRENT_SCHEMA_VERSION);

    const stats = await getDatabaseStats(db);
    expect(stats.activeAccountCount).toBe(1);
    expect(stats.activeCategoryCount).toBe(82);
    expect(stats.transactionCount).toBe(0);

    const wallet = await db.getFirst<{ id: string; name: string; balance_cents: number }>(
      'SELECT id, name, balance_cents FROM accounts WHERE id = ?',
      [DEFAULT_WALLET_ACCOUNT_ID]
    );
    expect(wallet).toEqual({
      id: DEFAULT_WALLET_ACCOUNT_ID,
      name: '钱包',
      balance_cents: 0,
    });
  });

  it('数据库层 CHECK 约束拒绝非正金额与自转账', async () => {
    const now = new Date().toISOString();

    await expect(
      db.run(
        `INSERT INTO transactions (
          id, type, amount_cents, category_id, account_id, to_account_id,
          occurred_on, note, created_at, updated_at
        ) VALUES (?, 'expense', 0, 'cat_exp_food', ?, NULL, '2026-11-25', '', ?, ?)`,
        ['tx_invalid_zero', DEFAULT_WALLET_ACCOUNT_ID, now, now]
      )
    ).rejects.toThrow();

    await expect(
      db.run(
        `INSERT INTO transactions (
          id, type, amount_cents, category_id, account_id, to_account_id,
          occurred_on, note, created_at, updated_at
        ) VALUES (?, 'transfer', 1000, NULL, ?, ?, '2026-11-25', '', ?, ?)`,
        ['tx_invalid_self', DEFAULT_WALLET_ACCOUNT_ID, DEFAULT_WALLET_ACCOUNT_ID, now, now]
      )
    ).rejects.toThrow();
  });

  it('resetDatabase 清空交易与快捷模板，并恢复唯一默认钱包（余额 0）和默认分类', async () => {
    const now = new Date().toISOString();
    await db.run(
      `INSERT INTO transactions (
        id, type, amount_cents, category_id, account_id, to_account_id,
        occurred_on, note, created_at, updated_at
      ) VALUES ('tx_1', 'expense', 2500, 'cat_exp_food', ?, NULL, '2026-11-25', '午餐', ?, ?)`,
      [DEFAULT_WALLET_ACCOUNT_ID, now, now]
    );
    await db.run(
      `INSERT INTO quick_templates (
        id, name, type, amount_cents, category_id, account_id, note, sort_order, created_at, updated_at
      ) VALUES ('qtp_1', '午餐', 'expense', 2500, 'cat_exp_food', ?, '', 10, ?, ?)`,
      [DEFAULT_WALLET_ACCOUNT_ID, now, now]
    );
    await db.run('UPDATE accounts SET balance_cents = 9900 WHERE id = ?', [
      DEFAULT_WALLET_ACCOUNT_ID,
    ]);

    const before = await getDatabaseStats(db);
    expect(before.transactionCount).toBe(1);

    await resetDatabase(db);

    const after = await getDatabaseStats(db);
    expect(after.transactionCount).toBe(0);
    expect(after.activeAccountCount).toBe(1);
    expect(after.activeCategoryCount).toBe(82);

    const wallet = await db.getFirst<{ name: string; balance_cents: number }>(
      'SELECT name, balance_cents FROM accounts WHERE id = ?',
      [DEFAULT_WALLET_ACCOUNT_ID]
    );
    expect(wallet).toEqual({ name: '钱包', balance_cents: 0 });

    const quickCount = await db.getFirst<{ count: number }>(
      'SELECT COUNT(*) AS count FROM quick_templates'
    );
    expect(quickCount?.count).toBe(0);
  });
});

describe('db 历史版本增量迁移', () => {
  it('v1 → v5 升级：保留旧分类 ID、补齐二级分类、v4 新表与 v5 账户开关及卡信息列', async () => {
    const conn = createNodeTestDatabase(':memory:');
    const legacy = conn.db;
    try {
      const now = new Date().toISOString();
      await legacy.exec(`
        CREATE TABLE schema_migrations (version INTEGER PRIMARY KEY NOT NULL, applied_at TEXT NOT NULL);
        INSERT INTO schema_migrations (version, applied_at) VALUES (1, '${now}');
        CREATE TABLE categories (
          id TEXT PRIMARY KEY NOT NULL, name TEXT NOT NULL, type TEXT NOT NULL,
          icon TEXT NOT NULL, color TEXT NOT NULL,
          is_system INTEGER NOT NULL DEFAULT 0, is_archived INTEGER NOT NULL DEFAULT 0,
          sort_order INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL
        );
        CREATE TABLE accounts (
          id TEXT PRIMARY KEY NOT NULL, name TEXT NOT NULL, kind TEXT NOT NULL, category TEXT NOT NULL,
          balance_cents INTEGER NOT NULL DEFAULT 0, include_in_net_worth INTEGER NOT NULL DEFAULT 1,
          icon TEXT NOT NULL, color TEXT NOT NULL, note TEXT NOT NULL DEFAULT '',
          is_archived INTEGER NOT NULL DEFAULT 0, sort_order INTEGER NOT NULL DEFAULT 0,
          created_at TEXT NOT NULL, updated_at TEXT NOT NULL
        );
        CREATE TABLE transactions (
          id TEXT PRIMARY KEY NOT NULL, type TEXT NOT NULL, amount_cents INTEGER NOT NULL,
          category_id TEXT, account_id TEXT NOT NULL, to_account_id TEXT,
          occurred_on TEXT NOT NULL, note TEXT NOT NULL DEFAULT '',
          created_at TEXT NOT NULL, updated_at TEXT NOT NULL
        );
        INSERT INTO categories VALUES ('cat_exp_food', '吃饭', 'expense', 'restaurant-outline', '#D97706', 1, 0, 10, '${now}');
        INSERT INTO categories VALUES ('cat_exp_social', '人情往来', 'expense', 'gift-outline', '#C25A00', 1, 1, 100, '${now}');
      `);

      await initializeSchema(legacy);
      await seedDefaultData(legacy);

      const food = await legacy.getFirst<{ name: string; parent_id: string | null }>(
        'SELECT name, parent_id FROM categories WHERE id = ?',
        ['cat_exp_food']
      );
      expect(food).toEqual({ name: '吃饭', parent_id: null });

      const lunch = await legacy.getFirst<{ parent_id: string; is_archived: number }>(
        'SELECT parent_id, is_archived FROM categories WHERE id = ?',
        ['cat_exp_food_lunch']
      );
      expect(lunch).toEqual({ parent_id: 'cat_exp_food', is_archived: 0 });

      const socialChild = await legacy.getFirst<{ is_archived: number }>(
        'SELECT is_archived FROM categories WHERE id = ?',
        ['cat_exp_social_gift']
      );
      expect(socialChild?.is_archived).toBe(1);

      const tables = await legacy.getAll<{ name: string }>(
        `SELECT name FROM sqlite_master WHERE type = 'table' AND name IN ('app_settings', 'quick_templates')`
      );
      expect(tables.map((t) => t.name).sort()).toEqual(['app_settings', 'quick_templates']);
    } finally {
      conn.close();
    }
  });

  it('v2 → v5 升级保留历史交易与老账户，v5 开关继承旧净资产品径且卡信息默认空', async () => {
    const conn = createNodeTestDatabase(':memory:');
    const legacy = conn.db;
    try {
      const now = new Date().toISOString();
      await legacy.exec(`
        PRAGMA foreign_keys = ON;
        CREATE TABLE schema_migrations (version INTEGER PRIMARY KEY NOT NULL, applied_at TEXT NOT NULL);
        INSERT INTO schema_migrations VALUES (1, '${now}'), (2, '${now}');
        CREATE TABLE accounts (
          id TEXT PRIMARY KEY NOT NULL, name TEXT NOT NULL, kind TEXT NOT NULL, category TEXT NOT NULL,
          balance_cents INTEGER NOT NULL DEFAULT 0, include_in_net_worth INTEGER NOT NULL DEFAULT 1,
          icon TEXT NOT NULL, color TEXT NOT NULL, note TEXT NOT NULL DEFAULT '',
          is_archived INTEGER NOT NULL DEFAULT 0, sort_order INTEGER NOT NULL DEFAULT 0,
          created_at TEXT NOT NULL, updated_at TEXT NOT NULL
        );
        CREATE TABLE categories (
          id TEXT PRIMARY KEY NOT NULL, name TEXT NOT NULL, type TEXT NOT NULL,
          icon TEXT NOT NULL, color TEXT NOT NULL, parent_id TEXT REFERENCES categories(id),
          is_system INTEGER NOT NULL DEFAULT 0, is_archived INTEGER NOT NULL DEFAULT 0,
          sort_order INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL
        );
        CREATE TABLE transactions (
          id TEXT PRIMARY KEY NOT NULL,
          type TEXT NOT NULL CHECK (type IN ('expense', 'income', 'transfer')),
          amount_cents INTEGER NOT NULL CHECK (amount_cents > 0),
          category_id TEXT REFERENCES categories(id),
          account_id TEXT NOT NULL REFERENCES accounts(id),
          to_account_id TEXT REFERENCES accounts(id),
          occurred_on TEXT NOT NULL, note TEXT NOT NULL DEFAULT '',
          created_at TEXT NOT NULL, updated_at TEXT NOT NULL
        );
        INSERT INTO accounts VALUES ('acc_wechat', '微信零钱', 'asset', 'digital', 5000, 1, 'wallet-outline', '#059669', '', 0, 10, '${now}', '${now}');
        INSERT INTO accounts VALUES ('acc_old_credit', '旧信用卡', 'asset', 'credit', -2000, 1, 'card-outline', '#E11D48', '', 0, 20, '${now}', '${now}');
        INSERT INTO categories VALUES ('cat_exp_food', '餐饮美食', 'expense', 'restaurant-outline', '#D97706', NULL, 1, 0, 10, '${now}');
        INSERT INTO transactions VALUES ('tx_old', 'expense', 5000, 'cat_exp_food', 'acc_wechat', NULL, '2026-11-20', '旧账目', '${now}', '${now}');
      `);

      await initializeSchema(legacy);
      await seedDefaultData(legacy);

      // 老用户覆盖升级保留既有账户，不强行覆盖；旧「性质与类型不一致」账户按类型归一
      const accRows = await legacy.getAll<{ id: string; kind: string }>('SELECT id, kind FROM accounts ORDER BY sort_order');
      expect(accRows).toEqual([
        { id: 'acc_wechat', kind: 'asset' },
        { id: 'acc_old_credit', kind: 'liability' },
      ]);

      const oldTx = await legacy.getFirst<{ id: string; refund_of_id: string | null }>(
        'SELECT id, refund_of_id FROM transactions WHERE id = ?',
        ['tx_old']
      );
      expect(oldTx).toEqual({ id: 'tx_old', refund_of_id: null });

      // 无 refund_of_id 的退款被 CHECK 约束拒绝
      await expect(
        legacy.run(
          `INSERT INTO transactions (
            id, type, amount_cents, category_id, account_id, to_account_id, refund_of_id,
            occurred_on, note, created_at, updated_at
          ) VALUES ('tx_bad_ref', 'refund', 1000, 'cat_exp_food', 'acc_wechat', NULL, NULL, '2026-11-21', '', ?, ?)`,
          [now, now]
        )
      ).rejects.toThrow();

      // 合法关联退款写入成功
      await legacy.run(
        `INSERT INTO transactions (
          id, type, amount_cents, category_id, account_id, to_account_id, refund_of_id,
          occurred_on, note, created_at, updated_at
        ) VALUES ('tx_ok_ref', 'refund', 2000, 'cat_exp_food', 'acc_wechat', NULL, 'tx_old', '2026-11-21', '部分退款', ?, ?)`,
        [now, now]
      );

      // app_settings 与 quick_templates 已可用
      await legacy.run(
        `INSERT INTO app_settings (key, value, updated_at) VALUES ('theme_preference', 'dark', ?)`,
        [now]
      );

      // v5：老账户总资产开关继承 include_in_net_worth，可选默认开启，卡信息为空
      const accFlags = await legacy.getFirst<{
        include_in_total_assets: number;
        is_selectable: number;
        card_number: string;
        opened_on: string;
      }>(
        'SELECT include_in_total_assets, is_selectable, card_number, opened_on FROM accounts WHERE id = ?',
        ['acc_wechat']
      );
      expect(accFlags).toEqual({
        include_in_total_assets: 1,
        is_selectable: 1,
        card_number: '',
        opened_on: '',
      });

      // v6：支持负债还款（可选付款资产账户与无账户直接还款），拒绝带分类或自引用还款
      await legacy.run(
        `INSERT INTO transactions (
          id, type, amount_cents, category_id, account_id, to_account_id, refund_of_id,
          occurred_on, note, created_at, updated_at
        ) VALUES ('tx_rep_asset', 'repayment', 1000, NULL, 'acc_old_credit', 'acc_wechat', NULL, '2026-11-22', '储蓄卡还款', ?, ?)`,
        [now, now]
      );
      await legacy.run(
        `INSERT INTO transactions (
          id, type, amount_cents, category_id, account_id, to_account_id, refund_of_id,
          occurred_on, note, created_at, updated_at
        ) VALUES ('tx_rep_direct', 'repayment', 500, NULL, 'acc_old_credit', NULL, NULL, '2026-11-23', '无账户直接还款', ?, ?)`,
        [now, now]
      );
      await expect(
        legacy.run(
          `INSERT INTO transactions (
            id, type, amount_cents, category_id, account_id, to_account_id, refund_of_id,
            occurred_on, note, created_at, updated_at
          ) VALUES ('tx_rep_bad_cat', 'repayment', 500, 'cat_exp_food', 'acc_old_credit', NULL, NULL, '2026-11-23', '', ?, ?)`,
          [now, now]
        )
      ).rejects.toThrow();
      await expect(
        legacy.run(
          `INSERT INTO transactions (
            id, type, amount_cents, category_id, account_id, to_account_id, refund_of_id,
            occurred_on, note, created_at, updated_at
          ) VALUES ('tx_rep_bad_self', 'repayment', 500, NULL, 'acc_old_credit', 'acc_old_credit', NULL, '2026-11-23', '', ?, ?)`,
          [now, now]
        )
      ).rejects.toThrow();

      const fkIssues = await legacy.getAll('PRAGMA foreign_key_check;');
      expect(fkIssues).toHaveLength(0);
    } finally {
      conn.close();
    }
  });
});
