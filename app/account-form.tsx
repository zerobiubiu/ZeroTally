/**
 * 约束简报（Workflow B / C）：
 * - 信息层级：主（账户名称与初始金额 + 底部唯一主操作「保存」）、次（账户类型与性质、4 列等宽图标网格）、弱（计入净资产开关与备注）
 * - 文案密度：仅保留负债填正数这一关键业务输入规则，删除所有冗余解释
 */
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import React, { useEffect, useMemo, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
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
import { createAccount, getAccountById, updateAccount } from '../src/features/accounts/service';
import {
  ACCOUNT_CATEGORY_METAS,
  ACCOUNT_COLOR_OPTIONS,
  ACCOUNT_ICON_OPTIONS,
  type AccountCategory,
  type AccountKind,
} from '../src/features/accounts/types';
import { parseSignedYuanToCents, parseYuanToCents } from '../src/shared/money/money';
import { AppIcon } from '../src/shared/ui/AppIcon';
import { Button } from '../src/shared/ui/Button';
import { SafeScreen } from '../src/shared/ui/SafeScreen';
import { useTheme } from '../src/theme/theme-context';

function firstParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function chunkIcons(items: readonly string[], columns: number): string[][] {
  const rows: string[][] = [];
  for (let i = 0; i < items.length; i += columns) {
    rows.push(items.slice(i, i + columns));
  }
  return rows;
}

export default function AccountFormScreen(): React.JSX.Element {
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { db, notifyChange } = useDatabase();

  const params = useLocalSearchParams<{ id?: string | string[] }>();
  const editId = firstParam(params.id);
  const isEditing = Boolean(editId);

  const [name, setName] = useState('');
  const [category, setCategory] = useState<AccountCategory>('bank');
  const [kind, setKind] = useState<AccountKind>('asset');
  const [initialInput, setInitialInput] = useState('0');
  const [icon, setIcon] = useState<string>('card-outline');
  const [color, setColor] = useState<string>(ACCOUNT_COLOR_OPTIONS[0] ?? '#0F766E');
  const [includeInNetWorth, setIncludeInNetWorth] = useState(true);
  const [note, setNote] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const iconRows = useMemo(() => chunkIcons(ACCOUNT_ICON_OPTIONS, 4), []);

  useEffect(() => {
    if (!editId) {
      return;
    }
    let active = true;
    void (async () => {
      const acc = await getAccountById(db, editId);
      if (active && acc) {
        setName(acc.name);
        setCategory(acc.category);
        setKind(acc.kind);
        setIcon(acc.icon);
        setColor(acc.color);
        setIncludeInNetWorth(acc.includeInNetWorth);
        setNote(acc.note);
      }
    })();
    return () => {
      active = false;
    };
  }, [db, editId]);

  const handleSelectCategory = (nextCat: AccountCategory) => {
    setCategory(nextCat);
    const meta = ACCOUNT_CATEGORY_METAS.find((m) => m.value === nextCat);
    if (meta && !isEditing) {
      setKind(meta.defaultKind);
      setIcon(meta.defaultIcon);
      setColor(meta.defaultColor);
    }
  };

  const handleSave = async () => {
    setFormError(null);
    if (!name.trim()) {
      setFormError('请输入账户名称');
      return;
    }

    setSaving(true);
    try {
      if (editId) {
        await updateAccount(db, editId, {
          name,
          kind,
          category,
          includeInNetWorth,
          icon,
          color,
          note,
        });
      } else {
        let initialBalanceCents = 0;
        if (kind === 'liability') {
          const debtCents = parseYuanToCents(initialInput || '0');
          if (debtCents === null) {
            setFormError('待还欠款须为非负数字（最多两位小数）');
            setSaving(false);
            return;
          }
          initialBalanceCents = debtCents === 0 ? 0 : -debtCents;
        } else {
          const parsed = parseSignedYuanToCents(initialInput || '0');
          if (parsed === null) {
            setFormError('初始余额格式无效（最多两位小数）');
            setSaving(false);
            return;
          }
          initialBalanceCents = parsed;
        }

        await createAccount(db, {
          name,
          kind,
          category,
          initialBalanceCents,
          includeInNetWorth,
          icon,
          color,
          note,
        });
      }

      notifyChange();
      router.back();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : '保存失败');
    } finally {
      setSaving(false);
    }
  };

  return (
    <SafeScreen edges={['left', 'right']}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <Stack.Screen options={{ title: isEditing ? '编辑账户' : '新增账户' }} />

        <ScrollView
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{
            padding: theme.spacing.lg,
            paddingBottom: Math.max(insets.bottom, theme.spacing.lg) + theme.spacing.xl,
          }}
        >
          {/* 账户类型 */}
          <View>
            <Text
              style={{
                color: theme.colors.textSecondary,
                fontSize: theme.fontSize.sm,
                fontWeight: theme.fontWeight.semibold,
                marginBottom: theme.spacing.sm,
              }}
            >
              类型
            </Text>
            <View style={styles.wrapRow}>
              {ACCOUNT_CATEGORY_METAS.map((meta) => {
                const selected = category === meta.value;
                return (
                  <Pressable
                    key={meta.value}
                    accessibilityRole="button"
                    accessibilityState={{ selected }}
                    onPress={() => handleSelectCategory(meta.value)}
                    style={[
                      styles.tagChip,
                      {
                        backgroundColor: selected
                          ? theme.colors.actionSubtle
                          : theme.colors.surfaceRaised,
                        borderColor: selected ? theme.colors.action : theme.colors.border,
                        borderWidth: selected
                          ? theme.borderWidth.focus
                          : theme.borderWidth.hairline,
                        borderRadius: theme.radius.md,
                      },
                    ]}
                  >
                    <AppIcon
                      name={meta.defaultIcon}
                      size={16}
                      color={selected ? theme.colors.actionTextOnSubtle : theme.colors.textSecondary}
                    />
                    <Text
                      style={{
                        color: selected ? theme.colors.actionTextOnSubtle : theme.colors.text,
                        fontSize: theme.fontSize.sm,
                        fontWeight: selected
                          ? theme.fontWeight.semibold
                          : theme.fontWeight.regular,
                        marginLeft: 6,
                      }}
                    >
                      {meta.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>

          {/* 账户性质 */}
          <View style={{ marginTop: theme.spacing.xl }}>
            <Text
              style={{
                color: theme.colors.textSecondary,
                fontSize: theme.fontSize.sm,
                fontWeight: theme.fontWeight.semibold,
                marginBottom: theme.spacing.sm,
              }}
            >
              性质
            </Text>
            <View style={styles.kindRow}>
              {(['asset', 'liability'] as const).map((item) => {
                const selected = kind === item;
                return (
                  <Pressable
                    key={item}
                    accessibilityRole="button"
                    accessibilityState={{ selected }}
                    onPress={() => setKind(item)}
                    style={[
                      styles.kindBtn,
                      {
                        backgroundColor: selected
                          ? item === 'liability'
                            ? theme.colors.warningSubtle
                            : theme.colors.actionSubtle
                          : theme.colors.surfaceRaised,
                        borderColor: selected
                          ? item === 'liability'
                            ? theme.colors.warning
                            : theme.colors.action
                          : theme.colors.border,
                        borderWidth: selected
                          ? theme.borderWidth.focus
                          : theme.borderWidth.hairline,
                        borderRadius: theme.radius.md,
                      },
                    ]}
                  >
                    <Text
                      style={{
                        color: selected
                          ? item === 'liability'
                            ? theme.colors.warningTextOnSubtle
                            : theme.colors.actionTextOnSubtle
                          : theme.colors.text,
                        fontSize: theme.fontSize.base,
                        fontWeight: theme.fontWeight.semibold,
                      }}
                    >
                      {item === 'asset' ? '资产' : '负债'}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>

          {/* 名称 */}
          <View style={{ marginTop: theme.spacing.xl }}>
            <Text
              style={{
                color: theme.colors.textSecondary,
                fontSize: theme.fontSize.sm,
                fontWeight: theme.fontWeight.semibold,
                marginBottom: theme.spacing.sm,
              }}
            >
              名称
            </Text>
            <TextInput
              accessibilityLabel="账户名称"
              value={name}
              onChangeText={setName}
              placeholder="招商储蓄卡"
              placeholderTextColor={theme.colors.textMuted}
              maxLength={24}
              style={[
                styles.input,
                {
                  backgroundColor: theme.colors.surfaceRaised,
                  borderColor: theme.colors.border,
                  color: theme.colors.text,
                  borderRadius: theme.radius.md,
                  fontSize: theme.fontSize.base,
                },
              ]}
            />
          </View>

          {/* 初始余额 / 待还欠款 */}
          {!isEditing ? (
            <View style={{ marginTop: theme.spacing.xl }}>
              <Text
                style={{
                  color: theme.colors.textSecondary,
                  fontSize: theme.fontSize.sm,
                  fontWeight: theme.fontWeight.semibold,
                  marginBottom: theme.spacing.sm,
                }}
              >
                {kind === 'liability' ? '待还欠款（元）' : '初始余额（元）'}
              </Text>
              <TextInput
                accessibilityLabel={kind === 'liability' ? '待还欠款' : '初始余额'}
                value={initialInput}
                onChangeText={setInitialInput}
                keyboardType="decimal-pad"
                placeholder="0.00"
                placeholderTextColor={theme.colors.textMuted}
                style={[
                  styles.input,
                  {
                    backgroundColor: theme.colors.surfaceRaised,
                    borderColor: theme.colors.border,
                    color: theme.colors.text,
                    borderRadius: theme.radius.md,
                    fontSize: theme.fontSize.base,
                    fontVariant: ['tabular-nums'],
                  },
                ]}
              />
              {kind === 'liability' ? (
                <Text
                  style={{
                    color: theme.colors.textMuted,
                    fontSize: theme.fontSize.xs,
                    marginTop: theme.spacing.xs,
                  }}
                >
                  填正数（如 500），无欠款填 0
                </Text>
              ) : null}
            </View>
          ) : null}

          {/* 4 列等宽规整图标选择 */}
          <View style={{ marginTop: theme.spacing.xl }}>
            <Text
              style={{
                color: theme.colors.textSecondary,
                fontSize: theme.fontSize.sm,
                fontWeight: theme.fontWeight.semibold,
                marginBottom: theme.spacing.sm,
              }}
            >
              图标
            </Text>
            <View style={{ gap: theme.spacing.sm }}>
              {iconRows.map((row, rowIdx) => (
                <View key={rowIdx} style={styles.iconRow}>
                  {row.map((iconName) => {
                    const selected = icon === iconName;
                    return (
                      <Pressable
                        key={iconName}
                        accessibilityRole="button"
                        accessibilityState={{ selected }}
                        onPress={() => setIcon(iconName)}
                        style={[
                          styles.iconOption,
                          {
                            backgroundColor: selected
                              ? theme.colors.actionSubtle
                              : theme.colors.surfaceRaised,
                            borderColor: selected ? theme.colors.action : theme.colors.border,
                            borderWidth: selected
                              ? theme.borderWidth.focus
                              : theme.borderWidth.hairline,
                            borderRadius: theme.radius.md,
                          },
                        ]}
                      >
                        <AppIcon
                          name={iconName}
                          size={22}
                          color={
                            selected ? theme.colors.actionTextOnSubtle : theme.colors.textSecondary
                          }
                        />
                      </Pressable>
                    );
                  })}
                </View>
              ))}
            </View>
          </View>

          {/* 计入净资产开关 */}
          <View
            style={[
              styles.switchCard,
              {
                backgroundColor: theme.colors.surfaceRaised,
                borderRadius: theme.radius.md,
                paddingHorizontal: theme.spacing.lg,
                paddingVertical: theme.spacing.md,
                marginTop: theme.spacing.xl,
              },
            ]}
          >
            <Text
              style={{
                flex: 1,
                color: theme.colors.text,
                fontSize: theme.fontSize.base,
                fontWeight: theme.fontWeight.semibold,
              }}
            >
              计入净资产
            </Text>
            <Switch
              value={includeInNetWorth}
              onValueChange={setIncludeInNetWorth}
              trackColor={{ false: theme.colors.borderStrong, true: theme.colors.action }}
            />
          </View>

          {/* 备注 */}
          <View style={{ marginTop: theme.spacing.xl }}>
            <Text
              style={{
                color: theme.colors.textSecondary,
                fontSize: theme.fontSize.sm,
                fontWeight: theme.fontWeight.semibold,
                marginBottom: theme.spacing.sm,
              }}
            >
              备注
            </Text>
            <TextInput
              accessibilityLabel="备注"
              value={note}
              onChangeText={setNote}
              placeholder="尾号 8821"
              placeholderTextColor={theme.colors.textMuted}
              maxLength={80}
              style={[
                styles.input,
                {
                  backgroundColor: theme.colors.surfaceRaised,
                  borderColor: theme.colors.border,
                  color: theme.colors.text,
                  borderRadius: theme.radius.md,
                  fontSize: theme.fontSize.base,
                },
              ]}
            />
          </View>

          {formError ? (
            <View
              style={[
                styles.errorBanner,
                {
                  backgroundColor: theme.colors.expenseSubtle,
                  borderLeftColor: theme.colors.expense,
                  borderRadius: theme.radius.sm,
                  marginTop: theme.spacing.lg,
                },
              ]}
            >
              <Text style={{ color: theme.colors.expenseTextOnSubtle, fontSize: theme.fontSize.sm }}>
                {formError}
              </Text>
            </View>
          ) : null}

          <Button
            label="保存"
            onPress={() => void handleSave()}
            loading={saving}
            style={{ marginTop: theme.spacing.xl }}
          />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeScreen>
  );
}

const styles = StyleSheet.create({
  wrapRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  tagChip: {
    minHeight: 42,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
  },
  kindRow: {
    flexDirection: 'row',
    gap: 12,
  },
  kindBtn: {
    flex: 1,
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  input: {
    minHeight: 48,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  iconRow: {
    flexDirection: 'row',
    gap: 8,
  },
  iconOption: {
    flex: 1,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  switchCard: {
    minHeight: 54,
    flexDirection: 'row',
    alignItems: 'center',
  },
  errorBanner: {
    borderLeftWidth: 4,
    padding: 12,
  },
});
