/**
 * 约束简报（Workflow B / C）：
 * - 信息层级：主（分类名/转账方向 + 右对齐带符号金额 16px/600）、次（账户、备注与已退/实付状态 12px）、弱（左滑带出的操作按钮：退款 / 修改 / 删除）
 * - 语义双重编码：颜色 + 正负号前缀（-¥ / +¥ / 转账）+ 退款显式文字标签
 * - iOS 原生左滑手势复现：静息态操作区完全收在右侧屏外；左滑时所有操作按钮与记录行联动自右向左平推展开，按 iOS 抽屉比例匀速分摊可视宽度，越界带阻尼橡皮筋拉伸并按松手速度弹性回弹；纵向滑动交还 ScrollView
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Pressable, StyleSheet, Text, View } from 'react-native';
import { GestureDetector, usePanGesture } from 'react-native-gesture-handler';
import { formatCentsToYuan, formatTransactionAmount } from '../../../shared/money/money';
import { AppIcon } from '../../../shared/ui/AppIcon';
import { useTheme } from '../../../theme/theme-context';
import type { TransactionListItem } from '../types';

const ACTION_BUTTON_WIDTH = 72;
const MAX_OVERSCROLL = 44;

interface SwipeActionItem {
  key: 'refund' | 'edit' | 'delete';
  label: string;
  icon: string;
  bg: string;
  fg: string;
  onPress: () => void;
}

interface TransactionRowProps {
  item: TransactionListItem;
  onPress: (item: TransactionListItem) => void;
  showDivider?: boolean;
  /** 若在单账户详情页展示，可标明相对该账户的转入/转出语义 */
  perspectiveAccountId?: string;
  /** 左滑二级菜单回调（提供任意一项即启用左滑展开） */
  onEdit?: (item: TransactionListItem) => void;
  onDelete?: (item: TransactionListItem) => void;
  onRefund?: (item: TransactionListItem) => void;
  /** 受控展开状态，保证同列表最多展开一行 */
  isSwipeOpen?: boolean;
  onSwipeOpen?: (id: string) => void;
  onSwipeClose?: (id: string) => void;
}

export function TransactionRow({
  item,
  onPress,
  showDivider = false,
  perspectiveAccountId,
  onEdit,
  onDelete,
  onRefund,
  isSwipeOpen = false,
  onSwipeOpen,
  onSwipeClose,
}: TransactionRowProps): React.JSX.Element {
  const { theme } = useTheme();

  const isTransfer = item.type === 'transfer';
  const isRefund = item.type === 'refund';
  const hasRefund = item.type === 'expense' && item.refundedCents > 0;
  const isFullyRefunded = hasRefund && item.refundedCents >= item.amountCents;
  const isExactFullRefund = hasRefund && item.refundedCents === item.amountCents;
  const canRefund = item.type === 'expense' && Boolean(onRefund);

  const actions = useMemo<SwipeActionItem[]>(() => {
    const list: SwipeActionItem[] = [];
    if (canRefund && onRefund) {
      list.push({
        key: 'refund',
        label: '退款',
        icon: 'return-down-back-outline',
        bg: theme.colors.warningSubtle,
        fg: theme.colors.warningTextOnSubtle,
        onPress: () => onRefund(item),
      });
    }
    if (onEdit) {
      list.push({
        key: 'edit',
        label: '修改',
        icon: 'create-outline',
        bg: theme.colors.actionSubtle,
        fg: theme.colors.actionTextOnSubtle,
        onPress: () => onEdit(item),
      });
    }
    if (onDelete) {
      list.push({
        key: 'delete',
        label: '删除',
        icon: 'trash-outline',
        bg: theme.colors.expense,
        fg: theme.colors.onAction,
        onPress: () => onDelete(item),
      });
    }
    return list;
  }, [canRefund, item, onDelete, onEdit, onRefund, theme.colors]);

  const swipeEnabled = actions.length > 0;
  const totalActionsWidth = actions.length * ACTION_BUTTON_WIDTH;
  const safeActionsWidth = Math.max(1, totalActionsWidth);

  const [translateX] = useState(() => new Animated.Value(0));
  const offsetRef = useRef(0);
  const didSwipeRef = useRef(false);
  const actionsWidthRef = useRef(totalActionsWidth);

  useEffect(() => {
    actionsWidthRef.current = totalActionsWidth;
  }, [totalActionsWidth]);

  const snapTo = useCallback(
    (target: number, notify = true, velocityPxPerSec = 0) => {
      offsetRef.current = target;
      const clampedVelocity = Math.max(-2.5, Math.min(2.5, velocityPxPerSec / 1000));
      Animated.spring(translateX, {
        toValue: target,
        useNativeDriver: true,
        stiffness: 280,
        damping: 30,
        mass: 0.9,
        velocity: clampedVelocity,
        overshootClamping: false,
      }).start();
      if (!notify) {
        return;
      }
      if (target < 0) {
        onSwipeOpen?.(item.id);
      } else {
        onSwipeClose?.(item.id);
      }
    },
    [item.id, onSwipeClose, onSwipeOpen, translateX]
  );

  useEffect(() => {
    if (!isSwipeOpen && offsetRef.current !== 0) {
      snapTo(0, false);
    }
  }, [isSwipeOpen, snapTo]);

  const panGesture = usePanGesture({
    enabled: swipeEnabled,
    disableReanimated: true,
    runOnJS: true,
    // 未展开时仅允许左滑激活（10px 先于外层切页的 14px），展开时允许右滑收起；纵向容差 20px 与外层翻页协调
    activeOffsetX: isSwipeOpen ? [-10, 10] : [-10, 9999],
    failOffsetY: [-20, 20],
    onActivate: () => {
      didSwipeRef.current = true;
    },
    onUpdate: (event) => {
      const width = actionsWidthRef.current;
      const raw = offsetRef.current + event.translationX;
      let next: number;
      if (raw >= 0) {
        next = 0;
      } else if (raw < -width) {
        // 超过按钮总宽时施加 iOS 阻尼橡皮筋拉伸，松手后弹性回位
        const extra = -width - raw;
        next = -width - Math.min(MAX_OVERSCROLL, extra * 0.28);
      } else {
        next = raw;
      }
      translateX.setValue(next);
    },
    onDeactivate: (event) => {
      const width = actionsWidthRef.current;
      const projected = offsetRef.current + event.translationX + event.velocityX * 0.14;
      const shouldOpen = width > 0 && projected < -width * 0.38;
      snapTo(shouldOpen ? -width : 0, true, event.velocityX);
      setTimeout(() => {
        didSwipeRef.current = false;
      }, 60);
    },
  });

  const categoryTitle = item.categoryParentName
    ? `${item.categoryParentName} · ${item.categoryName ?? ''}`
    : (item.categoryName ?? '未分类');

  const title = isTransfer
    ? `${item.accountName} → ${item.toAccountName ?? '未知账户'}`
    : isRefund
      ? `退款 · ${item.categoryName ?? '支出'}`
      : categoryTitle;

  const subtitleParts: string[] = [];
  if (isTransfer) {
    if (perspectiveAccountId) {
      subtitleParts.push(item.accountId === perspectiveAccountId ? '转出' : '转入');
    } else {
      subtitleParts.push('账户转账');
    }
  } else {
    subtitleParts.push(item.accountName);
  }
  if (item.note) {
    subtitleParts.push(item.note);
  }

  let amountColor = theme.colors.expense;
  let amountText = formatTransactionAmount(item.type, item.amountCents);
  let badgeBg = theme.colors.expenseSubtle;
  let badgeIconColor = theme.colors.expenseTextOnSubtle;
  let iconName = item.categoryIcon ?? 'pricetag-outline';

  if (item.type === 'income') {
    amountColor = theme.colors.income;
    badgeBg = theme.colors.incomeSubtle;
    badgeIconColor = theme.colors.incomeTextOnSubtle;
  } else if (isRefund) {
    amountColor = theme.colors.income;
    badgeBg = theme.colors.warningSubtle;
    badgeIconColor = theme.colors.warningTextOnSubtle;
    iconName = 'return-down-back-outline';
  } else if (isTransfer) {
    amountColor = theme.colors.transfer;
    badgeBg = theme.colors.transferSubtle;
    badgeIconColor = theme.colors.transferTextOnSubtle;
    iconName = 'swap-horizontal-outline';
    if (perspectiveAccountId) {
      const isOutgoing = item.accountId === perspectiveAccountId;
      amountText = formatTransactionAmount(isOutgoing ? 'expense' : 'income', item.amountCents);
    }
  }

  const handleRowPress = () => {
    if (didSwipeRef.current) {
      return;
    }
    if (isSwipeOpen || offsetRef.current < -4) {
      snapTo(0, true);
      return;
    }
    onPress(item);
  };

  const rowBody = (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${title}，${amountText}${hasRefund ? `，已退 ${formatCentsToYuan(item.refundedCents)}` : ''}${item.note ? `，备注 ${item.note}` : ''}`}
      onPress={handleRowPress}
      style={({ pressed }) => [
        styles.row,
        {
          backgroundColor: theme.colors.surfaceRaised,
          paddingHorizontal: theme.spacing.lg,
          paddingVertical: theme.spacing.md,
          borderBottomColor: theme.colors.border,
          borderBottomWidth: showDivider ? theme.borderWidth.hairline : 0,
        },
        pressed && !isSwipeOpen && { opacity: theme.opacity.pressed },
      ]}
    >
      <View
        style={[
          styles.iconBadge,
          {
            backgroundColor: badgeBg,
            borderRadius: theme.radius.full,
          },
        ]}
      >
        <AppIcon name={iconName} size={20} color={badgeIconColor} />
      </View>

      <View style={styles.content}>
        <Text
          numberOfLines={1}
          style={{
            color: theme.colors.text,
            fontSize: theme.fontSize.base,
            fontWeight: theme.fontWeight.semibold,
          }}
        >
          {title}
        </Text>
        <Text
          numberOfLines={1}
          style={{
            color: theme.colors.textMuted,
            fontSize: theme.fontSize.xs,
            marginTop: theme.spacing.xs,
          }}
        >
          {subtitleParts.join(' · ')}
        </Text>
      </View>

      <View style={styles.amountCol}>
        <Text
          style={[
            styles.amount,
            {
              color: isFullyRefunded ? theme.colors.textMuted : amountColor,
              fontSize: theme.fontSize.base,
              fontWeight: theme.fontWeight.semibold,
              textDecorationLine: isFullyRefunded ? 'line-through' : 'none',
            },
          ]}
        >
          {amountText}
        </Text>
        {hasRefund ? (
          <Text
            style={[
              styles.tabular,
              {
                color: theme.colors.warningTextOnSubtle,
                fontSize: theme.fontSize.xs,
                marginTop: 2,
              },
            ]}
          >
            {isExactFullRefund ? '已全额退款' : `已退 ${formatCentsToYuan(item.refundedCents)}`}
          </Text>
        ) : null}
      </View>
    </Pressable>
  );

  if (!swipeEnabled) {
    return rowBody;
  }

  const labelOpacity = translateX.interpolate({
    inputRange: [-safeActionsWidth * 0.55, -safeActionsWidth * 0.12, 0],
    outputRange: [1, 0.55, 0],
    extrapolate: 'clamp',
  });

  return (
    <GestureDetector gesture={panGesture}>
      <View style={styles.swipeContainer}>
        {/* 记录行本体随手势横向平推 */}
        <Animated.View style={{ transform: [{ translateX }] }}>{rowBody}</Animated.View>

        {/* iOS 风格联动滑出操作区：各按钮初始收在右边缘外，左滑时自右向左等比跟手拉出，超拉时等比延展无裁切缝隙 */}
        <View
          pointerEvents="box-none"
          style={[styles.actionsViewport, { width: totalActionsWidth + MAX_OVERSCROLL }]}
        >
          {actions.map((action, index) => {
            // 按按钮序号计算 iOS 手风琴比例：越靠左按钮行程越长，紧贴记录行右缘滑出
            const travelRatio = (actions.length - index) / actions.length;
            const buttonTranslateX = translateX.interpolate({
              inputRange: [-safeActionsWidth - MAX_OVERSCROLL, -safeActionsWidth, 0],
              outputRange: [
                -travelRatio * MAX_OVERSCROLL,
                0,
                travelRatio * safeActionsWidth,
              ],
              extrapolateRight: 'clamp',
            });

            return (
              <Animated.View
                key={action.key}
                pointerEvents={isSwipeOpen ? 'auto' : 'none'}
                style={[
                  styles.actionSlot,
                  {
                    left: MAX_OVERSCROLL + index * ACTION_BUTTON_WIDTH,
                    zIndex: index + 1,
                    transform: [{ translateX: buttonTranslateX }],
                  },
                ]}
              >
                {/* 右侧延伸色块在橡皮筋超拉时无缝补齐背景，避免按钮间或右缘出现缝隙 */}
                <View
                  pointerEvents="none"
                  style={[
                    styles.actionFillExtend,
                    {
                      backgroundColor: action.bg,
                      width: ACTION_BUTTON_WIDTH + MAX_OVERSCROLL,
                    },
                  ]}
                />

                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`${action.label} ${title}`}
                  onPress={() => {
                    snapTo(0, true);
                    action.onPress();
                  }}
                  style={({ pressed }) => [
                    styles.actionBtn,
                    pressed && { opacity: theme.opacity.pressed },
                  ]}
                >
                  <Animated.View style={[styles.actionInner, { opacity: labelOpacity }]}>
                    <AppIcon name={action.icon} size={18} color={action.fg} />
                    <Text
                      style={{
                        color: action.fg,
                        fontSize: theme.fontSize.xs,
                        fontWeight: theme.fontWeight.semibold,
                        marginTop: 3,
                      }}
                    >
                      {action.label}
                    </Text>
                  </Animated.View>
                </Pressable>
              </Animated.View>
            );
          })}
        </View>
      </View>
    </GestureDetector>
  );
}

const styles = StyleSheet.create({
  swipeContainer: {
    position: 'relative',
    overflow: 'hidden',
  },
  actionsViewport: {
    position: 'absolute',
    right: 0,
    top: 0,
    bottom: 0,
    overflow: 'hidden',
  },
  actionSlot: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: ACTION_BUTTON_WIDTH,
  },
  actionFillExtend: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
  },
  actionBtn: {
    width: ACTION_BUTTON_WIDTH,
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionInner: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  row: {
    minHeight: 62,
    flexDirection: 'row',
    alignItems: 'center',
  },
  iconBadge: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  content: {
    flex: 1,
    marginRight: 12,
  },
  amountCol: {
    alignItems: 'flex-end',
  },
  amount: {
    textAlign: 'right',
    fontVariant: ['tabular-nums'],
  },
  tabular: {
    fontVariant: ['tabular-nums'],
  },
});
