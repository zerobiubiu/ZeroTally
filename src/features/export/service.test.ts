import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createNodeTestDatabase } from '../../db/node-test-client';
import { initializeSchema } from '../../db/schema';
import { seedDefaultData } from '../../db/seed';
import type { SqlExecutor } from '../../db/types';
import { adjustAccountBalance } from '../accounts/service';
import { createTransaction } from '../transactions/service';
import { generateLedgerExport } from './service';
import type { LedgerExportPayload } from './types';

describe('export 导出服务集成测试（真实 SQLite）', () => {
  let db: SqlExecutor;
  let close: () => void;

  beforeEach(async () => {
    const conn = createNodeTestDatabase(':memory:');
    db = conn.db;
    close = conn.close;
    await initializeSchema(db);
    await seedDefaultData(db);
    await adjustAccountBalance(db, 'acc_bank', 100000);
  });

  afterEach(() => {
    close();
  });

  it('从真实数据库导出一致的 JSON 与 CSV 产物', async () => {
    await createTransaction(db, {
      type: 'expense',
      amountCents: 4500,
      categoryId: 'cat_exp_food',
      accountId: 'acc_bank',
      toAccountId: null,
      occurredOn: '2026-11-25',
      note: '晚餐',
    });
    await createTransaction(db, {
      type: 'transfer',
      amountCents: 20000,
      categoryId: null,
      accountId: 'acc_bank',
      toAccountId: 'acc_wechat',
      occurredOn: '2026-11-25',
      note: '充零钱',
    });

    const jsonArtifact = await generateLedgerExport(db, 'json', new Date(2026, 10, 25));
    expect(jsonArtifact.filename).toBe('keep-accounts-2026-11-25.json');
    expect(jsonArtifact.mimeType).toBe('application/json');
    expect(jsonArtifact.transactionCount).toBe(2);

    const parsed = JSON.parse(jsonArtifact.content) as LedgerExportPayload;
    expect(parsed.summary.netWorthCents).toBe(95500);
    expect(parsed.accounts.find((a) => a.id === 'acc_bank')?.balanceCents).toBe(75500);
    expect(parsed.accounts.find((a) => a.id === 'acc_wechat')?.balanceCents).toBe(20000);

    const csvArtifact = await generateLedgerExport(db, 'csv', new Date(2026, 10, 25));
    expect(csvArtifact.filename).toBe('keep-accounts-2026-11-25.csv');
    expect(csvArtifact.content).toContain('转账,,200.00,银行储蓄卡,微信零钱,充零钱');
    expect(csvArtifact.content).toContain('支出,餐饮美食,-45.00,银行储蓄卡,,晚餐');
  });
});
