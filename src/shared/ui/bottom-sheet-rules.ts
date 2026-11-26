/**
 * 底部半屏弹窗（BottomSheet）拖拽阻尼与吸附/关闭决策纯规则
 * - 单段模式（expandable = false）：静止偏移为 0；上拉提供克制橡皮筋阻尼，下拉过阈值或快甩触发关闭。
 * - 两段模式（expandable = true）：0 = 全屏展开态，collapsedOffset = 半屏静息态；支持半屏 ⇄ 全屏平滑切换及任意态快速下滑关闭。
 */

export type BottomSheetSnapTarget = 'expanded' | 'collapsed' | 'dismiss';

export interface ClampSheetDragParams {
  /** 本次手势起点对应的基准 translateY（展开态为 0，半屏态为 collapsedOffset） */
  startOffset: number;
  /** 手指纵向位移（正值向下，负值向上） */
  translationY: number;
  /** 允许的最大下拉位移（通常等于面板高度） */
  maxDismissOffset: number;
  /** 上拉越界阻尼上限（默认 16dp） */
  maxOverdragUp?: number;
}

/**
 * 计算拖拽过程中的实时 translateY（向上超出 0 时施加橡皮筋阻尼，向下 1:1 跟手）。
 */
export function clampBottomSheetDragOffset({
  startOffset,
  translationY,
  maxDismissOffset,
  maxOverdragUp = 16,
}: ClampSheetDragParams): number {
  const raw = startOffset + translationY;
  if (raw < 0) {
    // 软阻尼曲线：越往上拉阻力越大，永不超过 -maxOverdragUp
    const damped = -maxOverdragUp * (1 - Math.exp(raw / (maxOverdragUp * 3)));
    return Math.max(-maxOverdragUp, damped);
  }
  return Math.min(Math.max(0, maxDismissOffset), raw);
}

export interface ResolveSnapParams {
  expandable: boolean;
  /** 手势起点是否处于全屏展开态 */
  startedExpanded: boolean;
  /** 面板当前总高度（单段态为实测高度，两段态为展开高度） */
  sheetHeight: number;
  /** 半屏静息偏移（单段态为 0，两段态为 expandedHeight - collapsedHeight） */
  collapsedOffset: number;
  /** 手指松手时的纵向位移（正值向下，负值向上） */
  translationY: number;
  /** 手指松手时的纵向速度（px/s，正值向下，负值向上） */
  velocityY: number;
}

/**
 * 根据松手位置与速度预测（位置 + 0.14s 惯性投影）决定目标落点：展开 / 半屏 / 关闭。
 */
export function resolveBottomSheetSnapTarget({
  expandable,
  startedExpanded,
  sheetHeight,
  collapsedOffset,
  translationY,
  velocityY,
}: ResolveSnapParams): BottomSheetSnapTarget {
  const safeHeight = Math.max(120, sheetHeight);

  if (!expandable || collapsedOffset <= 0) {
    const dismissDistance = Math.min(110, Math.max(64, safeHeight * 0.24));
    const projectedY = translationY + velocityY * 0.14;
    const isFastFlingDown = velocityY > 750 && translationY > 18;
    if (isFastFlingDown || projectedY > dismissDistance) {
      return 'dismiss';
    }
    return 'collapsed';
  }

  const collapsedVisibleHeight = Math.max(120, safeHeight - collapsedOffset);
  const startY = startedExpanded ? 0 : collapsedOffset;
  const currentY = startY + translationY;
  const projectedY = currentY + velocityY * 0.14;

  if (startedExpanded) {
    // 全屏态大力快甩或大幅下拉：一步直接关闭
    const directDismissThreshold = collapsedOffset + Math.min(100, collapsedVisibleHeight * 0.28);
    if ((velocityY > 1250 && translationY > 90) || projectedY > directDismissThreshold) {
      return 'dismiss';
    }
    // 适度下滑：吸附回半屏态
    if (projectedY > collapsedOffset * 0.35 || (velocityY > 520 && translationY > 24)) {
      return 'collapsed';
    }
    return 'expanded';
  }

  // 半屏态上拉：吸附展开至全屏态
  if (projectedY < collapsedOffset * 0.58 || (velocityY < -520 && translationY < -20)) {
    return 'expanded';
  }

  // 半屏态下拉：关闭弹窗
  const dismissFromHalfThreshold =
    collapsedOffset + Math.min(105, Math.max(64, collapsedVisibleHeight * 0.25));
  if ((velocityY > 750 && translationY > 18) || projectedY > dismissFromHalfThreshold) {
    return 'dismiss';
  }

  return 'collapsed';
}
