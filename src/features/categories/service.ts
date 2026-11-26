import type { SqlExecutor } from '../../db/types';
import { createId } from '../../shared/id/id';
import {
  countActiveRootCategories,
  countCategoryTreeTransactions,
  deleteCategoryTreeRows,
  findActiveSiblingByName,
  findCategories,
  findCategoryById,
  getNextCategorySortOrder,
  insertCategoryRow,
  migrateCategoryTreeReferences,
  setCategoryTreeArchivedFlag,
  updateCategoryRow,
  updateCategorySortOrders,
} from './repository';
import {
  assertValidParentCategory,
  normalizeCreateCategoryInput,
  normalizeUpdateCategoryInput,
} from './rules';
import type {
  Category,
  CategoryType,
  CreateCategoryInput,
  UpdateCategoryInput,
} from './types';

export async function listCategories(
  db: SqlExecutor,
  options?: { type?: CategoryType; includeArchived?: boolean }
): Promise<Category[]> {
  return findCategories(db, options);
}

export async function getCategoryTreeTransactionCount(
  db: SqlExecutor,
  id: string
): Promise<number> {
  return countCategoryTreeTransactions(db, id);
}

export async function createCategory(
  db: SqlExecutor,
  rawInput: CreateCategoryInput
): Promise<Category> {
  const input = normalizeCreateCategoryInput(rawInput);
  const parentId = input.parentId ?? null;

  if (parentId !== null) {
    assertValidParentCategory(await findCategoryById(db, parentId), input.type);
  }

  const duplicate = await findActiveSiblingByName(db, input.type, parentId, input.name);
  if (duplicate) {
    throw new Error(`同级已存在分类「${input.name}」`);
  }

  const sortOrder = await getNextCategorySortOrder(db, input.type, parentId);
  const category: Category = {
    id: createId('cat'),
    name: input.name,
    type: input.type,
    icon: input.icon,
    color: input.color,
    parentId,
    isSystem: false,
    isArchived: false,
    sortOrder,
    createdAt: new Date().toISOString(),
  };

  await insertCategoryRow(db, category);
  return category;
}

export async function updateCategory(
  db: SqlExecutor,
  id: string,
  rawInput: UpdateCategoryInput
): Promise<Category> {
  const input = normalizeUpdateCategoryInput(rawInput);
  const existing = await findCategoryById(db, id);
  if (!existing) {
    throw new Error('分类不存在');
  }

  const duplicate = await findActiveSiblingByName(db, existing.type, existing.parentId, input.name);
  if (duplicate && duplicate.id !== id) {
    throw new Error(`同级已存在分类「${input.name}」`);
  }

  await updateCategoryRow(db, id, input);
  const updated = await findCategoryById(db, id);
  if (!updated) {
    throw new Error('更新分类后读取失败');
  }
  return updated;
}

/**
 * 停用分类（一级分类连带停用其全部二级分类）：
 * - 停用后不再出现在记一笔可选列表中，历史账务记录完整保留；
 * - 每种类型（支出/收入）至少保留 1 个启用的一级分类。
 */
export async function archiveCategory(db: SqlExecutor, id: string): Promise<Category> {
  return db.withTransaction(async (tx) => {
    const existing = await findCategoryById(tx, id);
    if (!existing) {
      throw new Error('分类不存在');
    }
    if (!existing.isArchived && existing.parentId === null) {
      const activeRoots = await countActiveRootCategories(tx, existing.type);
      if (activeRoots <= 1) {
        throw new Error(`至少需要保留一个启用的${existing.type === 'expense' ? '支出' : '收入'}分类`);
      }
    }
    await setCategoryTreeArchivedFlag(tx, id, true);
    const updated = await findCategoryById(tx, id);
    if (!updated) {
      throw new Error('停用分类后读取失败');
    }
    return updated;
  });
}

/**
 * 彻底删除分类（一级分类连带删除其全部二级分类），支持将历史账务原子迁移至指定的同类型可用分类：
 * - 每种类型至少保留 1 个启用的一级分类；
 * - 若该分类或其二级分类下存在历史账目，必须提供目标迁移分类 `migrateToCategoryId`（不能为自身或自身子分类、须同类型且已启用）；
 * - 在同一 SQLite 事务内先迁移关联账目与快捷模板，再物理删除原分类树。
 */
export async function deleteCategoryWithMigration(
  db: SqlExecutor,
  id: string,
  migrateToCategoryId?: string | null
): Promise<{ migratedCount: number }> {
  const now = new Date().toISOString();
  return db.withTransaction(async (tx) => {
    const existing = await findCategoryById(tx, id);
    if (!existing) {
      throw new Error('分类不存在');
    }

    if (!existing.isArchived && existing.parentId === null) {
      const activeRoots = await countActiveRootCategories(tx, existing.type);
      if (activeRoots <= 1) {
        throw new Error(`至少需要保留一个启用的${existing.type === 'expense' ? '支出' : '收入'}分类`);
      }
    }

    const txCount = await countCategoryTreeTransactions(tx, id);
    let migratedCount = 0;

    if (txCount > 0) {
      if (!migrateToCategoryId) {
        throw new Error('该分类下存在历史账目，请选择要迁移的目标分类');
      }
      const target = await findCategoryById(tx, migrateToCategoryId);
      if (!target || target.isArchived) {
        throw new Error('所选迁移目标分类不存在或已停用');
      }
      if (target.type !== existing.type) {
        throw new Error('迁移目标分类必须与原分类同为支出或收入');
      }
      if (target.id === existing.id || target.parentId === existing.id) {
        throw new Error('不能迁移到待删除的分类或其子分类下');
      }
      migratedCount = await migrateCategoryTreeReferences(tx, id, target.id, now);
    } else if (migrateToCategoryId) {
      // 无账目但若快捷模板引用到该分类，也同步迁走避免外键冲突
      const target = await findCategoryById(tx, migrateToCategoryId);
      if (target && !target.isArchived && target.type === existing.type && target.id !== id && target.parentId !== id) {
        await migrateCategoryTreeReferences(tx, id, target.id, now);
      }
    } else {
      // 无历史账目时清理可能指向待删分类树的快捷模板，防止外键约束失败
      await tx.run(
        `DELETE FROM quick_templates
         WHERE category_id = ?
            OR category_id IN (SELECT id FROM categories WHERE parent_id = ?)`,
        [id, id]
      );
    }

    await deleteCategoryTreeRows(tx, id);
    return { migratedCount };
  });
}

/**
 * 删除或归档分类（保留既有兼容接口：已引用或系统预设改为停用，否则物理删除）。
 */
export async function removeOrArchiveCategory(
  db: SqlExecutor,
  id: string
): Promise<{ action: 'archived' | 'deleted' }> {
  return db.withTransaction(async (tx) => {
    const existing = await findCategoryById(tx, id);
    if (!existing) {
      throw new Error('分类不存在');
    }

    if (!existing.isArchived && existing.parentId === null) {
      const activeRoots = await countActiveRootCategories(tx, existing.type);
      if (activeRoots <= 1) {
        throw new Error(`至少需要保留一个${existing.type === 'expense' ? '支出' : '收入'}分类`);
      }
    }

    const txCount = await countCategoryTreeTransactions(tx, id);
    if (existing.isSystem || txCount > 0) {
      await setCategoryTreeArchivedFlag(tx, id, true);
      return { action: 'archived' as const };
    }

    await tx.run(
      `DELETE FROM quick_templates
       WHERE category_id = ?
          OR category_id IN (SELECT id FROM categories WHERE parent_id = ?)`,
      [id, id]
    );
    await deleteCategoryTreeRows(tx, id);
    return { action: 'deleted' as const };
  });
}

/**
 * 恢复已停用分类：一级分类连带恢复其二级分类；二级分类要求上级已启用。
 */
export async function restoreCategory(db: SqlExecutor, id: string): Promise<Category> {
  const existing = await findCategoryById(db, id);
  if (!existing) {
    throw new Error('分类不存在');
  }
  if (existing.parentId !== null) {
    const parent = await findCategoryById(db, existing.parentId);
    if (parent?.isArchived) {
      throw new Error(`请先恢复上级分类「${parent.name}」`);
    }
  }
  const duplicate = await findActiveSiblingByName(
    db,
    existing.type,
    existing.parentId,
    existing.name
  );
  if (duplicate && duplicate.id !== id) {
    throw new Error(`已有启用的同名分类「${existing.name}」，请先重命名后再恢复`);
  }
  await setCategoryTreeArchivedFlag(db, id, false);
  const updated = await findCategoryById(db, id);
  if (!updated) {
    throw new Error('恢复分类后读取失败');
  }
  return updated;
}

/**
 * 同级分类拖拽排序持久化：仅校验并重排同一 type 与同一 parentId 下的分类，严禁跨级交叉。
 */
export async function reorderCategories(
  db: SqlExecutor,
  type: CategoryType,
  parentId: string | null,
  orderedIds: readonly string[]
): Promise<void> {
  if (orderedIds.length === 0) {
    return;
  }

  await db.withTransaction(async (tx) => {
    const all = await findCategories(tx, { type, includeArchived: true });
    const siblingMap = new Map(
      all.filter((c) => c.parentId === parentId).map((c) => [c.id, c])
    );

    const validated: string[] = [];
    const seen = new Set<string>();
    for (const id of orderedIds) {
      if (siblingMap.has(id) && !seen.has(id)) {
        validated.push(id);
        seen.add(id);
      }
    }
    // 将未列入 orderedIds 的其余同级分类（例如停用项）按原顺序追加到末尾
    for (const cat of all) {
      if (cat.parentId === parentId && !seen.has(cat.id)) {
        validated.push(cat.id);
        seen.add(cat.id);
      }
    }

    await updateCategorySortOrders(tx, validated);
  });
}
