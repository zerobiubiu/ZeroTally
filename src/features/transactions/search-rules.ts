import type { SqlBindValue } from '../../db/types';
import { isValidIsoDate } from '../../shared/date/date';
import type { TransactionSearchFilter, TransactionType } from './types';

const ALLOWED_TYPES: ReadonlySet<TransactionType> = new Set([
  'expense',
  'income',
  'transfer',
  'refund',
  'repayment',
]);

export const DEFAULT_SEARCH_PAGE_SIZE = 40;
export const MAX_SEARCH_PAGE_SIZE = 200;

/** 转义 SQLite LIKE 通配符，防止用户输入 % / _ / \ 触发意外模糊匹配 */
export function escapeSqlLikePattern(raw: string): string {
  return raw.replaceAll('\\', '\\\\').replaceAll('%', '\\%').replaceAll('_', '\\_');
}

/**
 * 构建账单多维搜索的参数化 SQL WHERE 片段（严格 `?` 绑定，零字符串拼接注入风险）。
 * 依赖调用方查询已别名化主表 `t`、分类 `c`、父分类 `p`、主账户 `a1`、对手账户 `a2`。
 */
export function buildTransactionSearchWhere(filter: TransactionSearchFilter): {
  whereSql: string;
  params: SqlBindValue[];
} {
  const clauses: string[] = [];
  const params: SqlBindValue[] = [];

  const keyword = (filter.keyword ?? '').trim().toLowerCase();
  if (keyword.length > 0) {
    const likeParam = `%${escapeSqlLikePattern(keyword)}%`;
    clauses.push(
      `(LOWER(t.note) LIKE ? ESCAPE '\\' OR LOWER(COALESCE(c.name, '')) LIKE ? ESCAPE '\\' OR LOWER(COALESCE(p.name, '')) LIKE ? ESCAPE '\\' OR LOWER(a1.name) LIKE ? ESCAPE '\\' OR LOWER(COALESCE(a2.name, '')) LIKE ? ESCAPE '\\')`
    );
    params.push(likeParam, likeParam, likeParam, likeParam, likeParam);
  }

  const validTypes = (filter.types ?? []).filter((t): t is TransactionType =>
    ALLOWED_TYPES.has(t)
  );
  if (validTypes.length > 0 && validTypes.length < ALLOWED_TYPES.size) {
    const uniqueTypes = Array.from(new Set(validTypes));
    clauses.push(`t.type IN (${uniqueTypes.map(() => '?').join(', ')})`);
    params.push(...uniqueTypes);
  }

  const categoryId = (filter.categoryId ?? '').trim();
  if (categoryId.length > 0) {
    clauses.push('(t.category_id = ? OR c.parent_id = ?)');
    params.push(categoryId, categoryId);
  }

  const accountId = (filter.accountId ?? '').trim();
  if (accountId.length > 0) {
    clauses.push('(t.account_id = ? OR t.to_account_id = ?)');
    params.push(accountId, accountId);
  }

  const startDate = (filter.startDate ?? '').trim();
  if (startDate && isValidIsoDate(startDate)) {
    clauses.push('t.occurred_on >= ?');
    params.push(startDate);
  }

  const endDate = (filter.endDate ?? '').trim();
  if (endDate && isValidIsoDate(endDate)) {
    clauses.push('t.occurred_on <= ?');
    params.push(endDate);
  }

  if (
    typeof filter.minAmountCents === 'number' &&
    Number.isSafeInteger(filter.minAmountCents) &&
    filter.minAmountCents >= 0
  ) {
    clauses.push('t.amount_cents >= ?');
    params.push(filter.minAmountCents);
  }

  if (
    typeof filter.maxAmountCents === 'number' &&
    Number.isSafeInteger(filter.maxAmountCents) &&
    filter.maxAmountCents >= 0
  ) {
    clauses.push('t.amount_cents <= ?');
    params.push(filter.maxAmountCents);
  }

  const whereSql = clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : '';
  return { whereSql, params };
}

/** 规范化分页参数，确保 limit / offset 始终合法 */
export function normalizeSearchPagination(filter: Pick<TransactionSearchFilter, 'limit' | 'offset'>): {
  limit: number;
  offset: number;
} {
  const rawLimit = filter.limit ?? DEFAULT_SEARCH_PAGE_SIZE;
  const limit = Number.isInteger(rawLimit)
    ? Math.max(1, Math.min(MAX_SEARCH_PAGE_SIZE, rawLimit))
    : DEFAULT_SEARCH_PAGE_SIZE;
  const rawOffset = filter.offset ?? 0;
  const offset = Number.isInteger(rawOffset) && rawOffset >= 0 ? rawOffset : 0;
  return { limit, offset };
}

/** 统计除关键词外已激活的高级筛选维度数量（用于筛选角标展示） */
export function countActiveAdvancedFilters(filter: TransactionSearchFilter): number {
  let count = 0;
  if (filter.categoryId) count += 1;
  if (filter.accountId) count += 1;
  if (filter.startDate || filter.endDate) count += 1;
  if (
    (typeof filter.minAmountCents === 'number' && filter.minAmountCents >= 0) ||
    (typeof filter.maxAmountCents === 'number' && filter.maxAmountCents >= 0)
  ) {
    count += 1;
  }
  return count;
}

/** 判断当前是否存在任意搜索或筛选条件 */
export function hasAnySearchCondition(filter: TransactionSearchFilter): boolean {
  if ((filter.keyword ?? '').trim().length > 0) return true;
  if (filter.types && filter.types.length > 0 && filter.types.length < ALLOWED_TYPES.size) {
    return true;
  }
  return countActiveAdvancedFilters(filter) > 0;
}
