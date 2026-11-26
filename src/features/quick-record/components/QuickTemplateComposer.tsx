/**
 * 约束简报（Workflow B / C）：
 * - 内嵌于 QuickRecordSheet 的非全屏「新增 / 编辑快捷卡片」视图（告别独立 Modal 弹窗，顶部留白透出底页不铺满全屏）
 * - UI 100% 复用完整记一笔：中部直接复用 CategoryHierarchyPicker（5 列一二级分类网格与原地二级抽屉），底部直接复用 RecordKeypad（横向直选账户卡片 + 4×4 计算键盘）
 * - 快捷记账专属裁剪：仅支持支出/收入（通过统一 SlidingSegmentedControl 切换），隐藏日期按钮，不支持备注输入，将原备注位置改造为「快捷卡片名称」
 */
import React, { useMemo, useState } from 'react';
import { Keyboard, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { getTodayIsoDate } from '../../../shared/date/date';
import {
  hapticLight,
  hapticMedium,
  hapticSuccess,
  hapticWarning,
} from '../../../shared/haptics/haptics';
import { centsToInputString, MAX_AMOUNT_CENTS } from '../../../shared/money/money';
import { AppIcon } from '../../../shared/ui/AppIcon';
import {
  SlidingSegmentedControl,
  type SlidingSegmentOption,
} from '../../../shared/ui/SlidingSegmentedControl';
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
  initialValue: QuickTemplateComposerInitialValue | null;
  categories: readonly Category[];
  accounts: readonly Account[];
  onBack: () => void;
  onSave: (input: CreateQuickTemplateInput, editingId?: string) => Promise<void>;
  onDelete?: (editingId: string) => Promise<void>;
}

export function QuickTemplateComposer({
  initialValue,
  categories,
  accounts,
  onBack,
  onSave,
  onDelete,
}: QuickTemplateComposerProps): React.JSX.Element {
  const { theme } = useTheme();

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

  const typeOptions = useMemo<readonly SlidingSegmentOption<QuickRecordType>[]>(
    () => [
      {
        value: 'expense',
        label: '支出',
        activeBackgroundColor: theme.colors.expenseSubtle,
        activeTextColor: theme.colors.expenseTextOnSubtle,
      },
      {
        value: 'income',
        label: '收入',
        activeBackgroundColor: theme.colors.incomeSubtle,
        activeTextColor: theme.colors.incomeTextOnSubtle,
      },
    ],
    [
      theme.colors.expenseSubtle,
      theme.colors.expenseTextOnSubtle,
      theme.colors.incomeSubtle,
      theme.colors.incomeTextOnSubtle,
    ]
  );

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

  return (
    <View style={styles.root}>
      {/* 顶部栏：返回快捷卡片网格 + 支出/收入统一滑动切换 + 编辑态删除 */}
      <View
        style={[
          styles.topBar,
          {
            paddingHorizontal: theme.spacing.md,
            paddingBottom: theme.spacing.sm,
            borderBottomColor: theme.colors.border,
            borderBottomWidth: theme.borderWidth.hairline,
          },
        ]}
      >
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="返回快捷记账列表"
          disabled={submitting}
          onPress={() => {
            Keyboard.dismiss();
            hapticLight();
            onBack();
          }}
          hitSlop={8}
          style={({ pressed }) => [
            styles.iconBtn,
            pressed && { opacity: theme.opacity.pressed },
          ]}
        >
          <AppIcon name="chevron-back" size={22} color={theme.colors.text} />
        </Pressable>

        <View style={styles.segmentCenter}>
          <SlidingSegmentedControl
            options={typeOptions}
            value={txType}
            onChange={handleSelectType}
            height={36}
            minSegmentWidth={64}
            shape="pill"
            trackTone="surface"
            textSize="sm"
            disabled={submitting}
          />
        </View>

        {isEditing && onDelete ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="删除该快捷卡片"
            disabled={submitting}
            onPress={() => void handleDelete()}
            hitSlop={8}
            style={({ pressed }) => [
              styles.iconBtn,
              pressed && { opacity: theme.opacity.pressed },
            ]}
          >
            <AppIcon name="trash-outline" size={20} color={theme.colors.expense} />
          </Pressable>
        ) : (
          <View style={styles.iconBtn} />
        )}
      </View>

      {/* 中部主区：直接复用完整记一笔的 5 列二级分类选择器 */}
      <ScrollView
        style={[styles.categoryScroll, { backgroundColor: theme.colors.surface }]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{
          paddingHorizontal: theme.spacing.sm,
          paddingTop: theme.spacing.sm,
          paddingBottom: theme.spacing.md,
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

      {/* 底部键盘与输入融合区：复用 RecordKeypad，备注位改为快捷卡片名称，隐藏日期 */}
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
        notePlaceholder="输入快捷卡片名称..."
        noteAccessibilityLabel="快捷卡片名称"
        noteIconName="pricetag-outline"
        noteMaxLength={12}
        hideDateButton
        forceClearSecondary
        includeBottomInset={false}
        saveAccessibilityLabel="保存快捷卡片"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  iconBtn: {
    width: 38,
    height: 38,
    alignItems: 'center',
    justifyContent: 'center',
  },
  segmentCenter: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  categoryScroll: {
    flex: 1,
  },
});
