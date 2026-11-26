import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createNodeTestDatabase } from '../../db/node-test-client';
import { initializeSchema } from '../../db/schema';
import { DEFAULT_WALLET_ACCOUNT_ID, seedDefaultData } from '../../db/seed';
import type { SqlExecutor } from '../../db/types';
import { createTransaction } from '../transactions/service';
import {
  adjustAccountBalance,
  archiveAccount,
  createAccount,
  deleteAccount,
  getAssetOverview,
  restoreAccount,
  updateAccount,
} from './service';

describe('accounts 服务层（真实 SQLite）', () => {
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

  it('支持新建、更新、余额校准与资产总览计算', async () => {
    const saving = await createAccount(db, {
      name: '招商工资卡',
      kind: 'asset',
      category: 'bank',
      initialBalanceCents: 500000,
      icon: 'card-outline',
      color: '#0284C7',
      note: '尾号 8810',
    });

    const credit = await createAccount(db, {
      name: '招行信用卡',
      kind: 'liability',
      category: 'credit',
      initialBalanceCents: -120000,
      icon: 'card-outline',
      color: '#E11D48',
    });

    const updated = await updateAccount(db, saving.id, {
      name: '招商储蓄卡',
      kind: 'asset',
      category: 'bank',
      includeInNetWorth: true,
      icon: 'card-outline',
      color: '#0F766E',
      note: '工资主卡',
    });
    expect(updated.name).toBe('招商储蓄卡');

    const adjusted = await adjustAccountBalance(db, credit.id, -80000);
    expect(adjusted.deltaCents).toBe(40000);
    expect(adjusted.account.balanceCents).toBe(-80000);

    const overview = await getAssetOverview(db);
    expect(overview.summary.totalAssetsCents).toBe(500000);
    expect(overview.summary.totalLiabilitiesCents).toBe(80000);
    expect(overview.summary.netWorthCents).toBe(420000);
  });

  it('关联账目的账户禁止物理删除，但支持归档与恢复', async () => {
    const wechat = await createAccount(db, {
      name: '微信零钱',
      kind: 'asset',
      category: 'digital',
      initialBalanceCents: 10000,
      icon: 'wallet-outline',
      color: '#059669',
    });

    await createTransaction(db, {
      type: 'expense',
      amountCents: 3500,
      categoryId: 'cat_exp_food',
      accountId: wechat.id,
      toAccountId: null,
      occurredOn: '2026-11-25',
      note: '午饭',
    });

    await expect(deleteAccount(db, wechat.id)).rejects.toThrow('停用归档');

    const archived = await archiveAccount(db, wechat.id);
    expect(archived.isArchived).toBe(true);

    const overviewArchived = await getAssetOverview(db);
    expect(overviewArchived.archivedAccounts.some((a) => a.id === wechat.id)).toBe(true);

    const restored = await restoreAccount(db, wechat.id);
    expect(restored.isArchived).toBe(false);
  });

  it('无关联账目的账户可直接删除，且保护最后一个可用账户', async () => {
    const temp = await createAccount(db, {
      name: '临时钱包',
      kind: 'asset',
      category: 'cash',
      initialBalanceCents: 0,
      icon: 'cash-outline',
      color: '#059669',
    });

    await deleteAccount(db, temp.id);

    // 仅剩默认唯一「钱包」时禁止停用或删除
    await expect(archiveAccount(db, DEFAULT_WALLET_ACCOUNT_ID)).rejects.toThrow(
      '至少需要保留一个可用账户'
    );
    await expect(deleteAccount(db, DEFAULT_WALLET_ACCOUNT_ID)).rejects.toThrow(
      '至少需要保留一个可用账户'
    );
  });
});
