import type { SqlExecutor } from '../../db/types';
import type { QuickRecordButtonItem, QuickRecordType, QuickTemplate } from './types';

interface QuickTemplateRow {
  id: string;
  name: string;
  type: QuickRecordType;
  amount_cents: number;
  category_id: string;
  account_id: string;
  note: string;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

interface QuickTemplateJoinRow extends QuickTemplateRow {
  category_name: string;
  category_icon: string;
  category_color: string;
  account_name: string;
}

interface RecommendedQuickRow {
  type: QuickRecordType;
  amount_cents: number;
  category_id: string;
  category_name: string;
  category_icon: string;
  category_color: string;
  account_id: string;
  account_name: string;
  usage_count: number;
}

interface MaxSortRow {
  max_order: number | null;
}

function mapTemplateRow(row: QuickTemplateRow): QuickTemplate {
  return {
    id: row.id,
    name: row.name,
    type: row.type,
    amountCents: row.amount_cents,
    categoryId: row.category_id,
    accountId: row.account_id,
    note: row.note,
    sortOrder: row.sort_order,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function findAllQuickTemplates(db: SqlExecutor): Promise<QuickTemplate[]> {
  const rows = await db.getAll<QuickTemplateRow>(
    'SELECT * FROM quick_templates ORDER BY sort_order ASC, created_at ASC'
  );
  return rows.map(mapTemplateRow);
}

export async function findQuickTemplateById(
  db: SqlExecutor,
  id: string
): Promise<QuickTemplate | null> {
  const row = await db.getFirst<QuickTemplateRow>('SELECT * FROM quick_templates WHERE id = ?', [
    id,
  ]);
  return row ? mapTemplateRow(row) : null;
}

/** 查询当前所有可用（对应分类与账户均未停用）的自定义快捷模板展示列表 */
export async function findActiveQuickTemplateButtons(
  db: SqlExecutor
): Promise<QuickRecordButtonItem[]> {
  const rows = await db.getAll<QuickTemplateJoinRow>(
    `SELECT
       q.*,
       c.name AS category_name,
       c.icon AS category_icon,
       c.color AS category_color,
       a.name AS account_name
     FROM quick_templates q
     INNER JOIN categories c ON c.id = q.category_id AND c.is_archived = 0
     INNER JOIN accounts a ON a.id = q.account_id AND a.is_archived = 0
     ORDER BY q.sort_order ASC, q.created_at ASC`
  );
  return rows.map((row) => ({
    id: row.id,
    source: 'template',
    name: row.name,
    type: row.type,
    amountCents: row.amount_cents,
    categoryId: row.category_id,
    categoryName: row.category_name,
    categoryIcon: row.category_icon,
    categoryColor: row.category_color,
    accountId: row.account_id,
    accountName: row.account_name,
    note: row.note,
  }));
}

/**
 * 当用户尚未自定义快捷模板时，自动从近 30 天活跃收支流水按「分类 + 金额 + 账户」频次聚合推荐高频快捷项。
 */
export async function findRecommendedQuickButtons(
  db: SqlExecutor,
  sinceIsoDate: string,
  limit = 8
): Promise<QuickRecordButtonItem[]> {
  const rows = await db.getAll<RecommendedQuickRow>(
    `SELECT
       t.type,
       t.amount_cents,
       t.category_id,
       c.name AS category_name,
       c.icon AS category_icon,
       c.color AS category_color,
       t.account_id,
       a.name AS account_name,
       COUNT(*) AS usage_count
     FROM transactions t
     INNER JOIN categories c ON c.id = t.category_id AND c.is_archived = 0
     INNER JOIN accounts a ON a.id = t.account_id AND a.is_archived = 0
     WHERE t.type IN ('expense', 'income')
       AND t.occurred_on >= ?
     GROUP BY t.type, t.category_id, t.amount_cents, t.account_id
     ORDER BY usage_count DESC, MAX(t.created_at) DESC
     LIMIT ?`,
    [sinceIsoDate, limit]
  );

  return rows.map((row, index) => ({
    id: `rec_${index}_${row.category_id}_${row.amount_cents}`,
    source: 'recommended',
    name: row.category_name,
    type: row.type,
    amountCents: row.amount_cents,
    categoryId: row.category_id,
    categoryName: row.category_name,
    categoryIcon: row.category_icon,
    categoryColor: row.category_color,
    accountId: row.account_id,
    accountName: row.account_name,
    note: '',
  }));
}

export async function getNextQuickTemplateSortOrder(db: SqlExecutor): Promise<number> {
  const row = await db.getFirst<MaxSortRow>(
    'SELECT MAX(sort_order) AS max_order FROM quick_templates'
  );
  return (row?.max_order ?? 0) + 10;
}

export async function insertQuickTemplateRow(
  db: SqlExecutor,
  record: QuickTemplate
): Promise<void> {
  await db.run(
    `INSERT INTO quick_templates (
       id, name, type, amount_cents, category_id, account_id, note, sort_order, created_at, updated_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      record.id,
      record.name,
      record.type,
      record.amountCents,
      record.categoryId,
      record.accountId,
      record.note,
      record.sortOrder,
      record.createdAt,
      record.updatedAt,
    ]
  );
}

export async function updateQuickTemplateRow(
  db: SqlExecutor,
  record: QuickTemplate
): Promise<number> {
  const res = await db.run(
    `UPDATE quick_templates
     SET name = ?, type = ?, amount_cents = ?, category_id = ?, account_id = ?, note = ?, updated_at = ?
     WHERE id = ?`,
    [
      record.name,
      record.type,
      record.amountCents,
      record.categoryId,
      record.accountId,
      record.note,
      record.updatedAt,
      record.id,
    ]
  );
  return res.changes;
}

export async function deleteQuickTemplateRow(db: SqlExecutor, id: string): Promise<number> {
  const res = await db.run('DELETE FROM quick_templates WHERE id = ?', [id]);
  return res.changes;
}
