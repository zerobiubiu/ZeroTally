/**
 * 约束简报（Workflow B / C）：
 * - 居中模态浮窗：新增/编辑快捷记账一键模板（或将高频推荐固定为自定义模板）
 * - 金额校验：复用 parseYuanToCents 整数分解析，严禁业务层浮点运算；全部输入与按钮遵循主题语义令牌与 Haptics 反馈
 */
import React, { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { hapticLight, hapticMedium, hapticSelection, hapticSuccess, hapticWarning } from '../../../shared/haptics/haptics';
import { centsToInputString, parseYuanToCents } from '../../../shared/money/money';
import { AppIcon } from '../../../shared/ui/AppIcon';
import {
  SlidingSegmentedControl,
  type SlidingSegmentOption,
} from '../../../shared/ui/SlidingSegmentedControl';
import { useTheme } from '../../../theme/theme-context';
import type { Account } from '../../accounts/types';
import { buildCategoryTree } from '../../categories/rules';
import type { Category } from '../../categories/types';
import type { CreateQuickTemplateInput, QuickRecordType } from '../types';

export interface QuickTemplateEditorInitialValue {
  /** 仅编辑已保存的自定义模板时有值；新增或从推荐收藏时为 undefined */
  id?: string;
  name: string;
  type: QuickRecordType;
  amountCents: number;
  categoryId: string;
  accountId: string;
  note: string;
}

export interface QuickTemplateEditorDialogProps {
  visible: boolean;
  initialValue: QuickTemplateEditorInitialValue | null;
  categories: readonly Category[];
  accounts: readonly Account[];
  onClose: () => void;
  onSave: (input: CreateQuickTemplateInput, editingId?: string) => Promise<void>;
  onDelete?: (editingId: string) => Promise<void>;
}

export function QuickTemplateEditorDialog({
  visible,
  initialValue,
  categories,
  accounts,
  onClose,
  onSave,
  onDelete,
}: QuickTemplateEditorDialogProps): React.JSX.Element {
  const { theme } = useTheme();

  const activeCategories = useMemo(
    () => categories.filter((c) => !c.isArchived),
    [categories]
  );
  const activeAccounts = useMemo(
    () => accounts.filter((a) => !a.isArchived),
    [accounts]
  );

  const [type, setType] = useState<QuickRecordType>('expense');
  const [name, setName] = useState('');
  const [amountText, setAmountText] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [accountId, setAccountId] = useState('');
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const [prevSyncKey, setPrevSyncKey] = useState<string | null>(null);
  const syncKey = visible
    ? `${initialValue?.id ?? 'new'}|${initialValue?.name ?? ''}|${initialValue?.type ?? ''}|${initialValue?.amountCents ?? 0}|${initialValue?.categoryId ?? ''}|${initialValue?.accountId ?? ''}`
    : null;

  if (syncKey !== prevSyncKey) {
    setPrevSyncKey(syncKey);
    if (visible) {
      const nextType: QuickRecordType = initialValue?.type ?? 'expense';
      const matchingCats = activeCategories.filter((c) => c.type === nextType);
      const firstCatId = buildCategoryTree(matchingCats)[0]?.category.id ?? matchingCats[0]?.id ?? '';
      const resolvedCatId =
        initialValue?.categoryId && matchingCats.some((c) => c.id === initialValue.categoryId)
          ? initialValue.categoryId
          : firstCatId;
      const resolvedAccId =
        initialValue?.accountId && activeAccounts.some((a) => a.id === initialValue.accountId)
          ? initialValue.accountId
          : (activeAccounts[0]?.id ?? '');

      setType(nextType);
      setName(initialValue?.name ?? '');
      setAmountText(
        initialValue && initialValue.amountCents > 0
          ? centsToInputString(initialValue.amountCents)
          : ''
      );
      setCategoryId(resolvedCatId);
      setAccountId(resolvedAccId);
      setNote(initialValue?.note ?? '');
      setError(null);
      setSubmitting(false);
    }
  }

  const selectableCategories = useMemo(() => {
    const typed = activeCategories.filter((c) => c.type === type);
    const tree = buildCategoryTree(typed);
    const flat: { item: Category; displayLabel: string }[] = [];
    for (const node of tree) {
      flat.push({ item: node.category, displayLabel: node.category.name });
      for (const child of node.children) {
        flat.push({ item: child, displayLabel: `${node.category.name}·${child.name}` });
      }
    }
    return flat;
  }, [activeCategories, type]);

  const effectiveCategoryId = selectableCategories.some((c) => c.item.id === categoryId)
    ? categoryId
    : (selectableCategories[0]?.item.id ?? '');

  const effectiveAccountId = activeAccounts.some((a) => a.id === accountId)
    ? accountId
    : (activeAccounts[0]?.id ?? '');

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

  const handleSelectType = (next: QuickRecordType) => {
    if (next === type) {
      return;
    }
    setType(next);
    const nextTyped = activeCategories.filter((c) => c.type === next);
    const nextFirst = buildCategoryTree(nextTyped)[0]?.category.id ?? nextTyped[0]?.id ?? '';
    setCategoryId(nextFirst);
    setError(null);
  };

  const handleSelectCategory = (cat: Category) => {
    hapticSelection();
    setCategoryId(cat.id);
    if (!name.trim()) {
      setName(cat.name.slice(0, 12));
    }
    setError(null);
  };

  const handleSave = async () => {
    if (submitting) {
      return;
    }
    const trimmedName = name.trim();
    if (!trimmedName) {
      hapticWarning();
      setError('请输入快捷项名称');
      return;
    }
    const parsedCents = parseYuanToCents(amountText);
    if (parsedCents === null || parsedCents <= 0) {
      hapticWarning();
      setError('请输入大于 0 的有效金额（最多两位小数）');
      return;
    }
    if (!effectiveCategoryId) {
      hapticWarning();
      setError('当前类型暂无可用分类');
      return;
    }
    if (!effectiveAccountId) {
      hapticWarning();
      setError('暂无可用账户');
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      await onSave(
        {
          name: trimmedName,
          type,
          amountCents: parsedCents,
          categoryId: effectiveCategoryId,
          accountId: effectiveAccountId,
          note: note.trim(),
        },
        editingId
      );
      hapticSuccess();
      onClose();
    } catch (err) {
      hapticWarning();
      setError(err instanceof Error ? err.message : '保存失败');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!editingId || !onDelete || submitting) {
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await onDelete(editingId);
      hapticMedium();
      onClose();
    } catch (err) {
      hapticWarning();
      setError(err instanceof Error ? err.message : '删除失败');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={() => {
        if (!submitting) {
          onClose();
        }
      }}
    >
      <GestureHandlerRootView style={styles.flex}>
        <KeyboardAvoidingView style={styles.backdrop} behavior="padding">
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="关闭快捷项编辑窗口"
          onPress={() => {
            if (!submitting) {
              onClose();
            }
          }}
          style={[StyleSheet.absoluteFill, { backgroundColor: theme.colors.scrim }]}
        />

        <View
          style={[
            styles.dialog,
            theme.elevation.floating,
            {
              backgroundColor: theme.colors.surfaceRaised,
              borderRadius: theme.radius.lg,
              borderColor: theme.colors.border,
              borderWidth: theme.borderWidth.hairline,
            },
          ]}
        >
          {/* 标题行 */}
          <View
            style={[
              styles.header,
              {
                paddingHorizontal: theme.spacing.lg,
                paddingTop: theme.spacing.lg,
                paddingBottom: theme.spacing.md,
                borderBottomColor: theme.colors.border,
                borderBottomWidth: theme.borderWidth.hairline,
              },
            ]}
          >
            <Text
              style={{
                color: theme.colors.text,
                fontSize: theme.fontSize.lg,
                fontWeight: theme.fontWeight.semibold,
              }}
            >
              {isEditing ? '编辑快捷记账' : '新增快捷记账'}
            </Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="关闭"
              disabled={submitting}
              onPress={onClose}
              hitSlop={8}
              style={({ pressed }) => [
                styles.closeBtn,
                pressed && { opacity: theme.opacity.pressed },
              ]}
            >
              <AppIcon name="close" size={20} color={theme.colors.textSecondary} />
            </Pressable>
          </View>

          <ScrollView
            style={styles.bodyScroll}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={{
              paddingHorizontal: theme.spacing.lg,
              paddingVertical: theme.spacing.md,
              gap: theme.spacing.md,
            }}
          >
            {/* 支出 / 收入统一滑动分段切换 */}
            <SlidingSegmentedControl
              options={typeOptions}
              value={type}
              onChange={handleSelectType}
              fullWidth
              height={40}
              shape="rounded"
              trackTone="surface"
              textSize="sm"
            />

            {/* 名称与固定金额 */}
            <View style={styles.twoColRow}>
              <View style={styles.colItem}>
                <Text style={[styles.fieldLabel, { color: theme.colors.textSecondary }]}>
                  名称
                </Text>
                <TextInput
                  value={name}
                  onChangeText={(text) => {
                    setName(text);
                    if (error) setError(null);
                  }}
                  placeholder="如：早餐、地铁"
                  placeholderTextColor={theme.colors.textMuted}
                  maxLength={12}
                  style={[
                    styles.input,
                    {
                      backgroundColor: theme.colors.surface,
                      borderColor: theme.colors.border,
                      borderRadius: theme.radius.md,
                      color: theme.colors.text,
                      fontSize: theme.fontSize.sm,
                    },
                  ]}
                />
              </View>

              <View style={styles.colItem}>
                <Text style={[styles.fieldLabel, { color: theme.colors.textSecondary }]}>
                  固定金额（元）
                </Text>
                <TextInput
                  value={amountText}
                  onChangeText={(text) => {
                    setAmountText(text);
                    if (error) setError(null);
                  }}
                  placeholder="0.00"
                  placeholderTextColor={theme.colors.textMuted}
                  keyboardType="decimal-pad"
                  maxLength={12}
                  style={[
                    styles.input,
                    styles.tabular,
                    {
                      backgroundColor: theme.colors.surface,
                      borderColor: theme.colors.border,
                      borderRadius: theme.radius.md,
                      color: theme.colors.text,
                      fontSize: theme.fontSize.sm,
                    },
                  ]}
                />
              </View>
            </View>

            {/* 选择分类 */}
            <View>
              <Text style={[styles.fieldLabel, { color: theme.colors.textSecondary }]}>分类</Text>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                keyboardShouldPersistTaps="handled"
                contentContainerStyle={styles.chipsRow}
              >
                {selectableCategories.map(({ item, displayLabel }) => {
                  const selected = item.id === effectiveCategoryId;
                  return (
                    <Pressable
                      key={item.id}
                      accessibilityRole="button"
                      accessibilityState={{ selected }}
                      onPress={() => handleSelectCategory(item)}
                      style={({ pressed }) => [
                        styles.chip,
                        {
                          backgroundColor: selected
                            ? theme.colors.actionSubtle
                            : theme.colors.surface,
                          borderColor: selected ? theme.colors.action : theme.colors.border,
                          borderWidth: selected
                            ? theme.borderWidth.focus
                            : theme.borderWidth.hairline,
                          borderRadius: theme.radius.full,
                        },
                        pressed && { opacity: theme.opacity.pressed },
                      ]}
                    >
                      <View style={[styles.chipIconDot, { backgroundColor: `${item.color}22` }]}>
                        <AppIcon name={item.icon} size={13} color={item.color} />
                      </View>
                      <Text
                        numberOfLines={1}
                        style={{
                          color: selected ? theme.colors.actionTextOnSubtle : theme.colors.text,
                          fontSize: theme.fontSize.xs,
                          fontWeight: selected
                            ? theme.fontWeight.semibold
                            : theme.fontWeight.regular,
                        }}
                      >
                        {displayLabel}
                      </Text>
                    </Pressable>
                  );
                })}
              </ScrollView>
            </View>

            {/* 选择账户 */}
            <View>
              <Text style={[styles.fieldLabel, { color: theme.colors.textSecondary }]}>账户</Text>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                keyboardShouldPersistTaps="handled"
                contentContainerStyle={styles.chipsRow}
              >
                {activeAccounts.map((acc) => {
                  const selected = acc.id === effectiveAccountId;
                  return (
                    <Pressable
                      key={acc.id}
                      accessibilityRole="button"
                      accessibilityState={{ selected }}
                      onPress={() => {
                        hapticSelection();
                        setAccountId(acc.id);
                        setError(null);
                      }}
                      style={({ pressed }) => [
                        styles.chip,
                        {
                          backgroundColor: selected
                            ? theme.colors.actionSubtle
                            : theme.colors.surface,
                          borderColor: selected ? theme.colors.action : theme.colors.border,
                          borderWidth: selected
                            ? theme.borderWidth.focus
                            : theme.borderWidth.hairline,
                          borderRadius: theme.radius.full,
                        },
                        pressed && { opacity: theme.opacity.pressed },
                      ]}
                    >
                      <AppIcon
                        name={acc.icon}
                        size={14}
                        color={selected ? theme.colors.action : theme.colors.textSecondary}
                      />
                      <Text
                        numberOfLines={1}
                        style={{
                          color: selected ? theme.colors.actionTextOnSubtle : theme.colors.text,
                          fontSize: theme.fontSize.xs,
                          fontWeight: selected
                            ? theme.fontWeight.semibold
                            : theme.fontWeight.regular,
                        }}
                      >
                        {acc.name}
                      </Text>
                    </Pressable>
                  );
                })}
              </ScrollView>
            </View>

            {/* 默认备注（选填） */}
            <View>
              <Text style={[styles.fieldLabel, { color: theme.colors.textSecondary }]}>
                默认备注（选填）
              </Text>
              <TextInput
                value={note}
                onChangeText={setNote}
                placeholder="点击快捷按钮时自动附带的备注"
                placeholderTextColor={theme.colors.textMuted}
                maxLength={60}
                style={[
                  styles.input,
                  {
                    backgroundColor: theme.colors.surface,
                    borderColor: theme.colors.border,
                    borderRadius: theme.radius.md,
                    color: theme.colors.text,
                    fontSize: theme.fontSize.sm,
                  },
                ]}
              />
            </View>

            {error ? (
              <Text style={{ color: theme.colors.expense, fontSize: theme.fontSize.xs }}>
                {error}
              </Text>
            ) : null}
          </ScrollView>

          {/* 底部按钮栏 */}
          <View
            style={[
              styles.footer,
              {
                paddingHorizontal: theme.spacing.lg,
                paddingVertical: theme.spacing.md,
                borderTopColor: theme.colors.border,
                borderTopWidth: theme.borderWidth.hairline,
              },
            ]}
          >
            {isEditing && onDelete ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="删除该快捷项"
                disabled={submitting}
                onPress={() => void handleDelete()}
                style={({ pressed }) => [
                  styles.deleteBtn,
                  pressed && { opacity: theme.opacity.pressed },
                ]}
              >
                <AppIcon name="trash-outline" size={16} color={theme.colors.expense} />
                <Text
                  style={{
                    color: theme.colors.expense,
                    fontSize: theme.fontSize.sm,
                    fontWeight: theme.fontWeight.semibold,
                    marginLeft: 4,
                  }}
                >
                  删除
                </Text>
              </Pressable>
            ) : (
              <View />
            )}

            <View style={styles.footerRight}>
              <Pressable
                accessibilityRole="button"
                disabled={submitting}
                onPress={() => {
                  hapticLight();
                  onClose();
                }}
                style={({ pressed }) => [
                  styles.secondaryBtn,
                  {
                    backgroundColor: theme.colors.surface,
                    borderColor: theme.colors.border,
                    borderRadius: theme.radius.md,
                  },
                  pressed && { opacity: theme.opacity.pressed },
                ]}
              >
                <Text
                  style={{
                    color: theme.colors.textSecondary,
                    fontSize: theme.fontSize.sm,
                    fontWeight: theme.fontWeight.semibold,
                  }}
                >
                  取消
                </Text>
              </Pressable>

              <Pressable
                accessibilityRole="button"
                disabled={submitting}
                onPress={() => void handleSave()}
                style={({ pressed }) => [
                  styles.primaryBtn,
                  {
                    backgroundColor: theme.colors.action,
                    borderRadius: theme.radius.md,
                    opacity: submitting ? theme.opacity.disabled : 1,
                  },
                  pressed && { opacity: theme.opacity.pressed },
                ]}
              >
                {submitting ? (
                  <ActivityIndicator size="small" color={theme.colors.onAction} />
                ) : (
                  <Text
                    style={{
                      color: theme.colors.onAction,
                      fontSize: theme.fontSize.sm,
                      fontWeight: theme.fontWeight.semibold,
                    }}
                  >
                    保存
                  </Text>
                )}
              </Pressable>
            </View>
          </View>
        </View>
        </KeyboardAvoidingView>
      </GestureHandlerRootView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  backdrop: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
  },
  dialog: {
    width: '100%',
    maxWidth: 400,
    maxHeight: '84%',
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  closeBtn: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bodyScroll: {
    flexShrink: 1,
  },
  twoColRow: {
    flexDirection: 'row',
    gap: 10,
  },
  colItem: {
    flex: 1,
  },
  fieldLabel: {
    fontSize: 12,
    marginBottom: 6,
  },
  input: {
    height: 40,
    borderWidth: 1,
    paddingHorizontal: 10,
  },
  chipsRow: {
    flexDirection: 'row',
    gap: 8,
    paddingVertical: 2,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    height: 34,
    paddingHorizontal: 10,
  },
  chipIconDot: {
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  deleteBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 38,
    paddingHorizontal: 6,
  },
  footerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  secondaryBtn: {
    height: 38,
    paddingHorizontal: 16,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryBtn: {
    height: 38,
    minWidth: 78,
    paddingHorizontal: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabular: {
    fontVariant: ['tabular-nums'],
  },
});
