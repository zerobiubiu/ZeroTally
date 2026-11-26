/**
 * 约束简报（Workflow B）：
 * - 信息层级：主（删除标题 + 右侧玫红「删除」主按钮）、次（待删账目预览摘要卡：分类/转账方向、带符号金额、账户与日期）、弱（关联退款连带提示与左侧「取消」）
 * - 复用范围：统一服务于明细左滑删除、账户详情左滑删除、详情浮窗删除与编辑页顶部删除
 */
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { formatDaySectionTitle } from '../../../shared/date/date';
import { formatCentsToYuan, formatTransactionAmount } from '../../../shared/money/money';
import { AppIcon } from '../../../shared/ui/AppIcon';
import { ConfirmDialog } from '../../../shared/ui/ConfirmDialog';
import { useTheme } from '../../../theme/theme-context';
import type { TransactionListItem } from '../types';

export interface DeleteTransactionDialogProps {
  item: TransactionListItem | null;
  loading?: boolean;
  error?: string | null;
  onCancel: () => void;
  onConfirm: () => void;
}

export function DeleteTransactionDialog({
  item,
  loading = false,
  error = null,
  onCancel,
  onConfirm,
}: DeleteTransactionDialogProps): React.JSX.Element | null {
  const { theme } = useTheme();

  if (!item) {
    return null;
  }

  const isTransfer = item.type === 'transfer';
  const isRefund = item.type === 'refund';
  const hasLinkedRefunds = item.type === 'expense' && item.refundedCents > 0;

  const categoryTitle = item.categoryParentName
    ? `${item.categoryParentName} · ${item.categoryName ?? ''}`
    : (item.categoryName ?? '未分类');

  const itemTitle = isTransfer
    ? `${item.accountName} → ${item.toAccountName ?? '未知账户'}`
    : isRefund
      ? `退款 · ${item.categoryName ?? '支出'}`
      : categoryTitle;

  const amountColor =
    item.type === 'expense'
      ? theme.colors.expense
      : item.type === 'income' || item.type === 'refund'
        ? theme.colors.income
        : theme.colors.transfer;

  const iconBg = isTransfer
    ? theme.colors.transferSubtle
    : isRefund
      ? theme.colors.warningSubtle
      : item.type === 'income'
        ? theme.colors.incomeSubtle
        : theme.colors.expenseSubtle;

  const iconColor = isTransfer
    ? theme.colors.transferTextOnSubtle
    : isRefund
      ? theme.colors.warningTextOnSubtle
      : item.type === 'income'
        ? theme.colors.incomeTextOnSubtle
        : theme.colors.expenseTextOnSubtle;

  const iconName = isTransfer
    ? 'swap-horizontal-outline'
    : isRefund
      ? 'return-down-back-outline'
      : (item.categoryIcon ?? 'ellipsis-horizontal-outline');

  const subtitleParts = [formatDaySectionTitle(item.occurredOn)];
  if (!isTransfer) {
    subtitleParts.push(item.accountName);
  }
  if (item.note) {
    subtitleParts.push(item.note);
  }

  const message = isRefund
    ? '删除后将从入账账户扣回对应金额，无法撤销。'
    : '删除后将自动回滚关联账户余额，无法撤销。';

  return (
    <ConfirmDialog
      visible
      title={isRefund ? '删除退款记录' : '删除账目记录'}
      message={message}
      icon="trash-outline"
      tone="destructive"
      confirmLabel="确认删除"
      cancelLabel="取消"
      loading={loading}
      error={error}
      onCancel={onCancel}
      onConfirm={onConfirm}
    >
      <View
        style={[
          styles.previewCard,
          {
            backgroundColor: theme.colors.surface,
            borderColor: theme.colors.border,
            borderWidth: theme.borderWidth.hairline,
            borderRadius: theme.radius.md,
            padding: theme.spacing.md,
          },
        ]}
      >
        <View
          style={[
            styles.iconCircle,
            { backgroundColor: iconBg, borderRadius: theme.radius.full },
          ]}
        >
          <AppIcon name={iconName} size={18} color={iconColor} />
        </View>

        <View style={styles.previewInfo}>
          <Text
            numberOfLines={1}
            style={{
              color: theme.colors.text,
              fontSize: theme.fontSize.sm,
              fontWeight: theme.fontWeight.semibold,
            }}
          >
            {itemTitle}
          </Text>
          <Text
            numberOfLines={1}
            style={{
              color: theme.colors.textMuted,
              fontSize: theme.fontSize.xs,
              marginTop: 2,
            }}
          >
            {subtitleParts.join(' · ')}
          </Text>
        </View>

        <Text
          numberOfLines={1}
          style={[
            styles.tabular,
            {
              color: amountColor,
              fontSize: theme.fontSize.base,
              fontWeight: theme.fontWeight.semibold,
            },
          ]}
        >
          {formatTransactionAmount(item.type, item.amountCents)}
        </Text>
      </View>

      {hasLinkedRefunds ? (
        <View
          style={[
            styles.refundWarning,
            {
              backgroundColor: theme.colors.warningSubtle,
              borderLeftColor: theme.colors.warning,
              borderRadius: theme.radius.sm,
              marginTop: theme.spacing.sm,
              paddingHorizontal: theme.spacing.sm,
              paddingVertical: theme.spacing.xs,
            },
          ]}
        >
          <AppIcon
            name="alert-circle-outline"
            size={15}
            color={theme.colors.warningTextOnSubtle}
          />
          <Text
            style={{
              color: theme.colors.warningTextOnSubtle,
              fontSize: theme.fontSize.xs,
              lineHeight: 17,
              marginLeft: theme.spacing.xs,
              flex: 1,
            }}
          >
            已关联退款 {formatCentsToYuan(item.refundedCents)}，将一并删除并回滚全部相关账户余额
          </Text>
        </View>
      ) : null}
    </ConfirmDialog>
  );
}

const styles = StyleSheet.create({
  previewCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  iconCircle: {
    width: 34,
    height: 34,
    alignItems: 'center',
    justifyContent: 'center',
  },
  previewInfo: {
    flex: 1,
    minWidth: 0,
  },
  refundWarning: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    borderLeftWidth: 3,
  },
  tabular: {
    fontVariant: ['tabular-nums'],
  },
});
