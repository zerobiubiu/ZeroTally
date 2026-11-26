import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createNodeTestDatabase } from '../../db/node-test-client';
import { initializeSchema } from '../../db/schema';
import { DEFAULT_WALLET_ACCOUNT_ID, seedDefaultData } from '../../db/seed';
import type { SqlExecutor } from '../../db/types';
import { createQuickTemplate } from '../quick-record/service';
import { createTransaction, getTransactionById } from '../transactions/service';
import {
  generateCategoriesExport,
  importCategoriesFromValidated,
  validateCategoriesImportJson,
} from './portability';
import {
  archiveCategory,
  createCategory,
  deleteCategoryWithMigration,
  getCategoryTreeTransactionCount,
  listCategories,
  removeOrArchiveCategory,
  reorderCategories,
  restoreCategory,
  updateCategory,
} from './service';

describe('categories 服务层与分类 JSON 导入导出（真实 SQLite）', () => {
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
      icon: 'mci:paw-outline',
      color: '#D97706',
    });

    await expect(
      createCategory(db, {
        name: '宠物开销',
        type: 'expense',
        icon: 'mci:paw-outline',
        color: '#D97706',
      })
    ).rejects.toThrow('同级已存在');

    const renamed = await updateCategory(db, pet.id, {
      name: '毛孩子',
      icon: 'mci:dog',
      color: '#0F766E',
    });
    expect(renamed.name).toBe('毛孩子');
    expect(renamed.icon).toBe('mci:dog');
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
      accountId: DEFAULT_WALLET_ACCOUNT_ID,
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

  it('预设分类为两级结构，二级继承上级类型与颜色', async () => {
    const all = await listCategories(db, { type: 'expense' });
    const food = all.find((c) => c.id === 'cat_exp_food');
    const lunch = all.find((c) => c.id === 'cat_exp_food_lunch');
    expect(food?.parentId).toBeNull();
    expect(lunch?.parentId).toBe('cat_exp_food');
    expect(lunch?.color).toBe(food?.color);
  });

  it('二级分类：同级重名拦截、跨上级允许同名、禁止三级与跨类型挂载', async () => {
    const latte = await createCategory(db, {
      name: '拿铁',
      type: 'expense',
      icon: 'cafe-outline',
      color: '#D97706',
      parentId: 'cat_exp_food',
    });
    expect(latte.parentId).toBe('cat_exp_food');

    await expect(
      createCategory(db, {
        name: '拿铁',
        type: 'expense',
        icon: 'cafe-outline',
        color: '#D97706',
        parentId: 'cat_exp_food',
      })
    ).rejects.toThrow('同级已存在');

    const sameNameElsewhere = await createCategory(db, {
      name: '拿铁',
      type: 'expense',
      icon: 'cafe-outline',
      color: '#D97706',
      parentId: 'cat_exp_social',
    });
    expect(sameNameElsewhere.parentId).toBe('cat_exp_social');

    await expect(
      createCategory(db, {
        name: '燕麦拿铁',
        type: 'expense',
        icon: 'cafe-outline',
        color: '#D97706',
        parentId: latte.id,
      })
    ).rejects.toThrow('最多两级');

    await expect(
      createCategory(db, {
        name: '错挂',
        type: 'expense',
        icon: 'cafe-outline',
        color: '#D97706',
        parentId: 'cat_inc_salary',
      })
    ).rejects.toThrow('类型不一致');
  });

  it('停用一级分类连带停用二级；二级需在上级恢复后才能恢复', async () => {
    await archiveCategory(db, 'cat_exp_food');

    const all = await listCategories(db, { type: 'expense', includeArchived: true });
    const children = all.filter((c) => c.parentId === 'cat_exp_food');
    expect(children.length).toBeGreaterThan(0);
    expect(children.every((c) => c.isArchived)).toBe(true);

    await expect(restoreCategory(db, 'cat_exp_food_lunch')).rejects.toThrow('请先恢复上级分类');

    await restoreCategory(db, 'cat_exp_food');
    const afterRestore = await listCategories(db, { type: 'expense' });
    expect(afterRestore.some((c) => c.id === 'cat_exp_food_lunch')).toBe(true);
  });

  it('删除含账务与快捷模板的分类时，可原子迁移旧账务至目标分类后彻底删除', async () => {
    const parent = await createCategory(db, {
      name: '爱好',
      type: 'expense',
      icon: 'star-outline',
      color: '#7C3AED',
    });
    const child = await createCategory(db, {
      name: '摄影',
      type: 'expense',
      icon: 'camera-outline',
      color: '#7C3AED',
      parentId: parent.id,
    });

    const tx = await createTransaction(db, {
      type: 'expense',
      amountCents: 8800,
      categoryId: child.id,
      accountId: DEFAULT_WALLET_ACCOUNT_ID,
      toAccountId: null,
      occurredOn: '2026-11-25',
      note: '买胶卷',
    });
    const tpl = await createQuickTemplate(db, {
      name: '胶卷',
      type: 'expense',
      amountCents: 6500,
      categoryId: child.id,
      accountId: DEFAULT_WALLET_ACCOUNT_ID,
    });

    expect(await getCategoryTreeTransactionCount(db, parent.id)).toBe(1);

    // 不指定迁移目标会被拦截
    await expect(deleteCategoryWithMigration(db, parent.id)).rejects.toThrow(
      '请选择要迁移的目标分类'
    );
    // 迁移至自身或旗下子分类会被拦截
    await expect(deleteCategoryWithMigration(db, parent.id, child.id)).rejects.toThrow(
      '不能迁移到待删除的分类或其子分类下'
    );

    // 迁移至「餐饮美食」后物理删除整个「爱好」分类树
    const result = await deleteCategoryWithMigration(db, parent.id, 'cat_exp_food');
    expect(result.migratedCount).toBe(1);

    const migratedTx = await getTransactionById(db, tx.id);
    expect(migratedTx?.categoryId).toBe('cat_exp_food');

    const tplRow = await db.getFirst<{ category_id: string }>(
      'SELECT category_id FROM quick_templates WHERE id = ?',
      [tpl.id]
    );
    expect(tplRow?.category_id).toBe('cat_exp_food');

    const allCats = await listCategories(db, { includeArchived: true });
    expect(allCats.some((c) => c.id === parent.id || c.id === child.id)).toBe(false);
  });

  it('支持一级与二级各自独立同级拖拽重排', async () => {
    const rootsBefore = (await listCategories(db, { type: 'expense' })).filter(
      (c) => c.parentId === null
    );
    const reorderedRootIds = [
      rootsBefore[2]!.id,
      rootsBefore[0]!.id,
      rootsBefore[1]!.id,
      ...rootsBefore.slice(3).map((c) => c.id),
    ];
    await reorderCategories(db, 'expense', null, reorderedRootIds);

    const rootsAfter = (await listCategories(db, { type: 'expense' })).filter(
      (c) => c.parentId === null
    );
    expect(rootsAfter.slice(0, 3).map((c) => c.id)).toEqual(reorderedRootIds.slice(0, 3));

    const foodChildrenBefore = (await listCategories(db, { type: 'expense' })).filter(
      (c) => c.parentId === 'cat_exp_food'
    );
    const reversedChildIds = [...foodChildrenBefore].reverse().map((c) => c.id);
    await reorderCategories(db, 'expense', 'cat_exp_food', reversedChildIds);

    const foodChildrenAfter = (await listCategories(db, { type: 'expense' })).filter(
      (c) => c.parentId === 'cat_exp_food'
    );
    expect(foodChildrenAfter.map((c) => c.id)).toEqual(reversedChildIds);
  });

  it('分类独立 JSON 导出、手动编辑校验、增量 merge 与覆盖 replace 导入（保护旧账目）', async () => {
    // 先记一笔「交通 · 地铁」流水
    await createTransaction(db, {
      type: 'expense',
      amountCents: 500,
      categoryId: 'cat_exp_transport_metro',
      accountId: DEFAULT_WALLET_ACCOUNT_ID,
      toAccountId: null,
      occurredOn: '2026-11-25',
    });

    const exported = await generateCategoriesExport(db, new Date(2026, 10, 26));
    expect(exported.filename).toBe('ZeroTally-categories-2026-11-26.json');

    // 原样文件校验指纹严格匹配
    const exactCheck = validateCategoriesImportJson(exported.content);
    expect(exactCheck.checksumMatched).toBe(true);
    expect(exactCheck.warnings).toHaveLength(0);

    // 模拟用户手动编辑：在增量模式下新增一个「健身运动」一级分类及二级「私教」
    const incrementalJson = JSON.stringify({
      app: 'ZeroTally',
      kind: 'categories',
      schemaVersion: 1,
      expense: [
        {
          name: '健身运动',
          icon: 'mci:dumbbell',
          color: '#0F766E',
          children: [{ name: '私教', icon: 'mci:run' }],
        },
      ],
      income: [],
    });
    const mergeValidated = validateCategoriesImportJson(incrementalJson);
    expect(mergeValidated.checksumMatched).toBe(false);

    const mergeRes = await importCategoriesFromValidated(db, mergeValidated, 'merge');
    expect(mergeRes.createdCount).toBe(2);

    const afterMerge = await listCategories(db, { type: 'expense' });
    expect(afterMerge.some((c) => c.name === '健身运动')).toBe(true);
    expect(afterMerge.some((c) => c.id === 'cat_exp_food')).toBe(true);

    // 覆盖模式：只保留少量新分类，有历史账目的「交通 · 地铁」及其父级自动停用保留保护外键
    const replaceJson = JSON.stringify({
      app: 'ZeroTally',
      kind: 'categories',
      schemaVersion: 1,
      expense: [
        {
          id: 'cat_exp_food',
          name: '干饭',
          icon: 'mci:silverware-fork-knife',
          color: '#D97706',
          children: [{ name: '外卖', icon: 'mci:moped-outline' }],
        },
      ],
      income: [
        {
          id: 'cat_inc_salary',
          name: '工资',
          icon: 'mci:briefcase-outline',
          color: '#059669',
          children: [],
        },
      ],
    });
    const replaceValidated = validateCategoriesImportJson(replaceJson);
    const replaceRes = await importCategoriesFromValidated(db, replaceValidated, 'replace');
    expect(replaceRes.preservedArchivedCount).toBeGreaterThanOrEqual(2);
    expect(replaceRes.deletedCount).toBeGreaterThan(0);

    const afterReplaceAll = await listCategories(db, { includeArchived: true });
    const metro = afterReplaceAll.find((c) => c.id === 'cat_exp_transport_metro');
    const transport = afterReplaceAll.find((c) => c.id === 'cat_exp_transport');
    expect(metro?.isArchived).toBe(true);
    expect(transport?.isArchived).toBe(true);
    expect(afterReplaceAll.find((c) => c.id === 'cat_exp_food')?.name).toBe('干饭');

    // 拦截非法三级分类
    const invalidDepth = JSON.stringify({
      app: 'ZeroTally',
      kind: 'categories',
      expense: [
        {
          name: '一级',
          icon: 'star-outline',
          color: '#0F766E',
          children: [{ name: '二级', icon: 'star-outline', children: [{ name: '三级' }] }],
        },
      ],
      income: [],
    });
    expect(() => validateCategoriesImportJson(invalidDepth)).toThrow('不允许超过两级子分类');
  });
});
