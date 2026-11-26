import { describe, expect, it } from 'vitest';
import { MAX_AMOUNT_CENTS } from '../../shared/money/money';
import {
  computeScrubbedAccountIndex,
  computeScrubbedAmountCents,
  MIN_SCRUB_AMOUNT_CENTS,
  resolveAmountScrubStepCents,
  resolveQuickCardScrubAxis,
} from './scrub-rules';

describe('快捷卡片长按手势微调规则（金额与账户）', () => {
  it('位移未越过阈值保持 none，越过阈值按主导轴锁定 amount 或 account', () => {
    expect(resolveQuickCardScrubAxis(5, -8)).toBe('none');
    expect(resolveQuickCardScrubAxis(6, -12)).toBe('amount');
    expect(resolveQuickCardScrubAxis(-15, 10)).toBe('account');
    expect(resolveQuickCardScrubAxis(10, 10)).toBe('amount');
  });

  it('按起手金额自适应匹配整数分步进，并严格钳位在合法区间', () => {
    expect(resolveAmountScrubStepCents(1_200)).toBe(100);
    expect(resolveAmountScrubStepCents(3_500)).toBe(500);
    expect(resolveAmountScrubStepCents(20_000)).toBe(1_000);
    expect(resolveAmountScrubStepCents(80_000)).toBe(5_000);

    // 12 元向上滑 3 步 -> 15 元；向下滑 20 步 -> 钳位最低 1 元
    expect(computeScrubbedAmountCents(1_200, -42, 14)).toBe(1_500);
    expect(computeScrubbedAmountCents(1_200, 280, 14)).toBe(MIN_SCRUB_AMOUNT_CENTS);

    // 35 元向上滑 2 步（步长 5 元）-> 45 元
    expect(computeScrubbedAmountCents(3_500, -28, 14)).toBe(4_500);

    // 超过上限钳位在 MAX_AMOUNT_CENTS
    expect(computeScrubbedAmountCents(MAX_AMOUNT_CENTS - 100, -140, 14)).toBe(MAX_AMOUNT_CENTS);
  });

  it('左右滑动按步长切换账户索引并安全边界钳位', () => {
    expect(computeScrubbedAccountIndex(1, 4, 40, 38)).toBe(2);
    expect(computeScrubbedAccountIndex(1, 4, -40, 38)).toBe(0);
    expect(computeScrubbedAccountIndex(1, 4, -200, 38)).toBe(0);
    expect(computeScrubbedAccountIndex(1, 4, 300, 38)).toBe(3);
    expect(computeScrubbedAccountIndex(0, 1, 100, 38)).toBe(0);
  });
});
