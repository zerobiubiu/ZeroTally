import { describe, expect, it } from 'vitest';
import {
  GESTURE_TIPS_CATALOG,
  getFirstLaunchHighlightTips,
  getGroupedGestureTips,
  shouldShowFirstLaunchGuide,
} from './rules';

describe('onboarding 首次引导与手势技巧纯规则', () => {
  it('仅在未记录已读标记时弹出首次启动轻量引导', () => {
    expect(shouldShowFirstLaunchGuide(null)).toBe(true);
    expect(shouldShowFirstLaunchGuide('')).toBe(true);
    expect(shouldShowFirstLaunchGuide('0')).toBe(true);
    expect(shouldShowFirstLaunchGuide('1')).toBe(false);
  });

  it('首次引导精选 4 项核心手势，分组目录覆盖完整技巧清单', () => {
    const highlights = getFirstLaunchHighlightTips();
    expect(highlights).toHaveLength(4);

    const groups = getGroupedGestureTips();
    expect(groups).toHaveLength(3);
    const totalCount = groups.reduce((sum, g) => sum + g.items.length, 0);
    expect(totalCount).toBe(GESTURE_TIPS_CATALOG.length);
  });
});
