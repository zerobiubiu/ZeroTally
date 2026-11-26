/**
 * 快捷卡片长按手势微调纯规则（上下滑动调金额、左右滑动切账户）：
 * - 严格基于整数「分」（cents）计算，无浮点误差，供组件与 Vitest 单测复用。
 */
import { MAX_AMOUNT_CENTS } from '../../shared/money/money';

export type QuickScrubAxis = 'none' | 'amount' | 'account';

export const SCRUB_AXIS_LOCK_THRESHOLD_PX = 10;
export const SCRUB_AMOUNT_PX_PER_STEP = 14;
export const SCRUB_ACCOUNT_PX_PER_STEP = 38;
export const MIN_SCRUB_AMOUNT_CENTS = 100; // 最低 1.00 元

/**
 * 依据手指初始位移锁定操作轴向，防止斜滑时同时触发调金额与切账户。
 */
export function resolveQuickCardScrubAxis(
  dx: number,
  dy: number,
  threshold: number = SCRUB_AXIS_LOCK_THRESHOLD_PX
): QuickScrubAxis {
  const absX = Math.abs(dx);
  const absY = Math.abs(dy);
  if (absX < threshold && absY < threshold) {
    return 'none';
  }
  return absY >= absX ? 'amount' : 'account';
}

/**
 * 依据起手金额自动匹配最顺手的整数分步进：
 * - <= 20 元：每次 ±1 元
 * - <= 100 元：每次 ±5 元
 * - <= 500 元：每次 ±10 元
 * - > 500 元：每次 ±50 元
 */
export function resolveAmountScrubStepCents(baseAmountCents: number): number {
  if (baseAmountCents <= 2_000) {
    return 100;
  }
  if (baseAmountCents <= 10_000) {
    return 500;
  }
  if (baseAmountCents <= 50_000) {
    return 1_000;
  }
  return 5_000;
}

/**
 * 根据竖向拖动距离计算新金额（分）：
 * - 向上滑（translationY < 0）增加金额；向下滑（translationY > 0）减少金额；
 * - 严格钳位在 [1.00 元, MAX_AMOUNT_CENTS]。
 */
export function computeScrubbedAmountCents(
  baseAmountCents: number,
  translationY: number,
  pxPerStep: number = SCRUB_AMOUNT_PX_PER_STEP
): number {
  const safeBase = Math.max(MIN_SCRUB_AMOUNT_CENTS, Math.round(baseAmountCents));
  const stepCents = resolveAmountScrubStepCents(safeBase);
  const steps = Math.trunc(-translationY / Math.max(1, pxPerStep));
  if (steps === 0) {
    return safeBase;
  }
  const next = safeBase + steps * stepCents;
  return Math.max(MIN_SCRUB_AMOUNT_CENTS, Math.min(MAX_AMOUNT_CENTS, next));
}

/**
 * 根据横向拖动距离计算目标账户索引（向右滑切下一个，向左滑切上一个，边界钳位）。
 */
export function computeScrubbedAccountIndex(
  baseIndex: number,
  totalAccounts: number,
  translationX: number,
  pxPerStep: number = SCRUB_ACCOUNT_PX_PER_STEP
): number {
  if (totalAccounts <= 1) {
    return 0;
  }
  const safeBase = Math.max(0, Math.min(totalAccounts - 1, Math.floor(baseIndex)));
  const steps = Math.trunc(translationX / Math.max(1, pxPerStep));
  return Math.max(0, Math.min(totalAccounts - 1, safeBase + steps));
}
