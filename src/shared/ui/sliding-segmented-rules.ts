/**
 * 分段滑块控件（SlidingSegmentedControl）纯几何与档位计算规则：
 * - 独立于 React Native 运行时，供组件与 Vitest 单测共同复用。
 */

export interface ResolveSegmentDragInput {
  /** 手指相对轨道左侧边缘的 X 坐标 */
  fingerX: number;
  /** 轨道内边距 */
  trackPadding: number;
  /** 单格等分宽度 */
  segmentWidth: number;
  /** 分段总数（>= 1） */
  count: number;
}

export interface ResolvedSegmentDrag {
  /** 滑块限位后的 X 偏移量（相对轨道内左侧起点） */
  clampedThumbX: number;
  /** 命中的目标档位索引（0 .. count - 1） */
  targetIndex: number;
}

export function resolveSegmentDragPosition(input: ResolveSegmentDragInput): ResolvedSegmentDrag {
  const safeCount = Math.max(1, Math.floor(input.count));
  const safeSegWidth = Math.max(1, input.segmentWidth);
  const innerX = input.fingerX - input.trackPadding;
  const maxThumbX = Math.max(0, (safeCount - 1) * safeSegWidth);
  const clampedThumbX = Math.max(0, Math.min(maxThumbX, innerX - safeSegWidth / 2));
  const targetIndex = Math.max(0, Math.min(safeCount - 1, Math.floor(innerX / safeSegWidth)));

  return {
    clampedThumbX,
    targetIndex,
  };
}
