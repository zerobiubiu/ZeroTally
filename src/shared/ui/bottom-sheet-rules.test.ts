import { describe, expect, it } from 'vitest';
import {
  clampBottomSheetDragOffset,
  resolveBodyPanActivationMode,
  resolveBodyPanUpdateDecision,
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

    // 不支持展开的弹窗（maxOverdragUp = 0）向上拉严格归零，不做上滑越界
    expect(
      clampBottomSheetDragOffset({
        startOffset: 0,
        translationY: -120,
        maxDismissOffset: 400,
        maxOverdragUp: 0,
      })
    ).toBe(0);
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

  it('滚动区协同手势：展开态与单段态在列表顶部激活时不受初始 translationY=0 拦死，下滑接管且上滑让出', () => {
    // 两段半屏态：直接双向接管
    expect(
      resolveBodyPanActivationMode({
        expandable: true,
        expanded: false,
        keyboardVisible: false,
        scrollOffsetY: 0,
      })
    ).toBe('dragging');

    // 两段展开态列表位于顶部：进入待确认下拉态（不因激活瞬间 translationY=0 失败）
    const expandedTopMode = resolveBodyPanActivationMode({
      expandable: true,
      expanded: true,
      keyboardVisible: false,
      scrollOffsetY: 0,
    });
    expect(expandedTopMode).toBe('pending-down');

    // 首帧 translationY=0 保持等待，随后正向位移立刻确认正式下滑接管
    expect(resolveBodyPanUpdateDecision(expandedTopMode, 0, 0)).toEqual({
      nextMode: 'pending-down',
      shouldApplyDrag: false,
      justConfirmedDrag: false,
    });
    expect(resolveBodyPanUpdateDecision(expandedTopMode, 14, 0)).toEqual({
      nextMode: 'dragging',
      shouldApplyDrag: true,
      justConfirmedDrag: true,
    });
    // 若首帧向上滑动，则释放给 ScrollView 浏览内容
    expect(resolveBodyPanUpdateDecision(expandedTopMode, -8, 0)).toEqual({
      nextMode: 'none',
      shouldApplyDrag: false,
      justConfirmedDrag: false,
    });

    // 两段展开态列表已向下滚动：不抢占下滑手势
    expect(
      resolveBodyPanActivationMode({
        expandable: true,
        expanded: true,
        keyboardVisible: false,
        scrollOffsetY: 48,
      })
    ).toBe('none');

    // 单段滚动态（如账户选择）在顶部同样支持下滑接管、未到顶不接管
    expect(
      resolveBodyPanActivationMode({
        expandable: false,
        expanded: false,
        keyboardVisible: false,
        scrollOffsetY: 0,
      })
    ).toBe('pending-down');
    expect(
      resolveBodyPanActivationMode({
        expandable: false,
        expanded: false,
        keyboardVisible: false,
        scrollOffsetY: 20,
      })
    ).toBe('none');
  });
});
