/**
 * 约束简报（Workflow B / C）：
 * - 极简零破坏搜索页：由明细顶栏轻量搜索图标（及后续账务分析下钻）进入，不影响主明细界面结构
 * - 信息层级：主（顶部原生风搜索栏 + 命中结果按日流水 FlatList 懒加载）、次（单行快捷类型胶囊 + 账户/分类/日期/金额多维筛选弹窗 + 命中统计汇总条）、弱（空态提示与重置动作）
 * - 完整复用：复用 TransactionRow、useTransactionListInteractions（详情浮窗/左滑/退款/编辑/删除）与 DatePickerSheet，所有查询走参数化分页 SQL
 */
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Keyboard,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useDatabase } from '../src/db/database-context';
import { listAccounts } from '../src/features/accounts/service';
import type { Account } from '../src/features/accounts/types';
import { listCategories } from '../src/features/categories/service';
import type { Category } from '../src/features/categories/types';
import { DatePickerSheet } from '../src/features/transactions/components/DatePickerSheet';
import { TransactionRow } from '../src/features/transactions/components/TransactionRow';
import { useTransactionListInteractions } from '../src/features/transactions/components/useTransactionListInteractions';
import {
  countActiveAdvancedFilters,
  DEFAULT_SEARCH_PAGE_SIZE,
  hasAnySearchCondition,
} from '../src/features/transactions/search-rules';
import { searchTransactions } from '../src/features/transactions/service';
import type {
  TransactionListItem,
  TransactionSearchFilter,
  TransactionType,
} from '../src/features/transactions/types';
import {
  formatDaySectionTitle,
  getCurrentMonthKey,
  getCurrentYear,
  getMonthDateRange,
  getTodayIsoDate,
  getYearDateRange,
  isValidIsoDate,
  shiftIsoDate,
  shiftMonthKey,
} from '../src/shared/date/date';
import { hapticLight } from '../src/shared/haptics/haptics';
import {
  formatCentsToYuan,
  parseYuanToCents,
  truncateExcessDecimalsInput,
} from '../src/shared/money/money';
import { AppIcon } from '../src/shared/ui/AppIcon';
import { BottomSheet, type BottomSheetHandle } from '../src/shared/ui/BottomSheet';
import { Button } from '../src/shared/ui/Button';
import { EmptyState } from '../src/shared/ui/EmptyState';
import { SafeScreen } from '../src/shared/ui/SafeScreen';
import { useTheme } from '../src/theme/theme-context';

const TYPE_OPTIONS: readonly { value: TransactionType | 'all'; label: string }[] = [
  { value: 'all', label: '全部' },
  { value: 'expense', label: '支出' },
  { value: 'income', label: '收入' },
  { value: 'transfer', label: '转账' },
  { value: 'refund', label: '退款' },
  { value: 'repayment', label: '还款' },
];

type SearchFlatRow =
  | { kind: 'header'; key: string; occurredOn: string }
  | { kind: 'item'; key: string; item: TransactionListItem; isFirstInDay: boolean; isLastInDay: boolean };

function firstParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function parseTypeParam(raw: string | undefined): TransactionType | 'all' {
  if (
    raw === 'expense' ||
    raw === 'income' ||
    raw === 'transfer' ||
    raw === 'refund' ||
    raw === 'repayment'
  ) {
    return raw;
  }
  return 'all';
}

export default function SearchTransactionsScreen(): React.JSX.Element {
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { db, revision } = useDatabase();

  const params = useLocalSearchParams<{
    keyword?: string | string[];
    type?: string | string[];
    categoryId?: string | string[];
    accountId?: string | string[];
    startDate?: string | string[];
    endDate?: string | string[];
    title?: string | string[];
  }>();

  const initialKeyword = firstParam(params.keyword) ?? '';
  const initialType = parseTypeParam(firstParam(params.type));
  const initialCategoryId = firstParam(params.categoryId) ?? null;
  const initialAccountId = firstParam(params.accountId) ?? null;
  const rawStart = firstParam(params.startDate);
  const rawEnd = firstParam(params.endDate);
  const initialStartDate = rawStart && isValidIsoDate(rawStart) ? rawStart : null;
  const initialEndDate = rawEnd && isValidIsoDate(rawEnd) ? rawEnd : null;
  const customTitle = firstParam(params.title);

  const [keyword, setKeyword] = useState(initialKeyword);
  const [debouncedKeyword, setDebouncedKeyword] = useState(initialKeyword);
  const [selectedType, setSelectedType] = useState<TransactionType | 'all'>(initialType);
  const [categoryId, setCategoryId] = useState<string | null>(initialCategoryId);
  const [accountId, setAccountId] = useState<string | null>(initialAccountId);
  const [startDate, setStartDate] = useState<string | null>(initialStartDate);
  const [endDate, setEndDate] = useState<string | null>(initialEndDate);
  const [minYuanText, setMinYuanText] = useState('');
  const [maxYuanText, setMaxYuanText] = useState('');

  // 高级筛选底部面板草稿态（点「应用」生效，避免边选边高频查库）
  const [filterSheetOpen, setFilterSheetOpen] = useState(false);
  const filterSheetRef = useRef<BottomSheetHandle>(null);
  const [draftAccountId, setDraftAccountId] = useState<string | null>(accountId);
  const [draftCategoryId, setDraftCategoryId] = useState<string | null>(categoryId);
  const [draftStartDate, setDraftStartDate] = useState<string | null>(startDate);
  const [draftEndDate, setDraftEndDate] = useState<string | null>(endDate);
  const [draftMinYuan, setDraftMinYuan] = useState(minYuanText);
  const [draftMaxYuan, setDraftMaxYuan] = useState(maxYuanText);
  const [dateTarget, setDateTarget] = useState<'start' | 'end' | null>(null);

  const [accounts, setAccounts] = useState<Account[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);

  const [items, setItems] = useState<TransactionListItem[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [totalExpenseCents, setTotalExpenseCents] = useState(0);
  const [totalIncomeCents, setTotalIncomeCents] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);

  const requestSeqRef = useRef(0);
  const loadingMoreRef = useRef(false);
  const interactions = useTransactionListInteractions();

  // 输入防抖 160ms，兼顾顺滑键入与即时反馈
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedKeyword(keyword);
    }, 160);
    return () => clearTimeout(timer);
  }, [keyword]);

  useEffect(() => {
    let active = true;
    void (async () => {
      const [accs, cats] = await Promise.all([
        listAccounts(db, { includeArchived: true }),
        listCategories(db, { includeArchived: true }),
      ]);
      if (active) {
        setAccounts(accs);
        setCategories(cats);
      }
    })();
    return () => {
      active = false;
    };
  }, [db, revision]);

  const activeFilter = useMemo<TransactionSearchFilter>(() => {
    const minCents = minYuanText.trim() ? parseYuanToCents(minYuanText.trim()) : null;
    const maxCents = maxYuanText.trim() ? parseYuanToCents(maxYuanText.trim()) : null;
    return {
      keyword: debouncedKeyword,
      types: selectedType === 'all' ? undefined : [selectedType],
      categoryId,
      accountId,
      startDate,
      endDate,
      minAmountCents: minCents,
      maxAmountCents: maxCents,
      limit: DEFAULT_SEARCH_PAGE_SIZE,
    };
  }, [
    debouncedKeyword,
    selectedType,
    categoryId,
    accountId,
    startDate,
    endDate,
    minYuanText,
    maxYuanText,
  ]);

  const advancedFilterCount = useMemo(
    () => countActiveAdvancedFilters(activeFilter),
    [activeFilter]
  );
  const anyConditionActive = useMemo(() => hasAnySearchCondition(activeFilter), [activeFilter]);

  // 首屏及筛选变化时重新查询第 1 页（异步回调内更新状态，避免级联重渲染与闪烁）
  useEffect(() => {
    const seq = ++requestSeqRef.current;
    loadingMoreRef.current = false;

    void (async () => {
      try {
        const page = await searchTransactions(db, { ...activeFilter, offset: 0 });
        if (requestSeqRef.current !== seq) {
          return;
        }
        setItems(page.items);
        setTotalCount(page.totalCount);
        setTotalExpenseCents(page.totalExpenseCents);
        setTotalIncomeCents(page.totalIncomeCents);
        setHasMore(page.hasMore);
        setLoadingMore(false);
      } finally {
        if (requestSeqRef.current === seq) {
          setLoading(false);
        }
      }
    })();
  }, [db, activeFilter, revision]);

  const handleLoadMore = useCallback(() => {
    if (loading || !hasMore || loadingMoreRef.current) {
      return;
    }
    loadingMoreRef.current = true;
    setLoadingMore(true);
    const seq = requestSeqRef.current;
    const nextOffset = items.length;

    void (async () => {
      try {
        const page = await searchTransactions(db, { ...activeFilter, offset: nextOffset });
        if (requestSeqRef.current !== seq) {
          return;
        }
        setItems((prev) => {
          const seen = new Set(prev.map((row) => row.id));
          const merged = [...prev];
          for (const row of page.items) {
            if (!seen.has(row.id)) {
              merged.push(row);
            }
          }
          return merged;
        });
        setTotalCount(page.totalCount);
        setHasMore(page.hasMore);
      } finally {
        if (requestSeqRef.current === seq) {
          loadingMoreRef.current = false;
          setLoadingMore(false);
        }
      }
    })();
  }, [activeFilter, db, hasMore, items.length, loading]);

  const openFilterSheet = () => {
    Keyboard.dismiss();
    hapticLight();
    setDraftAccountId(accountId);
    setDraftCategoryId(categoryId);
    setDraftStartDate(startDate);
    setDraftEndDate(endDate);
    setDraftMinYuan(minYuanText);
    setDraftMaxYuan(maxYuanText);
    setFilterSheetOpen(true);
  };

  const handleApplyDraftFilters = () => {
    hapticLight();
    setAccountId(draftAccountId);
    setCategoryId(draftCategoryId);
    setStartDate(draftStartDate);
    setEndDate(draftEndDate);
    setMinYuanText(draftMinYuan);
    setMaxYuanText(draftMaxYuan);
    filterSheetRef.current?.dismiss();
  };

  const handleResetAll = () => {
    hapticLight();
    setKeyword('');
    setDebouncedKeyword('');
    setSelectedType('all');
    setCategoryId(null);
    setAccountId(null);
    setStartDate(null);
    setEndDate(null);
    setMinYuanText('');
    setMaxYuanText('');
  };

  const applyQuickDateRange = (preset: '7d' | 'month' | '3m' | 'year' | 'clear') => {
    hapticLight();
    const today = getTodayIsoDate();
    if (preset === 'clear') {
      setDraftStartDate(null);
      setDraftEndDate(null);
      return;
    }
    if (preset === '7d') {
      setDraftStartDate(shiftIsoDate(today, -6));
      setDraftEndDate(today);
      return;
    }
    if (preset === 'month') {
      const range = getMonthDateRange(getCurrentMonthKey());
      setDraftStartDate(range.start);
      setDraftEndDate(range.end);
      return;
    }
    if (preset === '3m') {
      const startMonth = shiftMonthKey(getCurrentMonthKey(), -2);
      setDraftStartDate(getMonthDateRange(startMonth).start);
      setDraftEndDate(today);
      return;
    }
    const yearRange = getYearDateRange(getCurrentYear());
    setDraftStartDate(yearRange.start);
    setDraftEndDate(yearRange.end);
  };

  // 将分页加载到的流水扁平化为按日分组的 FlatList 虚拟行，兼顾圆角卡片感与大列表高性能
  const flatRows = useMemo<SearchFlatRow[]>(() => {
    const rows: SearchFlatRow[] = [];
    for (let i = 0; i < items.length; i += 1) {
      const item = items[i]!;
      const prevDate = i > 0 ? items[i - 1]!.occurredOn : null;
      const nextDate = i < items.length - 1 ? items[i + 1]!.occurredOn : null;
      const isFirstInDay = item.occurredOn !== prevDate;
      const isLastInDay = item.occurredOn !== nextDate;

      if (isFirstInDay) {
        rows.push({
          kind: 'header',
          key: `day_${item.occurredOn}`,
          occurredOn: item.occurredOn,
        });
      }
      rows.push({
        kind: 'item',
        key: item.id,
        item,
        isFirstInDay,
        isLastInDay,
      });
    }
    return rows;
  }, [items]);

  const todayIso = getTodayIsoDate();
  const rootCategories = useMemo(
    () => categories.filter((c) => c.parentId === null),
    [categories]
  );

  const selectedAccountName = useMemo(
    () => accounts.find((a) => a.id === accountId)?.name ?? null,
    [accounts, accountId]
  );
  const selectedCategoryName = useMemo(
    () => categories.find((c) => c.id === categoryId)?.name ?? null,
    [categories, categoryId]
  );

  const activeTags = useMemo(() => {
    const tags: { key: string; label: string; onRemove: () => void }[] = [];
    if (selectedAccountName) {
      tags.push({
        key: 'acc',
        label: `账户: ${selectedAccountName}`,
        onRemove: () => setAccountId(null),
      });
    }
    if (selectedCategoryName) {
      tags.push({
        key: 'cat',
        label: `分类: ${selectedCategoryName}`,
        onRemove: () => setCategoryId(null),
      });
    }
    if (startDate || endDate) {
      tags.push({
        key: 'date',
        label: `${startDate ?? '不限'} ~ ${endDate ?? '至今'}`,
        onRemove: () => {
          setStartDate(null);
          setEndDate(null);
        },
      });
    }
    if (minYuanText.trim() || maxYuanText.trim()) {
      tags.push({
        key: 'amt',
        label: `金额: ${minYuanText.trim() || '0'} ~ ${maxYuanText.trim() || '不限'}`,
        onRemove: () => {
          setMinYuanText('');
          setMaxYuanText('');
        },
      });
    }
    return tags;
  }, [
    selectedAccountName,
    selectedCategoryName,
    startDate,
    endDate,
    minYuanText,
    maxYuanText,
  ]);

  return (
    <SafeScreen
      edges={['top', 'left', 'right']}
      topBackgroundColor={theme.colors.surfaceRaised}
      style={{ backgroundColor: theme.colors.surfaceGrouped }}
    >
      <Stack.Screen options={{ headerShown: false }} />

      {/* 顶部搜索导航栏 */}
      <View
        style={[
          styles.topBar,
          {
            backgroundColor: theme.colors.surfaceRaised,
            borderBottomColor: theme.colors.divider,
          },
        ]}
      >
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="返回"
          hitSlop={8}
          onPress={() => {
            hapticLight();
            router.back();
          }}
          style={({ pressed }) => [
            styles.iconBtn,
            pressed && { opacity: theme.opacity.pressed },
          ]}
        >
          <AppIcon name="arrow-back" size={22} color={theme.colors.text} />
        </Pressable>

        <View
          style={[
            styles.searchBox,
            {
              backgroundColor: theme.colors.surfaceGrouped,
              borderRadius: 10,
            },
          ]}
        >
          <AppIcon name="search-outline" size={17} color={theme.colors.placeholder} />
          <TextInput
            accessibilityLabel="搜索账单"
            value={keyword}
            onChangeText={setKeyword}
            autoFocus={!customTitle && !anyConditionActive}
            returnKeyType="search"
            placeholder={customTitle ? `在「${customTitle}」中搜索` : '搜备注、分类或账户'}
            placeholderTextColor={theme.colors.placeholder}
            style={[styles.searchInput, { color: theme.colors.text }]}
          />
          {keyword.length > 0 ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="清空搜索词"
              hitSlop={8}
              onPress={() => {
                hapticLight();
                setKeyword('');
              }}
            >
              <AppIcon name="close-circle" size={16} color={theme.colors.placeholder} />
            </Pressable>
          ) : null}
        </View>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel="多维筛选"
          hitSlop={8}
          onPress={openFilterSheet}
          style={({ pressed }) => [
            styles.filterTriggerBtn,
            {
              backgroundColor:
                advancedFilterCount > 0 ? theme.colors.actionSurface : 'transparent',
              borderRadius: 10,
            },
            pressed && { opacity: theme.opacity.pressed },
          ]}
        >
          <AppIcon
            name="options-outline"
            size={20}
            color={advancedFilterCount > 0 ? theme.colors.action : theme.colors.text}
          />
          {advancedFilterCount > 0 ? (
            <View style={[styles.badgeDot, { backgroundColor: theme.colors.action }]}>
              <Text style={[styles.badgeText, { color: theme.colors.onAction }]}>
                {advancedFilterCount}
              </Text>
            </View>
          ) : null}
        </Pressable>
      </View>

      {/* 快捷类型胶囊栏 + 已选高级筛选标签 */}
      <View style={{ backgroundColor: theme.colors.surfaceRaised, paddingBottom: 10 }}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={styles.typeStrip}
        >
          {TYPE_OPTIONS.map((opt) => {
            const active = selectedType === opt.value;
            return (
              <Pressable
                key={opt.value}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
                onPress={() => {
                  hapticLight();
                  setSelectedType(opt.value);
                }}
                style={({ pressed }) => [
                  styles.typePill,
                  {
                    backgroundColor: active
                      ? theme.colors.actionSurface
                      : theme.colors.chipInactive,
                    borderRadius: 10,
                  },
                  pressed && { opacity: theme.opacity.pressed },
                ]}
              >
                <Text
                  style={{
                    color: active
                      ? theme.colors.actionTextOnSubtle
                      : theme.colors.textSecondary,
                    fontSize: theme.fontSize.xs,
                    fontWeight: active ? theme.fontWeight.semibold : theme.fontWeight.regular,
                  }}
                >
                  {opt.label}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>

        {activeTags.length > 0 ? (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={[styles.typeStrip, { marginTop: 8 }]}
          >
            {activeTags.map((tag) => (
              <Pressable
                key={tag.key}
                accessibilityRole="button"
                accessibilityLabel={`移除筛选 ${tag.label}`}
                onPress={() => {
                  hapticLight();
                  tag.onRemove();
                }}
                style={({ pressed }) => [
                  styles.activeFilterTag,
                  {
                    backgroundColor: theme.colors.actionSurface,
                    borderRadius: 8,
                  },
                  pressed && { opacity: theme.opacity.pressed },
                ]}
              >
                <Text
                  style={{
                    color: theme.colors.actionTextOnSubtle,
                    fontSize: 12,
                    fontWeight: theme.fontWeight.semibold,
                  }}
                >
                  {tag.label}
                </Text>
                <AppIcon name="close" size={13} color={theme.colors.action} />
              </Pressable>
            ))}

            <Pressable
              accessibilityRole="button"
              accessibilityLabel="重置全部筛选"
              onPress={handleResetAll}
              style={({ pressed }) => [
                styles.resetTag,
                pressed && { opacity: theme.opacity.pressed },
              ]}
            >
              <Text style={{ color: theme.colors.textMuted, fontSize: 12 }}>重置</Text>
            </Pressable>
          </ScrollView>
        ) : null}
      </View>

      {/* 命中汇总条 */}
      {!loading && totalCount > 0 ? (
        <View
          style={[
            styles.summaryBar,
            {
              backgroundColor: theme.colors.surfaceGrouped,
            },
          ]}
        >
          <Text style={[styles.tabular, { color: theme.colors.textMuted, fontSize: 12 }]}>
            共 {totalCount} 笔
          </Text>
          <View style={styles.summaryRight}>
            {totalExpenseCents > 0 ? (
              <Text style={[styles.tabular, { color: theme.colors.textSecondary, fontSize: 12 }]}>
                支出 {formatCentsToYuan(totalExpenseCents)}
              </Text>
            ) : null}
            {totalIncomeCents > 0 ? (
              <Text style={[styles.tabular, { color: theme.colors.textSecondary, fontSize: 12 }]}>
                收入 {formatCentsToYuan(totalIncomeCents)}
              </Text>
            ) : null}
          </View>
        </View>
      ) : null}

      {/* 命中结果虚拟化分页列表（触达约 90% 位置时增量加载下一页） */}
      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="small" color={theme.colors.action} />
        </View>
      ) : flatRows.length === 0 ? (
        <View style={[styles.center, { paddingHorizontal: 24 }]}>
          <EmptyState
            icon="search-outline"
            title={anyConditionActive ? '未找到匹配账单' : '暂无账单记录'}
            actionLabel={anyConditionActive ? '清空筛选' : undefined}
            onAction={anyConditionActive ? handleResetAll : undefined}
          />
        </View>
      ) : (
        <FlatList
          data={flatRows}
          keyExtractor={(row) => row.key}
          keyboardShouldPersistTaps="handled"
          onScrollBeginDrag={interactions.closeAllSwipes}
          onEndReached={handleLoadMore}
          onEndReachedThreshold={0.15}
          contentContainerStyle={{
            paddingHorizontal: 16,
            paddingTop: 4,
            paddingBottom: Math.max(insets.bottom, 16) + 20,
          }}
          renderItem={({ item: row }) => {
            if (row.kind === 'header') {
              return (
                <Text
                  style={[
                    styles.dayHeader,
                    { color: theme.colors.textMuted },
                  ]}
                >
                  {formatDaySectionTitle(row.occurredOn, todayIso, { showYear: true })}
                </Text>
              );
            }

            return (
              <View
                style={[
                  styles.itemShell,
                  {
                    backgroundColor: theme.colors.surfaceRaised,
                    borderTopLeftRadius: row.isFirstInDay ? 14 : 0,
                    borderTopRightRadius: row.isFirstInDay ? 14 : 0,
                    borderBottomLeftRadius: row.isLastInDay ? 14 : 0,
                    borderBottomRightRadius: row.isLastInDay ? 14 : 0,
                  },
                ]}
              >
                <TransactionRow
                  item={row.item}
                  onPress={interactions.handleInspect}
                  onEdit={interactions.handleEdit}
                  onRefund={interactions.handleRefund}
                  onDelete={interactions.handleDelete}
                  isSwipeOpen={interactions.openSwipeId === row.item.id}
                  onSwipeOpen={interactions.handleSwipeOpen}
                  onSwipeClose={interactions.handleSwipeClose}
                  showDivider={!row.isLastInDay}
                />
              </View>
            );
          }}
          ListFooterComponent={
            loadingMore ? (
              <View style={styles.footerLoader}>
                <ActivityIndicator size="small" color={theme.colors.action} />
              </View>
            ) : !hasMore && items.length >= DEFAULT_SEARCH_PAGE_SIZE ? (
              <Text style={[styles.footerEnd, { color: theme.colors.placeholder }]}>
                已显示全部 {totalCount} 笔匹配结果
              </Text>
            ) : undefined
          }
        />
      )}

      {/* 多维筛选底部面板（账户 / 分类 / 日期区间 / 金额区间） */}
      <BottomSheet
        ref={filterSheetRef}
        visible={filterSheetOpen}
        onClose={() => setFilterSheetOpen(false)}
        title="多维筛选"
        backdropLabel="关闭筛选面板"
        expandable={false}
        scrollable
        scrollMaxHeight={480}
        avoidKeyboard
        includeBottomInset={false}
        contentContainerStyle={{ padding: 16, gap: 18 }}
        footer={
          <View
            style={[
              styles.sheetFooter,
              {
                borderTopColor: theme.colors.divider,
                paddingBottom: Math.max(insets.bottom, 14),
              },
            ]}
          >
            <Button
              label="重置"
              variant="secondary"
              onPress={() => {
                hapticLight();
                setDraftAccountId(null);
                setDraftCategoryId(null);
                setDraftStartDate(null);
                setDraftEndDate(null);
                setDraftMinYuan('');
                setDraftMaxYuan('');
              }}
              style={styles.flex}
            />
            <Button label="应用筛选" onPress={handleApplyDraftFilters} style={styles.flex} />
          </View>
        }
      >
        {/* 1. 日期区间 */}
        <View>
          <Text style={[styles.sheetSectionLabel, { color: theme.colors.textMuted }]}>日期区间</Text>
          <View style={styles.presetRow}>
            {(
              [
                { key: '7d', label: '近7天' },
                { key: 'month', label: '本月' },
                { key: '3m', label: '近3月' },
                { key: 'year', label: '今年' },
                { key: 'clear', label: '不限' },
              ] as const
            ).map((preset) => (
              <Pressable
                key={preset.key}
                accessibilityRole="button"
                onPress={() => applyQuickDateRange(preset.key)}
                style={({ pressed }) => [
                  styles.smallPill,
                  {
                    backgroundColor: theme.colors.chipInactive,
                    borderRadius: 8,
                  },
                  pressed && { opacity: theme.opacity.pressed },
                ]}
              >
                <Text style={{ color: theme.colors.textSecondary, fontSize: 12 }}>
                  {preset.label}
                </Text>
              </Pressable>
            ))}
          </View>
          <View style={styles.rangeRow}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="选择起始日期"
              onPress={() => {
                Keyboard.dismiss();
                setDateTarget('start');
              }}
              style={({ pressed }) => [
                styles.rangeBox,
                { backgroundColor: theme.colors.surfaceGrouped, borderRadius: 10 },
                pressed && { opacity: theme.opacity.pressed },
              ]}
            >
              <Text
                style={[
                  styles.tabular,
                  {
                    fontSize: 13,
                    color: draftStartDate ? theme.colors.text : theme.colors.placeholder,
                  },
                ]}
              >
                {draftStartDate || '起始日期'}
              </Text>
            </Pressable>
            <Text style={{ color: theme.colors.placeholder }}>至</Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="选择截止日期"
              onPress={() => {
                Keyboard.dismiss();
                setDateTarget('end');
              }}
              style={({ pressed }) => [
                styles.rangeBox,
                { backgroundColor: theme.colors.surfaceGrouped, borderRadius: 10 },
                pressed && { opacity: theme.opacity.pressed },
              ]}
            >
              <Text
                style={[
                  styles.tabular,
                  {
                    fontSize: 13,
                    color: draftEndDate ? theme.colors.text : theme.colors.placeholder,
                  },
                ]}
              >
                {draftEndDate || '截止日期'}
              </Text>
            </Pressable>
          </View>
        </View>

        {/* 2. 金额区间 */}
        <View>
          <Text style={[styles.sheetSectionLabel, { color: theme.colors.textMuted }]}>
            金额范围（元）
          </Text>
          <View style={styles.rangeRow}>
            <TextInput
              accessibilityLabel="最小金额"
              value={draftMinYuan}
              onChangeText={(t) => setDraftMinYuan(truncateExcessDecimalsInput(t))}
              inputMode="decimal"
              keyboardType="decimal-pad"
              placeholder="最低金额"
              placeholderTextColor={theme.colors.placeholder}
              style={[
                styles.rangeInput,
                styles.tabular,
                {
                  backgroundColor: theme.colors.surfaceGrouped,
                  color: theme.colors.text,
                  borderRadius: 10,
                },
              ]}
            />
            <Text style={{ color: theme.colors.placeholder }}>~</Text>
            <TextInput
              accessibilityLabel="最大金额"
              value={draftMaxYuan}
              onChangeText={(t) => setDraftMaxYuan(truncateExcessDecimalsInput(t))}
              inputMode="decimal"
              keyboardType="decimal-pad"
              placeholder="最高金额"
              placeholderTextColor={theme.colors.placeholder}
              style={[
                styles.rangeInput,
                styles.tabular,
                {
                  backgroundColor: theme.colors.surfaceGrouped,
                  color: theme.colors.text,
                  borderRadius: 10,
                },
              ]}
            />
          </View>
        </View>

        {/* 3. 关联账户 */}
        <View>
          <Text style={[styles.sheetSectionLabel, { color: theme.colors.textMuted }]}>账户</Text>
          <View style={styles.wrapChips}>
            <Pressable
              accessibilityRole="button"
              onPress={() => {
                hapticLight();
                setDraftAccountId(null);
              }}
              style={[
                styles.optionChip,
                {
                  backgroundColor:
                    draftAccountId === null
                      ? theme.colors.actionSurface
                      : theme.colors.chipInactive,
                  borderRadius: 10,
                },
              ]}
            >
              <Text
                style={{
                  color:
                    draftAccountId === null
                      ? theme.colors.actionTextOnSubtle
                      : theme.colors.textSecondary,
                  fontSize: 13,
                  fontWeight:
                    draftAccountId === null ? theme.fontWeight.semibold : theme.fontWeight.regular,
                }}
              >
                全部账户
              </Text>
            </Pressable>
            {accounts.map((acc) => {
              const selected = draftAccountId === acc.id;
              return (
                <Pressable
                  key={acc.id}
                  accessibilityRole="button"
                  onPress={() => {
                    hapticLight();
                    setDraftAccountId(selected ? null : acc.id);
                  }}
                  style={[
                    styles.optionChip,
                    {
                      backgroundColor: selected
                        ? theme.colors.actionSurface
                        : theme.colors.chipInactive,
                      borderRadius: 10,
                    },
                  ]}
                >
                  <Text
                    style={{
                      color: selected
                        ? theme.colors.actionTextOnSubtle
                        : theme.colors.textSecondary,
                      fontSize: 13,
                      fontWeight: selected ? theme.fontWeight.semibold : theme.fontWeight.regular,
                    }}
                  >
                    {acc.name}
                    {acc.isArchived ? '（已归档）' : ''}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        {/* 4. 分类（选一级自动覆盖其下二级） */}
        <View>
          <Text style={[styles.sheetSectionLabel, { color: theme.colors.textMuted }]}>分类</Text>
          <View style={styles.wrapChips}>
            <Pressable
              accessibilityRole="button"
              onPress={() => {
                hapticLight();
                setDraftCategoryId(null);
              }}
              style={[
                styles.optionChip,
                {
                  backgroundColor:
                    draftCategoryId === null
                      ? theme.colors.actionSurface
                      : theme.colors.chipInactive,
                  borderRadius: 10,
                },
              ]}
            >
              <Text
                style={{
                  color:
                    draftCategoryId === null
                      ? theme.colors.actionTextOnSubtle
                      : theme.colors.textSecondary,
                  fontSize: 13,
                  fontWeight:
                    draftCategoryId === null ? theme.fontWeight.semibold : theme.fontWeight.regular,
                }}
              >
                全部分类
              </Text>
            </Pressable>
            {rootCategories.map((cat) => {
              const selected = draftCategoryId === cat.id;
              return (
                <Pressable
                  key={cat.id}
                  accessibilityRole="button"
                  onPress={() => {
                    hapticLight();
                    setDraftCategoryId(selected ? null : cat.id);
                  }}
                  style={[
                    styles.optionChip,
                    {
                      backgroundColor: selected
                        ? theme.colors.actionSurface
                        : theme.colors.chipInactive,
                      borderRadius: 10,
                    },
                  ]}
                >
                  <Text
                    style={{
                      color: selected
                        ? theme.colors.actionTextOnSubtle
                        : theme.colors.textSecondary,
                      fontSize: 13,
                      fontWeight: selected ? theme.fontWeight.semibold : theme.fontWeight.regular,
                    }}
                  >
                    {cat.name}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>
      </BottomSheet>

      <DatePickerSheet
        visible={dateTarget !== null}
        selectedDate={
          (dateTarget === 'start' ? draftStartDate : draftEndDate) || getTodayIsoDate()
        }
        onSelect={(iso) => {
          if (dateTarget === 'start') {
            setDraftStartDate(iso);
            if (draftEndDate && iso > draftEndDate) {
              setDraftEndDate(iso);
            }
          } else if (dateTarget === 'end') {
            setDraftEndDate(iso);
            if (draftStartDate && iso < draftStartDate) {
              setDraftStartDate(iso);
            }
          }
          setDateTarget(null);
        }}
        onClose={() => setDateTarget(null)}
      />

      {interactions.overlays}
    </SafeScreen>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 10,
    gap: 8,
    borderBottomWidth: 1,
  },
  iconBtn: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  searchBox: {
    flex: 1,
    height: 38,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  searchInput: {
    flex: 1,
    height: 38,
    fontSize: 14,
    paddingVertical: 0,
    includeFontPadding: false,
  },
  filterTriggerBtn: {
    width: 38,
    height: 38,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  badgeDot: {
    position: 'absolute',
    top: 3,
    right: 3,
    minWidth: 15,
    height: 15,
    borderRadius: 9999,
    paddingHorizontal: 3,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: {
    fontSize: 10,
    fontWeight: '600',
  },
  typeStrip: {
    paddingHorizontal: 16,
    paddingTop: 8,
    gap: 8,
    alignItems: 'center',
  },
  typePill: {
    height: 30,
    paddingHorizontal: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  activeFilterTag: {
    height: 28,
    paddingHorizontal: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  resetTag: {
    height: 28,
    paddingHorizontal: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  summaryBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 4,
  },
  summaryRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dayHeader: {
    fontSize: 12,
    fontWeight: '600',
    paddingHorizontal: 4,
    marginTop: 14,
    marginBottom: 6,
  },
  itemShell: {
    overflow: 'hidden',
  },
  footerLoader: {
    paddingVertical: 16,
    alignItems: 'center',
  },
  footerEnd: {
    textAlign: 'center',
    fontSize: 12,
    paddingVertical: 16,
  },
  sheetSectionLabel: {
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 8,
  },
  presetRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 10,
  },
  smallPill: {
    height: 30,
    paddingHorizontal: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rangeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  rangeBox: {
    flex: 1,
    height: 40,
    paddingHorizontal: 12,
    justifyContent: 'center',
  },
  rangeInput: {
    flex: 1,
    height: 40,
    paddingHorizontal: 12,
    fontSize: 14,
    includeFontPadding: false,
  },
  wrapChips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  optionChip: {
    height: 34,
    paddingHorizontal: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sheetFooter: {
    flexDirection: 'row',
    gap: 10,
    borderTopWidth: 1,
    paddingHorizontal: 16,
    paddingTop: 12,
  },
  tabular: {
    fontVariant: ['tabular-nums'],
  },
});
