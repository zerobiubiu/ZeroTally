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

  it('类型唯一决定性质，支持银行卡信息、三独立开关与资产总览计算', async () => {
    const saving = await createAccount(db, {
      name: '招商工资卡',
      category: 'bank',
      initialBalanceCents: 500000,
      icon: 'card-outline',
      color: '#0284C7',
      note: '尾号 8810',
      cardNumber: '6225880123456789',
      bankName: '招商银行',
      bankBranch: '深圳分行科技园支行',
      openedOn: '2020-05-01',
    });
    expect(saving.kind).toBe('asset');
    expect(saving.cardNumber).toBe('6225880123456789');
    expect(saving.includeInTotalAssets).toBe(true);
    expect(saving.isSelectable).toBe(true);

    // 信用卡类型自动判为负债，无需手动指定性质
    const credit = await createAccount(db, {
      name: '招行信用卡',
      category: 'credit',
      initialBalanceCents: -120000,
      icon: 'card-outline',
      color: '#E11D48',
    });
    expect(credit.kind).toBe('liability');

    const updated = await updateAccount(db, saving.id, {
      name: '招商储蓄卡',
      category: 'bank',
      includeInNetWorth: true,
      includeInTotalAssets: false,
      isSelectable: false,
      icon: 'card-outline',
      color: '#0F766E',
      note: '工资主卡',
      cardNumber: '6225880123456789',
      bankName: '招商银行',
      bankBranch: '',
      openedOn: '',
    });
    expect(updated.name).toBe('招商储蓄卡');
    expect(updated.includeInTotalAssets).toBe(false);
    expect(updated.isSelectable).toBe(false);
    expect(updated.bankBranch).toBe('');

    const adjusted = await adjustAccountBalance(db, credit.id, -80000);
    expect(adjusted.deltaCents).toBe(40000);
    expect(adjusted.account.balanceCents).toBe(-80000);

    // 储蓄卡关闭总资产开关后不计入总资产，但净资产仍包含；信用卡欠款计入总负债
    const overview = await getAssetOverview(db);
    expect(overview.summary.totalAssetsCents).toBe(0);
    expect(overview.summary.totalLiabilitiesCents).toBe(80000);
    expect(overview.summary.netWorthCents).toBe(420000);
  });

  it('非银行卡类型自动清空卡信息，非法开户日期被拒绝', async () => {
    const wechat = await createAccount(db, {
      name: '微信零钱',
      category: 'digital',
      initialBalanceCents: 0,
      icon: 'wallet-outline',
      color: '#059669',
      cardNumber: '1234',
      bankName: '不应保留',
    });
    expect(wechat.cardNumber).toBe('');
    expect(wechat.bankName).toBe('');

    await expect(
      createAccount(db, {
        name: '坏日期卡',
        category: 'bank',
        initialBalanceCents: 0,
        icon: 'card-outline',
        color: '#0284C7',
        openedOn: '2020-13-99',
      })
    ).rejects.toThrow('开户日期格式无效');
  });

  it('归档后不参与统计与可选列表，恢复后回归；保护最后一个可用账户', async () => {
    const wechat = await createAccount(db, {
      name: '微信零钱',
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

    const archived = await archiveAccount(db, wechat.id);
    expect(archived.isArchived).toBe(true);

    const overviewArchived = await getAssetOverview(db);
    expect(overviewArchived.archivedAccounts.some((a) => a.id === wechat.id)).toBe(true);
    // 归档账户余额（6500 分）不再计入任何统计
    expect(overviewArchived.summary.totalAssetsCents).toBe(0);
    expect(overviewArchived.summary.netWorthCents).toBe(0);

    const restored = await restoreAccount(db, wechat.id);
    expect(restored.isArchived).toBe(false);
    const overviewRestored = await getAssetOverview(db);
    expect(overviewRestored.summary.netWorthCents).toBe(6500);

    // 仅剩默认唯一「钱包」时禁止归档
    await archiveAccount(db, wechat.id);
    await expect(archiveAccount(db, DEFAULT_WALLET_ACCOUNT_ID)).rejects.toThrow(
      '至少需要保留一个可用账户'
    );
  });

  it('关闭最后一个可选账户或归档最后一个可选账户被拒绝', async () => {
    // 默认钱包是唯一可选账户：关闭其可选开关被拒绝
    await expect(
      updateAccount(db, DEFAULT_WALLET_ACCOUNT_ID, {
        name: '钱包',
        category: 'cash',
        includeInNetWorth: true,
        includeInTotalAssets: true,
        isSelectable: false,
        icon: 'wallet-outline',
        color: '#017853',
        note: '',
        cardNumber: '',
        bankName: '',
        bankBranch: '',
        openedOn: '',
      })
    ).rejects.toThrow('至少需要保留一个可选账户');

    // 新增一个不可选账户后，归档唯一可选的钱包同样被拒绝
    await createAccount(db, {
      name: '收藏卡',
      category: 'bank',
      initialBalanceCents: 0,
      isSelectable: false,
      icon: 'card-outline',
      color: '#0284C7',
    });
    await expect(archiveAccount(db, DEFAULT_WALLET_ACCOUNT_ID)).rejects.toThrow(
      '至少需要保留一个可选账户'
    );
  });
});