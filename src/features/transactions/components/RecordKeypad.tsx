/**
 * 约束简报（Workflow B / C）：
 * - 信息层级：主（右侧大号等宽金额 + 键盘唯一实色主按钮「保存 / =」）、次（备注输入、横向直选账户卡片与固定日期选择按钮 + 数字键）、弱（当前分类标注、运算预览与功能键）
 * - 融合设计：收支账户采用左侧横向直接点选卡片（含实时余额、选中态 2px 主色边框），右侧并列固定日期触发块打开三层日历菜单；不增加额外行高
 * - 键盘隔离：金额、账户与日期均不唤起系统键盘，仅备注聚焦时唤起系统键盘并收起自制数字键盘
 */
import React, { useCallback, useEffect, useMemo, useRef, useState, type ComponentRef } from 'react';
import {
  ActivityIndicator,
  Keyboard,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { formatRelativeDateLabel } from '../../../shared/date/date';
import { hapticMedium, hapticSelection } from '../../../shared/haptics/haptics';
import { CURRENCY_SYMBOL, formatCentsToYuan } from '../../../shared/money/money';
import { AppIcon } from '../../../shared/ui/AppIcon';
import { useTheme } from '../../../theme/theme-context';
import { describeAccountBalance } from '../../accounts/rules';
import type { Account } from '../../accounts/types';
import {
  evaluateAmountExpression,
  hasPendingOperation,
  type AmountKey,
} from '../amount-expression';
import type { TransactionType } from '../types';

type RecordableTransactionType = Exclude<TransactionType, 'refund'>;

interface RecordKeypadProps {
  txType: RecordableTransactionType;
  amountExpr: string;
  note: string;
  onChangeNote: (text: string) => void;
  onPressKey: (key: AmountKey) => void;
  onLongPressBackspace: () => void;
  onClearAmount: () => void;
  onEvaluate: () => void;
  onSave: (continueRecording: boolean) => void;
  isEditing: boolean;
  saving: boolean;
  disabled?: boolean;
  /** 横向直选账户列表（仅支出/收入展示） */
  accounts: readonly Account[];
  selectedAccountId: string;
  onSelectAccount: (accountId: string) => void;
  /** 转账模式底部融合条摘要与一键互换回调 */
  transferRouteSummary?: {
    sourceName: string;
    targetName: string;
    onSwap: () => void;
  } | null;
  occurredOn: string;
  onPressDate: () => void;
  /** 当前选中分类的简短展示名（如「餐饮美食 · 午餐」），转账时为 null */
  selectedCategoryLabel: string | null;
  formError: string | null;
  /** 可选：覆写左侧文本输入框占位文案（默认「点此输入备注...」） */
  notePlaceholder?: string;
  /** 可选：覆写左侧文本输入框无障碍标签（默认「备注」） */
  noteAccessibilityLabel?: string;
  /** 可选：覆写左侧文本输入框图标（默认 create-outline） */
  noteIconName?: string;
  /** 可选：覆写左侧文本输入框最大长度（默认 120） */
  noteMaxLength?: number;
  /** 可选：隐藏右侧日期选择按钮（用于无需日期的快捷模板编辑模式） */
  hideDateButton?: boolean;
  /** 可选：左下角始终显示「清空」而非「再记」 */
  forceClearSecondary?: boolean;
  /** 可选：是否自动添加底部安全区内边距（默认 true） */
  includeBottomInset?: boolean;
  /** 可选：覆写主保存按钮无障碍文案 */
  saveAccessibilityLabel?: string;
}

function hexToRgba(hex: string, alpha: number): string {
  const clean = hex.replace('#', '');
  if (clean.length !== 6) {
    return `rgba(255, 255, 255, ${alpha})`;
  }
  const r = Number.parseInt(clean.slice(0, 2), 16);
  const g = Number.parseInt(clean.slice(2, 4), 16);
  const b = Number.parseInt(clean.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/**
 * 构建横向账户滚动区边缘柔和渐变遮罩（使用同底色 RGBA 缓动色标，避免 transparent 导致的浅色发灰）
 */
function buildEdgeFadeGradient(
  surfaceHex: string,
  direction: 'to right' | 'to left'
): ViewStyle['backgroundImage'] {
  return [
    {
      type: 'linear-gradient',
      direction,
      colorStops: [
        { color: hexToRgba(surfaceHex, 0), positions: ['0%'] },
        { color: hexToRgba(surfaceHex, 0.34), positions: ['36%'] },
        { color: hexToRgba(surfaceHex, 0.84), positions: ['74%'] },
        { color: surfaceHex, positions: ['100%'] },
      ],
    },
  ];
}

export function RecordKeypad({
  txType,
  amountExpr,
  note,
  onChangeNote,
  onPressKey,
  onLongPressBackspace,
  onClearAmount,
  onEvaluate,
  onSave,
  isEditing,
  saving,
  disabled = false,
  accounts,
  selectedAccountId,
  onSelectAccount,
  transferRouteSummary,
  occurredOn,
  onPressDate,
  selectedCategoryLabel,
  formError,
  notePlaceholder = '点此输入备注...',
  noteAccessibilityLabel = '备注',
  noteIconName = 'create-outline',
  noteMaxLength = 120,
  hideDateButton = false,
  forceClearSecondary = false,
  includeBottomInset = true,
  saveAccessibilityLabel = '保存账目',
}: RecordKeypadProps): React.JSX.Element {
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  const noteInputRef = useRef<ComponentRef<typeof TextInput>>(null);
  const accountsScrollRef = useRef<ComponentRef<typeof ScrollView>>(null);
  const accountLayoutsRef = useRef<Record<string, { x: number; width: number }>>({});
  const scrollViewportWidthRef = useRef(0);
  const scrollContentWidthRef = useRef(0);
  const scrollOffsetXRef = useRef(0);
  const hasAutoAlignedRef = useRef(false);
  const [noteFocused, setNoteFocused] = useState(false);
  const [showLeftFade, setShowLeftFade] = useState(false);
  const [showRightFade, setShowRightFade] = useState(false);

  const leftEdgeFadeBg = useMemo(
    () => buildEdgeFadeGradient(theme.colors.surfaceRaised, 'to left'),
    [theme.colors.surfaceRaised]
  );
  const rightEdgeFadeBg = useMemo(
    () => buildEdgeFadeGradient(theme.colors.surfaceRaised, 'to right'),
    [theme.colors.surfaceRaised]
  );

  const syncEdgeFades = useCallback(() => {
    const viewport = scrollViewportWidthRef.current;
    const contentWidth = scrollContentWidthRef.current;
    const offset = scrollOffsetXRef.current;
    if (viewport <= 0 || contentWidth <= viewport + 2) {
      setShowLeftFade((prev) => (prev ? false : prev));
      setShowRightFade((prev) => (prev ? false : prev));
      return;
    }
    const nextLeft = offset > 4;
    const nextRight = contentWidth - viewport - offset > 4;
    setShowLeftFade((prev) => (prev === nextLeft ? prev : nextLeft));
    setShowRightFade((prev) => (prev === nextRight ? prev : nextRight));
  }, []);

  const ensureSelectedAccountVisible = useCallback((targetId: string, animated: boolean) => {
    const layout = accountLayoutsRef.current[targetId];
    const viewport = scrollViewportWidthRef.current;
    const contentWidth = scrollContentWidthRef.current;
    if (!targetId || !layout || viewport <= 0 || contentWidth <= 0) {
      return;
    }

    hasAutoAlignedRef.current = true;
    if (contentWidth <= viewport) {
      return;
    }

    const leftClearance = 28;
    const rightClearance = 42;
    const visibleLeft = scrollOffsetXRef.current + leftClearance;
    const visibleRight = scrollOffsetXRef.current + viewport - rightClearance;
    if (layout.x >= visibleLeft && layout.x + layout.width <= visibleRight) {
      return;
    }

    const maxOffset = Math.max(0, contentWidth - viewport);
    const targetOffset = Math.max(
      0,
      Math.min(maxOffset, layout.x - (viewport - layout.width) / 2)
    );
    accountsScrollRef.current?.scrollTo({ x: targetOffset, animated });
    if (!animated) {
      scrollOffsetXRef.current = targetOffset;
      syncEdgeFades();
    }
  }, [syncEdgeFades]);

  useEffect(() => {
    if (txType === 'transfer') {
      hasAutoAlignedRef.current = false;
      scrollOffsetXRef.current = 0;
      return;
    }
    if (selectedAccountId) {
      ensureSelectedAccountVisible(selectedAccountId, hasAutoAlignedRef.current);
    }
  }, [txType, selectedAccountId, ensureSelectedAccountVisible]);

  useEffect(() => {
    const sub = Keyboard.addListener('keyboardDidHide', () => {
      noteInputRef.current?.blur();
      setNoteFocused(false);
    });
    return () => {
      sub.remove();
    };
  }, []);

  const dismissSystemKeyboard = () => {
    if (noteFocused) {
      noteInputRef.current?.blur();
      Keyboard.dismiss();
      setNoteFocused(false);
    }
  };

  const pendingOp = hasPendingOperation(amountExpr);
  const previewCents = pendingOp ? evaluateAmountExpression(amountExpr) : null;
  const trailingOp = amountExpr.at(-1);

  const amountColor =
    txType === 'expense'
      ? theme.colors.expense
      : txType === 'income'
        ? theme.colors.income
        : theme.colors.transfer;

  const handleDigitKey = (key: AmountKey) => {
    hapticSelection();
    onPressKey(key);
  };

  const handlePrimaryAction = () => {
    if (disabled || saving) {
      return;
    }
    hapticSelection();
    if (pendingOp) {
      onEvaluate();
    } else {
      onSave(false);
    }
  };

  const showClearAsSecondary = isEditing || forceClearSecondary;

  const handleSecondaryBottomLeft = () => {
    if (saving) {
      return;
    }
    hapticSelection();
    if (showClearAsSecondary) {
      onClearAmount();
    } else if (!disabled) {
      onSave(true);
    }
  };

  const renderDigitKey = (digit: AmountKey, label = digit) => (
    <Pressable
      key={digit}
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={() => handleDigitKey(digit)}
      style={({ pressed }) => [
        styles.keyCap,
        theme.elevation.card,
        {
          backgroundColor: theme.colors.surfaceRaised,
          borderRadius: theme.radius.md,
        },
        pressed && { opacity: theme.opacity.pressed },
      ]}
    >
      <Text
        style={[
          styles.tabular,
          {
            color: theme.colors.text,
            fontSize: theme.fontSize.xl,
            fontWeight: theme.fontWeight.semibold,
          },
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );

  const renderOperatorKey = (op: '+' | '-') => {
    const active = trailingOp === op;
    return (
      <Pressable
        key={op}
        accessibilityRole="button"
        accessibilityLabel={op === '+' ? '加' : '减'}
        onPress={() => handleDigitKey(op)}
        style={({ pressed }) => [
          styles.keyCap,
          theme.elevation.card,
          {
            backgroundColor: active ? theme.colors.actionSubtle : theme.colors.surfaceRaised,
            borderRadius: theme.radius.md,
          },
          pressed && { opacity: theme.opacity.pressed },
        ]}
      >
        <Text
          style={{
            color: active ? theme.colors.actionTextOnSubtle : theme.colors.textSecondary,
            fontSize: theme.fontSize.xxl,
            fontWeight: theme.fontWeight.semibold,
          }}
        >
          {op}
        </Text>
      </Pressable>
    );
  };

  return (
    <View
      style={[
        styles.dock,
        {
          backgroundColor: theme.colors.surface,
          borderTopColor: theme.colors.border,
          borderTopWidth: theme.borderWidth.hairline,
        },
      ]}
    >
      {/* 校验提示条 */}
      {formError ? (
        <View
          style={[
            styles.errorStrip,
            {
              backgroundColor: theme.colors.expenseSubtle,
              borderLeftColor: theme.colors.expense,
              paddingHorizontal: theme.spacing.lg,
              paddingVertical: theme.spacing.sm,
            },
          ]}
        >
          <AppIcon
            name="alert-circle-outline"
            size={16}
            color={theme.colors.expenseTextOnSubtle}
          />
          <Text
            numberOfLines={1}
            style={{
              color: theme.colors.expenseTextOnSubtle,
              fontSize: theme.fontSize.xs,
              fontWeight: theme.fontWeight.semibold,
              marginLeft: theme.spacing.xs,
              flex: 1,
            }}
          >
            {formError}
          </Text>
        </View>
      ) : null}

      {/* 输入抬头区：左备注（系统键盘），右金额 + 运算预览/当前分类（自制键盘） */}
      <View
        style={[
          styles.inputBar,
          {
            backgroundColor: theme.colors.surfaceRaised,
            paddingHorizontal: theme.spacing.md,
            paddingTop: theme.spacing.sm,
            paddingBottom: theme.spacing.xs,
          },
        ]}
      >
        <View
          style={[
            styles.noteWrap,
            noteFocused && {
              backgroundColor: theme.colors.surface,
              borderRadius: theme.radius.sm,
              paddingHorizontal: theme.spacing.sm,
            },
          ]}
        >
          <AppIcon
            name={noteIconName}
            size={16}
            color={noteFocused ? theme.colors.action : theme.colors.textMuted}
          />
          <TextInput
            ref={noteInputRef}
            accessibilityLabel={noteAccessibilityLabel}
            value={note}
            onChangeText={onChangeNote}
            onFocus={() => setNoteFocused(true)}
            onBlur={() => setNoteFocused(false)}
            onSubmitEditing={dismissSystemKeyboard}
            returnKeyType="done"
            placeholder={notePlaceholder}
            placeholderTextColor={theme.colors.textMuted}
            maxLength={noteMaxLength}
            style={[
              styles.noteInput,
              {
                color: theme.colors.text,
                fontSize: theme.fontSize.sm,
                marginLeft: theme.spacing.xs,
              },
            ]}
          />
          {noteFocused ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="收起文字键盘"
              onPress={dismissSystemKeyboard}
              hitSlop={8}
              style={{ paddingLeft: theme.spacing.sm }}
            >
              <Text
                style={{
                  color: theme.colors.action,
                  fontSize: theme.fontSize.sm,
                  fontWeight: theme.fontWeight.semibold,
                }}
              >
                完成
              </Text>
            </Pressable>
          ) : null}
        </View>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`金额 ${amountExpr || '0.00'}`}
          onPress={dismissSystemKeyboard}
          style={styles.amountDisplay}
        >
          <View style={styles.amountLine}>
            <Text
              style={{
                color: amountExpr ? amountColor : theme.colors.textMuted,
                fontSize: theme.fontSize.lg,
                fontWeight: theme.fontWeight.semibold,
                marginRight: 2,
              }}
            >
              {CURRENCY_SYMBOL}
            </Text>
            <Text
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={0.55}
              style={[
                styles.tabular,
                styles.amountValue,
                {
                  color: amountExpr ? amountColor : theme.colors.textMuted,
                  fontSize: theme.fontSize.xxl,
                  fontWeight: theme.fontWeight.semibold,
                },
              ]}
            >
              {amountExpr || '0.00'}
            </Text>
          </View>
          {pendingOp && previewCents !== null ? (
            <Text
              numberOfLines={1}
              style={[
                styles.tabular,
                {
                  color: previewCents > 0 ? theme.colors.textMuted : theme.colors.expense,
                  fontSize: theme.fontSize.xs,
                },
              ]}
            >
              = {formatCentsToYuan(previewCents)}
            </Text>
          ) : txType !== 'transfer' && selectedCategoryLabel ? (
            <Text
              numberOfLines={1}
              style={{
                color: theme.colors.textMuted,
                fontSize: theme.fontSize.xs,
              }}
            >
              {selectedCategoryLabel}
            </Text>
          ) : null}
        </Pressable>
      </View>

      {/* 融合条：左侧横向直选账户卡片（支出/收入）+ 可选右侧固定日期选择按钮 */}
      <View
        style={[
          styles.selectorStrip,
          {
            backgroundColor: theme.colors.surfaceRaised,
            paddingRight: hideDateButton ? 0 : theme.spacing.md,
            paddingBottom: theme.spacing.sm,
            paddingTop: theme.spacing.xs,
            borderBottomColor: theme.colors.border,
            borderBottomWidth: noteFocused ? 0 : theme.borderWidth.hairline,
          },
        ]}
      >
        {txType !== 'transfer' ? (
          <View style={styles.accountsScrollWrap}>
            <ScrollView
              ref={accountsScrollRef}
              horizontal
              showsHorizontalScrollIndicator={false}
              keyboardShouldPersistTaps="always"
              scrollEventThrottle={16}
              onScroll={(e) => {
                scrollOffsetXRef.current = e.nativeEvent.contentOffset.x;
                syncEdgeFades();
              }}
              onLayout={(e) => {
                scrollViewportWidthRef.current = e.nativeEvent.layout.width;
                syncEdgeFades();
                if (!hasAutoAlignedRef.current && selectedAccountId) {
                  ensureSelectedAccountVisible(selectedAccountId, false);
                }
              }}
              onContentSizeChange={(contentWidth) => {
                scrollContentWidthRef.current = contentWidth;
                syncEdgeFades();
                if (!hasAutoAlignedRef.current && selectedAccountId) {
                  ensureSelectedAccountVisible(selectedAccountId, false);
                }
              }}
              style={styles.accountsScroll}
              contentContainerStyle={[
                styles.accountsRow,
                {
                  paddingLeft: theme.spacing.md,
                  paddingRight: theme.spacing.md,
                  gap: theme.spacing.sm,
                },
              ]}
            >
              {accounts.map((acc) => {
                const selected = acc.id === selectedAccountId;
                const bal = describeAccountBalance(acc);
                return (
                  <Pressable
                    key={acc.id}
                    accessibilityRole="button"
                    accessibilityLabel={`${acc.name}，${bal.caption} ${bal.amountText}`}
                    accessibilityState={{ selected }}
                    onLayout={(e) => {
                      accountLayoutsRef.current[acc.id] = {
                        x: e.nativeEvent.layout.x,
                        width: e.nativeEvent.layout.width,
                      };
                      if (acc.id === selectedAccountId && !hasAutoAlignedRef.current) {
                        ensureSelectedAccountVisible(selectedAccountId, false);
                      }
                    }}
                    onPress={() => {
                      dismissSystemKeyboard();
                      hapticSelection();
                      onSelectAccount(acc.id);
                    }}
                    style={({ pressed }) => [
                      styles.accountCard,
                      {
                        backgroundColor: selected
                          ? theme.colors.actionSubtle
                          : theme.colors.surface,
                        borderColor: selected ? theme.colors.action : theme.colors.border,
                        borderWidth: selected
                          ? theme.borderWidth.focus
                          : theme.borderWidth.hairline,
                        paddingHorizontal: selected ? 10 : 11,
                        paddingVertical: selected ? 4 : 5,
                        borderRadius: theme.radius.md,
                      },
                      pressed && { opacity: theme.opacity.pressed },
                    ]}
                  >
                    <Text
                      numberOfLines={1}
                      style={{
                        color: selected ? theme.colors.actionTextOnSubtle : theme.colors.text,
                        fontSize: theme.fontSize.xs,
                        fontWeight: theme.fontWeight.semibold,
                      }}
                    >
                      {acc.name}
                    </Text>
                    <Text
                      numberOfLines={1}
                      style={[
                        styles.tabular,
                        {
                          color: selected
                            ? theme.colors.actionTextOnSubtle
                            : theme.colors.textMuted,
                          fontSize: 11,
                          marginTop: 1,
                        },
                      ]}
                    >
                      {bal.amountText}
                    </Text>
                  </Pressable>
                );
              })}
            </ScrollView>

            {showLeftFade ? (
              <View
                pointerEvents="none"
                style={[styles.edgeFadeLeft, { backgroundImage: leftEdgeFadeBg }]}
              />
            ) : null}

            {showRightFade ? (
              <View
                pointerEvents="none"
                style={[styles.edgeFadeRight, { backgroundImage: rightEdgeFadeBg }]}
              />
            ) : null}
          </View>
        ) : transferRouteSummary ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`转账路线：${transferRouteSummary.sourceName} 到 ${transferRouteSummary.targetName}，点击互换`}
            onPress={() => {
              dismissSystemKeyboard();
              hapticSelection();
              transferRouteSummary.onSwap();
            }}
            style={({ pressed }) => [
              styles.transferRoutePill,
              {
                marginLeft: theme.spacing.md,
                marginRight: theme.spacing.sm,
                backgroundColor: theme.colors.surface,
                borderColor: theme.colors.border,
                borderWidth: theme.borderWidth.hairline,
                borderRadius: theme.radius.md,
                paddingHorizontal: theme.spacing.md,
              },
              pressed && { opacity: theme.opacity.pressed },
            ]}
          >
            <Text
              numberOfLines={1}
              style={{
                flexShrink: 1,
                color: theme.colors.text,
                fontSize: theme.fontSize.xs,
                fontWeight: theme.fontWeight.semibold,
              }}
            >
              {transferRouteSummary.sourceName}
            </Text>
            <AppIcon name="arrow-forward" size={14} color={theme.colors.transfer} />
            <Text
              numberOfLines={1}
              style={{
                flexShrink: 1,
                color: theme.colors.text,
                fontSize: theme.fontSize.xs,
                fontWeight: theme.fontWeight.semibold,
              }}
            >
              {transferRouteSummary.targetName}
            </Text>
            <View style={styles.transferSwapCue}>
              <AppIcon name="swap-horizontal" size={15} color={theme.colors.transfer} />
            </View>
          </Pressable>
        ) : (
          <View style={styles.transferFallbackSpacer} />
        )}

        {!hideDateButton ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`选择日期，当前 ${formatRelativeDateLabel(occurredOn)}`}
            onPress={() => {
              dismissSystemKeyboard();
              onPressDate();
            }}
            style={({ pressed }) => [
              styles.dateCard,
              {
                marginLeft: txType !== 'transfer' ? theme.spacing.xs : 0,
                backgroundColor: theme.colors.surface,
                borderColor: theme.colors.border,
                borderRadius: theme.radius.md,
              },
              pressed && { opacity: theme.opacity.pressed },
            ]}
          >
            <AppIcon name="calendar-outline" size={14} color={theme.colors.action} />
            <Text
              numberOfLines={1}
              style={{
                color: theme.colors.text,
                fontSize: theme.fontSize.xs,
                fontWeight: theme.fontWeight.semibold,
                marginTop: 2,
              }}
            >
              {formatRelativeDateLabel(occurredOn)}
            </Text>
          </Pressable>
        ) : null}
      </View>

      {/* 自制 4x4 数字计算键盘（仅在备注未聚焦时展示） */}
      {!noteFocused ? (
        <View
          style={{
            paddingHorizontal: theme.spacing.sm,
            paddingTop: theme.spacing.sm,
            paddingBottom: includeBottomInset ? Math.max(insets.bottom, theme.spacing.sm) : theme.spacing.sm,
            gap: theme.spacing.sm,
          }}
        >
          <View style={[styles.keyRow, { gap: theme.spacing.sm }]}>
            {renderDigitKey('1')}
            {renderDigitKey('2')}
            {renderDigitKey('3')}
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="退格，长按清空"
              onPress={() => handleDigitKey('backspace')}
              onLongPress={() => {
                hapticMedium();
                onLongPressBackspace();
              }}
              style={({ pressed }) => [
                styles.keyCap,
                theme.elevation.card,
                {
                  backgroundColor: theme.colors.surfaceRaised,
                  borderRadius: theme.radius.md,
                },
                pressed && { opacity: theme.opacity.pressed },
              ]}
            >
              <AppIcon name="backspace-outline" size={22} color={theme.colors.textSecondary} />
            </Pressable>
          </View>

          <View style={[styles.keyRow, { gap: theme.spacing.sm }]}>
            {renderDigitKey('4')}
            {renderDigitKey('5')}
            {renderDigitKey('6')}
            {renderOperatorKey('-')}
          </View>

          <View style={[styles.keyRow, { gap: theme.spacing.sm }]}>
            {renderDigitKey('7')}
            {renderDigitKey('8')}
            {renderDigitKey('9')}
            {renderOperatorKey('+')}
          </View>

          <View style={[styles.keyRow, { gap: theme.spacing.sm }]}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={showClearAsSecondary ? '清空金额' : '保存并再记一笔'}
              disabled={saving || (!showClearAsSecondary && disabled)}
              onPress={handleSecondaryBottomLeft}
              style={({ pressed }) => [
                styles.keyCap,
                theme.elevation.card,
                {
                  backgroundColor: theme.colors.surfaceRaised,
                  borderRadius: theme.radius.md,
                  opacity: saving || (!showClearAsSecondary && disabled) ? theme.opacity.disabled : 1,
                },
                pressed && { opacity: theme.opacity.pressed },
              ]}
            >
              <Text
                style={{
                  color: theme.colors.textSecondary,
                  fontSize: theme.fontSize.base,
                  fontWeight: theme.fontWeight.semibold,
                }}
              >
                {showClearAsSecondary ? '清空' : '再记'}
              </Text>
            </Pressable>

            {renderDigitKey('0')}
            {renderDigitKey('.', '.')}

            <Pressable
              accessibilityRole="button"
              accessibilityLabel={pendingOp ? '计算结果' : saveAccessibilityLabel}
              disabled={disabled || saving}
              onPress={handlePrimaryAction}
              style={({ pressed }) => [
                styles.keyCap,
                {
                  backgroundColor: theme.colors.action,
                  borderRadius: theme.radius.md,
                  opacity: disabled || saving ? theme.opacity.disabled : 1,
                },
                pressed && !disabled && !saving && { opacity: theme.opacity.pressed },
              ]}
            >
              {saving ? (
                <ActivityIndicator size="small" color={theme.colors.onAction} />
              ) : (
                <Text
                  style={{
                    color: theme.colors.onAction,
                    fontSize: pendingOp ? theme.fontSize.xxl : theme.fontSize.base,
                    fontWeight: theme.fontWeight.semibold,
                  }}
                >
                  {pendingOp ? '=' : '保存'}
                </Text>
              )}
            </Pressable>
          </View>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  dock: {},
  errorStrip: {
    flexDirection: 'row',
    alignItems: 'center',
    borderLeftWidth: 4,
  },
  inputBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  noteWrap: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 40,
  },
  noteInput: {
    flex: 1,
    paddingVertical: 6,
  },
  amountDisplay: {
    alignItems: 'flex-end',
    justifyContent: 'center',
    maxWidth: '52%',
    minHeight: 42,
  },
  amountLine: {
    flexDirection: 'row',
    alignItems: 'baseline',
  },
  amountValue: {
    textAlign: 'right',
  },
  selectorStrip: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  dateCard: {
    minHeight: 46,
    minWidth: 64,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  accountsScrollWrap: {
    flex: 1,
    minHeight: 46,
    justifyContent: 'center',
    position: 'relative',
  },
  accountsScroll: {
    width: '100%',
    flexGrow: 0,
  },
  transferFallbackSpacer: {
    flex: 1,
  },
  edgeFadeLeft: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: 24,
  },
  edgeFadeRight: {
    position: 'absolute',
    right: 0,
    top: 0,
    bottom: 0,
    width: 38,
  },
  transferRoutePill: {
    flex: 1,
    minHeight: 46,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  transferSwapCue: {
    marginLeft: 'auto',
    paddingLeft: 4,
  },
  accountsRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  accountCard: {
    minHeight: 46,
    minWidth: 88,
    maxWidth: 140,
    justifyContent: 'center',
  },
  keyRow: {
    flexDirection: 'row',
  },
  keyCap: {
    flex: 1,
    height: 50,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabular: {
    fontVariant: ['tabular-nums'],
  },
});
