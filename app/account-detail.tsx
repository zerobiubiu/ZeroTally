/**
 * 约束简报（Workflow B / C）：
 * - 页面结构：顶栏标题 + 账户信息卡片（余额 / 银行卡基础信息含名称逐行复制与一键复制全部）+ 下方直排按日分组流水，无独立「流水」分区
 * - 平账（原校准）：通过统一单段 BottomSheet（SettleBalanceSheet）直接修改账户余额，可选生成平账收支记录并选择分类；已归档账户隐藏平账入口
 * - 归档 / 恢复 / 删除全部收纳至「编辑」二级页面，本页不再提供账户管理区
 */
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import React, { useEffect, useMemo, useState } from 'react';
import {
  Clipboard,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useDatabase } from '../src/db/database-context';
import { SettleBalanceSheet } from '../src/features/accounts/components/SettleBalanceSheet';
import {
  describeAccountBalance,
  formatAccountCardCopyText,
  getAccountCategoryMeta,
  supportsCardInfo,
} from '../src/features/accounts/rules';
import { getAccountById } from '../src/features/accounts/service';
import type { Account } from '../src/features/accounts/types';
import { listCategories } from '../src/features/categories/service';
import type { Category } from '../src/features/categories/types';
import { TransactionRow } from '../src/features/transactions/components/TransactionRow';
import { useTransactionListInteractions } from '../src/features/transactions/components/useTransactionListInteractions';
import { groupTransactionsByDay } from '../src/features/transactions/rules';
import {
  listAccountTransactions,
  settleAccountBalance,
} from '../src/features/transactions/service';
import type { TransactionListItem } from '../src/features/transactions/types';
import { formatDaySectionTitle, getTodayIsoDate } from '../src/shared/date/date';
import { hapticLight } from '../src/shared/haptics/haptics';
import { formatCentsToYuan } from '../src/shared/money/money';
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
  const [categories, setCategories] = useState<Category[]>([]);
  const [settleOpen, setSettleOpen] = useState(false);
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const interactions = useTransactionListInteractions();

  useEffect(() => {
    if (!accountId) {
      return;
    }
    let active = true;
    void (async () => {
      const [acc, txs, cats] = await Promise.all([
        getAccountById(db, accountId),
        listAccountTransactions(db, accountId, 1000),
        listCategories(db),
      ]);
      if (active) {
        setAccount(acc);
        setTransactions(txs);
        setCategories(cats);
      }
    })();
    return () => {
      active = false;
    };
  }, [db, accountId, revision]);

  useEffect(() => {
    if (!copiedField) {
      return;
    }
    const timer = setTimeout(() => setCopiedField(null), 1500);
    return () => clearTimeout(timer);
  }, [copiedField]);

  const sections = useMemo(() => groupTransactionsByDay(transactions), [transactions]);
  const todayIso = getTodayIsoDate();
  const showYearInSections = useMemo(
    () => transactions.some((item) => item.occurredOn.slice(0, 4) !== todayIso.slice(0, 4)),
    [transactions, todayIso]
  );

  const handleCopy = (field: string, value: string) => {
    Clipboard.setString(value);
    hapticLight();
    setCopiedField(field);
  };

  if (!account) {
    return (
      <SafeScreen edges={['left', 'right']}>
        <Stack.Screen options={{ title: '账户详情' }} />
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
  const isBankCardType = supportsCardInfo(account.category);

  const metaParts = [categoryMeta.label];
  if (!account.includeInTotalAssets && !account.includeInNetWorth) {
    metaParts.push('不计入统计');
  } else if (!account.includeInNetWorth) {
    metaParts.push('不计入净资产');
  } else if (!account.includeInTotalAssets) {
    metaParts.push('不计入总资产');
  }
  if (!account.isSelectable && !account.isArchived) {
    metaParts.push('不可选');
  }
  if (account.isArchived) {
    metaParts.push('已归档');
  }

  const cardInfoRows: { key: string; label: string; value: string }[] = [];
  if (isBankCardType) {
    const hasAnyBankExtra = Boolean(
      account.cardNumber || account.bankName || account.bankBranch || account.openedOn
    );
    if (hasAnyBankExtra) {
      cardInfoRows.push({ key: 'name', label: '名称', value: account.name });
      if (account.cardNumber) {
        cardInfoRows.push({ key: 'cardNumber', label: '卡号', value: account.cardNumber });
      }
      if (account.bankName) {
        cardInfoRows.push({ key: 'bankName', label: '银行', value: account.bankName });
      }
      if (account.bankBranch) {
        cardInfoRows.push({ key: 'bankBranch', label: '开户行', value: account.bankBranch });
      }
      if (account.openedOn) {
        cardInfoRows.push({ key: 'openedOn', label: '开户日期', value: account.openedOn });
      }
    }
  }

  return (
    <SafeScreen edges={['left', 'right']}>
      <Stack.Screen options={{ title: account.name }} />

      <ScrollView
        style={{ flex: 1 }}
        keyboardShouldPersistTaps="handled"
        onScrollBeginDrag={interactions.closeAllSwipes}
        contentContainerStyle={{
          padding: theme.spacing.lg,
          paddingBottom: Math.max(insets.bottom, theme.spacing.lg) + theme.spacing.xl,
        }}
      >
        {/* 账户信息卡片 */}
        <View
          style={[
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
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="复制账户名称"
                onPress={() => handleCopy('heroName', account.name)}
                style={({ pressed }) => [
                  styles.nameRow,
                  pressed && { opacity: theme.opacity.pressed },
                ]}
              >
                <Text
                  numberOfLines={1}
                  style={{
                    color: theme.colors.text,
                    fontSize: theme.fontSize.lg,
                    fontWeight: theme.fontWeight.semibold,
                    flexShrink: 1,
                  }}
                >
                  {account.name}
                </Text>
                {copiedField === 'heroName' ? (
                  <Text
                    style={{
                      color: theme.colors.action,
                      fontSize: theme.fontSize.xs,
                      fontWeight: theme.fontWeight.semibold,
                      marginLeft: 6,
                    }}
                  >
                    已复制
                  </Text>
                ) : null}
              </Pressable>
              <Text
                numberOfLines={1}
                style={{ color: theme.colors.textMuted, fontSize: theme.fontSize.xs, marginTop: 2 }}
              >
                {metaParts.join(' · ')}
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

          {/* 银行卡基础信息：逐行点按复制 + 一键复制全部 */}
          {cardInfoRows.length > 0 ? (
            <View
              style={{
                marginTop: theme.spacing.md,
                borderTopColor: theme.colors.border,
                borderTopWidth: theme.borderWidth.hairline,
                paddingTop: theme.spacing.sm,
              }}
            >
              <View style={styles.cardInfoHeader}>
                <Text style={{ color: theme.colors.textMuted, fontSize: theme.fontSize.xs }}>
                  银行卡信息
                </Text>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="复制全部银行卡信息"
                  hitSlop={8}
                  onPress={() => handleCopy('allCardInfo', formatAccountCardCopyText(account))}
                  style={({ pressed }) => [
                    styles.copyAllBtn,
                    pressed && { opacity: theme.opacity.pressed },
                  ]}
                >
                  <Text
                    style={{
                      color: theme.colors.action,
                      fontSize: theme.fontSize.xs,
                      fontWeight: theme.fontWeight.semibold,
                    }}
                  >
                    {copiedField === 'allCardInfo' ? '已复制全部' : '复制全部'}
                  </Text>
                </Pressable>
              </View>
              {cardInfoRows.map((row) => (
                <Pressable
                  key={row.key}
                  accessibilityRole="button"
                  accessibilityLabel={`复制${row.label}`}
                  onPress={() => handleCopy(row.key, row.value)}
                  style={({ pressed }) => [
                    styles.infoRow,
                    pressed && { opacity: theme.opacity.pressed },
                  ]}
                >
                  <Text
                    style={{
                      width: 64,
                      color: theme.colors.textMuted,
                      fontSize: theme.fontSize.sm,
                    }}
                  >
                    {row.label}
                  </Text>
                  <Text
                    numberOfLines={1}
                    style={[
                      row.key === 'cardNumber' ? styles.tabular : null,
                      {
                        flex: 1,
                        color: theme.colors.text,
                        fontSize: theme.fontSize.sm,
                      },
                    ]}
                  >
                    {row.value}
                  </Text>
                  {copiedField === row.key ? (
                    <Text
                      style={{
                        color: theme.colors.action,
                        fontSize: theme.fontSize.xs,
                        fontWeight: theme.fontWeight.semibold,
                      }}
                    >
                      已复制
                    </Text>
                  ) : (
                    <AppIcon name="copy-outline" size={16} color={theme.colors.textMuted} />
                  )}
                </Pressable>
              ))}
            </View>
          ) : null}

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
            {!account.isArchived && account.isSelectable ? (
              <Button
                label="记一笔"
                size="sm"
                onPress={() =>
                  router.push({ pathname: '/record', params: { accountId: account.id } })
                }
                style={styles.actionBtn}
              />
            ) : null}
            {!account.isArchived ? (
              <Button
                label="平账"
                size="sm"
                variant="secondary"
                onPress={() => {
                  hapticLight();
                  setSettleOpen(true);
                }}
                style={styles.actionBtn}
              />
            ) : null}
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

        {/* 流水直排：按日分组，无独立分区标题 */}
        {transactions.length === 0 ? (
          <View style={{ marginTop: theme.spacing.xl }}>
            <EmptyState icon="swap-horizontal-outline" title="暂无流水" />
          </View>
        ) : (
          <View style={{ marginTop: theme.spacing.lg, gap: theme.spacing.lg }}>
            {sections.map((section) => (
              <View key={section.occurredOn}>
                <View style={[styles.sectionHeader, { marginBottom: theme.spacing.sm }]}>
                  <Text
                    numberOfLines={1}
                    style={{
                      flexShrink: 1,
                      color: theme.colors.textSecondary,
                      fontSize: theme.fontSize.xs,
                      fontWeight: theme.fontWeight.semibold,
                    }}
                  >
                    {formatDaySectionTitle(section.occurredOn, todayIso, {
                      showYear: showYearInSections,
                    })}
                  </Text>
                  <View style={styles.sectionTotals}>
                    {section.expenseCents > 0 ? (
                      <Text
                        style={[
                          styles.tabular,
                          { color: theme.colors.textMuted, fontSize: theme.fontSize.xs },
                        ]}
                      >
                        支 {formatCentsToYuan(section.expenseCents)}
                      </Text>
                    ) : null}
                    {section.incomeCents > 0 ? (
                      <Text
                        style={[
                          styles.tabular,
                          { color: theme.colors.textMuted, fontSize: theme.fontSize.xs },
                        ]}
                      >
                        收 {formatCentsToYuan(section.incomeCents)}
                      </Text>
                    ) : null}
                  </View>
                </View>

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
                  {section.items.map((item, idx) => (
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
                      showDivider={idx < section.items.length - 1}
                    />
                  ))}
                </View>
              </View>
            ))}
          </View>
        )}
      </ScrollView>

      <SettleBalanceSheet
        visible={settleOpen && !account.isArchived}
        account={account}
        categories={categories}
        onClose={() => setSettleOpen(false)}
        onSubmit={async ({ targetBalanceCents, generateRecord, categoryId }) => {
          await settleAccountBalance(db, account.id, targetBalanceCents, {
            generateRecord,
            categoryId,
          });
          notifyChange();
        }}
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
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  cardInfoHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 2,
  },
  copyAllBtn: {
    paddingVertical: 2,
    paddingHorizontal: 4,
  },
  infoRow: {
    minHeight: 36,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  actionsRow: {
    flexDirection: 'row',
    gap: 8,
  },
  actionBtn: {
    flex: 1,
  },
  listCard: {
    overflow: 'hidden',
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 4,
  },
  sectionTotals: {
    flexDirection: 'row',
    gap: 8,
  },
  tabular: {
    fontVariant: ['tabular-nums'],
  },
});
