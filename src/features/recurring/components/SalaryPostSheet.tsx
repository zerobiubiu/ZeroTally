/**
 * 弹性月薪发薪确认面板：
 * 支持自定义实际到账日期（处理节假日提前或公司延时发放）、当月扣款与额外补贴/绩效，实时预览实发金额。
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
import { AppIcon } from '../../../shared/ui/AppIcon';
import { BottomSheet, type BottomSheetHandle } from '../../../shared/ui/BottomSheet';
import { Button } from '../../../shared/ui/Button';
import { useTheme } from '../../../theme/theme-context';
import { DatePickerSheet } from '../../transactions/components/DatePickerSheet';
import { resolveSalaryPosting } from '../rules';
import type { RecurringPlan, SalaryAdjustmentInput } from '../types';

export interface SalaryPostSheetProps {
  plan: RecurringPlan | null;
  onClose: () => void;
  onConfirm: (planId: string, adjustment: SalaryAdjustmentInput) => Promise<void>;
}

export function SalaryPostSheet({
  plan,
  onClose,
  onConfirm,
}: SalaryPostSheetProps): React.JSX.Element {
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  const sheetRef = useRef<BottomSheetHandle>(null);

  const [lastPlanId, setLastPlanId] = useState('');
  const [occurredOn, setOccurredOn] = useState(getTodayIsoDate());
  const [deductionText, setDeductionText] = useState('');
  const [bonusText, setBonusText] = useState('');
  const [extraNote, setExtraNote] = useState('');
  const [dateOpen, setDateOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (plan && plan.id !== lastPlanId) {
    setLastPlanId(plan.id);
    setOccurredOn(getTodayIsoDate());
    setDeductionText('');
    setBonusText('');
    setExtraNote('');
    setError(null);
  } else if (!plan && lastPlanId !== '') {
    setLastPlanId('');
  }

  const deductionCents = parseYuanToCents(deductionText) ?? 0;
  const bonusCents = parseYuanToCents(bonusText) ?? 0;

  const preview = useMemo(() => {
    if (!plan) {
      return null;
    }
    try {
      return resolveSalaryPosting({
        plan,
        adjustment: { occurredOn, deductionCents, bonusCents, extraNote },
      });
    } catch {
      return null;
    }
  }, [bonusCents, deductionCents, extraNote, occurredOn, plan]);

  const handleConfirm = async () => {
    if (!plan || submitting) {
      return;
    }
    if (!preview) {
      hapticWarning();
      setError('实发金额须大于 0，请核对扣款金额');
      return;
    }
    Keyboard.dismiss();
    setSubmitting(true);
    setError(null);
    try {
      await onConfirm(plan.id, { occurredOn, deductionCents, bonusCents, extraNote });
      hapticSuccess();
      sheetRef.current?.dismiss();
    } catch (err) {
      hapticWarning();
      setError(err instanceof Error ? err.message : '发薪入账失败');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <BottomSheet
        ref={sheetRef}
        visible={Boolean(plan)}
        onClose={onClose}
        title={plan ? `${plan.name} · 发薪入账确认` : '发薪确认'}
        subtitle={
          plan
            ? `基准 ${formatCentsToYuan(plan.amountCents)} · 常规每月 ${plan.dayOfCycle} 日`
            : undefined
        }
        backdropLabel="关闭发薪确认"
        expandable={false}
        avoidKeyboard
        includeBottomInset={false}
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
              label="确认入账"
              onPress={() => void handleConfirm()}
              loading={submitting}
              disabled={!preview || submitting}
              style={styles.flex}
            />
          </View>
        }
      >
        <View style={{ padding: 16, gap: 12 }}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="选择实际到账日期"
            onPress={() => {
              Keyboard.dismiss();
              hapticLight();
              setDateOpen(true);
            }}
            style={[
              styles.dateRow,
              { backgroundColor: theme.colors.surfaceGrouped, borderRadius: 10 },
            ]}
          >
            <Text style={{ color: theme.colors.textSecondary, fontSize: 13 }}>实际到账日期</Text>
            <View style={styles.dateRight}>
              <Text style={[styles.tabular, { color: theme.colors.text, fontSize: 14, fontWeight: '600' }]}>
                {occurredOn}
              </Text>
              {preview && preview.timingTag !== 'on_time' ? (
                <Text
                  style={{
                    color:
                      preview.timingTag === 'early' ? theme.colors.income : theme.colors.warning,
                    fontSize: 11,
                    fontWeight: '600',
                  }}
                >
                  {preview.timingTag === 'early' ? '提前' : '延时'}
                </Text>
              ) : null}
              <AppIcon name="calendar-outline" size={16} color={theme.colors.placeholder} />
            </View>
          </Pressable>

          <View style={styles.twoCol}>
            <View style={styles.flex}>
              <Text style={[styles.label, { color: theme.colors.textMuted }]}>当月扣款（元）</Text>
              <TextInput
                accessibilityLabel="当月扣款"
                value={deductionText}
                onChangeText={(t) => {
                  setDeductionText(truncateExcessDecimalsInput(t));
                  setError(null);
                }}
                inputMode="decimal"
                keyboardType="decimal-pad"
                placeholder="0.00"
                placeholderTextColor={theme.colors.placeholder}
                style={[
                  styles.input,
                  styles.tabular,
                  { backgroundColor: theme.colors.surfaceGrouped, color: theme.colors.text },
                ]}
              />
            </View>
            <View style={styles.flex}>
              <Text style={[styles.label, { color: theme.colors.textMuted }]}>补贴 / 绩效（元）</Text>
              <TextInput
                accessibilityLabel="当月补贴或绩效"
                value={bonusText}
                onChangeText={(t) => {
                  setBonusText(truncateExcessDecimalsInput(t));
                  setError(null);
                }}
                inputMode="decimal"
                keyboardType="decimal-pad"
                placeholder="0.00"
                placeholderTextColor={theme.colors.placeholder}
                style={[
                  styles.input,
                  styles.tabular,
                  { backgroundColor: theme.colors.surfaceGrouped, color: theme.colors.text },
                ]}
              />
            </View>
          </View>

          <TextInput
            accessibilityLabel="补充说明"
            value={extraNote}
            onChangeText={setExtraNote}
            placeholder="选填说明，如请假半天 / 季度奖"
            placeholderTextColor={theme.colors.placeholder}
            style={[
              styles.input,
              { backgroundColor: theme.colors.surfaceGrouped, color: theme.colors.text },
            ]}
          />

          {preview ? (
            <View
              style={[
                styles.netBox,
                { backgroundColor: theme.colors.actionSurface, borderRadius: 10 },
              ]}
            >
              <Text style={{ color: theme.colors.actionTextOnSubtle, fontSize: 13 }}>
                本次实发入账
              </Text>
              <Text
                style={[
                  styles.tabular,
                  { color: theme.colors.action, fontSize: 20, fontWeight: '700' },
                ]}
              >
                +{formatCentsToYuan(preview.netAmountCents)}
              </Text>
            </View>
          ) : null}

          {error ? (
            <Text style={{ color: theme.colors.expense, fontSize: 12, fontWeight: '600' }}>
              {error}
            </Text>
          ) : null}
        </View>
      </BottomSheet>

      <DatePickerSheet
        visible={dateOpen}
        selectedDate={occurredOn}
        onSelect={(iso) => {
          setOccurredOn(iso);
          setDateOpen(false);
        }}
        onClose={() => setDateOpen(false)}
      />
    </>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  dateRow: {
    height: 44,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  dateRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
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
    fontSize: 14,
    includeFontPadding: false,
  },
  netBox: {
    paddingHorizontal: 14,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
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
