/**
 * 约束简报（Workflow B / C）：
 * - 信息层级：主（账户余额卡）、次（单行等宽 3 动作按钮：记一笔 / 校准 / 编辑 + 流水列表）、弱（停用/删除三级动作）
 * - 布局规整：3 个操作按钮采用 size="sm" + 2-3 字动词确保窄屏单行不换行；校准面板实时计算变动差额
 * - 文案密度：移除重复账面值提示与冗余空状态描述
 */
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import React, { useEffect, useMemo, useState } from 'react';
import {
  KeyboardAvoidingView,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useDatabase } from '../src/db/database-context';
import { describeAccountBalance, getAccountCategoryMeta } from '../src/features/accounts/rules';
import {
  adjustAccountBalance,
  archiveAccount,
  deleteAccount,
  getAccountById,
  restoreAccount,
} from '../src/features/accounts/service';
import type { Account } from '../src/features/accounts/types';
import { TransactionRow } from '../src/features/transactions/components/TransactionRow';
import { useTransactionListInteractions } from '../src/features/transactions/components/useTransactionListInteractions';
import { listAccountTransactions } from '../src/features/transactions/service';
import type { TransactionListItem } from '../src/features/transactions/types';
import {
  centsToInputString,
  formatCentsToYuan,
  parseSignedYuanToCents,
  parseYuanToCents,
} from '../src/shared/money/money';
import { AppIcon } from '../src/shared/ui/AppIcon';
import { Button } from '../src/shared/ui/Button';
import { ConfirmDialog } from '../src/shared/ui/ConfirmDialog';
import { EmptyState } from '../src/shared/ui/EmptyState';
import { SafeScreen } from '../src/shared/ui/SafeScreen';
import { useTheme } from '../src/theme/theme-context';

function firstParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export default function AccountDetailScreen(): React.JSX.Element {
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { db, revision, notifyChange } = useDatabase();

  const params = useLocalSearchParams<{ id?: string | string[] }>();
  const accountId = firstParam(params.id) ?? '';

  const [account, setAccount] = useState<Account | null>(null);
  const [transactions, setTransactions] = useState<TransactionListItem[]>([]);
  const [adjustOpen, setAdjustOpen] = useState(false);
  const [adjustInput, setAdjustInput] = useState('');
  const [adjustError, setAdjustError] = useState<string | null>(null);
  const [submittingAdjust, setSubmittingAdjust] = useState(false);
  const [accountDialog, setAccountDialog] = useState<'archive' | 'delete' | null>(null);
  const [accountActionLoading, setAccountActionLoading] = useState(false);
  const [accountActionError, setAccountActionError] = useState<string | null>(null);
  const [noticeDialog, setNoticeDialog] = useState<{ title: string; message: string } | null>(null);
  const interactions = useTransactionListInteractions();

  useEffect(() => {
    if (!accountId) {
      return;
    }
    let active = true;
    void (async () => {
      const [acc, txs] = await Promise.all([
        getAccountById(db, accountId),
        listAccountTransactions(db, accountId),
      ]);
      if (active) {
        setAccount(acc);
        setTransactions(txs);
      }
    })();
    return () => {
      active = false;
    };
  }, [db, accountId, revision]);

  const previewDeltaCents = useMemo(() => {
    if (!account || !adjustOpen) {
      return null;
    }
    let target: number | null;
    if (account.kind === 'liability') {
      const debt = parseYuanToCents(adjustInput);
      target = debt === null ? null : debt === 0 ? 0 : -debt;
    } else {
      target = parseSignedYuanToCents(adjustInput);
    }
    if (target === null) {
      return null;
    }
    return target - account.balanceCents;
  }, [account, adjustOpen, adjustInput]);

  const handleOpenAdjust = () => {
    if (!account) {
      return;
    }
    setAdjustError(null);
    if (account.kind === 'liability') {
      const debtCents = account.balanceCents < 0 ? Math.abs(account.balanceCents) : 0;
      setAdjustInput(centsToInputString(debtCents));
    } else {
      setAdjustInput(centsToInputString(account.balanceCents));
    }
    setAdjustOpen((prev) => !prev);
  };

  const handleConfirmAdjust = async () => {
    if (!account) {
      return;
    }
    setAdjustError(null);

    let targetBalanceCents: number | null;
    if (account.kind === 'liability') {
      const debt = parseYuanToCents(adjustInput);
      targetBalanceCents = debt === null ? null : debt === 0 ? 0 : -debt;
    } else {
      targetBalanceCents = parseSignedYuanToCents(adjustInput);
    }

    if (targetBalanceCents === null) {
      setAdjustError('请输入有效金额（最多两位小数）');
      return;
    }

    setSubmittingAdjust(true);
    try {
      await adjustAccountBalance(db, account.id, targetBalanceCents);
      notifyChange();
      setAdjustOpen(false);
    } catch (err) {
      setAdjustError(err instanceof Error ? err.message : '校准失败');
    } finally {
      setSubmittingAdjust(false);
    }
  };

  const handleToggleArchive = () => {
    if (!account) {
      return;
    }
    if (account.isArchived) {
      void (async () => {
        try {
          await restoreAccount(db, account.id);
          notifyChange();
        } catch (err) {
          setNoticeDialog({
            title: '恢复失败',
            message: err instanceof Error ? err.message : '无法恢复账户',
          });
        }
      })();
      return;
    }

    setAccountActionError(null);
    setAccountDialog('archive');
  };

  const handleDeleteAccount = () => {
    if (!account) {
      return;
    }
    setAccountActionError(null);
    setAccountDialog('delete');
  };

  const handleCancelAccountDialog = () => {
    if (accountActionLoading) {
      return;
    }
    setAccountDialog(null);
    setAccountActionError(null);
  };

  const handleConfirmAccountDialog = async () => {
    if (!account || !accountDialog || accountActionLoading) {
      return;
    }
    setAccountActionLoading(true);
    setAccountActionError(null);
    try {
      if (accountDialog === 'archive') {
        await archiveAccount(db, account.id);
        setAccountDialog(null);
        notifyChange();
      } else {
        await deleteAccount(db, account.id);
        setAccountDialog(null);
        notifyChange();
        router.back();
      }
    } catch (err) {
      setAccountActionError(
        err instanceof Error
          ? err.message
          : accountDialog === 'archive'
            ? '无法停用账户'
            : '删除账户失败'
      );
    } finally {
      setAccountActionLoading(false);
    }
  };

  if (!account) {
    return (
      <SafeScreen edges={['left', 'right']}>
        <View style={styles.center}>
          <Text style={{ color: theme.colors.textMuted, fontSize: theme.fontSize.base }}>
            账户不存在
          </Text>
        </View>
      </SafeScreen>
    );
  }

  const categoryMeta = getAccountCategoryMeta(account.category);
  const balanceInfo = describeAccountBalance(account);

  return (
    <SafeScreen edges={['left', 'right']}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior="padding"
        keyboardVerticalOffset={insets.top + 56}
      >
        <ScrollView
          style={{ flex: 1 }}
          keyboardShouldPersistTaps="handled"
          onScrollBeginDrag={interactions.closeAllSwipes}
          contentContainerStyle={{
            padding: theme.spacing.lg,
            paddingBottom: Math.max(insets.bottom, theme.spacing.lg) + theme.spacing.xl,
          }}
        >
        <Stack.Screen options={{ title: account.name }} />

        <View
          style={[
            styles.heroCard,
            theme.elevation.card,
            {
              backgroundColor: theme.colors.surfaceRaised,
              borderRadius: theme.radius.lg,
              padding: theme.spacing.lg,
            },
          ]}
        >
          <View style={styles.heroTop}>
            <View
              style={[
                styles.iconCircle,
                {
                  backgroundColor:
                    account.kind === 'liability'
                      ? theme.colors.warningSubtle
                      : theme.colors.actionSubtle,
                  borderRadius: theme.radius.md,
                },
              ]}
            >
              <AppIcon
                name={account.icon}
                size={22}
                color={
                  account.kind === 'liability'
                    ? theme.colors.warningTextOnSubtle
                    : theme.colors.actionTextOnSubtle
                }
              />
            </View>
            <View style={{ flex: 1 }}>
              <Text
                numberOfLines={1}
                style={{
                  color: theme.colors.text,
                  fontSize: theme.fontSize.lg,
                  fontWeight: theme.fontWeight.semibold,
                }}
              >
                {account.name}
              </Text>
              <Text
                numberOfLines={1}
                style={{ color: theme.colors.textMuted, fontSize: theme.fontSize.xs, marginTop: 2 }}
              >
                {categoryMeta.label} · {account.includeInNetWorth ? '计入净资产' : '不计入净资产'}
                {account.isArchived ? ' · 已停用' : ''}
              </Text>
            </View>
          </View>

          <View style={{ marginTop: theme.spacing.lg }}>
            <Text style={{ color: theme.colors.textMuted, fontSize: theme.fontSize.xs }}>
              {balanceInfo.caption}
            </Text>
            <Text
              numberOfLines={1}
              adjustsFontSizeToFit
              style={[
                styles.tabular,
                {
                  color: balanceInfo.isDebt ? theme.colors.expense : theme.colors.text,
                  fontSize: theme.fontSize.hero,
                  fontWeight: theme.fontWeight.semibold,
                  marginTop: theme.spacing.xs,
                },
              ]}
            >
              {balanceInfo.amountText}
            </Text>
          </View>

          {account.note ? (
            <Text
              style={{
                color: theme.colors.textSecondary,
                fontSize: theme.fontSize.sm,
                marginTop: theme.spacing.md,
              }}
            >
              {account.note}
            </Text>
          ) : null}

          <View style={[styles.actionsRow, { marginTop: theme.spacing.lg }]}>
            {!account.isArchived ? (
              <Button
                label="记一笔"
                size="sm"
                onPress={() =>
                  router.push({ pathname: '/record', params: { accountId: account.id } })
                }
                style={styles.actionBtn}
              />
            ) : null}
            <Button
              label="校准"
              size="sm"
              variant="secondary"
              onPress={handleOpenAdjust}
              style={styles.actionBtn}
            />
            <Button
              label="编辑"
              size="sm"
              variant="secondary"
              onPress={() =>
                router.push({ pathname: '/account-form', params: { id: account.id } })
              }
              style={styles.actionBtn}
            />
          </View>
        </View>

        {adjustOpen ? (
          <View
            style={[
              styles.adjustCard,
              {
                backgroundColor: theme.colors.surfaceRaised,
                borderColor: theme.colors.action,
                borderWidth: theme.borderWidth.hairline,
                borderRadius: theme.radius.lg,
                padding: theme.spacing.lg,
                marginTop: theme.spacing.lg,
              },
            ]}
          >
            <View style={styles.adjustHeader}>
              <Text
                style={{
                  color: theme.colors.text,
                  fontSize: theme.fontSize.base,
                  fontWeight: theme.fontWeight.semibold,
                }}
              >
                {account.kind === 'liability' ? '实际待还欠款（元）' : '实际余额（元）'}
              </Text>
              {previewDeltaCents !== null && previewDeltaCents !== 0 ? (
                <Text
                  style={[
                    styles.tabular,
                    {
                      color:
                        previewDeltaCents > 0 ? theme.colors.income : theme.colors.expense,
                      fontSize: theme.fontSize.xs,
                      fontWeight: theme.fontWeight.semibold,
                    },
                  ]}
                >
                  差额 {previewDeltaCents > 0 ? '+' : ''}
                  {formatCentsToYuan(previewDeltaCents)}
                </Text>
              ) : null}
            </View>

            <TextInput
              accessibilityLabel="目标金额"
              value={adjustInput}
              onChangeText={setAdjustInput}
              keyboardType="decimal-pad"
              placeholder="0.00"
              placeholderTextColor={theme.colors.textMuted}
              style={[
                styles.input,
                {
                  backgroundColor: theme.colors.surface,
                  borderColor: theme.colors.border,
                  color: theme.colors.text,
                  borderRadius: theme.radius.md,
                  fontSize: theme.fontSize.lg,
                  marginTop: theme.spacing.md,
                },
              ]}
            />

            {adjustError ? (
              <View
                style={[
                  styles.errorBox,
                  {
                    backgroundColor: theme.colors.expenseSubtle,
                    borderLeftColor: theme.colors.expense,
                    borderRadius: theme.radius.sm,
                    marginTop: theme.spacing.sm,
                    paddingHorizontal: theme.spacing.sm,
                    paddingVertical: theme.spacing.xs,
                  },
                ]}
              >
                <AppIcon
                  name="alert-circle-outline"
                  size={15}
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
                  {adjustError}
                </Text>
              </View>
            ) : null}

            <View style={[styles.actionsRow, { marginTop: theme.spacing.md }]}>
              <Button
                label="取消"
                size="sm"
                variant="secondary"
                onPress={() => setAdjustOpen(false)}
                style={styles.actionBtn}
              />
              <Button
                label="确认"
                size="sm"
                onPress={() => void handleConfirmAdjust()}
                loading={submittingAdjust}
                style={styles.actionBtn}
              />
            </View>
          </View>
        ) : null}

        <View style={{ marginTop: theme.spacing.xl }}>
          <Text
            style={{
              color: theme.colors.textSecondary,
              fontSize: theme.fontSize.xs,
              fontWeight: theme.fontWeight.semibold,
              marginBottom: theme.spacing.sm,
              paddingHorizontal: 4,
            }}
          >
            流水（{transactions.length}）
          </Text>

          {transactions.length === 0 ? (
            <EmptyState icon="swap-horizontal-outline" title="暂无流水" />
          ) : (
            <View
              style={[
                styles.listCard,
                theme.elevation.card,
                {
                  backgroundColor: theme.colors.surfaceRaised,
                  borderRadius: theme.radius.lg,
                },
              ]}
            >
              {transactions.map((item, idx) => (
                <TransactionRow
                  key={item.id}
                  item={item}
                  perspectiveAccountId={account.id}
                  onPress={interactions.handleInspect}
                  onEdit={interactions.handleEdit}
                  onRefund={interactions.handleRefund}
                  onDelete={interactions.handleDelete}
                  isSwipeOpen={interactions.openSwipeId === item.id}
                  onSwipeOpen={interactions.handleSwipeOpen}
                  onSwipeClose={interactions.handleSwipeClose}
                  showDivider={idx < transactions.length - 1}
                />
              ))}
            </View>
          )}
        </View>

        <View style={{ marginTop: theme.spacing.xl }}>
          <Text
            style={{
              color: theme.colors.textSecondary,
              fontSize: theme.fontSize.xs,
              fontWeight: theme.fontWeight.semibold,
              marginBottom: theme.spacing.sm,
              paddingHorizontal: 4,
            }}
          >
            账户管理
          </Text>
          <View
            style={[
              styles.listCard,
              theme.elevation.card,
              {
                backgroundColor: theme.colors.surfaceRaised,
                borderRadius: theme.radius.lg,
              },
            ]}
          >
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={account.isArchived ? '恢复账户' : '停用账户'}
              onPress={handleToggleArchive}
              style={({ pressed }) => [
                styles.manageRow,
                {
                  paddingHorizontal: theme.spacing.lg,
                  borderBottomColor: theme.colors.border,
                  borderBottomWidth: theme.borderWidth.hairline,
                },
                pressed && { opacity: theme.opacity.pressed },
              ]}
            >
              <View style={styles.manageLeft}>
                <AppIcon
                  name={account.isArchived ? 'refresh-outline' : 'pause-circle-outline'}
                  size={20}
                  color={account.isArchived ? theme.colors.action : theme.colors.warning}
                />
                <Text
                  style={{
                    color: account.isArchived ? theme.colors.action : theme.colors.text,
                    fontSize: theme.fontSize.base,
                    fontWeight: theme.fontWeight.semibold,
                    marginLeft: theme.spacing.md,
                  }}
                >
                  {account.isArchived ? '恢复账户' : '停用账户'}
                </Text>
              </View>
              <AppIcon name="chevron-forward" size={18} color={theme.colors.textMuted} />
            </Pressable>

            <Pressable
              accessibilityRole="button"
              accessibilityLabel="删除账户"
              onPress={handleDeleteAccount}
              style={({ pressed }) => [
                styles.manageRow,
                { paddingHorizontal: theme.spacing.lg },
                pressed && { opacity: theme.opacity.pressed },
              ]}
            >
              <View style={styles.manageLeft}>
                <AppIcon name="trash-outline" size={20} color={theme.colors.expense} />
                <Text
                  style={{
                    color: theme.colors.expense,
                    fontSize: theme.fontSize.base,
                    fontWeight: theme.fontWeight.semibold,
                    marginLeft: theme.spacing.md,
                  }}
                >
                  删除账户
                </Text>
              </View>
              <AppIcon name="chevron-forward" size={18} color={theme.colors.textMuted} />
            </Pressable>
          </View>
        </View>
        </ScrollView>
      </KeyboardAvoidingView>

      <ConfirmDialog
        visible={accountDialog !== null}
        title={accountDialog === 'archive' ? '停用账户' : '删除账户'}
        message={
          accountDialog === 'archive'
            ? '停用后不参与净资产汇总与新记账，历史账目保留，可随时恢复。'
            : '将永久删除该账户，无法撤销。若该账户有关联流水，请先清理流水或改为停用。'
        }
        icon={accountDialog === 'archive' ? 'pause-circle-outline' : 'trash-outline'}
        tone={accountDialog === 'archive' ? 'warning' : 'destructive'}
        confirmLabel={accountDialog === 'archive' ? '确认停用' : '确认删除'}
        loading={accountActionLoading}
        error={accountActionError}
        onCancel={handleCancelAccountDialog}
        onConfirm={() => void handleConfirmAccountDialog()}
      >
        <View
          style={[
            styles.dialogPreviewCard,
            {
              backgroundColor: theme.colors.surface,
              borderColor: theme.colors.border,
              borderWidth: theme.borderWidth.hairline,
              borderRadius: theme.radius.md,
              padding: theme.spacing.md,
            },
          ]}
        >
          <View
            style={[
              styles.dialogPreviewIcon,
              {
                backgroundColor:
                  account.kind === 'liability'
                    ? theme.colors.warningSubtle
                    : theme.colors.actionSubtle,
                borderRadius: theme.radius.md,
              },
            ]}
          >
            <AppIcon
              name={account.icon}
              size={18}
              color={
                account.kind === 'liability'
                  ? theme.colors.warningTextOnSubtle
                  : theme.colors.actionTextOnSubtle
              }
            />
          </View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text
              numberOfLines={1}
              style={{
                color: theme.colors.text,
                fontSize: theme.fontSize.sm,
                fontWeight: theme.fontWeight.semibold,
              }}
            >
              {account.name}
            </Text>
            <Text
              numberOfLines={1}
              style={{
                color: theme.colors.textMuted,
                fontSize: theme.fontSize.xs,
                marginTop: 2,
              }}
            >
              {categoryMeta.label} · {balanceInfo.caption}
            </Text>
          </View>
          <Text
            numberOfLines={1}
            style={[
              styles.tabular,
              {
                color: balanceInfo.isDebt ? theme.colors.expense : theme.colors.text,
                fontSize: theme.fontSize.base,
                fontWeight: theme.fontWeight.semibold,
              },
            ]}
          >
            {balanceInfo.amountText}
          </Text>
        </View>
      </ConfirmDialog>

      <ConfirmDialog
        visible={noticeDialog !== null}
        title={noticeDialog?.title ?? ''}
        message={noticeDialog?.message}
        icon="alert-circle-outline"
        tone="destructive"
        confirmLabel="知道了"
        hideCancel
        onCancel={() => setNoticeDialog(null)}
        onConfirm={() => setNoticeDialog(null)}
      />

      {interactions.overlays}
    </SafeScreen>
  );
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroCard: {},
  heroTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  iconCircle: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionsRow: {
    flexDirection: 'row',
    gap: 8,
  },
  actionBtn: {
    flex: 1,
  },
  adjustCard: {},
  adjustHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  input: {
    minHeight: 48,
    borderWidth: 1,
    paddingHorizontal: 14,
    fontVariant: ['tabular-nums'],
  },
  listCard: {
    overflow: 'hidden',
  },
  errorBox: {
    flexDirection: 'row',
    alignItems: 'center',
    borderLeftWidth: 3,
  },
  manageRow: {
    minHeight: 54,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  manageLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  dialogPreviewCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  dialogPreviewIcon: {
    width: 34,
    height: 34,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabular: {
    fontVariant: ['tabular-nums'],
  },
});
