import { describe, expect, it } from 'vitest';
import {
  computeRadialSlotAngles,
  computeRadialSlotPositions,
  hitTestRadialOption,
} from './radial-menu-rules';

describe('长按「+ 记一笔」扇形快捷选项几何与命中规则', () => {
  it('按 1~5 项对称分布扇形角度，且坐标均位于圆心上方', () => {
    expect(computeRadialSlotAngles(0)).toEqual([]);
    expect(computeRadialSlotAngles(1)).toEqual([0]);
    expect(computeRadialSlotAngles(3)).toEqual([-46, 0, 46]);
    expect(computeRadialSlotAngles(5)).toEqual([-68, -34, 0, 34, 68]);

    const positions = computeRadialSlotPositions(5, 118);
    expect(positions).toHaveLength(5);
    expect(positions[2]).toEqual({ index: 2, angleDeg: 0, x: 0, y: -118 });
    // 左右严格对称
    expect(positions[0]!.x).toBeCloseTo(-positions[4]!.x, 1);
    expect(positions[0]!.y).toBeCloseTo(positions[4]!.y, 1);
    expect(positions.every((p) => p.y < 0)).toBe(true);
  });

  it('在原点死区或明显向下滑返回 null（安全取消），滑向各扇区精准命中对应项', () => {
    // 原点死区返回 null
    expect(hitTestRadialOption(10, -15, 5)).toBeNull();
    // 向下划出底栏返回 null
    expect(hitTestRadialOption(0, 50, 5)).toBeNull();

    // 5 项扇区：正上方命中中间第 2 项
    expect(hitTestRadialOption(0, -100, 5)).toBe(2);
    // 左上最外侧（-68° 方向）命中第 0 项
    expect(hitTestRadialOption(-105, -42, 5)).toBe(0);
    // 左上中侧（-34° 方向）命中第 1 项
    expect(hitTestRadialOption(-62, -92, 5)).toBe(1);
    // 右上中侧（+34° 方向）命中第 3 项
    expect(hitTestRadialOption(62, -92, 5)).toBe(3);
    // 右上最外侧（+68° 方向）命中第 4 项
    expect(hitTestRadialOption(105, -42, 5)).toBe(4);
  });

  it('兼容 2 项与 3 项少数量场景的宽容角度吸附', () => {
    expect(hitTestRadialOption(-48, -90, 2)).toBe(0);
    expect(hitTestRadialOption(48, -90, 2)).toBe(1);
    expect(hitTestRadialOption(0, -90, 3)).toBe(1);
    expect(hitTestRadialOption(75, -75, 3)).toBe(2);
  });
});
