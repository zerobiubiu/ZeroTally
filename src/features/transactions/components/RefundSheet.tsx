/**
 * 约束简报（Workflow B / C）：
 * - 信息层级：主（占位提示默认金额的退款输入框 + 底部唯一主按钮「确认退款 / 保存修改」）、次（原支出概览、退款入账账户与日期）、弱（备注输入与关闭按钮）
 * - 金额输入策略：默认全额（或编辑态原金额）以浅色占位提示展示而不占用输入框，留空直接提交即沿用默认金额，点击输入直接覆盖无需先删数字；输入完成后自动规整合法性（.5->0.5、去多余前导零、直接截断超两位小数、仅校验 > 0 不限上限）
 * - 交互形态：基于统一 BottomSheet（内置软键盘避让 + 顶部抓手/标题栏随时跟手下拉关闭），日期选择器平级挂载避免 Android 嵌套 Modal
 */
import React, { useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useDatabase } from '../../../db/database-context';
import {
  formatRelativeDateLabel,
  getTodayIsoDate,
  shiftIsoDate,
} from '../../../shared/date/date';
import { hapticLight, hapticSuccess, hapticWarning } from '../../../shared/haptics/haptics';
import {
  CURRENCY_SYMBOL,
  formatCentsPlain,
  formatCentsToYuan,
  normalizePositiveAmountInput,
  truncateExcessDecimalsInput,
} from '../../../shared/money/money';
import { AppIcon } from '../../../shared/ui/AppIcon';
import { BottomSheet, type BottomSheetHandle } from '../../../shared/ui/BottomSheet';
import { Button } from '../../../shared/ui/Button';
import { useTheme } from '../../../theme/theme-context';
import { listAccounts } from '../../accounts/service';
import type { Account } from '../../accounts/types';
import {
  createRefundTransaction,
  getTransactionById,
  updateRefundTransaction,
} from '../service';
import type { TransactionListItem } from '../types';
import { DatePickerSheet } from './DatePickerSheet';

export type RefundSheetTarget =
  | { mode: 'create'; expense: TransactionListItem }
  | { mode: 'edit'; refund: TransactionListItem };

interface RefundSheetProps {
  target: RefundSheetTarget | null;
  onClose: () => void;
  onSaved: () => void;
}

export function RefundSheet({
  target,
  onClose,
  onSaved,
}: RefundSheetProps): React.JSX.Element | null {
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  const { db, notifyChange } = useDatabase();
  const sheetRef = useRef<BottomSheetHandle>(null);

  const [cachedTarget, setCachedTarget] = useState<RefundSheetTarget | null>(target);
  if (target && target !== cachedTarget) {
    setCachedTarget(target);
  }

  const [accounts, setAccounts] = useState<Account[]>([]);
  const [originalExpense, setOriginalExpense] = useState<TransactionListItem | null>(null);
  /** 留空提交时沿用的默认金额（新建为剩余全额，编辑为原退款额；若无剩余则 0 需手动输入） */
  const [defaultAmountCents, setDefaultAmountCents] = useState(0);
  const [amountInput, setAmountInput] = useState('');
  const [accountId, setAccountId] = useState('');
  const [occurredOn, setOccurredOn] = useState(() => getTodayIsoDate());
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [dateSheetOpen, setDateSheetOpen] = useState(false);

  const visible = target !== null;

  useEffect(() => {
    if (!target) {
      return;
    }
    let active = true;
    void (async () => {
      const [allAccounts, resolvedOriginal] = await Promise.all([
        listAccounts(db, { includeArchived: true }),
        target.mode === 'create'
          ? getTransactionById(db, target.expense.id)
          : target.refund.refundOfId
            ? getTransactionById(db, target.refund.refundOfId)
            : Promise.resolve(null),
      ]);
      if (!active) {
        return;
      }

      const currentRefundAccountId = target.mode === 'edit' ? target.refund.accountId : null;
      const visibleAccounts = allAccounts.filter(
        (acc) =>
          (!acc.isArchived && acc.isSelectable) || acc.id === currentRefundAccountId
      );
      setAccounts(visibleAccounts);
      setOriginalExpense(resolvedOriginal);
      setError(null);
      // 始终不预填文本，改以浅色占位提示展示默认金额，直接输入即可无需手动删除
      setAmountInput('');

      if (target.mode === 'create') {
        const exp = resolvedOriginal ?? target.expense;
        const remaining = Math.max(0, exp.amountCents - exp.refundedCents);
        setDefaultAmountCents(remaining);
        const defaultAcc =
          visibleAccounts.find((a) => a.id === exp.accountId)?.id ?? visibleAccounts[0]?.id ?? '';
        setAccountId(defaultAcc);
        setOccurredOn(getTodayIsoDate());
        setNote('');
      } else {
        const ref = target.refund;
        setDefaultAmountCents(ref.amountCents);
        setAccountId(ref.accountId);
        setOccurredOn(ref.occurredOn);
        setNote(ref.note);
      }
    })();

    return () => {
      active = false;
    };
  }, [db, target]);

  const activeTarget = target ?? cachedTarget;
  if (!activeTarget) {
    return null;
  }

  const todayIso = getTodayIsoDate();
  const yesterdayIso = shiftIsoDate(todayIso, -1);
  const isEdit = activeTarget.mode === 'edit';
  const hasTypedAmount = amountInput.trim().length > 0;
  const amountPlaceholder =
    defaultAmountCents > 0 ? formatCentsPlain(defaultAmountCents, false) : '输入金额';

  const originalTitle = originalExpense
    ? originalExpense.categoryParentName
      ? `${originalExpense.categoryParentName} · ${originalExpense.categoryName ?? ''}`
      : (originalExpense.categoryName ?? '支出')
    : '支出';

  /** 输入完成后自动规整（.5->0.5、去多余前导零、截断超两位小数）并校验是否 > 0 */
  const handleAmountFinishEditing = () => {
    const result = normalizePositiveAmountInput(amountInput);
    if (result.kind === 'empty') {
      if (amountInput.length > 0) {
        setAmountInput('');
      }
      setError(null);
      return;
    }
    if (result.kind === 'valid') {
      if (result.normalized !== amountInput) {
        setAmountInput(result.normalized);
      }
      setError(null);
      return;
    }
    hapticWarning();
    setError(result.reason);
  };

  const handleSubmit = async () => {
    setError(null);
    const parsed = normalizePositiveAmountInput(amountInput);

    let amountCents: number;
    if (parsed.kind === 'invalid') {
      hapticWarning();
      setError(parsed.reason);
      return;
    }
    if (parsed.kind === 'valid') {
      if (parsed.normalized !== amountInput) {
        setAmountInput(parsed.normalized);
      }
      amountCents = parsed.cents;
    } else if (defaultAmountCents > 0) {
      amountCents = defaultAmountCents;
    } else {
      hapticWarning();
      setError('请输入大于 0 的正数金额');
      return;
    }

    if (!accountId) {
      hapticWarning();
      setError('请选择退款入账账户');
      return;
    }

    setSaving(true);
    try {
      if (activeTarget.mode === 'create') {
        await createRefundTransaction(db, {
          originalTransactionId: activeTarget.expense.id,
          amountCents,
          accountId,
          occurredOn,
          note,
        });
      } else {
        await updateRefundTransaction(db, activeTarget.refund.id, {
          amountCents,
          accountId,
          occurredOn,
          note,
        });
      }

      hapticSuccess();
      notifyChange();
      onSaved();
      sheetRef.current?.dismiss();
    } catch (err) {
      hapticWarning();
      setError(err instanceof Error ? err.message : '退款保存失败');
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <BottomSheet
        ref={sheetRef}
        visible={visible}
        onClose={onClose}
        title={isEdit ? '编辑退款' : '记录退款'}
        backdropLabel="关闭退款弹窗"
        expandable
        collapsedRatio={0.68}
        scrollable
        avoidKeyboard
        includeBottomInset={false}
        contentContainerStyle={{ padding: theme.spacing.lg }}
        footer={
          <View
            style={[
              styles.footerBar,
              {
                borderTopColor: theme.colors.border,
                borderTopWidth: theme.borderWidth.hairline,
                paddingHorizontal: theme.spacing.lg,
                paddingTop: theme.spacing.md,
                paddingBottom: Math.max(insets.bottom, theme.spacing.lg),
              },
            ]}
          >
            <Button
              label={isEdit ? '保存修改' : '确认退款'}
              onPress={() => void handleSubmit()}
              loading={saving}
              disabled={saving}
            />
          </View>
        }
      >
            {/* 原支出概览 */}
            {originalExpense ? (
              <View
                style={[
                  styles.contextBanner,
                  {
                    backgroundColor: theme.colors.surface,
                    borderRadius: theme.radius.md,
                    padding: theme.spacing.md,
                  },
                ]}
              >
                <Text
                  numberOfLines={1}
                  style={{
                    color: theme.colors.text,
                    fontSize: theme.fontSize.sm,
                    fontWeight: theme.fontWeight.semibold,
                  }}
                >
                  {originalTitle}
                </Text>
                <Text
                  style={[
                    styles.tabular,
                    {
                      color: theme.colors.textMuted,
                      fontSize: theme.fontSize.xs,
                      marginTop: theme.spacing.xs,
                    },
                  ]}
                >
                  原支出 {formatCentsToYuan(originalExpense.amountCents)}
                  {originalExpense.refundedCents > 0
                    ? ` · 已退 ${formatCentsToYuan(originalExpense.refundedCents)}`
                    : ''}
                </Text>
              </View>
            ) : null}

            {/* 退款金额（占位提示默认金额，留空直接提交即沿用） */}
            <View style={{ marginTop: theme.spacing.lg }}>
              <View style={styles.fieldHeader}>
                <Text
                  style={{
                    color: theme.colors.textSecondary,
                    fontSize: theme.fontSize.xs,
                    fontWeight: theme.fontWeight.semibold,
                  }}
                >
                  退款金额
                </Text>
                {defaultAmountCents > 0 ? (
                  hasTypedAmount ? (
                    <Pressable
                      accessibilityRole="button"
                      onPress={() => {
                        hapticLight();
                        setAmountInput('');
                        setError(null);
                      }}
                      hitSlop={8}
                      style={({ pressed }) => [pressed && { opacity: theme.opacity.pressed }]}
                    >
                      <Text
                        style={{
                          color: theme.colors.action,
                          fontSize: theme.fontSize.xs,
                          fontWeight: theme.fontWeight.semibold,
                        }}
                      >
                        {isEdit ? '恢复原金额' : '默认全额退'}
                      </Text>
                    </Pressable>
                  ) : (
                    <Text
                      style={{
                        color: theme.colors.textMuted,
                        fontSize: theme.fontSize.xs,
                      }}
                    >
                      {isEdit ? '留空保持原金额' : '留空默认全额退'}
                    </Text>
                  )
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
                    color: hasTypedAmount ? theme.colors.income : theme.colors.textMuted,
                    fontSize: theme.fontSize.xl,
                    fontWeight: theme.fontWeight.semibold,
                    marginRight: theme.spacing.xs,
                  }}
                >
                  {CURRENCY_SYMBOL}
                </Text>
                <TextInput
                  accessibilityLabel="退款金额"
                  accessibilityHint={
                    defaultAmountCents > 0
                      ? isEdit
                        ? `不输入则保持原退款金额 ${formatCentsToYuan(defaultAmountCents)}`
                        : `不输入则默认全额退 ${formatCentsToYuan(defaultAmountCents)}`
                      : '请输入大于 0 的正数退款金额'
                  }
                  value={amountInput}
                  onChangeText={(text) => {
                    setAmountInput(truncateExcessDecimalsInput(text));
                    if (error) {
                      setError(null);
                    }
                  }}
                  onBlur={handleAmountFinishEditing}
                  onSubmitEditing={handleAmountFinishEditing}
                  returnKeyType="done"
                  keyboardType="decimal-pad"
                  placeholder={amountPlaceholder}
                  placeholderTextColor={theme.colors.textMuted}
                  style={[
                    styles.amountInput,
                    styles.tabular,
                    {
                      color: theme.colors.income,
                      fontSize: theme.fontSize.xxl,
                      fontWeight: theme.fontWeight.semibold,
                    },
                  ]}
                />
                {hasTypedAmount ? (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="清空输入金额"
                    hitSlop={8}
                    onPress={() => {
                      hapticLight();
                      setAmountInput('');
                      setError(null);
                    }}
                    style={({ pressed }) => [
                      styles.clearAmountBtn,
                      pressed && { opacity: theme.opacity.pressed },
                    ]}
                  >
                    <AppIcon name="close-circle" size={18} color={theme.colors.textMuted} />
                  </Pressable>
                ) : null}
              </View>
            </View>

            {/* 退回账户 */}
            <View style={{ marginTop: theme.spacing.lg }}>
              <Text
                style={{
                  color: theme.colors.textSecondary,
                  fontSize: theme.fontSize.xs,
                  fontWeight: theme.fontWeight.semibold,
                  marginBottom: theme.spacing.sm,
                }}
              >
                退回账户
              </Text>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={{ gap: theme.spacing.sm }}
              >
                {accounts.map((acc) => {
                  const selected = acc.id === accountId;
                  return (
                    <Pressable
                      key={acc.id}
                      accessibilityRole="button"
                      accessibilityState={{ selected }}
                      onPress={() => setAccountId(acc.id)}
                      style={[
                        styles.chip,
                        {
                          backgroundColor: selected
                            ? theme.colors.actionSubtle
                            : theme.colors.surface,
                          borderColor: selected ? theme.colors.action : theme.colors.border,
                          borderRadius: theme.radius.full,
                        },
                      ]}
                    >
                      <Text
                        style={{
                          color: selected
                            ? theme.colors.actionTextOnSubtle
                            : theme.colors.textSecondary,
                          fontSize: theme.fontSize.sm,
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

            {/* 退款日期 */}
            <View style={{ marginTop: theme.spacing.lg }}>
              <Text
                style={{
                  color: theme.colors.textSecondary,
                  fontSize: theme.fontSize.xs,
                  fontWeight: theme.fontWeight.semibold,
                  marginBottom: theme.spacing.sm,
                }}
              >
                退款日期
              </Text>
              <View style={[styles.dateRow, { gap: theme.spacing.sm }]}>
                {[
                  { label: '昨天', value: yesterdayIso },
                  { label: '今天', value: todayIso },
                ].map((opt) => {
                  const selected = occurredOn === opt.value;
                  return (
                    <Pressable
                      key={opt.label}
                      accessibilityRole="button"
                      accessibilityState={{ selected }}
                      onPress={() => setOccurredOn(opt.value)}
                      style={[
                        styles.chip,
                        {
                          backgroundColor: selected
                            ? theme.colors.actionSubtle
                            : theme.colors.surface,
                          borderColor: selected ? theme.colors.action : theme.colors.border,
                          borderRadius: theme.radius.full,
                        },
                      ]}
                    >
                      <Text
                        style={{
                          color: selected
                            ? theme.colors.actionTextOnSubtle
                            : theme.colors.textSecondary,
                          fontSize: theme.fontSize.sm,
                          fontWeight: selected
                            ? theme.fontWeight.semibold
                            : theme.fontWeight.regular,
                        }}
                      >
                        {opt.label}
                      </Text>
                    </Pressable>
                  );
                })}

                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="选择其他日期"
                  onPress={() => setDateSheetOpen(true)}
                  style={[
                    styles.chip,
                    styles.datePickerChip,
                    {
                      backgroundColor:
                        occurredOn !== todayIso && occurredOn !== yesterdayIso
                          ? theme.colors.actionSubtle
                          : theme.colors.surface,
                      borderColor:
                        occurredOn !== todayIso && occurredOn !== yesterdayIso
                          ? theme.colors.action
                          : theme.colors.border,
                      borderRadius: theme.radius.full,
                    },
                  ]}
                >
                  <AppIcon name="calendar-outline" size={14} color={theme.colors.action} />
                  <Text
                    style={{
                      color: theme.colors.text,
                      fontSize: theme.fontSize.sm,
                      fontWeight: theme.fontWeight.semibold,
                      marginLeft: theme.spacing.xs,
                    }}
                  >
                    {occurredOn !== todayIso && occurredOn !== yesterdayIso
                      ? formatRelativeDateLabel(occurredOn)
                      : '选日期'}
                  </Text>
                </Pressable>
              </View>
            </View>

            {/* 退款备注 */}
            <View style={{ marginTop: theme.spacing.lg }}>
              <Text
                style={{
                  color: theme.colors.textSecondary,
                  fontSize: theme.fontSize.xs,
                  fontWeight: theme.fontWeight.semibold,
                  marginBottom: theme.spacing.sm,
                }}
              >
                备注
              </Text>
              <TextInput
                accessibilityLabel="退款备注"
                value={note}
                onChangeText={setNote}
                placeholder="退差价、退货退款等"
                placeholderTextColor={theme.colors.textMuted}
                maxLength={120}
                style={[
                  styles.noteInput,
                  {
                    backgroundColor: theme.colors.surface,
                    borderColor: theme.colors.border,
                    color: theme.colors.text,
                    borderRadius: theme.radius.md,
                    fontSize: theme.fontSize.base,
                  },
                ]}
              />
            </View>

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
                    paddingVertical: theme.spacing.sm,
                  },
                ]}
              >
                <AppIcon
                  name="alert-circle-outline"
                  size={16}
                  color={theme.colors.expenseTextOnSubtle}
                />
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

      <DatePickerSheet
        visible={visible && dateSheetOpen}
        selectedDate={occurredOn}
        onSelect={(iso) => setOccurredOn(iso)}
        onClose={() => setDateSheetOpen(false)}
      />
    </>
  );
}

const styles = StyleSheet.create({
  footerBar: {},
  contextBanner: {},
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
    paddingVertical: 8,
  },
  clearAmountBtn: {
    marginLeft: 6,
    padding: 2,
  },
  chip: {
    minHeight: 36,
    paddingHorizontal: 14,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
  },
  datePickerChip: {
    flexDirection: 'row',
  },
  noteInput: {
    minHeight: 48,
    borderWidth: 1,
    paddingHorizontal: 14,
  },
  errorBox: {
    flexDirection: 'row',
    alignItems: 'center',
    borderLeftWidth: 3,
  },
  tabular: {
    fontVariant: ['tabular-nums'],
  },
});
