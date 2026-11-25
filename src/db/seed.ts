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

export const DEFAULT_ACCOUNTS: readonly DefaultAccountSeed[] = [
  {
    id: 'acc_wechat',
    name: '微信零钱',
    kind: 'asset',
    category: 'digital',
    icon: 'wallet-outline',
    color: '#059669',
    sortOrder: 10,
  },
  {
    id: 'acc_alipay',
    name: '支付宝',
    kind: 'asset',
    category: 'digital',
    icon: 'phone-portrait-outline',
    color: '#0284C7',
    sortOrder: 20,
  },
  {
    id: 'acc_bank',
    name: '银行储蓄卡',
    kind: 'asset',
    category: 'bank',
    icon: 'card-outline',
    color: '#0F766E',
    sortOrder: 30,
  },
  {
    id: 'acc_cash',
    name: '现金',
    kind: 'asset',
    category: 'cash',
    icon: 'cash-outline',
    color: '#D97706',
    sortOrder: 40,
  },
  {
    id: 'acc_credit',
    name: '信用卡',
    kind: 'liability',
    category: 'credit',
    icon: 'card-outline',
    color: '#E11D48',
    sortOrder: 50,
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
 * 幂等初始化默认分类与默认账户（仅在对应表为空时写入）
 */
export async function seedDefaultData(db: SqlExecutor): Promise<void> {
  const now = new Date().toISOString();

  await db.withTransaction(async (tx) => {
    const catCount = await tx.getFirst<CountRow>('SELECT COUNT(*) AS count FROM categories');
    if ((catCount?.count ?? 0) === 0) {
      for (const cat of PRESET_CATEGORIES) {
        await tx.run(
          `INSERT INTO categories (id, name, type, icon, color, is_system, is_archived, sort_order, created_at)
           VALUES (?, ?, ?, ?, ?, 1, 0, ?, ?)`,
          [cat.id, cat.name, cat.type, cat.icon, cat.color, cat.sortOrder, now]
        );
      }
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
 * 清空账本并恢复默认分类与初始账户
 */
export async function resetDatabase(db: SqlExecutor): Promise<void> {
  await db.withTransaction(async (tx) => {
    await tx.run('DELETE FROM transactions');
    await tx.run('DELETE FROM accounts');
    await tx.run('DELETE FROM categories');
  });
  await seedDefaultData(db);
}

/**
 * 读取本地账本数据统计（用于设置页概览）
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
