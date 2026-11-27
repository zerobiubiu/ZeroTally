/**
 * 约束简报（Workflow B / C）：
 * - 类型驱动：账户性质由类型唯一决定（信用卡 / 借款为负债），不再提供「性质」选择
 * - 信息层级：主（类型选择 + 统一基础信息卡含名称/占位免手删初始金额/备注 + 底部「保存」）、次（银行卡信息卡含可清空开户日期、图标）、弱（三独立统计与可选开关）
 * - 编辑态：账户管理（归档 / 恢复 / 删除）收纳于本页底部；归档一次确认，删除走严格互斥单 Modal 三重校验（AccountDeleteFlow）
 */
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import React, { useEffect, useMemo, useState } from 'react';
import {
  KeyboardAvoidingView,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useDatabase } from '../src/db/database-context';
import { AccountDeleteFlow } from '../src/features/accounts/components/AccountDeleteFlow';
import {
  MAX_BANK_TEXT_LENGTH,
  MAX_CARD_NUMBER_LENGTH,
  kindForCategory,
  supportsCardInfo,
} from '../src/features/accounts/rules';
import {
  archiveAccount,
  createAccount,
  getAccountById,
  restoreAccount,
  updateAccount,
} from '../src/features/accounts/service';
import {
  ACCOUNT_CATEGORY_METAS,
  ACCOUNT_COLOR_OPTIONS,
  ACCOUNT_ICON_OPTIONS,
  type Account,
  type AccountCategory,
} from '../src/features/accounts/types';
import { DatePickerSheet } from '../src/features/transactions/components/DatePickerSheet';
import {
  countAccountTransactions,
  deleteAccountWithTransactions,
} from '../src/features/transactions/service';
import { getTodayIsoDate } from '../src/shared/date/date';
import { hapticLight } from '../src/shared/haptics/haptics';
import {
  parseSignedYuanToCents,
  parseYuanToCents,
  truncateExcessDecimalsInput,
} from '../src/shared/money/money';
import { AppIcon } from '../src/shared/ui/AppIcon';
import { Button } from '../src/shared/ui/Button';
import { ConfirmDialog } from '../src/shared/ui/ConfirmDialog';
import { SafeScreen } from '../src/shared/ui/SafeScreen';
import { useTheme } from '../src/theme/theme-context';

function firstParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function chunkIcons(items: readonly string[], columns: number): string[][] {
  const rows: string[][] = [];
  for (let i = 0; i < items.length; i += columns) {
    rows.push(items.slice(i, i + columns));
  }
  return rows;
}

function truncateSignedDecimals(raw: string): string {
  const trimmed = raw.trim();
  if (trimmed.startsWith('-')) {
    return `-${truncateExcessDecimalsInput(trimmed.slice(1))}`;
  }
  return truncateExcessDecimalsInput(raw);
}

export default function AccountFormScreen(): React.JSX.Element {
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { db, notifyChange } = useDatabase();

  const params = useLocalSearchParams<{ id?: string | string[] }>();
  const editId = firstParam(params.id);
  const isEditing = Boolean(editId);

  const [name, setName] = useState('');
  const [category, setCategory] = useState<AccountCategory>('bank');
  /** 初始留空以浅色占位提示 0.00，直接键入即可免手删 */
  const [initialInput, setInitialInput] = useState('');
  const [icon, setIcon] = useState<string>('card-outline');
  const [color, setColor] = useState<string>(ACCOUNT_COLOR_OPTIONS[0] ?? '#0F766E');
  const [includeInTotalAssets, setIncludeInTotalAssets] = useState(true);
  const [includeInNetWorth, setIncludeInNetWorth] = useState(true);
  const [isSelectable, setIsSelectable] = useState(true);
  const [cardNumber, setCardNumber] = useState('');
  const [bankName, setBankName] = useState('');
  const [bankBranch, setBankBranch] = useState('');
  const [openedOn, setOpenedOn] = useState('');
  const [datePickerOpen, setDatePickerOpen] = useState(false);
  const [note, setNote] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [loadedAccount, setLoadedAccount] = useState<Account | null>(null);
  const [txCount, setTxCount] = useState(0);
  const [archiveConfirmOpen, setArchiveConfirmOpen] = useState(false);
  const [archiveLoading, setArchiveLoading] = useState(false);
  const [archiveError, setArchiveError] = useState<string | null>(null);
  const [restoreLoading, setRestoreLoading] = useState(false);
  const [deleteFlowOpen, setDeleteFlowOpen] = useState(false);
  const [manageError, setManageError] = useState<string | null>(null);

  const isLiability = kindForCategory(category) === 'liability';
  const showCardInfo = supportsCardInfo(category);
  const iconRows = useMemo(() => chunkIcons(ACCOUNT_ICON_OPTIONS, 4), []);

  useEffect(() => {
    if (!editId) {
      return;
    }
    let active = true;
    void (async () => {
      const [acc, count] = await Promise.all([
        getAccountById(db, editId),
        countAccountTransactions(db, editId),
      ]);
      if (active && acc) {
        setLoadedAccount(acc);
        setTxCount(count);
        setName(acc.name);
        setCategory(acc.category);
        setIcon(acc.icon);
        setColor(acc.color);
        setIncludeInTotalAssets(acc.includeInTotalAssets);
        setIncludeInNetWorth(acc.includeInNetWorth);
        setIsSelectable(acc.isSelectable);
        setCardNumber(acc.cardNumber);
        setBankName(acc.bankName);
        setBankBranch(acc.bankBranch);
        setOpenedOn(acc.openedOn);
        setNote(acc.note);
      }
    })();
    return () => {
      active = false;
    };
  }, [db, editId]);

  const handleSelectCategory = (nextCat: AccountCategory) => {
    hapticLight();
    setCategory(nextCat);
    const meta = ACCOUNT_CATEGORY_METAS.find((m) => m.value === nextCat);
    if (meta && !isEditing) {
      setIcon(meta.defaultIcon);
      setColor(meta.defaultColor);
    }
  };

  const handleSave = async () => {
    setFormError(null);
    if (!name.trim()) {
      setFormError('请输入账户名称');
      return;
    }

    setSaving(true);
    try {
      const cardInfo = { cardNumber, bankName, bankBranch, openedOn };
      if (editId) {
        await updateAccount(db, editId, {
          name,
          category,
          includeInTotalAssets,
          includeInNetWorth,
          isSelectable,
          icon,
          color,
          note,
          ...cardInfo,
        });
      } else {
        const trimmedInitial = initialInput.trim();
        let initialBalanceCents = 0;
        if (trimmedInitial) {
          if (isLiability) {
            const debtCents = parseYuanToCents(trimmedInitial);
            if (debtCents === null) {
              setFormError('待还欠款须为非负数字（最多两位小数）');
              setSaving(false);
              return;
            }
            initialBalanceCents = debtCents === 0 ? 0 : -debtCents;
          } else {
            const parsed = parseSignedYuanToCents(trimmedInitial);
            if (parsed === null) {
              setFormError('初始余额格式无效（最多两位小数）');
              setSaving(false);
              return;
            }
            initialBalanceCents = parsed;
          }
        }

        await createAccount(db, {
          name,
          category,
          initialBalanceCents,
          includeInTotalAssets,
          includeInNetWorth,
          isSelectable,
          icon,
          color,
          note,
          ...cardInfo,
        });
      }

      notifyChange();
      router.back();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : '保存失败');
    } finally {
      setSaving(false);
    }
  };

  const handleArchiveConfirm = async () => {
    if (!loadedAccount || archiveLoading) {
      return;
    }
    setArchiveLoading(true);
    setArchiveError(null);
    try {
      await archiveAccount(db, loadedAccount.id);
      notifyChange();
      router.back();
    } catch (err) {
      setArchiveError(err instanceof Error ? err.message : '归档账户失败');
    } finally {
      setArchiveLoading(false);
    }
  };

  const handleRestore = async () => {
    if (!loadedAccount || restoreLoading) {
      return;
    }
    setRestoreLoading(true);
    setManageError(null);
    try {
      await restoreAccount(db, loadedAccount.id);
      notifyChange();
      router.back();
    } catch (err) {
      setManageError(err instanceof Error ? err.message : '恢复账户失败');
    } finally {
      setRestoreLoading(false);
    }
  };

  const handleDeletedExit = () => {
    setDeleteFlowOpen(false);
    // 越过「编辑」与刚被删账户的「详情」两层，分别精准退回资产页或已归档列表页
    if (router.canDismiss()) {
      router.dismiss(2);
    } else {
      router.replace('/(tabs)/assets');
    }
  };

  const sectionTitleStyle = {
    color: theme.colors.textSecondary,
    fontSize: theme.fontSize.xs,
    fontWeight: theme.fontWeight.semibold,
    marginBottom: theme.spacing.sm,
    paddingHorizontal: 4,
  } as const;

  const groupCardStyle = [
    styles.groupCard,
    {
      backgroundColor: theme.colors.surfaceRaised,
      borderColor: theme.colors.border,
      borderWidth: theme.borderWidth.hairline,
      borderRadius: theme.radius.lg,
    },
  ];

  return (
    <SafeScreen edges={['left', 'right']}>
      <Stack.Screen options={{ title: isEditing ? '编辑账户' : '新增账户' }} />

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior="padding"
        keyboardVerticalOffset={insets.top + 56}
      >
        <ScrollView
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{
            padding: theme.spacing.lg,
            paddingBottom: Math.max(insets.bottom, theme.spacing.lg) + theme.spacing.xl,
          }}
        >
          {/* 账户类型（性质由类型唯一决定） */}
          <View>
            <Text style={sectionTitleStyle}>账户类型</Text>
            <View style={styles.wrapRow}>
              {ACCOUNT_CATEGORY_METAS.map((meta) => {
                const selected = category === meta.value;
                return (
                  <Pressable
                    key={meta.value}
                    accessibilityRole="button"
                    accessibilityState={{ selected }}
                    onPress={() => handleSelectCategory(meta.value)}
                    style={({ pressed }) => [
                      styles.tagChip,
                      {
                        backgroundColor: selected
                          ? theme.colors.actionSubtle
                          : theme.colors.surfaceRaised,
                        borderColor: selected ? theme.colors.action : theme.colors.border,
                        borderWidth: selected
                          ? theme.borderWidth.focus
                          : theme.borderWidth.hairline,
                        paddingHorizontal: selected ? 11 : 12,
                        borderRadius: theme.radius.md,
                      },
                      pressed && { opacity: theme.opacity.pressed },
                    ]}
                  >
                    <AppIcon
                      name={meta.defaultIcon}
                      size={16}
                      color={selected ? theme.colors.actionTextOnSubtle : theme.colors.textSecondary}
                    />
                    <Text
                      style={{
                        color: selected ? theme.colors.actionTextOnSubtle : theme.colors.text,
                        fontSize: theme.fontSize.sm,
                        fontWeight: selected
                          ? theme.fontWeight.semibold
                          : theme.fontWeight.regular,
                        marginLeft: 6,
                      }}
                    >
                      {meta.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>

          {/* 基础信息卡片（名称 + 初始金额 + 备注） */}
          <View style={{ marginTop: theme.spacing.lg }}>
            <Text style={sectionTitleStyle}>基础信息</Text>
            <View style={groupCardStyle}>
              <View style={styles.fieldRow}>
                <Text style={[styles.fieldLabel, { color: theme.colors.textSecondary }]}>名称</Text>
                <TextInput
                  accessibilityLabel="账户名称"
                  value={name}
                  onChangeText={setName}
                  placeholder={isLiability ? '招行信用卡' : '招商储蓄卡'}
                  placeholderTextColor={theme.colors.textMuted}
                  maxLength={24}
                  style={[styles.fieldInput, { color: theme.colors.text }]}
                />
              </View>

              {!isEditing ? (
                <>
                  <View style={[styles.divider, { backgroundColor: theme.colors.border }]} />
                  <View style={styles.fieldRow}>
                    <Text style={[styles.fieldLabel, { color: theme.colors.textSecondary }]}>
                      {isLiability ? '待还欠款' : '初始余额'}
                    </Text>
                    <TextInput
                      accessibilityLabel={isLiability ? '待还欠款' : '初始余额'}
                      value={initialInput}
                      onChangeText={(text) =>
                        setInitialInput(
                          isLiability
                            ? truncateExcessDecimalsInput(text)
                            : truncateSignedDecimals(text)
                        )
                      }
                      keyboardType={isLiability ? 'decimal-pad' : 'numbers-and-punctuation'}
                      placeholder={isLiability ? '0.00（填正数）' : '0.00'}
                      placeholderTextColor={theme.colors.textMuted}
                      style={[
                        styles.fieldInput,
                        styles.tabular,
                        { color: theme.colors.text },
                      ]}
                    />
                  </View>
                </>
              ) : null}

              <View style={[styles.divider, { backgroundColor: theme.colors.border }]} />
              <View style={styles.fieldRow}>
                <Text style={[styles.fieldLabel, { color: theme.colors.textSecondary }]}>备注</Text>
                <TextInput
                  accessibilityLabel="备注"
                  value={note}
                  onChangeText={setNote}
                  placeholder="选填，如尾号 8821"
                  placeholderTextColor={theme.colors.textMuted}
                  maxLength={80}
                  style={[styles.fieldInput, { color: theme.colors.text }]}
                />
              </View>
            </View>
          </View>

          {/* 银行卡基础信息（仅储蓄卡 / 信用卡） */}
          {showCardInfo ? (
            <View style={{ marginTop: theme.spacing.lg }}>
              <Text style={sectionTitleStyle}>银行卡信息（选填，详情页可一键复制）</Text>
              <View style={groupCardStyle}>
                <View style={styles.fieldRow}>
                  <Text style={[styles.fieldLabel, { color: theme.colors.textSecondary }]}>卡号</Text>
                  <TextInput
                    accessibilityLabel="卡号"
                    value={cardNumber}
                    onChangeText={setCardNumber}
                    placeholder="6225 8801 2345 6789"
                    placeholderTextColor={theme.colors.textMuted}
                    maxLength={MAX_CARD_NUMBER_LENGTH}
                    style={[styles.fieldInput, styles.tabular, { color: theme.colors.text }]}
                  />
                </View>
                <View style={[styles.divider, { backgroundColor: theme.colors.border }]} />
                <View style={styles.fieldRow}>
                  <Text style={[styles.fieldLabel, { color: theme.colors.textSecondary }]}>银行</Text>
                  <TextInput
                    accessibilityLabel="银行"
                    value={bankName}
                    onChangeText={setBankName}
                    placeholder="招商银行"
                    placeholderTextColor={theme.colors.textMuted}
                    maxLength={MAX_BANK_TEXT_LENGTH}
                    style={[styles.fieldInput, { color: theme.colors.text }]}
                  />
                </View>
                <View style={[styles.divider, { backgroundColor: theme.colors.border }]} />
                <View style={styles.fieldRow}>
                  <Text style={[styles.fieldLabel, { color: theme.colors.textSecondary }]}>
                    开户行
                  </Text>
                  <TextInput
                    accessibilityLabel="开户行"
                    value={bankBranch}
                    onChangeText={setBankBranch}
                    placeholder="深圳分行科技园支行"
                    placeholderTextColor={theme.colors.textMuted}
                    maxLength={MAX_BANK_TEXT_LENGTH}
                    style={[styles.fieldInput, { color: theme.colors.text }]}
                  />
                </View>
                <View style={[styles.divider, { backgroundColor: theme.colors.border }]} />
                <View style={styles.fieldRow}>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="选择开户日期"
                    onPress={() => setDatePickerOpen(true)}
                    style={({ pressed }) => [
                      styles.dateTrigger,
                      pressed && { opacity: theme.opacity.pressed },
                    ]}
                  >
                    <Text style={[styles.fieldLabel, { color: theme.colors.textSecondary }]}>
                      开户日期
                    </Text>
                    <Text
                      style={{
                        flex: 1,
                        color: openedOn ? theme.colors.text : theme.colors.textMuted,
                        fontSize: theme.fontSize.base,
                      }}
                    >
                      {openedOn || '选择日期'}
                    </Text>
                  </Pressable>
                  {openedOn ? (
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel="清空开户日期"
                      hitSlop={8}
                      onPress={() => {
                        hapticLight();
                        setOpenedOn('');
                      }}
                      style={({ pressed }) => [
                        styles.clearDateBtn,
                        pressed && { opacity: theme.opacity.pressed },
                      ]}
                    >
                      <AppIcon name="close-circle" size={18} color={theme.colors.textMuted} />
                    </Pressable>
                  ) : (
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel="打开日期选择"
                      hitSlop={8}
                      onPress={() => setDatePickerOpen(true)}
                      style={styles.clearDateBtn}
                    >
                      <AppIcon name="calendar-outline" size={18} color={theme.colors.textMuted} />
                    </Pressable>
                  )}
                </View>
              </View>
            </View>
          ) : null}

          {/* 4 列等宽图标选择 */}
          <View style={{ marginTop: theme.spacing.lg }}>
            <Text style={sectionTitleStyle}>图标</Text>
            <View style={{ gap: theme.spacing.sm }}>
              {iconRows.map((row, rowIdx) => (
                <View key={rowIdx} style={styles.iconRow}>
                  {row.map((iconName) => {
                    const selected = icon === iconName;
                    return (
                      <Pressable
                        key={iconName}
                        accessibilityRole="button"
                        accessibilityState={{ selected }}
                        onPress={() => {
                          hapticLight();
                          setIcon(iconName);
                        }}
                        style={({ pressed }) => [
                          styles.iconOption,
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
                          pressed && { opacity: theme.opacity.pressed },
                        ]}
                      >
                        <AppIcon
                          name={iconName}
                          size={22}
                          color={
                            selected ? theme.colors.actionTextOnSubtle : theme.colors.textSecondary
                          }
                        />
                      </Pressable>
                    );
                  })}
                </View>
              ))}
            </View>
          </View>

          {/* 统计与可选开关（三项独立） */}
          <View style={{ marginTop: theme.spacing.lg }}>
            <Text style={sectionTitleStyle}>统计与可选</Text>
            <View style={groupCardStyle}>
              <View style={styles.switchRow}>
                <Text style={[styles.switchLabel, { color: theme.colors.text }]}>计入总资产</Text>
                <Switch
                  value={includeInTotalAssets}
                  onValueChange={setIncludeInTotalAssets}
                  trackColor={{ false: theme.colors.borderStrong, true: theme.colors.action }}
                />
              </View>
              <View style={[styles.divider, { backgroundColor: theme.colors.border }]} />
              <View style={styles.switchRow}>
                <Text style={[styles.switchLabel, { color: theme.colors.text }]}>计入净资产</Text>
                <Switch
                  value={includeInNetWorth}
                  onValueChange={setIncludeInNetWorth}
                  trackColor={{ false: theme.colors.borderStrong, true: theme.colors.action }}
                />
              </View>
              <View style={[styles.divider, { backgroundColor: theme.colors.border }]} />
              <View style={styles.switchRow}>
                <Text style={[styles.switchLabel, { color: theme.colors.text }]}>交易可选账户</Text>
                <Switch
                  value={isSelectable}
                  onValueChange={setIsSelectable}
                  trackColor={{ false: theme.colors.borderStrong, true: theme.colors.action }}
                />
              </View>
            </View>
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
                size={16}
                color={theme.colors.expenseTextOnSubtle}
              />
              <Text
                style={{
                  color: theme.colors.expenseTextOnSubtle,
                  fontSize: theme.fontSize.sm,
                  marginLeft: theme.spacing.xs,
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
            style={{ marginTop: theme.spacing.xl }}
          />

          {/* 账户管理（仅编辑态）：归档 / 恢复 / 删除 */}
          {isEditing && loadedAccount ? (
            <View style={{ marginTop: theme.spacing.xl }}>
              <Text style={sectionTitleStyle}>账户管理</Text>
              <View
                style={[
                  styles.manageCard,
                  theme.elevation.card,
                  {
                    backgroundColor: theme.colors.surfaceRaised,
                    borderRadius: theme.radius.lg,
                  },
                ]}
              >
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={loadedAccount.isArchived ? '恢复账户' : '归档账户'}
                  disabled={restoreLoading}
                  onPress={() => {
                    if (loadedAccount.isArchived) {
                      void handleRestore();
                    } else {
                      setArchiveError(null);
                      setArchiveConfirmOpen(true);
                    }
                  }}
                  style={({ pressed }) => [
                    styles.manageRow,
                    {
                      borderBottomColor: theme.colors.border,
                      borderBottomWidth: theme.borderWidth.hairline,
                    },
                    pressed && { opacity: theme.opacity.pressed },
                  ]}
                >
                  <AppIcon
                    name={loadedAccount.isArchived ? 'refresh-outline' : 'archive-outline'}
                    size={20}
                    color={loadedAccount.isArchived ? theme.colors.action : theme.colors.warning}
                  />
                  <Text
                    style={{
                      flex: 1,
                      color: loadedAccount.isArchived ? theme.colors.action : theme.colors.text,
                      fontSize: theme.fontSize.base,
                      fontWeight: theme.fontWeight.semibold,
                      marginLeft: theme.spacing.md,
                    }}
                  >
                    {loadedAccount.isArchived ? '恢复账户' : '归档账户'}
                  </Text>
                  <AppIcon name="chevron-forward" size={18} color={theme.colors.textMuted} />
                </Pressable>

                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="删除账户"
                  onPress={() => {
                    setManageError(null);
                    setDeleteFlowOpen(true);
                  }}
                  style={({ pressed }) => [
                    styles.manageRow,
                    pressed && { opacity: theme.opacity.pressed },
                  ]}
                >
                  <AppIcon name="trash-outline" size={20} color={theme.colors.expense} />
                  <Text
                    style={{
                      flex: 1,
                      color: theme.colors.expense,
                      fontSize: theme.fontSize.base,
                      fontWeight: theme.fontWeight.semibold,
                      marginLeft: theme.spacing.md,
                    }}
                  >
                    删除账户
                  </Text>
                  <AppIcon name="chevron-forward" size={18} color={theme.colors.textMuted} />
                </Pressable>
              </View>
              {manageError ? (
                <Text
                  style={{
                    color: theme.colors.expenseTextOnSubtle,
                    fontSize: theme.fontSize.xs,
                    marginTop: theme.spacing.sm,
                  }}
                >
                  {manageError}
                </Text>
              ) : null}
            </View>
          ) : null}
        </ScrollView>
      </KeyboardAvoidingView>

      <DatePickerSheet
        visible={datePickerOpen}
        selectedDate={openedOn || getTodayIsoDate()}
        onSelect={(iso) => {
          setOpenedOn(iso);
          setDatePickerOpen(false);
        }}
        onClose={() => setDatePickerOpen(false)}
      />

      <ConfirmDialog
        visible={archiveConfirmOpen}
        title="归档账户"
        message="归档后不参与总资产 / 净资产统计，不出现在可选账户中，历史明细完整保留，可随时恢复。"
        icon="archive-outline"
        tone="warning"
        confirmLabel="确认归档"
        loading={archiveLoading}
        error={archiveError}
        onCancel={() => {
          if (!archiveLoading) {
            setArchiveConfirmOpen(false);
            setArchiveError(null);
          }
        }}
        onConfirm={() => void handleArchiveConfirm()}
      />

      {deleteFlowOpen && loadedAccount ? (
        <AccountDeleteFlow
          account={loadedAccount}
          transactionCount={txCount}
          onClose={() => setDeleteFlowOpen(false)}
          onArchive={async () => {
            await archiveAccount(db, loadedAccount.id);
            notifyChange();
          }}
          onDelete={async () => {
            await deleteAccountWithTransactions(db, loadedAccount.id);
            notifyChange();
          }}
          onArchived={() => {
            setDeleteFlowOpen(false);
            router.back();
          }}
          onDeleted={handleDeletedExit}
        />
      ) : null}
    </SafeScreen>
  );
}

const styles = StyleSheet.create({
  wrapRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  tagChip: {
    minHeight: 42,
    flexDirection: 'row',
    alignItems: 'center',
  },
  groupCard: {
    overflow: 'hidden',
    paddingHorizontal: 14,
  },
  fieldRow: {
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  fieldLabel: {
    width: 68,
    fontSize: 14,
  },
  fieldInput: {
    flex: 1,
    minHeight: 48,
    paddingVertical: 10,
    fontSize: 16,
  },
  dateTrigger: {
    flex: 1,
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  clearDateBtn: {
    paddingLeft: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  divider: {
    height: StyleSheet.hairlineWidth,
  },
  iconRow: {
    flexDirection: 'row',
    gap: 8,
  },
  iconOption: {
    flex: 1,
    height: 46,
    alignItems: 'center',
    justifyContent: 'center',
  },
  switchRow: {
    minHeight: 50,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  switchLabel: {
    fontSize: 15,
    fontWeight: '500',
  },
  manageCard: {
    overflow: 'hidden',
  },
  manageRow: {
    minHeight: 54,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
  },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    borderLeftWidth: 3,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  tabular: {
    fontVariant: ['tabular-nums'],
  },
});
