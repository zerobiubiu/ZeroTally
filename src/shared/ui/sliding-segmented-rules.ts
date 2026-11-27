/**
 * 分段滑块控件（SlidingSegmentedControl）纯几何与档位计算规则：
 * - 独立于 React Native 运行时，供组件与 Vitest 单测共同复用。
 */

export interface SegmentedTrackMetricsInput {
  /** 外层轨道 border-box 总宽度（来自 onLayout） */
  layoutWidth: number;
  /** 外层轨道 border-box 总高度 */
  trackHeight: number;
  /** 轨道内边距 */
  trackPadding: number;
  /** 轨道四周描边宽度 */
  borderWidth: number;
  /** 分段总数（>= 1） */
  count: number;
}

export interface SegmentedTrackMetrics {
  /** 扣除四周 border 与 padding 后的内容区净宽 */
  innerWidth: number;
  /** 扣除四周 border 与 padding 后的内容区净高 */
  innerHeight: number;
  /** 单格精确等分宽度（与 flex:1 子格完全一致） */
  segmentWidth: number;
  /** 从 border-box 边缘到内容区起点的单侧偏移（borderWidth + trackPadding） */
  contentInset: number;
}

/**
 * 计算分段轨道的内容区净尺寸与单格等分宽度：
 * 严格扣除双侧 borderWidth 与 trackPadding，避免绝对定位滑块与 flex 子格产生 2px 偏移。
 */
export function computeSegmentedTrackMetrics(
  input: SegmentedTrackMetricsInput
): SegmentedTrackMetrics {
  const safeCount = Math.max(1, Math.floor(input.count));
  const contentInset = Math.max(0, input.trackPadding) + Math.max(0, input.borderWidth);
  const innerWidth = Math.max(0, input.layoutWidth - contentInset * 2);
  const innerHeight = Math.max(0, input.trackHeight - contentInset * 2);
  return {
    innerWidth,
    innerHeight,
    segmentWidth: innerWidth / safeCount,
    contentInset,
  };
}

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
