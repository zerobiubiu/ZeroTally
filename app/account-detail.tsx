/**
 * 约束简报（Workflow B / C）：
 * - 页面结构：顶栏标题 + 大号账户信息卡片（余额 / 银行卡基础信息逐行与一键复制 / 次级动作：平账、编辑、负债额外含还款）+ 下方直排按日分组流水
 * - 首要动作：所有未归档且交易可选账户（资产与负债统一）的首要主按钮均为页面底部悬浮「记一笔」，向上滑动查询历史流水时自动收起隐藏，向下滑动立即显现
 * - 吸顶收起：向上滑动至大卡片离屏时，顶部平滑过渡浮现紧凑吸顶小卡片（余额 + 快捷动作，点按回到顶部重新展开大卡片），不改动 ScrollView 内容高度杜绝抖动
 */
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useRef, useState, type ComponentRef } from 'react';
import {
  Animated,
  Clipboard,
  Easing,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useDatabase } from '../src/db/database-context';
import { SettleBalanceSheet } from '../src/features/accounts/components/SettleBalanceSheet';
import {
  computeDetailCollapseRange,
  resolveFloatingActionVisibility,
} from '../src/features/accounts/detail-scroll-rules';
import {
  describeAccountBalance,
  formatAccountCardCopyText,
  getAccountCategoryMeta,
  supportsCardInfo,
} from '../src/features/accounts/rules';
import { getAccountById } from '../src/features/accounts/service';
import type { Account } from '../src/features/accounts/types';
import { listCategories } from '../src/features/categories/service';
import type { Category } from '../src/features/categories/types';
import { TransactionRow } from '../src/features/transactions/components/TransactionRow';
import { useTransactionListInteractions } from '../src/features/transactions/components/useTransactionListInteractions';
import { groupTransactionsByDay } from '../src/features/transactions/rules';
import {
  listAccountTransactions,
  settleAccountBalance,
} from '../src/features/transactions/service';
import type { TransactionListItem } from '../src/features/transactions/types';
import { formatDaySectionTitle, getTodayIsoDate } from '../src/shared/date/date';
import { hapticLight } from '../src/shared/haptics/haptics';
import { formatCentsToYuan } from '../src/shared/money/money';
import { AppIcon } from '../src/shared/ui/AppIcon';
import { Button } from '../src/shared/ui/Button';
import { EmptyState } from '../src/shared/ui/EmptyState';
import { SafeScreen } from '../src/shared/ui/SafeScreen';
import { useTheme } from '../src/theme/theme-context';

function firstParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export default function AccountDetailScreen(): React.JSX.Element {
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { db, revision, notifyChange } = useDatabase();

  const params = useLocalSearchParams<{ id?: string | string[] }>();
  const accountId = firstParam(params.id) ?? '';

  const [account, setAccount] = useState<Account | null>(null);
  const [transactions, setTransactions] = useState<TransactionListItem[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [settleOpen, setSettleOpen] = useState(false);
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [heroCardHeight, setHeroCardHeight] = useState(196);
  const [miniCardInteractive, setMiniCardInteractive] = useState(false);
  const [fabVisible, setFabVisible] = useState(true);

  const scrollViewRef = useRef<ComponentRef<typeof Animated.ScrollView>>(null);
  const [scrollY] = useState(() => new Animated.Value(0));
  const [fabAnim] = useState(() => new Animated.Value(1));
  const prevScrollYRef = useRef(0);
  const accumulatedDeltaYRef = useRef(0);
  const fabVisibleRef = useRef(true);
  const miniInteractiveRef = useRef(false);
  const collapseRangeRef = useRef(computeDetailCollapseRange(196));

  const interactions = useTransactionListInteractions();

  const collapseRange = useMemo(
    () => computeDetailCollapseRange(heroCardHeight),
    [heroCardHeight]
  );

  useEffect(() => {
    collapseRangeRef.current = collapseRange;
  }, [collapseRange]);

  useEffect(() => {
    if (!accountId) {
      return;
    }
    let active = true;
    void (async () => {
      const [acc, txs, cats] = await Promise.all([
        getAccountById(db, accountId),
        listAccountTransactions(db, accountId, 1000),
        listCategories(db),
      ]);
      if (active) {
        setAccount(acc);
        setTransactions(txs);
        setCategories(cats);
      }
    })();
    return () => {
      active = false;
    };
  }, [db, accountId, revision]);

  useEffect(() => {
    if (!copiedField) {
      return;
    }
    const timer = setTimeout(() => setCopiedField(null), 1500);
    return () => clearTimeout(timer);
  }, [copiedField]);

  const animateFabVisibility = useCallback(
    (nextVisible: boolean) => {
      if (fabVisibleRef.current === nextVisible) {
        return;
      }
      fabVisibleRef.current = nextVisible;
      setFabVisible(nextVisible);
      if (nextVisible) {
        Animated.spring(fabAnim, {
          toValue: 1,
          useNativeDriver: true,
          stiffness: 360,
          damping: 28,
          mass: 0.85,
        }).start();
      } else {
        Animated.timing(fabAnim, {
          toValue: 0,
          duration: 165,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }).start();
      }
    },
    [fabAnim]
  );

  const [onAnimatedScroll] = useState(() =>
    Animated.event([{ nativeEvent: { contentOffset: { y: scrollY } } }], {
      useNativeDriver: true,
    })
  );

  useEffect(() => {
    const listenerId = scrollY.addListener(({ value: y }) => {
      // 1. 底部悬浮「记一笔」显隐判定
      const nextFab = resolveFloatingActionVisibility({
        scrollY: y,
        prevScrollY: prevScrollYRef.current,
        currentlyVisible: fabVisibleRef.current,
        accumulatedDeltaY: accumulatedDeltaYRef.current,
      });
      prevScrollYRef.current = y;
      accumulatedDeltaYRef.current = nextFab.accumulatedDeltaY;
      if (nextFab.visible !== fabVisibleRef.current) {
        animateFabVisibility(nextFab.visible);
      }

      // 2. 吸顶小卡片交互开关（跨过可见阈值才切换，避免滚动期高频重渲染）
      const shouldEnableMini = y >= collapseRangeRef.current.startY + 12;
      if (shouldEnableMini !== miniInteractiveRef.current) {
        miniInteractiveRef.current = shouldEnableMini;
        setMiniCardInteractive(shouldEnableMini);
      }
    });
    return () => {
      scrollY.removeListener(listenerId);
    };
  }, [scrollY, animateFabVisibility]);

  const sections = useMemo(() => groupTransactionsByDay(transactions), [transactions]);
  const todayIso = getTodayIsoDate();
  const showYearInSections = useMemo(
    () => transactions.some((item) => item.occurredOn.slice(0, 4) !== todayIso.slice(0, 4)),
    [transactions, todayIso]
  );

  const handleCopy = (field: string, value: string) => {
    Clipboard.setString(value);
    hapticLight();
    setCopiedField(field);
  };

  const handleExpandHeroCard = () => {
    hapticLight();
    scrollViewRef.current?.scrollTo({ y: 0, animated: true });
    animateFabVisibility(true);
  };

  if (!account) {
    return (
      <SafeScreen edges={['left', 'right']}>
        <Stack.Screen options={{ title: '账户详情' }} />
        <View style={styles.center}>
          <Text style={{ color: theme.colors.textMuted, fontSize: theme.fontSize.base }}>
            账户不存在
          </Text>
        </View>
      </SafeScreen>
    );
  }

  const categoryMeta = getAccountCategoryMeta(account.category);
  const balanceInfo = describeAccountBalance(account);
  const isBankCardType = supportsCardInfo(account.category);
  const showFloatingRecord = !account.isArchived && account.isSelectable;
  const isActiveLiability = account.kind === 'liability' && !account.isArchived;

  const metaParts = [categoryMeta.label];
  if (!account.includeInTotalAssets && !account.includeInNetWorth) {
    metaParts.push('不计入统计');
  } else if (!account.includeInNetWorth) {
    metaParts.push('不计入净资产');
  } else if (!account.includeInTotalAssets) {
    metaParts.push('不计入总资产');
  }
  if (!account.isSelectable && !account.isArchived) {
    metaParts.push('不可选');
  }
  if (account.isArchived) {
    metaParts.push('已归档');
  }

  const cardInfoRows: { key: string; label: string; value: string }[] = [];
  if (isBankCardType) {
    const hasAnyBankExtra = Boolean(
      account.cardNumber || account.bankName || account.bankBranch || account.openedOn
    );
    if (hasAnyBankExtra) {
      cardInfoRows.push({ key: 'name', label: '名称', value: account.name });
      if (account.cardNumber) {
        cardInfoRows.push({ key: 'cardNumber', label: '卡号', value: account.cardNumber });
      }
      if (account.bankName) {
        cardInfoRows.push({ key: 'bankName', label: '银行', value: account.bankName });
      }
      if (account.bankBranch) {
        cardInfoRows.push({ key: 'bankBranch', label: '开户行', value: account.bankBranch });
      }
      if (account.openedOn) {
        cardInfoRows.push({ key: 'openedOn', label: '开户日期', value: account.openedOn });
      }
    }
  }

  const miniCardOpacity = scrollY.interpolate({
    inputRange: [collapseRange.startY, collapseRange.endY],
    outputRange: [0, 1],
    extrapolate: 'clamp',
  });
  const miniCardTranslateY = scrollY.interpolate({
    inputRange: [collapseRange.startY, collapseRange.endY],
    outputRange: [-14, 0],
    extrapolate: 'clamp',
  });
  const heroCardOpacity = scrollY.interpolate({
    inputRange: [Math.max(0, collapseRange.startY - 24), collapseRange.endY],
    outputRange: [1, 0.35],
    extrapolate: 'clamp',
  });

  const fabTranslateY = fabAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [96, 0],
  });
  const fabScale = fabAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0.92, 1],
  });

  const handleOpenRepayment = () => {
    hapticLight();
    router.push({ pathname: '/repayment', params: { liabilityAccountId: account.id } });
  };

  const handleOpenRecord = () => {
    hapticLight();
    router.push({ pathname: '/record', params: { accountId: account.id } });
  };

  return (
    <SafeScreen edges={['left', 'right']}>
      <Stack.Screen options={{ title: account.name }} />

      <View style={styles.rootWrap}>
        <Animated.ScrollView
          ref={scrollViewRef}
          style={styles.flex}
          keyboardShouldPersistTaps="handled"
          scrollEventThrottle={16}
          onScrollBeginDrag={interactions.closeAllSwipes}
          onScroll={onAnimatedScroll}
          contentContainerStyle={{
            padding: theme.spacing.lg,
            paddingBottom:
              Math.max(insets.bottom, theme.spacing.lg) + (showFloatingRecord ? 88 : theme.spacing.xl),
          }}
        >
          {/* 顶部账户大卡片：自然随列表上滑并在离屏时过渡为吸顶小卡片 */}
          <Animated.View
            onLayout={(e) => {
              const h = Math.round(e.nativeEvent.layout.height);
              if (h > 0 && Math.abs(h - heroCardHeight) > 2) {
                setHeroCardHeight(h);
              }
            }}
            style={[
              theme.elevation.card,
              {
                opacity: heroCardOpacity,
                backgroundColor: theme.colors.surfaceRaised,
                borderRadius: theme.radius.lg,
                padding: theme.spacing.lg,
              },
            ]}
          >
            <View style={styles.heroTop}>
              <View
                style={[
                  styles.iconCircle,
                  {
                    backgroundColor:
                      account.kind === 'liability'
                        ? theme.colors.warningSubtle
                        : theme.colors.actionSubtle,
                    borderRadius: theme.radius.md,
                  },
                ]}
              >
                <AppIcon
                  name={account.icon}
                  size={22}
                  color={
                    account.kind === 'liability'
                      ? theme.colors.warningTextOnSubtle
                      : theme.colors.actionTextOnSubtle
                  }
                />
              </View>
              <View style={styles.flex}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="复制账户名称"
                  onPress={() => handleCopy('heroName', account.name)}
                  style={({ pressed }) => [
                    styles.nameRow,
                    pressed && { opacity: theme.opacity.pressed },
                  ]}
                >
                  <Text
                    numberOfLines={1}
                    style={{
                      color: theme.colors.text,
                      fontSize: theme.fontSize.lg,
                      fontWeight: theme.fontWeight.semibold,
                      flexShrink: 1,
                    }}
                  >
                    {account.name}
                  </Text>
                  {copiedField === 'heroName' ? (
                    <Text
                      style={{
                        color: theme.colors.action,
                        fontSize: theme.fontSize.xs,
                        fontWeight: theme.fontWeight.semibold,
                        marginLeft: 6,
                      }}
                    >
                      已复制
                    </Text>
                  ) : null}
                </Pressable>
                <Text
                  numberOfLines={1}
                  style={{
                    color: theme.colors.textMuted,
                    fontSize: theme.fontSize.xs,
                    marginTop: 2,
                  }}
                >
                  {metaParts.join(' · ')}
                </Text>
              </View>
            </View>

            <View style={{ marginTop: theme.spacing.lg }}>
              <Text style={{ color: theme.colors.textMuted, fontSize: theme.fontSize.xs }}>
                {balanceInfo.caption}
              </Text>
              <Text
                numberOfLines={1}
                adjustsFontSizeToFit
                style={[
                  styles.tabular,
                  {
                    color: balanceInfo.isDebt ? theme.colors.expense : theme.colors.text,
                    fontSize: theme.fontSize.hero,
                    fontWeight: theme.fontWeight.semibold,
                    marginTop: theme.spacing.xs,
                  },
                ]}
              >
                {balanceInfo.amountText}
              </Text>
            </View>

            {/* 银行卡基础信息：逐行点按复制 + 一键复制全部 */}
            {cardInfoRows.length > 0 ? (
              <View
                style={{
                  marginTop: theme.spacing.md,
                  borderTopColor: theme.colors.border,
                  borderTopWidth: theme.borderWidth.hairline,
                  paddingTop: theme.spacing.sm,
                }}
              >
                <View style={styles.cardInfoHeader}>
                  <Text style={{ color: theme.colors.textMuted, fontSize: theme.fontSize.xs }}>
                    银行卡信息
                  </Text>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="复制全部银行卡信息"
                    hitSlop={8}
                    onPress={() => handleCopy('allCardInfo', formatAccountCardCopyText(account))}
                    style={({ pressed }) => [
                      styles.copyAllBtn,
                      pressed && { opacity: theme.opacity.pressed },
                    ]}
                  >
                    <Text
                      style={{
                        color: theme.colors.action,
                        fontSize: theme.fontSize.xs,
                        fontWeight: theme.fontWeight.semibold,
                      }}
                    >
                      {copiedField === 'allCardInfo' ? '已复制全部' : '复制全部'}
                    </Text>
                  </Pressable>
                </View>
                {cardInfoRows.map((row) => (
                  <Pressable
                    key={row.key}
                    accessibilityRole="button"
                    accessibilityLabel={`复制${row.label}`}
                    onPress={() => handleCopy(row.key, row.value)}
                    style={({ pressed }) => [
                      styles.infoRow,
                      pressed && { opacity: theme.opacity.pressed },
                    ]}
                  >
                    <Text
                      style={{
                        width: 64,
                        color: theme.colors.textMuted,
                        fontSize: theme.fontSize.sm,
                      }}
                    >
                      {row.label}
                    </Text>
                    <Text
                      numberOfLines={1}
                      style={[
                        row.key === 'cardNumber' ? styles.tabular : null,
                        {
                          flex: 1,
                          color: theme.colors.text,
                          fontSize: theme.fontSize.sm,
                        },
                      ]}
                    >
                      {row.value}
                    </Text>
                    {copiedField === row.key ? (
                      <Text
                        style={{
                          color: theme.colors.action,
                          fontSize: theme.fontSize.xs,
                          fontWeight: theme.fontWeight.semibold,
                        }}
                      >
                        已复制
                      </Text>
                    ) : (
                      <AppIcon name="copy-outline" size={16} color={theme.colors.textMuted} />
                    )}
                  </Pressable>
                ))}
              </View>
            ) : null}

            {account.note ? (
              <Text
                style={{
                  color: theme.colors.textSecondary,
                  fontSize: theme.fontSize.sm,
                  marginTop: theme.spacing.md,
                }}
              >
                {account.note}
              </Text>
            ) : null}

            {/* 卡片内保留次级操作行（首要「记一笔」已上提为底部动态悬浮主按钮） */}
            <View style={[styles.actionsRow, { marginTop: theme.spacing.lg }]}>
              {isActiveLiability ? (
                <Button
                  label="还款"
                  size="sm"
                  variant="secondary"
                  onPress={handleOpenRepayment}
                  style={styles.actionBtn}
                />
              ) : null}
              {!account.isArchived ? (
                <Button
                  label="平账"
                  size="sm"
                  variant="secondary"
                  onPress={() => {
                    hapticLight();
                    setSettleOpen(true);
                  }}
                  style={styles.actionBtn}
                />
              ) : null}
              <Button
                label="编辑"
                size="sm"
                variant="secondary"
                onPress={() =>
                  router.push({ pathname: '/account-form', params: { id: account.id } })
                }
                style={styles.actionBtn}
              />
            </View>
          </Animated.View>

          {/* 流水直排：按日分组，无独立分区标题 */}
          {transactions.length === 0 ? (
            <View style={{ marginTop: theme.spacing.xl }}>
              <EmptyState icon="swap-horizontal-outline" title="暂无流水" />
            </View>
          ) : (
            <View style={{ marginTop: theme.spacing.lg, gap: theme.spacing.lg }}>
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
                      {formatDaySectionTitle(section.occurredOn, todayIso, {
                        showYear: showYearInSections,
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
                      styles.listCard,
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
                        perspectiveAccountId={account.id}
                        onPress={interactions.handleInspect}
                        onEdit={interactions.handleEdit}
                        onRefund={interactions.handleRefund}
                        onDelete={interactions.handleDelete}
                        isSwipeOpen={interactions.openSwipeId === item.id}
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
        </Animated.ScrollView>

        {/* 上滑后吸顶收起的紧凑小卡片（点按余额区平滑回顶展开大卡片） */}
        <Animated.View
          pointerEvents={miniCardInteractive ? 'auto' : 'none'}
          style={[
            styles.miniCardWrap,
            theme.elevation.card,
            {
              backgroundColor: theme.colors.surfaceRaised,
              borderBottomColor: theme.colors.border,
              borderBottomWidth: theme.borderWidth.hairline,
              opacity: miniCardOpacity,
              transform: [{ translateY: miniCardTranslateY }],
            },
          ]}
        >
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="回到顶部展开账户详情"
            onPress={handleExpandHeroCard}
            style={({ pressed }) => [
              styles.miniCardLeft,
              pressed && { opacity: theme.opacity.pressed },
            ]}
          >
            <View
              style={[
                styles.miniIconCircle,
                {
                  backgroundColor:
                    account.kind === 'liability'
                      ? theme.colors.warningSubtle
                      : theme.colors.actionSubtle,
                  borderRadius: theme.radius.sm,
                },
              ]}
            >
              <AppIcon
                name={account.icon}
                size={16}
                color={
                  account.kind === 'liability'
                    ? theme.colors.warningTextOnSubtle
                    : theme.colors.actionTextOnSubtle
                }
              />
            </View>
            <View style={styles.miniBalanceCol}>
              <Text
                numberOfLines={1}
                style={{ color: theme.colors.textMuted, fontSize: 11 }}
              >
                {balanceInfo.caption}
              </Text>
              <Text
                numberOfLines={1}
                style={[
                  styles.tabular,
                  {
                    color: balanceInfo.isDebt ? theme.colors.expense : theme.colors.text,
                    fontSize: theme.fontSize.base,
                    fontWeight: theme.fontWeight.semibold,
                  },
                ]}
              >
                {balanceInfo.amountText}
              </Text>
            </View>
          </Pressable>

          <View style={styles.miniCardActions}>
            {isActiveLiability ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="负债还款"
                onPress={handleOpenRepayment}
                style={({ pressed }) => [
                  styles.miniPillBtn,
                  {
                    backgroundColor: theme.colors.actionSubtle,
                    borderRadius: theme.radius.full,
                  },
                  pressed && { opacity: theme.opacity.pressed },
                ]}
              >
                <Text
                  style={{
                    color: theme.colors.actionTextOnSubtle,
                    fontSize: theme.fontSize.xs,
                    fontWeight: theme.fontWeight.semibold,
                  }}
                >
                  还款
                </Text>
              </Pressable>
            ) : null}
            {!account.isArchived ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="平账"
                onPress={() => {
                  hapticLight();
                  setSettleOpen(true);
                }}
                style={({ pressed }) => [
                  styles.miniPillBtn,
                  {
                    backgroundColor: theme.colors.surface,
                    borderColor: theme.colors.borderStrong,
                    borderWidth: theme.borderWidth.hairline,
                    borderRadius: theme.radius.full,
                  },
                  pressed && { opacity: theme.opacity.pressed },
                ]}
              >
                <Text
                  style={{
                    color: theme.colors.textSecondary,
                    fontSize: theme.fontSize.xs,
                    fontWeight: theme.fontWeight.semibold,
                  }}
                >
                  平账
                </Text>
              </Pressable>
            ) : null}
          </View>
        </Animated.View>

        {/* 页面最下方悬浮首要主按钮「记一笔」：上滑浏览历史收起隐藏，下滑立即出现 */}
        {showFloatingRecord ? (
          <View
            pointerEvents="box-none"
            style={[
              styles.floatingBarContainer,
              {
                bottom: Math.max(insets.bottom, theme.spacing.lg) + 6,
              },
            ]}
          >
            <Animated.View
              pointerEvents={fabVisible ? 'auto' : 'none'}
              style={{
                opacity: fabAnim,
                transform: [{ translateY: fabTranslateY }, { scale: fabScale }],
              }}
            >
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`在${account.name}记一笔`}
                onPress={handleOpenRecord}
                style={({ pressed }) => [
                  styles.floatingRecordBtn,
                  theme.elevation.floating,
                  {
                    backgroundColor: theme.colors.action,
                    borderRadius: theme.radius.full,
                  },
                  pressed && { opacity: theme.opacity.pressed },
                ]}
              >
                <AppIcon name="add" size={20} color={theme.colors.onAction} />
                <Text
                  style={{
                    color: theme.colors.onAction,
                    fontSize: theme.fontSize.base,
                    fontWeight: theme.fontWeight.semibold,
                    marginLeft: theme.spacing.xs,
                  }}
                >
                  记一笔
                </Text>
              </Pressable>
            </Animated.View>
          </View>
        ) : null}
      </View>

      <SettleBalanceSheet
        visible={settleOpen && !account.isArchived}
        account={account}
        categories={categories}
        onClose={() => setSettleOpen(false)}
        onSubmit={async ({ targetBalanceCents, generateRecord, categoryId }) => {
          await settleAccountBalance(db, account.id, targetBalanceCents, {
            generateRecord,
            categoryId,
          });
          notifyChange();
        }}
      />

      {interactions.overlays}
    </SafeScreen>
  );
}

const styles = StyleSheet.create({
  rootWrap: {
    flex: 1,
    position: 'relative',
  },
  flex: {
    flex: 1,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  iconCircle: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  cardInfoHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 2,
  },
  copyAllBtn: {
    paddingVertical: 2,
    paddingHorizontal: 4,
  },
  infoRow: {
    minHeight: 36,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  actionsRow: {
    flexDirection: 'row',
    gap: 8,
  },
  actionBtn: {
    flex: 1,
  },
  listCard: {
    overflow: 'hidden',
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 4,
  },
  sectionTotals: {
    flexDirection: 'row',
    gap: 8,
  },
  miniCardWrap: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 10,
    minHeight: 56,
    paddingHorizontal: 16,
    paddingVertical: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  miniCardLeft: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  miniIconCircle: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  miniBalanceCol: {
    flex: 1,
    minWidth: 0,
  },
  miniCardActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  miniPillBtn: {
    minHeight: 32,
    paddingHorizontal: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  floatingBarContainer: {
    position: 'absolute',
    left: 0,
    right: 0,
    zIndex: 15,
    alignItems: 'center',
  },
  floatingRecordBtn: {
    minWidth: 196,
    height: 50,
    paddingHorizontal: 28,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabular: {
    fontVariant: ['tabular-nums'],
  },
});
