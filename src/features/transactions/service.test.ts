import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createNodeTestDatabase } from '../../db/node-test-client';
import { initializeSchema } from '../../db/schema';
import { seedDefaultData } from '../../db/seed';
import type { SqlExecutor } from '../../db/types';
import { adjustAccountBalance, getAccountById, getAssetOverview } from '../accounts/service';
import {
  createTransaction,
  deleteTransaction,
  getMonthlyLedger,
  listAccountTransactions,
  updateTransaction,
} from './service';

describe('transactions 事务与余额联动集成测试（真实 SQLite）', () => {
  let db: SqlExecutor;
  let close: () => void;

  beforeEach(async () => {
    const conn = createNodeTestDatabase(':memory:');
    db = conn.db;
    close = conn.close;
    await initializeSchema(db);
    await seedDefaultData(db);
    // 预设初始余额：银行卡 10,000 元，微信 500 元，信用卡欠款 0 元
    await adjustAccountBalance(db, 'acc_bank', 1_000_000);
    await adjustAccountBalance(db, 'acc_wechat', 50_000);
  });

  afterEach(() => {
    close();
  });

  it('支出、收入、信用卡消费与储蓄卡还款转账全流程余额与净资产严格自洽', async () => {
    // 1. 工资入账银行卡 +8000 元
    await createTransaction(db, {
      type: 'income',
      amountCents: 800_000,
      categoryId: 'cat_inc_salary',
      accountId: 'acc_bank',
      toAccountId: null,
      occurredOn: '2026-11-10',
      note: '11 月工资',
    });

    // 2. 微信餐饮支出 -68.50 元
    await createTransaction(db, {
      type: 'expense',
      amountCents: 6_850,
      categoryId: 'cat_exp_food',
      accountId: 'acc_wechat',
      toAccountId: null,
      occurredOn: '2026-11-12',
      note: '午餐',
    });

    // 3. 信用卡消费 -1200 元（欠款变为 -120000 分）
    await createTransaction(db, {
      type: 'expense',
      amountCents: 120_000,
      categoryId: 'cat_exp_shopping',
      accountId: 'acc_credit',
      toAccountId: null,
      occurredOn: '2026-11-15',
      note: '买冬季外套',
    });

    // 4. 银行卡向信用卡转账还款 500 元
    await createTransaction(db, {
      type: 'transfer',
      amountCents: 50_000,
      categoryId: null,
      accountId: 'acc_bank',
      toAccountId: 'acc_credit',
      occurredOn: '2026-11-20',
      note: '信用卡部分还款',
    });

    const bank = await getAccountById(db, 'acc_bank');
    const wechat = await getAccountById(db, 'acc_wechat');
    const credit = await getAccountById(db, 'acc_credit');

    expect(bank?.balanceCents).toBe(1_750_000); // 10000 + 8000 - 500 = 17500 元
    expect(wechat?.balanceCents).toBe(43_150); // 500 - 68.50 = 431.50 元
    expect(credit?.balanceCents).toBe(-70_000); // -1200 + 500 = -700 元欠款

    const overview = await getAssetOverview(db);
    expect(overview.summary.totalAssetsCents).toBe(1_793_150);
    expect(overview.summary.totalLiabilitiesCents).toBe(70_000);
    expect(overview.summary.netWorthCents).toBe(1_723_150);

    // 验证月度统计：转账 500 元不计入月度支出或收入
    const ledger = await getMonthlyLedger(db, '2026-11');
    expect(ledger.summary.incomeCents).toBe(800_000);
    expect(ledger.summary.expenseCents).toBe(126_850);
    expect(ledger.summary.balanceCents).toBe(673_150);
    expect(ledger.summary.transferCents).toBe(50_000);
    expect(ledger.summary.transactionCount).toBe(4);

    // 验证信用卡账户详情流水同时包含消费与转入还款
    const creditTxs = await listAccountTransactions(db, 'acc_credit');
    expect(creditTxs).toHaveLength(2);
  });

  it('编辑账目（改金额、换账户、切类型）与删除账目均精确回滚并重算全部受影响账户', async () => {
    const tx = await createTransaction(db, {
      type: 'expense',
      amountCents: 10_000,
      categoryId: 'cat_exp_food',
      accountId: 'acc_wechat',
      toAccountId: null,
      occurredOn: '2026-11-25',
    });
    expect((await getAccountById(db, 'acc_wechat'))?.balanceCents).toBe(40_000);

    // 将微信支出 100 元改为银行卡向支付宝转账 200 元
    await updateTransaction(db, tx.id, {
      type: 'transfer',
      amountCents: 20_000,
      categoryId: null,
      accountId: 'acc_bank',
      toAccountId: 'acc_alipay',
      occurredOn: '2026-11-25',
      note: '更正为转账',
    });

    expect((await getAccountById(db, 'acc_wechat'))?.balanceCents).toBe(50_000); // 微信全额回滚
    expect((await getAccountById(db, 'acc_bank'))?.balanceCents).toBe(980_000); // 银行卡 -200
    expect((await getAccountById(db, 'acc_alipay'))?.balanceCents).toBe(20_000); // 支付宝 +200

    // 删除该笔转账后，所有账户回到初始余额
    await deleteTransaction(db, tx.id);
    expect((await getAccountById(db, 'acc_wechat'))?.balanceCents).toBe(50_000);
    expect((await getAccountById(db, 'acc_bank'))?.balanceCents).toBe(1_000_000);
    expect((await getAccountById(db, 'acc_alipay'))?.balanceCents).toBe(0);
  });

  it('分类类型不匹配时拒绝写入且保持账户余额不被污染', async () => {
    await expect(
      createTransaction(db, {
        type: 'expense',
        amountCents: 5_000,
        categoryId: 'cat_inc_salary', // 用收入分类记支出
        accountId: 'acc_wechat',
        toAccountId: null,
        occurredOn: '2026-11-25',
      })
    ).rejects.toThrow('不匹配');

    expect((await getAccountById(db, 'acc_wechat'))?.balanceCents).toBe(50_000);
  });
});
