import { describe, expect, it } from 'vitest';
import {
  computeDetailCollapseRange,
  resolveFloatingActionVisibility,
} from './detail-scroll-rules';

describe('account detail scroll rules', () => {
  it('向上滑动浏览历史流水超过阈值后隐藏悬浮记一笔，向下滑动立即出现', () => {
    // 顶部区域保持显示
    const atTop = resolveFloatingActionVisibility({
      scrollY: 8,
      prevScrollY: 0,
      currentlyVisible: true,
      accumulatedDeltaY: 0,
    });
    expect(atTop.visible).toBe(true);

    // 轻微抖动不立即隐藏
    const jitter = resolveFloatingActionVisibility({
      scrollY: 22,
      prevScrollY: 16,
      currentlyVisible: true,
      accumulatedDeltaY: 0,
    });
    expect(jitter.visible).toBe(true);
    expect(jitter.accumulatedDeltaY).toBe(6);

    // 继续上滑达到阈值立即隐藏
    const hidden = resolveFloatingActionVisibility({
      scrollY: 32,
      prevScrollY: 22,
      currentlyVisible: jitter.visible,
      accumulatedDeltaY: jitter.accumulatedDeltaY,
    });
    expect(hidden.visible).toBe(false);
    expect(hidden.accumulatedDeltaY).toBe(0);

    // 向下滑动轻微位移即立刻恢复出现
    const shown = resolveFloatingActionVisibility({
      scrollY: 26,
      prevScrollY: 32,
      currentlyVisible: false,
      accumulatedDeltaY: 0,
    });
    expect(shown.visible).toBe(true);
  });

  it('根据大卡片实测高度计算合理且严格递增的吸顶小卡收起区间', () => {
    const compact = computeDetailCollapseRange(110);
    expect(compact.startY).toBe(64);
    expect(compact.endY).toBe(100);

    const tallCard = computeDetailCollapseRange(340);
    expect(tallCard.startY).toBe(276);
    expect(tallCard.endY).toBe(312);
  });
});
