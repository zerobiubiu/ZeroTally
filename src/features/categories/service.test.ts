import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createNodeTestDatabase } from '../../db/node-test-client';
import { initializeSchema } from '../../db/schema';
import { seedDefaultData } from '../../db/seed';
import type { SqlExecutor } from '../../db/types';
import { createTransaction } from '../transactions/service';
import {
  createCategory,
  listCategories,
  removeOrArchiveCategory,
  restoreCategory,
  updateCategory,
} from './service';

describe('categories 服务层（真实 SQLite）', () => {
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

  it('支持新建、重命名自定义分类并拦截同类型重名', async () => {
    const pet = await createCategory(db, {
      name: '宠物开销',
      type: 'expense',
      icon: 'paw-outline',
      color: '#D97706',
    });

    await expect(
      createCategory(db, {
        name: '宠物开销',
        type: 'expense',
        icon: 'paw-outline',
        color: '#D97706',
      })
    ).rejects.toThrow('已存在同名');

    const renamed = await updateCategory(db, pet.id, {
      name: '毛孩子',
      icon: 'paw-outline',
      color: '#0F766E',
    });
    expect(renamed.name).toBe('毛孩子');
  });

  it('未使用的自定义分类直接删除；已关联账目或系统分类改为归档并支持恢复', async () => {
    const unused = await createCategory(db, {
      name: '临时咖啡',
      type: 'expense',
      icon: 'cafe-outline',
      color: '#0F766E',
    });
    const res1 = await removeOrArchiveCategory(db, unused.id);
    expect(res1.action).toBe('deleted');

    const used = await createCategory(db, {
      name: '数码装备',
      type: 'expense',
      icon: 'laptop-outline',
      color: '#0284C7',
    });
    await createTransaction(db, {
      type: 'expense',
      amountCents: 29900,
      categoryId: used.id,
      accountId: 'acc_alipay',
      toAccountId: null,
      occurredOn: '2026-11-25',
    });

    const res2 = await removeOrArchiveCategory(db, used.id);
    expect(res2.action).toBe('archived');

    const active = await listCategories(db, { type: 'expense' });
    expect(active.some((c) => c.id === used.id)).toBe(false);

    const restored = await restoreCategory(db, used.id);
    expect(restored.isArchived).toBe(false);
  });
});
