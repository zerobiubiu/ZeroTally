import type { SqlExecutor } from '../../db/types';
import type { Category, CategoryType } from './types';

interface CategoryRow {
  id: string;
  name: string;
  type: CategoryType;
  icon: string;
  color: string;
  parent_id: string | null;
  is_system: number;
  is_archived: number;
  sort_order: number;
  created_at: string;
}

interface CountRow {
  count: number;
}

interface MaxSortRow {
  max_order: number | null;
}

function mapCategoryRow(row: CategoryRow): Category {
  return {
    id: row.id,
    name: row.name,
    type: row.type,
    icon: row.icon,
    color: row.color,
    parentId: row.parent_id,
    isSystem: row.is_system === 1,
    isArchived: row.is_archived === 1,
    sortOrder: row.sort_order,
    createdAt: row.created_at,
  };
}

export async function findCategories(
  db: SqlExecutor,
  options?: { type?: CategoryType; includeArchived?: boolean }
): Promise<Category[]> {
  const conditions: string[] = [];
  const params: (string | number)[] = [];

  if (options?.type) {
    conditions.push('type = ?');
    params.push(options.type);
  }
  if (!options?.includeArchived) {
    conditions.push('is_archived = 0');
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  const rows = await db.getAll<CategoryRow>(
    `SELECT * FROM categories ${whereClause} ORDER BY is_archived ASC, sort_order ASC, created_at ASC`,
    params
  );
  return rows.map(mapCategoryRow);
}

export async function findCategoryById(db: SqlExecutor, id: string): Promise<Category | null> {
  const row = await db.getFirst<CategoryRow>('SELECT * FROM categories WHERE id = ?', [id]);
  return row ? mapCategoryRow(row) : null;
}

/** 在同一上级（parentId 为 null 表示一级）下按名称查找启用分类，用于同级重名拦截 */
export async function findActiveSiblingByName(
  db: SqlExecutor,
  type: CategoryType,
  parentId: string | null,
  name: string
): Promise<Category | null> {
  const row = await db.getFirst<CategoryRow>(
    `SELECT * FROM categories WHERE type = ? AND parent_id IS ? AND name = ? AND is_archived = 0`,
    [type, parentId, name]
  );
  return row ? mapCategoryRow(row) : null;
}

export async function countActiveRootCategories(
  db: SqlExecutor,
  type: CategoryType
): Promise<number> {
  const row = await db.getFirst<CountRow>(
    'SELECT COUNT(*) AS count FROM categories WHERE type = ? AND parent_id IS NULL AND is_archived = 0',
    [type]
  );
  return row?.count ?? 0;
}

export async function getNextCategorySortOrder(
  db: SqlExecutor,
  type: CategoryType,
  parentId: string | null
): Promise<number> {
  const row = await db.getFirst<MaxSortRow>(
    'SELECT MAX(sort_order) AS max_order FROM categories WHERE type = ? AND parent_id IS ?',
    [type, parentId]
  );
  return (row?.max_order ?? 0) + 10;
}

export async function insertCategoryRow(db: SqlExecutor, category: Category): Promise<void> {
  await db.run(
    `INSERT INTO categories (id, name, type, icon, color, parent_id, is_system, is_archived, sort_order, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      category.id,
      category.name,
      category.type,
      category.icon,
      category.color,
      category.parentId,
      category.isSystem ? 1 : 0,
      category.isArchived ? 1 : 0,
      category.sortOrder,
      category.createdAt,
    ]
  );
}

export async function updateCategoryRow(
  db: SqlExecutor,
  id: string,
  fields: { name: string; icon: string; color: string }
): Promise<number> {
  const res = await db.run(
    'UPDATE categories SET name = ?, icon = ?, color = ? WHERE id = ?',
    [fields.name, fields.icon, fields.color, id]
  );
  return res.changes;
}

/** 设置分类及其全部二级分类的停用状态（一级分类停用/恢复时连带下属） */
export async function setCategoryTreeArchivedFlag(
  db: SqlExecutor,
  id: string,
  isArchived: boolean
): Promise<number> {
  const res = await db.run('UPDATE categories SET is_archived = ? WHERE id = ? OR parent_id = ?', [
    isArchived ? 1 : 0,
    id,
    id,
  ]);
  return res.changes;
}

/** 统计分类自身及其二级分类被账目引用的次数 */
export async function countCategoryTreeTransactions(db: SqlExecutor, id: string): Promise<number> {
  const row = await db.getFirst<CountRow>(
    `SELECT COUNT(*) AS count FROM transactions
     WHERE category_id = ? OR category_id IN (SELECT id FROM categories WHERE parent_id = ?)`,
    [id, id]
  );
  return row?.count ?? 0;
}

/** 物理删除分类及其二级分类（调用方须先完成关联账目与快捷模板迁移） */
export async function deleteCategoryTreeRows(db: SqlExecutor, id: string): Promise<number> {
  await db.run('DELETE FROM categories WHERE parent_id = ?', [id]);
  const res = await db.run('DELETE FROM categories WHERE id = ?', [id]);
  return res.changes;
}

/** 将分类自身及其二级分类关联的账目与快捷模板原子迁移到指定目标分类 */
export async function migrateCategoryTreeReferences(
  db: SqlExecutor,
  sourceCategoryId: string,
  targetCategoryId: string,
  updatedAt: string
): Promise<number> {
  const txRes = await db.run(
    `UPDATE transactions
     SET category_id = ?, updated_at = ?
     WHERE category_id = ?
        OR category_id IN (SELECT id FROM categories WHERE parent_id = ?)`,
    [targetCategoryId, updatedAt, sourceCategoryId, sourceCategoryId]
  );
  await db.run(
    `UPDATE quick_templates
     SET category_id = ?, updated_at = ?
     WHERE category_id = ?
        OR category_id IN (SELECT id FROM categories WHERE parent_id = ?)`,
    [targetCategoryId, updatedAt, sourceCategoryId, sourceCategoryId]
  );
  return txRes.changes;
}

/** 批量更新同级分类的 sort_order（按传入 ID 顺序依次赋值为 10, 20, 30...） */
export async function updateCategorySortOrders(
  db: SqlExecutor,
  orderedIds: readonly string[]
): Promise<void> {
  for (let i = 0; i < orderedIds.length; i += 1) {
    await db.run('UPDATE categories SET sort_order = ? WHERE id = ?', [
      (i + 1) * 10,
      orderedIds[i]!,
    ]);
  }
}
