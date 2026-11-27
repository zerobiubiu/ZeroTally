/**
 * 约束简报（Workflow B / C）：
 * - 参考「记一笔」页面（app/record.tsx）采用 transparentModal 全屏滑动卡片 + 底部复用自制 4×4 计算键盘（RecordKeypad），输入还款金额绝不唤起系统键盘
 * - 信息层级：主（顶部还款方式切换「资产转入 / 无账户支出」+ 底部大号金额与唯一实色「保存 / =」主按钮）、次（还款路径双卡与还款后余额/欠款实时预览 + 2 列资产账户直选网格 + 日期触发块）、弱（抓手、关闭、编辑态删除与备注输入）
 * - 默认金额占位：新建且存在欠款时，将待还全额以浅色占位提示展示在金额区，直接点「保存」即全额还清，按任意数字直接输入部分金额免手删
 */
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  Easing,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StatusBar as RNStatusBar,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import {
  GestureDetector,
  useNativeGesture,
  usePanGesture,
  useSimultaneousGestures,
} from 'react-native-gesture-handler';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useDatabase } from '../src/db/database-context';
import { describeAccountBalance } from '../src/features/accounts/rules';
import { getAccountById, listAccounts } from '../src/features/accounts/service';
import type { Account } from '../src/features/accounts/types';
import {
  applyAmountKey,
  centsToAmountExpression,
  evaluateAmountExpression,
  type AmountKey,
} from '../src/features/transactions/amount-expression';
import { DatePickerSheet } from '../src/features/transactions/components/DatePickerSheet';
import { DeleteTransactionDialog } from '../src/features/transactions/components/DeleteTransactionDialog';
import { RecordKeypad } from '../src/features/transactions/components/RecordKeypad';
import {
  createRepaymentTransaction,
  deleteTransaction,
  getTransactionById,
  updateRepaymentTransaction,
} from '../src/features/transactions/service';
import type { TransactionListItem } from '../src/features/transactions/types';
import { getTodayIsoDate, isValidIsoDate } from '../src/shared/date/date';
import {
  hapticLight,
  hapticMedium,
  hapticSelection,
  hapticSuccess,
  hapticWarning,
} from '../src/shared/haptics/haptics';
import {
  formatCentsPlain,
  MAX_AMOUNT_CENTS,
} from '../src/shared/money/money';
import { AppIcon } from '../src/shared/ui/AppIcon';
import { SafeScreen } from '../src/shared/ui/SafeScreen';
import { SlidingSegmentedControl } from '../src/shared/ui/SlidingSegmentedControl';
import { useTheme } from '../src/theme/theme-context';

type RepaymentSourceMode = 'asset' | 'direct';

const SOURCE_MODE_OPTIONS: readonly { value: RepaymentSourceMode; label: string }[] = [
  { value: 'asset', label: '资产转入' },
  { value: 'direct', label: '无账户支出' },
];

function firstParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function chunkIntoPairs<T>(items: readonly T[]): (readonly [T, T | null])[] {
  const rows: [T, T | null][] = [];
  for (let i = 0; i < items.length; i += 2) {
    rows.push([items[i]!, items[i + 1] ?? null]);
  }
  return rows;
}

export default function RepaymentScreen(): React.JSX.Element {
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  const { height: windowHeight } = useWindowDimensions();
  const router = useRouter();
  const { db, revision, notifyChange } = useDatabase();

  const [sheetTranslateY] = useState(() => new Animated.Value(0));
  const windowHeightRef = useRef(windowHeight);
  const scrollOffsetYRef = useRef(0);
  const dismissingRef = useRef(false);
  const headerDraggingRef = useRef(false);
  const bodyDraggingRef = useRef(false);

  useEffect(() => {
    windowHeightRef.current = windowHeight;
  }, [windowHeight]);

  const finishSwipeDismiss = useCallback(() => {
    if (dismissingRef.current) {
      return;
    }
    dismissingRef.current = true;
    Keyboard.dismiss();
    hapticLight();
    Animated.timing(sheetTranslateY, {
      toValue: Math.max(windowHeightRef.current, 600),
      duration: 185,
      easing: Easing.in(Easing.cubic),
      useNativeDriver: true,
    }).start(() => {
      router.back();
    });
  }, [router, sheetTranslateY]);

  const springSheetBack = useCallback(() => {
    Animated.spring(sheetTranslateY, {
      toValue: 0,
      useNativeDriver: true,
      stiffness: 300,
      damping: 30,
      mass: 0.9,
    }).start();
  }, [sheetTranslateY]);

  const headerDismissPan = usePanGesture({
    enabled: true,
    disableReanimated: true,
    runOnJS: true,
    activeOffsetY: 10,
    failOffsetX: [-20, 20],
    onActivate: () => {
      if (dismissingRef.current) {
        return;
      }
      Keyboard.dismiss();
      headerDraggingRef.current = true;
    },
    onUpdate: (event) => {
      if (!headerDraggingRef.current || dismissingRef.current) {
        return;
      }
      sheetTranslateY.setValue(Math.max(0, event.translationY));
    },
    onDeactivate: (event) => {
      if (!headerDraggingRef.current || dismissingRef.current) {
        return;
      }
      headerDraggingRef.current = false;
      const threshold = Math.min(windowHeightRef.current * 0.24, 170);
      const projected = event.translationY + event.velocityY * 0.14;
      if (projected > threshold || (event.velocityY > 750 && event.translationY > 36)) {
        finishSwipeDismiss();
      } else {
        springSheetBack();
      }
    },
    onFinalize: () => {
      if (headerDraggingRef.current && !dismissingRef.current) {
        headerDraggingRef.current = false;
        springSheetBack();
      }
    },
  });

  const nativeScrollGesture = useNativeGesture({
    disableReanimated: true,
  });

  const bodyDismissPan = usePanGesture({
    enabled: true,
    disableReanimated: true,
    runOnJS: true,
    activeOffsetY: 14,
    failOffsetX: [-20, 20],
    onActivate: (event) => {
      if (dismissingRef.current || scrollOffsetYRef.current > 2 || event.translationY < 0) {
        bodyDraggingRef.current = false;
        return;
      }
      Keyboard.dismiss();
      bodyDraggingRef.current = true;
    },
    onUpdate: (event) => {
      if (!bodyDraggingRef.current || dismissingRef.current) {
        return;
      }
      sheetTranslateY.setValue(Math.max(0, event.translationY));
    },
    onDeactivate: (event) => {
      if (!bodyDraggingRef.current || dismissingRef.current) {
        return;
      }
      bodyDraggingRef.current = false;
      const threshold = Math.min(windowHeightRef.current * 0.24, 170);
      const projected = event.translationY + event.velocityY * 0.14;
      if (projected > threshold || (event.velocityY > 750 && event.translationY > 36)) {
        finishSwipeDismiss();
      } else {
        springSheetBack();
      }
    },
    onFinalize: () => {
      if (bodyDraggingRef.current && !dismissingRef.current) {
        bodyDraggingRef.current = false;
        springSheetBack();
      }
    },
  });

  const bodyScrollGesture = useSimultaneousGestures(bodyDismissPan, nativeScrollGesture);

  const topInset =
    Platform.OS === 'android'
      ? Math.max(insets.top, RNStatusBar.currentHeight ?? 0)
      : insets.top;

  const params = useLocalSearchParams<{
    id?: string | string[];
    liabilityAccountId?: string | string[];
  }>();
  const editId = firstParam(params.id);
  const paramLiabilityId = firstParam(params.liabilityAccountId);
  const isEditing = Boolean(editId);

  const [liabilityAccount, setLiabilityAccount] = useState<Account | null>(null);
  const [assetAccounts, setAssetAccounts] = useState<Account[]>([]);
  const [editingItem, setEditingItem] = useState<TransactionListItem | null>(null);
  const [defaultAmountCents, setDefaultAmountCents] = useState(0);
  const [amountExpr, setAmountExpr] = useState('');
  const [sourceMode, setSourceMode] = useState<RepaymentSourceMode>('asset');
  const [sourceAccountId, setSourceAccountId] = useState('');
  const [occurredOn, setOccurredOn] = useState(() => getTodayIsoDate());
  const [note, setNote] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [dateSheetOpen, setDateSheetOpen] = useState(false);

  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const initializedKeyRef = useRef<string | null>(null);

  useEffect(() => {
    let active = true;
    const initKey = `${editId ?? ''}|${paramLiabilityId ?? ''}`;
    const isFirstInit = initializedKeyRef.current !== initKey;

    void (async () => {
      const [allAccounts, loadedTx] = await Promise.all([
        listAccounts(db, { includeArchived: true }),
        editId ? getTransactionById(db, editId) : Promise.resolve(null),
      ]);
      if (!active) {
        return;
      }

      const resolvedLiabilityId =
        loadedTx && loadedTx.type === 'repayment'
          ? loadedTx.accountId
          : (paramLiabilityId ?? '');
      const resolvedLiability = resolvedLiabilityId
        ? await getAccountById(db, resolvedLiabilityId)
        : null;
      if (!active) {
        return;
      }

      const currentSourceId =
        loadedTx && loadedTx.type === 'repayment' ? loadedTx.toAccountId : null;
      const selectableAssets = allAccounts.filter(
        (acc) =>
          acc.kind === 'asset' &&
          ((!acc.isArchived && acc.isSelectable) || acc.id === currentSourceId)
      );

      setLiabilityAccount(resolvedLiability);
      setAssetAccounts(selectableAssets);
      setEditingItem(loadedTx && loadedTx.type === 'repayment' ? loadedTx : null);

      if (isFirstInit) {
        initializedKeyRef.current = initKey;
        setFormError(null);
        setAmountExpr('');

        if (loadedTx && loadedTx.type === 'repayment') {
          setDefaultAmountCents(loadedTx.amountCents);
          if (loadedTx.toAccountId) {
            setSourceMode('asset');
            setSourceAccountId(loadedTx.toAccountId);
          } else {
            setSourceMode('direct');
            setSourceAccountId(selectableAssets[0]?.id ?? '');
          }
          setOccurredOn(loadedTx.occurredOn);
          setNote(loadedTx.note);
        } else {
          const debtCents =
            resolvedLiability && resolvedLiability.balanceCents < 0
              ? Math.abs(resolvedLiability.balanceCents)
              : 0;
          setDefaultAmountCents(debtCents);
          const firstAssetId = selectableAssets[0]?.id ?? '';
          setSourceMode(firstAssetId ? 'asset' : 'direct');
          setSourceAccountId(firstAssetId);
          setOccurredOn(getTodayIsoDate());
          setNote('');
        }
      }

      setLoading(false);
    })();

    return () => {
      active = false;
    };
  }, [db, editId, paramLiabilityId, revision]);

  const assetRows = useMemo(() => chunkIntoPairs(assetAccounts), [assetAccounts]);
  const selectedSourceAccount = useMemo(
    () => assetAccounts.find((acc) => acc.id === sourceAccountId) ?? null,
    [assetAccounts, sourceAccountId]
  );

  const evaluatedTypedCents = useMemo(() => evaluateAmountExpression(amountExpr), [amountExpr]);
  const effectivePreviewCents =
    amountExpr.trim().length > 0
      ? evaluatedTypedCents !== null && evaluatedTypedCents > 0
        ? evaluatedTypedCents
        : 0
      : defaultAmountCents;

  const amountPlaceholder =
    defaultAmountCents > 0 ? formatCentsPlain(defaultAmountCents, false) : '0.00';
  const emptyAmountHint =
    defaultAmountCents > 0
      ? isEditing
        ? '留空保持原金额'
        : '留空默认全额还清'
      : null;

  const handlePressKey = (key: AmountKey) => {
    setFormError(null);
    setAmountExpr((prev) => applyAmountKey(prev, key));
  };

  const handleEvaluate = () => {
    const result = evaluateAmountExpression(amountExpr);
    if (result === null || result <= 0) {
      hapticWarning();
      setFormError('计算结果须大于 0');
      return;
    }
    if (result > MAX_AMOUNT_CENTS) {
      hapticWarning();
      setFormError('金额超出上限');
      return;
    }
    setAmountExpr(centsToAmountExpression(result));
    setFormError(null);
  };

  const handleSave = async () => {
    Keyboard.dismiss();
    setFormError(null);

    let amountCents: number;
    if (amountExpr.trim().length === 0) {
      if (defaultAmountCents > 0) {
        amountCents = defaultAmountCents;
      } else {
        hapticWarning();
        setFormError('请输入大于 0 的还款金额');
        return;
      }
    } else {
      const evaluated = evaluateAmountExpression(amountExpr);
      if (evaluated === null || evaluated <= 0) {
        hapticWarning();
        setFormError('请输入大于 0 的还款金额');
        return;
      }
      if (evaluated > MAX_AMOUNT_CENTS) {
        hapticWarning();
        setFormError('金额超出上限');
        return;
      }
      amountCents = evaluated;
    }

    if (!isValidIsoDate(occurredOn)) {
      hapticWarning();
      setFormError('还款日期格式无效');
      return;
    }

    const finalSourceId = sourceMode === 'asset' ? sourceAccountId : null;
    if (sourceMode === 'asset' && !finalSourceId) {
      hapticWarning();
      setFormError('请选择转出资产账户，或切换为「无账户支出」');
      return;
    }

    if (!liabilityAccount && !editingItem) {
      hapticWarning();
      setFormError('缺少目标负债账户');
      return;
    }

    setSaving(true);
    try {
      if (isEditing && editId) {
        await updateRepaymentTransaction(db, editId, {
          sourceAccountId: finalSourceId,
          amountCents,
          occurredOn,
          note,
        });
      } else if (liabilityAccount) {
        await createRepaymentTransaction(db, {
          liabilityAccountId: liabilityAccount.id,
          sourceAccountId: finalSourceId,
          amountCents,
          occurredOn,
          note,
        });
      }

      hapticSuccess();
      notifyChange();
      router.back();
    } catch (err) {
      hapticWarning();
      setFormError(err instanceof Error ? err.message : '还款保存失败');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = () => {
    if (!editId || !editingItem) {
      return;
    }
    Keyboard.dismiss();
    hapticLight();
    setDeleteError(null);
    setDeleteDialogOpen(true);
  };

  const handleConfirmDelete = async () => {
    if (!editId || deleting) {
      return;
    }
    setDeleting(true);
    setDeleteError(null);
    try {
      await deleteTransaction(db, editId);
      hapticMedium();
      setDeleteDialogOpen(false);
      notifyChange();
      router.back();
    } catch (err) {
      hapticWarning();
      setDeleteError(err instanceof Error ? err.message : '删除失败');
    } finally {
      setDeleting(false);
    }
  };

  const backdropOpacity = sheetTranslateY.interpolate({
    inputRange: [0, 1, Math.max(240, windowHeight * 0.65)],
    outputRange: [0, 0.34, 0],
    extrapolate: 'clamp',
  });

  const liabilityName = liabilityAccount?.name ?? editingItem?.accountName ?? '负债账户';
  const liabilityCurrentBal = liabilityAccount
    ? describeAccountBalance(liabilityAccount)
    : null;
  const liabilityProjectedBal =
    liabilityAccount && effectivePreviewCents > 0 && !isEditing
      ? describeAccountBalance({
          ...liabilityAccount,
          balanceCents: liabilityAccount.balanceCents + effectivePreviewCents,
        })
      : null;

  const sourceCurrentBal = selectedSourceAccount
    ? describeAccountBalance(selectedSourceAccount)
    : null;
  const sourceProjectedBal =
    selectedSourceAccount && effectivePreviewCents > 0 && !isEditing
      ? describeAccountBalance({
          ...selectedSourceAccount,
          balanceCents: selectedSourceAccount.balanceCents - effectivePreviewCents,
        })
      : null;

  const routeSummary = {
    sourceName:
      sourceMode === 'asset'
        ? (selectedSourceAccount?.name ?? '请选择资产')
        : '无账户支出',
    targetName: liabilityName,
  };

  const keypadDisabled =
    loading ||
    (!liabilityAccount && !editingItem) ||
    (sourceMode === 'asset' && !sourceAccountId);

  return (
    <View style={styles.dismissContainer}>
      <Stack.Screen options={{ headerShown: false }} />

      <Animated.View
        pointerEvents="none"
        style={[
          StyleSheet.absoluteFill,
          { backgroundColor: theme.colors.scrim, opacity: backdropOpacity },
        ]}
      />

      <Animated.View
        style={[
          styles.sheetPage,
          {
            backgroundColor: theme.colors.surface,
            transform: [{ translateY: sheetTranslateY }],
          },
        ]}
      >
        <SafeScreen
          edges={['top', 'left', 'right']}
          topBackgroundColor={theme.colors.surfaceRaised}
        >
          {/* 顶部下拉退出热区 */}
          <GestureDetector gesture={headerDismissPan}>
            <View
              style={{
                backgroundColor: theme.colors.surfaceRaised,
                borderBottomColor: theme.colors.border,
                borderBottomWidth: theme.borderWidth.hairline,
              }}
            >
              <View style={styles.dragIndicatorRow}>
                <View
                  style={[
                    styles.dragIndicatorBar,
                    {
                      backgroundColor: theme.colors.borderStrong,
                      borderRadius: theme.radius.full,
                    },
                  ]}
                />
              </View>

              <View style={[styles.topBar, { paddingHorizontal: theme.spacing.sm }]}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="关闭"
                  onPress={() => {
                    hapticLight();
                    router.back();
                  }}
                  hitSlop={8}
                  style={({ pressed }) => [
                    styles.topIconBtn,
                    pressed && { opacity: theme.opacity.pressed },
                  ]}
                >
                  <AppIcon name="close" size={24} color={theme.colors.text} />
                </Pressable>

                <Text
                  numberOfLines={1}
                  style={{
                    color: theme.colors.text,
                    fontSize: theme.fontSize.lg,
                    fontWeight: theme.fontWeight.semibold,
                  }}
                >
                  {isEditing ? '编辑还款' : '负债还款'}
                </Text>

                {isEditing ? (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="删除还款记录"
                    onPress={handleDelete}
                    hitSlop={8}
                    style={({ pressed }) => [
                      styles.topIconBtn,
                      pressed && { opacity: theme.opacity.pressed },
                    ]}
                  >
                    <AppIcon name="trash-outline" size={21} color={theme.colors.expense} />
                  </Pressable>
                ) : (
                  <View style={styles.topIconBtn} />
                )}
              </View>
            </View>
          </GestureDetector>

          <KeyboardAvoidingView
            style={styles.flex}
            behavior="padding"
            keyboardVerticalOffset={topInset}
          >
            {/* 上方主内容区：还款方式切换 + 还款路径卡片 + 2 列资产账户直选网格 */}
            <GestureDetector gesture={bodyScrollGesture}>
              <ScrollView
                style={styles.flex}
                keyboardShouldPersistTaps="handled"
                scrollEventThrottle={16}
                onScroll={(e) => {
                  scrollOffsetYRef.current = e.nativeEvent.contentOffset.y;
                }}
                contentContainerStyle={{
                  paddingHorizontal: theme.spacing.md,
                  paddingTop: theme.spacing.md,
                  paddingBottom: theme.spacing.lg,
                  gap: theme.spacing.md,
                }}
              >
                <SlidingSegmentedControl
                  options={SOURCE_MODE_OPTIONS}
                  value={sourceMode}
                  onChange={(next) => {
                    Keyboard.dismiss();
                    setSourceMode(next);
                    if (next === 'asset' && !sourceAccountId && assetAccounts[0]) {
                      setSourceAccountId(assetAccounts[0].id);
                    }
                    setFormError(null);
                  }}
                  fullWidth
                  height={40}
                  shape="pill"
                  trackTone="surfaceRaised"
                  textSize="sm"
                />

                {/* 还款路径可视化双卡（参考 TransferRoutePanel） */}
                {sourceMode === 'asset' ? (
                  <View style={styles.routeDualRow}>
                    {/* 左卡：付款资产账户 */}
                    <View
                      style={[
                        styles.routeCard,
                        theme.elevation.card,
                        {
                          backgroundColor: theme.colors.surfaceRaised,
                          borderColor: theme.colors.action,
                          borderWidth: theme.borderWidth.focus,
                          padding: 11,
                          borderRadius: theme.radius.lg,
                        },
                      ]}
                    >
                      <View style={styles.roleRow}>
                        <View
                          style={[styles.roleDot, { backgroundColor: theme.colors.action }]}
                        />
                        <Text
                          numberOfLines={1}
                          style={{
                            color: theme.colors.actionTextOnSubtle,
                            fontSize: theme.fontSize.xs,
                            fontWeight: theme.fontWeight.semibold,
                          }}
                        >
                          转出资产
                        </Text>
                      </View>
                      <Text
                        numberOfLines={1}
                        style={{
                          color: theme.colors.text,
                          fontSize: theme.fontSize.base,
                          fontWeight: theme.fontWeight.semibold,
                          marginTop: theme.spacing.xs,
                        }}
                      >
                        {selectedSourceAccount?.name ?? '请选择资产'}
                      </Text>
                      {sourceCurrentBal ? (
                        <Text
                          numberOfLines={1}
                          style={[
                            styles.tabular,
                            {
                              color: theme.colors.textMuted,
                              fontSize: theme.fontSize.xs,
                              marginTop: 4,
                            },
                          ]}
                        >
                          {sourceProjectedBal
                            ? `${sourceCurrentBal.amountText} → ${sourceProjectedBal.amountText}`
                            : `${sourceCurrentBal.caption} ${sourceCurrentBal.amountText}`}
                        </Text>
                      ) : null}
                    </View>

                    <View
                      style={[
                        styles.arrowBadge,
                        {
                          backgroundColor: theme.colors.actionSubtle,
                          borderRadius: theme.radius.full,
                        },
                      ]}
                    >
                      <AppIcon
                        name="arrow-forward"
                        size={16}
                        color={theme.colors.actionTextOnSubtle}
                      />
                    </View>

                    {/* 右卡：还款负债账户 */}
                    <View
                      style={[
                        styles.routeCard,
                        theme.elevation.card,
                        {
                          backgroundColor: theme.colors.surfaceRaised,
                          borderColor: theme.colors.border,
                          borderWidth: theme.borderWidth.hairline,
                          padding: 12,
                          borderRadius: theme.radius.lg,
                        },
                      ]}
                    >
                      <View style={styles.roleRow}>
                        <View
                          style={[styles.roleDot, { backgroundColor: theme.colors.warning }]}
                        />
                        <Text
                          numberOfLines={1}
                          style={{
                            color: theme.colors.textMuted,
                            fontSize: theme.fontSize.xs,
                            fontWeight: theme.fontWeight.semibold,
                          }}
                        >
                          还款负债
                        </Text>
                      </View>
                      <Text
                        numberOfLines={1}
                        style={{
                          color: theme.colors.text,
                          fontSize: theme.fontSize.base,
                          fontWeight: theme.fontWeight.semibold,
                          marginTop: theme.spacing.xs,
                        }}
                      >
                        {liabilityName}
                      </Text>
                      {liabilityCurrentBal ? (
                        <Text
                          numberOfLines={1}
                          style={[
                            styles.tabular,
                            {
                              color: liabilityCurrentBal.isDebt
                                ? theme.colors.expense
                                : theme.colors.textMuted,
                              fontSize: theme.fontSize.xs,
                              marginTop: 4,
                            },
                          ]}
                        >
                          {liabilityProjectedBal
                            ? `${liabilityCurrentBal.amountText} → ${liabilityProjectedBal.amountText}`
                            : `${liabilityCurrentBal.caption} ${liabilityCurrentBal.amountText}`}
                        </Text>
                      ) : null}
                    </View>
                  </View>
                ) : (
                  /* 无账户支出模式单卡 */
                  <View
                    style={[
                      styles.directCard,
                      theme.elevation.card,
                      {
                        backgroundColor: theme.colors.surfaceRaised,
                        borderColor: theme.colors.border,
                        borderWidth: theme.borderWidth.hairline,
                        borderRadius: theme.radius.lg,
                        padding: theme.spacing.md,
                      },
                    ]}
                  >
                    <View style={styles.directCardTop}>
                      <View
                        style={[
                          styles.directIconWrap,
                          {
                            backgroundColor: theme.colors.warningSubtle,
                            borderRadius: theme.radius.md,
                          },
                        ]}
                      >
                        <AppIcon
                          name={liabilityAccount?.icon ?? 'card-outline'}
                          size={20}
                          color={theme.colors.warningTextOnSubtle}
                        />
                      </View>
                      <View style={styles.flex}>
                        <Text
                          numberOfLines={1}
                          style={{
                            color: theme.colors.text,
                            fontSize: theme.fontSize.base,
                            fontWeight: theme.fontWeight.semibold,
                          }}
                        >
                          直接还款 · {liabilityName}
                        </Text>
                        {liabilityCurrentBal ? (
                          <Text
                            numberOfLines={1}
                            style={[
                              styles.tabular,
                              {
                                color: liabilityCurrentBal.isDebt
                                  ? theme.colors.expense
                                  : theme.colors.textMuted,
                                fontSize: theme.fontSize.xs,
                                marginTop: 2,
                              },
                            ]}
                          >
                            {liabilityProjectedBal
                              ? `${liabilityCurrentBal.caption} ${liabilityCurrentBal.amountText} → ${liabilityProjectedBal.caption} ${liabilityProjectedBal.amountText}`
                              : `${liabilityCurrentBal.caption} ${liabilityCurrentBal.amountText}`}
                          </Text>
                        ) : null}
                      </View>
                    </View>

                    <View
                      style={[
                        styles.directHintStrip,
                        {
                          backgroundColor: theme.colors.surface,
                          borderLeftColor: theme.colors.action,
                          borderRadius: theme.radius.sm,
                          marginTop: theme.spacing.sm,
                        },
                      ]}
                    >
                      <Text style={{ color: theme.colors.textMuted, fontSize: theme.fontSize.xs }}>
                        仅减少该负债欠款，不从本地资产账户扣款，不计入收支统计
                      </Text>
                    </View>
                  </View>
                )}

                {/* 资产转入模式：2 列内联资产账户直选网格 */}
                {sourceMode === 'asset' ? (
                  assetAccounts.length === 0 ? (
                    <View
                      style={[
                        styles.warnBanner,
                        {
                          backgroundColor: theme.colors.warningSubtle,
                          borderLeftColor: theme.colors.warning,
                          borderRadius: theme.radius.md,
                          padding: theme.spacing.md,
                        },
                      ]}
                    >
                      <AppIcon
                        name="alert-circle-outline"
                        size={18}
                        color={theme.colors.warningTextOnSubtle}
                      />
                      <Text
                        style={{
                          color: theme.colors.warningTextOnSubtle,
                          fontSize: theme.fontSize.sm,
                          marginLeft: theme.spacing.sm,
                          flex: 1,
                        }}
                      >
                        暂无可用资产账户，请切换至「无账户支出」直接还款
                      </Text>
                    </View>
                  ) : (
                    <View style={{ gap: theme.spacing.sm }}>
                      <Text
                        style={{
                          color: theme.colors.textSecondary,
                          fontSize: theme.fontSize.xs,
                          fontWeight: theme.fontWeight.semibold,
                          paddingHorizontal: 2,
                        }}
                      >
                        选择转出资产账户
                      </Text>
                      {assetRows.map(([left, right]) => (
                        <View key={left.id} style={styles.gridRow}>
                          {[left, right].map((acc, colIdx) => {
                            if (!acc) {
                              return <View key={`empty-${colIdx}`} style={styles.gridCell} />;
                            }
                            const selected = acc.id === sourceAccountId;
                            const bal = describeAccountBalance(acc);
                            return (
                              <Pressable
                                key={acc.id}
                                accessibilityRole="button"
                                accessibilityLabel={`${acc.name}，${bal.caption} ${bal.amountText}`}
                                accessibilityState={{ selected }}
                                onPress={() => {
                                  Keyboard.dismiss();
                                  hapticSelection();
                                  setSourceAccountId(acc.id);
                                  setFormError(null);
                                }}
                                style={({ pressed }) => [
                                  styles.gridCell,
                                  styles.accountGridCard,
                                  theme.elevation.card,
                                  {
                                    backgroundColor: selected
                                      ? theme.colors.actionSubtle
                                      : theme.colors.surfaceRaised,
                                    borderColor: selected
                                      ? theme.colors.action
                                      : theme.colors.border,
                                    borderWidth: selected
                                      ? theme.borderWidth.focus
                                      : theme.borderWidth.hairline,
                                    paddingHorizontal: selected ? 11 : 12,
                                    paddingVertical: selected ? 9 : 10,
                                    borderRadius: theme.radius.md,
                                  },
                                  pressed && { opacity: theme.opacity.pressed },
                                ]}
                              >
                                <View
                                  style={[
                                    styles.gridIconWrap,
                                    {
                                      backgroundColor: selected
                                        ? theme.colors.surfaceRaised
                                        : theme.colors.actionSubtle,
                                      borderRadius: theme.radius.sm,
                                    },
                                  ]}
                                >
                                  <AppIcon
                                    name={acc.icon}
                                    size={16}
                                    color={theme.colors.actionTextOnSubtle}
                                  />
                                </View>
                                <View style={styles.flex}>
                                  <Text
                                    numberOfLines={1}
                                    style={{
                                      color: selected
                                        ? theme.colors.actionTextOnSubtle
                                        : theme.colors.text,
                                      fontSize: theme.fontSize.sm,
                                      fontWeight: theme.fontWeight.semibold,
                                    }}
                                  >
                                    {acc.name}
                                  </Text>
                                  <Text
                                    numberOfLines={1}
                                    style={[
                                      styles.tabular,
                                      {
                                        color: selected
                                          ? theme.colors.actionTextOnSubtle
                                          : theme.colors.textMuted,
                                        fontSize: theme.fontSize.xs,
                                        marginTop: 1,
                                      },
                                    ]}
                                  >
                                    {bal.amountText}
                                  </Text>
                                </View>
                              </Pressable>
                            );
                          })}
                        </View>
                      ))}
                    </View>
                  )
                ) : null}
              </ScrollView>
            </GestureDetector>

            {/* 底部复用自制 4×4 计算键盘：输入金额不唤起系统键盘 */}
            <RecordKeypad
              txType="repayment"
              amountExpr={amountExpr}
              amountPlaceholder={amountPlaceholder}
              emptyAmountHint={emptyAmountHint}
              note={note}
              onChangeNote={setNote}
              onPressKey={handlePressKey}
              onLongPressBackspace={() => {
                setAmountExpr('');
                setFormError(null);
              }}
              onClearAmount={() => {
                setAmountExpr('');
                setFormError(null);
              }}
              onEvaluate={handleEvaluate}
              onSave={() => void handleSave()}
              isEditing={isEditing}
              saving={saving}
              disabled={keypadDisabled}
              accounts={assetAccounts}
              selectedAccountId={sourceAccountId}
              onSelectAccount={(pickedId) => setSourceAccountId(pickedId)}
              transferRouteSummary={routeSummary}
              occurredOn={occurredOn}
              onPressDate={() => {
                hapticLight();
                setDateSheetOpen(true);
              }}
              selectedCategoryLabel={null}
              formError={formError}
              notePlaceholder="账单还款、提前结清等..."
              noteAccessibilityLabel="还款备注"
              forceClearSecondary
              saveAccessibilityLabel={isEditing ? '保存还款修改' : '保存还款'}
            />
          </KeyboardAvoidingView>
        </SafeScreen>
      </Animated.View>

      <DatePickerSheet
        visible={dateSheetOpen}
        selectedDate={occurredOn}
        onSelect={(iso) => setOccurredOn(iso)}
        onClose={() => setDateSheetOpen(false)}
      />

      <DeleteTransactionDialog
        item={deleteDialogOpen ? editingItem : null}
        loading={deleting}
        error={deleteError}
        onCancel={() => {
          if (!deleting) {
            setDeleteDialogOpen(false);
            setDeleteError(null);
          }
        }}
        onConfirm={() => void handleConfirmDelete()}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  dismissContainer: {
    flex: 1,
  },
  sheetPage: {
    flex: 1,
  },
  flex: {
    flex: 1,
    minWidth: 0,
  },
  dragIndicatorRow: {
    alignItems: 'center',
    paddingTop: 6,
    paddingBottom: 2,
  },
  dragIndicatorBar: {
    width: 36,
    height: 4,
  },
  topBar: {
    height: 44,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  topIconBtn: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  routeDualRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  routeCard: {
    flex: 1,
    minWidth: 0,
  },
  roleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  roleDot: {
    width: 7,
    height: 7,
    borderRadius: 999,
  },
  arrowBadge: {
    width: 30,
    height: 30,
    alignItems: 'center',
    justifyContent: 'center',
  },
  directCard: {},
  directCardTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  directIconWrap: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  directHintStrip: {
    borderLeftWidth: 3,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  warnBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    borderLeftWidth: 3,
  },
  gridRow: {
    flexDirection: 'row',
    gap: 10,
  },
  gridCell: {
    flex: 1,
    minWidth: 0,
  },
  accountGridCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  gridIconWrap: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabular: {
    fontVariant: ['tabular-nums'],
  },
});
