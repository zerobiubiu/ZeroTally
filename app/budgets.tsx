/**
 * 约束简报（Workflow B / C）：
 * - 可选预算管理页：默认关闭，仅用户手动在设置中开启后生效；开启后可设月度总预算、预警阈值与一级分类预算，并实时对照当月净支出
 * - 视觉语言对齐无描边浅灰画布（surfaceGrouped）+ 纯白 14px 卡片
 */
import { Stack } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Keyboard,
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
import {
  getBudgetConfig,
  getMonthlyRootCategoryExpenses,
  saveBudgetConfig,
} from '../src/features/budgets/repository';
import { computeBudgetProgress, DEFAULT_BUDGET_CONFIG } from '../src/features/budgets/rules';
import type { BudgetConfig } from '../src/features/budgets/types';
import { listCategories } from '../src/features/categories/service';
import type { Category } from '../src/features/categories/types';
import { summarizeTransactionsByDateRange } from '../src/features/transactions/repository';
import { formatMonthTitle, getCurrentMonthKey, getMonthDateRange } from '../src/shared/date/date';
import { hapticLight, hapticSuccess, hapticWarning } from '../src/shared/haptics/haptics';
import {
  centsToInputString,
  CURRENCY_SYMBOL,
  formatCentsToYuan,
  parseYuanToCents,
  truncateExcessDecimalsInput,
} from '../src/shared/money/money';
import { AppIcon } from '../src/shared/ui/AppIcon';
import { BottomSheet, type BottomSheetHandle } from '../src/shared/ui/BottomSheet';
import { Button } from '../src/shared/ui/Button';
import { SafeScreen } from '../src/shared/ui/SafeScreen';
import { useTheme } from '../src/theme/theme-context';

const WARN_OPTIONS = [70, 80, 90] as const;

type EditBudgetTarget =
  | { kind: 'total'; title: string; currentCents: number }
  | { kind: 'category'; categoryId: string; title: string; currentCents: number };

export default function BudgetsScreen(): React.JSX.Element {
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  const { db, revision, notifyChange } = useDatabase();

  const monthKey = getCurrentMonthKey();
  const [config, setConfig] = useState<BudgetConfig>(DEFAULT_BUDGET_CONFIG);
  const [monthSpentCents, setMonthSpentCents] = useState(0);
  const [categorySpentMap, setCategorySpentMap] = useState<Record<string, number>>({});
  const [expenseCategories, setExpenseCategories] = useState<Category[]>([]);

  const sheetRef = useRef<BottomSheetHandle>(null);
  const [editTarget, setEditTarget] = useState<EditBudgetTarget | null>(null);
  const [amountInput, setAmountInput] = useState('');
  const [inputError, setInputError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void (async () => {
      const { start, end } = getMonthDateRange(monthKey);
      const [cfg, summary, catExpenses, cats] = await Promise.all([
        getBudgetConfig(db),
        summarizeTransactionsByDateRange(db, start, end),
        getMonthlyRootCategoryExpenses(db, monthKey),
        listCategories(db),
      ]);
      if (active) {
        setConfig(cfg);
        setMonthSpentCents(Math.max(0, summary.expenseCents));
        setCategorySpentMap(catExpenses);
        setExpenseCategories(
          cats.filter((c) => !c.isArchived && c.type === 'expense' && c.parentId === null)
        );
      }
    })();
    return () => {
      active = false;
    };
  }, [db, monthKey, revision]);

  const persist = useCallback(
    async (next: BudgetConfig) => {
      setConfig(next);
      await saveBudgetConfig(db, next);
      notifyChange();
    },
    [db, notifyChange]
  );

  const totalProgress = useMemo(
    () =>
      computeBudgetProgress({
        budgetCents: config.monthlyTotalCents,
        spentCents: monthSpentCents,
        warningPercent: config.warningPercent,
      }),
    [config.monthlyTotalCents, config.warningPercent, monthSpentCents]
  );

  const openEditor = (target: EditBudgetTarget) => {
    hapticLight();
    setEditTarget(target);
    setAmountInput(target.currentCents > 0 ? centsToInputString(target.currentCents) : '');
    setInputError(null);
  };

  const handleSaveAmount = async () => {
    if (!editTarget) {
      return;
    }
    const trimmed = amountInput.trim();
    let nextCents = 0;
    if (trimmed.length > 0) {
      const parsed = parseYuanToCents(trimmed);
      if (parsed === null) {
        hapticWarning();
        setInputError('请输入非负数字（最多两位小数）');
        return;
      }
      nextCents = parsed;
    }
    Keyboard.dismiss();

    if (editTarget.kind === 'total') {
      await persist({ ...config, monthlyTotalCents: nextCents });
    } else {
      const nextMap = { ...config.categoryBudgetsCents };
      if (nextCents > 0) {
        nextMap[editTarget.categoryId] = nextCents;
      } else {
        delete nextMap[editTarget.categoryId];
      }
      await persist({ ...config, categoryBudgetsCents: nextMap });
    }
    hapticSuccess();
    sheetRef.current?.dismiss();
  };

  const statusColor = (status: 'safe' | 'warning' | 'exceeded') =>
    status === 'exceeded'
      ? theme.colors.expense
      : status === 'warning'
        ? theme.colors.warning
        : theme.colors.action;

  return (
    <SafeScreen
      edges={['left', 'right']}
      style={{ backgroundColor: theme.colors.surfaceGrouped }}
    >
      <Stack.Screen options={{ title: '预算管理' }} />

      <ScrollView
        style={styles.flex}
        contentContainerStyle={{
          padding: 16,
          paddingBottom: Math.max(insets.bottom, 16) + 24,
        }}
      >
        {/* 顶部总开关（默认关闭，开启后仅作轻量补充展示） */}
        <View
          style={[
            styles.card,
            { backgroundColor: theme.colors.surfaceRaised, borderRadius: 14 },
          ]}
        >
          <View style={styles.switchRow}>
            <View style={styles.rowText}>
              <Text style={[styles.rowTitle, { color: theme.colors.text }]}>启用月度预算</Text>
              <Text style={[styles.rowSub, { color: theme.colors.textMuted }]}>
                关闭时主界面零干扰；开启后在明细月度卡片底部展示轻量进度
              </Text>
            </View>
            <Switch
              value={config.enabled}
              onValueChange={(v) => {
                hapticLight();
                void persist({ ...config, enabled: v });
              }}
              trackColor={{ false: theme.colors.chipInactive, true: theme.colors.action }}
              thumbColor={theme.colors.surfaceRaised}
            />
          </View>
        </View>

        {config.enabled ? (
          <>
            {/* 本月总预算卡片 */}
            <Text style={[styles.sectionTitle, { color: theme.colors.textMuted, marginTop: 16 }]}>
              {formatMonthTitle(monthKey)}总预算
            </Text>
            <View
              style={[
                styles.card,
                { backgroundColor: theme.colors.surfaceRaised, borderRadius: 14 },
              ]}
            >
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="设置月度总预算"
                onPress={() =>
                  openEditor({
                    kind: 'total',
                    title: '月度总预算',
                    currentCents: config.monthlyTotalCents,
                  })
                }
                style={({ pressed }) => [
                  styles.totalBlock,
                  pressed && { opacity: theme.opacity.pressed },
                ]}
              >
                <View style={styles.betweenRow}>
                  <Text style={{ color: theme.colors.textSecondary, fontSize: 14 }}>
                    月度总预算
                  </Text>
                  <View style={styles.editHintRow}>
                    <Text
                      style={[
                        styles.tabular,
                        {
                          color:
                            config.monthlyTotalCents > 0
                              ? theme.colors.text
                              : theme.colors.placeholder,
                          fontSize: 18,
                          fontWeight: theme.fontWeight.semibold,
                        },
                      ]}
                    >
                      {config.monthlyTotalCents > 0
                        ? formatCentsToYuan(config.monthlyTotalCents)
                        : '点击设置'}
                    </Text>
                    <AppIcon name="chevron-forward" size={16} color={theme.colors.placeholder} />
                  </View>
                </View>

                {totalProgress ? (
                  <View style={{ marginTop: 12 }}>
                    <View
                      style={[
                        styles.progressTrack,
                        { backgroundColor: theme.colors.chipInactive },
                      ]}
                    >
                      <View
                        style={[
                          styles.progressFill,
                          {
                            width: `${Math.min(100, totalProgress.usedPercent)}%`,
                            backgroundColor: statusColor(totalProgress.status),
                          },
                        ]}
                      />
                    </View>
                    <View style={[styles.betweenRow, { marginTop: 8 }]}>
                      <Text style={[styles.tabular, { color: theme.colors.textMuted, fontSize: 12 }]}>
                        已用 {formatCentsToYuan(totalProgress.spentCents)}（{totalProgress.usedPercent}%）
                      </Text>
                      <Text
                        style={[
                          styles.tabular,
                          {
                            color: statusColor(totalProgress.status),
                            fontSize: 12,
                            fontWeight: theme.fontWeight.semibold,
                          },
                        ]}
                      >
                        {totalProgress.remainingCents >= 0
                          ? `剩余 ${formatCentsToYuan(totalProgress.remainingCents)}`
                          : `超支 ${formatCentsToYuan(Math.abs(totalProgress.remainingCents))}`}
                      </Text>
                    </View>
                  </View>
                ) : null}
              </Pressable>

              <View style={[styles.divider, { backgroundColor: theme.colors.divider }]} />

              <View style={styles.warnRow}>
                <Text style={{ color: theme.colors.textSecondary, fontSize: 13 }}>预警阈值</Text>
                <View style={styles.warnChips}>
                  {WARN_OPTIONS.map((pct) => {
                    const active = config.warningPercent === pct;
                    return (
                      <Pressable
                        key={pct}
                        accessibilityRole="button"
                        accessibilityState={{ selected: active }}
                        onPress={() => {
                          hapticLight();
                          void persist({ ...config, warningPercent: pct });
                        }}
                        style={({ pressed }) => [
                          styles.warnChip,
                          {
                            backgroundColor: active
                              ? theme.colors.actionSurface
                              : theme.colors.chipInactive,
                            borderRadius: 8,
                          },
                          pressed && { opacity: theme.opacity.pressed },
                        ]}
                      >
                        <Text
                          style={[
                            styles.tabular,
                            {
                              color: active
                                ? theme.colors.actionTextOnSubtle
                                : theme.colors.textSecondary,
                              fontSize: 12,
                              fontWeight: active
                                ? theme.fontWeight.semibold
                                : theme.fontWeight.regular,
                            },
                          ]}
                        >
                          {pct}%
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              </View>
            </View>

            {/* 分类月度预算（可选，按需设置） */}
            <Text style={[styles.sectionTitle, { color: theme.colors.textMuted, marginTop: 16 }]}>
              分类预算 · 选填
            </Text>
            <View
              style={[
                styles.card,
                { backgroundColor: theme.colors.surfaceRaised, borderRadius: 14 },
              ]}
            >
              {expenseCategories.map((cat, idx) => {
                const budgetCents = config.categoryBudgetsCents[cat.id] ?? 0;
                const spentCents = categorySpentMap[cat.id] ?? 0;
                const prog = computeBudgetProgress({
                  budgetCents,
                  spentCents,
                  warningPercent: config.warningPercent,
                });

                return (
                  <View key={cat.id}>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={`设置${cat.name}预算`}
                      onPress={() =>
                        openEditor({
                          kind: 'category',
                          categoryId: cat.id,
                          title: `${cat.name}月预算`,
                          currentCents: budgetCents,
                        })
                      }
                      style={({ pressed }) => [
                        styles.catRow,
                        pressed && { opacity: theme.opacity.pressed },
                      ]}
                    >
                      <View style={styles.betweenRow}>
                        <View style={styles.catLeft}>
                          <View
                            style={[
                              styles.catIcon,
                              { backgroundColor: theme.colors.chipInactive, borderRadius: 10 },
                            ]}
                          >
                            <AppIcon name={cat.icon} size={17} color={cat.color} />
                          </View>
                          <View>
                            <Text
                              style={{
                                color: theme.colors.text,
                                fontSize: 14,
                                fontWeight: theme.fontWeight.semibold,
                              }}
                            >
                              {cat.name}
                            </Text>
                            <Text
                              style={[
                                styles.tabular,
                                { color: theme.colors.textMuted, fontSize: 12, marginTop: 1 },
                              ]}
                            >
                              本月已用 {formatCentsToYuan(spentCents)}
                            </Text>
                          </View>
                        </View>

                        <View style={styles.editHintRow}>
                          <Text
                            style={[
                              styles.tabular,
                              {
                                color:
                                  budgetCents > 0 ? theme.colors.text : theme.colors.placeholder,
                                fontSize: 14,
                                fontWeight:
                                  budgetCents > 0
                                    ? theme.fontWeight.semibold
                                    : theme.fontWeight.regular,
                              },
                            ]}
                          >
                            {budgetCents > 0 ? formatCentsToYuan(budgetCents) : '未设置'}
                          </Text>
                          <AppIcon
                            name="chevron-forward"
                            size={15}
                            color={theme.colors.placeholder}
                          />
                        </View>
                      </View>

                      {prog ? (
                        <View style={{ marginTop: 8 }}>
                          <View
                            style={[
                              styles.progressTrackThin,
                              { backgroundColor: theme.colors.chipInactive },
                            ]}
                          >
                            <View
                              style={[
                                styles.progressFill,
                                {
                                  width: `${Math.min(100, prog.usedPercent)}%`,
                                  backgroundColor: statusColor(prog.status),
                                },
                              ]}
                            />
                          </View>
                        </View>
                      ) : null}
                    </Pressable>
                    {idx < expenseCategories.length - 1 ? (
                      <View style={[styles.divider, { backgroundColor: theme.colors.divider }]} />
                    ) : null}
                  </View>
                );
              })}
            </View>
          </>
        ) : null}
      </ScrollView>

      <BottomSheet
        ref={sheetRef}
        visible={editTarget !== null}
        onClose={() => setEditTarget(null)}
        title={editTarget?.title ?? '设置预算'}
        subtitle="留空保存即取消该项预算"
        backdropLabel="关闭预算编辑"
        expandable={false}
        avoidKeyboard
        includeBottomInset={false}
        footer={
          <View
            style={[
              styles.sheetFooter,
              {
                borderTopColor: theme.colors.divider,
                paddingBottom: Math.max(insets.bottom, 14),
              },
            ]}
          >
            <Button
              label="取消"
              variant="secondary"
              onPress={() => sheetRef.current?.dismiss()}
              style={styles.flex}
            />
            <Button label="保存" onPress={() => void handleSaveAmount()} style={styles.flex} />
          </View>
        }
      >
        <View style={{ padding: 16 }}>
          <View
            style={[
              styles.amountRow,
              { backgroundColor: theme.colors.surfaceGrouped, borderRadius: 10 },
            ]}
          >
            <Text style={[styles.currency, { color: theme.colors.textSecondary }]}>
              {CURRENCY_SYMBOL}
            </Text>
            <TextInput
              accessibilityLabel="预算金额"
              value={amountInput}
              onChangeText={(t) => {
                setAmountInput(truncateExcessDecimalsInput(t));
                setInputError(null);
              }}
              inputMode="decimal"
              keyboardType="decimal-pad"
              placeholder="0.00"
              placeholderTextColor={theme.colors.placeholder}
              autoFocus
              style={[styles.amountInput, styles.tabular, { color: theme.colors.text }]}
            />
          </View>
          {inputError ? (
            <Text style={{ color: theme.colors.expense, fontSize: 12, marginTop: 8 }}>
              {inputError}
            </Text>
          ) : null}
        </View>
      </BottomSheet>
    </SafeScreen>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 6,
    paddingHorizontal: 4,
  },
  card: {
    overflow: 'hidden',
  },
  switchRow: {
    minHeight: 60,
    paddingHorizontal: 16,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  rowText: {
    flex: 1,
  },
  rowTitle: {
    fontSize: 15,
    fontWeight: '600',
  },
  rowSub: {
    fontSize: 12,
    marginTop: 2,
    lineHeight: 17,
  },
  totalBlock: {
    padding: 16,
  },
  betweenRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  editHintRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  progressTrack: {
    height: 7,
    borderRadius: 9999,
    overflow: 'hidden',
  },
  progressTrackThin: {
    height: 5,
    borderRadius: 9999,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 9999,
  },
  warnRow: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  warnChips: {
    flexDirection: 'row',
    gap: 6,
  },
  warnChip: {
    height: 30,
    paddingHorizontal: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  catRow: {
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  catLeft: {
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
  divider: {
    height: 1,
    marginHorizontal: 16,
  },
  amountRow: {
    height: 50,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
  },
  currency: {
    fontSize: 18,
    fontWeight: '600',
    marginRight: 6,
  },
  amountInput: {
    flex: 1,
    fontSize: 22,
    fontWeight: '700',
    includeFontPadding: false,
  },
  sheetFooter: {
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
