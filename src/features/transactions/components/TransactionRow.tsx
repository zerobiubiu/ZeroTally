/**
 * 约束简报（Workflow B）：
 * - 信息层级：主（分类名/转账方向 + 右对齐带符号金额 16px/600）、次（账户与备注 12px/textMuted）
 * - 语义双重编码：颜色 + 正负号前缀（-¥ / +¥ / 转账）
 */
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { formatTransactionAmount } from '../../../shared/money/money';
import { AppIcon } from '../../../shared/ui/AppIcon';
import { useTheme } from '../../../theme/theme-context';
import type { TransactionListItem } from '../types';

interface TransactionRowProps {
  item: TransactionListItem;
  onPress: (item: TransactionListItem) => void;
  showDivider?: boolean;
  /** 若在单账户详情页展示，可标明相对该账户的转入/转出语义 */
  perspectiveAccountId?: string;
}

export function TransactionRow({
  item,
  onPress,
  showDivider = false,
  perspectiveAccountId,
}: TransactionRowProps): React.JSX.Element {
  const { theme } = useTheme();

  const isTransfer = item.type === 'transfer';
  const title = isTransfer
    ? `${item.accountName} → ${item.toAccountName ?? '未知账户'}`
    : (item.categoryName ?? '未分类');

  const subtitleParts: string[] = [];
  if (isTransfer) {
    if (perspectiveAccountId) {
      subtitleParts.push(item.accountId === perspectiveAccountId ? '转出' : '转入');
    } else {
      subtitleParts.push('账户转账');
    }
  } else {
    subtitleParts.push(item.accountName);
  }
  if (item.note) {
    subtitleParts.push(item.note);
  }

  let amountColor = theme.colors.expense;
  let amountText = formatTransactionAmount(item.type, item.amountCents);
  let badgeBg = theme.colors.expenseSubtle;
  let badgeIconColor = theme.colors.expenseTextOnSubtle;
  let iconName = item.categoryIcon ?? 'pricetag-outline';

  if (item.type === 'income') {
    amountColor = theme.colors.income;
    badgeBg = theme.colors.incomeSubtle;
    badgeIconColor = theme.colors.incomeTextOnSubtle;
  } else if (isTransfer) {
    amountColor = theme.colors.transfer;
    badgeBg = theme.colors.transferSubtle;
    badgeIconColor = theme.colors.transferTextOnSubtle;
    iconName = 'swap-horizontal-outline';
    if (perspectiveAccountId) {
      const isOutgoing = item.accountId === perspectiveAccountId;
      amountText = formatTransactionAmount(isOutgoing ? 'expense' : 'income', item.amountCents);
    }
  }

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${title}，${amountText}${item.note ? `，备注 ${item.note}` : ''}`}
      onPress={() => onPress(item)}
      style={({ pressed }) => [
        styles.row,
        {
          paddingHorizontal: theme.spacing.lg,
          paddingVertical: theme.spacing.md,
          borderBottomColor: theme.colors.border,
          borderBottomWidth: showDivider ? theme.borderWidth.hairline : 0,
        },
        pressed && { opacity: theme.opacity.pressed },
      ]}
    >
      <View
        style={[
          styles.iconBadge,
          {
            backgroundColor: badgeBg,
            borderRadius: theme.radius.full,
          },
        ]}
      >
        <AppIcon name={iconName} size={20} color={badgeIconColor} />
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
          {title}
        </Text>
        <Text
          numberOfLines={1}
          style={{
            color: theme.colors.textMuted,
            fontSize: theme.fontSize.xs,
            marginTop: theme.spacing.xs,
          }}
        >
          {subtitleParts.join(' · ')}
        </Text>
      </View>

      <Text
        style={[
          styles.amount,
          {
            color: amountColor,
            fontSize: theme.fontSize.base,
            fontWeight: theme.fontWeight.semibold,
          },
        ]}
      >
        {amountText}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    minHeight: 60,
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
  amount: {
    textAlign: 'right',
    fontVariant: ['tabular-nums'],
  },
});
