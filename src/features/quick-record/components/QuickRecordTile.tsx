/**
 * 约束简报（Workflow B / C）：
 * - 单张快捷卡片（五态零冲突闭环）：
 *   1. 轻点（<260ms）：一秒入账 + 轻震动，并原地变身为「3 秒圆环倒计时撤销卡片」；
 *   2. 撤销态 3 秒内再次轻点：立即撤回刚记入的账目 + 长震动提醒，卡片瞬间复原；倒计时归零自动复原；
 *   3. 常规态长按（260ms）触发震动浮起后上下滑动：按智能步进实时调节金额（每步刻度震动，松手落盘）；
 *   4. 常规态长按触发震动浮起后左右滑动：切换关联账户（每跨账户刻度震动，松手落盘）；
 *   5. 常规态长按不动直接松手：进入内嵌编辑器修改分类/名称或删除该卡片。
 */
import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Animated, Pressable, StyleSheet, Text, View } from 'react-native';
import { GestureDetector, usePanGesture } from 'react-native-gesture-handler';
import { hapticMedium, hapticSelection } from '../../../shared/haptics/haptics';
import { formatCentsToYuan } from '../../../shared/money/money';
import { AppIcon } from '../../../shared/ui/AppIcon';
import { CountdownRing } from '../../../shared/ui/CountdownRing';
import { useTheme } from '../../../theme/theme-context';
import type { Account } from '../../accounts/types';
import {
  advanceAmountScrubSession,
  computeScrubbedAccountIndex,
  createAmountScrubSession,
  resolveQuickCardScrubAxis,
  type AmountScrubSession,
  type AmountScrubStepCents,
  type QuickScrubAxis,
} from '../scrub-rules';
import type { QuickRecordButtonItem } from '../types';

export const QUICK_UNDO_DURATION_MS = 3000;
/** 快捷记账卡片与「添加快捷」虚线卡的统一高度（单一事实来源） */
export const QUICK_TILE_HEIGHT = 88;

export interface ActiveQuickScrubState {
  item: QuickRecordButtonItem;
  axis: QuickScrubAxis;
  amountCents: number;
  /** 当前速度档位对应的实时金额步进（分：1 / 5 / 10 / 50 / 100） */
  stepCents: AmountScrubStepCents;
  accountId: string;
  accountName: string;
}

export interface QuickCardUndoState {
  txId: string;
  startedAt: number;
  amountCents: number;
  type: 'expense' | 'income';
}

export interface QuickRecordTileProps {
  item: QuickRecordButtonItem;
  accounts: readonly Account[];
  busy: boolean;
  disabled: boolean;
  undoState: QuickCardUndoState | null;
  scrubPreview: ActiveQuickScrubState | null;
  onQuickTap: (item: QuickRecordButtonItem) => void;
  onUndoTap: (item: QuickRecordButtonItem, txId: string) => void;
  onOpenEdit: (item: QuickRecordButtonItem) => void;
  onScrubStart: (state: ActiveQuickScrubState) => void;
  onScrubChange: (state: ActiveQuickScrubState) => void;
  onScrubEnd: (
    item: QuickRecordButtonItem,
    result: { axis: QuickScrubAxis; amountCents: number; accountId: string }
  ) => void;
}

export function QuickRecordTile({
  item,
  accounts,
  busy,
  disabled,
  undoState,
  scrubPreview,
  onQuickTap,
  onUndoTap,
  onOpenEdit,
  onScrubStart,
  onScrubChange,
  onScrubEnd,
}: QuickRecordTileProps): React.JSX.Element {
  const { theme } = useTheme();
  const isScrubbingThis = scrubPreview?.item.id === item.id;
  const isUndoMode = undoState !== null;

  const [scale] = useState(() => new Animated.Value(1));
  const [countdownState, setCountdownState] = useState<{ txId: string; sec: number } | null>(null);
  const defaultUndoSec = Math.ceil(QUICK_UNDO_DURATION_MS / 1000);
  const remainingSec =
    undoState && countdownState?.txId === undoState.txId ? countdownState.sec : defaultUndoSec;

  const itemRef = useRef(item);
  const accountsRef = useRef(accounts);
  const onOpenEditRef = useRef(onOpenEdit);
  const onScrubStartRef = useRef(onScrubStart);
  const onScrubChangeRef = useRef(onScrubChange);
  const onScrubEndRef = useRef(onScrubEnd);

  const scrubbingRef = useRef(false);
  const suppressTapRef = useRef(false);
  const axisRef = useRef<QuickScrubAxis>('none');
  const amountSessionRef = useRef<AmountScrubSession>(createAmountScrubSession(item.amountCents));
  const currentAmountRef = useRef(item.amountCents);
  const baseAccountIdxRef = useRef(0);
  const currentAccountIdxRef = useRef(0);

  useEffect(() => {
    itemRef.current = item;
    accountsRef.current = accounts;
    onOpenEditRef.current = onOpenEdit;
    onScrubStartRef.current = onScrubStart;
    onScrubChangeRef.current = onScrubChange;
    onScrubEndRef.current = onScrubEnd;
  }, [accounts, item, onOpenEdit, onScrubChange, onScrubEnd, onScrubStart]);

  // 撤销态 3 秒倒计时秒数跳动（按 txId 绑定，再次点击必定从 3s 起步）
  useEffect(() => {
    if (!undoState) {
      return;
    }
    const { txId, startedAt } = undoState;
    const tick = () => {
      const elapsed = Date.now() - startedAt;
      const left = Math.max(1, Math.ceil((QUICK_UNDO_DURATION_MS - elapsed) / 1000));
      setCountdownState({ txId, sec: left });
    };
    const timer = setInterval(tick, 180);
    return () => {
      clearInterval(timer);
    };
  }, [undoState]);

  const springScale = (toValue: number) => {
    Animated.spring(scale, {
      toValue,
      useNativeDriver: true,
      stiffness: 360,
      damping: 26,
      mass: 0.75,
    }).start();
  };

  const finishScrub = (commit: boolean) => {
    if (!scrubbingRef.current) {
      return;
    }
    scrubbingRef.current = false;
    springScale(1);

    const curItem = itemRef.current;
    const accs = accountsRef.current;
    const finalAxis = commit ? axisRef.current : 'none';
    const finalAmount = currentAmountRef.current;
    const finalAcc = accs[currentAccountIdxRef.current];
    const finalAccountId = finalAcc?.id ?? curItem.accountId;

    onScrubEndRef.current(curItem, {
      axis: finalAxis,
      amountCents: finalAmount,
      accountId: finalAccountId,
    });

    if (commit && finalAxis === 'none') {
      onOpenEditRef.current(curItem);
    }

    setTimeout(() => {
      suppressTapRef.current = false;
    }, 80);
  };

  // 注意：minDistance 必须设为超大值（绝不能设 0），防止单击时因 1px 触控微抖在长按未满前误激活 Pan 覆盖单击记账
  const scrubPanGesture = usePanGesture({
    enabled: !disabled && !isUndoMode,
    disableReanimated: true,
    runOnJS: true,
    activateAfterLongPress: 280,
    minDistance: 99999,
    onActivate: () => {
      const curItem = itemRef.current;
      const accs = accountsRef.current;
      const startAccIdx = Math.max(
        0,
        accs.findIndex((a) => a.id === curItem.accountId)
      );
      scrubbingRef.current = true;
      suppressTapRef.current = true;
      axisRef.current = 'none';
      amountSessionRef.current = createAmountScrubSession(curItem.amountCents, 0);
      currentAmountRef.current = curItem.amountCents;
      baseAccountIdxRef.current = startAccIdx;
      currentAccountIdxRef.current = startAccIdx;

      hapticMedium();
      springScale(1.06);

      const startAcc = accs[startAccIdx];
      onScrubStartRef.current({
        item: curItem,
        axis: 'none',
        amountCents: curItem.amountCents,
        stepCents: amountSessionRef.current.stepCents,
        accountId: startAcc?.id ?? curItem.accountId,
        accountName: startAcc?.name ?? curItem.accountName,
      });
    },
    onUpdate: (event) => {
      if (!scrubbingRef.current) {
        return;
      }
      const curItem = itemRef.current;
      const accs = accountsRef.current;

      if (axisRef.current === 'none') {
        const detected = resolveQuickCardScrubAxis(event.translationX, event.translationY);
        if (detected === 'none') {
          return;
        }
        axisRef.current = detected;
        hapticSelection();
      }

      if (axisRef.current === 'amount') {
        const prevSession = amountSessionRef.current;
        const nextSession = advanceAmountScrubSession(
          prevSession,
          event.translationY,
          event.velocityY
        );
        amountSessionRef.current = nextSession;
        if (nextSession.amountCents !== currentAmountRef.current) {
          currentAmountRef.current = nextSession.amountCents;
          hapticSelection();
        }
        const acc = accs[currentAccountIdxRef.current];
        onScrubChangeRef.current({
          item: curItem,
          axis: 'amount',
          amountCents: nextSession.amountCents,
          stepCents: nextSession.stepCents,
          accountId: acc?.id ?? curItem.accountId,
          accountName: acc?.name ?? curItem.accountName,
        });
      } else if (axisRef.current === 'account') {
        const nextIdx = computeScrubbedAccountIndex(
          baseAccountIdxRef.current,
          accs.length,
          event.translationX
        );
        if (nextIdx !== currentAccountIdxRef.current) {
          currentAccountIdxRef.current = nextIdx;
          hapticSelection();
        }
        const acc = accs[currentAccountIdxRef.current];
        onScrubChangeRef.current({
          item: curItem,
          axis: 'account',
          amountCents: currentAmountRef.current,
          stepCents: amountSessionRef.current.stepCents,
          accountId: acc?.id ?? curItem.accountId,
          accountName: acc?.name ?? curItem.accountName,
        });
      }
    },
    onDeactivate: () => {
      finishScrub(true);
    },
    onFinalize: () => {
      finishScrub(false);
    },
  });

  const shownAmountCents =
    isScrubbingThis && scrubPreview ? scrubPreview.amountCents : item.amountCents;
  const shownAccountName =
    isScrubbingThis && scrubPreview ? scrubPreview.accountName : item.accountName;
  const amountColor = item.type === 'expense' ? theme.colors.expense : theme.colors.income;
  const signedAmount = `${item.type === 'expense' ? '-' : '+'}${formatCentsToYuan(shownAmountCents)}`;
  const signedUndoAmount = undoState
    ? `${undoState.type === 'expense' ? '-' : '+'}${formatCentsToYuan(undoState.amountCents)}`
    : '';

  // 始终复用同一 GestureDetector 外壳（撤销态时 enabled=false），避免点击切换撤销卡时销毁重建原生手势节点
  return (
    <GestureDetector gesture={scrubPanGesture}>
      <Animated.View
        style={[
          styles.tileWrap,
          {
            zIndex: isScrubbingThis ? 20 : 1,
            transform: [{ scale }],
          },
        ]}
      >
        {undoState ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`撤销刚才记入的 ${item.name} ${signedUndoAmount}，剩余 ${remainingSec} 秒`}
            disabled={busy}
            onPress={() => onUndoTap(item, undoState.txId)}
            style={({ pressed }) => [
              styles.undoTile,
              {
                backgroundColor: theme.colors.warningSubtle,
                borderColor: theme.colors.warning,
                borderWidth: theme.borderWidth.focus,
                borderRadius: theme.radius.lg,
                opacity: busy ? theme.opacity.disabled : 1,
              },
              pressed && { transform: [{ scale: 0.96 }], opacity: 0.88 },
            ]}
          >
            <CountdownRing
              key={undoState.txId}
              size={40}
              strokeWidth={3}
              durationMs={QUICK_UNDO_DURATION_MS}
              activeColor={theme.colors.warning}
              trackColor={theme.colors.border}
            >
              {busy ? (
                <ActivityIndicator size="small" color={theme.colors.warningTextOnSubtle} />
              ) : (
                <AppIcon name="arrow-undo" size={18} color={theme.colors.warningTextOnSubtle} />
              )}
            </CountdownRing>

            <View style={styles.undoTextCol}>
              <Text
                numberOfLines={1}
                style={[
                  styles.crispText,
                  {
                    color: theme.colors.warningTextOnSubtle,
                    fontSize: theme.fontSize.sm,
                    fontWeight: theme.fontWeight.semibold,
                  },
                ]}
              >
                点击撤销 ({remainingSec}s)
              </Text>
              <Text
                numberOfLines={1}
                style={[
                  styles.tabular,
                  styles.crispText,
                  {
                    color: theme.colors.textSecondary,
                    fontSize: 11,
                  },
                ]}
              >
                {item.name} {signedUndoAmount}
              </Text>
            </View>
          </Pressable>
        ) : (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`快捷记账 ${item.name} ${signedAmount}，账户 ${shownAccountName}`}
            accessibilityHint="点击立即入账；长按上下滑调金额，左右滑切账户，长按不动松手编辑"
            disabled={disabled}
            onPress={() => {
              if (suppressTapRef.current || scrubbingRef.current) {
                return;
              }
              onQuickTap(item);
            }}
            style={({ pressed }) => [
              styles.quickTile,
              isScrubbingThis && theme.elevation.card,
              {
                backgroundColor: isScrubbingThis
                  ? theme.colors.surfaceRaised
                  : theme.colors.surface,
                borderColor: isScrubbingThis ? theme.colors.action : theme.colors.border,
                borderWidth: isScrubbingThis
                  ? theme.borderWidth.focus
                  : theme.borderWidth.hairline,
                borderRadius: theme.radius.lg,
                opacity: busy ? theme.opacity.disabled : 1,
              },
              pressed && !isScrubbingThis && { transform: [{ scale: 0.97 }], opacity: 0.86 },
            ]}
          >
            {/* 顶部身份行：圆形分类徽章 + 卡片名称 */}
            <View style={styles.tileHeaderRow}>
              <View
                style={[
                  styles.tileIconCircle,
                  {
                    backgroundColor: `${item.categoryColor}20`,
                    borderRadius: theme.radius.full,
                  },
                ]}
              >
                {busy ? (
                  <ActivityIndicator size="small" color={item.categoryColor} />
                ) : (
                  <AppIcon name={item.categoryIcon} size={18} color={item.categoryColor} />
                )}
              </View>
              <Text
                numberOfLines={1}
                style={[
                  styles.tileTitle,
                  styles.crispText,
                  {
                    color: theme.colors.text,
                    fontSize: theme.fontSize.sm,
                    fontWeight: theme.fontWeight.semibold,
                  },
                ]}
              >
                {item.name}
              </Text>
            </View>

            {/* 底部数字与账户行：左侧突出金额，右侧弱化动账账户 */}
            <View style={styles.tileFooterRow}>
              <Text
                numberOfLines={1}
                style={[
                  styles.tabular,
                  styles.tileAmount,
                  styles.crispText,
                  {
                    color: amountColor,
                    fontSize: theme.fontSize.base,
                    fontWeight: theme.fontWeight.semibold,
                  },
                ]}
              >
                {signedAmount}
              </Text>
              <Text
                numberOfLines={1}
                style={[
                  styles.tileAccount,
                  styles.crispText,
                  {
                    color:
                      isScrubbingThis && scrubPreview?.axis === 'account'
                        ? theme.colors.action
                        : theme.colors.textMuted,
                    fontSize: 11,
                    fontWeight:
                      isScrubbingThis && scrubPreview?.axis === 'account'
                        ? theme.fontWeight.semibold
                        : theme.fontWeight.regular,
                  },
                ]}
              >
                {shownAccountName}
              </Text>
            </View>
          </Pressable>
        )}
      </Animated.View>
    </GestureDetector>
  );
}

const styles = StyleSheet.create({
  tileWrap: {
    width: '100%',
    height: '100%',
  },
  quickTile: {
    width: '100%',
    height: '100%',
    paddingHorizontal: 13,
    paddingVertical: 11,
    justifyContent: 'space-between',
  },
  tileHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
  },
  tileIconCircle: {
    width: 34,
    height: 34,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  tileTitle: {
    flex: 1,
  },
  tileFooterRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: 6,
  },
  tileAmount: {
    flexShrink: 0,
  },
  tileAccount: {
    flexShrink: 1,
    textAlign: 'right',
  },
  undoTile: {
    width: '100%',
    height: '100%',
    paddingHorizontal: 13,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
  },
  undoTextCol: {
    flex: 1,
    gap: 3,
  },
  crispText: {
    includeFontPadding: false,
  },
  tabular: {
    fontVariant: ['tabular-nums'],
  },
});
