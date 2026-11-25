import type { SqlExecutor } from '../../db/types';
import { createId } from '../../shared/id/id';
import {
  countCategoryTransactions,
  deleteCategoryRow,
  findActiveCategoryByName,
  findCategories,
  findCategoryById,
  getNextCategorySortOrder,
  insertCategoryRow,
  setCategoryArchivedFlag,
  updateCategoryRow,
} from './repository';
import { normalizeCreateCategoryInput, normalizeUpdateCategoryInput } from './rules';
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

export async function createCategory(
  db: SqlExecutor,
  rawInput: CreateCategoryInput
): Promise<Category> {
  const input = normalizeCreateCategoryInput(rawInput);
  const duplicate = await findActiveCategoryByName(db, input.type, input.name);
  if (duplicate) {
    throw new Error(`已存在同名${input.type === 'expense' ? '支出' : '收入'}分类「${input.name}」`);
  }

  const sortOrder = await getNextCategorySortOrder(db, input.type);
  const category: Category = {
    id: createId('cat'),
    name: input.name,
    type: input.type,
    icon: input.icon,
    color: input.color,
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

  const duplicate = await findActiveCategoryByName(db, existing.type, input.name);
  if (duplicate && duplicate.id !== id) {
    throw new Error(`已存在同名${existing.type === 'expense' ? '支出' : '收入'}分类「${input.name}」`);
  }

  await updateCategoryRow(db, id, input);
  const updated = await findCategoryById(db, id);
  if (!updated) {
    throw new Error('更新分类后读取失败');
  }
  return updated;
}

/**
 * 删除或归档分类：
 * - 若为系统预设分类或已被历史账目引用，改为停用归档以保护历史明细完整性；
 * - 若为未被引用的自定义分类，直接物理删除；
 * - 每种类型（支出/收入）至少保留 1 个启用分类。
 */
export async function removeOrArchiveCategory(
  db: SqlExecutor,
  id: string
): Promise<{ action: 'archived' | 'deleted' }> {
  const existing = await findCategoryById(db, id);
  if (!existing) {
    throw new Error('分类不存在');
  }

  if (!existing.isArchived) {
    const sameTypeActive = await findCategories(db, {
      type: existing.type,
      includeArchived: false,
    });
    if (sameTypeActive.length <= 1) {
      throw new Error(`至少需要保留一个${existing.type === 'expense' ? '支出' : '收入'}分类`);
    }
  }

  const txCount = await countCategoryTransactions(db, id);
  if (existing.isSystem || txCount > 0) {
    await setCategoryArchivedFlag(db, id, true);
    return { action: 'archived' };
  }

  await deleteCategoryRow(db, id);
  return { action: 'deleted' };
}

export async function restoreCategory(db: SqlExecutor, id: string): Promise<Category> {
  const existing = await findCategoryById(db, id);
  if (!existing) {
    throw new Error('分类不存在');
  }
  const duplicate = await findActiveCategoryByName(db, existing.type, existing.name);
  if (duplicate && duplicate.id !== id) {
    throw new Error(`已有启用的同名分类「${existing.name}」，请先重命名后再恢复`);
  }
  await setCategoryArchivedFlag(db, id, false);
  const updated = await findCategoryById(db, id);
  if (!updated) {
    throw new Error('恢复分类后读取失败');
  }
  return updated;
}
