import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createNodeTestDatabase } from '../../db/node-test-client';
import { initializeSchema } from '../../db/schema';
import { seedDefaultData } from '../../db/seed';
import type { SqlExecutor } from '../../db/types';
import {
  adjustAccountBalance,
  archiveAccount,
  getAccountById,
  getAssetOverview,
  listAccounts,
} from '../accounts/service';
import { listCategories } from '../categories/service';
import { resolveRememberedAccountId } from './rules';
import {
  createRefundTransaction,
  createTransaction,
  deleteTransaction,
  getAllLedger,
  getCategoryAccountMemory,
  getMonthlyLedger,
  getTransactionById,
  getYearlyLedger,
  listAccountTransactions,
  listTransactionRefunds,
  updateRefundTransaction,
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

    // 为多账户事务、转账与记忆测试准备银行卡、微信、支付宝、现金与信用卡测试账户
    const now = new Date().toISOString();
    const extraAccounts = [
      ['acc_wechat', '微信零钱', 'asset', 'digital', 0, 1, 'chatbubble-ellipses-outline', '#059669', 15],
      ['acc_alipay', '支付宝', 'asset', 'digital', 0, 1, 'phone-portrait-outline', '#0284C7', 20],
      ['acc_bank', '银行储蓄卡', 'asset', 'bank', 0, 1, 'card-outline', '#0F766E', 30],
      ['acc_cash', '现金', 'asset', 'cash', 0, 1, 'cash-outline', '#D97706', 40],
      ['acc_credit', '信用卡', 'liability', 'credit', 0, 1, 'card-outline', '#E11D48', 50],
    ] as const;
    for (const [id, name, kind, category, bal, include, icon, color, sortOrder] of extraAccounts) {
      await db.run(
        `INSERT INTO accounts (
          id, name, kind, category, balance_cents, include_in_net_worth,
          icon, color, note, is_archived, sort_order, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, '', 0, ?, ?, ?)`,
        [id, name, kind, category, bal, include, icon, color, sortOrder, now, now]
      );
    }

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

  it('关联抵扣式退款：支持多次部分退款、编辑退款、防超退、抵扣月支出并在删原支出时连带回滚', async () => {
    // 微信支出 200 元购买外套
    const expense = await createTransaction(db, {
      type: 'expense',
      amountCents: 20_000,
      categoryId: 'cat_exp_clothing_clothes',
      accountId: 'acc_wechat',
      toAccountId: null,
      occurredOn: '2026-11-20',
      note: '网购外套',
    });
    expect((await getAccountById(db, 'acc_wechat'))?.balanceCents).toBe(30_000);

    // 第一次部分退款 60 元退回微信
    const refund1 = await createRefundTransaction(db, {
      originalTransactionId: expense.id,
      amountCents: 6_000,
      accountId: 'acc_wechat',
      occurredOn: '2026-11-21',
      note: '退差价',
    });
    // 第二次部分退款 80 元退回支付宝
    const refund2 = await createRefundTransaction(db, {
      originalTransactionId: expense.id,
      amountCents: 8_000,
      accountId: 'acc_alipay',
      occurredOn: '2026-11-22',
      note: '退部分商品',
    });

    // 原支出详情正确统计已退 140 元
    const expenseDetail = await getTransactionById(db, expense.id);
    expect(expenseDetail?.refundedCents).toBe(14_000);
    expect(await listTransactionRefunds(db, expense.id)).toHaveLength(2);

    // 月度统计：净支出 = 200 - 140 = 60 元，收入仍为 0（不虚增收入）
    const ledger = await getMonthlyLedger(db, '2026-11');
    expect(ledger.summary.expenseCents).toBe(6_000);
    expect(ledger.summary.incomeCents).toBe(0);
    expect(ledger.summary.refundCents).toBe(14_000);
    expect(ledger.summary.balanceCents).toBe(-6_000);

    // 账户余额精确联动
    expect((await getAccountById(db, 'acc_wechat'))?.balanceCents).toBe(36_000); // 500 - 200 + 60
    expect((await getAccountById(db, 'acc_alipay'))?.balanceCents).toBe(8_000); // 0 + 80

    // 允许超额退款（如含运费/补偿金多退 70 元，总退款 210 > 原支出 200）
    const overRefund = await createRefundTransaction(db, {
      originalTransactionId: expense.id,
      amountCents: 7_000,
      accountId: 'acc_wechat',
      occurredOn: '2026-11-22',
      note: '运费补偿',
    });
    expect((await getTransactionById(db, expense.id))?.refundedCents).toBe(21_000);
    expect((await getAccountById(db, 'acc_wechat'))?.balanceCents).toBe(43_000);
    // 清理该超额退款验证余额精准回滚
    await deleteTransaction(db, overRefund.id);
    expect((await getAccountById(db, 'acc_wechat'))?.balanceCents).toBe(36_000);

    // 原支出已有退款时，仍禁止更改类型（防止孤立退款）
    await expect(
      updateTransaction(db, expense.id, {
        type: 'income',
        amountCents: 20_000,
        categoryId: 'cat_inc_salary',
        accountId: 'acc_wechat',
        toAccountId: null,
        occurredOn: '2026-11-20',
      })
    ).rejects.toThrow('请先删除退款后再更改类型');

    // 编辑退款1：60 元 -> 50 元，账户余额同步回扣 10 元
    await updateRefundTransaction(db, refund1.id, {
      amountCents: 5_000,
      accountId: 'acc_wechat',
      occurredOn: '2026-11-21',
      note: '修正差价',
    });
    expect((await getAccountById(db, 'acc_wechat'))?.balanceCents).toBe(35_000);

    // 单独删除退款2：支付宝扣回 80 元
    await deleteTransaction(db, refund2.id);
    expect((await getAccountById(db, 'acc_alipay'))?.balanceCents).toBe(0);
    expect((await getTransactionById(db, expense.id))?.refundedCents).toBe(5_000);

    // 删除原支出：连带删除剩余退款1 并精确回滚全部受影响账户至初始值
    await deleteTransaction(db, expense.id);
    expect((await getAccountById(db, 'acc_wechat'))?.balanceCents).toBe(50_000);
    expect(await getTransactionById(db, refund1.id)).toBeNull();
  });

  it('按年查询全年账单汇总与按日分组流水', async () => {
    await createTransaction(db, {
      type: 'expense',
      amountCents: 3_000,
      categoryId: 'cat_exp_food',
      accountId: 'acc_wechat',
      toAccountId: null,
      occurredOn: '2026-02-14',
    });
    await createTransaction(db, {
      type: 'income',
      amountCents: 50_000,
      categoryId: 'cat_inc_salary',
      accountId: 'acc_bank',
      toAccountId: null,
      occurredOn: '2026-11-05',
    });
    await createTransaction(db, {
      type: 'expense',
      amountCents: 9_000,
      categoryId: 'cat_exp_food',
      accountId: 'acc_wechat',
      toAccountId: null,
      occurredOn: '2025-12-30',
    });

    const yearly = await getYearlyLedger(db, 2026);
    expect(yearly.mode).toBe('year');
    expect(yearly.periodKey).toBe('2026');
    expect(yearly.summary.expenseCents).toBe(3_000);
    expect(yearly.summary.incomeCents).toBe(50_000);
    expect(yearly.sections).toHaveLength(2);

    const all = await getAllLedger(db);
    expect(all.mode).toBe('all');
    expect(all.periodKey).toBe('all');
    expect(all.summary.expenseCents).toBe(12_000);
    expect(all.summary.incomeCents).toBe(50_000);
    expect(all.summary.balanceCents).toBe(38_000);
    expect(all.sections).toHaveLength(3);
    expect(all.sections[0]?.occurredOn).toBe('2026-11-05');
    expect(all.sections[2]?.occurredOn).toBe('2025-12-30');
  });

  it('从历史流水派生分类账户记忆：支持两级回退、排除退款/转账、停用账户自动退回并随删改实时自洽', async () => {
    const categories = await listCategories(db);
    const activeAccounts = await listAccounts(db);

    // 1. 餐饮 · 午餐用微信；餐饮 · 晚餐随后用支付宝（按操作顺序，大类最新记忆应为支付宝）
    await createTransaction(db, {
      type: 'expense',
      amountCents: 2_800,
      categoryId: 'cat_exp_food_lunch',
      accountId: 'acc_wechat',
      toAccountId: null,
      occurredOn: '2026-11-26',
    });
    const dinnerTx = await createTransaction(db, {
      type: 'expense',
      amountCents: 4_500,
      categoryId: 'cat_exp_food_dinner',
      accountId: 'acc_alipay',
      toAccountId: null,
      occurredOn: '2026-11-20', // 账单日期更早，但录入更晚，应按操作先后胜出
    });

    // 2. 工资收入入账银行卡
    await createTransaction(db, {
      type: 'income',
      amountCents: 800_000,
      categoryId: 'cat_inc_salary',
      accountId: 'acc_bank',
      toAccountId: null,
      occurredOn: '2026-11-10',
    });

    // 3. 服装买衣服先用微信，再用信用卡；并对微信那笔退回支付宝，且记一笔转账
    const clothesWechat = await createTransaction(db, {
      type: 'expense',
      amountCents: 15_000,
      categoryId: 'cat_exp_clothing_clothes',
      accountId: 'acc_wechat',
      toAccountId: null,
      occurredOn: '2026-11-21',
    });
    await createTransaction(db, {
      type: 'expense',
      amountCents: 30_000,
      categoryId: 'cat_exp_clothing_clothes',
      accountId: 'acc_credit',
      toAccountId: null,
      occurredOn: '2026-11-22',
    });
    // 退款退到支付宝，绝不可污染「服装 · 衣服」的支出记忆
    await createRefundTransaction(db, {
      originalTransactionId: clothesWechat.id,
      amountCents: 5_000,
      accountId: 'acc_alipay',
      occurredOn: '2026-11-26',
    });
    // 转账绝不计入收支记忆
    await createTransaction(db, {
      type: 'transfer',
      amountCents: 10_000,
      categoryId: null,
      accountId: 'acc_bank',
      toAccountId: 'acc_cash',
      occurredOn: '2026-11-26',
    });

    const memory1 = await getCategoryAccountMemory(db);
    // 精确分类记忆
    expect(memory1.byCategoryId.cat_exp_food_lunch).toBe('acc_wechat');
    expect(memory1.byCategoryId.cat_exp_food_dinner).toBe('acc_alipay');
    expect(memory1.byCategoryId.cat_exp_clothing_clothes).toBe('acc_credit');
    expect(memory1.byCategoryId.cat_inc_salary).toBe('acc_bank');
    // 所属一级大类记忆（餐饮最新操作是晚餐支付宝；支出最新操作是信用卡买衣服）
    expect(memory1.byRootCategoryId.cat_exp_food).toBe('acc_alipay');
    expect(memory1.byType.expense).toBe('acc_credit');
    expect(memory1.byType.income).toBe('acc_bank');

    // 新子分类「餐饮 · 早餐」无直接记录 -> 回退大类记忆「支付宝」
    expect(
      resolveRememberedAccountId({
        txType: 'expense',
        categoryId: 'cat_exp_food_breakfast',
        categories,
        accounts: activeAccounts,
        memory: memory1,
      })
    ).toBe('acc_alipay');

    // 4. 停用信用卡后，「服装 · 衣服」自动平滑回退到先前活跃账户「微信」（而非被退款支付宝污染）
    await archiveAccount(db, 'acc_credit');
    const memoryAfterArchive = await getCategoryAccountMemory(db);
    expect(memoryAfterArchive.byCategoryId.cat_exp_clothing_clothes).toBe('acc_wechat');

    // 5. 删除支付宝晚餐流水后，餐饮大类记忆实时回到「微信」
    await deleteTransaction(db, dinnerTx.id);
    const memoryAfterDelete = await getCategoryAccountMemory(db);
    expect(memoryAfterDelete.byCategoryId.cat_exp_food_dinner).toBeUndefined();
    expect(memoryAfterDelete.byRootCategoryId.cat_exp_food).toBe('acc_wechat');
  });
});
