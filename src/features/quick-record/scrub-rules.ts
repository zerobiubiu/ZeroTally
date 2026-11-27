/**
 * 快捷卡片长按手势微调纯规则（上下滑动调金额、左右滑动切账户）：
 * - 严格基于整数「分」（cents）计算，无浮点误差，供组件与 Vitest 单测复用。
 * - 金额调节支持 5 档速度自适应步进（0.01 / 0.05 / 0.10 / 0.50 / 1.00 元），
 *   通过增量积分器与网格对齐保证快滑大步、慢滑精调且切换速度时绝不回跳。
 */
import { MAX_AMOUNT_CENTS } from '../../shared/money/money';

export type QuickScrubAxis = 'none' | 'amount' | 'account';

/** 支持的 5 档速度自适应金额步进（单位：分，对应 ¥0.01 ~ ¥1.00） */
export const AMOUNT_SCRUB_STEPS_CENTS = [1, 5, 10, 50, 100] as const;
export type AmountScrubStepCents = (typeof AMOUNT_SCRUB_STEPS_CENTS)[number];

/** 对应 5 档步进的升档速度阈值（dp/s）：<55 -> 0.01，55 -> 0.05，130 -> 0.10，250 -> 0.50，450 -> 1.00 */
export const AMOUNT_SCRUB_SPEED_THRESHOLDS = [55, 130, 250, 450] as const;
const DOWNSHIFT_HYSTERESIS_RATIO = 0.85;
const SPEED_EMA_ALPHA = 0.4;

export const SCRUB_AXIS_LOCK_THRESHOLD_PX = 10;
export const SCRUB_AMOUNT_PX_PER_STEP = 12;
export const SCRUB_ACCOUNT_PX_PER_STEP = 38;
export const MIN_SCRUB_AMOUNT_CENTS = 1; // 最低 0.01 元

export interface AmountScrubSession {
  amountCents: number;
  stepCents: AmountScrubStepCents;
  lastTranslationY: number;
  /** 最近一次有效滑动方向（向上增加为 1，向下减少为 -1，初始为 0） */
  lastDirection: -1 | 0 | 1;
  /** 累计尚未折算为整步的纵向位移（向上增加为正，向下减少为负） */
  pendingPx: number;
  smoothedSpeedPxPerSec: number;
  hasVelocitySample: boolean;
}

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
 * 依据当前竖向滑动速度（dp/s）智能匹配 5 档金额步进（分）：
 * - < 55 dp/s：¥0.01（1 分，极慢精调）
 * - 55 ~ 129 dp/s：¥0.05（5 分）
 * - 130 ~ 249 dp/s：¥0.10（10 分）
 * - 250 ~ 449 dp/s：¥0.50（50 分）
 * - >= 450 dp/s：¥1.00（100 分，快速大步）
 * 传入 prevStepCents 时对降档施加轻度滞回（0.85×），防止手指在临界速度附近档位闪烁。
 */
export function resolveAmountScrubStepBySpeed(
  speedPxPerSec: number,
  prevStepCents?: AmountScrubStepCents
): AmountScrubStepCents {
  const speed = Number.isFinite(speedPxPerSec) ? Math.abs(speedPxPerSec) : 0;

  let rawIndex = 0;
  for (let i = 0; i < AMOUNT_SCRUB_SPEED_THRESHOLDS.length; i += 1) {
    const threshold = AMOUNT_SCRUB_SPEED_THRESHOLDS[i];
    if (threshold !== undefined && speed >= threshold) {
      rawIndex = i + 1;
    }
  }

  const stepAt = (index: number): AmountScrubStepCents =>
    AMOUNT_SCRUB_STEPS_CENTS[index] ?? 1;

  if (prevStepCents === undefined) {
    return stepAt(rawIndex);
  }

  const prevIndex = AMOUNT_SCRUB_STEPS_CENTS.indexOf(prevStepCents);
  if (prevIndex < 0 || rawIndex >= prevIndex) {
    return stepAt(rawIndex);
  }

  // 降档滞回：仅当速度低于对应档位下限的 85% 时才降档，避免边界来回跳变
  let resolvedIndex = prevIndex;
  while (resolvedIndex > rawIndex) {
    const lowerThreshold = AMOUNT_SCRUB_SPEED_THRESHOLDS[resolvedIndex - 1];
    if (lowerThreshold === undefined || speed >= lowerThreshold * DOWNSHIFT_HYSTERESIS_RATIO) {
      break;
    }
    resolvedIndex -= 1;
  }
  return stepAt(resolvedIndex);
}

/**
 * 在当前步进网格上推进一步或多步金额（分）：
 * - 当当前金额不处于高档步进整数倍上时（如 4.03 元切到 0.50 档），首步先顺向对齐至最近倍数（4.50 / 4.00），
 *   保证大步快滑落点始终干脆整洁；0.01 档严格逐分精确增减；
 * - 严格钳位在 [MIN_SCRUB_AMOUNT_CENTS, MAX_AMOUNT_CENTS]。
 */
export function stepAmountCentsOnGrid(
  currentCents: number,
  stepCents: AmountScrubStepCents,
  deltaSteps: number
): number {
  const clampedCurrent = Math.max(
    MIN_SCRUB_AMOUNT_CENTS,
    Math.min(MAX_AMOUNT_CENTS, Math.round(currentCents))
  );
  if (deltaSteps === 0) {
    return clampedCurrent;
  }

  let next = clampedCurrent;
  if (deltaSteps > 0) {
    if (stepCents > 1 && clampedCurrent % stepCents !== 0) {
      const firstAligned = Math.ceil(clampedCurrent / stepCents) * stepCents;
      next = firstAligned + (deltaSteps - 1) * stepCents;
    } else {
      next = clampedCurrent + deltaSteps * stepCents;
    }
  } else {
    const absSteps = -deltaSteps;
    if (stepCents > 1 && clampedCurrent % stepCents !== 0) {
      const firstAligned = Math.floor(clampedCurrent / stepCents) * stepCents;
      next = firstAligned - (absSteps - 1) * stepCents;
    } else {
      next = clampedCurrent - absSteps * stepCents;
    }
  }

  return Math.max(MIN_SCRUB_AMOUNT_CENTS, Math.min(MAX_AMOUNT_CENTS, next));
}

/**
 * 初始化一次金额上下滑动微调会话。
 */
export function createAmountScrubSession(
  initialAmountCents: number,
  initialTranslationY = 0
): AmountScrubSession {
  const safeAmount = Math.max(
    MIN_SCRUB_AMOUNT_CENTS,
    Math.min(MAX_AMOUNT_CENTS, Math.round(initialAmountCents))
  );
  return {
    amountCents: safeAmount,
    stepCents: 1,
    lastTranslationY: initialTranslationY,
    lastDirection: 0,
    pendingPx: 0,
    smoothedSpeedPxPerSec: 0,
    hasVelocitySample: false,
  };
}

/**
 * 依据本帧纵向位移与速度推进微调会话：
 * - 向上滑（translationY 减小）增加金额，向下滑（translationY 增大）减少金额；
 * - 采用增量累积而非「总位移 × 当前步进」，速度由快转慢时金额绝对不会回跳；
 * - 方向反转时立即清空反向残留位移并重置速度平滑，确保反手精调即时跟手。
 */
export function advanceAmountScrubSession(
  session: AmountScrubSession,
  translationY: number,
  velocityY: number,
  pxPerStep: number = SCRUB_AMOUNT_PX_PER_STEP
): AmountScrubSession {
  const safePxPerStep = Math.max(1, pxPerStep);
  const deltaY = translationY - session.lastTranslationY;
  // 向上滑（deltaY < 0）对应正增量
  const gainPx = -deltaY;
  const currentDirection: -1 | 0 | 1 = gainPx > 0 ? 1 : gainPx < 0 ? -1 : 0;

  const reversed =
    currentDirection !== 0 &&
    session.lastDirection !== 0 &&
    currentDirection !== session.lastDirection;
  const rawSpeed = Number.isFinite(velocityY) ? Math.abs(velocityY) : 0;

  const smoothedSpeed =
    !session.hasVelocitySample || reversed
      ? rawSpeed
      : session.smoothedSpeedPxPerSec * (1 - SPEED_EMA_ALPHA) + rawSpeed * SPEED_EMA_ALPHA;

  const nextStepCents = resolveAmountScrubStepBySpeed(
    smoothedSpeed,
    reversed || !session.hasVelocitySample ? undefined : session.stepCents
  );

  const basePending = reversed ? 0 : session.pendingPx;
  const accumulatedPx = basePending + gainPx;
  const deltaSteps = Math.trunc(accumulatedPx / safePxPerStep);

  let nextAmount = session.amountCents;
  let remainingPx = accumulatedPx - deltaSteps * safePxPerStep;

  if (deltaSteps !== 0) {
    nextAmount = stepAmountCentsOnGrid(session.amountCents, nextStepCents, deltaSteps);
    // 已触达上下边界时清空剩余位移，避免边界堆积导致反手拖动延迟
    if (
      (deltaSteps > 0 && nextAmount >= MAX_AMOUNT_CENTS) ||
      (deltaSteps < 0 && nextAmount <= MIN_SCRUB_AMOUNT_CENTS)
    ) {
      remainingPx = 0;
    }
  }

  return {
    amountCents: nextAmount,
    stepCents: nextStepCents,
    lastTranslationY: translationY,
    lastDirection: currentDirection !== 0 ? currentDirection : session.lastDirection,
    pendingPx: remainingPx,
    smoothedSpeedPxPerSec: smoothedSpeed,
    hasVelocitySample: true,
  };
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
