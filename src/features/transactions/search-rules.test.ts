import { describe, expect, it } from 'vitest';
import {
  buildTransactionSearchWhere,
  countActiveAdvancedFilters,
  escapeSqlLikePattern,
  hasAnySearchCondition,
  normalizeSearchPagination,
} from './search-rules';

describe('transactions 搜索与多维筛选纯规则', () => {
  it('转义 SQL LIKE 通配符并生成严格参数化 WHERE 条件', () => {
    expect(escapeSqlLikePattern('50%_off\\test')).toBe('50\\%\\_off\\\\test');

    const { whereSql, params } = buildTransactionSearchWhere({
      keyword: ' 咖啡_50% ',
      types: ['expense', 'refund'],
      categoryId: 'cat_exp_food',
      accountId: 'acc_wechat',
      startDate: '2026-11-01',
      endDate: '2026-11-30',
      minAmountCents: 1000,
      maxAmountCents: 50000,
    });

    expect(whereSql).toContain("ESCAPE '\\'");
    expect(whereSql).toContain('t.type IN (?, ?)');
    expect(whereSql).toContain('(t.category_id = ? OR c.parent_id = ?)');
    expect(whereSql).toContain('(t.account_id = ? OR t.to_account_id = ?)');
    expect(whereSql).toContain('t.occurred_on >= ?');
    expect(whereSql).toContain('t.occurred_on <= ?');
    expect(whereSql).toContain('t.amount_cents >= ?');
    expect(whereSql).toContain('t.amount_cents <= ?');
    expect(params).toEqual([
      '%咖啡\\_50\\%%',
      '%咖啡\\_50\\%%',
      '%咖啡\\_50\\%%',
      '%咖啡\\_50\\%%',
      '%咖啡\\_50\\%%',
      'expense',
      'refund',
      'cat_exp_food',
      'cat_exp_food',
      'acc_wechat',
      'acc_wechat',
      '2026-11-01',
      '2026-11-30',
      1000,
      50000,
    ]);
  });

  it('空条件返回空 WHERE 且忽略非法日期，正确统计高级筛选数量', () => {
    const empty = buildTransactionSearchWhere({ startDate: '2026-99-99', keyword: '   ' });
    expect(empty.whereSql).toBe('');
    expect(empty.params).toEqual([]);
    expect(hasAnySearchCondition({})).toBe(false);
    expect(countActiveAdvancedFilters({})).toBe(0);

    const activeFilter = {
      accountId: 'acc_1',
      startDate: '2026-11-01',
      minAmountCents: 500,
    };
    expect(countActiveAdvancedFilters(activeFilter)).toBe(3);
    expect(hasAnySearchCondition(activeFilter)).toBe(true);
  });

  it('规范化分页上下界', () => {
    expect(normalizeSearchPagination({})).toEqual({ limit: 40, offset: 0 });
    expect(normalizeSearchPagination({ limit: 999, offset: -5 })).toEqual({
      limit: 200,
      offset: 0,
    });
    expect(normalizeSearchPagination({ limit: 25, offset: 50 })).toEqual({
      limit: 25,
      offset: 50,
    });
  });
});
