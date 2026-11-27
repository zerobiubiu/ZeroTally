/**
 * 约束简报（Workflow B / C）：
 * - 快捷批量记账页：面向「旅行补记 / 一日多笔」场景的轻量补充能力，由快捷记账面板顶栏图标进入，不干扰主界面
 * - 支持一键点击快捷模板追加草稿行、自由增删多行收支并共用/微调日期、在单一 SQLite 事务内原子批量入账
 */
import { Stack, useRouter } from 'expo-router';
import React, { useEffect, useMemo, useState } from 'react';
import {
  Keyboard,
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
import { listAccounts } from '../src/features/accounts/service';
import type { Account } from '../src/features/accounts/types';
import { listCategories } from '../src/features/categories/service';
import type { Category } from '../src/features/categories/types';
import { listQuickRecordButtons } from '../src/features/quick-record/service';
import type { QuickRecordButtonItem } from '../src/features/quick-record/types';
import { DatePickerSheet } from '../src/features/transactions/components/DatePickerSheet';
import { createTransactionsBatch } from '../src/features/transactions/service';
import type { CreateTransactionInput } from '../src/features/transactions/types';
import { getTodayIsoDate } from '../src/shared/date/date';
import { hapticLight, hapticSuccess, hapticWarning } from '../src/shared/haptics/haptics';
import {
  centsToInputString,
  formatCentsToYuan,
  parseYuanToCents,
  truncateExcessDecimalsInput,
} from '../src/shared/money/money';
import { AppIcon } from '../src/shared/ui/AppIcon';
import { Button } from '../src/shared/ui/Button';
import { SafeScreen } from '../src/shared/ui/SafeScreen';
import { useTheme } from '../src/theme/theme-context';

interface BatchDraftRow {
  localId: string;
  type: 'expense' | 'income';
  amountText: string;
  categoryId: string;
  accountId: string;
  note: string;
}

let draftSeq = 1;
function nextDraftId(): string {
  draftSeq += 1;
  return `draft_${draftSeq}`;
}

export default function BatchRecordScreen(): React.JSX.Element {
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { db, notifyChange } = useDatabase();

  const [occurredOn, setOccurredOn] = useState(getTodayIsoDate());
  const [dateOpen, setDateOpen] = useState(false);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [quickItems, setQuickItems] = useState<QuickRecordButtonItem[]>([]);
  const [rows, setRows] = useState<BatchDraftRow[]>([]);
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let active = true;
    void (async () => {
      const [accs, cats, quick] = await Promise.all([
        listAccounts(db),
        listCategories(db),
        listQuickRecordButtons(db),
      ]);
      if (!active) {
        return;
      }
      const selectableAccs = accs.filter((a) => !a.isArchived && a.isSelectable);
      const activeCats = cats.filter((c) => !c.isArchived);
      setAccounts(selectableAccs);
      setCategories(activeCats);
      setQuickItems(quick.items);

      const defaultAccId = selectableAccs[0]?.id ?? '';
      const defaultExpCatId =
        activeCats.find((c) => c.type === 'expense' && c.parentId === null)?.id ?? '';
      setRows((prev) =>
        prev.length > 0
          ? prev
          : [
              {
                localId: nextDraftId(),
                type: 'expense',
                amountText: '',
                categoryId: defaultExpCatId,
                accountId: defaultAccId,
                note: '',
              },
            ]
      );
    })();
    return () => {
      active = false;
    };
  }, [db]);

  const expenseCats = useMemo(
    () => categories.filter((c) => c.type === 'expense' && c.parentId === null),
    [categories]
  );
  const incomeCats = useMemo(
    () => categories.filter((c) => c.type === 'income' && c.parentId === null),
    [categories]
  );

  const catNameMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const c of categories) {
      map.set(c.id, c.name);
    }
    return map;
  }, [categories]);

  const accNameMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const a of accounts) {
      map.set(a.id, a.name);
    }
    return map;
  }, [accounts]);

  const appendBlankRow = (type: 'expense' | 'income' = 'expense') => {
    hapticLight();
    const list = type === 'expense' ? expenseCats : incomeCats;
    setRows((prev) => [
      ...prev,
      {
        localId: nextDraftId(),
        type,
        amountText: '',
        categoryId: list[0]?.id ?? '',
        accountId: accounts[0]?.id ?? '',
        note: '',
      },
    ]);
  };

  const appendFromQuick = (item: QuickRecordButtonItem) => {
    hapticLight();
    setFormError(null);
    setRows((prev) => {
      // 若当前只有 1 行且金额为空，直接替换该空行减少多余空行
      const isSingleEmpty =
        prev.length === 1 && !prev[0]!.amountText.trim() && !prev[0]!.note.trim();
      const created: BatchDraftRow = {
        localId: nextDraftId(),
        type: item.type,
        amountText: centsToInputString(item.amountCents),
        categoryId: item.categoryId,
        accountId: item.accountId,
        note: item.note || item.name,
      };
      return isSingleEmpty ? [created] : [...prev, created];
    });
  };

  const updateRow = (localId: string, patch: Partial<BatchDraftRow>) => {
    setFormError(null);
    setRows((prev) => prev.map((r) => (r.localId === localId ? { ...r, ...patch } : r)));
  };

  const removeRow = (localId: string) => {
    hapticLight();
    setRows((prev) => (prev.length <= 1 ? prev : prev.filter((r) => r.localId !== localId)));
  };

  const cycleCategory = (row: BatchDraftRow) => {
    hapticLight();
    const list = row.type === 'expense' ? expenseCats : incomeCats;
    if (list.length === 0) return;
    const idx = list.findIndex((c) => c.id === row.categoryId);
    const nextCat = list[(idx + 1) % list.length]!;
    updateRow(row.localId, { categoryId: nextCat.id });
  };

  const cycleAccount = (row: BatchDraftRow) => {
    hapticLight();
    if (accounts.length === 0) return;
    const idx = accounts.findIndex((a) => a.id === row.accountId);
    const nextAcc = accounts[(idx + 1) % accounts.length]!;
    updateRow(row.localId, { accountId: nextAcc.id });
  };

  const stats = useMemo(() => {
    let validCount = 0;
    let expenseCents = 0;
    let incomeCents = 0;
    for (const r of rows) {
      const cents = parseYuanToCents(r.amountText);
      if (cents !== null && cents > 0) {
        validCount += 1;
        if (r.type === 'expense') expenseCents += cents;
        else incomeCents += cents;
      }
    }
    return { validCount, expenseCents, incomeCents };
  }, [rows]);

  const handleSubmitBatch = async () => {
    if (saving) {
      return;
    }
    setFormError(null);
    const inputs: CreateTransactionInput[] = [];
    for (let i = 0; i < rows.length; i += 1) {
      const r = rows[i]!;
      if (!r.amountText.trim() && !r.note.trim()) {
        continue;
      }
      const cents = parseYuanToCents(r.amountText);
      if (cents === null || cents <= 0) {
        hapticWarning();
        setFormError(`第 ${i + 1} 行金额无效，请输入大于 0 的数字`);
        return;
      }
      if (!r.categoryId || !r.accountId) {
        hapticWarning();
        setFormError(`第 ${i + 1} 行缺少分类或账户`);
        return;
      }
      inputs.push({
        type: r.type,
        amountCents: cents,
        categoryId: r.categoryId,
        accountId: r.accountId,
        toAccountId: null,
        occurredOn,
        note: r.note.trim(),
      });
    }

    if (inputs.length === 0) {
      hapticWarning();
      setFormError('请至少填写一笔有效金额');
      return;
    }

    Keyboard.dismiss();
    setSaving(true);
    try {
      await createTransactionsBatch(db, inputs);
      notifyChange();
      hapticSuccess();
      router.back();
    } catch (err) {
      hapticWarning();
      setFormError(err instanceof Error ? err.message : '批量入账失败');
    } finally {
      setSaving(false);
    }
  };

  return (
    <SafeScreen
      edges={['left', 'right']}
      style={{ backgroundColor: theme.colors.surfaceGrouped }}
    >
      <Stack.Screen
        options={{
          title: '快捷批量记账',
          headerRight: () => (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="选择记账日期"
              onPress={() => {
                Keyboard.dismiss();
                hapticLight();
                setDateOpen(true);
              }}
              style={({ pressed }) => [
                styles.datePill,
                { backgroundColor: theme.colors.actionSurface, borderRadius: 10 },
                pressed && { opacity: theme.opacity.pressed },
              ]}
            >
              <AppIcon name="calendar-outline" size={14} color={theme.colors.action} />
              <Text
                style={[
                  styles.tabular,
                  {
                    color: theme.colors.actionTextOnSubtle,
                    fontSize: 12,
                    fontWeight: theme.fontWeight.semibold,
                  },
                ]}
              >
                {occurredOn}
              </Text>
            </Pressable>
          ),
        }}
      />

      <KeyboardAvoidingView
        style={styles.flex}
        behavior="padding"
        keyboardVerticalOffset={insets.top + 56}
      >
        <ScrollView
          style={styles.flex}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ padding: 16, paddingBottom: 24, gap: 12 }}
        >
          {/* 快捷模板一键追加条 */}
          {quickItems.length > 0 ? (
            <View>
              <Text style={[styles.sectionTitle, { color: theme.colors.textMuted }]}>
                点按模板快速追加一行
              </Text>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={{ gap: 8 }}
              >
                {quickItems.map((item) => (
                  <Pressable
                    key={item.id}
                    accessibilityRole="button"
                    onPress={() => appendFromQuick(item)}
                    style={({ pressed }) => [
                      styles.quickChip,
                      { backgroundColor: theme.colors.surfaceRaised, borderRadius: 10 },
                      pressed && { opacity: theme.opacity.pressed },
                    ]}
                  >
                    <Text
                      style={{
                        color: theme.colors.text,
                        fontSize: 13,
                        fontWeight: theme.fontWeight.semibold,
                      }}
                    >
                      {item.name}
                    </Text>
                    <Text
                      style={[
                        styles.tabular,
                        { color: theme.colors.textMuted, fontSize: 12, marginLeft: 6 },
                      ]}
                    >
                      {formatCentsToYuan(item.amountCents)}
                    </Text>
                  </Pressable>
                ))}
              </ScrollView>
            </View>
          ) : null}

          {/* 批量待入账明细卡片列表 */}
          {rows.map((row, idx) => (
            <View
              key={row.localId}
              style={[
                styles.rowCard,
                { backgroundColor: theme.colors.surfaceRaised, borderRadius: 14 },
              ]}
            >
              <View style={styles.rowHeader}>
                <Pressable
                  accessibilityRole="button"
                  onPress={() => {
                    hapticLight();
                    const nextType = row.type === 'expense' ? 'income' : 'expense';
                    const nextList = nextType === 'expense' ? expenseCats : incomeCats;
                    updateRow(row.localId, {
                      type: nextType,
                      categoryId: nextList[0]?.id ?? '',
                    });
                  }}
                  style={[
                    styles.typeTag,
                    {
                      backgroundColor:
                        row.type === 'expense'
                          ? theme.colors.expenseSubtle
                          : theme.colors.incomeSubtle,
                      borderRadius: 8,
                    },
                  ]}
                >
                  <Text
                    style={{
                      color:
                        row.type === 'expense'
                          ? theme.colors.expenseTextOnSubtle
                          : theme.colors.incomeTextOnSubtle,
                      fontSize: 12,
                      fontWeight: theme.fontWeight.semibold,
                    }}
                  >
                    {row.type === 'expense' ? '支出' : '收入'}
                  </Text>
                </Pressable>

                <Pressable
                  accessibilityRole="button"
                  onPress={() => cycleCategory(row)}
                  style={[
                    styles.metaTag,
                    { backgroundColor: theme.colors.chipInactive, borderRadius: 8 },
                  ]}
                >
                  <Text style={{ color: theme.colors.textSecondary, fontSize: 12 }}>
                    {catNameMap.get(row.categoryId) ?? '选分类'}
                  </Text>
                </Pressable>

                <Pressable
                  accessibilityRole="button"
                  onPress={() => cycleAccount(row)}
                  style={[
                    styles.metaTag,
                    { backgroundColor: theme.colors.chipInactive, borderRadius: 8 },
                  ]}
                >
                  <Text style={{ color: theme.colors.textSecondary, fontSize: 12 }}>
                    {accNameMap.get(row.accountId) ?? '选账户'}
                  </Text>
                </Pressable>

                <View style={styles.flex} />

                <Text style={{ color: theme.colors.placeholder, fontSize: 11, marginRight: 6 }}>
                  #{idx + 1}
                </Text>
                {rows.length > 1 ? (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`删除第 ${idx + 1} 行`}
                    hitSlop={8}
                    onPress={() => removeRow(row.localId)}
                  >
                    <AppIcon name="close-circle" size={18} color={theme.colors.placeholder} />
                  </Pressable>
                ) : null}
              </View>

              <View style={styles.inputsRow}>
                <TextInput
                  accessibilityLabel={`第 ${idx + 1} 行金额`}
                  value={row.amountText}
                  onChangeText={(t) =>
                    updateRow(row.localId, { amountText: truncateExcessDecimalsInput(t) })
                  }
                  inputMode="decimal"
                  keyboardType="decimal-pad"
                  placeholder="¥ 0.00"
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
                <TextInput
                  accessibilityLabel={`第 ${idx + 1} 行备注`}
                  value={row.note}
                  onChangeText={(t) => updateRow(row.localId, { note: t })}
                  placeholder="备注（选填）"
                  placeholderTextColor={theme.colors.placeholder}
                  style={[
                    styles.noteInput,
                    {
                      backgroundColor: theme.colors.surfaceGrouped,
                      color: theme.colors.text,
                      borderRadius: 10,
                    },
                  ]}
                />
              </View>
            </View>
          ))}

          <Pressable
            accessibilityRole="button"
            onPress={() => appendBlankRow('expense')}
            style={({ pressed }) => [
              styles.addRowBtn,
              { backgroundColor: theme.colors.surfaceRaised, borderRadius: 14 },
              pressed && { opacity: theme.opacity.pressed },
            ]}
          >
            <AppIcon name="add-circle-outline" size={18} color={theme.colors.action} />
            <Text
              style={{
                color: theme.colors.action,
                fontSize: 14,
                fontWeight: theme.fontWeight.semibold,
              }}
            >
              再加一行
            </Text>
          </Pressable>
        </ScrollView>

        <View
          style={[
            styles.footerBar,
            {
              backgroundColor: theme.colors.surfaceGrouped,
              borderTopColor: theme.colors.divider,
              paddingBottom: Math.max(insets.bottom, 14),
            },
          ]}
        >
          {formError ? (
            <Text style={{ color: theme.colors.expense, fontSize: 12, fontWeight: '600' }}>
              {formError}
            </Text>
          ) : (
            <View style={styles.summaryRow}>
              <Text style={{ color: theme.colors.textMuted, fontSize: 12 }}>
                有效 {stats.validCount} 笔
              </Text>
              <Text style={[styles.tabular, { color: theme.colors.textSecondary, fontSize: 12 }]}>
                支 {formatCentsToYuan(stats.expenseCents)} · 收{' '}
                {formatCentsToYuan(stats.incomeCents)}
              </Text>
            </View>
          )}
          <Button
            label={stats.validCount > 0 ? `批量入账（${stats.validCount} 笔）` : '批量入账'}
            onPress={() => void handleSubmitBatch()}
            loading={saving}
            disabled={saving || stats.validCount === 0}
            style={{ borderRadius: 10 }}
          />
        </View>
      </KeyboardAvoidingView>

      <DatePickerSheet
        visible={dateOpen}
        selectedDate={occurredOn}
        onSelect={(iso) => {
          setOccurredOn(iso);
          setDateOpen(false);
        }}
        onClose={() => setDateOpen(false)}
      />
    </SafeScreen>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  datePill: {
    height: 30,
    paddingHorizontal: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 6,
    paddingHorizontal: 4,
  },
  quickChip: {
    height: 36,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
  },
  rowCard: {
    padding: 12,
    gap: 10,
  },
  rowHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  typeTag: {
    height: 26,
    paddingHorizontal: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  metaTag: {
    height: 26,
    paddingHorizontal: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  inputsRow: {
    flexDirection: 'row',
    gap: 8,
  },
  amountInput: {
    width: 118,
    height: 40,
    paddingHorizontal: 10,
    fontSize: 15,
    fontWeight: '600',
    includeFontPadding: false,
  },
  noteInput: {
    flex: 1,
    height: 40,
    paddingHorizontal: 10,
    fontSize: 14,
    includeFontPadding: false,
  },
  addRowBtn: {
    height: 46,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  footerBar: {
    borderTopWidth: 1,
    paddingTop: 10,
    paddingHorizontal: 16,
    gap: 8,
  },
  summaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  tabular: {
    fontVariant: ['tabular-nums'],
  },
});
