import { describe, expect, it } from 'vitest';
import {
  mergePaginatedTransactions,
  shouldTriggerLazyLoadMore,
} from './pagination-rules';
import type { TransactionListItem } from './types';

function makeItem(id: string): TransactionListItem {
  return {
    id,
    type: 'expense',
    amountCents: 1000,
    categoryId: 'cat_exp_food',
    accountId: 'acc_wallet',
    toAccountId: null,
    refundOfId: null,
    occurredOn: '2026-11-27',
    note: '',
    createdAt: '2026-11-27T00:00:00.000Z',
    updatedAt: '2026-11-27T00:00:00.000Z',
    categoryName: '餐饮',
    categoryIcon: 'restaurant-outline',
    categoryColor: '#E11D48',
    categoryParentId: null,
    categoryParentName: null,
    categoryParentIcon: null,
    categoryParentColor: null,
    accountName: '钱包',
    toAccountName: null,
    refundedCents: 0,
  };
}

describe('transactions 懒加载分页纯规则', () => {
  it('滚动底缘达到内容高度 90% 时触发加载，未达到或已在加载/无更多时不触发', () => {
    // 1000px 内容，视口 500px：offset=350 -> 底缘 850 (85% < 90%) 不触发
    expect(
      shouldTriggerLazyLoadMore({
        contentOffsetY: 350,
        layoutHeight: 500,
        contentHeight: 1000,
        hasMore: true,
        loadingMore: false,
      })
    ).toBe(false);

    // offset=400 -> 底缘 900 (90% >= 90%) 触发
    expect(
      shouldTriggerLazyLoadMore({
        contentOffsetY: 400,
        layoutHeight: 500,
        contentHeight: 1000,
        hasMore: true,
        loadingMore: false,
      })
    ).toBe(true);

    // 已在加载中或无更多数据时不重复触发
    expect(
      shouldTriggerLazyLoadMore({
        contentOffsetY: 450,
        layoutHeight: 500,
        contentHeight: 1000,
        hasMore: true,
        loadingMore: true,
      })
    ).toBe(false);

    expect(
      shouldTriggerLazyLoadMore({
        contentOffsetY: 450,
        layoutHeight: 500,
        contentHeight: 1000,
        hasMore: false,
        loadingMore: false,
      })
    ).toBe(false);
  });

  it('分页合并按 id 去重且保留既有顺序', () => {
    const merged = mergePaginatedTransactions(
      [makeItem('t1'), makeItem('t2')],
      [makeItem('t2'), makeItem('t3'), makeItem('t1'), makeItem('t4')]
    );
    expect(merged.map((i) => i.id)).toEqual(['t1', 't2', 't3', 't4']);
  });
});
