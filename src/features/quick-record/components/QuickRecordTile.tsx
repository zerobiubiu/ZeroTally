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
  computeScrubbedAccountIndex,
  computeScrubbedAmountCents,
  resolveQuickCardScrubAxis,
  type QuickScrubAxis,
} from '../scrub-rules';
import type { QuickRecordButtonItem } from '../types';

export const QUICK_UNDO_DURATION_MS = 3000;

export interface ActiveQuickScrubState {
  item: QuickRecordButtonItem;
  axis: QuickScrubAxis;
  amountCents: number;
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
  const [remainingSec, setRemainingSec] = useState(3);

  const itemRef = useRef(item);
  const accountsRef = useRef(accounts);
  const onOpenEditRef = useRef(onOpenEdit);
  const onScrubStartRef = useRef(onScrubStart);
  const onScrubChangeRef = useRef(onScrubChange);
  const onScrubEndRef = useRef(onScrubEnd);

  const scrubbingRef = useRef(false);
  const suppressTapRef = useRef(false);
  const axisRef = useRef<QuickScrubAxis>('none');
  const baseAmountRef = useRef(item.amountCents);
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

  // 撤销态 3 秒倒计时秒数跳动（仅在撤销态运行）
  useEffect(() => {
    if (!undoState) {
      return;
    }
    const tick = () => {
      const elapsed = Date.now() - undoState.startedAt;
      const left = Math.max(1, Math.ceil((QUICK_UNDO_DURATION_MS - elapsed) / 1000));
      setRemainingSec(left);
    };
    const timer = setInterval(tick, 200);
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

  const finishScrub = () => {
    if (!scrubbingRef.current) {
      return;
    }
    scrubbingRef.current = false;
    springScale(1);

    const curItem = itemRef.current;
    const accs = accountsRef.current;
    const finalAxis = axisRef.current;
    const finalAmount = currentAmountRef.current;
    const finalAcc = accs[currentAccountIdxRef.current];
    const finalAccountId = finalAcc?.id ?? curItem.accountId;

    onScrubEndRef.current(curItem, {
      axis: finalAxis,
      amountCents: finalAmount,
      accountId: finalAccountId,
    });

    if (finalAxis === 'none') {
      onOpenEditRef.current(curItem);
    }

    setTimeout(() => {
      suppressTapRef.current = false;
    }, 80);
  };

  const scrubPanGesture = usePanGesture({
    enabled: !disabled && !isUndoMode,
    disableReanimated: true,
    runOnJS: true,
    activateAfterLongPress: 260,
    minDistance: 0,
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
      baseAmountRef.current = curItem.amountCents;
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
        const nextAmount = computeScrubbedAmountCents(baseAmountRef.current, event.translationY);
        if (nextAmount !== currentAmountRef.current) {
          currentAmountRef.current = nextAmount;
          hapticSelection();
        }
        const acc = accs[currentAccountIdxRef.current];
        onScrubChangeRef.current({
          item: curItem,
          axis: 'amount',
          amountCents: currentAmountRef.current,
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
          accountId: acc?.id ?? curItem.accountId,
          accountName: acc?.name ?? curItem.accountName,
        });
      }
    },
    onDeactivate: () => {
      finishScrub();
    },
    onFinalize: () => {
      finishScrub();
    },
  });

  // ========== 原地变身「3 秒圆环倒计时撤销卡片」==========
  if (undoState) {
    const signedUndoAmount = `${undoState.type === 'expense' ? '-' : '+'}${formatCentsToYuan(undoState.amountCents)}`;
    return (
      <View style={styles.tileWrap}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`撤销刚才记入的 ${item.name} ${signedUndoAmount}，剩余 ${remainingSec} 秒`}
          disabled={busy}
          onPress={() => onUndoTap(item, undoState.txId)}
          style={({ pressed }) => [
            styles.quickTile,
            {
              backgroundColor: theme.colors.warningSubtle,
              borderColor: theme.colors.warning,
              borderWidth: theme.borderWidth.focus,
              borderRadius: theme.radius.lg,
              opacity: busy ? theme.opacity.disabled : 1,
            },
            pressed && { transform: [{ scale: 0.95 }], opacity: 0.88 },
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

          <Text
            numberOfLines={1}
            style={{
              color: theme.colors.warningTextOnSubtle,
              fontSize: theme.fontSize.xs,
              fontWeight: theme.fontWeight.semibold,
              marginTop: 6,
            }}
          >
            点击撤销 ({remainingSec}s)
          </Text>
          <Text
            numberOfLines={1}
            style={[
              styles.tabular,
              {
                color: theme.colors.textSecondary,
                fontSize: 10,
                marginTop: 2,
              },
            ]}
          >
            {item.name} {signedUndoAmount}
          </Text>
        </Pressable>
      </View>
    );
  }

  // ========== 常规快捷卡片态（点击入账 + 长按上下调金额 / 左右切账户）==========
  const shownAmountCents =
    isScrubbingThis && scrubPreview ? scrubPreview.amountCents : item.amountCents;
  const shownAccountName =
    isScrubbingThis && scrubPreview ? scrubPreview.accountName : item.accountName;
  const amountColor = item.type === 'expense' ? theme.colors.expense : theme.colors.income;
  const signedAmount = `${item.type === 'expense' ? '-' : '+'}${formatCentsToYuan(shownAmountCents)}`;

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
              backgroundColor: isScrubbingThis ? theme.colors.surfaceRaised : theme.colors.surface,
              borderColor: isScrubbingThis ? theme.colors.action : theme.colors.border,
              borderWidth: isScrubbingThis
                ? theme.borderWidth.focus
                : theme.borderWidth.hairline,
              borderRadius: theme.radius.lg,
              opacity: busy ? theme.opacity.disabled : 1,
            },
            pressed && !isScrubbingThis && { transform: [{ scale: 0.96 }], opacity: 0.85 },
          ]}
        >
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
              <AppIcon name={item.categoryIcon} size={20} color={item.categoryColor} />
            )}
          </View>
          <Text
            numberOfLines={1}
            style={{
              color: theme.colors.text,
              fontSize: theme.fontSize.xs,
              fontWeight: theme.fontWeight.semibold,
              marginTop: 6,
            }}
          >
            {item.name}
          </Text>
          <Text
            numberOfLines={1}
            style={[
              styles.tabular,
              {
                color: amountColor,
                fontSize: theme.fontSize.xs,
                fontWeight: theme.fontWeight.semibold,
                marginTop: 2,
              },
            ]}
          >
            {signedAmount}
          </Text>
          <Text
            numberOfLines={1}
            style={{
              color:
                isScrubbingThis && scrubPreview?.axis === 'account'
                  ? theme.colors.action
                  : theme.colors.textMuted,
              fontSize: 10,
              fontWeight:
                isScrubbingThis && scrubPreview?.axis === 'account'
                  ? theme.fontWeight.semibold
                  : theme.fontWeight.regular,
              marginTop: 1,
            }}
          >
            {shownAccountName}
          </Text>
        </Pressable>
      </Animated.View>
    </GestureDetector>
  );
}

const styles = StyleSheet.create({
  tileWrap: {
    flex: 1,
  },
  quickTile: {
    flex: 1,
    minHeight: 100,
    paddingVertical: 10,
    paddingHorizontal: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tileIconCircle: {
    width: 38,
    height: 38,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabular: {
    fontVariant: ['tabular-nums'],
  },
});
