/**
 * 房贷提前还款精确试算与执行面板：
 * - 支持「减少月供（期限不变）」与「缩短期限（月供近似不变）」两种模式
 * - 实时输出：占用天数应结利息、本次总需支出、提前还款后首月（次月）新月供金额及本息拆分、累计节省利息
 */
import React, { useMemo, useRef, useState } from 'react';
import { Keyboard, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { getTodayIsoDate } from '../../../shared/date/date';
import { hapticLight, hapticSuccess, hapticWarning } from '../../../shared/haptics/haptics';
import {
  formatCentsToYuan,
  parseYuanToCents,
  truncateExcessDecimalsInput,
} from '../../../shared/money/money';
import { BottomSheet, type BottomSheetHandle } from '../../../shared/ui/BottomSheet';
import { Button } from '../../../shared/ui/Button';
import { useTheme } from '../../../theme/theme-context';
import { simulateMortgagePrepayment } from '../mortgage-rules';
import { diffIsoDays } from '../rules';
import type { MortgagePrepaymentMode, RecurringPlan } from '../types';

export interface MortgagePrepaySheetProps {
  plan: RecurringPlan | null;
  onClose: () => void;
  onConfirm: (params: {
    planId: string;
    prepayPrincipalCents: number;
    interestDays: number;
    mode: MortgagePrepaymentMode;
    occurredOn: string;
  }) => Promise<void>;
}

export function MortgagePrepaySheet({
  plan,
  onClose,
  onConfirm,
}: MortgagePrepaySheetProps): React.JSX.Element {
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  const sheetRef = useRef<BottomSheetHandle>(null);

  const visible = Boolean(plan && plan.mortgage);
  const todayIso = getTodayIsoDate();

  const [lastPlanId, setLastPlanId] = useState('');
  const [prepayText, setPrepayText] = useState('');
  const [daysText, setDaysText] = useState('0');
  const [mode, setMode] = useState<MortgagePrepaymentMode>('shorten_term');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (plan && plan.id !== lastPlanId) {
    setLastPlanId(plan.id);
    setPrepayText('');
    const defaultDays = plan.mortgage?.lastPaymentDate
      ? Math.min(31, diffIsoDays(plan.mortgage.lastPaymentDate, todayIso))
      : 0;
    setDaysText(String(defaultDays));
    setMode('shorten_term');
    setError(null);
  } else if (!plan && lastPlanId !== '') {
    setLastPlanId('');
  }

  const prepayCents = useMemo(() => {
    const parsed = parseYuanToCents(prepayText);
    return parsed ?? 0;
  }, [prepayText]);

  const interestDays = useMemo(() => {
    const parsed = Number.parseInt(daysText, 10);
    return Number.isInteger(parsed) && parsed >= 0 ? Math.min(365, parsed) : 0;
  }, [daysText]);

  const sim = useMemo(() => {
    if (!plan?.mortgage || prepayCents <= 0) {
      return null;
    }
    return simulateMortgagePrepayment({
      mortgage: plan.mortgage,
      prepayPrincipalCents: prepayCents,
      interestDays,
      mode,
    });
  }, [interestDays, mode, plan, prepayCents]);

  const handleSubmit = async () => {
    if (!plan?.mortgage || submitting) {
      return;
    }
    if (prepayCents <= 0) {
      hapticWarning();
      setError('请输入大于 0 的提前还本金额');
      return;
    }
    Keyboard.dismiss();
    setSubmitting(true);
    setError(null);
    try {
      await onConfirm({
        planId: plan.id,
        prepayPrincipalCents: prepayCents,
        interestDays,
        mode,
        occurredOn: todayIso,
      });
      hapticSuccess();
      sheetRef.current?.dismiss();
    } catch (err) {
      hapticWarning();
      setError(err instanceof Error ? err.message : '提前还款执行失败');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <BottomSheet
      ref={sheetRef}
      visible={visible}
      onClose={onClose}
      title={plan ? `${plan.name} · 提前还款试算` : '提前还款'}
      subtitle={
        plan?.mortgage
          ? `当前剩本金 ${formatCentsToYuan(plan.mortgage.remainingPrincipalCents)} · 剩 ${plan.mortgage.remainingMonths} 期 · 年利率 ${(plan.mortgage.annualRateBps / 100).toFixed(2)}%`
          : undefined
      }
      backdropLabel="关闭提前还款试算"
      expandable={false}
      scrollable
      scrollMaxHeight={500}
      avoidKeyboard
      includeBottomInset={false}
      contentContainerStyle={{ padding: 16, gap: 14 }}
      footer={
        <View
          style={[
            styles.footer,
            { borderTopColor: theme.colors.divider, paddingBottom: Math.max(insets.bottom, 14) },
          ]}
        >
          <Button
            label="取消"
            variant="secondary"
            onPress={() => sheetRef.current?.dismiss()}
            disabled={submitting}
            style={styles.flex}
          />
          <Button
            label="确认入账并更新房贷"
            onPress={() => void handleSubmit()}
            loading={submitting}
            disabled={!sim || submitting}
            style={styles.flex}
          />
        </View>
      }
    >
      {/* 策略切换 */}
      <View style={styles.modeRow}>
        {(
          [
            { value: 'shorten_term', label: '缩短期限（省息多）' },
            { value: 'reduce_payment', label: '减少月供（期限不变）' },
          ] as const
        ).map((opt) => {
          const active = mode === opt.value;
          return (
            <Pressable
              key={opt.value}
              accessibilityRole="button"
              onPress={() => {
                hapticLight();
                setMode(opt.value);
              }}
              style={[
                styles.modeBtn,
                {
                  backgroundColor: active ? theme.colors.actionSurface : theme.colors.chipInactive,
                  borderRadius: 10,
                },
              ]}
            >
              <Text
                style={{
                  color: active ? theme.colors.actionTextOnSubtle : theme.colors.textSecondary,
                  fontSize: 12,
                  fontWeight: active ? theme.fontWeight.semibold : theme.fontWeight.regular,
                }}
              >
                {opt.label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <View style={styles.twoCol}>
        <View style={styles.flex}>
          <Text style={[styles.label, { color: theme.colors.textMuted }]}>提前还本金额（元）</Text>
          <TextInput
            accessibilityLabel="提前还本金额"
            value={prepayText}
            onChangeText={(t) => {
              setPrepayText(truncateExcessDecimalsInput(t));
              setError(null);
            }}
            inputMode="decimal"
            keyboardType="decimal-pad"
            placeholder="如 100000"
            placeholderTextColor={theme.colors.placeholder}
            style={[
              styles.input,
              styles.tabular,
              { backgroundColor: theme.colors.surfaceGrouped, color: theme.colors.text },
            ]}
          />
        </View>
        <View style={{ width: 112 }}>
          <Text style={[styles.label, { color: theme.colors.textMuted }]}>结息天数</Text>
          <TextInput
            accessibilityLabel="结息天数"
            value={daysText}
            onChangeText={(t) => setDaysText(t.replace(/\D/g, '').slice(0, 3))}
            keyboardType="number-pad"
            placeholder="0"
            placeholderTextColor={theme.colors.placeholder}
            style={[
              styles.input,
              styles.tabular,
              { backgroundColor: theme.colors.surfaceGrouped, color: theme.colors.text },
            ]}
          />
        </View>
      </View>

      {sim ? (
        <View
          style={[
            styles.previewCard,
            { backgroundColor: theme.colors.surfaceGrouped, borderRadius: 12 },
          ]}
        >
          <View style={styles.metricRow}>
            <Text style={{ color: theme.colors.textSecondary, fontSize: 13 }}>
              本次应结清利息（{sim.interestDays} 天）
            </Text>
            <Text style={[styles.tabular, { color: theme.colors.text, fontSize: 14, fontWeight: '600' }]}>
              {formatCentsToYuan(sim.accruedInterestCents)}
            </Text>
          </View>
          <View style={styles.metricRow}>
            <Text style={{ color: theme.colors.textSecondary, fontSize: 13 }}>
              本次总支出（还本 + 结息）
            </Text>
            <Text style={[styles.tabular, { color: theme.colors.expense, fontSize: 15, fontWeight: '600' }]}>
              {formatCentsToYuan(sim.totalCashOutCents)}
            </Text>
          </View>

          <View style={[styles.divider, { backgroundColor: theme.colors.divider }]} />

          <View style={styles.metricRow}>
            <Text style={{ color: theme.colors.textSecondary, fontSize: 13 }}>
              提前还款后首月（次月）月供
            </Text>
            <Text style={[styles.tabular, { color: theme.colors.action, fontSize: 16, fontWeight: '700' }]}>
              {sim.paidOff ? '¥0.00（已结清）' : formatCentsToYuan(sim.newFirstMonthPaymentCents)}
            </Text>
          </View>
          {!sim.paidOff ? (
            <Text style={[styles.tabular, { color: theme.colors.textMuted, fontSize: 12 }]}>
              原次月 {formatCentsToYuan(sim.previousNextPaymentCents)} → 新次月本金{' '}
              {formatCentsToYuan(sim.newFirstMonthPrincipalCents)} + 利息{' '}
              {formatCentsToYuan(sim.newFirstMonthInterestCents)}
            </Text>
          ) : null}

          <View style={[styles.divider, { backgroundColor: theme.colors.divider }]} />

          <View style={styles.metricRow}>
            <Text style={{ color: theme.colors.textSecondary, fontSize: 13 }}>
              新剩余本金 / 剩余期数
            </Text>
            <Text style={[styles.tabular, { color: theme.colors.text, fontSize: 13, fontWeight: '600' }]}>
              {formatCentsToYuan(sim.newRemainingPrincipalCents)} · {sim.newRemainingMonths} 期
            </Text>
          </View>
          <View style={styles.metricRow}>
            <Text style={{ color: theme.colors.textSecondary, fontSize: 13 }}>
              预计累计节省利息
            </Text>
            <Text style={[styles.tabular, { color: theme.colors.income, fontSize: 14, fontWeight: '600' }]}>
              {formatCentsToYuan(sim.interestSavedCents)}
            </Text>
          </View>
        </View>
      ) : null}

      {error ? (
        <Text style={{ color: theme.colors.expense, fontSize: 12, fontWeight: '600' }}>
          {error}
        </Text>
      ) : null}
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  modeRow: {
    flexDirection: 'row',
    gap: 8,
  },
  modeBtn: {
    flex: 1,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  twoCol: {
    flexDirection: 'row',
    gap: 10,
  },
  label: {
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 6,
  },
  input: {
    height: 42,
    borderRadius: 10,
    paddingHorizontal: 12,
    fontSize: 15,
    includeFontPadding: false,
  },
  previewCard: {
    padding: 14,
    gap: 8,
  },
  metricRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  divider: {
    height: 1,
    marginVertical: 2,
  },
  footer: {
    flexDirection: 'row',
    gap: 10,
    borderTopWidth: 1,
    paddingHorizontal: 16,
    paddingTop: 12,
  },
  tabular: {
    fontVariant: ['tabular-nums'],
  },
});
