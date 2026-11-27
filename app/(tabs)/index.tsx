/**
 * 约束简报（Workflow B / C）：
 * - 容器归属：顶部安全区与全局共享顶栏由 app/(tabs)/_layout.tsx 统一固定承接，本页专注深玉青总览卡与按日分组账单流水滚动区
 * - 信息层级：主（按月/按年/全部总览卡，按月/按年点击标题弹出周期选择器，点击数据区直达账务分析）、次（按日分组账单明细）、弱（日小计与笔数）
 * - 懒加载分页：总览数据由 SQLite 实时聚合，明细列表按 40 条/页增量读取，滑动抵达内容高度 90% 时自动向下拉取下一页，兼顾超长账本性能与跟手横滑体验
 */
import { useIsFocused, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { RefreshControl, ScrollView } from 'react-native-gesture-handler';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useDatabase } from '../../src/db/database-context';
import { useMainDrawer } from '../../src/features/navigation/drawer-context';
import { MonthlySummaryHeader } from '../../src/features/transactions/components/MonthlySummaryHeader';
import { PeriodPickerSheet } from '../../src/features/transactions/components/PeriodPickerSheet';
import { TransactionRow } from '../../src/features/transactions/components/TransactionRow';
import { useTransactionListInteractions } from '../../src/features/transactions/components/useTransactionListInteractions';
import {
  DEFAULT_LEDGER_PAGE_SIZE,
  mergePaginatedTransactions,
  shouldTriggerLazyLoadMore,
} from '../../src/features/transactions/pagination-rules';
import { groupTransactionsByDay } from '../../src/features/transactions/rules';
import { getPeriodLedgerPage } from '../../src/features/transactions/service';
import type {
  LedgerPeriodMode,
  MonthlySummary,
  TransactionListItem,
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

const EMPTY_SUMMARY: MonthlySummary = {
  expenseCents: 0,
  incomeCents: 0,
  balanceCents: 0,
  transferCents: 0,
  refundCents: 0,
  transactionCount: 0,
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

  const [summary, setSummary] = useState<MonthlySummary>(EMPTY_SUMMARY);
  const [items, setItems] = useState<TransactionListItem[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const requestSeqRef = useRef(0);
  const lastPeriodSignatureRef = useRef('');
  const loadedCountRef = useRef(0);
  const hasMoreRef = useRef(false);
  const loadingMoreRef = useRef(false);
  const viewportHeightRef = useRef(0);
  const contentHeightRef = useRef(0);
  const scrollOffsetYRef = useRef(0);

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

  const periodSignature = `${periodMode}:${periodMode === 'month' ? monthKey : periodMode === 'year' ? year : 'all'}`;

  useEffect(() => {
    const seq = ++requestSeqRef.current;
    const isSamePeriod = lastPeriodSignatureRef.current === periodSignature;
    lastPeriodSignatureRef.current = periodSignature;
    // 同周期内数据变更（编辑/删除/新增）时保留已展开页数，切换周期时重置回首页 40 条
    const initialLimit = isSamePeriod
      ? Math.max(DEFAULT_LEDGER_PAGE_SIZE, loadedCountRef.current)
      : DEFAULT_LEDGER_PAGE_SIZE;

    loadingMoreRef.current = false;

    void (async () => {
      const page = await getPeriodLedgerPage(db, {
        mode: periodMode,
        monthKey,
        year,
        limit: initialLimit,
        offset: 0,
      });
      if (requestSeqRef.current !== seq) {
        return;
      }
      loadedCountRef.current = page.items.length;
      hasMoreRef.current = page.hasMore;
      setSummary(page.summary);
      setItems(page.items);
      setHasMore(page.hasMore);
      setLoadingMore(false);
    })();
  }, [db, monthKey, periodMode, periodSignature, revision, year]);

  const loadNextPage = useCallback(() => {
    if (!hasMoreRef.current || loadingMoreRef.current) {
      return;
    }
    const seq = requestSeqRef.current;
    loadingMoreRef.current = true;
    setLoadingMore(true);

    void (async () => {
      try {
        const page = await getPeriodLedgerPage(db, {
          mode: periodMode,
          monthKey,
          year,
          limit: DEFAULT_LEDGER_PAGE_SIZE,
          offset: loadedCountRef.current,
        });
        if (requestSeqRef.current !== seq) {
          return;
        }
        setSummary(page.summary);
        setItems((prev) => {
          const merged = mergePaginatedTransactions(prev, page.items);
          loadedCountRef.current = merged.length;
          return merged;
        });
        hasMoreRef.current = page.hasMore;
        setHasMore(page.hasMore);
      } finally {
        if (requestSeqRef.current === seq) {
          loadingMoreRef.current = false;
          setLoadingMore(false);
        }
      }
    })();
  }, [db, monthKey, periodMode, year]);

  const checkLazyLoad = useCallback(
    (offsetY = scrollOffsetYRef.current) => {
      if (
        shouldTriggerLazyLoadMore({
          contentOffsetY: offsetY,
          layoutHeight: viewportHeightRef.current,
          contentHeight: contentHeightRef.current,
          hasMore: hasMoreRef.current,
          loadingMore: loadingMoreRef.current,
        })
      ) {
        loadNextPage();
      }
    },
    [loadNextPage]
  );

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    const seq = ++requestSeqRef.current;
    loadingMoreRef.current = false;
    try {
      const page = await getPeriodLedgerPage(db, {
        mode: periodMode,
        monthKey,
        year,
        limit: DEFAULT_LEDGER_PAGE_SIZE,
        offset: 0,
      });
      if (requestSeqRef.current !== seq) {
        return;
      }
      loadedCountRef.current = page.items.length;
      hasMoreRef.current = page.hasMore;
      setSummary(page.summary);
      setItems(page.items);
      setHasMore(page.hasMore);
      setLoadingMore(false);
    } finally {
      setRefreshing(false);
    }
  }, [db, monthKey, periodMode, year]);

  const sections = useMemo(() => groupTransactionsByDay(items), [items]);

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
        scrollEventThrottle={32}
        onLayout={(e) => {
          viewportHeightRef.current = e.nativeEvent.layout.height;
          checkLazyLoad();
        }}
        onContentSizeChange={(_, h) => {
          contentHeightRef.current = h;
          checkLazyLoad();
        }}
        onScroll={(e) => {
          const y = e.nativeEvent.contentOffset.y;
          scrollOffsetYRef.current = y;
          checkLazyLoad(y);
        }}
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
          summary={summary}
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

        {sections.length === 0 ? (
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
            {sections.map((section) => (
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

            {loadingMore ? (
              <View style={styles.lazyFooter}>
                <ActivityIndicator size="small" color={theme.colors.action} />
              </View>
            ) : !hasMore && items.length >= DEFAULT_LEDGER_PAGE_SIZE ? (
              <Text style={[styles.lazyEndText, { color: theme.colors.placeholder }]}>
                已加载全部 {summary.transactionCount} 笔账目
              </Text>
            ) : null}
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
  lazyFooter: {
    paddingVertical: 12,
    alignItems: 'center',
  },
  lazyEndText: {
    textAlign: 'center',
    fontSize: 12,
    paddingVertical: 8,
  },
  tabular: {
    fontVariant: ['tabular-nums'],
  },
});
