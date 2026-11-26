import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createNodeTestDatabase } from '../../db/node-test-client';
import { initializeSchema } from '../../db/schema';
import { DEFAULT_WALLET_ACCOUNT_ID, seedDefaultData } from '../../db/seed';
import type { SqlExecutor } from '../../db/types';
import { getAccountById } from '../accounts/service';
import { createTransaction } from '../transactions/service';
import {
  createQuickTemplate,
  deleteQuickTemplate,
  executeQuickRecord,
  listQuickRecordButtons,
  updateQuickTemplate,
} from './service';

describe('quick-record 快捷记账服务层（真实 SQLite）', () => {
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

  it('无自定义模板时，自动基于近 30 天高频收支流水生成推荐快捷按钮', async () => {
    // 近 30 天内记 2 次地铁 5 元、1 次咖啡 18 元，以及 1 笔 45 天前的旧账（应被排除）
    for (const date of ['2026-11-24', '2026-11-25']) {
      await createTransaction(db, {
        type: 'expense',
        amountCents: 500,
        categoryId: 'cat_exp_transport_metro',
        accountId: DEFAULT_WALLET_ACCOUNT_ID,
        toAccountId: null,
        occurredOn: date,
        note: '上班地铁',
      });
    }
    await createTransaction(db, {
      type: 'expense',
      amountCents: 1800,
      categoryId: 'cat_exp_food_drinks',
      accountId: DEFAULT_WALLET_ACCOUNT_ID,
      toAccountId: null,
      occurredOn: '2026-11-25',
    });
    await createTransaction(db, {
      type: 'expense',
      amountCents: 9900,
      categoryId: 'cat_exp_shopping_daily',
      accountId: DEFAULT_WALLET_ACCOUNT_ID,
      toAccountId: null,
      occurredOn: '2026-10-01',
    });

    const result = await listQuickRecordButtons(db, '2026-11-26');
    expect(result.mode).toBe('recommended');
    expect(result.items).toHaveLength(2);
    expect(result.items[0]).toMatchObject({
      source: 'recommended',
      categoryId: 'cat_exp_transport_metro',
      amountCents: 500,
    });

    // 推荐项被快速点击记账导致排名变化后，其 ID 必须保持稳定（确保 3 秒原地撤销卡片不丢失状态）
    const coffeeBefore = result.items[1]!;
    await executeQuickRecord(db, coffeeBefore, '2026-11-26');
    await executeQuickRecord(db, coffeeBefore, '2026-11-26');
    const reordered = await listQuickRecordButtons(db, '2026-11-26');
    expect(reordered.items[0]?.id).toBe(coffeeBefore.id);
  });

  it('支持自定义快捷模板增改删，存在自定义时优先展示自定义，并可一键入账联动余额', async () => {
    const tpl = await createQuickTemplate(db, {
      name: '早饭',
      type: 'expense',
      amountCents: 1200,
      categoryId: 'cat_exp_food_breakfast',
      accountId: DEFAULT_WALLET_ACCOUNT_ID,
      note: '豆浆油条',
    });

    const updated = await updateQuickTemplate(db, tpl.id, {
      name: '早餐套餐',
      type: 'expense',
      amountCents: 1500,
      categoryId: 'cat_exp_food_breakfast',
      accountId: DEFAULT_WALLET_ACCOUNT_ID,
      note: '豆浆包子',
    });
    expect(updated.name).toBe('早餐套餐');
    expect(updated.amountCents).toBe(1500);

    const list = await listQuickRecordButtons(db, '2026-11-26');
    expect(list.mode).toBe('custom');
    expect(list.items).toHaveLength(1);

    const tx = await executeQuickRecord(db, list.items[0]!, '2026-11-26');
    expect(tx.amountCents).toBe(1500);
    expect(tx.note).toBe('豆浆包子');
    expect((await getAccountById(db, DEFAULT_WALLET_ACCOUNT_ID))?.balanceCents).toBe(-1500);

    await deleteQuickTemplate(db, tpl.id);
    const afterDelete = await listQuickRecordButtons(db, '2026-11-26');
    expect(afterDelete.mode).toBe('recommended');
  });
});
