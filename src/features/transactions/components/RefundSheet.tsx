/**
 * 约束简报（Workflow B / C）：
 * - 信息层级：主（退款金额输入与一键「全额退」+ 底部唯一主按钮「确认退款 / 保存修改」）、次（原支出与剩余可退概览、退款入账账户与日期）、弱（备注输入与关闭按钮）
 * - 交互形态：基于统一 BottomSheet（内置软键盘避让 + 顶部抓手/标题栏随时跟手下拉关闭），日期选择器平级挂载避免 Android 嵌套 Modal
 */
import * as Haptics from 'expo-haptics';
import React, { useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useDatabase } from '../../../db/database-context';
import {
  formatRelativeDateLabel,
  getTodayIsoDate,
  shiftIsoDate,
} from '../../../shared/date/date';
import {
  centsToInputString,
  CURRENCY_SYMBOL,
  formatCentsToYuan,
  parseYuanToCents,
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
  const { db, notifyChange } = useDatabase();
  const sheetRef = useRef<BottomSheetHandle>(null);

  const [cachedTarget, setCachedTarget] = useState<RefundSheetTarget | null>(target);
  if (target && target !== cachedTarget) {
    setCachedTarget(target);
  }

  const [accounts, setAccounts] = useState<Account[]>([]);
  const [originalExpense, setOriginalExpense] = useState<TransactionListItem | null>(null);
  const [maxRefundableCents, setMaxRefundableCents] = useState(0);
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
        (acc) => !acc.isArchived || acc.id === currentRefundAccountId
      );
      setAccounts(visibleAccounts);
      setOriginalExpense(resolvedOriginal);
      setError(null);

      if (target.mode === 'create') {
        const exp = resolvedOriginal ?? target.expense;
        const remaining = Math.max(0, exp.amountCents - exp.refundedCents);
        setMaxRefundableCents(remaining);
        setAmountInput(remaining > 0 ? centsToInputString(remaining) : '');
        const defaultAcc =
          visibleAccounts.find((a) => a.id === exp.accountId)?.id ?? visibleAccounts[0]?.id ?? '';
        setAccountId(defaultAcc);
        setOccurredOn(getTodayIsoDate());
        setNote('');
      } else {
        const ref = target.refund;
        const exp = resolvedOriginal;
        const otherRefunded = exp ? Math.max(0, exp.refundedCents - ref.amountCents) : 0;
        const maxAllowed = exp
          ? Math.max(ref.amountCents, exp.amountCents - otherRefunded)
          : ref.amountCents;
        setMaxRefundableCents(maxAllowed);
        setAmountInput(centsToInputString(ref.amountCents));
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

  const originalTitle = originalExpense
    ? originalExpense.categoryParentName
      ? `${originalExpense.categoryParentName} · ${originalExpense.categoryName ?? ''}`
      : (originalExpense.categoryName ?? '支出')
    : '支出';

  const handleSubmit = async () => {
    setError(null);
    const amountCents = parseYuanToCents(amountInput);
    if (amountCents === null || amountCents <= 0) {
      setError('请输入大于 0 的退款金额（最多两位小数）');
      return;
    }
    if (maxRefundableCents > 0 && amountCents > maxRefundableCents) {
      setError(`不能超过可退上限 ${formatCentsToYuan(maxRefundableCents)}`);
      return;
    }
    if (!accountId) {
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

      try {
        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      } catch {
        // 忽略无震动反馈设备异常
      }

      notifyChange();
      onSaved();
      sheetRef.current?.dismiss();
    } catch (err) {
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
        backdropLabel="关闭退款弹窗"
        dragHandleOnly
        avoidKeyboard
        maxHeight="86%"
        header={
          <View
            style={[
              styles.header,
              {
                paddingHorizontal: theme.spacing.lg,
                paddingBottom: theme.spacing.md,
                borderBottomColor: theme.colors.border,
                borderBottomWidth: theme.borderWidth.hairline,
              },
            ]}
          >
            <Text
              style={{
                color: theme.colors.text,
                fontSize: theme.fontSize.base,
                fontWeight: theme.fontWeight.semibold,
              }}
            >
              {isEdit ? '编辑退款' : '记录退款'}
            </Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="关闭"
              onPress={() => sheetRef.current?.dismiss()}
              hitSlop={10}
              style={({ pressed }) => [
                styles.closeBtn,
                pressed && { opacity: theme.opacity.pressed },
              ]}
            >
              <AppIcon name="close" size={20} color={theme.colors.textMuted} />
            </Pressable>
          </View>
        }
      >
        <ScrollView
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ padding: theme.spacing.lg }}
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
                  原支出 {formatCentsToYuan(originalExpense.amountCents)} · 可退上限{' '}
                  {formatCentsToYuan(maxRefundableCents)}
                </Text>
              </View>
            ) : null}

            {/* 退款金额 */}
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
                {maxRefundableCents > 0 ? (
                  <Pressable
                    accessibilityRole="button"
                    onPress={() => {
                      setAmountInput(centsToInputString(maxRefundableCents));
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
                      全额退
                    </Text>
                  </Pressable>
                ) : null}
              </View>

              <View
                style={[
                  styles.amountRow,
                  {
                    backgroundColor: theme.colors.surface,
                    borderColor: theme.colors.border,
                    borderRadius: theme.radius.md,
                    marginTop: theme.spacing.sm,
                  },
                ]}
              >
                <Text
                  style={{
                    color: theme.colors.income,
                    fontSize: theme.fontSize.xl,
                    fontWeight: theme.fontWeight.semibold,
                    marginRight: theme.spacing.xs,
                  }}
                >
                  {CURRENCY_SYMBOL}
                </Text>
                <TextInput
                  accessibilityLabel="退款金额"
                  value={amountInput}
                  onChangeText={(text) => {
                    setAmountInput(text);
                    if (error) {
                      setError(null);
                    }
                  }}
                  keyboardType="decimal-pad"
                  placeholder="0.00"
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

            <Button
              label={isEdit ? '保存修改' : '确认退款'}
              onPress={() => void handleSubmit()}
              loading={saving}
              disabled={saving || maxRefundableCents <= 0}
              style={{ marginTop: theme.spacing.xl }}
            />
        </ScrollView>
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
