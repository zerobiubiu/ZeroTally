/**
 * 约束简报（Workflow B / C）：
 * - 长按底栏居中「+ 记一笔」绽放的扇形快捷选择浮层（纯选择，不提供编辑/撤回等其他功能）
 * - 视觉呈现：以「+」圆心为原点，最多 5 项快捷记账条目从左至右对称呈弧形弹簧绽放；手指滑入某项即放大高亮 + 顶弧清晰预览选中项名称/金额/账户，松手即刻记账，滑回原点松手取消
 * - 触摸透传：全层 pointerEvents="none"，触摸跟踪全程由底栏「+」按钮的 PanGesture 托管，零手势抢占
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Easing, StyleSheet, Text, View } from 'react-native';
import { formatCentsToYuan } from '../../../shared/money/money';
import { AppIcon } from '../../../shared/ui/AppIcon';
import { useTheme } from '../../../theme/theme-context';
import {
  computeRadialSlotPositions,
  MAX_RADIAL_QUICK_ITEMS,
  RADIAL_MENU_RADIUS,
} from '../radial-menu-rules';
import type { QuickRecordButtonItem } from '../types';

const BUBBLE_SIZE = 56;
const HALF_BUBBLE = BUBBLE_SIZE / 2;

export interface QuickRadialOverlayProps {
  visible: boolean;
  items: readonly QuickRecordButtonItem[];
  activeIndex: number | null;
  /** 扇形圆心距离屏幕底部的高度（精确重合底栏居中「+」按钮中心） */
  originBottom: number;
}

export function QuickRadialOverlay({
  visible,
  items,
  activeIndex,
  originBottom,
}: QuickRadialOverlayProps): React.JSX.Element | null {
  const { theme } = useTheme();
  const displayItems = useMemo(() => items.slice(0, MAX_RADIAL_QUICK_ITEMS), [items]);
  const slotPositions = useMemo(
    () => computeRadialSlotPositions(displayItems.length, RADIAL_MENU_RADIUS),
    [displayItems.length]
  );

  const [mounted, setMounted] = useState(visible);
  if (visible && !mounted) {
    setMounted(true);
  }

  const [openAnim] = useState(() => new Animated.Value(visible ? 1 : 0));
  const visibleRef = useRef(visible);

  useEffect(() => {
    visibleRef.current = visible;
  }, [visible]);

  useEffect(() => {
    if (!mounted) {
      return;
    }
    if (visible) {
      Animated.spring(openAnim, {
        toValue: 1,
        useNativeDriver: true,
        stiffness: 360,
        damping: 26,
        mass: 0.75,
      }).start();
    } else {
      Animated.timing(openAnim, {
        toValue: 0,
        duration: 150,
        easing: Easing.in(Easing.cubic),
        useNativeDriver: true,
      }).start(({ finished }) => {
        if (finished && !visibleRef.current) {
          setMounted(false);
        }
      });
    }
  }, [mounted, openAnim, visible]);

  if (!mounted) {
    return null;
  }

  const activeItem =
    activeIndex !== null && activeIndex >= 0 && activeIndex < displayItems.length
      ? displayItems[activeIndex]!
      : null;

  const scrimOpacity = openAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 1],
    extrapolate: 'clamp',
  });

  const hintTranslateY = openAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [14, 0],
    extrapolate: 'clamp',
  });

  return (
    <View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.root]}>
      {/* 柔和暗幕衬托扇形选项 */}
      <Animated.View
        style={[
          StyleSheet.absoluteFill,
          { backgroundColor: theme.colors.scrim, opacity: scrimOpacity },
        ]}
      />

      {/* 扇形圆心坐标系（严格重合居中「+」按钮圆心） */}
      <View style={[styles.originAnchor, { bottom: originBottom }]}>
        {/* 扇弧正上方实时预览提示胶囊 */}
        <Animated.View
          style={[
            styles.previewPill,
            theme.elevation.floating,
            {
              bottom: RADIAL_MENU_RADIUS + 62,
              backgroundColor: activeItem ? theme.colors.surfaceRaised : theme.colors.surfaceRaised,
              borderColor: activeItem ? theme.colors.action : theme.colors.border,
              borderWidth: activeItem ? theme.borderWidth.focus : theme.borderWidth.hairline,
              borderRadius: theme.radius.full,
              opacity: openAnim,
              transform: [{ translateY: hintTranslateY }],
            },
          ]}
        >
          {activeItem ? (
            <View style={styles.previewContent}>
              <View
                style={[
                  styles.previewIconDot,
                  {
                    backgroundColor: `${activeItem.categoryColor}22`,
                    borderRadius: theme.radius.full,
                  },
                ]}
              >
                <AppIcon
                  name={activeItem.categoryIcon}
                  size={15}
                  color={activeItem.categoryColor}
                />
              </View>
              <Text
                numberOfLines={1}
                style={{
                  color: theme.colors.text,
                  fontSize: theme.fontSize.sm,
                  fontWeight: theme.fontWeight.semibold,
                }}
              >
                {activeItem.name}
              </Text>
              <Text
                style={[
                  styles.tabular,
                  {
                    color:
                      activeItem.type === 'expense' ? theme.colors.expense : theme.colors.income,
                    fontSize: theme.fontSize.sm,
                    fontWeight: theme.fontWeight.semibold,
                  },
                ]}
              >
                {activeItem.type === 'expense' ? '-' : '+'}
                {formatCentsToYuan(activeItem.amountCents)}
              </Text>
              <Text
                numberOfLines={1}
                style={{
                  color: theme.colors.textMuted,
                  fontSize: theme.fontSize.xs,
                }}
              >
                · {activeItem.accountName}
              </Text>
            </View>
          ) : (
            <Text
              style={{
                color: theme.colors.textSecondary,
                fontSize: theme.fontSize.xs,
                fontWeight: theme.fontWeight.semibold,
              }}
            >
              {displayItems.length > 0
                ? '滑向选项松手即入账 · 回原点取消'
                : '暂无快捷项，请上滑底栏添加'}
            </Text>
          )}
        </Animated.View>

        {/* 原点取消圈视觉锚点 */}
        <Animated.View
          style={[
            styles.originRing,
            {
              borderColor: activeItem ? theme.colors.borderStrong : theme.colors.onAction,
              borderRadius: theme.radius.full,
              opacity: openAnim.interpolate({
                inputRange: [0, 1],
                outputRange: [0, activeItem ? 0.35 : 0.72],
              }),
              transform: [{ scale: openAnim }],
            },
          ]}
        />

        {/* 从左至右对称绽放的扇形快捷选项气泡 */}
        {displayItems.map((item, idx) => {
          const slot = slotPositions[idx];
          if (!slot) {
            return null;
          }
          const isSelected = activeIndex === idx;
          const translateX = openAnim.interpolate({
            inputRange: [0, 1],
            outputRange: [0, slot.x],
          });
          const translateY = openAnim.interpolate({
            inputRange: [0, 1],
            outputRange: [0, slot.y],
          });
          const scale = openAnim.interpolate({
            inputRange: [0, 1],
            outputRange: [0.35, isSelected ? 1.18 : 1],
          });

          return (
            <Animated.View
              key={item.id}
              style={[
                styles.slotContainer,
                {
                  zIndex: isSelected ? 10 : 2,
                  opacity: openAnim,
                  transform: [{ translateX }, { translateY }, { scale }],
                },
              ]}
            >
              <View
                style={[
                  styles.bubble,
                  theme.elevation.floating,
                  {
                    backgroundColor: isSelected
                      ? theme.colors.action
                      : theme.colors.surfaceRaised,
                    borderColor: isSelected ? theme.colors.onAction : theme.colors.border,
                    borderWidth: isSelected ? 2 : theme.borderWidth.hairline,
                    borderRadius: theme.radius.full,
                  },
                ]}
              >
                <AppIcon
                  name={item.categoryIcon}
                  size={24}
                  color={isSelected ? theme.colors.onAction : item.categoryColor}
                />
              </View>

              <View
                style={[
                  styles.slotLabelPill,
                  {
                    backgroundColor: isSelected
                      ? theme.colors.action
                      : theme.colors.surfaceRaised,
                    borderRadius: theme.radius.full,
                  },
                ]}
              >
                <Text
                  numberOfLines={1}
                  style={{
                    color: isSelected ? theme.colors.onAction : theme.colors.text,
                    fontSize: 10,
                    fontWeight: theme.fontWeight.semibold,
                  }}
                >
                  {item.name}
                </Text>
              </View>
            </Animated.View>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    zIndex: 108,
    elevation: 20,
  },
  originAnchor: {
    position: 'absolute',
    left: '50%',
    width: 0,
    height: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  originRing: {
    position: 'absolute',
    width: 72,
    height: 72,
    borderWidth: 2,
    borderStyle: 'dashed',
  },
  previewPill: {
    position: 'absolute',
    paddingHorizontal: 14,
    paddingVertical: 8,
    minWidth: 160,
    maxWidth: 320,
    alignItems: 'center',
    justifyContent: 'center',
  },
  previewContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  previewIconDot: {
    width: 22,
    height: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  slotContainer: {
    position: 'absolute',
    width: 76,
    marginLeft: -38,
    marginTop: -HALF_BUBBLE,
    alignItems: 'center',
  },
  bubble: {
    width: BUBBLE_SIZE,
    height: BUBBLE_SIZE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  slotLabelPill: {
    marginTop: 5,
    paddingHorizontal: 7,
    paddingVertical: 2,
    maxWidth: 74,
  },
  tabular: {
    fontVariant: ['tabular-nums'],
  },
});
