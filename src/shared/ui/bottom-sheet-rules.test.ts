import { describe, expect, it } from 'vitest';
import {
  clampBottomSheetDragOffset,
  resolveBottomSheetSnapTarget,
} from './bottom-sheet-rules';

describe('BottomSheet 拖拽阻尼与吸附决策规则', () => {
  it('向下拖动 1:1 跟手且不超过最大高度，向上越界提供渐进阻尼不超上限', () => {
    expect(
      clampBottomSheetDragOffset({
        startOffset: 0,
        translationY: 120,
        maxDismissOffset: 400,
      })
    ).toBe(120);

    expect(
      clampBottomSheetDragOffset({
        startOffset: 0,
        translationY: 600,
        maxDismissOffset: 400,
      })
    ).toBe(400);

    const overdragSmall = clampBottomSheetDragOffset({
      startOffset: 0,
      translationY: -30,
      maxDismissOffset: 400,
      maxOverdragUp: 16,
    });
    const overdragLarge = clampBottomSheetDragOffset({
      startOffset: 0,
      translationY: -300,
      maxDismissOffset: 400,
      maxOverdragUp: 16,
    });
    expect(overdragSmall).toBeLessThan(0);
    expect(overdragSmall).toBeGreaterThan(-16);
    expect(overdragLarge).toBeLessThan(overdragSmall);
    expect(overdragLarge).toBeGreaterThanOrEqual(-16);
  });

  it('单段半屏弹窗：下拉超阈值或快速下甩触发关闭，轻拉松手回弹', () => {
    expect(
      resolveBottomSheetSnapTarget({
        expandable: false,
        startedExpanded: false,
        sheetHeight: 360,
        collapsedOffset: 0,
        translationY: 40,
        velocityY: 0,
      })
    ).toBe('collapsed');

    expect(
      resolveBottomSheetSnapTarget({
        expandable: false,
        startedExpanded: false,
        sheetHeight: 360,
        collapsedOffset: 0,
        translationY: 100,
        velocityY: 100,
      })
    ).toBe('dismiss');

    expect(
      resolveBottomSheetSnapTarget({
        expandable: false,
        startedExpanded: false,
        sheetHeight: 360,
        collapsedOffset: 0,
        translationY: 26,
        velocityY: 900,
      })
    ).toBe('dismiss');
  });

  it('两段式半屏弹窗：支持半屏上拉展开、展开回落半屏及大力下滑直接关闭', () => {
    const base = {
      expandable: true,
      sheetHeight: 700,
      collapsedOffset: 260,
    };

    // 半屏态上拉 -> 展开至全屏
    expect(
      resolveBottomSheetSnapTarget({
        ...base,
        startedExpanded: false,
        translationY: -120,
        velocityY: -200,
      })
    ).toBe('expanded');

    // 半屏态轻拉 -> 留在半屏
    expect(
      resolveBottomSheetSnapTarget({
        ...base,
        startedExpanded: false,
        translationY: 30,
        velocityY: 0,
      })
    ).toBe('collapsed');

    // 半屏态下拉 -> 关闭
    expect(
      resolveBottomSheetSnapTarget({
        ...base,
        startedExpanded: false,
        translationY: 120,
        velocityY: 200,
      })
    ).toBe('dismiss');

    // 全屏态适度下滑 -> 回落半屏
    expect(
      resolveBottomSheetSnapTarget({
        ...base,
        startedExpanded: true,
        translationY: 130,
        velocityY: 150,
      })
    ).toBe('collapsed');

    // 全屏态大幅快速下甩 -> 一步直接关闭
    expect(
      resolveBottomSheetSnapTarget({
        ...base,
        startedExpanded: true,
        translationY: 140,
        velocityY: 1500,
      })
    ).toBe('dismiss');
  });
});
