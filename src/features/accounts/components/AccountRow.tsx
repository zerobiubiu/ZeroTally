/**
 * 约束简报（Workflow B）：
 * - 信息层级：主（账户名 + 右对齐余额 16px/600）、次（账户类型 + 余额状态标签 12px/textMuted）
 * - 负债账户以「待还欠款」+ 正数金额展示，避免负号误解
 */
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { AppIcon } from '../../../shared/ui/AppIcon';
import { useTheme } from '../../../theme/theme-context';
import { maskSensitiveAmount } from '../../security/rules';
import { useSecurity } from '../../security/security-context';
import { describeAccountBalance, getAccountCategoryMeta } from '../rules';
import type { Account } from '../types';

interface AccountRowProps {
  account: Account;
  onPress: (account: Account) => void;
  showDivider?: boolean;
}

export function AccountRow({
  account,
  onPress,
  showDivider = false,
}: AccountRowProps): React.JSX.Element {
  const { theme } = useTheme();
  const { amountsHidden } = useSecurity();
  const categoryMeta = getAccountCategoryMeta(account.category);
  const balanceInfo = describeAccountBalance(account);

  const metaParts = [categoryMeta.label];
  if (!account.includeInTotalAssets && !account.includeInNetWorth) {
    metaParts.push('不计入统计');
  } else if (!account.includeInNetWorth) {
    metaParts.push('不计入净资产');
  } else if (!account.includeInTotalAssets) {
    metaParts.push('不计入总资产');
  }
  if (!account.isSelectable && !account.isArchived) {
    metaParts.push('不可选');
  }
  if (account.isArchived) {
    metaParts.push('已归档');
  }

  const iconBg =
    account.kind === 'liability' ? theme.colors.warningSubtle : theme.colors.actionSubtle;
  const iconColor =
    account.kind === 'liability'
      ? theme.colors.warningTextOnSubtle
      : theme.colors.actionTextOnSubtle;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${account.name}，${balanceInfo.caption} ${balanceInfo.amountText}`}
      onPress={() => onPress(account)}
      style={({ pressed }) => [
        styles.row,
        {
          paddingHorizontal: theme.spacing.lg,
          paddingVertical: theme.spacing.md,
          borderBottomColor: theme.colors.border,
          borderBottomWidth: showDivider ? theme.borderWidth.hairline : 0,
          opacity: account.isArchived ? 0.72 : 1,
        },
        pressed && { opacity: theme.opacity.pressed },
      ]}
    >
      <View
        style={[
          styles.iconBadge,
          {
            backgroundColor: iconBg,
            borderRadius: theme.radius.md,
          },
        ]}
      >
        <AppIcon name={account.icon} size={20} color={iconColor} />
      </View>

      <View style={styles.content}>
        <Text
          numberOfLines={1}
          style={{
            color: theme.colors.text,
            fontSize: theme.fontSize.base,
            fontWeight: theme.fontWeight.semibold,
          }}
        >
          {account.name}
        </Text>
        <Text
          numberOfLines={1}
          style={{
            color: theme.colors.textMuted,
            fontSize: theme.fontSize.xs,
            marginTop: theme.spacing.xs,
          }}
        >
          {metaParts.join(' · ')}
        </Text>
      </View>

      <View style={styles.right}>
        <Text
          style={[
            styles.amount,
            {
              color: balanceInfo.isDebt ? theme.colors.expense : theme.colors.text,
              fontSize: theme.fontSize.base,
              fontWeight: theme.fontWeight.semibold,
            },
          ]}
        >
          {maskSensitiveAmount(balanceInfo.amountText, amountsHidden)}
        </Text>
        <Text
          style={{
            color: theme.colors.textMuted,
            fontSize: theme.fontSize.xs,
            marginTop: theme.spacing.xs,
            textAlign: 'right',
          }}
        >
          {balanceInfo.caption}
        </Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    minHeight: 64,
    flexDirection: 'row',
    alignItems: 'center',
  },
  iconBadge: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  content: {
    flex: 1,
    marginRight: 12,
  },
  right: {
    alignItems: 'flex-end',
  },
  amount: {
    fontVariant: ['tabular-nums'],
  },
});
