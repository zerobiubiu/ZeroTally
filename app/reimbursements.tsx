/**
 * 设置可选「报销追踪」中心：
 * - 默认关闭，关闭时对日常记账零干扰；开启后可从近期支出中挑选待报销项，或在账单详情页随手标记
 * - 支持「抵扣原支出（关联退款，不虚增收入）」与「独立记为报销收入」双口径一键核销入账
 */
import { Stack } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
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
import { listAccounts } from '../src/features/accounts/service';
import type { Account } from '../src/features/accounts/types';
import {
  getReimbursementOverview,
  listRecentUnmarkedExpenses,
  markExpenseForReimbursement,
  saveReimbursementConfig,
  settleReimbursement,
  unmarkExpenseReimbursement,
  type ReimbursementItemView,
  type ReimbursementOverview,
} from '../src/features/reimbursement/service';
import type { ReimbursementSettlementMode } from '../src/features/reimbursement/types';
import { DatePickerSheet } from '../src/features/transactions/components/DatePickerSheet';
import { useTransactionListInteractions } from '../src/features/transactions/components/useTransactionListInteractions';
import type { TransactionListItem } from '../src/features/transactions/types';
import { getTodayIsoDate } from '../src/shared/date/date';
import { hapticLight, hapticSuccess } from '../src/shared/haptics/haptics';
import {
  formatCentsToYuan,
  parseYuanToCents,
  truncateExcessDecimalsInput,
} from '../src/shared/money/money';
import { AppIcon } from '../src/shared/ui/AppIcon';
import { BottomSheet, type BottomSheetHandle } from '../src/shared/ui/BottomSheet';
import { Button } from '../src/shared/ui/Button';
import { EmptyState } from '../src/shared/ui/EmptyState';
import { SafeScreen } from '../src/shared/ui/SafeScreen';
import { SlidingSegmentedControl } from '../src/shared/ui/SlidingSegmentedControl';
import { useTheme } from '../src/theme/theme-context';

type ReimbursementTab = 'pending' | 'reimbursed';

const TAB_OPTIONS: readonly { value: ReimbursementTab; label: string }[] = [
  { value: 'pending', label: '待报销' },
  { value: 'reimbursed', label: '已报销' },
];

const MODE_OPTIONS: readonly { value: ReimbursementSettlementMode; label: string }[] = [
  { value: 'refund', label: '抵扣原支出（退款）' },
  { value: 'income', label: '记为报销收入' },
];

export default function ReimbursementsScreen(): React.JSX.Element {
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  const { db, revision, notifyChange } = useDatabase();
  const interactions = useTransactionListInteractions();

  const [overview, setOverview] = useState<ReimbursementOverview | null>(null);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [tab, setTab] = useState<ReimbursementTab>('pending');
  const [notice, setNotice] = useState<string | null>(null);

  // 挑选近期支出弹窗
  const [pickerOpen, setPickerOpen] = useState(false);
  const [recentExpenses, setRecentExpenses] = useState<TransactionListItem[]>([]);
  const pickerSheetRef = useRef<BottomSheetHandle>(null);

  // 报销入账核销弹窗
  const [settleTarget, setSettleTarget] = useState<ReimbursementItemView | null>(null);
  const [settleAmountText, setSettleAmountText] = useState('');
  const [settleMode, setSettleMode] = useState<ReimbursementSettlementMode>('refund');
  const [settleAccountId, setSettleAccountId] = useState('');
  const [settleDate, setSettleDate] = useState(() => getTodayIsoDate());
  const [settleDatePickerOpen, setSettleDatePickerOpen] = useState(false);
  const [settleError, setSettleError] = useState<string | null>(null);
  const [settling, setSettling] = useState(false);
  const settleSheetRef = useRef<BottomSheetHandle>(null);

  const loadData = useCallback(async () => {
    const [nextOverview, nextAccounts] = await Promise.all([
      getReimbursementOverview(db),
      listAccounts(db, { includeArchived: false }),
    ]);
    setOverview(nextOverview);
    setAccounts(nextAccounts.filter((a) => a.isSelectable));
  }, [db]);

  useEffect(() => {
    let active = true;
    void Promise.all([
      getReimbursementOverview(db),
      listAccounts(db, { includeArchived: false }),
    ]).then(([nextOverview, nextAccounts]) => {
      if (!active) return;
      setOverview(nextOverview);
      setAccounts(nextAccounts.filter((a) => a.isSelectable));
    });
    return () => {
      active = false;
    };
  }, [db, revision]);

  const handleToggleEnabled = async (enabled: boolean) => {
    if (!overview) return;
    hapticLight();
    const updated = await saveReimbursementConfig(db, {
      ...overview.config,
      enabled,
    });
    setOverview({ ...overview, config: updated });
    notifyChange();
  };

  const handleChangeDefaultMode = async (mode: ReimbursementSettlementMode) => {
    if (!overview || overview.config.defaultSettlementMode === mode) return;
    hapticLight();
    const updated = await saveReimbursementConfig(db, {
      ...overview.config,
      defaultSettlementMode: mode,
    });
    setOverview({ ...overview, config: updated });
  };

  const handleOpenPicker = async () => {
    hapticLight();
    const items = await listRecentUnmarkedExpenses(db, 40);
    setRecentExpenses(items);
    setPickerOpen(true);
  };

  const handleMarkExpense = async (tx: TransactionListItem) => {
    try {
      await markExpenseForReimbursement(db, { transactionId: tx.id });
      hapticSuccess();
      setRecentExpenses((prev) => prev.filter((item) => item.id !== tx.id));
      await loadData();
      setNotice(`已加入待报销：${tx.note.trim() || tx.categoryName || '支出'}`);
    } catch (err) {
      setNotice(err instanceof Error ? err.message : '标记待报销失败');
    }
  };

  const handleUnmark = async (transactionId: string) => {
    hapticLight();
    await unmarkExpenseReimbursement(db, transactionId);
    await loadData();
    notifyChange();
  };

  const openSettleSheet = (view: ReimbursementItemView) => {
    hapticLight();
    const preferredAccount =
      accounts.find((a) => a.id === view.transaction.accountId)?.id ?? accounts[0]?.id ?? '';
    setSettleTarget(view);
    setSettleAmountText((view.record.expectedCents / 100).toFixed(2));
    setSettleMode(overview?.config.defaultSettlementMode ?? 'refund');
    setSettleAccountId(preferredAccount);
    setSettleDate(getTodayIsoDate());
    setSettleError(null);
  };

  const handleConfirmSettle = async () => {
    if (!settleTarget || settling) return;
    const parsedCents = parseYuanToCents(settleAmountText);
    if (parsedCents === null || parsedCents <= 0) {
      setSettleError('请输入大于 0 的有效报销金额');
      return;
    }
    if (!settleAccountId) {
      setSettleError('请选择报销收款账户');
      return;
    }

    setSettling(true);
    setSettleError(null);
    try {
      await settleReimbursement(db, {
        transactionId: settleTarget.record.transactionId,
        amountCents: parsedCents,
        accountId: settleAccountId,
        mode: settleMode,
        occurredOn: settleDate,
      });
      hapticSuccess();
      settleSheetRef.current?.dismiss(() => {
        setSettleTarget(null);
      });
      notifyChange();
      await loadData();
      setNotice(
        settleMode === 'refund'
          ? `已完成报销核销（抵扣原支出 ${formatCentsToYuan(parsedCents)}）`
          : `已完成报销核销（记为收入 ${formatCentsToYuan(parsedCents)}）`
      );
    } catch (err) {
      setSettleError(err instanceof Error ? err.message : '核销入账失败');
    } finally {
      setSettling(false);
    }
  };

  const enabled = overview?.config.enabled ?? false;
  const activeList = useMemo(() => {
    if (!overview) return [];
    return tab === 'pending' ? overview.pending : overview.reimbursed;
  }, [overview, tab]);

  return (
    <SafeScreen edges={['left', 'right']} style={{ backgroundColor: theme.colors.surfaceGrouped }}>
      <Stack.Screen options={{ title: '报销追踪' }} />

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{
          padding: theme.spacing.lg,
          paddingBottom: Math.max(insets.bottom, theme.spacing.lg) + theme.spacing.xl,
          gap: 14,
        }}
      >
        {/* 开关与默认入账口径 */}
        <View
          style={[
            styles.card,
            { backgroundColor: theme.colors.surfaceRaised, borderRadius: 14 },
          ]}
        >
          <View style={styles.switchRow}>
            <View style={{ flex: 1 }}>
              <Text
                style={{
                  color: theme.colors.text,
                  fontSize: theme.fontSize.base,
                  fontWeight: theme.fontWeight.semibold,
                }}
              >
                启用报销追踪
              </Text>
              <Text style={{ color: theme.colors.textMuted, fontSize: 12, marginTop: 2 }}>
                关闭时对正常记账完全不可见；开启后可跟踪垫付支出与一键到账核销
              </Text>
            </View>
            <Switch
              value={enabled}
              onValueChange={(val) => void handleToggleEnabled(val)}
              trackColor={{ false: theme.colors.chipInactive, true: theme.colors.action }}
              thumbColor={theme.colors.surfaceRaised}
            />
          </View>

          {enabled ? (
            <View
              style={[
                styles.modeSection,
                { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: theme.colors.divider },
              ]}
            >
              <Text
                style={{
                  color: theme.colors.textMuted,
                  fontSize: theme.fontSize.xs,
                  fontWeight: theme.fontWeight.semibold,
                  marginBottom: 8,
                }}
              >
                默认到账口径
              </Text>
              <SlidingSegmentedControl
                options={MODE_OPTIONS}
                value={overview?.config.defaultSettlementMode ?? 'refund'}
                onChange={(mode) => void handleChangeDefaultMode(mode)}
                fullWidth
                height={38}
                shape="rounded"
                trackTone="surface"
                textSize="xs"
              />
            </View>
          ) : null}
        </View>

        {notice ? (
          <View
            style={[
              styles.noticeBar,
              { backgroundColor: theme.colors.actionSurface, borderRadius: 10 },
            ]}
          >
            <AppIcon name="checkmark-circle-outline" size={16} color={theme.colors.action} />
            <Text style={{ flex: 1, color: theme.colors.action, fontSize: 12 }}>{notice}</Text>
            <Pressable onPress={() => setNotice(null)} hitSlop={8}>
              <AppIcon name="close" size={14} color={theme.colors.action} />
            </Pressable>
          </View>
        ) : null}

        {enabled ? (
          <>
            {/* 报销汇总概览卡 */}
            <View
              style={[
                styles.summaryCard,
                { backgroundColor: theme.colors.surfaceRaised, borderRadius: 14 },
              ]}
            >
              <View style={styles.summaryGrid}>
                <View style={styles.summaryCol}>
                  <Text style={{ color: theme.colors.textMuted, fontSize: theme.fontSize.xs }}>
                    待报销（{overview?.summary.pendingCount ?? 0} 笔）
                  </Text>
                  <Text
                    style={[
                      styles.tabular,
                      {
                        color: theme.colors.expense,
                        fontSize: theme.fontSize.xl,
                        fontWeight: theme.fontWeight.semibold,
                        marginTop: 4,
                      },
                    ]}
                  >
                    {formatCentsToYuan(overview?.summary.pendingTotalCents ?? 0)}
                  </Text>
                </View>

                <View
                  style={[styles.summaryDivider, { backgroundColor: theme.colors.divider }]}
                />

                <View style={styles.summaryCol}>
                  <Text style={{ color: theme.colors.textMuted, fontSize: theme.fontSize.xs }}>
                    已报销（{overview?.summary.reimbursedCount ?? 0} 笔）
                  </Text>
                  <Text
                    style={[
                      styles.tabular,
                      {
                        color: theme.colors.income,
                        fontSize: theme.fontSize.xl,
                        fontWeight: theme.fontWeight.semibold,
                        marginTop: 4,
                      },
                    ]}
                  >
                    {formatCentsToYuan(overview?.summary.reimbursedTotalCents ?? 0)}
                  </Text>
                </View>
              </View>

              <Pressable
                accessibilityRole="button"
                onPress={() => void handleOpenPicker()}
                style={({ pressed }) => [
                  styles.addBtn,
                  { backgroundColor: theme.colors.actionSurface, borderRadius: 10 },
                  pressed && { opacity: theme.opacity.pressed },
                ]}
              >
                <AppIcon name="add-circle-outline" size={18} color={theme.colors.action} />
                <Text
                  style={{
                    color: theme.colors.action,
                    fontSize: theme.fontSize.sm,
                    fontWeight: theme.fontWeight.semibold,
                  }}
                >
                  从近期支出挑选待报销
                </Text>
              </Pressable>
            </View>

            {/* 待报销 / 已报销切换 */}
            <SlidingSegmentedControl
              options={TAB_OPTIONS}
              value={tab}
              onChange={setTab}
              fullWidth
              height={40}
              shape="rounded"
              trackTone="surfaceRaised"
              textSize="sm"
            />

            {activeList.length === 0 ? (
              <EmptyState
                icon="receipt-outline"
                title={tab === 'pending' ? '暂无待报销账目' : '暂无已报销记录'}
                description={
                  tab === 'pending'
                    ? '可点击上方按钮挑选近期支出，或在任意支出详情浮窗中随手标记'
                    : '完成核销入账的报销单会归档展示在这里'
                }
              />
            ) : (
              <View
                style={[
                  styles.listCard,
                  { backgroundColor: theme.colors.surfaceRaised, borderRadius: 14 },
                ]}
              >
                {activeList.map((view, idx) => {
                  const tx = view.transaction;
                  const title = tx.note.trim() || tx.categoryName || '支出';
                  const isPending = view.record.status === 'pending';

                  return (
                    <View
                      key={view.record.transactionId}
                      style={[
                        styles.itemRow,
                        idx < activeList.length - 1 && {
                          borderBottomWidth: StyleSheet.hairlineWidth,
                          borderBottomColor: theme.colors.divider,
                        },
                      ]}
                    >
                      <Pressable
                        onPress={() => interactions.handleInspect(tx)}
                        style={styles.itemMain}
                      >
                        <View
                          style={[
                            styles.catIcon,
                            { backgroundColor: theme.colors.expenseSubtle, borderRadius: 10 },
                          ]}
                        >
                          <AppIcon
                            name={tx.categoryIcon ?? 'receipt-outline'}
                            size={17}
                            color={theme.colors.expenseTextOnSubtle}
                          />
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text
                            numberOfLines={1}
                            style={{
                              color: theme.colors.text,
                              fontSize: theme.fontSize.sm,
                              fontWeight: theme.fontWeight.semibold,
                            }}
                          >
                            {title}
                          </Text>
                          <Text
                            numberOfLines={1}
                            style={[
                              styles.tabular,
                              { color: theme.colors.textMuted, fontSize: 11, marginTop: 2 },
                            ]}
                          >
                            {isPending
                              ? `${tx.occurredOn} · ${tx.accountName}`
                              : `核销于 ${view.record.settledOn ?? tx.occurredOn} · ${
                                  view.record.settlementMode === 'income' ? '记为收入' : '抵扣原支出'
                                }`}
                          </Text>
                        </View>
                        <View style={{ alignItems: 'flex-end' }}>
                          <Text
                            style={[
                              styles.tabular,
                              {
                                color: isPending ? theme.colors.expense : theme.colors.income,
                                fontSize: theme.fontSize.sm,
                                fontWeight: theme.fontWeight.semibold,
                              },
                            ]}
                          >
                            {formatCentsToYuan(
                              isPending ? view.record.expectedCents : view.record.settledCents
                            )}
                          </Text>
                        </View>
                      </Pressable>

                      {isPending ? (
                        <View style={styles.itemActions}>
                          <Pressable
                            accessibilityRole="button"
                            onPress={() => void handleUnmark(view.record.transactionId)}
                            style={({ pressed }) => [
                              styles.ghostChip,
                              { backgroundColor: theme.colors.surfaceGrouped, borderRadius: 8 },
                              pressed && { opacity: theme.opacity.pressed },
                            ]}
                          >
                            <Text style={{ color: theme.colors.textMuted, fontSize: 12 }}>
                              取消标记
                            </Text>
                          </Pressable>

                          <Pressable
                            accessibilityRole="button"
                            onPress={() => openSettleSheet(view)}
                            style={({ pressed }) => [
                              styles.primaryChip,
                              { backgroundColor: theme.colors.action, borderRadius: 8 },
                              pressed && { opacity: theme.opacity.pressed },
                            ]}
                          >
                            <Text
                              style={{
                                color: theme.colors.onAction,
                                fontSize: 12,
                                fontWeight: theme.fontWeight.semibold,
                              }}
                            >
                              报销入账
                            </Text>
                          </Pressable>
                        </View>
                      ) : null}
                    </View>
                  );
                })}
              </View>
            )}
          </>
        ) : null}
      </ScrollView>

      {/* 挑选近期支出 BottomSheet */}
      <BottomSheet
        ref={pickerSheetRef}
        visible={pickerOpen}
        onClose={() => setPickerOpen(false)}
        title="挑选待报销支出"
      >
        {recentExpenses.length === 0 ? (
          <View style={{ paddingVertical: 28, alignItems: 'center' }}>
            <Text style={{ color: theme.colors.textMuted, fontSize: theme.fontSize.sm }}>
              近期暂无未标记的支出流水
            </Text>
          </View>
        ) : (
          <View style={{ gap: 2 }}>
            {recentExpenses.map((tx, idx) => (
              <Pressable
                key={tx.id}
                onPress={() => void handleMarkExpense(tx)}
                style={({ pressed }) => [
                  styles.pickerRow,
                  idx < recentExpenses.length - 1 && {
                    borderBottomWidth: StyleSheet.hairlineWidth,
                    borderBottomColor: theme.colors.divider,
                  },
                  pressed && { opacity: theme.opacity.pressed },
                ]}
              >
                <View style={{ flex: 1 }}>
                  <Text
                    numberOfLines={1}
                    style={{
                      color: theme.colors.text,
                      fontSize: theme.fontSize.sm,
                      fontWeight: theme.fontWeight.semibold,
                    }}
                  >
                    {tx.note.trim() || tx.categoryName || '支出'}
                  </Text>
                  <Text
                    style={[
                      styles.tabular,
                      { color: theme.colors.textMuted, fontSize: 11, marginTop: 2 },
                    ]}
                  >
                    {tx.occurredOn} · {tx.accountName}
                  </Text>
                </View>
                <Text
                  style={[
                    styles.tabular,
                    {
                      color: theme.colors.expense,
                      fontSize: theme.fontSize.sm,
                      fontWeight: theme.fontWeight.semibold,
                      marginRight: 10,
                    },
                  ]}
                >
                  {formatCentsToYuan(tx.amountCents)}
                </Text>
                <View
                  style={[
                    styles.pickTag,
                    { backgroundColor: theme.colors.actionSurface, borderRadius: 8 },
                  ]}
                >
                  <Text
                    style={{
                      color: theme.colors.action,
                      fontSize: 12,
                      fontWeight: theme.fontWeight.semibold,
                    }}
                  >
                    加入
                  </Text>
                </View>
              </Pressable>
            ))}
          </View>
        )}
      </BottomSheet>

      {/* 确认报销核销入账 BottomSheet */}
      <BottomSheet
        ref={settleSheetRef}
        visible={settleTarget !== null}
        onClose={() => setSettleTarget(null)}
        title="确认报销入账"
      >
        {settleTarget ? (
          <View style={{ gap: 14, paddingBottom: 8 }}>
            <View>
              <Text style={{ color: theme.colors.textMuted, fontSize: 12, marginBottom: 6 }}>
                实报到账金额（元）
              </Text>
              <TextInput
                value={settleAmountText}
                onChangeText={(txt) => setSettleAmountText(truncateExcessDecimalsInput(txt))}
                keyboardType="decimal-pad"
                placeholder="0.00"
                placeholderTextColor={theme.colors.placeholder}
                style={[
                  styles.amountInput,
                  styles.tabular,
                  {
                    backgroundColor: theme.colors.surfaceGrouped,
                    color: theme.colors.text,
                    borderRadius: 10,
                  },
                ]}
              />
            </View>

            <View>
              <Text style={{ color: theme.colors.textMuted, fontSize: 12, marginBottom: 6 }}>
                入账口径
              </Text>
              <SlidingSegmentedControl
                options={MODE_OPTIONS}
                value={settleMode}
                onChange={setSettleMode}
                fullWidth
                height={38}
                shape="rounded"
                trackTone="surface"
                textSize="xs"
              />
            </View>

            <View>
              <Text style={{ color: theme.colors.textMuted, fontSize: 12, marginBottom: 6 }}>
                收款账户
              </Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  {accounts.map((acc) => {
                    const active = acc.id === settleAccountId;
                    return (
                      <Pressable
                        key={acc.id}
                        onPress={() => setSettleAccountId(acc.id)}
                        style={[
                          styles.accountChip,
                          {
                            backgroundColor: active
                              ? theme.colors.actionSurface
                              : theme.colors.surfaceGrouped,
                            borderRadius: 9,
                          },
                        ]}
                      >
                        <Text
                          style={{
                            color: active ? theme.colors.action : theme.colors.textSecondary,
                            fontSize: 13,
                            fontWeight: active
                              ? theme.fontWeight.semibold
                              : theme.fontWeight.regular,
                          }}
                        >
                          {acc.name}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              </ScrollView>
            </View>

            <Pressable
              onPress={() => setSettleDatePickerOpen(true)}
              style={[
                styles.dateRow,
                { backgroundColor: theme.colors.surfaceGrouped, borderRadius: 10 },
              ]}
            >
              <Text style={{ color: theme.colors.textMuted, fontSize: 13 }}>到账日期</Text>
              <Text
                style={[
                  styles.tabular,
                  {
                    color: theme.colors.text,
                    fontSize: 13,
                    fontWeight: theme.fontWeight.semibold,
                  },
                ]}
              >
                {settleDate}
              </Text>
            </Pressable>

            {settleError ? (
              <Text style={{ color: theme.colors.expense, fontSize: 12 }}>{settleError}</Text>
            ) : null}

            <Button
              label={settling ? '处理中...' : '确认核销入账'}
              disabled={settling}
              onPress={() => void handleConfirmSettle()}
            />
          </View>
        ) : null}
      </BottomSheet>

      <DatePickerSheet
        visible={settleDatePickerOpen}
        selectedDate={settleDate}
        onSelect={(next) => {
          setSettleDate(next);
          setSettleDatePickerOpen(false);
        }}
        onClose={() => setSettleDatePickerOpen(false)}
      />

      {interactions.overlays}
    </SafeScreen>
  );
}

const styles = StyleSheet.create({
  card: {
    padding: 16,
  },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  modeSection: {
    marginTop: 14,
    paddingTop: 14,
  },
  noticeBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  summaryCard: {
    padding: 16,
    gap: 14,
  },
  summaryGrid: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  summaryCol: {
    flex: 1,
    alignItems: 'center',
  },
  summaryDivider: {
    width: StyleSheet.hairlineWidth,
    height: 36,
  },
  addBtn: {
    minHeight: 42,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  listCard: {
    paddingHorizontal: 14,
  },
  itemRow: {
    paddingVertical: 12,
    gap: 10,
  },
  itemMain: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  catIcon: {
    width: 34,
    height: 34,
    alignItems: 'center',
    justifyContent: 'center',
  },
  itemActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 8,
  },
  ghostChip: {
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  primaryChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  pickerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
  },
  pickTag: {
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  amountInput: {
    height: 46,
    paddingHorizontal: 12,
    fontSize: 20,
    fontWeight: '600',
  },
  accountChip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  dateRow: {
    height: 44,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  tabular: {
    fontVariant: ['tabular-nums'],
  },
});
