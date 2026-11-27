/**
 * 约束简报（Workflow B / C）：
 * - 基于全应用统一 BottomSheet（单段不可展开，仅下滑收起，内置软键盘避让与贴底 footer）承接平账操作
 * - 信息层级：主（当前余额对照 + 占位提示免手删目标金额输入 + 底部唯一主按钮「确认平账」）、次（实时差额与收支方向提示、勾选「生成平账记录」及可选分类）、弱（备注预览与取消按钮）
 * - 架构边界：纯 UI 组件，通过 onSubmit 回调交由页面调用 transactions/service.ts 的 settleAccountBalance，不反向依赖 transactions
 */
import React, { useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { hapticLight, hapticSuccess, hapticWarning } from '../../../shared/haptics/haptics';
import {
  CURRENCY_SYMBOL,
  formatCentsPlain,
  formatCentsToYuan,
  parseSignedYuanToCents,
  parseYuanToCents,
  truncateExcessDecimalsInput,
} from '../../../shared/money/money';
import { AppIcon } from '../../../shared/ui/AppIcon';
import { BottomSheet, type BottomSheetHandle } from '../../../shared/ui/BottomSheet';
import { Button } from '../../../shared/ui/Button';
import { useTheme } from '../../../theme/theme-context';
import type { Category } from '../../categories/types';
import type { Account } from '../types';

export interface SettleBalanceSheetProps {
  visible: boolean;
  account: Account;
  /** 全部启用中的收支分类，用于在勾选生成平账记录时选择归属分类 */
  categories: readonly Category[];
  onClose: () => void;
  onSubmit: (params: {
    targetBalanceCents: number;
    generateRecord: boolean;
    categoryId?: string;
  }) => Promise<void>;
}

/** 支持正负号的金额输入两位小数即时截断（资产账户平账允许负余额） */
function truncateSignedDecimalsInput(raw: string): string {
  const trimmed = raw.trim();
  if (trimmed.startsWith('-')) {
    return `-${truncateExcessDecimalsInput(trimmed.slice(1))}`;
  }
  return truncateExcessDecimalsInput(raw);
}

export function SettleBalanceSheet({
  visible,
  account,
  categories,
  onClose,
  onSubmit,
}: SettleBalanceSheetProps): React.JSX.Element {
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  const sheetRef = useRef<BottomSheetHandle>(null);

  const [wasVisible, setWasVisible] = useState(visible);
  const [amountInput, setAmountInput] = useState('');
  const [generateRecord, setGenerateRecord] = useState(false);
  const [selectedIncomeCatId, setSelectedIncomeCatId] = useState<string>('');
  const [selectedExpenseCatId, setSelectedExpenseCatId] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  if (visible !== wasVisible) {
    setWasVisible(visible);
    if (visible) {
      setAmountInput('');
      setGenerateRecord(false);
      setSelectedIncomeCatId('');
      setSelectedExpenseCatId('');
      setError(null);
    }
  }

  const isLiability = account.kind === 'liability';
  const currentDisplayCents = isLiability
    ? account.balanceCents < 0
      ? Math.abs(account.balanceCents)
      : 0
    : account.balanceCents;
  const currentPlaceholder = formatCentsPlain(currentDisplayCents, false);

  const parsedTargetCents = useMemo<number | null>(() => {
    const trimmed = amountInput.trim();
    if (!trimmed) {
      return null;
    }
    if (isLiability) {
      const debt = parseYuanToCents(trimmed);
      return debt === null ? null : debt === 0 ? 0 : -debt;
    }
    return parseSignedYuanToCents(trimmed);
  }, [amountInput, isLiability]);

  const deltaCents =
    parsedTargetCents !== null ? parsedTargetCents - account.balanceCents : null;
  const recordType: 'income' | 'expense' | null =
    deltaCents === null || deltaCents === 0 ? null : deltaCents > 0 ? 'income' : 'expense';

  const incomeCategories = useMemo(
    () => categories.filter((c) => !c.isArchived && c.type === 'income' && c.parentId === null),
    [categories]
  );
  const expenseCategories = useMemo(
    () => categories.filter((c) => !c.isArchived && c.type === 'expense' && c.parentId === null),
    [categories]
  );

  const activeTypeCategories = recordType === 'income' ? incomeCategories : expenseCategories;
  const defaultCategoryId = useMemo(() => {
    if (!recordType) {
      return '';
    }
    const fallbackId = recordType === 'income' ? 'cat_inc_other' : 'cat_exp_other';
    return (
      activeTypeCategories.find((c) => c.id === fallbackId)?.id ??
      activeTypeCategories[0]?.id ??
      ''
    );
  }, [activeTypeCategories, recordType]);

  const effectiveCategoryId =
    recordType === 'income'
      ? selectedIncomeCatId || defaultCategoryId
      : recordType === 'expense'
        ? selectedExpenseCatId || defaultCategoryId
        : '';

  const canConfirm = parsedTargetCents !== null && deltaCents !== null && deltaCents !== 0;

  const handleConfirm = async () => {
    if (submitting) {
      return;
    }
    setError(null);
    if (!amountInput.trim()) {
      hapticWarning();
      setError(isLiability ? '请输入实际待还欠款' : '请输入实际余额');
      return;
    }
    if (parsedTargetCents === null) {
      hapticWarning();
      setError(
        isLiability ? '待还欠款须为非负数字（最多两位小数）' : '请输入有效金额（最多两位小数）'
      );
      return;
    }
    if (deltaCents === 0) {
      hapticWarning();
      setError('目标金额与当前一致，无需平账');
      return;
    }

    setSubmitting(true);
    try {
      await onSubmit({
        targetBalanceCents: parsedTargetCents,
        generateRecord,
        categoryId: generateRecord && effectiveCategoryId ? effectiveCategoryId : undefined,
      });
      hapticSuccess();
      sheetRef.current?.dismiss();
    } catch (err) {
      hapticWarning();
      setError(err instanceof Error ? err.message : '平账失败');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <BottomSheet
      ref={sheetRef}
      visible={visible}
      onClose={onClose}
      title="平账"
      subtitle={`${account.name} · 当前${isLiability ? '待还' : '余额'} ${formatCentsToYuan(currentDisplayCents)}`}
      backdropLabel="关闭平账弹窗"
      expandable={false}
      scrollable
      scrollMaxHeight={440}
      avoidKeyboard
      includeBottomInset={false}
      contentContainerStyle={{ padding: theme.spacing.lg }}
      footer={
        <View
          style={[
            styles.footerRow,
            {
              borderTopColor: theme.colors.border,
              borderTopWidth: theme.borderWidth.hairline,
              paddingHorizontal: theme.spacing.lg,
              paddingTop: theme.spacing.md,
              paddingBottom: Math.max(insets.bottom, theme.spacing.lg),
              gap: theme.spacing.sm,
            },
          ]}
        >
          <Button
            label="取消"
            size="md"
            variant="secondary"
            onPress={() => {
              hapticLight();
              sheetRef.current?.dismiss();
            }}
            disabled={submitting}
            style={styles.footerBtn}
          />
          <Button
            label="确认平账"
            size="md"
            onPress={() => void handleConfirm()}
            loading={submitting}
            disabled={submitting || !canConfirm}
            style={styles.footerBtn}
          />
        </View>
      }
    >
      {/* 目标金额输入（浅色占位展示当前值，免手删） */}
      <View style={styles.fieldHeader}>
        <Text
          style={{
            color: theme.colors.textSecondary,
            fontSize: theme.fontSize.xs,
            fontWeight: theme.fontWeight.semibold,
          }}
        >
          {isLiability ? '实际待还欠款（元）' : '实际余额（元）'}
        </Text>
        {deltaCents !== null && deltaCents !== 0 ? (
          <Text
            style={[
              styles.tabular,
              {
                color: deltaCents > 0 ? theme.colors.income : theme.colors.expense,
                fontSize: theme.fontSize.xs,
                fontWeight: theme.fontWeight.semibold,
              },
            ]}
          >
            {deltaCents > 0 ? `收入 +${formatCentsToYuan(deltaCents)}` : `支出 -${formatCentsToYuan(Math.abs(deltaCents))}`}
          </Text>
        ) : null}
      </View>

      <View
        style={[
          styles.amountRow,
          {
            backgroundColor: theme.colors.surface,
            borderColor: error ? theme.colors.expense : theme.colors.border,
            borderRadius: theme.radius.md,
            marginTop: theme.spacing.sm,
          },
        ]}
      >
        <Text
          style={{
            color: amountInput.trim() ? theme.colors.text : theme.colors.textMuted,
            fontSize: theme.fontSize.xl,
            fontWeight: theme.fontWeight.semibold,
            marginRight: theme.spacing.xs,
          }}
        >
          {CURRENCY_SYMBOL}
        </Text>
        <TextInput
          accessibilityLabel={isLiability ? '实际待还欠款' : '实际余额'}
          value={amountInput}
          onChangeText={(text) => {
            setAmountInput(
              isLiability ? truncateExcessDecimalsInput(text) : truncateSignedDecimalsInput(text)
            );
            if (error) {
              setError(null);
            }
          }}
          keyboardType={isLiability ? 'decimal-pad' : 'numbers-and-punctuation'}
          placeholder={currentPlaceholder}
          placeholderTextColor={theme.colors.textMuted}
          returnKeyType="done"
          onSubmitEditing={() => void handleConfirm()}
          style={[
            styles.amountInput,
            styles.tabular,
            {
              color: theme.colors.text,
              fontSize: theme.fontSize.xxl,
              fontWeight: theme.fontWeight.semibold,
            },
          ]}
        />
        {amountInput.length > 0 ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="清空输入"
            hitSlop={8}
            onPress={() => {
              hapticLight();
              setAmountInput('');
              setError(null);
            }}
            style={({ pressed }) => [
              styles.clearBtn,
              pressed && { opacity: theme.opacity.pressed },
            ]}
          >
            <AppIcon name="close-circle" size={18} color={theme.colors.textMuted} />
          </Pressable>
        ) : null}
      </View>

      {/* 可选生成平账记录 */}
      <Pressable
        accessibilityRole="checkbox"
        accessibilityState={{ checked: generateRecord }}
        onPress={() => {
          hapticLight();
          setGenerateRecord((prev) => !prev);
        }}
        style={({ pressed }) => [
          styles.toggleRow,
          { marginTop: theme.spacing.lg },
          pressed && { opacity: theme.opacity.pressed },
        ]}
      >
        <AppIcon
          name={generateRecord ? 'checkbox' : 'square-outline'}
          size={20}
          color={generateRecord ? theme.colors.action : theme.colors.textMuted}
        />
        <Text
          style={{
            flex: 1,
            color: theme.colors.text,
            fontSize: theme.fontSize.sm,
            fontWeight: theme.fontWeight.regular,
            marginLeft: theme.spacing.sm,
          }}
        >
          生成平账记录（计入明细收支）
        </Text>
      </Pressable>

      {/* 勾选生成记录且存在差额时：预览记录类型、归属分类与备注 */}
      {generateRecord && recordType && parsedTargetCents !== null && deltaCents !== null ? (
        <View
          style={[
            styles.previewCard,
            {
              backgroundColor: theme.colors.surface,
              borderColor: theme.colors.border,
              borderWidth: theme.borderWidth.hairline,
              borderRadius: theme.radius.md,
              marginTop: theme.spacing.md,
              padding: theme.spacing.md,
            },
          ]}
        >
          <View style={styles.previewRow}>
            <Text style={{ color: theme.colors.textMuted, fontSize: theme.fontSize.xs }}>
              记录类型
            </Text>
            <Text
              style={[
                styles.tabular,
                {
                  color: recordType === 'income' ? theme.colors.income : theme.colors.expense,
                  fontSize: theme.fontSize.sm,
                  fontWeight: theme.fontWeight.semibold,
                },
              ]}
            >
              {recordType === 'income' ? '收入' : '支出'} {formatCentsToYuan(Math.abs(deltaCents))}
            </Text>
          </View>

          <View style={{ marginTop: theme.spacing.md }}>
            <Text
              style={{
                color: theme.colors.textMuted,
                fontSize: theme.fontSize.xs,
                marginBottom: theme.spacing.xs,
              }}
            >
              平账分类
            </Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.categoryScroll}
            >
              {activeTypeCategories.map((cat) => {
                const selected = cat.id === effectiveCategoryId;
                return (
                  <Pressable
                    key={cat.id}
                    accessibilityRole="button"
                    accessibilityState={{ selected }}
                    onPress={() => {
                      hapticLight();
                      if (recordType === 'income') {
                        setSelectedIncomeCatId(cat.id);
                      } else {
                        setSelectedExpenseCatId(cat.id);
                      }
                    }}
                    style={({ pressed }) => [
                      styles.categoryChip,
                      {
                        backgroundColor: selected
                          ? theme.colors.actionSubtle
                          : theme.colors.surfaceRaised,
                        borderColor: selected ? theme.colors.action : theme.colors.border,
                        borderWidth: selected
                          ? theme.borderWidth.focus
                          : theme.borderWidth.hairline,
                        borderRadius: theme.radius.full,
                      },
                      pressed && { opacity: theme.opacity.pressed },
                    ]}
                  >
                    <Text
                      style={{
                        color: selected
                          ? theme.colors.actionTextOnSubtle
                          : theme.colors.textSecondary,
                        fontSize: theme.fontSize.xs,
                        fontWeight: selected
                          ? theme.fontWeight.semibold
                          : theme.fontWeight.regular,
                      }}
                    >
                      {cat.name}
                    </Text>
                  </Pressable>
                );
              })}
            </ScrollView>
          </View>

          <Text
            numberOfLines={1}
            style={{
              color: theme.colors.textMuted,
              fontSize: theme.fontSize.xs,
              marginTop: theme.spacing.md,
            }}
          >
            备注：平账({formatCentsPlain(account.balanceCents)} ~ {formatCentsPlain(parsedTargetCents)})
          </Text>
        </View>
      ) : null}

      {error ? (
        <View
          style={[
            styles.errorBox,
            {
              backgroundColor: theme.colors.expenseSubtle,
              borderLeftColor: theme.colors.expense,
              borderRadius: theme.radius.sm,
              marginTop: theme.spacing.md,
              paddingHorizontal: theme.spacing.sm,
              paddingVertical: theme.spacing.xs,
            },
          ]}
        >
          <AppIcon name="alert-circle-outline" size={15} color={theme.colors.expenseTextOnSubtle} />
          <Text
            style={{
              color: theme.colors.expenseTextOnSubtle,
              fontSize: theme.fontSize.xs,
              fontWeight: theme.fontWeight.semibold,
              marginLeft: theme.spacing.xs,
              flex: 1,
            }}
          >
            {error}
          </Text>
        </View>
      ) : null}
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  fieldHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  amountRow: {
    minHeight: 54,
    borderWidth: 1,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
  },
  amountInput: {
    flex: 1,
    minHeight: 50,
    paddingVertical: 8,
  },
  clearBtn: {
    paddingLeft: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 36,
  },
  previewCard: {},
  previewRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  categoryScroll: {
    gap: 8,
    paddingVertical: 2,
  },
  categoryChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  errorBox: {
    flexDirection: 'row',
    alignItems: 'center',
    borderLeftWidth: 3,
  },
  footerRow: {
    flexDirection: 'row',
  },
  footerBtn: {
    flex: 1,
  },
  tabular: {
    fontVariant: ['tabular-nums'],
  },
});
