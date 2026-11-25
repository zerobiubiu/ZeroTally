/**
 * 约束简报（Workflow B / C）：
 * - 信息层级：主（账户余额卡）、次（单行等宽 3 动作按钮：记一笔 / 校准 / 编辑 + 流水列表）、弱（停用/删除三级动作）
 * - 布局规整：3 个操作按钮采用 size="sm" + 2-3 字动词确保窄屏单行不换行；校准面板实时计算变动差额
 * - 文案密度：移除重复账面值提示与冗余空状态描述
 */
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import React, { useEffect, useMemo, useState } from 'react';
import {
  Alert,
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
          Alert.alert('恢复失败', err instanceof Error ? err.message : '无法恢复账户');
        }
      })();
      return;
    }

    Alert.alert('停用账户', '停用后不参与净资产汇总与新记账，历史账目保留，可随时恢复。', [
      { text: '取消', style: 'cancel' },
      {
        text: '停用',
        style: 'destructive',
        onPress: () => {
          void (async () => {
            try {
              await archiveAccount(db, account.id);
              notifyChange();
            } catch (err) {
              Alert.alert('无法停用', err instanceof Error ? err.message : '操作失败');
            }
          })();
        },
      },
    ]);
  };

  const handleDeleteAccount = () => {
    if (!account) {
      return;
    }
    Alert.alert('删除账户', `将永久删除「${account.name}」，无法撤销。`, [
      { text: '取消', style: 'cancel' },
      {
        text: '删除',
        style: 'destructive',
        onPress: () => {
          void (async () => {
            try {
              await deleteAccount(db, account.id);
              notifyChange();
              router.back();
            } catch (err) {
              Alert.alert('无法删除', err instanceof Error ? err.message : '删除失败');
            }
          })();
        },
      },
    ]);
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
      <ScrollView
        style={{ flex: 1 }}
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
              <Text
                style={{
                  color: theme.colors.expense,
                  fontSize: theme.fontSize.xs,
                  marginTop: theme.spacing.sm,
                }}
              >
                {adjustError}
              </Text>
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
                  onPress={(tx) => router.push({ pathname: '/record', params: { id: tx.id } })}
                  showDivider={idx < transactions.length - 1}
                />
              ))}
            </View>
          )}
        </View>

        <View style={[styles.footerActions, { marginTop: theme.spacing.xl }]}>
          <Pressable
            accessibilityRole="button"
            onPress={handleToggleArchive}
            style={styles.footerBtn}
          >
            <Text
              style={{
                color: theme.colors.textSecondary,
                fontSize: theme.fontSize.sm,
                fontWeight: theme.fontWeight.semibold,
              }}
            >
              {account.isArchived ? '恢复' : '停用'}
            </Text>
          </Pressable>

          <Pressable
            accessibilityRole="button"
            onPress={handleDeleteAccount}
            style={styles.footerBtn}
          >
            <Text
              style={{
                color: theme.colors.expense,
                fontSize: theme.fontSize.sm,
                fontWeight: theme.fontWeight.semibold,
              }}
            >
              删除
            </Text>
          </Pressable>
        </View>
      </ScrollView>
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
  footerActions: {
    flexDirection: 'row',
    justifyContent: 'space-around',
  },
  footerBtn: {
    minHeight: 48,
    paddingHorizontal: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabular: {
    fontVariant: ['tabular-nums'],
  },
});
