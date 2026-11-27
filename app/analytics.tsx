/**
 * 约束简报（Workflow B / C）：
 * - 信息层级：主（顶部「按月 / 按年 / 全部」范围切换 + 周期核心指标卡含环比/同比增幅与消费洞察）、次（可下钻趋势柱图 + 可展开二级的一级分类占比排行 + 大额单笔排行 Top 5）、弱（可下钻账户分布）
 * - 交互意图：
 *   1. 点击按年/全部趋势柱逐级下钻月份/年份；
 *   2. 点击含二级子类的分类行原地展开二级占比拆分，点击任意分类/二级/账户行一键下钻 `/search` 查看原始明细；
 *   3. 点击大额排行条目直接弹出下半屏 `TransactionDetailSheet` 查看/退款/编辑/删除。
 * - 视觉规范：柔和浅灰画布（`surfaceGrouped`）+ 纯白无外描边 14px 卡片（`surfaceRaised`）+ 缩进细分割线（`divider`），数字强制 `tabular-nums`。
 */
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import React, { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useDatabase } from '../src/db/database-context';
import { getScopedAnalytics } from '../src/features/analytics/service';
import type {
  AnalyticsKind,
  AnalyticsScope,
  MetricDelta,
  ScopedAnalyticsReport,
} from '../src/features/analytics/types';
import { PeriodPickerSheet } from '../src/features/transactions/components/PeriodPickerSheet';
import { useTransactionListInteractions } from '../src/features/transactions/components/useTransactionListInteractions';
import {
  formatMonthTitle,
  getCurrentMonthKey,
  getCurrentYear,
  getMonthDateRange,
  getYearDateRange,
  isValidMonthKey,
  shiftMonthKey,
} from '../src/shared/date/date';
import { hapticLight } from '../src/shared/haptics/haptics';
import { formatCentsToYuan } from '../src/shared/money/money';
import { AppIcon } from '../src/shared/ui/AppIcon';
import { EmptyState } from '../src/shared/ui/EmptyState';
import { SafeScreen } from '../src/shared/ui/SafeScreen';
import { SlidingSegmentedControl } from '../src/shared/ui/SlidingSegmentedControl';
import { useTheme } from '../src/theme/theme-context';

const SCOPE_OPTIONS: readonly { value: AnalyticsScope; label: string }[] = [
  { value: 'month', label: '按月' },
  { value: 'year', label: '按年' },
  { value: 'all', label: '全部' },
];

const KIND_OPTIONS: readonly { value: AnalyticsKind; label: string }[] = [
  { value: 'expense', label: '支出构成' },
  { value: 'income', label: '收入构成' },
];

function firstParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function formatDeltaBadge(label: string, delta: MetricDelta): string | null {
  if (delta.changePercent !== null) {
    const sign = delta.changePercent > 0 ? '+' : '';
    return `${label} ${sign}${delta.changePercent.toFixed(1)}%`;
  }
  if (delta.deltaCents === 0) {
    return `${label} 持平`;
  }
  const sign = delta.deltaCents > 0 ? '+' : '-';
  return `${label} ${sign}${formatCentsToYuan(Math.abs(delta.deltaCents))}`;
}

const CHART_BAR_MAX_HEIGHT = 96;

export default function AnalyticsScreen(): React.JSX.Element {
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { db, revision } = useDatabase();
  const interactions = useTransactionListInteractions();

  const params = useLocalSearchParams<{
    scope?: string | string[];
    month?: string | string[];
    year?: string | string[];
  }>();
  const initialScopeParam = firstParam(params.scope);
  const initialMonth = firstParam(params.month);
  const initialYearParam = Number(firstParam(params.year));

  const [scope, setScope] = useState<AnalyticsScope>(() =>
    initialScopeParam === 'year' || initialScopeParam === 'all' ? initialScopeParam : 'month'
  );
  const [monthKey, setMonthKey] = useState<string>(() =>
    initialMonth && isValidMonthKey(initialMonth) ? initialMonth : getCurrentMonthKey()
  );
  const [year, setYear] = useState<number>(() =>
    Number.isInteger(initialYearParam) && initialYearParam >= 1970 && initialYearParam <= 2100
      ? initialYearParam
      : initialMonth && isValidMonthKey(initialMonth)
        ? Number(initialMonth.slice(0, 4))
        : getCurrentYear()
  );
  const [kind, setKind] = useState<AnalyticsKind>('expense');
  const [periodPickerOpen, setPeriodPickerOpen] = useState(false);
  const [report, setReport] = useState<ScopedAnalyticsReport | null>(null);
  const [expandedCategoryIds, setExpandedCategoryIds] = useState<Record<string, boolean>>({});

  useEffect(() => {
    let active = true;
    void (async () => {
      const data = await getScopedAnalytics(db, { scope, monthKey, year });
      if (active) {
        setReport(data);
      }
    })();
    return () => {
      active = false;
    };
  }, [db, scope, monthKey, year, revision]);

  const maxTrendCents = useMemo(() => {
    if (!report) {
      return 0;
    }
    let peak = 0;
    for (const pt of report.trendPoints) {
      if (pt.expenseCents > peak) peak = pt.expenseCents;
      if (pt.incomeCents > peak) peak = pt.incomeCents;
    }
    return peak;
  }, [report]);

  const activeDateRange = useMemo(() => {
    if (scope === 'month') {
      return getMonthDateRange(monthKey);
    }
    if (scope === 'year') {
      return getYearDateRange(year);
    }
    return null;
  }, [scope, monthKey, year]);

  const handleSwitchScope = (nextScope: AnalyticsScope) => {
    if (nextScope === scope) {
      return;
    }
    if (nextScope === 'year' && scope === 'month') {
      setYear(Number(monthKey.slice(0, 4)));
    } else if (nextScope === 'month' && scope === 'year') {
      setMonthKey(`${year}-${monthKey.slice(5, 7)}`);
    }
    setExpandedCategoryIds({});
    setScope(nextScope);
  };

  const handleSwitchKind = (nextKind: AnalyticsKind) => {
    if (nextKind === kind) {
      return;
    }
    setExpandedCategoryIds({});
    setKind(nextKind);
  };

  const drillDownToSearch = (target: {
    categoryId?: string;
    accountId?: string;
    title: string;
  }) => {
    hapticLight();
    router.push({
      pathname: '/search',
      params: {
        type: kind,
        ...(target.categoryId ? { categoryId: target.categoryId } : {}),
        ...(target.accountId ? { accountId: target.accountId } : {}),
        ...(activeDateRange
          ? { startDate: activeDateRange.start, endDate: activeDateRange.end }
          : {}),
        title: target.title,
      },
    });
  };

  const toggleCategoryExpand = (categoryId: string) => {
    hapticLight();
    setExpandedCategoryIds((prev) => ({
      ...prev,
      [categoryId]: !prev[categoryId],
    }));
  };

  const categoryList = report
    ? kind === 'expense'
      ? report.expenseByCategory
      : report.incomeByCategory
    : [];
  const accountList = report
    ? kind === 'expense'
      ? report.expenseByAccount
      : report.incomeByAccount
    : [];
  const topList = report ? (kind === 'expense' ? report.topExpenses : report.topIncomes) : [];

  const barFillColor = kind === 'expense' ? theme.colors.expense : theme.colors.income;
  const badgeBg = kind === 'expense' ? theme.colors.expenseSubtle : theme.colors.incomeSubtle;
  const badgeFg =
    kind === 'expense' ? theme.colors.expenseTextOnSubtle : theme.colors.incomeTextOnSubtle;

  const isDenseYearTrend = scope === 'year';
  const periodTitle =
    scope === 'month' ? formatMonthTitle(monthKey) : scope === 'year' ? `${year}年` : '全部时间';

  const emptyCategoryTitle =
    scope === 'month'
      ? kind === 'expense'
        ? '本月暂无支出'
        : '本月暂无收入'
      : scope === 'year'
        ? kind === 'expense'
          ? `${year}年暂无支出`
          : `${year}年暂无收入`
        : kind === 'expense'
          ? '暂无支出记录'
          : '暂无收入记录';

  const comparisonBadges = useMemo(() => {
    const cmp = report?.comparison;
    if (!cmp) {
      return [] as { key: string; text: string; tone: 'up' | 'down' | 'flat' }[];
    }
    const result: { key: string; text: string; tone: 'up' | 'down' | 'flat' }[] = [];
    const pushItem = (
      key: string,
      prefix: string,
      delta: MetricDelta,
      increaseIsExpense: boolean
    ) => {
      const text = formatDeltaBadge(prefix, delta);
      if (!text) return;
      const tone =
        delta.deltaCents === 0
          ? 'flat'
          : increaseIsExpense
            ? delta.deltaCents > 0
              ? 'up'
              : 'down'
            : delta.deltaCents > 0
              ? 'down'
              : 'up';
      result.push({ key, text, tone });
    };

    pushItem('prev-exp', `支出${cmp.previous.label}`, cmp.previous.expenseDelta, true);
    if (cmp.yearOverYear && (cmp.yearOverYear.expenseCents > 0 || (report?.summary.expenseCents ?? 0) > 0)) {
      pushItem('yoy-exp', `支出${cmp.yearOverYear.label}`, cmp.yearOverYear.expenseDelta, true);
    }
    if (cmp.previous.incomeCents > 0 || (report?.summary.incomeCents ?? 0) > 0) {
      pushItem('prev-inc', `收入${cmp.previous.label}`, cmp.previous.incomeDelta, false);
    }
    return result;
  }, [report]);

  return (
    <SafeScreen edges={['left', 'right']} style={{ backgroundColor: theme.colors.surfaceGrouped }}>
      <Stack.Screen options={{ title: '账务分析' }} />

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{
          padding: theme.spacing.lg,
          paddingBottom: Math.max(insets.bottom, theme.spacing.lg) + theme.spacing.xl,
        }}
      >
        {/* 周期范围切换：按月 / 按年 / 全部 */}
        <SlidingSegmentedControl
          options={SCOPE_OPTIONS}
          value={scope}
          onChange={handleSwitchScope}
          fullWidth
          height={42}
          shape="rounded"
          trackTone="surfaceRaised"
          textSize="sm"
          style={{ marginBottom: theme.spacing.md }}
        />

        {/* 周期切换与核心指标汇总卡 */}
        <View
          style={[
            styles.card,
            {
              backgroundColor: theme.colors.surfaceRaised,
              borderRadius: 14,
              padding: theme.spacing.lg,
            },
          ]}
        >
          {scope === 'all' ? (
            <View style={styles.allHeader}>
              <Text
                style={{
                  color: theme.colors.text,
                  fontSize: theme.fontSize.lg,
                  fontWeight: theme.fontWeight.semibold,
                }}
              >
                {periodTitle}
              </Text>
              {report?.dateRangeLabel ? (
                <Text
                  style={[
                    styles.tabular,
                    {
                      color: theme.colors.textMuted,
                      fontSize: theme.fontSize.xs,
                      marginTop: theme.spacing.xs,
                    },
                  ]}
                >
                  {report.dateRangeLabel}
                </Text>
              ) : null}
            </View>
          ) : (
            <View style={styles.periodRow}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={scope === 'month' ? '上一个月' : '上一年'}
                onPress={() => {
                  if (scope === 'month') {
                    setMonthKey((prev) => shiftMonthKey(prev, -1));
                  } else {
                    setYear((prev) => prev - 1);
                  }
                }}
                hitSlop={8}
                style={({ pressed }) => [
                  styles.periodArrow,
                  pressed && { opacity: theme.opacity.pressed },
                ]}
              >
                <AppIcon name="chevron-back" size={20} color={theme.colors.text} />
              </Pressable>

              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`选择${scope === 'month' ? '月份' : '年份'}，当前 ${periodTitle}`}
                onPress={() => setPeriodPickerOpen(true)}
                hitSlop={8}
                style={({ pressed }) => [
                  styles.periodCenterBtn,
                  pressed && { opacity: theme.opacity.pressed },
                ]}
              >
                <Text
                  style={[
                    styles.tabular,
                    {
                      color: theme.colors.text,
                      fontSize: theme.fontSize.lg,
                      fontWeight: theme.fontWeight.semibold,
                    },
                  ]}
                >
                  {periodTitle}
                </Text>
                <AppIcon name="chevron-down" size={14} color={theme.colors.textMuted} />
              </Pressable>

              <Pressable
                accessibilityRole="button"
                accessibilityLabel={scope === 'month' ? '下一个月' : '下一年'}
                onPress={() => {
                  if (scope === 'month') {
                    setMonthKey((prev) => shiftMonthKey(prev, 1));
                  } else {
                    setYear((prev) => prev + 1);
                  }
                }}
                hitSlop={8}
                style={({ pressed }) => [
                  styles.periodArrow,
                  pressed && { opacity: theme.opacity.pressed },
                ]}
              >
                <AppIcon name="chevron-forward" size={20} color={theme.colors.text} />
              </Pressable>
            </View>
          )}

          <View style={[styles.kpiGrid, { marginTop: theme.spacing.lg }]}>
            <View style={styles.kpiItem}>
              <Text style={{ color: theme.colors.textMuted, fontSize: theme.fontSize.xs }}>
                支出
              </Text>
              <Text
                numberOfLines={1}
                adjustsFontSizeToFit
                style={[
                  styles.tabular,
                  {
                    color: theme.colors.expense,
                    fontSize: theme.fontSize.lg,
                    fontWeight: theme.fontWeight.semibold,
                    marginTop: theme.spacing.xs,
                  },
                ]}
              >
                {formatCentsToYuan(report?.summary.expenseCents ?? 0)}
              </Text>
            </View>

            <View style={styles.kpiItem}>
              <Text style={{ color: theme.colors.textMuted, fontSize: theme.fontSize.xs }}>
                收入
              </Text>
              <Text
                numberOfLines={1}
                adjustsFontSizeToFit
                style={[
                  styles.tabular,
                  {
                    color: theme.colors.income,
                    fontSize: theme.fontSize.lg,
                    fontWeight: theme.fontWeight.semibold,
                    marginTop: theme.spacing.xs,
                  },
                ]}
              >
                {formatCentsToYuan(report?.summary.incomeCents ?? 0)}
              </Text>
            </View>

            <View style={styles.kpiItem}>
              <Text style={{ color: theme.colors.textMuted, fontSize: theme.fontSize.xs }}>
                结余
              </Text>
              <Text
                numberOfLines={1}
                adjustsFontSizeToFit
                style={[
                  styles.tabular,
                  {
                    color: theme.colors.text,
                    fontSize: theme.fontSize.lg,
                    fontWeight: theme.fontWeight.semibold,
                    marginTop: theme.spacing.xs,
                  },
                ]}
              >
                {formatCentsToYuan(report?.summary.balanceCents ?? 0)}
              </Text>
            </View>
          </View>

          {/* 环比 / 同比紧凑胶囊 */}
          {comparisonBadges.length > 0 ? (
            <View style={[styles.deltaStrip, { marginTop: theme.spacing.md }]}>
              {comparisonBadges.map((badge) => {
                const bg =
                  badge.tone === 'up'
                    ? theme.colors.expenseSubtle
                    : badge.tone === 'down'
                      ? theme.colors.actionSurface
                      : theme.colors.chipInactive;
                const fg =
                  badge.tone === 'up'
                    ? theme.colors.expenseTextOnSubtle
                    : badge.tone === 'down'
                      ? theme.colors.action
                      : theme.colors.textMuted;
                return (
                  <View
                    key={badge.key}
                    style={[styles.deltaChip, { backgroundColor: bg, borderRadius: 8 }]}
                  >
                    <Text
                      style={[
                        styles.tabular,
                        { color: fg, fontSize: 11, fontWeight: theme.fontWeight.semibold },
                      ]}
                    >
                      {badge.text}
                    </Text>
                  </View>
                );
              })}
            </View>
          ) : null}

          <View
            style={[
              styles.subMetaRow,
              {
                borderTopColor: theme.colors.divider,
                borderTopWidth: StyleSheet.hairlineWidth,
                marginTop: theme.spacing.md,
                paddingTop: theme.spacing.md,
              },
            ]}
          >
            <View style={styles.subMetaItem}>
              <Text style={{ color: theme.colors.textMuted, fontSize: theme.fontSize.xs }}>
                日均支出
              </Text>
              <Text
                style={[
                  styles.tabular,
                  {
                    color: theme.colors.textSecondary,
                    fontSize: theme.fontSize.sm,
                    fontWeight: theme.fontWeight.semibold,
                    marginTop: 2,
                  },
                ]}
              >
                {formatCentsToYuan(report?.dailyAvgExpenseCents ?? 0)}
              </Text>
            </View>

            <View style={styles.subMetaItem}>
              <Text style={{ color: theme.colors.textMuted, fontSize: theme.fontSize.xs }}>
                结余率
              </Text>
              <Text
                style={[
                  styles.tabular,
                  {
                    color: theme.colors.textSecondary,
                    fontSize: theme.fontSize.sm,
                    fontWeight: theme.fontWeight.semibold,
                    marginTop: 2,
                  },
                ]}
              >
                {report && report.savingsRatePercent !== null
                  ? `${report.savingsRatePercent}%`
                  : '-'}
              </Text>
            </View>

            <View style={styles.subMetaItem}>
              <Text style={{ color: theme.colors.textMuted, fontSize: theme.fontSize.xs }}>
                单笔均价
              </Text>
              <Text
                style={[
                  styles.tabular,
                  {
                    color: theme.colors.textSecondary,
                    fontSize: theme.fontSize.sm,
                    fontWeight: theme.fontWeight.semibold,
                    marginTop: 2,
                  },
                ]}
              >
                {formatCentsToYuan(report?.highlights.avgExpensePerTxCents ?? 0)}
              </Text>
            </View>
          </View>

          {report && report.highlights.activeExpenseDays > 0 ? (
            <View
              style={[
                styles.highlightFootnote,
                {
                  backgroundColor: theme.colors.surfaceGrouped,
                  borderRadius: 10,
                  marginTop: theme.spacing.md,
                },
              ]}
            >
              <Text style={[styles.tabular, { color: theme.colors.textMuted, fontSize: 12 }]}>
                消费 {report.highlights.activeExpenseDays} 天 · 共 {report.summary.transactionCount} 笔
              </Text>
              {report.highlights.peakExpenseDay ? (
                <Text style={[styles.tabular, { color: theme.colors.textSecondary, fontSize: 12 }]}>
                  峰值 {report.highlights.peakExpenseDay.occurredOn.slice(5)}（
                  {formatCentsToYuan(report.highlights.peakExpenseDay.totalCents)}）
                </Text>
              ) : null}
            </View>
          ) : null}
        </View>

        {/* 收支趋势柱图（按月 6 月 / 按年 12 月 / 全部按年） */}
        <View style={{ marginTop: theme.spacing.lg }}>
          <View style={[styles.sectionHeader, { marginBottom: 8 }]}>
            <Text
              style={{
                color: theme.colors.textMuted,
                fontSize: theme.fontSize.xs,
                fontWeight: theme.fontWeight.semibold,
              }}
            >
              {report?.trendTitle ?? '收支趋势'}
            </Text>
            <View style={styles.legendRow}>
              <View style={styles.legendItem}>
                <View style={[styles.legendDot, { backgroundColor: theme.colors.expense }]} />
                <Text style={{ color: theme.colors.textMuted, fontSize: theme.fontSize.xs }}>
                  支出
                </Text>
              </View>
              <View style={styles.legendItem}>
                <View style={[styles.legendDot, { backgroundColor: theme.colors.income }]} />
                <Text style={{ color: theme.colors.textMuted, fontSize: theme.fontSize.xs }}>
                  收入
                </Text>
              </View>
            </View>
          </View>

          <View
            style={[
              styles.card,
              {
                backgroundColor: theme.colors.surfaceRaised,
                borderRadius: 14,
                paddingHorizontal: isDenseYearTrend ? theme.spacing.sm : theme.spacing.lg,
                paddingVertical: theme.spacing.lg,
              },
            ]}
          >
            <View style={[styles.chartRow, { gap: isDenseYearTrend ? 2 : 4 }]}>
              {(report?.trendPoints ?? []).map((pt) => {
                const selected = scope === 'month' && pt.key === monthKey;
                const expHeight =
                  maxTrendCents > 0 && pt.expenseCents > 0
                    ? Math.max(
                        4,
                        Math.round((pt.expenseCents / maxTrendCents) * CHART_BAR_MAX_HEIGHT)
                      )
                    : 2;
                const incHeight =
                  maxTrendCents > 0 && pt.incomeCents > 0
                    ? Math.max(
                        4,
                        Math.round((pt.incomeCents / maxTrendCents) * CHART_BAR_MAX_HEIGHT)
                      )
                    : 2;

                const compactLabel = isDenseYearTrend ? pt.label.replace('月', '') : pt.label;

                return (
                  <Pressable
                    key={pt.key}
                    accessibilityRole="button"
                    accessibilityLabel={`${pt.label}，支出 ${formatCentsToYuan(pt.expenseCents)}，收入 ${formatCentsToYuan(pt.incomeCents)}`}
                    accessibilityState={{ selected }}
                    onPress={() => {
                      if (scope === 'month') {
                        setMonthKey(pt.key);
                      } else if (scope === 'year') {
                        setMonthKey(pt.key);
                        setScope('month');
                      } else {
                        const targetYear = Number(pt.key);
                        if (Number.isInteger(targetYear)) {
                          setYear(targetYear);
                          setScope('year');
                        }
                      }
                    }}
                    style={({ pressed }) => [
                      styles.chartCol,
                      selected && {
                        backgroundColor: theme.colors.surfaceGrouped,
                        borderRadius: 8,
                      },
                      pressed && { opacity: theme.opacity.pressed },
                    ]}
                  >
                    <View style={[styles.barsWrap, { gap: isDenseYearTrend ? 1.5 : 3 }]}>
                      <View
                        style={[
                          styles.bar,
                          {
                            width: isDenseYearTrend ? 5 : 10,
                            height: expHeight,
                            backgroundColor:
                              pt.expenseCents > 0 ? theme.colors.expense : theme.colors.divider,
                            opacity: selected || scope !== 'month' ? 1 : 0.72,
                          },
                        ]}
                      />
                      <View
                        style={[
                          styles.bar,
                          {
                            width: isDenseYearTrend ? 5 : 10,
                            height: incHeight,
                            backgroundColor:
                              pt.incomeCents > 0 ? theme.colors.income : theme.colors.divider,
                            opacity: selected || scope !== 'month' ? 1 : 0.72,
                          },
                        ]}
                      />
                    </View>
                    <Text
                      numberOfLines={1}
                      style={[
                        styles.tabular,
                        {
                          color: selected ? theme.colors.action : theme.colors.textMuted,
                          fontSize: isDenseYearTrend ? 11 : theme.fontSize.xs,
                          fontWeight: selected
                            ? theme.fontWeight.semibold
                            : theme.fontWeight.regular,
                          marginTop: theme.spacing.sm,
                        },
                      ]}
                    >
                      {compactLabel}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
        </View>

        {/* 支出 / 收入分析维度切换 */}
        <SlidingSegmentedControl
          options={KIND_OPTIONS}
          value={kind}
          onChange={handleSwitchKind}
          fullWidth
          height={42}
          shape="rounded"
          trackTone="surfaceRaised"
          textSize="sm"
          style={{ marginTop: theme.spacing.lg }}
        />

        {/* 分类占比排行（支持二级展开与一键下钻原始明细） */}
        <View style={{ marginTop: theme.spacing.lg }}>
          <View style={[styles.sectionHeader, { marginBottom: 8 }]}>
            <Text
              style={{
                color: theme.colors.textMuted,
                fontSize: theme.fontSize.xs,
                fontWeight: theme.fontWeight.semibold,
              }}
            >
              分类排行
            </Text>
            {categoryList.length > 0 ? (
              <Text style={{ color: theme.colors.textMuted, fontSize: 11 }}>
                点按展开二级或查明细
              </Text>
            ) : null}
          </View>

          {categoryList.length === 0 ? (
            <EmptyState icon="pie-chart-outline" title={emptyCategoryTitle} />
          ) : (
            <View
              style={[
                styles.card,
                {
                  backgroundColor: theme.colors.surfaceRaised,
                  borderRadius: 14,
                  paddingHorizontal: theme.spacing.lg,
                  paddingVertical: theme.spacing.xs,
                },
              ]}
            >
              {categoryList.map((item, idx) => {
                const hasChildren = item.children.length > 0;
                const expanded = Boolean(expandedCategoryIds[item.categoryId]);

                return (
                  <View
                    key={item.categoryId}
                    style={{
                      borderBottomColor: theme.colors.divider,
                      borderBottomWidth:
                        idx < categoryList.length - 1 ? StyleSheet.hairlineWidth : 0,
                    }}
                  >
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={`${item.name}，${formatCentsToYuan(item.totalCents)}，占比 ${item.percentage.toFixed(1)}%`}
                      onPress={() => {
                        if (hasChildren) {
                          toggleCategoryExpand(item.categoryId);
                        } else {
                          drillDownToSearch({
                            categoryId: item.categoryId,
                            title: `${periodTitle} · ${item.name}`,
                          });
                        }
                      }}
                      style={({ pressed }) => [
                        styles.rankRow,
                        pressed && { opacity: theme.opacity.pressed },
                      ]}
                    >
                      <View
                        style={[
                          styles.catBadge,
                          {
                            backgroundColor: badgeBg,
                            borderRadius: 10,
                          },
                        ]}
                      >
                        <AppIcon name={item.icon} size={18} color={badgeFg} />
                      </View>

                      <View style={{ flex: 1 }}>
                        <View style={styles.rankTop}>
                          <View style={styles.rankTitleGroup}>
                            <Text
                              numberOfLines={1}
                              style={{
                                flexShrink: 1,
                                color: theme.colors.text,
                                fontSize: theme.fontSize.sm,
                                fontWeight: theme.fontWeight.semibold,
                              }}
                            >
                              {item.name}
                            </Text>
                            <Text
                              style={{
                                color: theme.colors.textMuted,
                                fontSize: theme.fontSize.xs,
                                marginLeft: theme.spacing.xs,
                              }}
                            >
                              {item.count} 笔
                            </Text>
                          </View>

                          <View style={styles.rankValueGroup}>
                            <Text
                              style={[
                                styles.tabular,
                                {
                                  color: theme.colors.text,
                                  fontSize: theme.fontSize.sm,
                                  fontWeight: theme.fontWeight.semibold,
                                },
                              ]}
                            >
                              {formatCentsToYuan(item.totalCents)}
                            </Text>
                            <Text
                              style={[
                                styles.tabular,
                                {
                                  color: theme.colors.textMuted,
                                  fontSize: theme.fontSize.xs,
                                  marginLeft: theme.spacing.sm,
                                  minWidth: 42,
                                  textAlign: 'right',
                                },
                              ]}
                            >
                              {item.percentage.toFixed(1)}%
                            </Text>
                            <View style={{ marginLeft: 4 }}>
                              <AppIcon
                                name={
                                  hasChildren
                                    ? expanded
                                      ? 'chevron-up'
                                      : 'chevron-down'
                                    : 'chevron-forward'
                                }
                                size={14}
                                color={theme.colors.textMuted}
                              />
                            </View>
                          </View>
                        </View>

                        <View
                          style={[
                            styles.progressTrack,
                            {
                              backgroundColor: theme.colors.surfaceGrouped,
                              borderRadius: theme.radius.full,
                              marginTop: theme.spacing.sm,
                            },
                          ]}
                        >
                          <View
                            style={[
                              styles.progressFill,
                              {
                                width: `${Math.max(2, Math.min(100, item.percentage))}%`,
                                backgroundColor: barFillColor,
                                borderRadius: theme.radius.full,
                              },
                            ]}
                          />
                        </View>
                      </View>
                    </Pressable>

                    {/* 展开的二级子分类拆解 + 查看全大类明细入口 */}
                    {hasChildren && expanded ? (
                      <View
                        style={[
                          styles.subListWrap,
                          {
                            backgroundColor: theme.colors.surfaceGrouped,
                            borderRadius: 10,
                            marginBottom: 12,
                          },
                        ]}
                      >
                        {item.children.map((sub, subIdx) => (
                          <Pressable
                            key={`${item.categoryId}:${sub.categoryId}:${sub.isDirectParent ? 'direct' : 'child'}`}
                            accessibilityRole="button"
                            accessibilityLabel={`查看 ${sub.name} 明细`}
                            onPress={() =>
                              drillDownToSearch({
                                categoryId: sub.categoryId,
                                title: sub.isDirectParent
                                  ? `${periodTitle} · ${item.name}`
                                  : `${periodTitle} · ${sub.name}`,
                              })
                            }
                            style={({ pressed }) => [
                              styles.subCatRow,
                              subIdx < item.children.length - 1 && {
                                borderBottomWidth: StyleSheet.hairlineWidth,
                                borderBottomColor: theme.colors.divider,
                              },
                              pressed && { opacity: theme.opacity.pressed },
                            ]}
                          >
                            <View style={[styles.rankTitleGroup, { gap: 6 }]}>
                              <AppIcon
                                name={sub.icon}
                                size={14}
                                color={theme.colors.textMuted}
                              />
                              <Text
                                numberOfLines={1}
                                style={{
                                  flexShrink: 1,
                                  color: theme.colors.textSecondary,
                                  fontSize: theme.fontSize.xs,
                                  fontWeight: theme.fontWeight.regular,
                                }}
                              >
                                {sub.name}
                              </Text>
                              <Text
                                style={{
                                  color: theme.colors.textMuted,
                                  fontSize: 11,
                                }}
                              >
                                {sub.count} 笔
                              </Text>
                            </View>
                            <View style={styles.rankValueGroup}>
                              <Text
                                style={[
                                  styles.tabular,
                                  {
                                    color: theme.colors.text,
                                    fontSize: theme.fontSize.xs,
                                    fontWeight: theme.fontWeight.semibold,
                                  },
                                ]}
                              >
                                {formatCentsToYuan(sub.totalCents)}
                              </Text>
                              <Text
                                style={[
                                  styles.tabular,
                                  {
                                    color: theme.colors.textMuted,
                                    fontSize: 11,
                                    marginLeft: 8,
                                    minWidth: 38,
                                    textAlign: 'right',
                                  },
                                ]}
                              >
                                {sub.percentage.toFixed(1)}%
                              </Text>
                              <View style={{ marginLeft: 3 }}>
                                <AppIcon
                                  name="chevron-forward"
                                  size={12}
                                  color={theme.colors.textMuted}
                                />
                              </View>
                            </View>
                          </Pressable>
                        ))}
                        <Pressable
                          accessibilityRole="button"
                          onPress={() =>
                            drillDownToSearch({
                              categoryId: item.categoryId,
                              title: `${periodTitle} · ${item.name}`,
                            })
                          }
                          style={({ pressed }) => [
                            styles.viewAllSubBtn,
                            {
                              borderTopWidth: StyleSheet.hairlineWidth,
                              borderTopColor: theme.colors.divider,
                            },
                            pressed && { opacity: theme.opacity.pressed },
                          ]}
                        >
                          <Text
                            style={{
                              color: theme.colors.action,
                              fontSize: 12,
                              fontWeight: theme.fontWeight.semibold,
                            }}
                          >
                            查看「{item.name}」全部明细
                          </Text>
                          <AppIcon name="chevron-forward" size={13} color={theme.colors.action} />
                        </Pressable>
                      </View>
                    ) : null}
                  </View>
                );
              })}
            </View>
          )}
        </View>

        {/* 大额单笔排行 Top 5（点击直达详情浮窗） */}
        {topList.length > 0 ? (
          <View style={{ marginTop: theme.spacing.lg }}>
            <Text
              style={{
                color: theme.colors.textMuted,
                fontSize: theme.fontSize.xs,
                fontWeight: theme.fontWeight.semibold,
                marginBottom: 8,
                paddingHorizontal: 4,
              }}
            >
              {kind === 'expense' ? '大额支出排行' : '大额收入排行'}
            </Text>

            <View
              style={[
                styles.card,
                {
                  backgroundColor: theme.colors.surfaceRaised,
                  borderRadius: 14,
                  paddingHorizontal: theme.spacing.lg,
                  paddingVertical: theme.spacing.xs,
                },
              ]}
            >
              {topList.map((entry, idx) => {
                const tx = entry.transaction;
                const title = tx.note.trim() || tx.categoryName || '未分类';
                const subtitle = `${tx.occurredOn} · ${tx.accountName}`;
                return (
                  <Pressable
                    key={tx.id}
                    accessibilityRole="button"
                    accessibilityLabel={`查看 ${title} 详情`}
                    onPress={() => {
                      hapticLight();
                      interactions.handleInspect(tx);
                    }}
                    style={({ pressed }) => [
                      styles.topTxRow,
                      idx < topList.length - 1 && {
                        borderBottomWidth: StyleSheet.hairlineWidth,
                        borderBottomColor: theme.colors.divider,
                      },
                      pressed && { opacity: theme.opacity.pressed },
                    ]}
                  >
                    <View
                      style={[
                        styles.rankNumBadge,
                        {
                          backgroundColor:
                            idx === 0 ? theme.colors.actionSurface : theme.colors.chipInactive,
                          borderRadius: 8,
                        },
                      ]}
                    >
                      <Text
                        style={[
                          styles.tabular,
                          {
                            color: idx === 0 ? theme.colors.action : theme.colors.textMuted,
                            fontSize: 12,
                            fontWeight: theme.fontWeight.semibold,
                          },
                        ]}
                      >
                        {idx + 1}
                      </Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text
                        numberOfLines={1}
                        style={{
                          color: theme.colors.text,
                          fontSize: theme.fontSize.sm,
                          fontWeight: theme.fontWeight.semibold,
                        }}
                      >
                        {title}
                      </Text>
                      <Text
                        numberOfLines={1}
                        style={[
                          styles.tabular,
                          { color: theme.colors.textMuted, fontSize: 11, marginTop: 2 },
                        ]}
                      >
                        {subtitle}
                      </Text>
                    </View>
                    <Text
                      style={[
                        styles.tabular,
                        {
                          color: barFillColor,
                          fontSize: theme.fontSize.sm,
                          fontWeight: theme.fontWeight.semibold,
                        },
                      ]}
                    >
                      {formatCentsToYuan(entry.effectiveCents)}
                    </Text>
                    <AppIcon name="chevron-forward" size={14} color={theme.colors.textMuted} />
                  </Pressable>
                );
              })}
            </View>
          </View>
        ) : null}

        {/* 账户分布（点击下钻对应账户该周期明细） */}
        {accountList.length > 0 ? (
          <View style={{ marginTop: theme.spacing.lg }}>
            <Text
              style={{
                color: theme.colors.textMuted,
                fontSize: theme.fontSize.xs,
                fontWeight: theme.fontWeight.semibold,
                marginBottom: 8,
                paddingHorizontal: 4,
              }}
            >
              账户分布
            </Text>

            <View
              style={[
                styles.card,
                {
                  backgroundColor: theme.colors.surfaceRaised,
                  borderRadius: 14,
                  paddingHorizontal: theme.spacing.lg,
                  paddingVertical: theme.spacing.xs,
                },
              ]}
            >
              {accountList.map((acc, idx) => (
                <Pressable
                  key={acc.accountId}
                  accessibilityRole="button"
                  accessibilityLabel={`查看 ${acc.name} ${kind === 'expense' ? '支出' : '收入'}明细`}
                  onPress={() =>
                    drillDownToSearch({
                      accountId: acc.accountId,
                      title: `${periodTitle} · ${acc.name}`,
                    })
                  }
                  style={({ pressed }) => [
                    styles.accountRow,
                    {
                      borderBottomColor: theme.colors.divider,
                      borderBottomWidth:
                        idx < accountList.length - 1 ? StyleSheet.hairlineWidth : 0,
                    },
                    pressed && { opacity: theme.opacity.pressed },
                  ]}
                >
                  <View style={styles.rankTitleGroup}>
                    <Text
                      numberOfLines={1}
                      style={{
                        flexShrink: 1,
                        color: theme.colors.text,
                        fontSize: theme.fontSize.sm,
                        fontWeight: theme.fontWeight.semibold,
                      }}
                    >
                      {acc.name}
                    </Text>
                    <Text
                      style={{
                        color: theme.colors.textMuted,
                        fontSize: theme.fontSize.xs,
                        marginLeft: theme.spacing.xs,
                      }}
                    >
                      {acc.count} 笔
                    </Text>
                  </View>

                  <View style={styles.rankValueGroup}>
                    <Text
                      style={[
                        styles.tabular,
                        {
                          color: theme.colors.text,
                          fontSize: theme.fontSize.sm,
                          fontWeight: theme.fontWeight.semibold,
                        },
                      ]}
                    >
                      {formatCentsToYuan(acc.totalCents)}
                    </Text>
                    <Text
                      style={[
                        styles.tabular,
                        {
                          color: theme.colors.textMuted,
                          fontSize: theme.fontSize.xs,
                          marginLeft: theme.spacing.sm,
                          minWidth: 42,
                          textAlign: 'right',
                        },
                      ]}
                    >
                      {acc.percentage.toFixed(1)}%
                    </Text>
                    <View style={{ marginLeft: 4 }}>
                      <AppIcon name="chevron-forward" size={14} color={theme.colors.textMuted} />
                    </View>
                  </View>
                </Pressable>
              ))}
            </View>
          </View>
        ) : null}
      </ScrollView>

      {scope !== 'all' ? (
        <PeriodPickerSheet
          visible={periodPickerOpen}
          mode={scope}
          selectedMonthKey={monthKey}
          selectedYear={year}
          onSelectMonth={(nextMonth) => {
            setMonthKey(nextMonth);
            setYear(Number(nextMonth.slice(0, 4)));
          }}
          onSelectYear={(nextYear) => {
            setYear(nextYear);
          }}
          onClose={() => setPeriodPickerOpen(false)}
        />
      ) : null}

      {interactions.overlays}
    </SafeScreen>
  );
}

const styles = StyleSheet.create({
  card: {},
  allHeader: {
    alignItems: 'center',
    paddingVertical: 4,
  },
  periodRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  periodArrow: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  periodCenterBtn: {
    minHeight: 36,
    paddingHorizontal: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  kpiGrid: {
    flexDirection: 'row',
    gap: 8,
  },
  kpiItem: {
    flex: 1,
    alignItems: 'center',
  },
  deltaStrip: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 6,
  },
  deltaChip: {
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  subMetaRow: {
    flexDirection: 'row',
    gap: 8,
  },
  subMetaItem: {
    flex: 1,
    alignItems: 'center',
  },
  highlightFootnote: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 4,
  },
  legendRow: {
    flexDirection: 'row',
    gap: 12,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  legendDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  chartRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
  },
  chartCol: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 6,
  },
  barsWrap: {
    height: CHART_BAR_MAX_HEIGHT,
    flexDirection: 'row',
    alignItems: 'flex-end',
  },
  bar: {
    borderRadius: 3,
  },
  rankRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    gap: 12,
  },
  catBadge: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rankTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  rankTitleGroup: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
  },
  rankValueGroup: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  progressTrack: {
    height: 6,
    overflow: 'hidden',
  },
  progressFill: {
    height: 6,
  },
  subListWrap: {
    paddingHorizontal: 10,
    paddingVertical: 2,
  },
  subCatRow: {
    minHeight: 38,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  viewAllSubBtn: {
    minHeight: 36,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
  },
  topTxRow: {
    minHeight: 52,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 8,
  },
  rankNumBadge: {
    width: 24,
    height: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  accountRow: {
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  tabular: {
    fontVariant: ['tabular-nums'],
  },
});
