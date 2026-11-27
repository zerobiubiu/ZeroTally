import type { SqlExecutor } from '../../db/types';
import { getMonthDateRange } from '../../shared/date/date';
import { getAppSetting, setAppSetting } from '../settings/repository';
import { BUDGET_CONFIG_SETTING_KEY, parseBudgetConfig } from './rules';
import type { BudgetConfig } from './types';

interface CategoryNetExpenseRow {
  root_category_id: string;
  net_cents: number | null;
}

export async function getBudgetConfig(db: SqlExecutor): Promise<BudgetConfig> {
  const raw = await getAppSetting(db, BUDGET_CONFIG_SETTING_KEY);
  return parseBudgetConfig(raw);
}

export async function saveBudgetConfig(
  db: SqlExecutor,
  config: BudgetConfig
): Promise<void> {
  await setAppSetting(db, BUDGET_CONFIG_SETTING_KEY, JSON.stringify(config));
}

/**
 * 统计指定月份按一级支出分类聚合的净支出（同月退款自动抵扣所属一级分类支出）。
 */
export async function getMonthlyRootCategoryExpenses(
  db: SqlExecutor,
  monthKey: string
): Promise<Record<string, number>> {
  const { start, end } = getMonthDateRange(monthKey);
  const rows = await db.getAll<CategoryNetExpenseRow>(
    `SELECT
       COALESCE(c.parent_id, c.id) AS root_category_id,
       SUM(CASE WHEN t.type = 'expense' THEN t.amount_cents WHEN t.type = 'refund' THEN -t.amount_cents ELSE 0 END) AS net_cents
     FROM transactions t
     INNER JOIN categories c ON c.id = t.category_id
     WHERE t.type IN ('expense', 'refund')
       AND t.occurred_on >= ?
       AND t.occurred_on <= ?
     GROUP BY COALESCE(c.parent_id, c.id)`,
    [start, end]
  );

  const map: Record<string, number> = {};
  for (const row of rows) {
    map[row.root_category_id] = Math.max(0, row.net_cents ?? 0);
  }
  return map;
}
