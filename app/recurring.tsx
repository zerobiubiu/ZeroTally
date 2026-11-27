/**
 * 约束简报（Workflow B / C）：
 * - 设置侧栏一级入口直达的「周期账单」管理中心，作为非侵入式补充模块运行，不干扰日常极速记账流
 * - 支持四大模式：固定周期支出（房租/宽带/订阅）、弹性月薪（提前/延时与扣款补贴核算）、房贷（等额本息/等额本金 + 提前还款精确试算与入账）、信用卡账单日/还款日倒计时与一键直达还款
 */
import { Stack, useRouter } from 'expo-router';
import React, { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useDatabase } from '../src/db/database-context';
import { listAccounts } from '../src/features/accounts/service';
import type { Account } from '../src/features/accounts/types';
import { listCategories } from '../src/features/categories/service';
import type { Category } from '../src/features/categories/types';
import { MortgagePrepaySheet } from '../src/features/recurring/components/MortgagePrepaySheet';
import { RecurringEditorSheet } from '../src/features/recurring/components/RecurringEditorSheet';
import { SalaryPostSheet } from '../src/features/recurring/components/SalaryPostSheet';
import { computeNextMortgageInstallment } from '../src/features/recurring/mortgage-rules';
import {
  computeCreditCardCycleStatus,
  getPeriodKeyForDate,
} from '../src/features/recurring/rules';
import {
  deleteRecurringPlan,
  executeMortgagePrepayment,
  listRecurringPlans,
  postFixedExpensePlan,
  postMortgageInstallment,
  postSalaryPlan,
  upsertRecurringPlan,
} from '../src/features/recurring/service';
import type { RecurringPlan, RecurringPlanKind } from '../src/features/recurring/types';
import { getTodayIsoDate } from '../src/shared/date/date';
import { hapticLight, hapticSuccess, hapticWarning } from '../src/shared/haptics/haptics';
import { formatCentsToYuan } from '../src/shared/money/money';
import { AppIcon } from '../src/shared/ui/AppIcon';
import { ConfirmDialog } from '../src/shared/ui/ConfirmDialog';
import { EmptyState } from '../src/shared/ui/EmptyState';
import { SafeScreen } from '../src/shared/ui/SafeScreen';
import { useTheme } from '../src/theme/theme-context';

const KIND_BADGE: Record<RecurringPlanKind, string> = {
  fixed_expense: '固定支出',
  salary: '弹性月薪',
  mortgage: '房贷',
  credit_card: '信用卡日历',
};

const FREQ_LABEL = {
  monthly: '每月',
  quarterly: '每季',
  yearly: '每年',
  weekly: '每周',
} as const;

export default function RecurringPlansScreen(): React.JSX.Element {
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { db, revision, notifyChange } = useDatabase();

  const [plans, setPlans] = useState<RecurringPlan[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);

  const [editorOpen, setEditorOpen] = useState(false);
  const [editingPlan, setEditingPlan] = useState<RecurringPlan | null>(null);
  const [salaryTarget, setSalaryTarget] = useState<RecurringPlan | null>(null);
  const [prepayTarget, setPrepayTarget] = useState<RecurringPlan | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<RecurringPlan | null>(null);
  const [toastMsg, setToastMsg] = useState<string | null>(null);

  const todayIso = getTodayIsoDate();

  useEffect(() => {
    let active = true;
    void (async () => {
      const [planList, accList, catList] = await Promise.all([
        listRecurringPlans(db),
        listAccounts(db, { includeArchived: true }),
        listCategories(db),
      ]);
      if (active) {
        setPlans(planList);
        setAccounts(accList);
        setCategories(catList);
      }
    })();
    return () => {
      active = false;
    };
  }, [db, revision]);

  const accountMap = useMemo(() => {
    const map = new Map<string, Account>();
    for (const acc of accounts) {
      map.set(acc.id, acc);
    }
    return map;
  }, [accounts]);

  const showToast = (msg: string) => {
    setToastMsg(msg);
  };

  const handleQuickPostFixed = async (plan: RecurringPlan) => {
    try {
      await postFixedExpensePlan(db, plan.id, todayIso);
      notifyChange();
      hapticSuccess();
      showToast(`已记账：${plan.name} ${formatCentsToYuan(plan.amountCents)}`);
    } catch (err) {
      hapticWarning();
      showToast(err instanceof Error ? err.message : '入账失败');
    }
  };

  const handleQuickPostMortgage = async (plan: RecurringPlan) => {
    try {
      const res = await postMortgageInstallment(db, plan.id, todayIso);
      notifyChange();
      hapticSuccess();
      showToast(
        `已记本期月供 ${formatCentsToYuan(res.transaction.amountCents)}，剩 ${res.plan.mortgage?.remainingMonths ?? 0} 期`
      );
    } catch (err) {
      hapticWarning();
      showToast(err instanceof Error ? err.message : '月供入账失败');
    }
  };

  const handleConfirmDelete = async () => {
    if (!deleteTarget) {
      return;
    }
    await deleteRecurringPlan(db, deleteTarget.id);
    setDeleteTarget(null);
    notifyChange();
    hapticLight();
  };

  return (
    <SafeScreen
      edges={['left', 'right']}
      style={{ backgroundColor: theme.colors.surfaceGrouped }}
    >
      <Stack.Screen
        options={{
          title: '周期账单',
          headerRight: () => (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="新增周期计划"
              hitSlop={10}
              onPress={() => {
                hapticLight();
                setEditingPlan(null);
                setEditorOpen(true);
              }}
              style={({ pressed }) => [
                styles.headerBtn,
                pressed && { opacity: theme.opacity.pressed },
              ]}
            >
              <AppIcon name="add" size={24} color={theme.colors.action} />
            </Pressable>
          ),
        }}
      />

      <ScrollView
        style={styles.flex}
        contentContainerStyle={{
          padding: 16,
          paddingBottom: Math.max(insets.bottom, 16) + 24,
          gap: 12,
        }}
      >
        {toastMsg ? (
          <View
            style={[
              styles.toastBar,
              { backgroundColor: theme.colors.actionSurface, borderRadius: 10 },
            ]}
          >
            <Text
              style={{
                flex: 1,
                color: theme.colors.actionTextOnSubtle,
                fontSize: 12,
                fontWeight: theme.fontWeight.semibold,
              }}
            >
              {toastMsg}
            </Text>
            <Pressable hitSlop={8} onPress={() => setToastMsg(null)}>
              <AppIcon name="close" size={14} color={theme.colors.action} />
            </Pressable>
          </View>
        ) : null}

        {plans.length === 0 ? (
          <View style={{ marginTop: 32 }}>
            <EmptyState
              icon="repeat-outline"
              title="暂无周期账单计划"
              description="支持房租/宽带/订阅自动记账、弹性月薪（含提前延时与扣款）、等额本息/等额本金房贷提前还款与信用卡还款日追踪"
              actionLabel="新增周期计划"
              onAction={() => {
                setEditingPlan(null);
                setEditorOpen(true);
              }}
            />
          </View>
        ) : (
          plans.map((plan) => {
            const acc = accountMap.get(plan.accountId);
            const currentPeriod = getPeriodKeyForDate(todayIso, plan.frequency);
            const postedThisPeriod = plan.lastPostedPeriod === currentPeriod;

            const mortgageNext =
              plan.kind === 'mortgage' && plan.mortgage
                ? computeNextMortgageInstallment({
                    method: plan.mortgage.method,
                    remainingPrincipalCents: plan.mortgage.remainingPrincipalCents,
                    annualRateBps: plan.mortgage.annualRateBps,
                    remainingMonths: plan.mortgage.remainingMonths,
                  })
                : null;

            const cardStatus =
              plan.kind === 'credit_card' && plan.creditCard
                ? computeCreditCardCycleStatus(plan.creditCard, todayIso)
                : null;
            const creditDebtCents = acc && acc.balanceCents < 0 ? Math.abs(acc.balanceCents) : 0;

            return (
              <View
                key={plan.id}
                style={[
                  styles.planCard,
                  { backgroundColor: theme.colors.surfaceRaised, borderRadius: 14 },
                ]}
              >
                <View style={styles.planTop}>
                  <View style={styles.flex}>
                    <View style={styles.titleRow}>
                      <View
                        style={[
                          styles.kindBadge,
                          { backgroundColor: theme.colors.actionSurface, borderRadius: 6 },
                        ]}
                      >
                        <Text
                          style={{
                            color: theme.colors.actionTextOnSubtle,
                            fontSize: 11,
                            fontWeight: theme.fontWeight.semibold,
                          }}
                        >
                          {KIND_BADGE[plan.kind]}
                        </Text>
                      </View>
                      <Text
                        numberOfLines={1}
                        style={{
                          flex: 1,
                          color: theme.colors.text,
                          fontSize: 16,
                          fontWeight: theme.fontWeight.semibold,
                        }}
                      >
                        {plan.name}
                      </Text>
                    </View>

                    <Text style={{ color: theme.colors.textMuted, fontSize: 12, marginTop: 4 }}>
                      {plan.kind === 'credit_card' && plan.creditCard
                        ? `${acc?.name ?? '未绑定账户'} · 账单日 ${plan.creditCard.statementDay} 日 · 还款日 ${plan.creditCard.dueDay} 日`
                        : plan.kind === 'mortgage' && plan.mortgage
                          ? `${plan.mortgage.method === 'equal_installment' ? '等额本息' : '等额本金'} · 剩 ${plan.mortgage.remainingMonths} 期 · ${(plan.mortgage.annualRateBps / 100).toFixed(2)}% · 每月 ${plan.dayOfCycle} 日`
                          : `${FREQ_LABEL[plan.frequency]} ${plan.dayOfCycle} ${plan.frequency === 'weekly' ? '' : '日'} · ${acc?.name ?? '未选账户'}${plan.autoPost ? ' · 自动入账' : ''}`}
                    </Text>
                  </View>

                  <View style={styles.amountCol}>
                    <Text
                      style={[
                        styles.tabular,
                        {
                          color:
                            plan.kind === 'salary'
                              ? theme.colors.income
                              : plan.kind === 'credit_card' && creditDebtCents > 0
                                ? theme.colors.expense
                                : theme.colors.text,
                          fontSize: 16,
                          fontWeight: theme.fontWeight.semibold,
                        },
                      ]}
                    >
                      {plan.kind === 'mortgage'
                        ? mortgageNext
                          ? formatCentsToYuan(mortgageNext.paymentCents)
                          : '已结清'
                        : plan.kind === 'credit_card'
                          ? formatCentsToYuan(creditDebtCents)
                          : plan.kind === 'salary'
                            ? `+${formatCentsToYuan(plan.amountCents)}`
                            : formatCentsToYuan(plan.amountCents)}
                    </Text>
                    <Text style={{ color: theme.colors.textMuted, fontSize: 11, marginTop: 2 }}>
                      {plan.kind === 'mortgage'
                        ? '下期月供'
                        : plan.kind === 'credit_card' && cardStatus
                          ? cardStatus.daysUntilDue === 0
                            ? '今日还款'
                            : `${cardStatus.daysUntilDue} 天后还款`
                          : postedThisPeriod
                            ? '本期已入账'
                            : '本期未入账'}
                    </Text>
                  </View>
                </View>

                {plan.kind === 'mortgage' && plan.mortgage && mortgageNext ? (
                  <Text
                    style={[
                      styles.tabular,
                      { color: theme.colors.textSecondary, fontSize: 12, marginTop: 8 },
                    ]}
                  >
                    剩本金 {formatCentsToYuan(plan.mortgage.remainingPrincipalCents)} · 下期本金{' '}
                    {formatCentsToYuan(mortgageNext.principalCents)} + 利息{' '}
                    {formatCentsToYuan(mortgageNext.interestCents)}
                  </Text>
                ) : null}

                <View style={[styles.divider, { backgroundColor: theme.colors.divider }]} />

                <View style={styles.actionsRow}>
                  {plan.kind === 'fixed_expense' ? (
                    <Pressable
                      accessibilityRole="button"
                      onPress={() => void handleQuickPostFixed(plan)}
                      style={({ pressed }) => [
                        styles.primaryPill,
                        { backgroundColor: theme.colors.actionSurface, borderRadius: 8 },
                        pressed && { opacity: theme.opacity.pressed },
                      ]}
                    >
                      <Text
                        style={{
                          color: theme.colors.actionTextOnSubtle,
                          fontSize: 12,
                          fontWeight: theme.fontWeight.semibold,
                        }}
                      >
                        {postedThisPeriod ? '再记一笔' : '立即入账'}
                      </Text>
                    </Pressable>
                  ) : null}

                  {plan.kind === 'salary' ? (
                    <Pressable
                      accessibilityRole="button"
                      onPress={() => {
                        hapticLight();
                        setSalaryTarget(plan);
                      }}
                      style={({ pressed }) => [
                        styles.primaryPill,
                        { backgroundColor: theme.colors.actionSurface, borderRadius: 8 },
                        pressed && { opacity: theme.opacity.pressed },
                      ]}
                    >
                      <Text
                        style={{
                          color: theme.colors.actionTextOnSubtle,
                          fontSize: 12,
                          fontWeight: theme.fontWeight.semibold,
                        }}
                      >
                        发薪确认（可调日期/扣款）
                      </Text>
                    </Pressable>
                  ) : null}

                  {plan.kind === 'mortgage' && (plan.mortgage?.remainingPrincipalCents ?? 0) > 0 ? (
                    <>
                      <Pressable
                        accessibilityRole="button"
                        onPress={() => void handleQuickPostMortgage(plan)}
                        style={({ pressed }) => [
                          styles.primaryPill,
                          { backgroundColor: theme.colors.actionSurface, borderRadius: 8 },
                          pressed && { opacity: theme.opacity.pressed },
                        ]}
                      >
                        <Text
                          style={{
                            color: theme.colors.actionTextOnSubtle,
                            fontSize: 12,
                            fontWeight: theme.fontWeight.semibold,
                          }}
                        >
                          记本期月供
                        </Text>
                      </Pressable>
                      <Pressable
                        accessibilityRole="button"
                        onPress={() => {
                          hapticLight();
                          setPrepayTarget(plan);
                        }}
                        style={({ pressed }) => [
                          styles.secondaryPill,
                          { backgroundColor: theme.colors.chipInactive, borderRadius: 8 },
                          pressed && { opacity: theme.opacity.pressed },
                        ]}
                      >
                        <Text
                          style={{
                            color: theme.colors.textSecondary,
                            fontSize: 12,
                            fontWeight: theme.fontWeight.semibold,
                          }}
                        >
                          提前还款
                        </Text>
                      </Pressable>
                    </>
                  ) : null}

                  {plan.kind === 'credit_card' && acc ? (
                    <Pressable
                      accessibilityRole="button"
                      onPress={() => {
                        hapticLight();
                        router.push({
                          pathname: '/repayment',
                          params: { liabilityAccountId: acc.id },
                        });
                      }}
                      style={({ pressed }) => [
                        styles.primaryPill,
                        { backgroundColor: theme.colors.actionSurface, borderRadius: 8 },
                        pressed && { opacity: theme.opacity.pressed },
                      ]}
                    >
                      <Text
                        style={{
                          color: theme.colors.actionTextOnSubtle,
                          fontSize: 12,
                          fontWeight: theme.fontWeight.semibold,
                        }}
                      >
                        立即还款
                      </Text>
                    </Pressable>
                  ) : null}

                  <View style={styles.flex} />

                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="编辑计划"
                    hitSlop={8}
                    onPress={() => {
                      hapticLight();
                      setEditingPlan(plan);
                      setEditorOpen(true);
                    }}
                    style={styles.iconAction}
                  >
                    <AppIcon name="create-outline" size={18} color={theme.colors.textMuted} />
                  </Pressable>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="删除计划"
                    hitSlop={8}
                    onPress={() => {
                      hapticLight();
                      setDeleteTarget(plan);
                    }}
                    style={styles.iconAction}
                  >
                    <AppIcon name="trash-outline" size={18} color={theme.colors.expense} />
                  </Pressable>
                </View>
              </View>
            );
          })
        )}
      </ScrollView>

      <RecurringEditorSheet
        visible={editorOpen}
        editingPlan={editingPlan}
        accounts={accounts}
        categories={categories}
        onClose={() => setEditorOpen(false)}
        onSave={async (input) => {
          await upsertRecurringPlan(db, input);
          notifyChange();
        }}
      />

      <SalaryPostSheet
        plan={salaryTarget}
        onClose={() => setSalaryTarget(null)}
        onConfirm={async (planId, adjustment) => {
          const res = await postSalaryPlan(db, planId, adjustment);
          notifyChange();
          showToast(`已入账实发月薪 ${formatCentsToYuan(res.transaction.amountCents)}`);
        }}
      />

      <MortgagePrepaySheet
        plan={prepayTarget}
        onClose={() => setPrepayTarget(null)}
        onConfirm={async (params) => {
          const res = await executeMortgagePrepayment(db, params.planId, params);
          notifyChange();
          showToast(
            res.simulation.paidOff
              ? '恭喜！该房贷已全部提前结清'
              : `已执行提前还款，次月新月供 ${formatCentsToYuan(res.simulation.newFirstMonthPaymentCents)}`
          );
        }}
      />

      <ConfirmDialog
        visible={deleteTarget !== null}
        title="删除周期计划"
        message={`删除「${deleteTarget?.name ?? ''}」仅停止后续计划，不会删除已入账的历史流水。`}
        icon="trash-outline"
        tone="destructive"
        confirmLabel="确认删除"
        onCancel={() => setDeleteTarget(null)}
        onConfirm={() => void handleConfirmDelete()}
      />
    </SafeScreen>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  headerBtn: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  toastBar: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  planCard: {
    padding: 14,
  },
  planTop: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  kindBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  amountCol: {
    alignItems: 'flex-end',
  },
  divider: {
    height: 1,
    marginVertical: 10,
  },
  actionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  primaryPill: {
    height: 32,
    paddingHorizontal: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryPill: {
    height: 32,
    paddingHorizontal: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconAction: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabular: {
    fontVariant: ['tabular-nums'],
  },
});
