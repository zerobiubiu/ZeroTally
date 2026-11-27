/**
 * 约束简报（Workflow B / C）：
 * - 信息层级：主（弹窗标题 + 账户名与等宽余额）、次（选中态勾选标记与账户图标）、弱（遮罩背景与关闭按钮）
 * - 交互形态：基于统一 BottomSheet，支持顶部抓手与标题栏跟手下拉收起，不可见时卸载 Modal
 */
import React, { useRef } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { AppIcon } from '../../../shared/ui/AppIcon';
import { BottomSheet, type BottomSheetHandle } from '../../../shared/ui/BottomSheet';
import { useTheme } from '../../../theme/theme-context';
import { describeAccountBalance } from '../../accounts/rules';
import type { Account } from '../../accounts/types';

interface AccountPickerSheetProps {
  visible: boolean;
  title: string;
  accounts: readonly Account[];
  selectedAccountId: string;
  /** 可选：标记对端账户（转账选择时提示将自动互换） */
  counterpartAccountId?: string;
  counterpartLabel?: string;
  onSelect: (accountId: string) => void;
  onClose: () => void;
}

export function AccountPickerSheet({
  visible,
  title,
  accounts,
  selectedAccountId,
  counterpartAccountId,
  counterpartLabel,
  onSelect,
  onClose,
}: AccountPickerSheetProps): React.JSX.Element | null {
  const { theme } = useTheme();
  const sheetRef = useRef<BottomSheetHandle>(null);

  return (
    <BottomSheet
      ref={sheetRef}
      visible={visible}
      onClose={onClose}
      title={title}
      backdropLabel="关闭账户选择"
      scrollable
      scrollMaxHeight={360}
      maxHeight="72%"
    >
        {accounts.map((acc, index) => {
          const selected = acc.id === selectedAccountId;
          const isCounterpart = counterpartAccountId === acc.id;
          const bal = describeAccountBalance(acc);

          return (
            <Pressable
              key={acc.id}
              accessibilityRole="button"
              accessibilityLabel={`${acc.name}，${bal.caption} ${bal.amountText}`}
              accessibilityState={{ selected }}
              onPress={() => {
                onSelect(acc.id);
                sheetRef.current?.dismiss();
              }}
              style={({ pressed }) => [
                styles.row,
                {
                  paddingHorizontal: theme.spacing.lg,
                  backgroundColor: selected ? theme.colors.actionSubtle : 'transparent',
                  borderBottomColor: theme.colors.border,
                  borderBottomWidth:
                    index < accounts.length - 1 ? theme.borderWidth.hairline : 0,
                },
                pressed && { opacity: theme.opacity.pressed },
              ]}
            >
              <View
                style={[
                  styles.iconWrap,
                  {
                    backgroundColor: selected ? theme.colors.action : theme.colors.surface,
                    borderRadius: theme.radius.full,
                  },
                ]}
              >
                <AppIcon
                  name={acc.icon}
                  size={18}
                  color={selected ? theme.colors.onAction : theme.colors.textSecondary}
                />
              </View>

              <View style={styles.rowText}>
                <View style={styles.nameRow}>
                  <Text
                    numberOfLines={1}
                    style={{
                      flexShrink: 1,
                      color: selected ? theme.colors.actionTextOnSubtle : theme.colors.text,
                      fontSize: theme.fontSize.base,
                      fontWeight: theme.fontWeight.semibold,
                    }}
                  >
                    {acc.name}
                  </Text>
                  {isCounterpart && counterpartLabel ? (
                    <Text
                      style={{
                        color: theme.colors.textMuted,
                        fontSize: theme.fontSize.xs,
                        marginLeft: theme.spacing.sm,
                      }}
                    >
                      {counterpartLabel}
                    </Text>
                  ) : null}
                </View>
                <Text
                  style={[
                    styles.tabular,
                    {
                      color: selected
                        ? theme.colors.actionTextOnSubtle
                        : theme.colors.textMuted,
                      fontSize: theme.fontSize.xs,
                      marginTop: 2,
                    },
                  ]}
                >
                  {bal.caption} {bal.amountText}
                </Text>
              </View>

              {selected ? <AppIcon name="checkmark" size={20} color={theme.colors.action} /> : null}
            </Pressable>
          );
        })}
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  row: {
    minHeight: 60,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
  },
  iconWrap: {
    width: 38,
    height: 38,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  rowText: {
    flex: 1,
    marginRight: 8,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
  },
  tabular: {
    fontVariant: ['tabular-nums'],
  },
});
