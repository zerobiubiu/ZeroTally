import { describe, expect, it } from 'vitest';
import { resolveSegmentDragPosition } from './sliding-segmented-rules';

describe('SlidingSegmentedControl 几何与档位解析规则', () => {
  it('按手指位置准确命中三段档位并将滑块中心对齐手指并限位', () => {
    // 轨道内边距 3，共 3 格，每格宽 60（内总宽 180）
    const base = { trackPadding: 3, segmentWidth: 60, count: 3 };

    // 越过左边界时钳位在首格 0
    expect(resolveSegmentDragPosition({ ...base, fingerX: -20 })).toEqual({
      clampedThumbX: 0,
      targetIndex: 0,
    });

    // 手指落于第 2 格中央（3 + 90 = 93）-> 滑块精准居于 60，命中索引 1
    expect(resolveSegmentDragPosition({ ...base, fingerX: 93 })).toEqual({
      clampedThumbX: 60,
      targetIndex: 1,
    });

    // 手指刚跨入第 3 格（3 + 122 = 125）-> 命中索引 2，滑块跟手位于 92
    expect(resolveSegmentDragPosition({ ...base, fingerX: 125 })).toEqual({
      clampedThumbX: 92,
      targetIndex: 2,
    });

    // 越过右边界时钳位在末格 120
    expect(resolveSegmentDragPosition({ ...base, fingerX: 260 })).toEqual({
      clampedThumbX: 120,
      targetIndex: 2,
    });
  });

  it('兼容双段切换边界与单段兜底', () => {
    expect(
      resolveSegmentDragPosition({ fingerX: 105, trackPadding: 3, segmentWidth: 100, count: 2 })
    ).toEqual({
      clampedThumbX: 52,
      targetIndex: 1,
    });

    expect(
      resolveSegmentDragPosition({ fingerX: 50, trackPadding: 3, segmentWidth: 100, count: 1 })
    ).toEqual({
      clampedThumbX: 0,
      targetIndex: 0,
    });
  });
});
