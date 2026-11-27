import type { TransactionListItem } from './types';

/** 明细与账户流水的默认单页加载条数 */
export const DEFAULT_LEDGER_PAGE_SIZE = 40;

/** 触底懒加载触发比例：滚动可视区域底缘抵达内容总高度 90% 时预加载下一页 */
export const LAZY_LOAD_TRIGGER_RATIO = 0.9;

export interface LazyLoadScrollMetrics {
  contentOffsetY: number;
  layoutHeight: number;
  contentHeight: number;
  hasMore: boolean;
  loadingMore: boolean;
  triggerRatio?: number;
}

/**
 * 纯规则判定：滚动位置是否已到达懒加载触发阈值（默认 90%）。
 * 当列表尚未占满首屏但后端仍有更多数据时（极少数高分辨率平板/大屏场景）也允许触发补齐。
 */
export function shouldTriggerLazyLoadMore(metrics: LazyLoadScrollMetrics): boolean {
  const {
    contentOffsetY,
    layoutHeight,
    contentHeight,
    hasMore,
    loadingMore,
    triggerRatio = LAZY_LOAD_TRIGGER_RATIO,
  } = metrics;

  if (!hasMore || loadingMore || layoutHeight <= 0 || contentHeight <= 0) {
    return false;
  }

  if (contentHeight <= layoutHeight) {
    return true;
  }

  const visibleBottom = Math.max(0, contentOffsetY) + layoutHeight;
  return visibleBottom / contentHeight >= triggerRatio;
}

/**
 * 合并分页追加的账单条目并按 id 去重（防止翻页期间插入/删除新账目造成重复行）。
 */
export function mergePaginatedTransactions(
  previous: readonly TransactionListItem[],
  incoming: readonly TransactionListItem[]
): TransactionListItem[] {
  if (incoming.length === 0) {
    return [...previous];
  }
  const seen = new Set(previous.map((item) => item.id));
  const merged = [...previous];
  for (const item of incoming) {
    if (!seen.has(item.id)) {
      seen.add(item.id);
      merged.push(item);
    }
  }
  return merged;
}
