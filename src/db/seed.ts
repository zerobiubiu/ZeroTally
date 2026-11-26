import type { AccountCategory, AccountKind } from '../features/accounts/types';
import { PRESET_CATEGORIES } from '../features/categories/presets';
import type { SqlExecutor } from './types';

interface DefaultAccountSeed {
  id: string;
  name: string;
  kind: AccountKind;
  category: AccountCategory;
  icon: string;
  color: string;
  sortOrder: number;
}

export const DEFAULT_WALLET_ACCOUNT_ID = 'acc_wallet';

/**
 * 全新安装或清空账本后的唯一默认账户：「钱包」（现金资产，初始余额 ¥0.00）
 */
export const DEFAULT_ACCOUNTS: readonly DefaultAccountSeed[] = [
  {
    id: DEFAULT_WALLET_ACCOUNT_ID,
    name: '钱包',
    kind: 'asset',
    category: 'cash',
    icon: 'wallet-outline',
    color: '#017853',
    sortOrder: 10,
  },
] as const;

interface CountRow {
  count: number;
}

export interface DatabaseStats {
  transactionCount: number;
  activeAccountCount: number;
  archivedAccountCount: number;
  activeCategoryCount: number;
}

/**
 * 幂等初始化默认分类与默认账户：
 * - 预设分类按 ID `INSERT OR IGNORE` 补齐（老用户升级可补全预设二级且不覆盖已修改内容）；
 * - 默认账户仅在账户表为空时写入唯一的「钱包（¥0.00）」（老用户覆盖升级不改变已有账户）。
 */
export async function seedDefaultData(db: SqlExecutor): Promise<void> {
  const now = new Date().toISOString();

  await db.withTransaction(async (tx) => {
    for (const cat of PRESET_CATEGORIES) {
      // 二级预设继承上级的停用状态，避免在已停用一级下冒出启用的二级
      await tx.run(
        `INSERT OR IGNORE INTO categories (id, name, type, icon, color, parent_id, is_system, is_archived, sort_order, created_at)
         VALUES (?, ?, ?, ?, ?, ?, 1, COALESCE((SELECT is_archived FROM categories WHERE id = ?), 0), ?, ?)`,
        [
          cat.id,
          cat.name,
          cat.type,
          cat.icon,
          cat.color,
          cat.parentId,
          cat.parentId,
          cat.sortOrder,
          now,
        ]
      );
    }

    const accCount = await tx.getFirst<CountRow>('SELECT COUNT(*) AS count FROM accounts');
    if ((accCount?.count ?? 0) === 0) {
      for (const acc of DEFAULT_ACCOUNTS) {
        await tx.run(
          `INSERT INTO accounts (
             id, name, kind, category, balance_cents, include_in_net_worth,
             icon, color, note, is_archived, sort_order, created_at, updated_at
           ) VALUES (?, ?, ?, ?, 0, 1, ?, ?, '', 0, ?, ?, ?)`,
          [acc.id, acc.name, acc.kind, acc.category, acc.icon, acc.color, acc.sortOrder, now, now]
        );
      }
    }
  });
}

/**
 * 清空账本：删除全部明细与快捷模板，账户重置为唯一的「钱包（¥0.00）」，分类恢复为系统预设分类。
 */
export async function resetDatabase(db: SqlExecutor): Promise<void> {
  await db.withTransaction(async (tx) => {
    await tx.run('DELETE FROM transactions');
    await tx.run('DELETE FROM quick_templates');
    await tx.run('DELETE FROM accounts');
    await tx.run('DELETE FROM categories');
  });
  await seedDefaultData(db);
}

/**
 * 读取本地账本数据统计（用于清空账本安全核对与概览）
 */
export async function getDatabaseStats(db: SqlExecutor): Promise<DatabaseStats> {
  const [txRow, activeAccRow, archivedAccRow, activeCatRow] = await Promise.all([
    db.getFirst<CountRow>('SELECT COUNT(*) AS count FROM transactions'),
    db.getFirst<CountRow>('SELECT COUNT(*) AS count FROM accounts WHERE is_archived = 0'),
    db.getFirst<CountRow>('SELECT COUNT(*) AS count FROM accounts WHERE is_archived = 1'),
    db.getFirst<CountRow>('SELECT COUNT(*) AS count FROM categories WHERE is_archived = 0'),
  ]);

  return {
    transactionCount: txRow?.count ?? 0,
    activeAccountCount: activeAccRow?.count ?? 0,
    archivedAccountCount: archivedAccRow?.count ?? 0,
    activeCategoryCount: activeCatRow?.count ?? 0,
  };
}
