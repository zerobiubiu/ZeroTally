/**
 * 长按底栏居中「+ 记一笔」扇形快捷选择纯几何与命中解析规则：
 * - 以「+」按钮中心为原点，0° 为正上方，负角偏向左侧、正角偏向右侧，按项数对称分布；
 * - 独立于 React Native 运行时，供组件与 Vitest 单测共同复用。
 */

export const MAX_RADIAL_QUICK_ITEMS = 5;
export const RADIAL_MENU_RADIUS = 118;
export const RADIAL_CANCEL_RADIUS = 42;
export const RADIAL_CANCEL_BELOW_Y = 34;

export interface RadialSlotPosition {
  index: number;
  /** 相对正上方的角度（度）：负为左，正为右 */
  angleDeg: number;
  /** 相对圆心水平偏移（px） */
  x: number;
  /** 相对圆心垂直偏移（px，向上为负） */
  y: number;
}

const ANGLE_PRESETS: Record<number, readonly number[]> = {
  1: [0],
  2: [-28, 28],
  3: [-46, 0, 46],
  4: [-60, -20, 20, 60],
  5: [-68, -34, 0, 34, 68],
};

/**
 * 返回 1~5 个扇形快捷选项从左至右的对称角度分布（度）。
 */
export function computeRadialSlotAngles(count: number): readonly number[] {
  const clamped = Math.max(0, Math.min(MAX_RADIAL_QUICK_ITEMS, Math.floor(count)));
  if (clamped === 0) {
    return [];
  }
  return ANGLE_PRESETS[clamped] ?? ANGLE_PRESETS[MAX_RADIAL_QUICK_ITEMS]!;
}

/**
 * 计算每个扇形选项相对原点（+ 按钮圆心）的 (x, y) 像素偏移。
 */
export function computeRadialSlotPositions(
  count: number,
  radius: number = RADIAL_MENU_RADIUS
): RadialSlotPosition[] {
  const angles = computeRadialSlotAngles(count);
  return angles.map((angleDeg, index) => {
    const rad = (angleDeg * Math.PI) / 180;
    return {
      index,
      angleDeg,
      x: Math.round(radius * Math.sin(rad) * 10) / 10,
      y: Math.round(-radius * Math.cos(rad) * 10) / 10,
    };
  });
}

/**
 * 根据手指相对原点的位移 (dx, dy) 判定命中的扇形选项索引；
 * - 在原点取消死区内（dist < 42px）或明显向下拖回底栏下方（dy > 34px）返回 null（松手取消）；
 * - 在上半扇区内沿射线匹配角度差最小项（角度容差随项数自适应），单手滑选零费力。
 */
export function hitTestRadialOption(
  dx: number,
  dy: number,
  count: number,
  cancelRadius: number = RADIAL_CANCEL_RADIUS
): number | null {
  const angles = computeRadialSlotAngles(count);
  if (angles.length === 0) {
    return null;
  }

  const dist = Math.hypot(dx, dy);
  if (dist < cancelRadius || dy > RADIAL_CANCEL_BELOW_Y) {
    return null;
  }

  // 0° 指向正上方 (0, -1)，左偏为负角，右偏为正角
  const fingerAngleDeg = (Math.atan2(dx, -dy) * 180) / Math.PI;
  if (Math.abs(fingerAngleDeg) > 95) {
    return null;
  }

  const maxAngleTolerance = angles.length <= 2 ? 42 : angles.length === 3 ? 30 : 24;
  let bestIndex: number | null = null;
  let bestDiff = Number.POSITIVE_INFINITY;

  for (let i = 0; i < angles.length; i += 1) {
    const diff = Math.abs(fingerAngleDeg - angles[i]!);
    if (diff < bestDiff) {
      bestDiff = diff;
      bestIndex = i;
    }
  }

  return bestDiff <= maxAngleTolerance ? bestIndex : null;
}
