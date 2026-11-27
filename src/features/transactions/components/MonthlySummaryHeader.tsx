/**
 * 约束简报（Workflow B / C）：
 * - 信息层级：主（当期支出 30px/600）、次（周期标题点击弹出选择器 + 左右翻期/整行左右滑动切期 + 收入/结余 18px/600）、弱（标签 heroSubtext 12px/400）
 * - 交互意图：顶部日期行支持左右滑动切换上/下一月或上/下一年（等效左右箭头并带跟手位移过渡与马达震动），activeOffsetX 8px 优先接管防与外层翻页/抽屉冲突
 * - 彩色底禁止灰字：标签统一使用同色相浅阶 heroSubtext；数字使用 tabular-nums 对齐
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Animated, Pressable, StyleSheet, Text, View } from 'react-native';
import { GestureDetector, usePanGesture } from 'react-native-gesture-handler';
import { hapticLight, hapticSelection } from '../../../shared/haptics/haptics';
import { formatCentsToYuan } from '../../../shared/money/money';
import { AppIcon } from '../../../shared/ui/AppIcon';
import { useTheme } from '../../../theme/theme-context';
import { maskSensitiveAmount } from '../../security/rules';
import { useSecurity } from '../../security/security-context';
import type { LedgerPeriodMode, MonthlySummary } from '../types';

interface MonthlySummaryHeaderProps {
  mode: LedgerPeriodMode;
  periodLabel: string;
  summary: MonthlySummary;
  onPrevPeriod: () => void;
  onNextPeriod: () => void;
  onPressPeriod: () => void;
  onPressAnalytics?: () => void;
}

const MAX_SWIPE_PREVIEW = 48;
const SWIPE_TRIGGER_THRESHOLD = 30;

export function MonthlySummaryHeader({
  mode,
  periodLabel,
  summary,
  onPrevPeriod,
  onNextPeriod,
  onPressPeriod,
  onPressAnalytics,
}: MonthlySummaryHeaderProps): React.JSX.Element {
  const { theme } = useTheme();
  const { config, amountsHidden, toggleAmountsHidden } = useSecurity();
  const [labelTranslateX] = useState(() => new Animated.Value(0));
  const draggingRef = useRef(false);
  const onPrevRef = useRef(onPrevPeriod);
  const onNextRef = useRef(onNextPeriod);

  useEffect(() => {
    onPrevRef.current = onPrevPeriod;
    onNextRef.current = onNextPeriod;
  }, [onNextPeriod, onPrevPeriod]);

  const animateStepTransition = useCallback(
    (direction: 'prev' | 'next') => {
      // 切期后让新日期文字从切换反方向柔和滑入归零
      labelTranslateX.setValue(direction === 'next' ? 24 : -24);
      Animated.spring(labelTranslateX, {
        toValue: 0,
        useNativeDriver: true,
        stiffness: 340,
        damping: 28,
        mass: 0.8,
      }).start();
    },
    [labelTranslateX]
  );

  const handleStepPrev = useCallback(() => {
    hapticSelection();
    onPrevRef.current();
    animateStepTransition('prev');
  }, [animateStepTransition]);

  const handleStepNext = useCallback(() => {
    hapticSelection();
    onNextRef.current();
    animateStepTransition('next');
  }, [animateStepTransition]);

  const springLabelBack = useCallback(() => {
    Animated.spring(labelTranslateX, {
      toValue: 0,
      useNativeDriver: true,
      stiffness: 340,
      damping: 28,
      mass: 0.85,
    }).start();
  }, [labelTranslateX]);

  // 顶部日期行左右滑动切换周期：activeOffsetX ±8px 比外层翻页/抽屉（±14px）更早抢占，彻底隔离冲突
  const periodSwipeGesture = usePanGesture({
    enabled: mode !== 'all',
    disableReanimated: true,
    runOnJS: true,
    activeOffsetX: [-8, 8],
    failOffsetY: [-18, 18],
    onActivate: () => {
      draggingRef.current = true;
    },
    onUpdate: (event) => {
      if (!draggingRef.current) {
        return;
      }
      const damped = Math.max(
        -MAX_SWIPE_PREVIEW,
        Math.min(MAX_SWIPE_PREVIEW, event.translationX * 0.55)
      );
      labelTranslateX.setValue(damped);
    },
    onDeactivate: (event) => {
      if (!draggingRef.current) {
        return;
      }
      draggingRef.current = false;
      const projected = event.translationX + event.velocityX * 0.12;
      if (projected < -SWIPE_TRIGGER_THRESHOLD || (event.velocityX < -420 && event.translationX < -12)) {
        handleStepNext();
      } else if (
        projected > SWIPE_TRIGGER_THRESHOLD ||
        (event.velocityX > 420 && event.translationX > 12)
      ) {
        handleStepPrev();
      } else {
        springLabelBack();
      }
    },
    onFinalize: () => {
      if (draggingRef.current) {
        draggingRef.current = false;
        springLabelBack();
      }
    },
  });

  const labelOpacity = labelTranslateX.interpolate({
    inputRange: [-MAX_SWIPE_PREVIEW, 0, MAX_SWIPE_PREVIEW],
    outputRange: [0.58, 1, 0.58],
    extrapolate: 'clamp',
  });

  return (
    <View
      style={[
        styles.card,
        {
          backgroundColor: theme.colors.heroBg,
          borderRadius: theme.radius.lg,
          padding: theme.spacing.lg,
        },
      ]}
    >
      {mode === 'all' ? (
        <View style={[styles.periodRow, styles.periodRowCenter]}>
          <View style={styles.periodTitleBtn}>
            <Text
              style={[
                styles.tabular,
                {
                  color: theme.colors.heroText,
                  fontSize: theme.fontSize.lg,
                  fontWeight: theme.fontWeight.semibold,
                },
              ]}
            >
              {periodLabel}
            </Text>
          </View>
        </View>
      ) : (
        <GestureDetector gesture={periodSwipeGesture}>
          <View style={styles.periodRow}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={mode === 'month' ? '上一个月' : '上一年'}
              onPress={handleStepPrev}
              hitSlop={8}
              style={({ pressed }) => [
                styles.periodArrow,
                pressed && { opacity: theme.opacity.pressed },
              ]}
            >
              <AppIcon name="chevron-back" size={20} color={theme.colors.heroText} />
            </Pressable>

            <Animated.View
              style={[
                styles.periodTitleWrap,
                {
                  opacity: labelOpacity,
                  transform: [{ translateX: labelTranslateX }],
                },
              ]}
            >
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`选择${mode === 'month' ? '月份' : '年份'}，当前 ${periodLabel}`}
                accessibilityHint="点击打开周期选择器，或左右滑动切换上下周期"
                onPress={() => {
                  hapticLight();
                  onPressPeriod();
                }}
                hitSlop={8}
                style={({ pressed }) => [
                  styles.periodTitleBtn,
                  pressed && { opacity: theme.opacity.pressed },
                ]}
              >
                <Text
                  style={[
                    styles.tabular,
                    {
                      color: theme.colors.heroText,
                      fontSize: theme.fontSize.lg,
                      fontWeight: theme.fontWeight.semibold,
                    },
                  ]}
                >
                  {periodLabel}
                </Text>
                <AppIcon name="chevron-down" size={14} color={theme.colors.heroSubtext} />
              </Pressable>
            </Animated.View>

            <Pressable
              accessibilityRole="button"
              accessibilityLabel={mode === 'month' ? '下一个月' : '下一年'}
              onPress={handleStepNext}
              hitSlop={8}
              style={({ pressed }) => [
                styles.periodArrow,
                pressed && { opacity: theme.opacity.pressed },
              ]}
            >
              <AppIcon name="chevron-forward" size={20} color={theme.colors.heroText} />
            </Pressable>
          </View>
        </GestureDetector>
      )}

      <Pressable
        accessibilityRole={onPressAnalytics ? 'button' : 'none'}
        accessibilityLabel={onPressAnalytics ? '进入账务分析' : undefined}
        disabled={!onPressAnalytics}
        onPress={
          onPressAnalytics
            ? () => {
                hapticLight();
                onPressAnalytics();
              }
            : undefined
        }
        style={({ pressed }) => [
          { marginTop: theme.spacing.md },
          pressed && onPressAnalytics ? { opacity: theme.opacity.pressed } : null,
        ]}
      >
        <View style={styles.primaryRow}>
          <View style={{ flex: 1 }}>
            <Text
              style={{
                color: theme.colors.heroSubtext,
                fontSize: theme.fontSize.xs,
                fontWeight: theme.fontWeight.regular,
              }}
            >
              {summary.transactionCount > 0 ? `支出 · ${summary.transactionCount} 笔` : '支出'}
            </Text>
            <Text
              numberOfLines={1}
              adjustsFontSizeToFit
              style={[
                styles.tabular,
                {
                  color: theme.colors.heroText,
                  fontSize: theme.fontSize.hero,
                  fontWeight: theme.fontWeight.semibold,
                  marginTop: theme.spacing.xs,
                },
              ]}
            >
              {maskSensitiveAmount(formatCentsToYuan(summary.expenseCents), amountsHidden)}
            </Text>
          </View>

          <View style={styles.rightCueRow}>
            {config.showAmountPrivacyToggle ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={amountsHidden ? '显示金额' : '隐藏金额'}
                hitSlop={10}
                onPress={() => {
                  hapticLight();
                  toggleAmountsHidden();
                }}
                style={({ pressed }) => [
                  styles.eyeBtn,
                  pressed && { opacity: theme.opacity.pressed },
                ]}
              >
                <AppIcon
                  name={amountsHidden ? 'eye-off-outline' : 'eye-outline'}
                  size={17}
                  color={theme.colors.heroSubtext}
                />
              </Pressable>
            ) : null}
            {onPressAnalytics ? (
              <View style={styles.analyticsCue}>
                <AppIcon name="bar-chart-outline" size={14} color={theme.colors.heroSubtext} />
                <Text
                  style={{
                    color: theme.colors.heroSubtext,
                    fontSize: theme.fontSize.xs,
                    fontWeight: theme.fontWeight.semibold,
                    marginLeft: 4,
                  }}
                >
                  分析
                </Text>
                <AppIcon name="chevron-forward" size={14} color={theme.colors.heroSubtext} />
              </View>
            ) : null}
          </View>
        </View>

        <View
          style={[
            styles.divider,
            {
              backgroundColor: theme.colors.heroDivider,
              marginVertical: theme.spacing.md,
            },
          ]}
        />

        <View style={styles.metricsRow}>
          <View style={styles.metricCol}>
            <Text
              style={{
                color: theme.colors.heroSubtext,
                fontSize: theme.fontSize.xs,
              }}
            >
              收入
            </Text>
            <Text
              numberOfLines={1}
              adjustsFontSizeToFit
              style={[
                styles.tabular,
                {
                  color: theme.colors.heroText,
                  fontSize: theme.fontSize.lg,
                  fontWeight: theme.fontWeight.semibold,
                  marginTop: theme.spacing.xs,
                },
              ]}
            >
              {maskSensitiveAmount(formatCentsToYuan(summary.incomeCents), amountsHidden)}
            </Text>
          </View>

          <View style={styles.metricCol}>
            <Text
              style={{
                color: theme.colors.heroSubtext,
                fontSize: theme.fontSize.xs,
              }}
            >
              结余
            </Text>
            <Text
              numberOfLines={1}
              adjustsFontSizeToFit
              style={[
                styles.tabular,
                {
                  color: theme.colors.heroText,
                  fontSize: theme.fontSize.lg,
                  fontWeight: theme.fontWeight.semibold,
                  marginTop: theme.spacing.xs,
                },
              ]}
            >
              {maskSensitiveAmount(formatCentsToYuan(summary.balanceCents), amountsHidden)}
            </Text>
          </View>
        </View>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {},
  periodRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    overflow: 'hidden',
  },
  periodRowCenter: {
    justifyContent: 'center',
  },
  periodArrow: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  periodTitleWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  periodTitleBtn: {
    minHeight: 36,
    paddingHorizontal: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  primaryRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
  },
  rightCueRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  eyeBtn: {
    padding: 4,
  },
  analyticsCue: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 4,
  },
  divider: {
    height: 1,
  },
  metricsRow: {
    flexDirection: 'row',
    gap: 16,
  },
  metricCol: {
    flex: 1,
  },
  tabular: {
    fontVariant: ['tabular-nums'],
  },
});
