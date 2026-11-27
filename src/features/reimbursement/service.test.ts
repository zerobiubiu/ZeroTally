import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createNodeTestDatabase } from '../../db/node-test-client';
import { initializeSchema } from '../../db/schema';
import { DEFAULT_WALLET_ACCOUNT_ID, seedDefaultData } from '../../db/seed';
import type { SqlExecutor } from '../../db/types';
import { getAccountById } from '../accounts/service';
import { createTransaction, deleteTransaction } from '../transactions/service';
import {
  getReimbursementOverview,
  markExpenseForReimbursement,
  settleReimbursement,
} from './service';

describe('reimbursement 可选报销追踪服务集成测试（真实 SQLite）', () => {
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

  it('支持标记待报销并以「关联退款抵扣」或「独立收入」核销并原子联动账户余额', async () => {
    const exp1 = await createTransaction(db, {
      type: 'expense',
      amountCents: 20_000,
      categoryId: 'cat_exp_transport',
      accountId: DEFAULT_WALLET_ACCOUNT_ID,
      toAccountId: null,
      occurredOn: '2026-11-10',
      note: '出差高铁票',
    });
    const exp2 = await createTransaction(db, {
      type: 'expense',
      amountCents: 15_000,
      categoryId: 'cat_exp_food',
      accountId: DEFAULT_WALLET_ACCOUNT_ID,
      toAccountId: null,
      occurredOn: '2026-11-12',
      note: '客户餐费',
    });

    await markExpenseForReimbursement(db, { transactionId: exp1.id });
    await markExpenseForReimbursement(db, { transactionId: exp2.id, expectedCents: 12_000 });

    const beforeSettle = await getReimbursementOverview(db);
    expect(beforeSettle.summary.pendingCount).toBe(2);
    expect(beforeSettle.summary.pendingTotalCents).toBe(32_000);

    // 模式 1：抵扣原支出（退款）
    const settled1 = await settleReimbursement(db, {
      transactionId: exp1.id,
      amountCents: 20_000,
      accountId: DEFAULT_WALLET_ACCOUNT_ID,
      mode: 'refund',
      occurredOn: '2026-11-18',
    });
    expect(settled1.status).toBe('reimbursed');
    expect(settled1.settlementMode).toBe('refund');
    expect(settled1.settlementTransactionId).toBeTruthy();

    // 模式 2：记为报销收入
    const settled2 = await settleReimbursement(db, {
      transactionId: exp2.id,
      amountCents: 12_000,
      accountId: DEFAULT_WALLET_ACCOUNT_ID,
      mode: 'income',
      occurredOn: '2026-11-20',
    });
    expect(settled2.status).toBe('reimbursed');
    expect(settled2.settlementMode).toBe('income');

    // 账户净余额：-20000 -15000 +20000 +12000 = -3000 分
    const wallet = await getAccountById(db, DEFAULT_WALLET_ACCOUNT_ID);
    expect(wallet?.balanceCents).toBe(-3_000);

    const afterSettle = await getReimbursementOverview(db);
    expect(afterSettle.summary.pendingCount).toBe(0);
    expect(afterSettle.summary.reimbursedCount).toBe(2);
    expect(afterSettle.summary.reimbursedTotalCents).toBe(32_000);
  });

  it('原支出被删除后自动清理残留报销索引，避免空指针脏数据', async () => {
    const exp = await createTransaction(db, {
      type: 'expense',
      amountCents: 8_800,
      categoryId: 'cat_exp_food',
      accountId: DEFAULT_WALLET_ACCOUNT_ID,
      toAccountId: null,
      occurredOn: '2026-11-15',
    });

    await markExpenseForReimbursement(db, { transactionId: exp.id });
    await deleteTransaction(db, exp.id);

    const overview = await getReimbursementOverview(db);
    expect(overview.pending).toHaveLength(0);
    expect(overview.summary.pendingCount).toBe(0);
  });
});
