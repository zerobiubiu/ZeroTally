/**
 * 约束简报（Workflow B / C）：
 * - 信息层级：主（顶部「按月 / 按年 / 全部」范围切换 + 周期核心指标卡）、次（收支趋势柱图 + 一级分类占比排行）、弱（账户分布与日均/结余率辅助指标）
 * - 交互意图：移除「本月」快捷字样，按月/按年态点击周期标题弹出 PeriodPickerSheet；按年趋势点击单月柱下钻月度分析，全部趋势点击单年柱下钻年度分析
 * - 语义双重编码：柱图与排行均同时呈现文字标签、颜色与精确数值/百分比
 */
import { Stack, useLocalSearchParams } from 'expo-router';
import React, { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useDatabase } from '../src/db/database-context';
import { getScopedAnalytics } from '../src/features/analytics/service';
import type {
  AnalyticsKind,
  AnalyticsScope,
  ScopedAnalyticsReport,
} from '../src/features/analytics/types';
import { PeriodPickerSheet } from '../src/features/transactions/components/PeriodPickerSheet';
import {
  formatMonthTitle,
  getCurrentMonthKey,
  getCurrentYear,
  isValidMonthKey,
  shiftMonthKey,
} from '../src/shared/date/date';
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

const CHART_BAR_MAX_HEIGHT = 96;

export default function AnalyticsScreen(): React.JSX.Element {
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  const { db, revision } = useDatabase();

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

  const handleSwitchScope = (nextScope: AnalyticsScope) => {
    if (nextScope === scope) {
      return;
    }
    if (nextScope === 'year' && scope === 'month') {
      setYear(Number(monthKey.slice(0, 4)));
    } else if (nextScope === 'month' && scope === 'year') {
      setMonthKey(`${year}-${monthKey.slice(5, 7)}`);
    }
    setScope(nextScope);
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

  return (
    <SafeScreen edges={['left', 'right']}>
      <Stack.Screen options={{ title: '账务分析' }} />

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{
          padding: theme.spacing.lg,
          paddingBottom: Math.max(insets.bottom, theme.spacing.lg) + theme.spacing.xl,
        }}
      >
        {/* 周期范围切换：按月 / 按年 / 全部（统一长按震动滑动分段控件） */}
        <SlidingSegmentedControl
          options={SCOPE_OPTIONS}
          value={scope}
          onChange={handleSwitchScope}
          fullWidth
          height={44}
          shape="rounded"
          trackTone="surfaceRaised"
          textSize="sm"
          style={{ marginBottom: theme.spacing.md }}
        />

        {/* 周期切换与核心指标汇总卡 */}
        <View
          style={[
            styles.card,
            theme.elevation.card,
            {
              backgroundColor: theme.colors.surfaceRaised,
              borderRadius: theme.radius.lg,
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

          <View
            style={[
              styles.subMetaRow,
              {
                borderTopColor: theme.colors.border,
                borderTopWidth: theme.borderWidth.hairline,
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
                记账笔数
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
                {report?.summary.transactionCount ?? 0}
              </Text>
            </View>
          </View>
        </View>

        {/* 收支趋势柱图（按月 6 月 / 按年 12 月 / 全部按年） */}
        <View style={{ marginTop: theme.spacing.xl }}>
          <View style={[styles.sectionHeader, { marginBottom: theme.spacing.sm }]}>
            <Text
              style={{
                color: theme.colors.textSecondary,
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
              theme.elevation.card,
              {
                backgroundColor: theme.colors.surfaceRaised,
                borderRadius: theme.radius.lg,
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
                    ? Math.max(4, Math.round((pt.expenseCents / maxTrendCents) * CHART_BAR_MAX_HEIGHT))
                    : 2;
                const incHeight =
                  maxTrendCents > 0 && pt.incomeCents > 0
                    ? Math.max(4, Math.round((pt.incomeCents / maxTrendCents) * CHART_BAR_MAX_HEIGHT))
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
                        backgroundColor: theme.colors.surface,
                        borderRadius: theme.radius.sm,
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
                              pt.expenseCents > 0 ? theme.colors.expense : theme.colors.border,
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
                              pt.incomeCents > 0 ? theme.colors.income : theme.colors.border,
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

        {/* 支出 / 收入分析维度切换（统一长按震动滑动分段控件） */}
        <SlidingSegmentedControl
          options={KIND_OPTIONS}
          value={kind}
          onChange={setKind}
          fullWidth
          height={44}
          shape="rounded"
          trackTone="surfaceRaised"
          textSize="sm"
          style={{ marginTop: theme.spacing.xl }}
        />

        {/* 分类占比排行 */}
        <View style={{ marginTop: theme.spacing.lg }}>
          <Text
            style={{
              color: theme.colors.textSecondary,
              fontSize: theme.fontSize.xs,
              fontWeight: theme.fontWeight.semibold,
              marginBottom: theme.spacing.sm,
              paddingHorizontal: 4,
            }}
          >
            分类排行
          </Text>

          {categoryList.length === 0 ? (
            <EmptyState icon="pie-chart-outline" title={emptyCategoryTitle} />
          ) : (
            <View
              style={[
                styles.card,
                theme.elevation.card,
                {
                  backgroundColor: theme.colors.surfaceRaised,
                  borderRadius: theme.radius.lg,
                  paddingHorizontal: theme.spacing.lg,
                  paddingVertical: theme.spacing.sm,
                },
              ]}
            >
              {categoryList.map((item, idx) => (
                <View
                  key={item.categoryId}
                  style={[
                    styles.rankRow,
                    {
                      borderBottomColor: theme.colors.border,
                      borderBottomWidth:
                        idx < categoryList.length - 1 ? theme.borderWidth.hairline : 0,
                    },
                  ]}
                >
                  <View
                    style={[
                      styles.catBadge,
                      {
                        backgroundColor: badgeBg,
                        borderRadius: theme.radius.full,
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
                              minWidth: 44,
                              textAlign: 'right',
                            },
                          ]}
                        >
                          {item.percentage.toFixed(1)}%
                        </Text>
                      </View>
                    </View>

                    <View
                      style={[
                        styles.progressTrack,
                        {
                          backgroundColor: theme.colors.surface,
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
                </View>
              ))}
            </View>
          )}
        </View>

        {/* 账户分布 */}
        {accountList.length > 0 ? (
          <View style={{ marginTop: theme.spacing.xl }}>
            <Text
              style={{
                color: theme.colors.textSecondary,
                fontSize: theme.fontSize.xs,
                fontWeight: theme.fontWeight.semibold,
                marginBottom: theme.spacing.sm,
                paddingHorizontal: 4,
              }}
            >
              账户分布
            </Text>

            <View
              style={[
                styles.card,
                theme.elevation.card,
                {
                  backgroundColor: theme.colors.surfaceRaised,
                  borderRadius: theme.radius.lg,
                  paddingHorizontal: theme.spacing.lg,
                  paddingVertical: theme.spacing.sm,
                },
              ]}
            >
              {accountList.map((acc, idx) => (
                <View
                  key={acc.accountId}
                  style={[
                    styles.accountRow,
                    {
                      borderBottomColor: theme.colors.border,
                      borderBottomWidth:
                        idx < accountList.length - 1 ? theme.borderWidth.hairline : 0,
                    },
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
                          minWidth: 44,
                          textAlign: 'right',
                        },
                      ]}
                    >
                      {acc.percentage.toFixed(1)}%
                    </Text>
                  </View>
                </View>
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
  subMetaRow: {
    flexDirection: 'row',
    gap: 8,
  },
  subMetaItem: {
    flex: 1,
    alignItems: 'center',
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
    alignItems: 'baseline',
  },
  rankValueGroup: {
    flexDirection: 'row',
    alignItems: 'baseline',
  },
  progressTrack: {
    height: 6,
    overflow: 'hidden',
  },
  progressFill: {
    height: 6,
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
