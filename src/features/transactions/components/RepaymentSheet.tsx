/**
 * 约束简报（Workflow B / C）：
 * - 信息层级：主（占位默认待还全额的还款金额框 + 底部唯一实色主按钮「确认还款 / 保存修改」）、次（负债账户状态摘要、还款方式切换「资产转入 / 无账户支出」与资产账户选择 + 扣后余额预览、日期）、弱（备注输入与关闭按钮）
 * - 金额输入策略：新建且存在欠款时默认待还全额以占位提示展示（留空直点即全额还清，点击输入直接覆盖免手删），输入后自动规整两位小数正数（支持提前多还/溢缴）
 * - 交互形态：基于统一可展开 BottomSheet，DatePickerSheet 平级挂载避 Android 嵌套 Modal
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
import { SlidingSegmentedControl } from '../../../shared/ui/SlidingSegmentedControl';
import { useTheme } from '../../../theme/theme-context';
import { describeAccountBalance } from '../../accounts/rules';
import { getAccountById, listAccounts } from '../../accounts/service';
import type { Account } from '../../accounts/types';
import { createRepaymentTransaction, updateRepaymentTransaction } from '../service';
import type { TransactionListItem } from '../types';
import { DatePickerSheet } from './DatePickerSheet';

export type RepaymentSheetTarget =
  | { mode: 'create'; liabilityAccount: Account }
  | { mode: 'edit'; repayment: TransactionListItem };

type RepaymentSourceMode = 'asset' | 'direct';

const SOURCE_MODE_OPTIONS: readonly { value: RepaymentSourceMode; label: string }[] = [
  { value: 'asset', label: '资产转入' },
  { value: 'direct', label: '无账户支出' },
];

interface RepaymentSheetProps {
  target: RepaymentSheetTarget | null;
  onClose: () => void;
  onSaved?: () => void;
}

export function RepaymentSheet({
  target,
  onClose,
  onSaved,
}: RepaymentSheetProps): React.JSX.Element | null {
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  const { db, notifyChange } = useDatabase();
  const sheetRef = useRef<BottomSheetHandle>(null);

  const [cachedTarget, setCachedTarget] = useState<RepaymentSheetTarget | null>(target);
  if (target && target !== cachedTarget) {
    setCachedTarget(target);
  }

  const [liabilityAccount, setLiabilityAccount] = useState<Account | null>(null);
  const [assetAccounts, setAssetAccounts] = useState<Account[]>([]);
  const [defaultAmountCents, setDefaultAmountCents] = useState(0);
  const [amountInput, setAmountInput] = useState('');
  const [sourceMode, setSourceMode] = useState<RepaymentSourceMode>('asset');
  const [sourceAccountId, setSourceAccountId] = useState('');
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
      const targetLiabilityId =
        target.mode === 'create' ? target.liabilityAccount.id : target.repayment.accountId;
      const [allAccounts, resolvedLiability] = await Promise.all([
        listAccounts(db, { includeArchived: true }),
        getAccountById(db, targetLiabilityId),
      ]);
      if (!active) {
        return;
      }

      const currentSourceId = target.mode === 'edit' ? target.repayment.toAccountId : null;
      const selectableAssets = allAccounts.filter(
        (acc) =>
          acc.kind === 'asset' &&
          ((!acc.isArchived && acc.isSelectable) || acc.id === currentSourceId)
      );

      const finalLiability =
        resolvedLiability ?? (target.mode === 'create' ? target.liabilityAccount : null);
      setLiabilityAccount(finalLiability);
      setAssetAccounts(selectableAssets);
      setError(null);
      setAmountInput('');

      if (target.mode === 'create') {
        const debtCents =
          finalLiability && finalLiability.balanceCents < 0
            ? Math.abs(finalLiability.balanceCents)
            : 0;
        setDefaultAmountCents(debtCents);
        const defaultAssetId = selectableAssets[0]?.id ?? '';
        setSourceMode(defaultAssetId ? 'asset' : 'direct');
        setSourceAccountId(defaultAssetId);
        setOccurredOn(getTodayIsoDate());
        setNote('');
      } else {
        const rep = target.repayment;
        setDefaultAmountCents(rep.amountCents);
        if (rep.toAccountId) {
          setSourceMode('asset');
          setSourceAccountId(rep.toAccountId);
        } else {
          setSourceMode('direct');
          setSourceAccountId(selectableAssets[0]?.id ?? '');
        }
        setOccurredOn(rep.occurredOn);
        setNote(rep.note);
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
    defaultAmountCents > 0 ? formatCentsPlain(defaultAmountCents, false) : '输入还款金额';

  const parsedDraft = normalizePositiveAmountInput(amountInput);
  const previewAmountCents =
    parsedDraft.kind === 'valid'
      ? parsedDraft.cents
      : parsedDraft.kind === 'empty'
        ? defaultAmountCents
        : 0;

  const selectedSourceAccount = assetAccounts.find((acc) => acc.id === sourceAccountId) ?? null;
  const liabilityInfo = liabilityAccount ? describeAccountBalance(liabilityAccount) : null;
  const liabilityTitle =
    liabilityAccount?.name ??
    (activeTarget.mode === 'edit' ? activeTarget.repayment.accountName : '负债账户');

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
      setError('请输入大于 0 的正数还款金额');
      return;
    }

    const finalSourceAccountId = sourceMode === 'asset' ? sourceAccountId : null;
    if (sourceMode === 'asset' && !finalSourceAccountId) {
      hapticWarning();
      setError('请选择转出资产账户，或切换为「无账户支出」');
      return;
    }

    setSaving(true);
    try {
      if (activeTarget.mode === 'create') {
        await createRepaymentTransaction(db, {
          liabilityAccountId: activeTarget.liabilityAccount.id,
          sourceAccountId: finalSourceAccountId,
          amountCents,
          occurredOn,
          note,
        });
      } else {
        await updateRepaymentTransaction(db, activeTarget.repayment.id, {
          sourceAccountId: finalSourceAccountId,
          amountCents,
          occurredOn,
          note,
        });
      }

      hapticSuccess();
      notifyChange();
      onSaved?.();
      sheetRef.current?.dismiss();
    } catch (err) {
      hapticWarning();
      setError(err instanceof Error ? err.message : '还款保存失败');
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
        title={isEdit ? '编辑还款' : '负债还款'}
        backdropLabel="关闭还款弹窗"
        expandable
        collapsedRatio={0.72}
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
              label={isEdit ? '保存修改' : '确认还款'}
              onPress={() => void handleSubmit()}
              loading={saving}
              disabled={saving}
            />
          </View>
        }
      >
        {/* 负债账户状态摘要 */}
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
            {liabilityTitle}
          </Text>
          {liabilityInfo ? (
            <Text
              style={[
                styles.tabular,
                {
                  color: liabilityInfo.isDebt ? theme.colors.expense : theme.colors.textMuted,
                  fontSize: theme.fontSize.xs,
                  marginTop: theme.spacing.xs,
                },
              ]}
            >
              {liabilityInfo.caption} {liabilityInfo.amountText}
            </Text>
          ) : null}
        </View>

        {/* 还款金额 */}
        <View style={{ marginTop: theme.spacing.lg }}>
          <View style={styles.fieldHeader}>
            <Text
              style={{
                color: theme.colors.textSecondary,
                fontSize: theme.fontSize.xs,
                fontWeight: theme.fontWeight.semibold,
              }}
            >
              还款金额
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
                    {isEdit ? '恢复原金额' : '默认还清欠款'}
                  </Text>
                </Pressable>
              ) : (
                <Text style={{ color: theme.colors.textMuted, fontSize: theme.fontSize.xs }}>
                  {isEdit ? '留空保持原金额' : '留空默认全额还清'}
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
                color: hasTypedAmount ? theme.colors.action : theme.colors.textMuted,
                fontSize: theme.fontSize.xl,
                fontWeight: theme.fontWeight.semibold,
                marginRight: theme.spacing.xs,
              }}
            >
              {CURRENCY_SYMBOL}
            </Text>
            <TextInput
              accessibilityLabel="还款金额"
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
                  color: theme.colors.action,
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

        {/* 还款方式切换：资产转入 / 无账户支出 */}
        <View style={{ marginTop: theme.spacing.lg }}>
          <Text
            style={{
              color: theme.colors.textSecondary,
              fontSize: theme.fontSize.xs,
              fontWeight: theme.fontWeight.semibold,
              marginBottom: theme.spacing.sm,
            }}
          >
            还款方式
          </Text>
          <SlidingSegmentedControl
            options={SOURCE_MODE_OPTIONS}
            value={sourceMode}
            onChange={(next) => {
              setSourceMode(next);
              if (next === 'asset' && !sourceAccountId && assetAccounts[0]) {
                setSourceAccountId(assetAccounts[0].id);
              }
              setError(null);
            }}
            fullWidth
            height={40}
            shape="pill"
            trackTone="surface"
            textSize="sm"
          />

          {sourceMode === 'asset' ? (
            <View style={{ marginTop: theme.spacing.md }}>
              {assetAccounts.length === 0 ? (
                <View
                  style={[
                    styles.hintStrip,
                    {
                      backgroundColor: theme.colors.warningSubtle,
                      borderLeftColor: theme.colors.warning,
                      borderRadius: theme.radius.sm,
                    },
                  ]}
                >
                  <Text
                    style={{
                      color: theme.colors.warningTextOnSubtle,
                      fontSize: theme.fontSize.xs,
                    }}
                  >
                    暂无可用资产账户，请切换为「无账户支出」直接还款
                  </Text>
                </View>
              ) : (
                <>
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={{ gap: theme.spacing.sm }}
                  >
                    {assetAccounts.map((acc) => {
                      const selected = acc.id === sourceAccountId;
                      return (
                        <Pressable
                          key={acc.id}
                          accessibilityRole="button"
                          accessibilityState={{ selected }}
                          onPress={() => {
                            hapticLight();
                            setSourceAccountId(acc.id);
                            setError(null);
                          }}
                          style={[
                            styles.chip,
                            {
                              backgroundColor: selected
                                ? theme.colors.actionSubtle
                                : theme.colors.surface,
                              borderColor: selected
                                ? theme.colors.action
                                : theme.colors.border,
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

                  {selectedSourceAccount && previewAmountCents > 0 && !isEdit ? (
                    <Text
                      style={[
                        styles.tabular,
                        {
                          color: theme.colors.textMuted,
                          fontSize: theme.fontSize.xs,
                          marginTop: theme.spacing.sm,
                        },
                      ]}
                    >
                      {selectedSourceAccount.name} 余额：
                      {formatCentsToYuan(selectedSourceAccount.balanceCents)} →{' '}
                      {formatCentsToYuan(selectedSourceAccount.balanceCents - previewAmountCents)}
                    </Text>
                  ) : null}
                </>
              )}
            </View>
          ) : (
            <View
              style={[
                styles.hintStrip,
                {
                  backgroundColor: theme.colors.surface,
                  borderLeftColor: theme.colors.action,
                  borderRadius: theme.radius.sm,
                  marginTop: theme.spacing.md,
                },
              ]}
            >
              <Text style={{ color: theme.colors.textMuted, fontSize: theme.fontSize.xs }}>
                仅减少该负债欠款，不从其他资产账户扣款，不计入收支统计
              </Text>
            </View>
          )}
        </View>

        {/* 还款日期 */}
        <View style={{ marginTop: theme.spacing.lg }}>
          <Text
            style={{
              color: theme.colors.textSecondary,
              fontSize: theme.fontSize.xs,
              fontWeight: theme.fontWeight.semibold,
              marginBottom: theme.spacing.sm,
            }}
          >
            还款日期
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

        {/* 还款备注 */}
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
            accessibilityLabel="还款备注"
            value={note}
            onChangeText={setNote}
            placeholder="账单还款、提前结清等"
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
  hintStrip: {
    borderLeftWidth: 3,
    paddingHorizontal: 12,
    paddingVertical: 8,
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
