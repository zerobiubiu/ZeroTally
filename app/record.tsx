/**
 * 约束简报（Workflow B / C）：
 * - 信息层级：主（金额大号输入 36px/600 + 底部唯一主操作「保存」）、次（支出/收入/转账切换、4 列规整分类网格、账户选择）、弱（日期、备注、编辑态删除）
 * - 布局规整：分类采用显式 4 列等宽行避免像素舍入断行；日期将「今天/昨天」置入标签行右端，下方步进器占满宽度不截断
 * - 文案密度：字段标签 2-4 字，placeholder 仅给输入示例，无说明性冗余段落
 */
import * as Haptics from 'expo-haptics';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import React, { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useDatabase } from '../src/db/database-context';
import { describeAccountBalance } from '../src/features/accounts/rules';
import { listAccounts } from '../src/features/accounts/service';
import type { Account } from '../src/features/accounts/types';
import { listCategories } from '../src/features/categories/service';
import type { Category } from '../src/features/categories/types';
import {
  createTransaction,
  deleteTransaction,
  getTransactionById,
  updateTransaction,
} from '../src/features/transactions/service';
import type { TransactionType } from '../src/features/transactions/types';
import { getTodayIsoDate, isValidIsoDate, shiftIsoDate } from '../src/shared/date/date';
import {
  centsToInputString,
  CURRENCY_SYMBOL,
  parseYuanToCents,
} from '../src/shared/money/money';
import { AppIcon } from '../src/shared/ui/AppIcon';
import { Button } from '../src/shared/ui/Button';
import { SafeScreen } from '../src/shared/ui/SafeScreen';
import { useTheme } from '../src/theme/theme-context';

const TYPE_TABS: readonly { value: TransactionType; label: string }[] = [
  { value: 'expense', label: '支出' },
  { value: 'income', label: '收入' },
  { value: 'transfer', label: '转账' },
];

function firstParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function chunkItems<T>(items: readonly T[], columns: number): (T | null)[][] {
  const rows: (T | null)[][] = [];
  for (let i = 0; i < items.length; i += columns) {
    const row: (T | null)[] = items.slice(i, i + columns);
    while (row.length < columns) {
      row.push(null);
    }
    rows.push(row);
  }
  return rows;
}

export default function RecordScreen(): React.JSX.Element {
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { db, revision, notifyChange } = useDatabase();

  const params = useLocalSearchParams<{
    id?: string | string[];
    accountId?: string | string[];
    type?: string | string[];
  }>();
  const editId = firstParam(params.id);
  const prefilledAccountId = firstParam(params.accountId);
  const prefilledType = firstParam(params.type);
  const isEditing = Boolean(editId);

  const [txType, setTxType] = useState<TransactionType>(() =>
    prefilledType === 'income' || prefilledType === 'transfer' ? prefilledType : 'expense'
  );
  const [amountInput, setAmountInput] = useState('');
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [accountId, setAccountId] = useState<string>('');
  const [toAccountId, setToAccountId] = useState<string>('');
  const [occurredOn, setOccurredOn] = useState<string>(() => getTodayIsoDate());
  const [note, setNote] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  const [accounts, setAccounts] = useState<Account[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);

  useEffect(() => {
    let active = true;
    void (async () => {
      const [allAccounts, allCategories, existingTx] = await Promise.all([
        listAccounts(db, { includeArchived: true }),
        listCategories(db, { includeArchived: true }),
        editId ? getTransactionById(db, editId) : Promise.resolve(null),
      ]);
      if (!active) {
        return;
      }

      const visibleAccounts = allAccounts.filter(
        (acc) =>
          !acc.isArchived ||
          (existingTx && (acc.id === existingTx.accountId || acc.id === existingTx.toAccountId))
      );
      const visibleCategories = allCategories.filter(
        (cat) => !cat.isArchived || (existingTx && cat.id === existingTx.categoryId)
      );

      setAccounts(visibleAccounts);
      setCategories(visibleCategories);

      if (existingTx) {
        setTxType(existingTx.type);
        setAmountInput(centsToInputString(existingTx.amountCents));
        setCategoryId(existingTx.categoryId);
        setAccountId(existingTx.accountId);
        setToAccountId(existingTx.toAccountId ?? '');
        setOccurredOn(existingTx.occurredOn);
        setNote(existingTx.note);
      } else {
        const defaultSource =
          (prefilledAccountId && visibleAccounts.find((a) => a.id === prefilledAccountId)?.id) ||
          visibleAccounts[0]?.id ||
          '';
        const defaultTarget = visibleAccounts.find((a) => a.id !== defaultSource)?.id ?? '';

        setAccountId((prev) =>
          prev && visibleAccounts.some((a) => a.id === prev) ? prev : defaultSource
        );
        setToAccountId((prev) =>
          prev && prev !== defaultSource && visibleAccounts.some((a) => a.id === prev)
            ? prev
            : defaultTarget
        );
      }

      setLoading(false);
    })();
    return () => {
      active = false;
    };
  }, [db, editId, prefilledAccountId, revision]);

  const activeCategoriesForType = useMemo(() => {
    if (txType === 'transfer') {
      return [];
    }
    return categories.filter((c) => c.type === txType);
  }, [categories, txType]);

  const categoryRows = useMemo(
    () => chunkItems(activeCategoriesForType, 4),
    [activeCategoriesForType]
  );

  const effectiveCategoryId = useMemo(() => {
    if (txType === 'transfer') {
      return null;
    }
    if (categoryId && activeCategoriesForType.some((c) => c.id === categoryId)) {
      return categoryId;
    }
    return activeCategoriesForType[0]?.id ?? null;
  }, [txType, categoryId, activeCategoriesForType]);

  const effectiveToAccountId = useMemo(() => {
    if (txType !== 'transfer') {
      return '';
    }
    if (toAccountId && toAccountId !== accountId && accounts.some((a) => a.id === toAccountId)) {
      return toAccountId;
    }
    return accounts.find((a) => a.id !== accountId)?.id ?? '';
  }, [txType, toAccountId, accountId, accounts]);

  const handleSwapTransferAccounts = () => {
    if (!accountId || !effectiveToAccountId) {
      return;
    }
    const prevFrom = accountId;
    setAccountId(effectiveToAccountId);
    setToAccountId(prevFrom);
  };

  const handleSave = async () => {
    setFormError(null);
    const amountCents = parseYuanToCents(amountInput);
    if (amountCents === null || amountCents <= 0) {
      setFormError('请输入大于 0 的金额（最多两位小数）');
      return;
    }
    if (!isValidIsoDate(occurredOn)) {
      setFormError('日期格式须为 YYYY-MM-DD');
      return;
    }
    if (!accountId) {
      setFormError('请选择账户');
      return;
    }
    if (txType === 'transfer') {
      if (!effectiveToAccountId || effectiveToAccountId === accountId) {
        setFormError('转出与转入账户不能相同');
        return;
      }
    } else if (!effectiveCategoryId) {
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

      try {
        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      } catch {
        // 忽略无震动硬件设备的异常
      }

      notifyChange();
      router.back();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : '保存失败');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = () => {
    if (!editId) {
      return;
    }
    Alert.alert('删除记录', '删除后将自动回滚关联账户余额，无法撤销。', [
      { text: '取消', style: 'cancel' },
      {
        text: '删除',
        style: 'destructive',
        onPress: () => {
          void (async () => {
            try {
              await deleteTransaction(db, editId);
              notifyChange();
              router.back();
            } catch (err) {
              setFormError(err instanceof Error ? err.message : '删除失败');
            }
          })();
        },
      },
    ]);
  };

  const todayIso = getTodayIsoDate();
  const yesterdayIso = shiftIsoDate(todayIso, -1);

  const amountColor =
    txType === 'expense'
      ? theme.colors.expense
      : txType === 'income'
        ? theme.colors.income
        : theme.colors.transfer;

  return (
    <SafeScreen edges={['left', 'right']}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <Stack.Screen options={{ title: isEditing ? '编辑账目' : '记一笔' }} />

        <ScrollView
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{
            padding: theme.spacing.lg,
            paddingBottom: Math.max(insets.bottom, theme.spacing.lg) + theme.spacing.xl,
          }}
        >
          {/* 类型切换：支出 / 收入 / 转账 */}
          <View
            style={[
              styles.segmentBar,
              {
                backgroundColor: theme.colors.surfaceRaised,
                borderRadius: theme.radius.md,
                padding: theme.spacing.xs,
              },
            ]}
          >
            {TYPE_TABS.map((tab) => {
              const selected = txType === tab.value;
              return (
                <Pressable
                  key={tab.value}
                  accessibilityRole="tab"
                  accessibilityState={{ selected }}
                  onPress={() => {
                    setTxType(tab.value);
                    setFormError(null);
                  }}
                  style={[
                    styles.segmentItem,
                    {
                      borderRadius: theme.radius.sm,
                      backgroundColor: selected ? theme.colors.actionSubtle : 'transparent',
                    },
                  ]}
                >
                  <Text
                    style={{
                      color: selected ? theme.colors.actionTextOnSubtle : theme.colors.textMuted,
                      fontSize: theme.fontSize.base,
                      fontWeight: selected ? theme.fontWeight.semibold : theme.fontWeight.regular,
                    }}
                  >
                    {tab.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          {/* 金额输入卡片 */}
          <View
            style={[
              styles.amountCard,
              theme.elevation.card,
              {
                backgroundColor: theme.colors.surfaceRaised,
                borderRadius: theme.radius.lg,
                padding: theme.spacing.lg,
                marginTop: theme.spacing.lg,
              },
            ]}
          >
            <Text style={{ color: theme.colors.textMuted, fontSize: theme.fontSize.xs }}>
              金额
            </Text>
            <View style={[styles.amountInputRow, { marginTop: theme.spacing.sm }]}>
              <Text
                style={{
                  color: amountColor,
                  fontSize: theme.fontSize.xxl,
                  fontWeight: theme.fontWeight.semibold,
                  marginRight: theme.spacing.sm,
                }}
              >
                {CURRENCY_SYMBOL}
              </Text>
              <TextInput
                accessibilityLabel="金额"
                value={amountInput}
                onChangeText={(text) => {
                  setAmountInput(text);
                  if (formError) {
                    setFormError(null);
                  }
                }}
                keyboardType="decimal-pad"
                placeholder="0.00"
                placeholderTextColor={theme.colors.textMuted}
                autoFocus={!isEditing}
                style={[
                  styles.amountInput,
                  {
                    color: amountColor,
                    fontSize: theme.fontSize.display,
                    fontWeight: theme.fontWeight.semibold,
                  },
                ]}
              />
            </View>
          </View>

          {/* 4 列等宽规整分类网格 */}
          {txType !== 'transfer' ? (
            <View style={{ marginTop: theme.spacing.xl }}>
              <View style={[styles.sectionHeader, { marginBottom: theme.spacing.sm }]}>
                <Text
                  style={{
                    color: theme.colors.textSecondary,
                    fontSize: theme.fontSize.sm,
                    fontWeight: theme.fontWeight.semibold,
                  }}
                >
                  分类
                </Text>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="分类管理"
                  onPress={() => router.push('/categories')}
                  hitSlop={8}
                >
                  <Text
                    style={{
                      color: theme.colors.action,
                      fontSize: theme.fontSize.sm,
                      fontWeight: theme.fontWeight.semibold,
                    }}
                  >
                    管理
                  </Text>
                </Pressable>
              </View>

              <View
                style={[
                  styles.categoryCard,
                  {
                    backgroundColor: theme.colors.surfaceRaised,
                    borderRadius: theme.radius.lg,
                    padding: theme.spacing.sm,
                    gap: theme.spacing.xs,
                  },
                ]}
              >
                {categoryRows.map((row, rowIndex) => (
                  <View key={rowIndex} style={styles.categoryRow}>
                    {row.map((cat, colIndex) => {
                      if (!cat) {
                        return <View key={`empty_${colIndex}`} style={styles.categoryCell} />;
                      }
                      const selected = cat.id === effectiveCategoryId;
                      return (
                        <Pressable
                          key={cat.id}
                          accessibilityRole="button"
                          accessibilityLabel={cat.name}
                          accessibilityState={{ selected }}
                          onPress={() => setCategoryId(cat.id)}
                          style={[
                            styles.categoryCell,
                            {
                              borderRadius: theme.radius.md,
                              backgroundColor: selected ? theme.colors.actionSubtle : 'transparent',
                              borderColor: selected ? theme.colors.action : 'transparent',
                              borderWidth: theme.borderWidth.focus,
                            },
                          ]}
                        >
                          <View
                            style={[
                              styles.catIconWrap,
                              {
                                backgroundColor: selected
                                  ? theme.colors.action
                                  : theme.colors.surface,
                                borderRadius: theme.radius.full,
                              },
                            ]}
                          >
                            <AppIcon
                              name={cat.icon}
                              size={18}
                              color={selected ? theme.colors.onAction : theme.colors.textSecondary}
                            />
                          </View>
                          <Text
                            numberOfLines={1}
                            style={{
                              color: selected ? theme.colors.actionTextOnSubtle : theme.colors.text,
                              fontSize: theme.fontSize.xs,
                              fontWeight: selected
                                ? theme.fontWeight.semibold
                                : theme.fontWeight.regular,
                              marginTop: theme.spacing.xs,
                            }}
                          >
                            {cat.name}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </View>
                ))}
              </View>
            </View>
          ) : null}

          {/* 账户选择 */}
          <View style={{ marginTop: theme.spacing.xl }}>
            <Text
              style={{
                color: theme.colors.textSecondary,
                fontSize: theme.fontSize.sm,
                fontWeight: theme.fontWeight.semibold,
                marginBottom: theme.spacing.sm,
              }}
            >
              {txType === 'transfer' ? '转出账户' : txType === 'expense' ? '付款账户' : '收款账户'}
            </Text>

            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.chipRow}
            >
              {accounts.map((acc) => {
                const selected = acc.id === accountId;
                const bal = describeAccountBalance(acc);
                return (
                  <Pressable
                    key={acc.id}
                    accessibilityRole="button"
                    accessibilityLabel={`${acc.name}，${bal.caption} ${bal.amountText}`}
                    accessibilityState={{ selected }}
                    onPress={() => {
                      setAccountId(acc.id);
                      if (txType === 'transfer' && acc.id === toAccountId) {
                        const another = accounts.find((a) => a.id !== acc.id);
                        setToAccountId(another?.id ?? '');
                      }
                    }}
                    style={[
                      styles.accountChip,
                      {
                        backgroundColor: selected
                          ? theme.colors.actionSubtle
                          : theme.colors.surfaceRaised,
                        borderColor: selected ? theme.colors.action : theme.colors.border,
                        borderWidth: selected
                          ? theme.borderWidth.focus
                          : theme.borderWidth.hairline,
                        borderRadius: theme.radius.md,
                      },
                    ]}
                  >
                    <Text
                      numberOfLines={1}
                      style={{
                        color: selected ? theme.colors.actionTextOnSubtle : theme.colors.text,
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
                          marginTop: 2,
                        },
                      ]}
                    >
                      {bal.amountText}
                    </Text>
                  </Pressable>
                );
              })}
            </ScrollView>

            {txType === 'transfer' ? (
              <View style={{ marginTop: theme.spacing.lg }}>
                <View style={[styles.sectionHeader, { marginBottom: theme.spacing.sm }]}>
                  <Text
                    style={{
                      color: theme.colors.textSecondary,
                      fontSize: theme.fontSize.sm,
                      fontWeight: theme.fontWeight.semibold,
                    }}
                  >
                    转入账户
                  </Text>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="互换账户"
                    onPress={handleSwapTransferAccounts}
                    hitSlop={8}
                    style={styles.swapBtn}
                  >
                    <AppIcon name="swap-vertical-outline" size={16} color={theme.colors.action} />
                    <Text
                      style={{
                        color: theme.colors.action,
                        fontSize: theme.fontSize.xs,
                        fontWeight: theme.fontWeight.semibold,
                        marginLeft: 4,
                      }}
                    >
                      互换
                    </Text>
                  </Pressable>
                </View>

                {accounts.length < 2 ? (
                  <Text style={{ color: theme.colors.warning, fontSize: theme.fontSize.sm }}>
                    至少需 2 个账户才能转账
                  </Text>
                ) : (
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={styles.chipRow}
                  >
                    {accounts
                      .filter((acc) => acc.id !== accountId)
                      .map((acc) => {
                        const selected = acc.id === effectiveToAccountId;
                        const bal = describeAccountBalance(acc);
                        return (
                          <Pressable
                            key={acc.id}
                            accessibilityRole="button"
                            accessibilityState={{ selected }}
                            onPress={() => setToAccountId(acc.id)}
                            style={[
                              styles.accountChip,
                              {
                                backgroundColor: selected
                                  ? theme.colors.transferSubtle
                                  : theme.colors.surfaceRaised,
                                borderColor: selected ? theme.colors.transfer : theme.colors.border,
                                borderWidth: selected
                                  ? theme.borderWidth.focus
                                  : theme.borderWidth.hairline,
                                borderRadius: theme.radius.md,
                              },
                            ]}
                          >
                            <Text
                              numberOfLines={1}
                              style={{
                                color: selected
                                  ? theme.colors.transferTextOnSubtle
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
                                    ? theme.colors.transferTextOnSubtle
                                    : theme.colors.textMuted,
                                  fontSize: theme.fontSize.xs,
                                  marginTop: 2,
                                },
                              ]}
                            >
                              {bal.amountText}
                            </Text>
                          </Pressable>
                        );
                      })}
                  </ScrollView>
                )}
              </View>
            ) : null}
          </View>

          {/* 日期：快捷项置入标题行右端，下方步进器占满整行不截断 */}
          <View style={{ marginTop: theme.spacing.xl }}>
            <View style={[styles.sectionHeader, { marginBottom: theme.spacing.sm }]}>
              <Text
                style={{
                  color: theme.colors.textSecondary,
                  fontSize: theme.fontSize.sm,
                  fontWeight: theme.fontWeight.semibold,
                }}
              >
                日期
              </Text>

              <View style={styles.quickDateRow}>
                {[
                  { label: '今天', value: todayIso },
                  { label: '昨天', value: yesterdayIso },
                ].map((opt) => {
                  const selected = occurredOn === opt.value;
                  return (
                    <Pressable
                      key={opt.label}
                      accessibilityRole="button"
                      accessibilityState={{ selected }}
                      onPress={() => setOccurredOn(opt.value)}
                      hitSlop={4}
                      style={[
                        styles.quickDateChip,
                        {
                          backgroundColor: selected
                            ? theme.colors.actionSubtle
                            : theme.colors.surfaceRaised,
                          borderColor: selected ? theme.colors.action : theme.colors.border,
                          borderRadius: theme.radius.sm,
                        },
                      ]}
                    >
                      <Text
                        style={{
                          color: selected
                            ? theme.colors.actionTextOnSubtle
                            : theme.colors.textSecondary,
                          fontSize: theme.fontSize.xs,
                          fontWeight: theme.fontWeight.semibold,
                        }}
                      >
                        {opt.label}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>

            <View style={styles.dateStepperRow}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="前一天"
                onPress={() => {
                  if (isValidIsoDate(occurredOn)) {
                    setOccurredOn(shiftIsoDate(occurredOn, -1));
                  }
                }}
                style={[
                  styles.dateStepBtn,
                  {
                    backgroundColor: theme.colors.surfaceRaised,
                    borderColor: theme.colors.border,
                    borderRadius: theme.radius.md,
                  },
                ]}
              >
                <AppIcon name="chevron-back" size={18} color={theme.colors.textSecondary} />
              </Pressable>

              <TextInput
                accessibilityLabel="交易日期，格式为 YYYY-MM-DD"
                value={occurredOn}
                onChangeText={setOccurredOn}
                placeholder="2026-11-25"
                placeholderTextColor={theme.colors.textMuted}
                maxLength={10}
                style={[
                  styles.dateInput,
                  {
                    backgroundColor: theme.colors.surfaceRaised,
                    borderColor: theme.colors.border,
                    color: theme.colors.text,
                    borderRadius: theme.radius.md,
                    fontSize: theme.fontSize.base,
                  },
                ]}
              />

              <Pressable
                accessibilityRole="button"
                accessibilityLabel="后一天"
                onPress={() => {
                  if (isValidIsoDate(occurredOn)) {
                    setOccurredOn(shiftIsoDate(occurredOn, 1));
                  }
                }}
                style={[
                  styles.dateStepBtn,
                  {
                    backgroundColor: theme.colors.surfaceRaised,
                    borderColor: theme.colors.border,
                    borderRadius: theme.radius.md,
                  },
                ]}
              >
                <AppIcon name="chevron-forward" size={18} color={theme.colors.textSecondary} />
              </Pressable>
            </View>
          </View>

          {/* 备注 */}
          <View style={{ marginTop: theme.spacing.xl }}>
            <Text
              style={{
                color: theme.colors.textSecondary,
                fontSize: theme.fontSize.sm,
                fontWeight: theme.fontWeight.semibold,
                marginBottom: theme.spacing.sm,
              }}
            >
              备注
            </Text>
            <TextInput
              accessibilityLabel="备注"
              value={note}
              onChangeText={setNote}
              placeholder="午餐"
              placeholderTextColor={theme.colors.textMuted}
              maxLength={120}
              style={[
                styles.textInput,
                {
                  backgroundColor: theme.colors.surfaceRaised,
                  borderColor: theme.colors.border,
                  color: theme.colors.text,
                  borderRadius: theme.radius.md,
                  fontSize: theme.fontSize.base,
                },
              ]}
            />
          </View>

          {formError ? (
            <View
              style={[
                styles.errorBanner,
                {
                  backgroundColor: theme.colors.expenseSubtle,
                  borderLeftColor: theme.colors.expense,
                  borderRadius: theme.radius.sm,
                  marginTop: theme.spacing.lg,
                },
              ]}
            >
              <AppIcon
                name="alert-circle-outline"
                size={18}
                color={theme.colors.expenseTextOnSubtle}
              />
              <Text
                style={{
                  color: theme.colors.expenseTextOnSubtle,
                  fontSize: theme.fontSize.sm,
                  marginLeft: theme.spacing.sm,
                  flex: 1,
                }}
              >
                {formError}
              </Text>
            </View>
          ) : null}

          <Button
            label="保存"
            onPress={() => void handleSave()}
            loading={saving}
            disabled={loading || (txType === 'transfer' && accounts.length < 2)}
            style={{ marginTop: theme.spacing.xl }}
          />

          {isEditing ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="删除记录"
              onPress={handleDelete}
              style={({ pressed }) => [
                styles.deleteLink,
                { marginTop: theme.spacing.md },
                pressed && { opacity: theme.opacity.pressed },
              ]}
            >
              <Text
                style={{
                  color: theme.colors.expense,
                  fontSize: theme.fontSize.sm,
                  fontWeight: theme.fontWeight.semibold,
                }}
              >
                删除记录
              </Text>
            </Pressable>
          ) : null}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeScreen>
  );
}

const styles = StyleSheet.create({
  segmentBar: {
    flexDirection: 'row',
    gap: 4,
  },
  segmentItem: {
    flex: 1,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  amountCard: {},
  amountInputRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
  },
  amountInput: {
    flex: 1,
    paddingVertical: 4,
    fontVariant: ['tabular-nums'],
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  categoryCard: {},
  categoryRow: {
    flexDirection: 'row',
    gap: 4,
  },
  categoryCell: {
    flex: 1,
    paddingVertical: 10,
    paddingHorizontal: 4,
    alignItems: 'center',
  },
  catIconWrap: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chipRow: {
    gap: 8,
    paddingRight: 8,
  },
  accountChip: {
    minHeight: 54,
    minWidth: 108,
    maxWidth: 160,
    paddingHorizontal: 14,
    paddingVertical: 8,
    justifyContent: 'center',
  },
  swapBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 32,
  },
  quickDateRow: {
    flexDirection: 'row',
    gap: 8,
  },
  quickDateChip: {
    minHeight: 30,
    paddingHorizontal: 10,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  dateStepperRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  dateStepBtn: {
    width: 48,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  dateInput: {
    flex: 1,
    height: 48,
    borderWidth: 1,
    paddingHorizontal: 12,
    textAlign: 'center',
    fontVariant: ['tabular-nums'],
  },
  textInput: {
    minHeight: 48,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    borderLeftWidth: 4,
    padding: 12,
  },
  deleteLink: {
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabular: {
    fontVariant: ['tabular-nums'],
  },
});
