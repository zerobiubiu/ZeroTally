import { describe, expect, it } from 'vitest';
import { MAX_AMOUNT_CENTS } from '../../shared/money/money';
import {
  advanceAmountScrubSession,
  AMOUNT_SCRUB_STEPS_CENTS,
  computeScrubbedAccountIndex,
  createAmountScrubSession,
  MIN_SCRUB_AMOUNT_CENTS,
  resolveAmountScrubStepBySpeed,
  resolveQuickCardScrubAxis,
  stepAmountCentsOnGrid,
} from './scrub-rules';

describe('快捷卡片长按手势微调规则（五档速度自适应调金额与切账户）', () => {
  it('位移未越过阈值保持 none，越过阈值按主导轴锁定 amount 或 account', () => {
    expect(resolveQuickCardScrubAxis(5, -8)).toBe('none');
    expect(resolveQuickCardScrubAxis(6, -12)).toBe('amount');
    expect(resolveQuickCardScrubAxis(-15, 10)).toBe('account');
    expect(resolveQuickCardScrubAxis(10, 10)).toBe('amount');
  });

  it('按滑动速度准确映射 0.01 / 0.05 / 0.10 / 0.50 / 1.00 五档步进，并具备降档滞回防抖', () => {
    expect(AMOUNT_SCRUB_STEPS_CENTS).toEqual([1, 5, 10, 50, 100]);

    expect(resolveAmountScrubStepBySpeed(0)).toBe(1);
    expect(resolveAmountScrubStepBySpeed(40)).toBe(1);
    expect(resolveAmountScrubStepBySpeed(60)).toBe(5);
    expect(resolveAmountScrubStepBySpeed(140)).toBe(10);
    expect(resolveAmountScrubStepBySpeed(280)).toBe(50);
    expect(resolveAmountScrubStepBySpeed(520)).toBe(100);

    // 负速度取绝对值同样生效
    expect(resolveAmountScrubStepBySpeed(-520)).toBe(100);

    // 降档滞回：当前 1.00 档，速度轻落至 410（高于 450 * 0.85 = 382.5）不乱跳；降至 350 顺滑降到 0.50 档
    expect(resolveAmountScrubStepBySpeed(410, 100)).toBe(100);
    expect(resolveAmountScrubStepBySpeed(350, 100)).toBe(50);
    // 骤慢至 20 直接跨档降至 0.01 档
    expect(resolveAmountScrubStepBySpeed(20, 100)).toBe(1);
  });

  it('步进网格对齐：高档位自动对齐整倍落点，0.01 档逐分精确增减并严格边界钳位', () => {
    // 4.03 元在 0.50 档上滑 1 步 -> 4.50，上滑 2 步 -> 5.00；下滑 1 步 -> 4.00
    expect(stepAmountCentsOnGrid(403, 50, 1)).toBe(450);
    expect(stepAmountCentsOnGrid(403, 50, 2)).toBe(500);
    expect(stepAmountCentsOnGrid(403, 50, -1)).toBe(400);

    // 已在整数倍网格上时直接等步增减
    expect(stepAmountCentsOnGrid(400, 100, 3)).toBe(700);
    expect(stepAmountCentsOnGrid(400, 100, -2)).toBe(200);

    // 0.01 档逐分精准调节，最低可调至 0.01 元
    expect(stepAmountCentsOnGrid(403, 1, 2)).toBe(405);
    expect(stepAmountCentsOnGrid(3, 1, -10)).toBe(MIN_SCRUB_AMOUNT_CENTS);
    expect(MIN_SCRUB_AMOUNT_CENTS).toBe(1);

    // 超过金额上限严格钳位
    expect(stepAmountCentsOnGrid(MAX_AMOUNT_CENTS - 50, 100, 2)).toBe(MAX_AMOUNT_CENTS);
  });

  it('增量微调会话：快滑大步转慢滑精调绝不回跳，反手微调即时跟手且边界不堆积', () => {
    // 从 ¥4.00 起手
    let session = createAmountScrubSession(400, 0);

    // 快速上滑 36dp（3 步 × ¥1.00）-> ¥7.00
    session = advanceAmountScrubSession(session, -36, -600, 12);
    expect(session.stepCents).toBe(100);
    expect(session.amountCents).toBe(700);

    // 随后放慢速度慢慢上滑，逐步回落至 0.01 档精调，金额只增不退
    session = advanceAmountScrubSession(session, -42, -20, 12);
    session = advanceAmountScrubSession(session, -48, -20, 12);
    session = advanceAmountScrubSession(session, -60, -20, 12);
    session = advanceAmountScrubSession(session, -72, -20, 12);
    expect(session.amountCents).toBeGreaterThan(700);

    // 反手慢速下拉：速度平滑立刻重置进入 0.01 档，精准回调 1 分
    const beforeReverse = session.amountCents;
    session = advanceAmountScrubSession(session, -60, 20, 12);
    expect(session.stepCents).toBe(1);
    expect(session.amountCents).toBe(beforeReverse - 1);

    // 从 ¥0.05 大幅下滑触底钳位到 ¥0.01 且清空剩余位移，随后反手上滑 12dp 立即涨到 ¥0.02
    let low = createAmountScrubSession(5, 0);
    low = advanceAmountScrubSession(low, 240, 500, 12);
    expect(low.amountCents).toBe(1);
    expect(low.pendingPx).toBe(0);

    low = advanceAmountScrubSession(low, 228, -20, 12);
    expect(low.stepCents).toBe(1);
    expect(low.amountCents).toBe(2);
  });

  it('左右滑动按步长切换账户索引并安全边界钳位', () => {
    expect(computeScrubbedAccountIndex(1, 4, 40, 38)).toBe(2);
    expect(computeScrubbedAccountIndex(1, 4, -40, 38)).toBe(0);
    expect(computeScrubbedAccountIndex(1, 4, -200, 38)).toBe(0);
    expect(computeScrubbedAccountIndex(1, 4, 300, 38)).toBe(3);
    expect(computeScrubbedAccountIndex(0, 1, 100, 38)).toBe(0);
  });
});
