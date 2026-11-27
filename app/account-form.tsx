/**
 * 约束简报（Workflow B / C）：
 * - 视觉层级：柔和浅灰画布（surfaceGrouped）配纯白无描边卡片（圆角 14px，内部控件 10px），卡片内部采用缩进极浅分割线（divider）
 * - 模块权重由重到轻：顶部轻权重横向账户类型条（纯文字无换行）→ 核心信息卡（左嵌 40×40 可换图标徽章 + 名称、大号等宽初始余额聚焦态、单行备注）→ 卡面信息平铺双列压缩卡（卡号每 4 位自动空格、银行/开户日期并排、开户行）→ 单行平铺三项可勾选属性胶囊 → 贴底主保存按钮（并与顶栏右侧轻量「保存」共用提交与禁用逻辑）
 * - 零业务破坏：完全沿用既有接口字段、默认值、类型驱动性质与校验规则；编辑态兼容全部字段回显与底部账户管理（归档 / 恢复 / 三重确认删除）
 */
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useRef, useState, type ComponentRef } from 'react';
import {
  ActivityIndicator,
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
import { AccountDeleteFlow } from '../src/features/accounts/components/AccountDeleteFlow';
import { AccountIconPickerSheet } from '../src/features/accounts/components/AccountIconPickerSheet';
import {
  formatCardNumberInput,
  truncateSignedDecimalsInput,
} from '../src/features/accounts/form-rules';
import {
  MAX_ACCOUNT_NAME_LENGTH,
  MAX_ACCOUNT_NOTE_LENGTH,
  MAX_BANK_TEXT_LENGTH,
  MAX_CARD_NUMBER_LENGTH,
  describeAccountBalance,
  kindForCategory,
  supportsCardInfo,
} from '../src/features/accounts/rules';
import {
  archiveAccount,
  createAccount,
  getAccountById,
  restoreAccount,
  updateAccount,
} from '../src/features/accounts/service';
import {
  ACCOUNT_CATEGORY_METAS,
  ACCOUNT_COLOR_OPTIONS,
  type Account,
  type AccountCategory,
} from '../src/features/accounts/types';
import { DatePickerSheet } from '../src/features/transactions/components/DatePickerSheet';
import {
  countAccountTransactions,
  deleteAccountWithTransactions,
} from '../src/features/transactions/service';
import { getTodayIsoDate } from '../src/shared/date/date';
import { hapticLight, hapticWarning } from '../src/shared/haptics/haptics';
import {
  CURRENCY_SYMBOL,
  parseSignedYuanToCents,
  parseYuanToCents,
  truncateExcessDecimalsInput,
} from '../src/shared/money/money';
import { AppIcon } from '../src/shared/ui/AppIcon';
import { Button } from '../src/shared/ui/Button';
import { ConfirmDialog } from '../src/shared/ui/ConfirmDialog';
import { SafeScreen } from '../src/shared/ui/SafeScreen';
import { useTheme } from '../src/theme/theme-context';

const CARD_RADIUS = 14;
const CONTROL_RADIUS = 10;

function firstParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function hexToRgba(hex: string, alpha: number): string {
  const clean = hex.replace('#', '');
  if (clean.length !== 6) {
    return `rgba(244, 245, 247, ${alpha})`;
  }
  const r = Number.parseInt(clean.slice(0, 2), 16);
  const g = Number.parseInt(clean.slice(2, 4), 16);
  const b = Number.parseInt(clean.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
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
  /** 初始留空以浅灰占位提示 0.00，直接键入即可免手删 */
  const [initialInput, setInitialInput] = useState('');
  const [amountFocused, setAmountFocused] = useState(false);
  const [icon, setIcon] = useState<string>('card-outline');
  const [color, setColor] = useState<string>(ACCOUNT_COLOR_OPTIONS[0] ?? '#0F766E');
  const [iconPickerOpen, setIconPickerOpen] = useState(false);
  const [includeInTotalAssets, setIncludeInTotalAssets] = useState(true);
  const [includeInNetWorth, setIncludeInNetWorth] = useState(true);
  const [isSelectable, setIsSelectable] = useState(true);
  const [cardNumber, setCardNumber] = useState('');
  const [bankName, setBankName] = useState('');
  const [bankBranch, setBankBranch] = useState('');
  const [openedOn, setOpenedOn] = useState('');
  const [datePickerOpen, setDatePickerOpen] = useState(false);
  const [note, setNote] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [loadedAccount, setLoadedAccount] = useState<Account | null>(null);
  const [txCount, setTxCount] = useState(0);
  const [archiveConfirmOpen, setArchiveConfirmOpen] = useState(false);
  const [archiveLoading, setArchiveLoading] = useState(false);
  const [archiveError, setArchiveError] = useState<string | null>(null);
  const [restoreLoading, setRestoreLoading] = useState(false);
  const [deleteFlowOpen, setDeleteFlowOpen] = useState(false);
  const [manageError, setManageError] = useState<string | null>(null);

  // 横向类型胶囊栏滚动对齐与右侧滑动渐隐线索
  const categoryScrollRef = useRef<ComponentRef<typeof ScrollView>>(null);
  const categoryLayoutsRef = useRef<Record<string, { x: number; width: number }>>({});
  const categoryViewportRef = useRef(0);
  const categoryContentRef = useRef(0);
  const categoryOffsetRef = useRef(0);
  const didInitialCategoryAlignRef = useRef(false);
  const [showRightCategoryFade, setShowRightCategoryFade] = useState(true);

  const isLiability = kindForCategory(category) === 'liability';
  const showCardInfo = supportsCardInfo(category);
  const saveDisabled = saving || (isEditing && !loadedAccount);

  const editBalanceInfo = useMemo(
    () => (loadedAccount ? describeAccountBalance(loadedAccount) : null),
    [loadedAccount]
  );

  const syncCategoryRightFade = useCallback(() => {
    const viewport = categoryViewportRef.current;
    const content = categoryContentRef.current;
    if (viewport <= 0 || content <= viewport + 4) {
      setShowRightCategoryFade(false);
      return;
    }
    setShowRightCategoryFade(categoryOffsetRef.current + viewport < content - 8);
  }, []);

  const scrollCategoryIntoView = useCallback((cat: AccountCategory, animated: boolean) => {
    const layout = categoryLayoutsRef.current[cat];
    const viewport = categoryViewportRef.current;
    const content = categoryContentRef.current;
    if (!layout || viewport <= 0 || content <= viewport) {
      return;
    }
    const maxOffset = Math.max(0, content - viewport);
    const targetOffset = Math.max(
      0,
      Math.min(maxOffset, layout.x - (viewport - layout.width) / 2)
    );
    categoryScrollRef.current?.scrollTo({ x: targetOffset, animated });
  }, []);

  useEffect(() => {
    if (!editId) {
      return;
    }
    let active = true;
    void (async () => {
      const [acc, count] = await Promise.all([
        getAccountById(db, editId),
        countAccountTransactions(db, editId),
      ]);
      if (active && acc) {
        setLoadedAccount(acc);
        setTxCount(count);
        setName(acc.name);
        setCategory(acc.category);
        setIcon(acc.icon);
        setColor(acc.color);
        setIncludeInTotalAssets(acc.includeInTotalAssets);
        setIncludeInNetWorth(acc.includeInNetWorth);
        setIsSelectable(acc.isSelectable);
        setCardNumber(formatCardNumberInput(acc.cardNumber));
        setBankName(acc.bankName);
        setBankBranch(acc.bankBranch);
        setOpenedOn(acc.openedOn);
        setNote(acc.note);
        scrollCategoryIntoView(acc.category, false);
      }
    })();
    return () => {
      active = false;
    };
  }, [db, editId, scrollCategoryIntoView]);

  const handleSelectCategory = (nextCat: AccountCategory) => {
    hapticLight();
    setCategory(nextCat);
    const meta = ACCOUNT_CATEGORY_METAS.find((m) => m.value === nextCat);
    if (meta && !isEditing) {
      setIcon(meta.defaultIcon);
      setColor(meta.defaultColor);
    }
    scrollCategoryIntoView(nextCat, true);
  };

  const handleSave = useCallback(async () => {
    if (saving || (isEditing && !loadedAccount)) {
      return;
    }
    setFormError(null);
    if (!name.trim()) {
      hapticWarning();
      setFormError('请输入账户名称');
      return;
    }

    Keyboard.dismiss();
    setSaving(true);
    try {
      const cardInfo = { cardNumber, bankName, bankBranch, openedOn };
      if (editId) {
        await updateAccount(db, editId, {
          name,
          category,
          includeInTotalAssets,
          includeInNetWorth,
          isSelectable,
          icon,
          color,
          note,
          ...cardInfo,
        });
      } else {
        const trimmedInitial = initialInput.trim();
        let initialBalanceCents = 0;
        if (trimmedInitial) {
          if (isLiability) {
            const debtCents = parseYuanToCents(trimmedInitial);
            if (debtCents === null) {
              hapticWarning();
              setFormError('待还欠款须为非负数字（最多两位小数）');
              setSaving(false);
              return;
            }
            initialBalanceCents = debtCents === 0 ? 0 : -debtCents;
          } else {
            const parsed = parseSignedYuanToCents(trimmedInitial);
            if (parsed === null) {
              hapticWarning();
              setFormError('初始余额格式无效（最多两位小数）');
              setSaving(false);
              return;
            }
            initialBalanceCents = parsed;
          }
        }

        await createAccount(db, {
          name,
          category,
          initialBalanceCents,
          includeInTotalAssets,
          includeInNetWorth,
          isSelectable,
          icon,
          color,
          note,
          ...cardInfo,
        });
      }

      notifyChange();
      router.back();
    } catch (err) {
      hapticWarning();
      setFormError(err instanceof Error ? err.message : '保存失败');
    } finally {
      setSaving(false);
    }
  }, [
    saving,
    isEditing,
    loadedAccount,
    name,
    cardNumber,
    bankName,
    bankBranch,
    openedOn,
    editId,
    db,
    category,
    includeInTotalAssets,
    includeInNetWorth,
    isSelectable,
    icon,
    color,
    note,
    initialInput,
    isLiability,
    notifyChange,
    router,
  ]);

  const handleArchiveConfirm = async () => {
    if (!loadedAccount || archiveLoading) {
      return;
    }
    setArchiveLoading(true);
    setArchiveError(null);
    try {
      await archiveAccount(db, loadedAccount.id);
      notifyChange();
      router.back();
    } catch (err) {
      setArchiveError(err instanceof Error ? err.message : '归档账户失败');
    } finally {
      setArchiveLoading(false);
    }
  };

  const handleRestore = async () => {
    if (!loadedAccount || restoreLoading) {
      return;
    }
    setRestoreLoading(true);
    setManageError(null);
    try {
      await restoreAccount(db, loadedAccount.id);
      notifyChange();
      router.back();
    } catch (err) {
      setManageError(err instanceof Error ? err.message : '恢复账户失败');
    } finally {
      setRestoreLoading(false);
    }
  };

  const handleDeletedExit = () => {
    setDeleteFlowOpen(false);
    // 越过「编辑」与刚被删账户的「详情」两层，分别精准退回资产页或已归档列表页
    if (router.canDismiss()) {
      router.dismiss(2);
    } else {
      router.replace('/(tabs)/assets');
    }
  };

  const rightFadeGradient = useMemo(
    () =>
      `linear-gradient(to right, ${hexToRgba(theme.colors.surfaceGrouped, 0)}, ${theme.colors.surfaceGrouped})`,
    [theme.colors.surfaceGrouped]
  );

  const checkableFlags = [
    {
      key: 'includeInTotalAssets',
      label: '计入总资产',
      checked: includeInTotalAssets,
      onToggle: () => {
        hapticLight();
        setIncludeInTotalAssets((prev) => !prev);
        if (formError) {
          setFormError(null);
        }
      },
    },
    {
      key: 'includeInNetWorth',
      label: '计入净资产',
      checked: includeInNetWorth,
      onToggle: () => {
        hapticLight();
        setIncludeInNetWorth((prev) => !prev);
        if (formError) {
          setFormError(null);
        }
      },
    },
    {
      key: 'isSelectable',
      label: '记账时可选',
      checked: isSelectable,
      onToggle: () => {
        hapticLight();
        setIsSelectable((prev) => !prev);
        if (formError) {
          setFormError(null);
        }
      },
    },
  ] as const;

  const cardSurfaceStyle = {
    backgroundColor: theme.colors.surfaceRaised,
    borderRadius: CARD_RADIUS,
  };

  return (
    <SafeScreen
      edges={['left', 'right']}
      style={{ backgroundColor: theme.colors.surfaceGrouped }}
    >
      <Stack.Screen
        options={{
          title: isEditing ? '编辑账户' : '新增账户',
          headerRight: () => (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="保存账户"
              accessibilityState={{ disabled: saveDisabled, busy: saving }}
              disabled={saveDisabled}
              hitSlop={10}
              onPress={() => void handleSave()}
              style={({ pressed }) => [
                styles.headerSaveBtn,
                saveDisabled && { opacity: theme.opacity.disabled },
                pressed && !saveDisabled && { opacity: theme.opacity.pressed },
              ]}
            >
              {saving ? (
                <ActivityIndicator size="small" color={theme.colors.action} />
              ) : (
                <Text
                  style={{
                    color: theme.colors.action,
                    fontSize: theme.fontSize.base,
                    fontWeight: theme.fontWeight.semibold,
                  }}
                >
                  保存
                </Text>
              )}
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
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.scrollContent}
        >
          {/* 1. 账户类型：轻权重单行横向纯文字胶囊栏，消除锯齿换行 */}
          <View>
            <Text
              style={[
                styles.sectionTitle,
                styles.sectionTitleIndented,
                { color: theme.colors.textMuted },
              ]}
            >
              账户类型
            </Text>
            <View style={styles.categoryStripWrap}>
              <ScrollView
                ref={categoryScrollRef}
                horizontal
                showsHorizontalScrollIndicator={false}
                keyboardShouldPersistTaps="handled"
                scrollEventThrottle={16}
                onLayout={(e) => {
                  categoryViewportRef.current = e.nativeEvent.layout.width;
                  syncCategoryRightFade();
                  scrollCategoryIntoView(category, false);
                }}
                onContentSizeChange={(w) => {
                  categoryContentRef.current = w;
                  syncCategoryRightFade();
                  scrollCategoryIntoView(category, false);
                }}
                onScroll={(e) => {
                  categoryOffsetRef.current = e.nativeEvent.contentOffset.x;
                  syncCategoryRightFade();
                }}
                contentContainerStyle={styles.categoryScrollContent}
              >
                {ACCOUNT_CATEGORY_METAS.map((meta) => {
                  const selected = category === meta.value;
                  return (
                    <Pressable
                      key={meta.value}
                      accessibilityRole="button"
                      accessibilityState={{ selected }}
                      onLayout={(e) => {
                        categoryLayoutsRef.current[meta.value] = {
                          x: e.nativeEvent.layout.x,
                          width: e.nativeEvent.layout.width,
                        };
                        if (
                          meta.value === category &&
                          (!isEditing || Boolean(loadedAccount)) &&
                          !didInitialCategoryAlignRef.current
                        ) {
                          didInitialCategoryAlignRef.current = true;
                          scrollCategoryIntoView(category, false);
                        }
                      }}
                      onPress={() => handleSelectCategory(meta.value)}
                      hitSlop={4}
                      style={({ pressed }) => [
                        styles.categoryPill,
                        {
                          backgroundColor: selected
                            ? theme.colors.actionSurface
                            : theme.colors.surfaceRaised,
                          borderRadius: CONTROL_RADIUS,
                        },
                        pressed && { opacity: theme.opacity.pressed },
                      ]}
                    >
                      <Text
                        numberOfLines={1}
                        style={{
                          color: selected
                            ? theme.colors.actionTextOnSubtle
                            : theme.colors.textSecondary,
                          fontSize: theme.fontSize.sm,
                          fontWeight: selected
                            ? theme.fontWeight.semibold
                            : theme.fontWeight.regular,
                        }}
                      >
                        {meta.label}
                      </Text>
                    </Pressable>
                  );
                })}
              </ScrollView>

              {showRightCategoryFade ? (
                <View
                  pointerEvents="none"
                  style={[styles.categoryRightFade, { backgroundImage: rightFadeGradient }]}
                />
              ) : null}
            </View>
          </View>

          {/* 2. 核心信息卡片（第一视觉焦点：内嵌图标 + 名称 + 大号初始余额 + 轻量备注） */}
          <View style={[styles.card, cardSurfaceStyle, styles.moduleGap]}>
            {/* 身份行：40×40 可切换图标徽章 + 名称输入 */}
            <View style={styles.identityRow}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="切换账户图标"
                hitSlop={6}
                onPress={() => {
                  Keyboard.dismiss();
                  hapticLight();
                  setIconPickerOpen(true);
                }}
                style={({ pressed }) => [
                  styles.iconBadge,
                  {
                    backgroundColor: theme.colors.actionSurface,
                    borderRadius: CONTROL_RADIUS,
                  },
                  pressed && { opacity: theme.opacity.pressed },
                ]}
              >
                <AppIcon name={icon} size={22} color={theme.colors.action} />
                <View
                  style={[
                    styles.iconBadgeCorner,
                    { backgroundColor: theme.colors.surfaceRaised },
                  ]}
                >
                  <AppIcon name="chevron-down" size={10} color={theme.colors.textSecondary} />
                </View>
              </Pressable>

              <TextInput
                accessibilityLabel="账户名称"
                value={name}
                onChangeText={(text) => {
                  setName(text);
                  if (formError) {
                    setFormError(null);
                  }
                }}
                placeholder={
                  isLiability
                    ? '输入账户名称，如招行信用卡'
                    : '输入账户名称，如招商储蓄卡'
                }
                placeholderTextColor={theme.colors.placeholder}
                maxLength={MAX_ACCOUNT_NAME_LENGTH}
                returnKeyType="next"
                style={[styles.nameInput, { color: theme.colors.text }]}
              />

              {name.length > 0 ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="清空账户名称"
                  hitSlop={8}
                  onPress={() => {
                    hapticLight();
                    setName('');
                  }}
                  style={({ pressed }) => [
                    styles.clearInlineBtn,
                    pressed && { opacity: theme.opacity.pressed },
                  ]}
                >
                  <AppIcon name="close-circle" size={16} color={theme.colors.placeholder} />
                </Pressable>
              ) : null}
            </View>

            <View style={[styles.insetDivider, { backgroundColor: theme.colors.divider }]} />

            {/* 核心金额锚点：新建态上下结构大号录入；编辑态紧凑只读回显当前余额 */}
            {!isEditing ? (
              <>
                <View style={styles.amountBlock}>
                  <Text
                    style={{
                      color: amountFocused ? theme.colors.action : theme.colors.textMuted,
                      fontSize: theme.fontSize.xs,
                      fontWeight: amountFocused
                        ? theme.fontWeight.semibold
                        : theme.fontWeight.regular,
                    }}
                  >
                    {isLiability ? '待还欠款' : '初始余额'}
                  </Text>
                  <View style={styles.amountInputRow}>
                    <Text
                      style={[
                        styles.currencyPrefix,
                        {
                          color: amountFocused
                            ? theme.colors.action
                            : initialInput.trim()
                              ? theme.colors.text
                              : theme.colors.placeholder,
                        },
                      ]}
                    >
                      {CURRENCY_SYMBOL}
                    </Text>
                    <TextInput
                      accessibilityLabel={isLiability ? '待还欠款' : '初始余额'}
                      value={initialInput}
                      onFocus={() => setAmountFocused(true)}
                      onBlur={() => setAmountFocused(false)}
                      onChangeText={(text) => {
                        setInitialInput(
                          isLiability
                            ? truncateExcessDecimalsInput(text)
                            : truncateSignedDecimalsInput(text)
                        );
                        if (formError) {
                          setFormError(null);
                        }
                      }}
                      inputMode="decimal"
                      keyboardType="decimal-pad"
                      placeholder="0.00"
                      placeholderTextColor={theme.colors.placeholder}
                      selectionColor={theme.colors.action}
                      style={[
                        styles.amountHeroInput,
                        styles.tabular,
                        { color: theme.colors.text },
                      ]}
                    />
                    {initialInput.length > 0 ? (
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel="清空金额"
                        hitSlop={8}
                        onPress={() => {
                          hapticLight();
                          setInitialInput('');
                        }}
                        style={({ pressed }) => [
                          styles.clearInlineBtn,
                          pressed && { opacity: theme.opacity.pressed },
                        ]}
                      >
                        <AppIcon name="close-circle" size={18} color={theme.colors.placeholder} />
                      </Pressable>
                    ) : null}
                  </View>
                </View>

                <View
                  style={[
                    styles.insetDivider,
                    amountFocused
                      ? { backgroundColor: theme.colors.action, height: 1.5 }
                      : { backgroundColor: theme.colors.divider },
                  ]}
                />
              </>
            ) : editBalanceInfo ? (
              <>
                <View style={styles.compactRow}>
                  <Text style={[styles.fixedLabel, { color: theme.colors.textSecondary }]}>
                    {editBalanceInfo.caption}
                  </Text>
                  <Text
                    style={[
                      styles.readonlyAmount,
                      styles.tabular,
                      {
                        color: editBalanceInfo.isDebt
                          ? theme.colors.expense
                          : theme.colors.textSecondary,
                      },
                    ]}
                  >
                    {editBalanceInfo.amountText}
                  </Text>
                </View>
                <View style={[styles.insetDivider, { backgroundColor: theme.colors.divider }]} />
              </>
            ) : null}

            {/* 轻量备注行 */}
            <View style={styles.compactRow}>
              <Text style={[styles.fixedLabel, { color: theme.colors.textSecondary }]}>备注</Text>
              <TextInput
                accessibilityLabel="备注"
                value={note}
                onChangeText={setNote}
                placeholder="选填，如尾号 8821"
                placeholderTextColor={theme.colors.placeholder}
                maxLength={MAX_ACCOUNT_NOTE_LENGTH}
                style={[styles.rowInput, { color: theme.colors.text }]}
              />
            </View>
          </View>

          {/* 3. 卡面信息卡片（中等权重：平铺不折叠，2 列并排压缩高度） */}
          {showCardInfo ? (
            <View style={styles.moduleGap}>
              <Text
                style={[
                  styles.sectionTitle,
                  styles.sectionTitleCard,
                  { color: theme.colors.textMuted },
                ]}
              >
                卡面信息 · 选填
              </Text>
              <View style={[styles.card, cardSurfaceStyle]}>
                {/* 第 1 行（整行）：卡号，每 4 位自动空格 + 等宽数字 */}
                <View style={styles.compactRow}>
                  <Text style={[styles.fixedLabel, { color: theme.colors.textSecondary }]}>
                    卡号
                  </Text>
                  <TextInput
                    accessibilityLabel="卡号"
                    value={cardNumber}
                    onChangeText={(text) => setCardNumber(formatCardNumberInput(text))}
                    keyboardType="number-pad"
                    placeholder="输入或粘贴银行卡号"
                    placeholderTextColor={theme.colors.placeholder}
                    maxLength={MAX_CARD_NUMBER_LENGTH}
                    style={[styles.rowInput, styles.tabular, { color: theme.colors.text }]}
                  />
                  {cardNumber.length > 0 ? (
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel="清空卡号"
                      hitSlop={8}
                      onPress={() => {
                        hapticLight();
                        setCardNumber('');
                      }}
                      style={({ pressed }) => [
                        styles.clearInlineBtn,
                        pressed && { opacity: theme.opacity.pressed },
                      ]}
                    >
                      <AppIcon name="close-circle" size={16} color={theme.colors.placeholder} />
                    </Pressable>
                  ) : null}
                </View>

                <View style={[styles.insetDivider, { backgroundColor: theme.colors.divider }]} />

                {/* 第 2 行（左右 2 列并排，中间细竖线分隔）：左列银行 + 右列开户日期 */}
                <View style={styles.twoColRow}>
                  <View style={styles.twoColLeft}>
                    <Text style={[styles.gridLabel, { color: theme.colors.textMuted }]}>银行</Text>
                    <TextInput
                      accessibilityLabel="银行"
                      value={bankName}
                      onChangeText={setBankName}
                      placeholder="输入所属银行"
                      placeholderTextColor={theme.colors.placeholder}
                      maxLength={MAX_BANK_TEXT_LENGTH}
                      style={[styles.gridInput, { color: theme.colors.text }]}
                    />
                  </View>

                  <View
                    style={[styles.verticalDivider, { backgroundColor: theme.colors.divider }]}
                  />

                  <View style={styles.twoColRight}>
                    <Text style={[styles.gridLabel, { color: theme.colors.textMuted }]}>
                      开户日期
                    </Text>
                    <View style={styles.gridDateRow}>
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel="选择开户日期"
                        onPress={() => {
                          Keyboard.dismiss();
                          hapticLight();
                          setDatePickerOpen(true);
                        }}
                        style={({ pressed }) => [
                          styles.gridDateTrigger,
                          pressed && { opacity: theme.opacity.pressed },
                        ]}
                      >
                        <Text
                          numberOfLines={1}
                          style={[
                            styles.tabular,
                            styles.gridDateText,
                            {
                              color: openedOn ? theme.colors.text : theme.colors.placeholder,
                            },
                          ]}
                        >
                          {openedOn || '选择日期'}
                        </Text>
                      </Pressable>

                      {openedOn ? (
                        <Pressable
                          accessibilityRole="button"
                          accessibilityLabel="清空开户日期"
                          hitSlop={10}
                          onPress={() => {
                            hapticLight();
                            setOpenedOn('');
                          }}
                          style={({ pressed }) => [
                            styles.gridDateAction,
                            pressed && { opacity: theme.opacity.pressed },
                          ]}
                        >
                          <AppIcon name="close-circle" size={16} color={theme.colors.placeholder} />
                        </Pressable>
                      ) : (
                        <Pressable
                          accessibilityRole="button"
                          accessibilityLabel="打开日期选择"
                          hitSlop={10}
                          onPress={() => {
                            Keyboard.dismiss();
                            hapticLight();
                            setDatePickerOpen(true);
                          }}
                          style={styles.gridDateAction}
                        >
                          <AppIcon
                            name="calendar-outline"
                            size={16}
                            color={theme.colors.placeholder}
                          />
                        </Pressable>
                      )}
                    </View>
                  </View>
                </View>

                <View style={[styles.insetDivider, { backgroundColor: theme.colors.divider }]} />

                {/* 第 3 行（整行）：开户行 */}
                <View style={styles.compactRow}>
                  <Text style={[styles.fixedLabel, { color: theme.colors.textSecondary }]}>
                    开户行
                  </Text>
                  <TextInput
                    accessibilityLabel="开户行"
                    value={bankBranch}
                    onChangeText={setBankBranch}
                    placeholder="选填，如科技园支行"
                    placeholderTextColor={theme.colors.placeholder}
                    maxLength={MAX_BANK_TEXT_LENGTH}
                    style={[styles.rowInput, { color: theme.colors.text }]}
                  />
                </View>
              </View>
            </View>
          ) : null}

          {/* 4. 统计与记账属性（低权重：由 3 行开关压缩为 1 行平铺可勾选胶囊） */}
          <View style={[styles.chipsRow, styles.moduleGap]}>
            {checkableFlags.map((flag) => (
              <Pressable
                key={flag.key}
                accessibilityRole="checkbox"
                accessibilityLabel={flag.label}
                accessibilityState={{ checked: flag.checked }}
                onPress={flag.onToggle}
                hitSlop={{ top: 5, bottom: 5 }}
                style={({ pressed }) => [
                  styles.checkChip,
                  {
                    backgroundColor: flag.checked
                      ? theme.colors.actionSurface
                      : theme.colors.chipInactive,
                    borderRadius: CONTROL_RADIUS,
                  },
                  pressed && { opacity: theme.opacity.pressed },
                ]}
              >
                {flag.checked ? (
                  <AppIcon name="checkmark" size={14} color={theme.colors.action} />
                ) : null}
                <Text
                  numberOfLines={1}
                  style={{
                    color: flag.checked
                      ? theme.colors.actionTextOnSubtle
                      : theme.colors.textMuted,
                    fontSize: theme.fontSize.xs,
                    fontWeight: flag.checked
                      ? theme.fontWeight.semibold
                      : theme.fontWeight.regular,
                  }}
                >
                  {flag.label}
                </Text>
              </Pressable>
            ))}
          </View>

          {/* 5. 账户管理（仅编辑态）：归档 / 恢复 / 删除 */}
          {isEditing && loadedAccount ? (
            <View style={styles.manageSection}>
              <Text
                style={[
                  styles.sectionTitle,
                  styles.sectionTitleCard,
                  { color: theme.colors.textMuted },
                ]}
              >
                账户管理
              </Text>
              <View style={[styles.card, cardSurfaceStyle]}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={loadedAccount.isArchived ? '恢复账户' : '归档账户'}
                  disabled={restoreLoading}
                  onPress={() => {
                    hapticLight();
                    if (loadedAccount.isArchived) {
                      void handleRestore();
                    } else {
                      setArchiveError(null);
                      setArchiveConfirmOpen(true);
                    }
                  }}
                  style={({ pressed }) => [
                    styles.manageRow,
                    pressed && { opacity: theme.opacity.pressed },
                  ]}
                >
                  <AppIcon
                    name={loadedAccount.isArchived ? 'refresh-outline' : 'archive-outline'}
                    size={19}
                    color={loadedAccount.isArchived ? theme.colors.action : theme.colors.warning}
                  />
                  <Text
                    style={{
                      flex: 1,
                      color: loadedAccount.isArchived ? theme.colors.action : theme.colors.text,
                      fontSize: theme.fontSize.sm,
                      fontWeight: theme.fontWeight.semibold,
                      marginLeft: 10,
                    }}
                  >
                    {loadedAccount.isArchived ? '恢复账户' : '归档账户'}
                  </Text>
                  <AppIcon name="chevron-forward" size={16} color={theme.colors.placeholder} />
                </Pressable>

                <View style={[styles.insetDivider, { backgroundColor: theme.colors.divider }]} />

                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="删除账户"
                  onPress={() => {
                    hapticLight();
                    setManageError(null);
                    setDeleteFlowOpen(true);
                  }}
                  style={({ pressed }) => [
                    styles.manageRow,
                    pressed && { opacity: theme.opacity.pressed },
                  ]}
                >
                  <AppIcon name="trash-outline" size={19} color={theme.colors.expense} />
                  <Text
                    style={{
                      flex: 1,
                      color: theme.colors.expense,
                      fontSize: theme.fontSize.sm,
                      fontWeight: theme.fontWeight.semibold,
                      marginLeft: 10,
                    }}
                  >
                    删除账户
                  </Text>
                  <AppIcon name="chevron-forward" size={16} color={theme.colors.placeholder} />
                </Pressable>
              </View>
              {manageError ? (
                <Text
                  style={{
                    color: theme.colors.expenseTextOnSubtle,
                    fontSize: theme.fontSize.xs,
                    marginTop: 6,
                    paddingHorizontal: 4,
                  }}
                >
                  {manageError}
                </Text>
              ) : null}
            </View>
          ) : null}
        </ScrollView>

        {/* 6. 固定底部安全区主操作栏（含常驻可见的校验错误条） */}
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
            <View
              style={[
                styles.errorBanner,
                {
                  backgroundColor: theme.colors.expenseSubtle,
                  borderLeftColor: theme.colors.expense,
                  borderRadius: CONTROL_RADIUS,
                },
              ]}
            >
              <AppIcon
                name="alert-circle-outline"
                size={16}
                color={theme.colors.expenseTextOnSubtle}
              />
              <Text
                style={{
                  color: theme.colors.expenseTextOnSubtle,
                  fontSize: theme.fontSize.xs,
                  fontWeight: theme.fontWeight.semibold,
                  marginLeft: 6,
                  flex: 1,
                }}
              >
                {formError}
              </Text>
            </View>
          ) : null}

          <Button
            label="保存"
            onPress={() => void handleSave()}
            loading={saving}
            disabled={saveDisabled}
            style={{ borderRadius: CONTROL_RADIUS }}
          />
        </View>
      </KeyboardAvoidingView>

      <AccountIconPickerSheet
        visible={iconPickerOpen}
        selectedIcon={icon}
        onSelect={setIcon}
        onClose={() => setIconPickerOpen(false)}
      />

      <DatePickerSheet
        visible={datePickerOpen}
        selectedDate={openedOn || getTodayIsoDate()}
        onSelect={(iso) => {
          setOpenedOn(iso);
          setDatePickerOpen(false);
        }}
        onClose={() => setDatePickerOpen(false)}
      />

      <ConfirmDialog
        visible={archiveConfirmOpen}
        title="归档账户"
        message="归档后不参与总资产 / 净资产统计，不出现在可选账户中，历史明细完整保留，可随时恢复。"
        icon="archive-outline"
        tone="warning"
        confirmLabel="确认归档"
        loading={archiveLoading}
        error={archiveError}
        onCancel={() => {
          if (!archiveLoading) {
            setArchiveConfirmOpen(false);
            setArchiveError(null);
          }
        }}
        onConfirm={() => void handleArchiveConfirm()}
      />

      {deleteFlowOpen && loadedAccount ? (
        <AccountDeleteFlow
          account={loadedAccount}
          transactionCount={txCount}
          onClose={() => setDeleteFlowOpen(false)}
          onArchive={async () => {
            await archiveAccount(db, loadedAccount.id);
            notifyChange();
          }}
          onDelete={async () => {
            await deleteAccountWithTransactions(db, loadedAccount.id);
            notifyChange();
          }}
          onArchived={() => {
            setDeleteFlowOpen(false);
            router.back();
          }}
          onDeleted={handleDeletedExit}
        />
      ) : null}
    </SafeScreen>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  headerSaveBtn: {
    minWidth: 44,
    minHeight: 36,
    paddingHorizontal: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scrollContent: {
    paddingTop: 12,
    paddingBottom: 24,
  },
  moduleGap: {
    marginTop: 14,
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 6,
  },
  sectionTitleIndented: {
    paddingHorizontal: 20,
  },
  sectionTitleCard: {
    paddingHorizontal: 20,
  },
  categoryStripWrap: {
    position: 'relative',
  },
  categoryScrollContent: {
    paddingHorizontal: 16,
    gap: 8,
  },
  categoryPill: {
    height: 36,
    paddingHorizontal: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  categoryRightFade: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    width: 24,
  },
  card: {
    marginHorizontal: 16,
    overflow: 'hidden',
  },
  identityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 12,
  },
  iconBadge: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  iconBadgeCorner: {
    position: 'absolute',
    right: -2,
    bottom: -2,
    width: 15,
    height: 15,
    borderRadius: 9999,
    alignItems: 'center',
    justifyContent: 'center',
  },
  nameInput: {
    flex: 1,
    minHeight: 40,
    paddingVertical: 4,
    fontSize: 16,
    fontWeight: '600',
    includeFontPadding: false,
  },
  clearInlineBtn: {
    paddingLeft: 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  amountBlock: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 12,
  },
  amountInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
  },
  currencyPrefix: {
    fontSize: 20,
    fontWeight: '600',
    marginRight: 6,
    includeFontPadding: false,
  },
  amountHeroInput: {
    flex: 1,
    fontSize: 30,
    fontWeight: '700',
    paddingVertical: 2,
    minHeight: 40,
    includeFontPadding: false,
  },
  readonlyAmount: {
    flex: 1,
    fontSize: 16,
    fontWeight: '600',
    textAlign: 'right',
  },
  compactRow: {
    minHeight: 44,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
  },
  fixedLabel: {
    width: 68,
    fontSize: 14,
  },
  rowInput: {
    flex: 1,
    minHeight: 44,
    paddingVertical: 8,
    fontSize: 15,
    includeFontPadding: false,
  },
  insetDivider: {
    height: 1,
    marginHorizontal: 16,
  },
  twoColRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  twoColLeft: {
    flex: 1,
    paddingVertical: 10,
    paddingLeft: 16,
    paddingRight: 12,
  },
  twoColRight: {
    flex: 1,
    paddingVertical: 10,
    paddingLeft: 12,
    paddingRight: 16,
  },
  verticalDivider: {
    width: 1,
    height: 30,
  },
  gridLabel: {
    fontSize: 12,
  },
  gridInput: {
    marginTop: 2,
    minHeight: 26,
    paddingVertical: 2,
    fontSize: 15,
    includeFontPadding: false,
  },
  gridDateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 2,
    minHeight: 26,
  },
  gridDateTrigger: {
    flex: 1,
    justifyContent: 'center',
    minHeight: 26,
  },
  gridDateText: {
    fontSize: 15,
  },
  gridDateAction: {
    paddingLeft: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chipsRow: {
    marginHorizontal: 16,
    flexDirection: 'row',
    gap: 8,
  },
  checkChip: {
    flex: 1,
    height: 38,
    paddingHorizontal: 6,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  manageSection: {
    marginTop: 18,
  },
  manageRow: {
    minHeight: 48,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
  },
  footerBar: {
    borderTopWidth: 1,
    paddingTop: 10,
    paddingHorizontal: 16,
    gap: 8,
  },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    borderLeftWidth: 3,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  tabular: {
    fontVariant: ['tabular-nums'],
  },
});
