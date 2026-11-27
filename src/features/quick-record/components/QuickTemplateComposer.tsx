/**
 * 约束简报（Workflow B / C）：
 * - 全屏快捷卡片新增/编辑浮层：1:1 对齐完整「记一笔」（app/record.tsx）的视觉与交互结构（顶部支出/收入切换、中部 5 列二级分类选择器、底部横向直选账户与 4×4 自制计算键盘）
 * - 快捷记账专属差异：移除「转账」页签与日期按钮，将备注输入位改造为「快捷方式卡片名称」（最多 12 字，未填自动跟随所选分类名）
 * - 动效与手势：自底向上全屏滑入；顶部栏随时及分类区处于顶部（scrollOffsetY <= 2）时支持 1:1 跟手向下滑动收起；下滑收起、左上角返回、保存/删除及系统返回键均仅退回下方快捷记账面板，不关闭整个面板
 */
import { useRouter } from 'expo-router';
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
import { getTodayIsoDate } from '../../../shared/date/date';
import {
  hapticLight,
  hapticMedium,
  hapticSelection,
  hapticSuccess,
  hapticWarning,
} from '../../../shared/haptics/haptics';
import { centsToInputString, MAX_AMOUNT_CENTS } from '../../../shared/money/money';
import { AppIcon } from '../../../shared/ui/AppIcon';
import { SafeScreen } from '../../../shared/ui/SafeScreen';
import { useTheme } from '../../../theme/theme-context';
import type { Account } from '../../accounts/types';
import { CategoryHierarchyPicker } from '../../categories/components/CategoryHierarchyPicker';
import { buildCategoryTree } from '../../categories/rules';
import type { Category } from '../../categories/types';
import {
  applyAmountKey,
  centsToAmountExpression,
  evaluateAmountExpression,
  type AmountKey,
} from '../../transactions/amount-expression';
import { RecordKeypad } from '../../transactions/components/RecordKeypad';
import type { CreateQuickTemplateInput, QuickRecordType } from '../types';

const TYPE_TABS: readonly { value: QuickRecordType; label: string }[] = [
  { value: 'expense', label: '支出' },
  { value: 'income', label: '收入' },
];

export interface QuickTemplateComposerInitialValue {
  /** 仅编辑已保存的自定义模板时有值；新增或从推荐收藏时为 undefined */
  id?: string;
  name: string;
  type: QuickRecordType;
  amountCents: number;
  categoryId: string;
  accountId: string;
}

export interface QuickTemplateComposerProps {
  visible: boolean;
  sessionKey: number;
  initialValue: QuickTemplateComposerInitialValue | null;
  categories: readonly Category[];
  accounts: readonly Account[];
  /** 收起编辑页返回快捷记账面板（等同返回键，不关闭下方快捷面板） */
  onBack: () => void;
  onSave: (input: CreateQuickTemplateInput, editingId?: string) => Promise<void>;
  onDelete?: (editingId: string) => Promise<void>;
}

interface ComposerInnerProps {
  initialValue: QuickTemplateComposerInitialValue | null;
  categories: readonly Category[];
  accounts: readonly Account[];
  onBack: () => void;
  onSave: (input: CreateQuickTemplateInput, editingId?: string) => Promise<void>;
  onDelete?: (editingId: string) => Promise<void>;
  sheetTranslateY: Animated.Value;
  onRequestDismiss: () => void;
  onSpringBack: () => void;
}

function QuickTemplateComposerInner({
  initialValue,
  categories,
  accounts,
  onBack,
  onSave,
  onDelete,
  sheetTranslateY,
  onRequestDismiss,
  onSpringBack,
}: ComposerInnerProps): React.JSX.Element {
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { height: windowHeight } = useWindowDimensions();

  const windowHeightRef = useRef(windowHeight);
  const scrollOffsetYRef = useRef(0);
  const headerDraggingRef = useRef(false);
  const bodyDraggingRef = useRef(false);
  const dismissedRef = useRef(false);

  useEffect(() => {
    windowHeightRef.current = windowHeight;
  }, [windowHeight]);

  const topInset =
    Platform.OS === 'android'
      ? Math.max(insets.top, RNStatusBar.currentHeight ?? 0)
      : insets.top;

  const triggerSwipeDismiss = useCallback(() => {
    if (dismissedRef.current) {
      return;
    }
    dismissedRef.current = true;
    Keyboard.dismiss();
    hapticLight();
    onRequestDismiss();
  }, [onRequestDismiss]);

  // 顶部栏随时支持向下跟手滑出返回快捷记账面板（不支持上滑）
  const headerDismissPan = usePanGesture({
    enabled: true,
    disableReanimated: true,
    runOnJS: true,
    activeOffsetY: 10,
    failOffsetX: [-20, 20],
    onActivate: () => {
      if (dismissedRef.current) {
        return;
      }
      Keyboard.dismiss();
      headerDraggingRef.current = true;
    },
    onUpdate: (event) => {
      if (!headerDraggingRef.current || dismissedRef.current) {
        return;
      }
      sheetTranslateY.setValue(Math.max(0, event.translationY));
    },
    onDeactivate: (event) => {
      if (!headerDraggingRef.current || dismissedRef.current) {
        return;
      }
      headerDraggingRef.current = false;
      const threshold = Math.min(windowHeightRef.current * 0.24, 170);
      const projected = event.translationY + event.velocityY * 0.14;
      if (projected > threshold || (event.velocityY > 750 && event.translationY > 36)) {
        triggerSwipeDismiss();
      } else {
        onSpringBack();
      }
    },
    onFinalize: () => {
      if (headerDraggingRef.current && !dismissedRef.current) {
        headerDraggingRef.current = false;
        onSpringBack();
      }
    },
  });

  // 分类区处于顶部（scrollOffsetY <= 2）时向下拉跟手滑出返回，不干扰正常分类滚动
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
      if (dismissedRef.current || scrollOffsetYRef.current > 2 || event.translationY < 0) {
        bodyDraggingRef.current = false;
        return;
      }
      Keyboard.dismiss();
      bodyDraggingRef.current = true;
    },
    onUpdate: (event) => {
      if (!bodyDraggingRef.current || dismissedRef.current) {
        return;
      }
      if (event.translationY < 0) {
        sheetTranslateY.setValue(0);
        return;
      }
      sheetTranslateY.setValue(event.translationY);
    },
    onDeactivate: (event) => {
      if (!bodyDraggingRef.current || dismissedRef.current) {
        return;
      }
      bodyDraggingRef.current = false;
      const threshold = Math.min(windowHeightRef.current * 0.24, 170);
      const projected = event.translationY + event.velocityY * 0.14;
      if (projected > threshold || (event.velocityY > 750 && event.translationY > 36)) {
        triggerSwipeDismiss();
      } else {
        onSpringBack();
      }
    },
    onFinalize: () => {
      if (bodyDraggingRef.current && !dismissedRef.current) {
        bodyDraggingRef.current = false;
        onSpringBack();
      }
    },
  });

  const bodyScrollGesture = useSimultaneousGestures(bodyDismissPan, nativeScrollGesture);

  const activeCategories = useMemo(
    () => categories.filter((c) => !c.isArchived),
    [categories]
  );
  const activeAccounts = useMemo(
    () => accounts.filter((a) => !a.isArchived),
    [accounts]
  );

  const initType: QuickRecordType = initialValue?.type ?? 'expense';
  const initTypedCats = activeCategories.filter((c) => c.type === initType);
  const initFirstCatId = buildCategoryTree(initTypedCats)[0]?.category.id ?? null;

  const [txType, setTxType] = useState<QuickRecordType>(initType);
  const [cardName, setCardName] = useState(initialValue?.name ?? '');
  const [nameManuallyEdited, setNameManuallyEdited] = useState(Boolean(initialValue?.name));
  const [amountExpr, setAmountExpr] = useState(() =>
    initialValue && initialValue.amountCents > 0
      ? centsToInputString(initialValue.amountCents)
      : ''
  );
  const [categoryId, setCategoryId] = useState<string | null>(() =>
    initialValue?.categoryId && initTypedCats.some((c) => c.id === initialValue.categoryId)
      ? initialValue.categoryId
      : initFirstCatId
  );
  const [expandedRootId, setExpandedRootId] = useState<string | null | undefined>(undefined);
  const [accountId, setAccountId] = useState<string>(() =>
    initialValue?.accountId && activeAccounts.some((a) => a.id === initialValue.accountId)
      ? initialValue.accountId
      : (activeAccounts[0]?.id ?? '')
  );
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const editingId = initialValue?.id;
  const isEditing = Boolean(editingId);

  const categoriesForType = useMemo(
    () => activeCategories.filter((c) => c.type === txType),
    [activeCategories, txType]
  );

  const categoryTree = useMemo(
    () => buildCategoryTree(categoriesForType),
    [categoriesForType]
  );

  const effectiveCategoryId = useMemo(() => {
    if (categoryId && categoriesForType.some((c) => c.id === categoryId)) {
      return categoryId;
    }
    return categoryTree[0]?.category.id ?? null;
  }, [categoriesForType, categoryId, categoryTree]);

  const selectedCategoryInfo = useMemo(() => {
    if (!effectiveCategoryId) {
      return null;
    }
    const selected = categoriesForType.find((c) => c.id === effectiveCategoryId);
    if (!selected) {
      return null;
    }
    if (selected.parentId) {
      const parent = categoriesForType.find((c) => c.id === selected.parentId);
      return {
        rootId: parent ? parent.id : selected.id,
        shortName: selected.name,
        label: parent ? `${parent.name} · ${selected.name}` : selected.name,
      };
    }
    return {
      rootId: selected.id,
      shortName: selected.name,
      label: selected.name,
    };
  }, [categoriesForType, effectiveCategoryId]);

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
  }, [categoryTree, expandedRootId, selectedCategoryInfo]);

  const effectiveAccountId = activeAccounts.some((a) => a.id === accountId)
    ? accountId
    : (activeAccounts[0]?.id ?? '');

  const handleSelectType = (nextType: QuickRecordType) => {
    Keyboard.dismiss();
    if (nextType === txType) {
      return;
    }
    hapticSelection();
    setTxType(nextType);
    setExpandedRootId(undefined);
    setFormError(null);
    const nextCats = activeCategories.filter((c) => c.type === nextType);
    const nextDefault = buildCategoryTree(nextCats)[0]?.category ?? null;
    setCategoryId(nextDefault?.id ?? null);
    if (!nameManuallyEdited && nextDefault) {
      setCardName(nextDefault.name.slice(0, 12));
    }
  };

  const handleSelectCategory = (pickedId: string) => {
    Keyboard.dismiss();
    setCategoryId(pickedId);
    if (formError) {
      setFormError(null);
    }
    if (!nameManuallyEdited) {
      const picked = categoriesForType.find((c) => c.id === pickedId);
      if (picked) {
        setCardName(picked.name.slice(0, 12));
      }
    }
  };

  const handlePressKey = (key: AmountKey) => {
    setAmountExpr((prev) => applyAmountKey(prev, key));
    if (formError) {
      setFormError(null);
    }
  };

  const handleEvaluate = () => {
    const res = evaluateAmountExpression(amountExpr);
    if (res === null || res <= 0) {
      hapticWarning();
      setFormError('计算结果须大于 0');
      return;
    }
    if (res > MAX_AMOUNT_CENTS) {
      hapticWarning();
      setFormError('金额超出上限');
      return;
    }
    setAmountExpr(centsToAmountExpression(res));
    setFormError(null);
  };

  const handleSave = async () => {
    if (submitting) {
      return;
    }
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
    if (!effectiveCategoryId) {
      hapticWarning();
      setFormError('请选择分类');
      return;
    }
    if (!effectiveAccountId) {
      hapticWarning();
      setFormError('暂无可用账户');
      return;
    }

    const resolvedName = (cardName.trim() || selectedCategoryInfo?.shortName || '').slice(0, 12);
    if (!resolvedName) {
      hapticWarning();
      setFormError('请输入快捷卡片名称');
      return;
    }

    setSubmitting(true);
    try {
      await onSave(
        {
          name: resolvedName,
          type: txType,
          amountCents,
          categoryId: effectiveCategoryId,
          accountId: effectiveAccountId,
          note: '',
        },
        editingId
      );
      hapticSuccess();
      onBack();
    } catch (err) {
      hapticWarning();
      setFormError(err instanceof Error ? err.message : '保存失败');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!editingId || !onDelete || submitting) {
      return;
    }
    Keyboard.dismiss();
    setSubmitting(true);
    setFormError(null);
    try {
      await onDelete(editingId);
      hapticMedium();
      onBack();
    } catch (err) {
      hapticWarning();
      setFormError(err instanceof Error ? err.message : '删除失败');
    } finally {
      setSubmitting(false);
    }
  };

  const getTabAccentColor = (tab: QuickRecordType) =>
    tab === 'expense' ? theme.colors.expense : theme.colors.income;

  return (
    <SafeScreen
      edges={['top', 'left', 'right']}
      topBackgroundColor={theme.colors.surfaceRaised}
    >
      {/* 顶部栏（与完整记一笔一致，移除转账）：整个顶栏区域支持跟手向下滑动返回快捷记账 */}
      <GestureDetector gesture={headerDismissPan}>
        <View
          style={{
            backgroundColor: theme.colors.surfaceRaised,
            borderBottomColor: theme.colors.border,
            borderBottomWidth: theme.borderWidth.hairline,
          }}
        >
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
              accessibilityLabel="返回快捷记账"
              disabled={submitting}
              onPress={() => {
                Keyboard.dismiss();
                hapticLight();
                onBack();
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
                    disabled={submitting}
                    onPress={() => handleSelectType(tab.value)}
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

            {isEditing && onDelete ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="删除该快捷卡片"
                disabled={submitting}
                onPress={() => void handleDelete()}
                hitSlop={8}
                style={({ pressed }) => [
                  styles.topIconBtn,
                  pressed && { opacity: theme.opacity.pressed },
                ]}
              >
                <AppIcon name="trash-outline" size={21} color={theme.colors.expense} />
              </Pressable>
            ) : (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="分类管理"
                disabled={submitting}
                onPress={() => {
                  Keyboard.dismiss();
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
            )}
          </View>
        </View>
      </GestureDetector>

      <KeyboardAvoidingView
        style={styles.flex}
        behavior="padding"
        keyboardVerticalOffset={topInset}
      >
        {/* 中部主区：复用完整记一笔 5 列二级分类网格，滚动至顶部时支持跟手向下滑出返回 */}
        <GestureDetector gesture={bodyScrollGesture}>
          <ScrollView
            style={[styles.flex, { backgroundColor: theme.colors.surface }]}
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
            <CategoryHierarchyPicker
              nodes={categoryTree}
              selectedCategoryId={effectiveCategoryId}
              expandedRootId={effectiveExpandedRootId}
              onSelectCategory={handleSelectCategory}
              onToggleExpand={(rootId) => setExpandedRootId(rootId)}
            />
          </ScrollView>
        </GestureDetector>

        {/* 底部键盘与输入区：与完整记一笔一致，备注位改为快捷方式卡片名称，隐藏日期 */}
        <RecordKeypad
          txType={txType}
          amountExpr={amountExpr}
          note={cardName}
          onChangeNote={(text) => {
            setCardName(text);
            setNameManuallyEdited(text.trim().length > 0);
            if (formError) {
              setFormError(null);
            }
          }}
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
          saving={submitting}
          disabled={activeAccounts.length === 0 || categoriesForType.length === 0}
          accounts={activeAccounts}
          selectedAccountId={effectiveAccountId}
          onSelectAccount={(pickedId) => {
            setAccountId(pickedId);
            setFormError(null);
          }}
          occurredOn={getTodayIsoDate()}
          onPressDate={() => {}}
          selectedCategoryLabel={selectedCategoryInfo?.label ?? null}
          formError={formError}
          notePlaceholder="快捷卡片名称..."
          noteAccessibilityLabel="快捷方式卡片名称"
          noteIconName="pricetag-outline"
          noteMaxLength={12}
          hideDateButton
          forceClearSecondary
          includeBottomInset
          saveAccessibilityLabel="保存快捷卡片"
        />
      </KeyboardAvoidingView>
    </SafeScreen>
  );
}

export function QuickTemplateComposer({
  visible,
  sessionKey,
  initialValue,
  categories,
  accounts,
  onBack,
  onSave,
  onDelete,
}: QuickTemplateComposerProps): React.JSX.Element | null {
  const { theme } = useTheme();
  const { height: windowHeight } = useWindowDimensions();

  const [mounted, setMounted] = useState(visible);
  if (visible && !mounted) {
    setMounted(true);
  }

  const [sheetTranslateY] = useState(() => new Animated.Value(visible ? 0 : Math.max(windowHeight, 700)));
  const visibleRef = useRef(visible);
  const windowHeightRef = useRef(windowHeight);

  useEffect(() => {
    visibleRef.current = visible;
    windowHeightRef.current = windowHeight;
  }, [visible, windowHeight]);

  useEffect(() => {
    if (!mounted) {
      return;
    }
    if (visible) {
      sheetTranslateY.setValue(Math.max(windowHeightRef.current, 600));
      Animated.timing(sheetTranslateY, {
        toValue: 0,
        duration: 240,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }).start();
    } else {
      Keyboard.dismiss();
      Animated.timing(sheetTranslateY, {
        toValue: Math.max(windowHeightRef.current, 600),
        duration: 190,
        easing: Easing.in(Easing.cubic),
        useNativeDriver: true,
      }).start(({ finished }) => {
        if (finished && !visibleRef.current) {
          setMounted(false);
        }
      });
    }
  }, [mounted, sheetTranslateY, visible]);

  const springSheetBack = useCallback(() => {
    Animated.spring(sheetTranslateY, {
      toValue: 0,
      useNativeDriver: true,
      stiffness: 300,
      damping: 30,
      mass: 0.9,
    }).start();
  }, [sheetTranslateY]);

  if (!mounted) {
    return null;
  }

  const backdropOpacity = sheetTranslateY.interpolate({
    inputRange: [0, Math.max(240, windowHeight * 0.7)],
    outputRange: [0.36, 0],
    extrapolate: 'clamp',
  });

  return (
    <View
      style={[StyleSheet.absoluteFill, styles.fullOverlay]}
      pointerEvents={visible ? 'auto' : 'none'}
    >
      {/* 下滑拖拽露出下方快捷记账面板时的柔和过渡暗幕 */}
      <Animated.View
        pointerEvents="none"
        style={[
          StyleSheet.absoluteFill,
          { backgroundColor: theme.colors.scrim, opacity: backdropOpacity },
        ]}
      />

      <Animated.View
        style={[
          styles.fullPage,
          {
            backgroundColor: theme.colors.surface,
            transform: [{ translateY: sheetTranslateY }],
          },
        ]}
      >
        <QuickTemplateComposerInner
          key={sessionKey}
          initialValue={initialValue}
          categories={categories}
          accounts={accounts}
          onBack={onBack}
          onSave={onSave}
          onDelete={onDelete}
          sheetTranslateY={sheetTranslateY}
          onRequestDismiss={onBack}
          onSpringBack={springSheetBack}
        />
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  fullOverlay: {
    zIndex: 130,
    elevation: 30,
  },
  fullPage: {
    flex: 1,
  },
  flex: {
    flex: 1,
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
    gap: 28,
  },
  tabItem: {
    minHeight: 44,
    paddingHorizontal: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabIndicator: {
    width: 24,
    height: 3,
    marginTop: 4,
  },
});
