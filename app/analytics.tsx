/**
 * 约束简报（Workflow B）：
 * - 信息层级：主（月份切换 + 支出/收入/结余核心指标卡）、次（近 6 月收支趋势柱图 + 分类占比排行）、弱（账户分布与日均/结余率辅助指标）
 * - 交互意图：由明细页顶部月度总览卡点击直达，支持点击 6 月趋势柱快速切月
 * - 语义双重编码：柱图与排行均同时呈现文字标签、颜色与精确数值/百分比
 */
import { Stack, useLocalSearchParams } from 'expo-router';
import React, { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useDatabase } from '../src/db/database-context';
import { getMonthlyAnalytics } from '../src/features/analytics/service';
import type { AnalyticsKind, MonthlyAnalyticsReport } from '../src/features/analytics/types';
import {
  formatMonthTitle,
  getCurrentMonthKey,
  isValidMonthKey,
  shiftMonthKey,
} from '../src/shared/date/date';
import { formatCentsToYuan } from '../src/shared/money/money';
import { AppIcon } from '../src/shared/ui/AppIcon';
import { EmptyState } from '../src/shared/ui/EmptyState';
import { SafeScreen } from '../src/shared/ui/SafeScreen';
import { useTheme } from '../src/theme/theme-context';

function firstParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

const CHART_BAR_MAX_HEIGHT = 96;

export default function AnalyticsScreen(): React.JSX.Element {
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  const { db, revision } = useDatabase();

  const params = useLocalSearchParams<{ month?: string | string[] }>();
  const initialMonth = firstParam(params.month);

  const [monthKey, setMonthKey] = useState<string>(() =>
    initialMonth && isValidMonthKey(initialMonth) ? initialMonth : getCurrentMonthKey()
  );
  const [kind, setKind] = useState<AnalyticsKind>('expense');
  const [report, setReport] = useState<MonthlyAnalyticsReport | null>(null);

  useEffect(() => {
    let active = true;
    void (async () => {
      const data = await getMonthlyAnalytics(db, monthKey);
      if (active) {
        setReport(data);
      }
    })();
    return () => {
      active = false;
    };
  }, [db, monthKey, revision]);

  const maxTrendCents = useMemo(() => {
    if (!report) {
      return 0;
    }
    let peak = 0;
    for (const pt of report.trend6Months) {
      if (pt.expenseCents > peak) peak = pt.expenseCents;
      if (pt.incomeCents > peak) peak = pt.incomeCents;
    }
    return peak;
  }, [report]);

  const isCurrentMonth = monthKey === getCurrentMonthKey();
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
        {/* 月份切换与核心指标汇总卡 */}
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
          <View style={styles.monthRow}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="上一个月"
              onPress={() => setMonthKey((prev) => shiftMonthKey(prev, -1))}
              hitSlop={8}
              style={styles.monthArrow}
            >
              <AppIcon name="chevron-back" size={20} color={theme.colors.text} />
            </Pressable>

            <View style={styles.monthCenter}>
              <Text
                style={{
                  color: theme.colors.text,
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
                  onPress={() => setMonthKey(getCurrentMonthKey())}
                  hitSlop={8}
                  style={{ marginLeft: theme.spacing.sm }}
                >
                  <Text
                    style={{
                      color: theme.colors.action,
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
              onPress={() => setMonthKey((prev) => shiftMonthKey(prev, 1))}
              hitSlop={8}
              style={styles.monthArrow}
            >
              <AppIcon name="chevron-forward" size={20} color={theme.colors.text} />
            </Pressable>
          </View>

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

        {/* 近 6 个月收支趋势 */}
        <View style={{ marginTop: theme.spacing.xl }}>
          <View style={[styles.sectionHeader, { marginBottom: theme.spacing.sm }]}>
            <Text
              style={{
                color: theme.colors.textSecondary,
                fontSize: theme.fontSize.xs,
                fontWeight: theme.fontWeight.semibold,
              }}
            >
              近 6 个月趋势
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
                padding: theme.spacing.lg,
              },
            ]}
          >
            <View style={styles.chartRow}>
              {(report?.trend6Months ?? []).map((pt) => {
                const selected = pt.monthKey === monthKey;
                const expHeight =
                  maxTrendCents > 0 && pt.expenseCents > 0
                    ? Math.max(4, Math.round((pt.expenseCents / maxTrendCents) * CHART_BAR_MAX_HEIGHT))
                    : 2;
                const incHeight =
                  maxTrendCents > 0 && pt.incomeCents > 0
                    ? Math.max(4, Math.round((pt.incomeCents / maxTrendCents) * CHART_BAR_MAX_HEIGHT))
                    : 2;

                return (
                  <Pressable
                    key={pt.monthKey}
                    accessibilityRole="button"
                    accessibilityLabel={`${formatMonthTitle(pt.monthKey)}，支出 ${formatCentsToYuan(pt.expenseCents)}，收入 ${formatCentsToYuan(pt.incomeCents)}`}
                    accessibilityState={{ selected }}
                    onPress={() => setMonthKey(pt.monthKey)}
                    style={[
                      styles.chartCol,
                      selected && {
                        backgroundColor: theme.colors.surface,
                        borderRadius: theme.radius.sm,
                      },
                    ]}
                  >
                    <View style={styles.barsWrap}>
                      <View
                        style={[
                          styles.bar,
                          {
                            height: expHeight,
                            backgroundColor:
                              pt.expenseCents > 0 ? theme.colors.expense : theme.colors.border,
                            opacity: selected ? 1 : 0.72,
                          },
                        ]}
                      />
                      <View
                        style={[
                          styles.bar,
                          {
                            height: incHeight,
                            backgroundColor:
                              pt.incomeCents > 0 ? theme.colors.income : theme.colors.border,
                            opacity: selected ? 1 : 0.72,
                          },
                        ]}
                      />
                    </View>
                    <Text
                      style={{
                        color: selected ? theme.colors.action : theme.colors.textMuted,
                        fontSize: theme.fontSize.xs,
                        fontWeight: selected
                          ? theme.fontWeight.semibold
                          : theme.fontWeight.regular,
                        marginTop: theme.spacing.sm,
                      }}
                    >
                      {pt.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
        </View>

        {/* 支出 / 收入分析维度切换 */}
        <View
          style={[
            styles.segmentBar,
            {
              backgroundColor: theme.colors.surfaceRaised,
              borderRadius: theme.radius.md,
              padding: theme.spacing.xs,
              marginTop: theme.spacing.xl,
            },
          ]}
        >
          {(['expense', 'income'] as const).map((tab) => {
            const selected = kind === tab;
            return (
              <Pressable
                key={tab}
                accessibilityRole="tab"
                accessibilityState={{ selected }}
                onPress={() => setKind(tab)}
                style={[
                  styles.segmentItem,
                  {
                    borderRadius: theme.radius.sm,
                    backgroundColor: selected ? theme.colors.actionSubtle : 'transparent',
                  },
                ]}
              >
                <Text
                  style={{
                    color: selected ? theme.colors.actionTextOnSubtle : theme.colors.textMuted,
                    fontSize: theme.fontSize.sm,
                    fontWeight: selected ? theme.fontWeight.semibold : theme.fontWeight.regular,
                  }}
                >
                  {tab === 'expense' ? '支出构成' : '收入构成'}
                </Text>
              </Pressable>
            );
          })}
        </View>

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
            <EmptyState
              icon="pie-chart-outline"
              title={kind === 'expense' ? '本月暂无支出' : '本月暂无收入'}
            />
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
    </SafeScreen>
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
    gap: 4,
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
    gap: 3,
  },
  bar: {
    width: 10,
    borderRadius: 3,
  },
  segmentBar: {
    flexDirection: 'row',
    gap: 4,
  },
  segmentItem: {
    flex: 1,
    minHeight: 40,
    alignItems: 'center',
    justifyContent: 'center',
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
