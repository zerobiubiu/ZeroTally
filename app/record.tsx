/**
 * 约束简报（Workflow B / C）：
 * - 信息层级：主（顶部支出/收入/转账切换 + 底部大号金额与唯一实色「保存 / =」主按钮）、次（上方二级分类网格或转账路由卡 + 账户/日期快捷胶囊）、弱（顶部下滑抓手、关闭、分类管理入口、编辑态删除）
 * - 动效与手势：配合透明模态从下向上滑入与返回向下滑出；支持顶部栏随时向下拖拽以及分类区位于顶部时跟手向下滑动退出
 * - 键盘策略：金额与日期/账户选择均不唤起系统键盘，仅点击备注输入框时唤起系统键盘并收起自制数字键盘
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
import { listAccounts } from '../src/features/accounts/service';
import type { Account } from '../src/features/accounts/types';
import { CategoryHierarchyPicker } from '../src/features/categories/components/CategoryHierarchyPicker';
import { buildCategoryTree } from '../src/features/categories/rules';
import { listCategories } from '../src/features/categories/service';
import type { Category } from '../src/features/categories/types';
import {
  applyAmountKey,
  centsToAmountExpression,
  evaluateAmountExpression,
  type AmountKey,
} from '../src/features/transactions/amount-expression';
import { DatePickerSheet } from '../src/features/transactions/components/DatePickerSheet';
import { DeleteTransactionDialog } from '../src/features/transactions/components/DeleteTransactionDialog';
import { RecordKeypad } from '../src/features/transactions/components/RecordKeypad';
import { TransferRoutePanel } from '../src/features/transactions/components/TransferRoutePanel';
import {
  EMPTY_CATEGORY_ACCOUNT_MEMORY,
  recordCategoryAccountMemory,
  resolveRememberedAccountId,
} from '../src/features/transactions/rules';
import {
  createTransaction,
  deleteTransaction,
  getCategoryAccountMemory,
  getTransactionById,
  updateTransaction,
} from '../src/features/transactions/service';
import type {
  CategoryAccountMemory,
  TransactionListItem,
  TransactionType,
} from '../src/features/transactions/types';
import { getTodayIsoDate, isValidIsoDate } from '../src/shared/date/date';
import {
  hapticLight,
  hapticMedium,
  hapticSelection,
  hapticSuccess,
  hapticWarning,
} from '../src/shared/haptics/haptics';
import { centsToInputString, MAX_AMOUNT_CENTS } from '../src/shared/money/money';
import { AppIcon } from '../src/shared/ui/AppIcon';
import { SafeScreen } from '../src/shared/ui/SafeScreen';
import { useTheme } from '../src/theme/theme-context';

type RecordableTransactionType = Exclude<TransactionType, 'refund'>;

const TYPE_TABS: readonly { value: RecordableTransactionType; label: string }[] = [
  { value: 'expense', label: '支出' },
  { value: 'income', label: '收入' },
  { value: 'transfer', label: '转账' },
];

function firstParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export default function RecordScreen(): React.JSX.Element {
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

  // 顶部栏与抓手区域随时支持向下跟手滑出关闭
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

  // 主体分类/转账滚动区：仅当已处于列表顶部（scrollOffsetY <= 2）时向下拉跟手滑出，不与正常滚动冲突
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
      if (event.translationY < 0) {
        sheetTranslateY.setValue(0);
        return;
      }
      sheetTranslateY.setValue(event.translationY);
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
    copyFromId?: string | string[];
    accountId?: string | string[];
    type?: string | string[];
  }>();
  const editId = firstParam(params.id);
  const copyFromId = firstParam(params.copyFromId);
  const prefilledAccountId = firstParam(params.accountId);
  const prefilledType = firstParam(params.type);
  const isEditing = Boolean(editId);

  const [txType, setTxType] = useState<RecordableTransactionType>(() =>
    prefilledType === 'income' || prefilledType === 'transfer' ? prefilledType : 'expense'
  );
  const [amountExpr, setAmountExpr] = useState('');
  const [categoryId, setCategoryId] = useState<string | null>(null);
  /** undefined = 自动展开当前选中分类所属一级；null = 用户手动收起 */
  const [expandedRootId, setExpandedRootId] = useState<string | null | undefined>(undefined);
  const [accountId, setAccountId] = useState<string>('');
  const [toAccountId, setToAccountId] = useState<string>('');
  const [occurredOn, setOccurredOn] = useState<string>(() => getTodayIsoDate());
  const [note, setNote] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const [savedNotice, setSavedNotice] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  const [dateSheetOpen, setDateSheetOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<TransactionListItem | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const [accounts, setAccounts] = useState<Account[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [accountMemory, setAccountMemory] = useState<CategoryAccountMemory>(
    EMPTY_CATEGORY_ACCOUNT_MEMORY
  );
  /**
   * 账户手动锁定状态：
   * - true：编辑旧账、复制再记、从特定账户详情进入，或本次手动点选过账户 → 切换分类不再自动改账户；
   * - false：普通新增记一笔 → 切换分类时按四层记忆规则自动带出上次使用账户。
   */
  const [accountLocked, setAccountLocked] = useState<boolean>(() =>
    Boolean(editId || copyFromId || prefilledAccountId)
  );
  const initializedKeyRef = useRef<string | null>(null);

  useEffect(() => {
    if (!savedNotice) {
      return;
    }
    const timer = setTimeout(() => setSavedNotice(null), 1800);
    return () => clearTimeout(timer);
  }, [savedNotice]);

  useEffect(() => {
    let active = true;
    const initKey = `${editId ?? ''}|${copyFromId ?? ''}|${prefilledAccountId ?? ''}|${prefilledType ?? ''}`;
    const isFirstInit = initializedKeyRef.current !== initKey;

    void (async () => {
      const sourceTxId = editId ?? copyFromId;
      const [allAccounts, allCategories, loadedTx, memory] = await Promise.all([
        listAccounts(db, { includeArchived: true }),
        listCategories(db, { includeArchived: true }),
        sourceTxId ? getTransactionById(db, sourceTxId) : Promise.resolve(null),
        getCategoryAccountMemory(db),
      ]);
      if (!active) {
        return;
      }

      const existingTx = editId ? loadedTx : null;
      const templateTx = !editId && copyFromId ? loadedTx : null;

      const visibleAccounts = allAccounts.filter(
        (acc) =>
          !acc.isArchived ||
          (existingTx && (acc.id === existingTx.accountId || acc.id === existingTx.toAccountId))
      );

      const existingCategory = existingTx?.categoryId
        ? allCategories.find((c) => c.id === existingTx.categoryId)
        : undefined;
      const visibleCategories = allCategories.filter(
        (cat) =>
          !cat.isArchived ||
          (existingCategory &&
            (cat.id === existingCategory.id || cat.id === existingCategory.parentId))
      );

      setAccounts(visibleAccounts);
      setCategories(visibleCategories);
      setAccountMemory(memory);
      setEditingItem(existingTx);

      if (isFirstInit) {
        initializedKeyRef.current = initKey;

        if (existingTx && existingTx.type !== 'refund') {
          setTxType(existingTx.type);
          setAmountExpr(centsToInputString(existingTx.amountCents));
          setCategoryId(existingTx.categoryId);
          setExpandedRootId(undefined);
          setAccountId(existingTx.accountId);
          setToAccountId(existingTx.toAccountId ?? '');
          setOccurredOn(existingTx.occurredOn);
          setNote(existingTx.note);
          setAccountLocked(true);
        } else if (templateTx && templateTx.type !== 'refund') {
          setTxType(templateTx.type);
          setAmountExpr(centsToInputString(templateTx.amountCents));
          setCategoryId(
            templateTx.categoryId && visibleCategories.some((c) => c.id === templateTx.categoryId)
              ? templateTx.categoryId
              : null
          );
          setExpandedRootId(undefined);
          const copiedSource =
            visibleAccounts.find((a) => a.id === templateTx.accountId)?.id ??
            visibleAccounts[0]?.id ??
            '';
          const copiedTarget =
            (templateTx.toAccountId &&
              visibleAccounts.find((a) => a.id === templateTx.toAccountId)?.id) ||
            visibleAccounts.find((a) => a.id !== copiedSource)?.id ||
            '';
          setAccountId(copiedSource);
          setToAccountId(copiedTarget);
          setOccurredOn(getTodayIsoDate());
          setNote(templateTx.note);
          setAccountLocked(true);
        } else {
          const initialType: RecordableTransactionType =
            prefilledType === 'income' || prefilledType === 'transfer' ? prefilledType : 'expense';
          const prefilledAcc = prefilledAccountId
            ? visibleAccounts.find((a) => a.id === prefilledAccountId)?.id
            : undefined;

          let initialSource = prefilledAcc ?? '';
          if (!initialSource && initialType !== 'transfer') {
            const firstCategoryId =
              buildCategoryTree(visibleCategories.filter((c) => c.type === initialType))[0]
                ?.category.id ?? null;
            initialSource = resolveRememberedAccountId({
              txType: initialType,
              categoryId: firstCategoryId,
              categories: visibleCategories,
              accounts: visibleAccounts,
              memory,
            });
          }
          if (!initialSource) {
            initialSource = visibleAccounts[0]?.id ?? '';
          }
          const initialTarget = visibleAccounts.find((a) => a.id !== initialSource)?.id ?? '';

          setAccountId(initialSource);
          setToAccountId(initialTarget);
          setAccountLocked(Boolean(prefilledAcc));
        }
      } else {
        // 后续因「再记」或分类管理返回触发的数据刷新，仅兜底失效账户，不打断当前表单选择
        const fallbackSource = visibleAccounts[0]?.id ?? '';
        setAccountId((prev) =>
          prev && visibleAccounts.some((a) => a.id === prev) ? prev : fallbackSource
        );
        setToAccountId((prev) =>
          prev && visibleAccounts.some((a) => a.id === prev)
            ? prev
            : (visibleAccounts.find((a) => a.id !== fallbackSource)?.id ?? '')
        );
      }

      setLoading(false);
    })();
    return () => {
      active = false;
    };
  }, [db, editId, copyFromId, prefilledAccountId, prefilledType, revision]);

  const activeCategoriesForType = useMemo(() => {
    if (txType === 'transfer') {
      return [];
    }
    return categories.filter((c) => c.type === txType);
  }, [categories, txType]);

  const categoryTree = useMemo(
    () => buildCategoryTree(activeCategoriesForType),
    [activeCategoriesForType]
  );

  const effectiveCategoryId = useMemo(() => {
    if (txType === 'transfer') {
      return null;
    }
    if (categoryId && activeCategoriesForType.some((c) => c.id === categoryId)) {
      return categoryId;
    }
    return categoryTree[0]?.category.id ?? null;
  }, [txType, categoryId, activeCategoriesForType, categoryTree]);

  const selectedCategoryInfo = useMemo(() => {
    if (!effectiveCategoryId) {
      return null;
    }
    const selected = activeCategoriesForType.find((c) => c.id === effectiveCategoryId);
    if (!selected) {
      return null;
    }
    if (selected.parentId) {
      const parent = activeCategoriesForType.find((c) => c.id === selected.parentId);
      return {
        rootId: parent ? parent.id : selected.id,
        label: parent ? `${parent.name} · ${selected.name}` : selected.name,
      };
    }
    return {
      rootId: selected.id,
      label: selected.name,
    };
  }, [effectiveCategoryId, activeCategoriesForType]);

  const effectiveExpandedRootId = useMemo(() => {
    if (expandedRootId === null) {
      return null;
    }
    if (expandedRootId !== undefined) {
      const exists = categoryTree.some(
        (n) => n.category.id === expandedRootId && n.children.length > 0
      );
      return exists ? expandedRootId : null;
    }
    const defaultRootId = selectedCategoryInfo?.rootId ?? categoryTree[0]?.category.id ?? null;
    if (!defaultRootId) {
      return null;
    }
    const targetNode = categoryTree.find((n) => n.category.id === defaultRootId);
    return targetNode && targetNode.children.length > 0 ? defaultRootId : null;
  }, [expandedRootId, categoryTree, selectedCategoryInfo]);

  const effectiveToAccountId = useMemo(() => {
    if (txType !== 'transfer') {
      return '';
    }
    if (toAccountId && toAccountId !== accountId && accounts.some((a) => a.id === toAccountId)) {
      return toAccountId;
    }
    return accounts.find((a) => a.id !== accountId)?.id ?? '';
  }, [txType, toAccountId, accountId, accounts]);

  const sourceAccount = accounts.find((a) => a.id === accountId) ?? null;
  const targetAccount = accounts.find((a) => a.id === effectiveToAccountId) ?? null;
  const evaluatedAmountCents = useMemo(
    () => evaluateAmountExpression(amountExpr),
    [amountExpr]
  );

  const handleSwapTransferAccounts = () => {
    if (!accountId || !effectiveToAccountId) {
      return;
    }
    const prevFrom = accountId;
    setAccountId(effectiveToAccountId);
    setToAccountId(prevFrom);
    setFormError(null);
  };

  const handleSelectTxType = (nextType: RecordableTransactionType) => {
    Keyboard.dismiss();
    if (nextType === txType) {
      return;
    }
    hapticSelection();
    setTxType(nextType);
    setExpandedRootId(undefined);
    setFormError(null);

    if (nextType !== 'transfer') {
      const nextDefaultCategoryId =
        buildCategoryTree(categories.filter((c) => c.type === nextType))[0]?.category.id ?? null;
      setCategoryId(nextDefaultCategoryId);

      // 新增记账切换「支出 ↔ 收入」时解除单次手动锁定，按新类型默认分类记忆自动带出账户
      if (!isEditing && !prefilledAccountId) {
        setAccountLocked(false);
        const rememberedAccountId = resolveRememberedAccountId({
          txType: nextType,
          categoryId: nextDefaultCategoryId,
          categories,
          accounts,
          memory: accountMemory,
        });
        if (rememberedAccountId) {
          setAccountId(rememberedAccountId);
        }
      }
    }
  };

  const handleSelectCategory = (pickedCategoryId: string) => {
    Keyboard.dismiss();
    setCategoryId(pickedCategoryId);
    if (formError) {
      setFormError(null);
    }

    if (!accountLocked && txType !== 'transfer') {
      const rememberedAccountId = resolveRememberedAccountId({
        txType,
        categoryId: pickedCategoryId,
        categories,
        accounts,
        memory: accountMemory,
      });
      if (rememberedAccountId && rememberedAccountId !== accountId) {
        setAccountId(rememberedAccountId);
      }
    }
  };

  const handleManualSelectAccount = (pickedId: string) => {
    setAccountId(pickedId);
    setAccountLocked(true);
    setFormError(null);
  };

  const handlePressKey = (key: AmountKey) => {
    setAmountExpr((prev) => applyAmountKey(prev, key));
    if (formError) {
      setFormError(null);
    }
  };

  const handleEvaluateExpression = () => {
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

  const handleSave = async (continueRecording: boolean) => {
    Keyboard.dismiss();
    setFormError(null);

    const amountCents = evaluateAmountExpression(amountExpr);
    if (amountCents === null || amountCents <= 0) {
      hapticWarning();
      setFormError('请输入大于 0 的金额');
      return;
    }
    if (amountCents > MAX_AMOUNT_CENTS) {
      hapticWarning();
      setFormError('金额超出上限');
      return;
    }
    if (!isValidIsoDate(occurredOn)) {
      hapticWarning();
      setFormError('日期格式无效');
      return;
    }
    if (!accountId) {
      hapticWarning();
      setFormError('请选择账户');
      return;
    }
    if (txType === 'transfer') {
      if (!effectiveToAccountId || effectiveToAccountId === accountId) {
        hapticWarning();
        setFormError('转出与转入账户不能相同');
        return;
      }
    } else if (!effectiveCategoryId) {
      hapticWarning();
      setFormError('请选择分类');
      return;
    }

    setSaving(true);
    try {
      const payload = {
        type: txType,
        amountCents,
        categoryId: txType === 'transfer' ? null : effectiveCategoryId,
        accountId,
        toAccountId: txType === 'transfer' ? effectiveToAccountId : null,
        occurredOn,
        note,
      };

      if (editId) {
        await updateTransaction(db, editId, payload);
      } else {
        await createTransaction(db, payload);
      }

      hapticSuccess();

      notifyChange();

      if (continueRecording && !editId) {
        if (txType !== 'transfer' && effectiveCategoryId) {
          setAccountMemory((prev) =>
            recordCategoryAccountMemory(prev, {
              txType,
              categoryId: effectiveCategoryId,
              accountId,
              categories,
            })
          );
        }
        // 进入下一笔：普通新增重置手动锁定，重新跟随分类记忆；从特定账户进入则维持该账户锁定
        setAccountLocked(Boolean(prefilledAccountId));
        setAmountExpr('');
        setNote('');
        setSavedNotice('已保存，继续记下一笔');
      } else {
        router.back();
      }
    } catch (err) {
      hapticWarning();
      setFormError(err instanceof Error ? err.message : '保存失败');
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

  const getTabAccentColor = (tab: RecordableTransactionType) =>
    tab === 'expense'
      ? theme.colors.expense
      : tab === 'income'
        ? theme.colors.income
        : theme.colors.transfer;

  const backdropOpacity = sheetTranslateY.interpolate({
    inputRange: [0, 1, Math.max(240, windowHeight * 0.65)],
    outputRange: [0, 0.34, 0],
    extrapolate: 'clamp',
  });

  return (
    <View style={styles.dismissContainer}>
      <Stack.Screen options={{ headerShown: false }} />

      {/* 向下滑动拖拽露出底页时显示柔和遮罩 */}
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
          {/* 顶部下拉退出热区：轻抓手条 + 关闭 + 支出/收入/转账切换 + 管理/删除入口 */}
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

              <View
                style={[
                  styles.topBar,
                  {
                    paddingHorizontal: theme.spacing.sm,
                  },
                ]}
              >
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

                <View style={styles.tabGroup}>
                  {TYPE_TABS.map((tab) => {
                    const selected = txType === tab.value;
                    return (
                      <Pressable
                        key={tab.value}
                        accessibilityRole="tab"
                        accessibilityState={{ selected }}
                        onPress={() => handleSelectTxType(tab.value)}
                        style={styles.tabItem}
                      >
                        <Text
                          style={{
                            color: selected ? theme.colors.text : theme.colors.textMuted,
                            fontSize: theme.fontSize.base,
                            fontWeight: selected
                              ? theme.fontWeight.semibold
                              : theme.fontWeight.regular,
                          }}
                        >
                          {tab.label}
                        </Text>
                        <View
                          style={[
                            styles.tabIndicator,
                            {
                              backgroundColor: selected
                                ? getTabAccentColor(tab.value)
                                : 'transparent',
                              borderRadius: theme.radius.full,
                            },
                          ]}
                        />
                      </Pressable>
                    );
                  })}
                </View>

                {isEditing ? (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="删除记录"
                    onPress={handleDelete}
                    hitSlop={8}
                    style={({ pressed }) => [
                      styles.topIconBtn,
                      pressed && { opacity: theme.opacity.pressed },
                    ]}
                  >
                    <AppIcon name="trash-outline" size={21} color={theme.colors.expense} />
                  </Pressable>
                ) : txType !== 'transfer' ? (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="分类管理"
                    onPress={() => {
                      hapticLight();
                      router.push('/categories');
                    }}
                    hitSlop={8}
                    style={({ pressed }) => [
                      styles.topIconBtn,
                      pressed && { opacity: theme.opacity.pressed },
                    ]}
                  >
                    <AppIcon name="options-outline" size={22} color={theme.colors.textSecondary} />
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
            {/* 上方主区域：二级分类网格 或 转账账户路由（顶部可跟手下拉退出） */}
            <GestureDetector gesture={bodyScrollGesture}>
              <ScrollView
                style={styles.flex}
                keyboardShouldPersistTaps="handled"
                scrollEventThrottle={16}
                onScroll={(e) => {
                  scrollOffsetYRef.current = e.nativeEvent.contentOffset.y;
                }}
                contentContainerStyle={{
                  paddingHorizontal: theme.spacing.sm,
                  paddingTop: theme.spacing.sm,
                  paddingBottom: theme.spacing.lg,
                }}
              >
                {txType !== 'transfer' ? (
                  <CategoryHierarchyPicker
                    nodes={categoryTree}
                    selectedCategoryId={effectiveCategoryId}
                    expandedRootId={effectiveExpandedRootId}
                    onSelectCategory={handleSelectCategory}
                    onToggleExpand={(rootId) => setExpandedRootId(rootId)}
                  />
                ) : (
                  <TransferRoutePanel
                    accounts={accounts}
                    sourceAccountId={accountId}
                    targetAccountId={effectiveToAccountId}
                    amountCents={evaluatedAmountCents}
                    onSelectSource={(pickedId) => {
                      setAccountId(pickedId);
                      setFormError(null);
                    }}
                    onSelectTarget={(pickedId) => {
                      setToAccountId(pickedId);
                      setFormError(null);
                    }}
                    onSwap={handleSwapTransferAccounts}
                  />
                )}
              </ScrollView>
            </GestureDetector>

            {/* 「再记」轻量保存反馈 */}
            {savedNotice ? (
              <View
                pointerEvents="none"
                style={[
                  styles.savedToast,
                  {
                    backgroundColor: theme.colors.actionSubtle,
                    borderRadius: theme.radius.full,
                    marginBottom: theme.spacing.sm,
                  },
                ]}
              >
                <AppIcon name="checkmark" size={14} color={theme.colors.actionTextOnSubtle} />
                <Text
                  style={{
                    color: theme.colors.actionTextOnSubtle,
                    fontSize: theme.fontSize.xs,
                    fontWeight: theme.fontWeight.semibold,
                    marginLeft: theme.spacing.xs,
                  }}
                >
                  {savedNotice}
                </Text>
              </View>
            ) : null}

            {/* 下方输入栏 + 自制数字计算键盘 */}
            <RecordKeypad
              txType={txType}
              amountExpr={amountExpr}
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
              onEvaluate={handleEvaluateExpression}
              onSave={(continueRecording) => void handleSave(continueRecording)}
              isEditing={isEditing}
              saving={saving}
              disabled={loading || (txType === 'transfer' && accounts.length < 2)}
              accounts={accounts}
              selectedAccountId={accountId}
              onSelectAccount={handleManualSelectAccount}
              transferRouteSummary={
                txType === 'transfer' && sourceAccount && targetAccount
                  ? {
                      sourceName: sourceAccount.name,
                      targetName: targetAccount.name,
                      onSwap: handleSwapTransferAccounts,
                    }
                  : null
              }
              occurredOn={occurredOn}
              onPressDate={() => {
                hapticLight();
                setDateSheetOpen(true);
              }}
              selectedCategoryLabel={selectedCategoryInfo?.label ?? null}
              formError={formError}
            />
          </KeyboardAvoidingView>

          {/* 自制底部日期面板 */}
          <DatePickerSheet
            visible={dateSheetOpen}
            selectedDate={occurredOn}
            onSelect={(iso) => {
              hapticSelection();
              setOccurredOn(iso);
              setFormError(null);
            }}
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
        </SafeScreen>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  dismissContainer: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  sheetPage: {
    flex: 1,
  },
  flex: {
    flex: 1,
  },
  dragIndicatorRow: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 6,
    paddingBottom: 2,
  },
  dragIndicatorBar: {
    width: 34,
    height: 4,
  },
  topBar: {
    height: 48,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  topIconBtn: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 24,
  },
  tabItem: {
    minHeight: 44,
    paddingHorizontal: 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabIndicator: {
    width: 24,
    height: 3,
    marginTop: 4,
  },
  savedToast: {
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 6,
  },
});
