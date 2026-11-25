import type { SqlExecutor } from '../../db/types';
import type { Category, CategoryType } from './types';

interface CategoryRow {
  id: string;
  name: string;
  type: CategoryType;
  icon: string;
  color: string;
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

export async function findActiveCategoryByName(
  db: SqlExecutor,
  type: CategoryType,
  name: string
): Promise<Category | null> {
  const row = await db.getFirst<CategoryRow>(
    `SELECT * FROM categories WHERE type = ? AND name = ? AND is_archived = 0`,
    [type, name]
  );
  return row ? mapCategoryRow(row) : null;
}

export async function getNextCategorySortOrder(
  db: SqlExecutor,
  type: CategoryType
): Promise<number> {
  const row = await db.getFirst<MaxSortRow>(
    'SELECT MAX(sort_order) AS max_order FROM categories WHERE type = ?',
    [type]
  );
  return (row?.max_order ?? 0) + 10;
}

export async function insertCategoryRow(db: SqlExecutor, category: Category): Promise<void> {
  await db.run(
    `INSERT INTO categories (id, name, type, icon, color, is_system, is_archived, sort_order, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      category.id,
      category.name,
      category.type,
      category.icon,
      category.color,
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

export async function setCategoryArchivedFlag(
  db: SqlExecutor,
  id: string,
  isArchived: boolean
): Promise<number> {
  const res = await db.run('UPDATE categories SET is_archived = ? WHERE id = ?', [
    isArchived ? 1 : 0,
    id,
  ]);
  return res.changes;
}

export async function countCategoryTransactions(db: SqlExecutor, id: string): Promise<number> {
  const row = await db.getFirst<CountRow>(
    'SELECT COUNT(*) AS count FROM transactions WHERE category_id = ?',
    [id]
  );
  return row?.count ?? 0;
}

export async function deleteCategoryRow(db: SqlExecutor, id: string): Promise<number> {
  const res = await db.run('DELETE FROM categories WHERE id = ?', [id]);
  return res.changes;
}
