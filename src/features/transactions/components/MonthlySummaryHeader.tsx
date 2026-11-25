/**
 * 约束简报（Workflow B / C）：
 * - 信息层级：主（当月支出 30px/600）、次（月份切换 + 收入/结余 18px/600）、弱（标签 heroSubtext 12px/400）
 * - 交互意图：点击卡片数据区直接跳转「账务分析」，右上保留紧凑「分析 ›」信号，不堆叠说明文案
 * - 彩色底禁止灰字：标签统一使用同色相浅阶 heroSubtext；数字使用 tabular-nums 对齐
 */
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { formatMonthTitle, getCurrentMonthKey } from '../../../shared/date/date';
import { formatCentsToYuan } from '../../../shared/money/money';
import { AppIcon } from '../../../shared/ui/AppIcon';
import { useTheme } from '../../../theme/theme-context';
import type { MonthlySummary } from '../types';

interface MonthlySummaryHeaderProps {
  monthKey: string;
  summary: MonthlySummary;
  onPrevMonth: () => void;
  onNextMonth: () => void;
  onResetCurrentMonth: () => void;
  onPressAnalytics?: () => void;
}

export function MonthlySummaryHeader({
  monthKey,
  summary,
  onPrevMonth,
  onNextMonth,
  onResetCurrentMonth,
  onPressAnalytics,
}: MonthlySummaryHeaderProps): React.JSX.Element {
  const { theme } = useTheme();
  const isCurrentMonth = monthKey === getCurrentMonthKey();

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
      <View style={styles.monthRow}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="上一个月"
          onPress={onPrevMonth}
          hitSlop={8}
          style={({ pressed }) => [
            styles.monthArrow,
            pressed && { opacity: theme.opacity.pressed },
          ]}
        >
          <AppIcon name="chevron-back" size={20} color={theme.colors.heroText} />
        </Pressable>

        <View style={styles.monthCenter}>
          <Text
            style={{
              color: theme.colors.heroText,
              fontSize: theme.fontSize.lg,
              fontWeight: theme.fontWeight.semibold,
            }}
          >
            {formatMonthTitle(monthKey)}
          </Text>
          {!isCurrentMonth ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="回到本月"
              onPress={onResetCurrentMonth}
              hitSlop={8}
              style={{ marginLeft: theme.spacing.sm }}
            >
              <Text
                style={{
                  color: theme.colors.heroSubtext,
                  fontSize: theme.fontSize.xs,
                  fontWeight: theme.fontWeight.semibold,
                }}
              >
                本月
              </Text>
            </Pressable>
          ) : null}
        </View>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel="下一个月"
          onPress={onNextMonth}
          hitSlop={8}
          style={({ pressed }) => [
            styles.monthArrow,
            pressed && { opacity: theme.opacity.pressed },
          ]}
        >
          <AppIcon name="chevron-forward" size={20} color={theme.colors.heroText} />
        </Pressable>
      </View>

      <Pressable
        accessibilityRole={onPressAnalytics ? 'button' : 'none'}
        accessibilityLabel={onPressAnalytics ? '进入账务分析' : undefined}
        disabled={!onPressAnalytics}
        onPress={onPressAnalytics}
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
              支出
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
              {formatCentsToYuan(summary.expenseCents)}
            </Text>
          </View>

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
              {formatCentsToYuan(summary.incomeCents)}
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
              {formatCentsToYuan(summary.balanceCents)}
            </Text>
          </View>
        </View>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {},
  monthRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  monthArrow: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  monthCenter: {
    flexDirection: 'row',
    alignItems: 'baseline',
  },
  primaryRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
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
