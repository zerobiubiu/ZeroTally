/**
 * 约束简报（Workflow B / C）：
 * - 容器归属：顶部安全区与全局共享顶栏由 app/(tabs)/_layout.tsx 统一固定承接，本页专注深玉青总览卡与按日分组账单流水滚动区
 * - 信息层级：主（按月/按年/全部总览卡，按月/按年点击标题弹出周期选择器，点击数据区直达账务分析）、次（按日分组账单明细）、弱（日小计与笔数）
 * - 文案密度：零解释性段落，空状态仅保留简短状态与记账动作按钮
 */
import { useIsFocused, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { RefreshControl, ScrollView } from 'react-native-gesture-handler';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useDatabase } from '../../src/db/database-context';
import { useMainDrawer } from '../../src/features/navigation/drawer-context';
import { MonthlySummaryHeader } from '../../src/features/transactions/components/MonthlySummaryHeader';
import { PeriodPickerSheet } from '../../src/features/transactions/components/PeriodPickerSheet';
import { TransactionRow } from '../../src/features/transactions/components/TransactionRow';
import { useTransactionListInteractions } from '../../src/features/transactions/components/useTransactionListInteractions';
import {
  getAllLedger,
  getMonthlyLedger,
  getYearlyLedger,
} from '../../src/features/transactions/service';
import type {
  DailyTransactionSection,
  LedgerPeriodMode,
  MonthlySummary,
} from '../../src/features/transactions/types';
import {
  formatDaySectionTitle,
  formatMonthTitle,
  getCurrentMonthKey,
  getCurrentYear,
  shiftMonthKey,
} from '../../src/shared/date/date';
import { formatCentsToYuan } from '../../src/shared/money/money';
import { EmptyState } from '../../src/shared/ui/EmptyState';
import { useTheme } from '../../src/theme/theme-context';

interface LedgerViewState {
  summary: MonthlySummary;
  sections: DailyTransactionSection[];
}

const EMPTY_LEDGER_STATE: LedgerViewState = {
  summary: {
    expenseCents: 0,
    incomeCents: 0,
    balanceCents: 0,
    transferCents: 0,
    refundCents: 0,
    transactionCount: 0,
  },
  sections: [],
};

export default function LedgerScreen(): React.JSX.Element {
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const isFocused = useIsFocused();
  const { db, revision } = useDatabase();
  const { isDrawerOpen, ledgerPeriodMode: periodMode } = useMainDrawer();

  const [monthKey, setMonthKey] = useState<string>(() => getCurrentMonthKey());
  const [year, setYear] = useState<number>(() => getCurrentYear());
  const [periodPickerOpen, setPeriodPickerOpen] = useState(false);

  // 响应全局共享顶栏切换「按月 / 按年 / 全部」时联动年月上下文并收起周期弹窗
  const [prevPeriodMode, setPrevPeriodMode] = useState<LedgerPeriodMode>(periodMode);
  if (prevPeriodMode !== periodMode) {
    setPrevPeriodMode(periodMode);
    if (periodPickerOpen) {
      setPeriodPickerOpen(false);
    }
    if (periodMode === 'year' && prevPeriodMode === 'month') {
      setYear(Number(monthKey.slice(0, 4)));
    } else if (periodMode === 'month' && prevPeriodMode === 'year') {
      const monthPart = monthKey.slice(5, 7);
      setMonthKey(`${year}-${monthPart}`);
    }
  }

  const [ledger, setLedger] = useState<LedgerViewState>(EMPTY_LEDGER_STATE);
  const [refreshing, setRefreshing] = useState(false);
  const interactions = useTransactionListInteractions();
  const closeAllSwipes = interactions.closeAllSwipes;

  useEffect(() => {
    closeAllSwipes();
  }, [closeAllSwipes, periodMode]);

  useEffect(() => {
    if (isDrawerOpen) {
      closeAllSwipes();
    }
  }, [closeAllSwipes, isDrawerOpen]);

  const loadLedger = useCallback(async (): Promise<LedgerViewState> => {
    if (periodMode === 'month') {
      const data = await getMonthlyLedger(db, monthKey);
      return { summary: data.summary, sections: data.sections };
    }
    if (periodMode === 'year') {
      const data = await getYearlyLedger(db, year);
      return { summary: data.summary, sections: data.sections };
    }
    const data = await getAllLedger(db);
    return { summary: data.summary, sections: data.sections };
  }, [db, monthKey, periodMode, year]);

  useEffect(() => {
    let active = true;
    void (async () => {
      const data = await loadLedger();
      if (active) {
        setLedger(data);
      }
    })();
    return () => {
      active = false;
    };
  }, [loadLedger, revision]);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      const data = await loadLedger();
      setLedger(data);
    } finally {
      setRefreshing(false);
    }
  }, [loadLedger]);

  const periodLabel =
    periodMode === 'month'
      ? formatMonthTitle(monthKey)
      : periodMode === 'year'
        ? `${year}年`
        : '全部时间';

  const emptyTitle =
    periodMode === 'month'
      ? '本月暂无账目'
      : periodMode === 'year'
        ? `${year}年暂无账目`
        : '暂无账目';

  return (
    <View style={[styles.container, { backgroundColor: theme.colors.surface }]}>
      <ScrollView
        style={styles.scroll}
        onScrollBeginDrag={closeAllSwipes}
        contentContainerStyle={{
          paddingTop: theme.spacing.sm,
          paddingHorizontal: theme.spacing.lg,
          paddingBottom: 100 + insets.bottom,
        }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => void handleRefresh()}
            tintColor={theme.colors.action}
          />
        }
      >
        <MonthlySummaryHeader
          mode={periodMode}
          periodLabel={periodLabel}
          summary={ledger.summary}
          onPrevPeriod={() => {
            if (periodMode === 'month') {
              setMonthKey((prev) => shiftMonthKey(prev, -1));
            } else if (periodMode === 'year') {
              setYear((prev) => prev - 1);
            }
          }}
          onNextPeriod={() => {
            if (periodMode === 'month') {
              setMonthKey((prev) => shiftMonthKey(prev, 1));
            } else if (periodMode === 'year') {
              setYear((prev) => prev + 1);
            }
          }}
          onPressPeriod={() => {
            if (periodMode !== 'all') {
              setPeriodPickerOpen(true);
            }
          }}
          onPressAnalytics={() =>
            router.push({
              pathname: '/analytics',
              params: {
                scope: periodMode,
                month: monthKey,
                year: String(periodMode === 'year' ? year : Number(monthKey.slice(0, 4))),
              },
            })
          }
        />

        {ledger.sections.length === 0 ? (
          <View style={{ marginTop: theme.spacing.xl }}>
            <EmptyState
              icon="receipt-outline"
              title={emptyTitle}
              actionLabel="记一笔"
              onAction={() => router.push('/record')}
            />
          </View>
        ) : (
          <View style={{ marginTop: theme.spacing.xl, gap: theme.spacing.lg }}>
            {ledger.sections.map((section) => (
              <View key={section.occurredOn}>
                <View style={[styles.sectionHeader, { marginBottom: theme.spacing.sm }]}>
                  <Text
                    numberOfLines={1}
                    style={{
                      flexShrink: 1,
                      color: theme.colors.textSecondary,
                      fontSize: theme.fontSize.xs,
                      fontWeight: theme.fontWeight.semibold,
                    }}
                  >
                    {formatDaySectionTitle(section.occurredOn, undefined, {
                      showYear: periodMode === 'all',
                    })}
                  </Text>

                  <View style={styles.sectionTotals}>
                    {section.expenseCents > 0 ? (
                      <Text
                        style={[
                          styles.tabular,
                          { color: theme.colors.textMuted, fontSize: theme.fontSize.xs },
                        ]}
                      >
                        支 {formatCentsToYuan(section.expenseCents)}
                      </Text>
                    ) : null}
                    {section.incomeCents > 0 ? (
                      <Text
                        style={[
                          styles.tabular,
                          { color: theme.colors.textMuted, fontSize: theme.fontSize.xs },
                        ]}
                      >
                        收 {formatCentsToYuan(section.incomeCents)}
                      </Text>
                    ) : null}
                  </View>
                </View>

                <View
                  style={[
                    styles.sectionCard,
                    theme.elevation.card,
                    {
                      backgroundColor: theme.colors.surfaceRaised,
                      borderRadius: theme.radius.lg,
                    },
                  ]}
                >
                  {section.items.map((item, idx) => (
                    <TransactionRow
                      key={item.id}
                      item={item}
                      onPress={interactions.handleInspect}
                      onEdit={interactions.handleEdit}
                      onRefund={interactions.handleRefund}
                      onDelete={interactions.handleDelete}
                      isSwipeOpen={isFocused && !isDrawerOpen && interactions.openSwipeId === item.id}
                      onSwipeOpen={interactions.handleSwipeOpen}
                      onSwipeClose={interactions.handleSwipeClose}
                      showDivider={idx < section.items.length - 1}
                    />
                  ))}
                </View>
              </View>
            ))}
          </View>
        )}
      </ScrollView>

      <PeriodPickerSheet
        visible={periodPickerOpen && periodMode !== 'all'}
        mode={periodMode === 'year' ? 'year' : 'month'}
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

      {interactions.overlays}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scroll: {
    flex: 1,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    paddingHorizontal: 4,
  },
  sectionTotals: {
    flexDirection: 'row',
    gap: 12,
  },
  sectionCard: {
    overflow: 'hidden',
  },
  tabular: {
    fontVariant: ['tabular-nums'],
  },
});
