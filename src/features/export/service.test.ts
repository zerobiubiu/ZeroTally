import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createNodeTestDatabase } from '../../db/node-test-client';
import { initializeSchema } from '../../db/schema';
import { DEFAULT_WALLET_ACCOUNT_ID, resetDatabase, seedDefaultData } from '../../db/seed';
import type { SqlExecutor } from '../../db/types';
import { adjustAccountBalance, createAccount, getAccountById } from '../accounts/service';
import { createCategory, listCategories } from '../categories/service';
import { createQuickTemplate, listAllQuickTemplates } from '../quick-record/service';
import { getThemePreferenceSetting, setThemePreferenceSetting } from '../settings/repository';
import { createRefundTransaction, createTransaction, getAllLedger } from '../transactions/service';
import {
  generateLedgerExport,
  importFullLedgerBackup,
  parseAndValidateFullBackup,
} from './service';

describe('export 完整 JSON 导出与原子导入恢复（真实 SQLite）', () => {
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

  it('完整导出外观、账户、分类、快捷模板与明细（含退款），清空后可无损原子恢复', async () => {
    await setThemePreferenceSetting(db, 'dark');
    await adjustAccountBalance(db, DEFAULT_WALLET_ACCOUNT_ID, 100000);
    const bank = await createAccount(db, {
      name: '招行卡',
      category: 'bank',
      initialBalanceCents: 50000,
      includeInTotalAssets: false,
      includeInNetWorth: true,
      isSelectable: true,
      icon: 'card-outline',
      color: '#0284C7',
      cardNumber: '6225 8801 2345 6789',
      bankName: '招商银行',
      bankBranch: '深圳分行科技园支行',
      openedOn: '2021-06-15',
    });
    const hiddenAcc = await createAccount(db, {
      name: '公积金',
      category: 'other',
      initialBalanceCents: 300000,
      includeInTotalAssets: true,
      includeInNetWorth: false,
      isSelectable: false,
      icon: 'business-outline',
      color: '#5C6479',
    });
    const customCat = await createCategory(db, {
      name: '宠物粮',
      type: 'expense',
      icon: 'mci:paw-outline',
      color: '#D97706',
      parentId: 'cat_exp_shopping',
    });
    await createQuickTemplate(db, {
      name: '买猫粮',
      type: 'expense',
      amountCents: 9900,
      categoryId: customCat.id,
      accountId: bank.id,
      note: '京东',
    });

    const exp = await createTransaction(db, {
      type: 'expense',
      amountCents: 12000,
      categoryId: customCat.id,
      accountId: bank.id,
      toAccountId: null,
      occurredOn: '2026-11-25',
      note: '猫粮两袋',
    });
    await createRefundTransaction(db, {
      originalTransactionId: exp.id,
      amountCents: 2000,
      accountId: bank.id,
      occurredOn: '2026-11-26',
      note: '价保退款',
    });
    await createTransaction(db, {
      type: 'transfer',
      amountCents: 20000,
      categoryId: null,
      accountId: DEFAULT_WALLET_ACCOUNT_ID,
      toAccountId: bank.id,
      occurredOn: '2026-11-26',
      note: '存入银行',
    });

    const artifact = await generateLedgerExport(db, new Date(2026, 10, 26));
    expect(artifact.filename).toBe('ZeroTally-2026-11-26.json');
    expect(artifact.mimeType).toBe('application/json');
    expect(artifact.transactionCount).toBe(3);
    expect(artifact.quickTemplateCount).toBe(1);

    // 清空账本并切回浅色，模拟新机或清空后恢复
    await resetDatabase(db);
    await setThemePreferenceSetting(db, 'light');
    expect((await getAllLedger(db)).summary.transactionCount).toBe(0);

    // 校验并执行完整恢复
    const validated = parseAndValidateFullBackup(artifact.content);
    expect(validated.checksumMatched).toBe(true);

    const imported = await importFullLedgerBackup(db, validated.payload);
    expect(imported.themePreference).toBe('dark');
    expect(imported.transactionCount).toBe(3);
    expect(imported.quickTemplateCount).toBe(1);

    expect(await getThemePreferenceSetting(db)).toBe('dark');
    expect((await getAccountById(db, DEFAULT_WALLET_ACCOUNT_ID))?.balanceCents).toBe(80000);
    const restoredBank = await getAccountById(db, bank.id);
    expect(restoredBank?.balanceCents).toBe(60000);
    expect(restoredBank?.includeInTotalAssets).toBe(false);
    expect(restoredBank?.includeInNetWorth).toBe(true);
    expect(restoredBank?.isSelectable).toBe(true);
    expect(restoredBank?.cardNumber).toBe('6225 8801 2345 6789');
    expect(restoredBank?.bankName).toBe('招商银行');
    expect(restoredBank?.bankBranch).toBe('深圳分行科技园支行');
    expect(restoredBank?.openedOn).toBe('2021-06-15');

    const restoredHidden = await getAccountById(db, hiddenAcc.id);
    expect(restoredHidden?.includeInTotalAssets).toBe(true);
    expect(restoredHidden?.includeInNetWorth).toBe(false);
    expect(restoredHidden?.isSelectable).toBe(false);

    const restoredCats = await listCategories(db, { includeArchived: true });
    expect(restoredCats.some((c) => c.id === customCat.id && c.icon === 'mci:paw-outline')).toBe(
      true
    );

    const restoredTemplates = await listAllQuickTemplates(db);
    expect(restoredTemplates).toHaveLength(1);
    expect(restoredTemplates[0]?.name).toBe('买猫粮');

    const restoredLedger = await getAllLedger(db);
    expect(restoredLedger.summary.expenseCents).toBe(10000); // 120 - 20 退款抵扣
    expect(restoredLedger.summary.refundCents).toBe(2000);
    expect(restoredLedger.summary.transferCents).toBe(20000);

    const fkIssues = await db.getAll('PRAGMA foreign_key_check;');
    expect(fkIssues).toHaveLength(0);
  });
});
