/**
 * 账户详情页滚动交互纯规则：
 * 1. 底部悬浮「记一笔」按钮的方向驱动显隐（上滑浏览历史时收起隐藏，下滑或回到顶部时立即出现）；
 * 2. 顶部大卡片收起为吸顶小卡片的阈值判定。
 */

export interface FloatingActionScrollInput {
  /** 当前纵向滚动偏移（px） */
  scrollY: number;
  /** 上一次记录的纵向滚动偏移（px） */
  prevScrollY: number;
  /** 当前悬浮按钮是否处于显示状态 */
  currentlyVisible: boolean;
  /** 本次手势方向上的累计位移（正值表示向上滑/列表下滚，负值表示向下滑/列表上滚） */
  accumulatedDeltaY: number;
}

export interface FloatingActionScrollResult {
  visible: boolean;
  accumulatedDeltaY: number;
}

/** 接近顶部时始终显示底部悬浮「记一笔」 */
export const FLOATING_CTA_TOP_LOCK_Y = 12;
/** 触发隐藏所需的最小累计上滑位移（px），滤除单帧微抖 */
export const FLOATING_CTA_HIDE_DELTA_Y = 14;
/** 触发重新出现所需的最小下滑位移（px），保证向下滑动立即响应 */
export const FLOATING_CTA_SHOW_DELTA_Y = 4;

/**
 * 计算账户详情页底部悬浮「记一笔」按钮在滚动后的目标显隐状态。
 */
export function resolveFloatingActionVisibility({
  scrollY,
  prevScrollY,
  currentlyVisible,
  accumulatedDeltaY,
}: FloatingActionScrollInput): FloatingActionScrollResult {
  const clampedY = Math.max(0, scrollY);
  const clampedPrevY = Math.max(0, prevScrollY);

  if (clampedY <= FLOATING_CTA_TOP_LOCK_Y) {
    return { visible: true, accumulatedDeltaY: 0 };
  }

  const dy = clampedY - clampedPrevY;
  if (Math.abs(dy) < 0.5) {
    return { visible: currentlyVisible, accumulatedDeltaY };
  }

  // 方向反转时重置累计位移，确保立即响应反向滑动
  const sameDirection =
    (dy > 0 && accumulatedDeltaY > 0) || (dy < 0 && accumulatedDeltaY < 0);
  const nextAccumulated = sameDirection ? accumulatedDeltaY + dy : dy;

  if (nextAccumulated >= FLOATING_CTA_HIDE_DELTA_Y && currentlyVisible) {
    return { visible: false, accumulatedDeltaY: 0 };
  }

  if (nextAccumulated <= -FLOATING_CTA_SHOW_DELTA_Y && !currentlyVisible) {
    return { visible: true, accumulatedDeltaY: 0 };
  }

  return {
    visible: currentlyVisible,
    accumulatedDeltaY: nextAccumulated,
  };
}

/**
 * 计算大卡片收起为顶部吸顶小卡片的滚动插值区间 [startY, endY]。
 */
export function computeDetailCollapseRange(heroCardHeight: number): {
  startY: number;
  endY: number;
} {
  const safeHeight = Number.isFinite(heroCardHeight) && heroCardHeight > 0 ? heroCardHeight : 200;
  const startY = Math.max(64, Math.round(safeHeight - 64));
  return {
    startY,
    endY: startY + 36,
  };
}
