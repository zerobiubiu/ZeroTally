/**
 * 周期计划新增与编辑弹窗：
 * 统一承接「固定支出（房租/宽带/订阅）」「弹性月薪」「房贷（等额本息/等额本金）」「信用卡账单/还款日」四种模式。
 */
import React, { useMemo, useRef, useState } from 'react';
import { Keyboard, Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { hapticLight, hapticSuccess, hapticWarning } from '../../../shared/haptics/haptics';
import {
  centsToInputString,
  parseYuanToCents,
  truncateExcessDecimalsInput,
} from '../../../shared/money/money';
import { BottomSheet, type BottomSheetHandle } from '../../../shared/ui/BottomSheet';
import { Button } from '../../../shared/ui/Button';
import { useTheme } from '../../../theme/theme-context';
import type { Account } from '../../accounts/types';
import type { Category } from '../../categories/types';
import type {
  MortgageRepaymentMethod,
  RecurringFrequency,
  RecurringPlan,
  RecurringPlanKind,
} from '../types';

export interface RecurringEditorSheetProps {
  visible: boolean;
  editingPlan: RecurringPlan | null;
  accounts: readonly Account[];
  categories: readonly Category[];
  onClose: () => void;
  onSave: (
    input: Omit<RecurringPlan, 'id' | 'createdAt' | 'updatedAt'> & { id?: string }
  ) => Promise<void>;
}

const KIND_OPTIONS: readonly { value: RecurringPlanKind; label: string }[] = [
  { value: 'fixed_expense', label: '固定支出' },
  { value: 'salary', label: '弹性月薪' },
  { value: 'mortgage', label: '房贷' },
  { value: 'credit_card', label: '信用卡日历' },
];

const FREQ_OPTIONS: readonly { value: RecurringFrequency; label: string }[] = [
  { value: 'monthly', label: '每月' },
  { value: 'quarterly', label: '每季' },
  { value: 'yearly', label: '每年' },
  { value: 'weekly', label: '每周' },
];

const MORTGAGE_METHODS: readonly { value: MortgageRepaymentMethod; label: string }[] = [
  { value: 'equal_installment', label: '等额本息' },
  { value: 'equal_principal', label: '等额本金' },
];

export function RecurringEditorSheet({
  visible,
  editingPlan,
  accounts,
  categories,
  onClose,
  onSave,
}: RecurringEditorSheetProps): React.JSX.Element {
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  const sheetRef = useRef<BottomSheetHandle>(null);

  const activeSelectableAccounts = useMemo(
    () => accounts.filter((a) => !a.isArchived && a.isSelectable),
    [accounts]
  );
  const liabilityAccounts = useMemo(
    () => accounts.filter((a) => !a.isArchived && a.kind === 'liability'),
    [accounts]
  );
  const expenseCats = useMemo(
    () => categories.filter((c) => !c.isArchived && c.type === 'expense' && c.parentId === null),
    [categories]
  );
  const incomeCats = useMemo(
    () => categories.filter((c) => !c.isArchived && c.type === 'income' && c.parentId === null),
    [categories]
  );

  const [sessionKey, setSessionKey] = useState('');
  const [kind, setKind] = useState<RecurringPlanKind>('fixed_expense');
  const [name, setName] = useState('');
  const [frequency, setFrequency] = useState<RecurringFrequency>('monthly');
  const [dayText, setDayText] = useState('1');
  const [amountText, setAmountText] = useState('');
  const [accountId, setAccountId] = useState('');
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [autoPost, setAutoPost] = useState(true);
  const [note, setNote] = useState('');

  // 房贷专用字段
  const [mortgageMethod, setMortgageMethod] = useState<MortgageRepaymentMethod>('equal_installment');
  const [principalText, setPrincipalText] = useState('');
  const [ratePercentText, setRatePercentText] = useState('3.5');
  const [monthsText, setMonthsText] = useState('360');

  // 信用卡专用字段
  const [statementDayText, setStatementDayText] = useState('5');
  const [dueDayText, setDueDayText] = useState('25');

  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const nextSession = visible ? editingPlan?.id ?? '__new__' : '';
  if (visible && nextSession !== sessionKey) {
    setSessionKey(nextSession);
    setError(null);
    if (editingPlan) {
      setKind(editingPlan.kind);
      setName(editingPlan.name);
      setFrequency(editingPlan.frequency);
      setDayText(String(editingPlan.dayOfCycle));
      setAmountText(editingPlan.amountCents > 0 ? centsToInputString(editingPlan.amountCents) : '');
      setAccountId(editingPlan.accountId);
      setCategoryId(editingPlan.categoryId);
      setAutoPost(editingPlan.autoPost);
      setNote(editingPlan.note);
      if (editingPlan.mortgage) {
        setMortgageMethod(editingPlan.mortgage.method);
        setPrincipalText(centsToInputString(editingPlan.mortgage.remainingPrincipalCents));
        setRatePercentText((editingPlan.mortgage.annualRateBps / 100).toString());
        setMonthsText(String(editingPlan.mortgage.remainingMonths));
      }
      if (editingPlan.creditCard) {
        setStatementDayText(String(editingPlan.creditCard.statementDay));
        setDueDayText(String(editingPlan.creditCard.dueDay));
      }
    } else {
      setKind('fixed_expense');
      setName('');
      setFrequency('monthly');
      setDayText('1');
      setAmountText('');
      setAccountId(activeSelectableAccounts[0]?.id ?? '');
      setCategoryId(expenseCats[0]?.id ?? null);
      setAutoPost(true);
      setNote('');
      setMortgageMethod('equal_installment');
      setPrincipalText('');
      setRatePercentText('3.5');
      setMonthsText('360');
      setStatementDayText('5');
      setDueDayText('25');
    }
  } else if (!visible && sessionKey !== '') {
    setSessionKey('');
  }

  const handleSwitchKind = (nextKind: RecurringPlanKind) => {
    hapticLight();
    setKind(nextKind);
    setError(null);
    if (nextKind === 'salary') {
      setFrequency('monthly');
      setAutoPost(false);
      setCategoryId(incomeCats.find((c) => c.id === 'cat_inc_salary')?.id ?? incomeCats[0]?.id ?? null);
      setAccountId(activeSelectableAccounts[0]?.id ?? '');
    } else if (nextKind === 'mortgage') {
      setFrequency('monthly');
      setAutoPost(false);
      setCategoryId(expenseCats.find((c) => c.id === 'cat_exp_housing')?.id ?? expenseCats[0]?.id ?? null);
      setAccountId(activeSelectableAccounts[0]?.id ?? '');
    } else if (nextKind === 'credit_card') {
      setFrequency('monthly');
      setAutoPost(false);
      setCategoryId(null);
      setAccountId(liabilityAccounts[0]?.id ?? '');
    } else {
      setCategoryId(expenseCats[0]?.id ?? null);
      setAccountId(activeSelectableAccounts[0]?.id ?? '');
    }
  };

  const visibleAccounts = kind === 'credit_card' ? liabilityAccounts : activeSelectableAccounts;
  const visibleCats = kind === 'salary' ? incomeCats : expenseCats;

  const handleSubmit = async () => {
    if (saving) {
      return;
    }
    setError(null);
    if (!name.trim()) {
      hapticWarning();
      setError('请输入计划名称');
      return;
    }
    if (!accountId) {
      hapticWarning();
      setError(kind === 'credit_card' ? '请先创建信用卡或负债账户' : '请选择关联账户');
      return;
    }

    const parsedDay = Number.parseInt(dayText, 10);
    const maxDay = frequency === 'weekly' && kind === 'fixed_expense' ? 7 : 28;
    const safeDay = Number.isInteger(parsedDay) ? Math.max(1, Math.min(maxDay, parsedDay)) : 1;

    let amountCents = 0;
    let mortgage: RecurringPlan['mortgage'];
    let creditCard: RecurringPlan['creditCard'];

    if (kind === 'fixed_expense' || kind === 'salary') {
      const parsedAmount = parseYuanToCents(amountText);
      if (parsedAmount === null || parsedAmount <= 0) {
        hapticWarning();
        setError(kind === 'salary' ? '请输入有效的基准月薪（元）' : '请输入有效的周期金额（元）');
        return;
      }
      amountCents = parsedAmount;
    } else if (kind === 'mortgage') {
      const parsedPrincipal = parseYuanToCents(principalText);
      const parsedRate = Number.parseFloat(ratePercentText);
      const parsedMonths = Number.parseInt(monthsText, 10);
      if (parsedPrincipal === null || parsedPrincipal <= 0) {
        hapticWarning();
        setError('请输入有效的剩余贷款本金（元）');
        return;
      }
      if (!Number.isFinite(parsedRate) || parsedRate < 0 || parsedRate > 30) {
        hapticWarning();
        setError('请输入 0~30 之间的年利率（%）');
        return;
      }
      if (!Number.isInteger(parsedMonths) || parsedMonths < 1 || parsedMonths > 600) {
        hapticWarning();
        setError('剩余期数须在 1~600 期之间');
        return;
      }
      mortgage = {
        method: mortgageMethod,
        originalPrincipalCents: editingPlan?.mortgage?.originalPrincipalCents ?? parsedPrincipal,
        remainingPrincipalCents: parsedPrincipal,
        annualRateBps: Math.round(parsedRate * 100),
        totalMonths: editingPlan?.mortgage?.totalMonths ?? parsedMonths,
        remainingMonths: parsedMonths,
        lastPaymentDate: editingPlan?.mortgage?.lastPaymentDate,
      };
    } else if (kind === 'credit_card') {
      const st = Number.parseInt(statementDayText, 10);
      const due = Number.parseInt(dueDayText, 10);
      if (!Number.isInteger(st) || st < 1 || st > 28 || !Number.isInteger(due) || due < 1 || due > 28) {
        hapticWarning();
        setError('账单日与还款日均须为 1~28 之间的整数');
        return;
      }
      creditCard = { statementDay: st, dueDay: due };
    }

    Keyboard.dismiss();
    setSaving(true);
    try {
      await onSave({
        id: editingPlan?.id,
        name: name.trim(),
        kind,
        frequency: kind === 'fixed_expense' ? frequency : 'monthly',
        dayOfCycle: kind === 'credit_card' ? (creditCard?.dueDay ?? 25) : safeDay,
        amountCents,
        accountId,
        categoryId: kind === 'credit_card' ? null : categoryId,
        autoPost: kind === 'credit_card' ? false : autoPost,
        enabled: editingPlan?.enabled ?? true,
        lastPostedPeriod: editingPlan?.lastPostedPeriod ?? null,
        lastPostedDate: editingPlan?.lastPostedDate ?? null,
        note: note.trim(),
        mortgage,
        creditCard,
      });
      hapticSuccess();
      sheetRef.current?.dismiss();
    } catch (err) {
      hapticWarning();
      setError(err instanceof Error ? err.message : '保存失败');
    } finally {
      setSaving(false);
    }
  };

  return (
    <BottomSheet
      ref={sheetRef}
      visible={visible}
      onClose={onClose}
      title={editingPlan ? '编辑周期计划' : '新增周期计划'}
      backdropLabel="关闭周期计划编辑"
      expandable={false}
      scrollable
      scrollMaxHeight={520}
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
            disabled={saving}
            style={styles.flex}
          />
          <Button
            label="保存计划"
            onPress={() => void handleSubmit()}
            loading={saving}
            style={styles.flex}
          />
        </View>
      }
    >
      {/* 类型选择 */}
      {!editingPlan ? (
        <View>
          <Text style={[styles.label, { color: theme.colors.textMuted }]}>计划模式</Text>
          <View style={styles.chipRow}>
            {KIND_OPTIONS.map((opt) => {
              const active = kind === opt.value;
              return (
                <Pressable
                  key={opt.value}
                  accessibilityRole="button"
                  onPress={() => handleSwitchKind(opt.value)}
                  style={[
                    styles.chip,
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
        </View>
      ) : null}

      {/* 名称 */}
      <View>
        <Text style={[styles.label, { color: theme.colors.textMuted }]}>计划名称</Text>
        <TextInput
          accessibilityLabel="计划名称"
          value={name}
          onChangeText={setName}
          placeholder={
            kind === 'salary'
              ? '如：公司月薪'
              : kind === 'mortgage'
                ? '如：首套商贷'
                : kind === 'credit_card'
                  ? '如：招行信用卡账单'
                  : '如：房租 / 宽带 / iCloud'
          }
          placeholderTextColor={theme.colors.placeholder}
          style={[styles.input, { backgroundColor: theme.colors.surfaceGrouped, color: theme.colors.text }]}
        />
      </View>

      {/* 固定支出 & 弹性月薪：金额与日期 */}
      {kind === 'fixed_expense' || kind === 'salary' ? (
        <>
          <View style={styles.twoCol}>
            <View style={styles.flex}>
              <Text style={[styles.label, { color: theme.colors.textMuted }]}>
                {kind === 'salary' ? '基准月薪（元）' : '固定金额（元）'}
              </Text>
              <TextInput
                accessibilityLabel="金额"
                value={amountText}
                onChangeText={(t) => setAmountText(truncateExcessDecimalsInput(t))}
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
            <View style={{ width: 112 }}>
              <Text style={[styles.label, { color: theme.colors.textMuted }]}>
                {frequency === 'weekly' && kind === 'fixed_expense'
                  ? '每周几 (1-7)'
                  : kind === 'salary'
                    ? '常规发薪日'
                    : '触发日 (1-28)'}
              </Text>
              <TextInput
                accessibilityLabel="触发日"
                value={dayText}
                onChangeText={(t) => setDayText(t.replace(/\D/g, '').slice(0, 2))}
                keyboardType="number-pad"
                placeholder="10"
                placeholderTextColor={theme.colors.placeholder}
                style={[
                  styles.input,
                  styles.tabular,
                  { backgroundColor: theme.colors.surfaceGrouped, color: theme.colors.text },
                ]}
              />
            </View>
          </View>

          {kind === 'fixed_expense' ? (
            <View>
              <Text style={[styles.label, { color: theme.colors.textMuted }]}>重复周期</Text>
              <View style={styles.chipRow}>
                {FREQ_OPTIONS.map((opt) => {
                  const active = frequency === opt.value;
                  return (
                    <Pressable
                      key={opt.value}
                      accessibilityRole="button"
                      onPress={() => {
                        hapticLight();
                        setFrequency(opt.value);
                      }}
                      style={[
                        styles.chip,
                        {
                          backgroundColor: active
                            ? theme.colors.actionSurface
                            : theme.colors.chipInactive,
                          borderRadius: 10,
                        },
                      ]}
                    >
                      <Text
                        style={{
                          color: active
                            ? theme.colors.actionTextOnSubtle
                            : theme.colors.textSecondary,
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
            </View>
          ) : null}
        </>
      ) : null}

      {/* 房贷模式：等额本息 / 等额本金 + 剩余本金 + 年利率 + 剩余期数 + 还款日 */}
      {kind === 'mortgage' ? (
        <>
          <View>
            <Text style={[styles.label, { color: theme.colors.textMuted }]}>还款方式</Text>
            <View style={styles.chipRow}>
              {MORTGAGE_METHODS.map((opt) => {
                const active = mortgageMethod === opt.value;
                return (
                  <Pressable
                    key={opt.value}
                    accessibilityRole="button"
                    onPress={() => {
                      hapticLight();
                      setMortgageMethod(opt.value);
                    }}
                    style={[
                      styles.chip,
                      {
                        backgroundColor: active
                          ? theme.colors.actionSurface
                          : theme.colors.chipInactive,
                        borderRadius: 10,
                      },
                    ]}
                  >
                    <Text
                      style={{
                        color: active ? theme.colors.actionTextOnSubtle : theme.colors.textSecondary,
                        fontSize: 13,
                        fontWeight: active ? theme.fontWeight.semibold : theme.fontWeight.regular,
                      }}
                    >
                      {opt.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>

          <View style={styles.twoCol}>
            <View style={styles.flex}>
              <Text style={[styles.label, { color: theme.colors.textMuted }]}>剩余本金（元）</Text>
              <TextInput
                accessibilityLabel="剩余本金"
                value={principalText}
                onChangeText={(t) => setPrincipalText(truncateExcessDecimalsInput(t))}
                inputMode="decimal"
                keyboardType="decimal-pad"
                placeholder="如 800000"
                placeholderTextColor={theme.colors.placeholder}
                style={[
                  styles.input,
                  styles.tabular,
                  { backgroundColor: theme.colors.surfaceGrouped, color: theme.colors.text },
                ]}
              />
            </View>
            <View style={{ width: 112 }}>
              <Text style={[styles.label, { color: theme.colors.textMuted }]}>年利率 (%)</Text>
              <TextInput
                accessibilityLabel="年利率"
                value={ratePercentText}
                onChangeText={setRatePercentText}
                inputMode="decimal"
                keyboardType="decimal-pad"
                placeholder="3.5"
                placeholderTextColor={theme.colors.placeholder}
                style={[
                  styles.input,
                  styles.tabular,
                  { backgroundColor: theme.colors.surfaceGrouped, color: theme.colors.text },
                ]}
              />
            </View>
          </View>

          <View style={styles.twoCol}>
            <View style={styles.flex}>
              <Text style={[styles.label, { color: theme.colors.textMuted }]}>剩余期数（月）</Text>
              <TextInput
                accessibilityLabel="剩余期数"
                value={monthsText}
                onChangeText={(t) => setMonthsText(t.replace(/\D/g, '').slice(0, 3))}
                keyboardType="number-pad"
                placeholder="240"
                placeholderTextColor={theme.colors.placeholder}
                style={[
                  styles.input,
                  styles.tabular,
                  { backgroundColor: theme.colors.surfaceGrouped, color: theme.colors.text },
                ]}
              />
            </View>
            <View style={{ width: 112 }}>
              <Text style={[styles.label, { color: theme.colors.textMuted }]}>每月还款日</Text>
              <TextInput
                accessibilityLabel="每月还款日"
                value={dayText}
                onChangeText={(t) => setDayText(t.replace(/\D/g, '').slice(0, 2))}
                keyboardType="number-pad"
                placeholder="20"
                placeholderTextColor={theme.colors.placeholder}
                style={[
                  styles.input,
                  styles.tabular,
                  { backgroundColor: theme.colors.surfaceGrouped, color: theme.colors.text },
                ]}
              />
            </View>
          </View>
        </>
      ) : null}

      {/* 信用卡模式：账单日 + 还款日 */}
      {kind === 'credit_card' ? (
        <View style={styles.twoCol}>
          <View style={styles.flex}>
            <Text style={[styles.label, { color: theme.colors.textMuted }]}>每月账单日 (1-28)</Text>
            <TextInput
              accessibilityLabel="账单日"
              value={statementDayText}
              onChangeText={(t) => setStatementDayText(t.replace(/\D/g, '').slice(0, 2))}
              keyboardType="number-pad"
              placeholder="5"
              placeholderTextColor={theme.colors.placeholder}
              style={[
                styles.input,
                styles.tabular,
                { backgroundColor: theme.colors.surfaceGrouped, color: theme.colors.text },
              ]}
            />
          </View>
          <View style={styles.flex}>
            <Text style={[styles.label, { color: theme.colors.textMuted }]}>每月还款日 (1-28)</Text>
            <TextInput
              accessibilityLabel="还款日"
              value={dueDayText}
              onChangeText={(t) => setDueDayText(t.replace(/\D/g, '').slice(0, 2))}
              keyboardType="number-pad"
              placeholder="25"
              placeholderTextColor={theme.colors.placeholder}
              style={[
                styles.input,
                styles.tabular,
                { backgroundColor: theme.colors.surfaceGrouped, color: theme.colors.text },
              ]}
            />
          </View>
        </View>
      ) : null}

      {/* 账户选择 */}
      <View>
        <Text style={[styles.label, { color: theme.colors.textMuted }]}>
          {kind === 'credit_card'
            ? '绑定信用卡 / 负债账户'
            : kind === 'salary'
              ? '发薪入账账户'
              : '扣款账户'}
        </Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.hScroll}>
          {visibleAccounts.map((acc) => {
            const active = accountId === acc.id;
            return (
              <Pressable
                key={acc.id}
                accessibilityRole="button"
                onPress={() => {
                  hapticLight();
                  setAccountId(acc.id);
                }}
                style={[
                  styles.pill,
                  {
                    backgroundColor: active ? theme.colors.actionSurface : theme.colors.chipInactive,
                    borderRadius: 10,
                  },
                ]}
              >
                <Text
                  style={{
                    color: active ? theme.colors.actionTextOnSubtle : theme.colors.textSecondary,
                    fontSize: 13,
                    fontWeight: active ? theme.fontWeight.semibold : theme.fontWeight.regular,
                  }}
                >
                  {acc.name}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
      </View>

      {/* 分类选择（非信用卡） */}
      {kind !== 'credit_card' ? (
        <View>
          <Text style={[styles.label, { color: theme.colors.textMuted }]}>归属分类</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.hScroll}>
            {visibleCats.map((cat) => {
              const active = categoryId === cat.id;
              return (
                <Pressable
                  key={cat.id}
                  accessibilityRole="button"
                  onPress={() => {
                    hapticLight();
                    setCategoryId(cat.id);
                  }}
                  style={[
                    styles.pill,
                    {
                      backgroundColor: active
                        ? theme.colors.actionSurface
                        : theme.colors.chipInactive,
                      borderRadius: 10,
                    },
                  ]}
                >
                  <Text
                    style={{
                      color: active ? theme.colors.actionTextOnSubtle : theme.colors.textSecondary,
                      fontSize: 13,
                      fontWeight: active ? theme.fontWeight.semibold : theme.fontWeight.regular,
                    }}
                  >
                    {cat.name}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>
        </View>
      ) : null}

      {/* 自动入账开关（非信用卡） */}
      {kind !== 'credit_card' ? (
        <View style={styles.switchRow}>
          <View style={styles.flex}>
            <Text style={{ color: theme.colors.text, fontSize: 14, fontWeight: '600' }}>
              到期自动入账
            </Text>
            <Text style={{ color: theme.colors.textMuted, fontSize: 12, marginTop: 2 }}>
              {kind === 'salary'
                ? '如常有提前/延时或扣款，建议关闭并改用手动发薪确认'
                : '启动应用检测到达触发日后自动记入账本（同周期不重复）'}
            </Text>
          </View>
          <Switch
            value={autoPost}
            onValueChange={setAutoPost}
            trackColor={{ false: theme.colors.chipInactive, true: theme.colors.action }}
            thumbColor={theme.colors.surfaceRaised}
          />
        </View>
      ) : null}

      {/* 备注 */}
      <View>
        <Text style={[styles.label, { color: theme.colors.textMuted }]}>备注 · 选填</Text>
        <TextInput
          accessibilityLabel="备注"
          value={note}
          onChangeText={setNote}
          placeholder="选填补充说明"
          placeholderTextColor={theme.colors.placeholder}
          style={[styles.input, { backgroundColor: theme.colors.surfaceGrouped, color: theme.colors.text }]}
        />
      </View>

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
  label: {
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 6,
  },
  chipRow: {
    flexDirection: 'row',
    gap: 8,
  },
  chip: {
    flex: 1,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  twoCol: {
    flexDirection: 'row',
    gap: 10,
  },
  input: {
    height: 42,
    borderRadius: 10,
    paddingHorizontal: 12,
    fontSize: 14,
    includeFontPadding: false,
  },
  hScroll: {
    gap: 8,
  },
  pill: {
    height: 34,
    paddingHorizontal: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
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
