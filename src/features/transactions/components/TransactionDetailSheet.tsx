/**
 * 约束简报（Workflow B / C）：
 * - 信息层级：主（顶部交易金额 30px/600 + 底部唯一实色主按钮「修改」）、次（分类与类型标识、结构化详情字段卡、关联退款/原支出跳转、次级操作「退款 / 复制」）、弱（拖拽指示条、记录时间与破坏性操作「删除」）
 * - 交互形态：基于两段式 BottomSheet，默认半屏浮出，支持抓手/标题/金额上半区上拉（或点按抓手）展开至近全屏，下拉回半屏或直接关闭；底部操作栏在半屏与全屏间始终贴底稳定
 */
import React, { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useDatabase } from '../../../db/database-context';
import { formatDaySectionTitle } from '../../../shared/date/date';
import { formatCentsToYuan, formatTransactionAmount } from '../../../shared/money/money';
import { AppIcon } from '../../../shared/ui/AppIcon';
import { BottomSheet, type BottomSheetHandle } from '../../../shared/ui/BottomSheet';
import { useTheme } from '../../../theme/theme-context';
import { getTransactionById, listTransactionRefunds } from '../service';
import type { TransactionListItem, TransactionType } from '../types';

const TYPE_BADGE_LABEL: Record<TransactionType, string> = {
  expense: '支出',
  income: '收入',
  transfer: '转账',
  refund: '退款',
};

function formatLocalTimestamp(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return iso.slice(0, 16).replace('T', ' ');
  }
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  const hh = String(date.getHours()).padStart(2, '0');
  const mm = String(date.getMinutes()).padStart(2, '0');
  return `${y}-${m}-${d} ${hh}:${mm}`;
}

interface LinkedState {
  ownerId: string;
  refunds: TransactionListItem[];
  original: TransactionListItem | null;
}

interface TransactionDetailSheetProps {
  item: TransactionListItem | null;
  onClose: () => void;
  onSelectItem: (next: TransactionListItem) => void;
  onEdit: (item: TransactionListItem) => void;
  onRefund: (item: TransactionListItem) => void;
  onCopy: (item: TransactionListItem) => void;
  onDelete: (item: TransactionListItem) => void;
}

export function TransactionDetailSheet({
  item,
  onClose,
  onSelectItem,
  onEdit,
  onRefund,
  onCopy,
  onDelete,
}: TransactionDetailSheetProps): React.JSX.Element | null {
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  const { db, revision } = useDatabase();
  const sheetRef = useRef<BottomSheetHandle>(null);

  // 缓存最近一次非空条目，确保收起滑落动画期间界面内容保持完整不突兀消失
  const [cachedItem, setCachedItem] = useState<TransactionListItem | null>(item);
  if (item && item !== cachedItem) {
    setCachedItem(item);
  }

  const [linked, setLinked] = useState<LinkedState>({
    ownerId: '',
    refunds: [],
    original: null,
  });

  useEffect(() => {
    if (!item) {
      return;
    }
    let active = true;
    void (async () => {
      if (item.type === 'expense') {
        const refunds = await listTransactionRefunds(db, item.id);
        if (active) {
          setLinked({ ownerId: item.id, refunds, original: null });
        }
      } else if (item.type === 'refund' && item.refundOfId) {
        const original = await getTransactionById(db, item.refundOfId);
        if (active) {
          setLinked({ ownerId: item.id, refunds: [], original });
        }
      } else if (active) {
        setLinked({ ownerId: item.id, refunds: [], original: null });
      }
    })();
    return () => {
      active = false;
    };
  }, [db, item, revision]);

  const activeItem = item ?? cachedItem;
  if (!activeItem) {
    return null;
  }

  const refunds = linked.ownerId === activeItem.id ? linked.refunds : [];
  const originalTx = linked.ownerId === activeItem.id ? linked.original : null;

  const isTransfer = activeItem.type === 'transfer';
  const isRefund = activeItem.type === 'refund';
  const isExpense = activeItem.type === 'expense';
  const hasRefund = isExpense && activeItem.refundedCents > 0;
  const remainingRefundableCents = isExpense
    ? Math.max(0, activeItem.amountCents - activeItem.refundedCents)
    : 0;
  const overRefundedCents = isExpense
    ? Math.max(0, activeItem.refundedCents - activeItem.amountCents)
    : 0;
  const canRefund = isExpense;
  const canCopy = !isRefund;

  const categoryTitle = activeItem.categoryParentName
    ? `${activeItem.categoryParentName} · ${activeItem.categoryName ?? ''}`
    : (activeItem.categoryName ?? '未分类');

  const headerTitle = isTransfer
    ? `${activeItem.accountName} → ${activeItem.toAccountName ?? '未知账户'}`
    : isRefund
      ? `退款 · ${activeItem.categoryName ?? '支出'}`
      : categoryTitle;

  let amountColor = theme.colors.expense;
  let badgeBg = theme.colors.expenseSubtle;
  let badgeFg = theme.colors.expenseTextOnSubtle;
  let iconName = activeItem.categoryIcon ?? 'pricetag-outline';

  if (activeItem.type === 'income') {
    amountColor = theme.colors.income;
    badgeBg = theme.colors.incomeSubtle;
    badgeFg = theme.colors.incomeTextOnSubtle;
  } else if (isRefund) {
    amountColor = theme.colors.income;
    badgeBg = theme.colors.warningSubtle;
    badgeFg = theme.colors.warningTextOnSubtle;
    iconName = 'return-down-back-outline';
  } else if (isTransfer) {
    amountColor = theme.colors.transfer;
    badgeBg = theme.colors.transferSubtle;
    badgeFg = theme.colors.transferTextOnSubtle;
    iconName = 'swap-horizontal-outline';
  }

  const amountText = formatTransactionAmount(activeItem.type, activeItem.amountCents);

  return (
    <BottomSheet
      ref={sheetRef}
      visible={item !== null}
      onClose={onClose}
      backdropLabel="关闭账目详情"
      expandable
      collapsedRatio={0.56}
      scrollable
      includeBottomInset={false}
      contentContainerStyle={{
        paddingHorizontal: theme.spacing.lg,
        paddingTop: theme.spacing.sm,
        paddingBottom: theme.spacing.lg,
      }}
      header={
        <View>
          {/* 头部：图标 + 分类/方向 + 类型标签 + 关闭 */}
          <View
            style={[
              styles.header,
              {
                paddingHorizontal: theme.spacing.lg,
                paddingBottom: theme.spacing.md,
                borderBottomColor: theme.colors.border,
                borderBottomWidth: theme.borderWidth.hairline,
              },
            ]}
          >
            <View style={styles.headerLeft}>
              <View
                style={[
                  styles.iconBadge,
                  { backgroundColor: badgeBg, borderRadius: theme.radius.full },
                ]}
              >
                <AppIcon name={iconName} size={20} color={badgeFg} />
              </View>
              <View style={styles.headerTitleWrap}>
                <Text
                  numberOfLines={1}
                  style={{
                    color: theme.colors.text,
                    fontSize: theme.fontSize.lg,
                    fontWeight: theme.fontWeight.semibold,
                  }}
                >
                  {headerTitle}
                </Text>
                <View style={styles.headerSubRow}>
                  <View
                    style={[
                      styles.typeTag,
                      { backgroundColor: badgeBg, borderRadius: theme.radius.sm },
                    ]}
                  >
                    <Text
                      style={{
                        color: badgeFg,
                        fontSize: theme.fontSize.xs,
                        fontWeight: theme.fontWeight.semibold,
                      }}
                    >
                      {TYPE_BADGE_LABEL[activeItem.type]}
                    </Text>
                  </View>
                  {hasRefund ? (
                    <Text
                      style={[
                        styles.tabular,
                        {
                          color: theme.colors.warningTextOnSubtle,
                          fontSize: theme.fontSize.xs,
                          fontWeight: theme.fontWeight.semibold,
                          marginLeft: theme.spacing.sm,
                        },
                      ]}
                    >
                      {overRefundedCents > 0
                        ? '已退款'
                        : remainingRefundableCents === 0
                          ? '已全额退款'
                          : '部分已退'}
                    </Text>
                  ) : null}
                </View>
              </View>
            </View>

            <Pressable
              accessibilityRole="button"
              accessibilityLabel="关闭"
              onPress={() => sheetRef.current?.dismiss()}
              hitSlop={10}
              style={({ pressed }) => [
                styles.closeBtn,
                pressed && { opacity: theme.opacity.pressed },
              ]}
            >
              <AppIcon name="close" size={22} color={theme.colors.textMuted} />
            </Pressable>
          </View>

          {/* 金额主视觉常驻顶部拖拽热区，既稳定层级又提供宽大上下拖拽手感 */}
          <View
            style={[
              styles.amountHero,
              {
                paddingHorizontal: theme.spacing.lg,
                paddingTop: theme.spacing.md,
                paddingBottom: theme.spacing.sm,
              },
            ]}
          >
            <Text
              numberOfLines={1}
              adjustsFontSizeToFit
              style={[
                styles.tabular,
                {
                  color: amountColor,
                  fontSize: theme.fontSize.hero,
                  fontWeight: theme.fontWeight.semibold,
                },
              ]}
            >
              {amountText}
            </Text>

            {hasRefund ? (
              <View
                style={[
                  styles.refundSummaryPill,
                  {
                    backgroundColor: theme.colors.warningSubtle,
                    borderRadius: theme.radius.full,
                    marginTop: theme.spacing.xs,
                  },
                ]}
              >
                <Text
                  style={[
                    styles.tabular,
                    {
                      color: theme.colors.warningTextOnSubtle,
                      fontSize: theme.fontSize.xs,
                      fontWeight: theme.fontWeight.semibold,
                    },
                  ]}
                >
                  {overRefundedCents > 0
                    ? `已退 ${formatCentsToYuan(activeItem.refundedCents)} · 多退 ${formatCentsToYuan(overRefundedCents)}`
                    : `已退 ${formatCentsToYuan(activeItem.refundedCents)} · 实付 ${formatCentsToYuan(remainingRefundableCents)}`}
                </Text>
              </View>
            ) : null}
          </View>
        </View>
      }
      footer={
        <View
          style={[
            styles.footerBar,
            {
              borderTopColor: theme.colors.border,
              borderTopWidth: theme.borderWidth.hairline,
              paddingHorizontal: theme.spacing.lg,
              paddingTop: theme.spacing.md,
              paddingBottom: Math.max(insets.bottom, theme.spacing.lg),
              gap: theme.spacing.sm,
            },
          ]}
        >
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="修改账目"
            onPress={() => sheetRef.current?.dismiss(() => onEdit(activeItem))}
            style={({ pressed }) => [
              styles.footerAction,
              {
                backgroundColor: theme.colors.action,
                borderRadius: theme.radius.md,
              },
              pressed && { opacity: theme.opacity.pressed },
            ]}
          >
            <AppIcon name="create-outline" size={18} color={theme.colors.onAction} />
            <Text
              style={{
                color: theme.colors.onAction,
                fontSize: theme.fontSize.sm,
                fontWeight: theme.fontWeight.semibold,
                marginLeft: theme.spacing.xs,
              }}
            >
              修改
            </Text>
          </Pressable>

          {canRefund ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="记录退款"
              onPress={() => sheetRef.current?.dismiss(() => onRefund(activeItem))}
              style={({ pressed }) => [
                styles.footerAction,
                {
                  backgroundColor: theme.colors.warningSubtle,
                  borderRadius: theme.radius.md,
                },
                pressed && { opacity: theme.opacity.pressed },
              ]}
            >
              <AppIcon
                name="return-down-back-outline"
                size={18}
                color={theme.colors.warningTextOnSubtle}
              />
              <Text
                style={{
                  color: theme.colors.warningTextOnSubtle,
                  fontSize: theme.fontSize.sm,
                  fontWeight: theme.fontWeight.semibold,
                  marginLeft: theme.spacing.xs,
                }}
              >
                退款
              </Text>
            </Pressable>
          ) : null}

          {canCopy ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="复制再记"
              onPress={() => sheetRef.current?.dismiss(() => onCopy(activeItem))}
              style={({ pressed }) => [
                styles.footerAction,
                {
                  backgroundColor: theme.colors.surface,
                  borderColor: theme.colors.border,
                  borderWidth: theme.borderWidth.hairline,
                  borderRadius: theme.radius.md,
                },
                pressed && { opacity: theme.opacity.pressed },
              ]}
            >
              <AppIcon name="copy-outline" size={18} color={theme.colors.textSecondary} />
              <Text
                style={{
                  color: theme.colors.textSecondary,
                  fontSize: theme.fontSize.sm,
                  fontWeight: theme.fontWeight.semibold,
                  marginLeft: theme.spacing.xs,
                }}
              >
                复制
              </Text>
            </Pressable>
          ) : null}

          <Pressable
            accessibilityRole="button"
            accessibilityLabel="删除账目"
            onPress={() => sheetRef.current?.dismiss(() => onDelete(activeItem))}
            style={({ pressed }) => [
              styles.footerAction,
              {
                backgroundColor: theme.colors.expenseSubtle,
                borderRadius: theme.radius.md,
              },
              pressed && { opacity: theme.opacity.pressed },
            ]}
          >
            <AppIcon name="trash-outline" size={18} color={theme.colors.expenseTextOnSubtle} />
            <Text
              style={{
                color: theme.colors.expenseTextOnSubtle,
                fontSize: theme.fontSize.sm,
                fontWeight: theme.fontWeight.semibold,
                marginLeft: theme.spacing.xs,
              }}
            >
              删除
            </Text>
          </Pressable>
        </View>
      }
    >
          {/* 结构化字段卡片 */}
          <View
            style={[
              styles.metaCard,
              {
                backgroundColor: theme.colors.surface,
                borderRadius: theme.radius.md,
                paddingHorizontal: theme.spacing.md,
              },
            ]}
          >
            {isTransfer ? (
              <>
                <MetaRow label="转出账户" value={activeItem.accountName} showDivider />
                <MetaRow
                  label="转入账户"
                  value={activeItem.toAccountName ?? '未知账户'}
                  showDivider
                />
              </>
            ) : (
              <>
                <MetaRow
                  label={
                    isRefund
                      ? '退款账户'
                      : activeItem.type === 'income'
                        ? '收款账户'
                        : '付款账户'
                  }
                  value={activeItem.accountName}
                  showDivider
                />
                <MetaRow label="分类" value={categoryTitle} showDivider />
              </>
            )}
            <MetaRow label="日期" value={formatDaySectionTitle(activeItem.occurredOn)} showDivider />
            <MetaRow
              label="备注"
              value={activeItem.note || '无'}
              mutedValue={!activeItem.note}
              showDivider
            />
            <MetaRow
              label="记录时间"
              value={formatLocalTimestamp(activeItem.createdAt)}
              tabular
              showDivider={false}
            />
          </View>

          {/* 关联退款明细（原支出维度） */}
          {refunds.length > 0 ? (
            <View style={{ marginTop: theme.spacing.lg }}>
              <Text
                style={{
                  color: theme.colors.textSecondary,
                  fontSize: theme.fontSize.xs,
                  fontWeight: theme.fontWeight.semibold,
                  marginBottom: theme.spacing.sm,
                }}
              >
                关联退款（{refunds.length}）
              </Text>
              <View
                style={[
                  styles.linkedCard,
                  {
                    backgroundColor: theme.colors.surface,
                    borderRadius: theme.radius.md,
                  },
                ]}
              >
                {refunds.map((ref, idx) => (
                  <Pressable
                    key={ref.id}
                    accessibilityRole="button"
                    accessibilityLabel={`查看退款 ${formatCentsToYuan(ref.amountCents)}`}
                    onPress={() => onSelectItem(ref)}
                    style={({ pressed }) => [
                      styles.linkedRow,
                      {
                        paddingHorizontal: theme.spacing.md,
                        borderBottomColor: theme.colors.border,
                        borderBottomWidth:
                          idx < refunds.length - 1 ? theme.borderWidth.hairline : 0,
                      },
                      pressed && { opacity: theme.opacity.pressed },
                    ]}
                  >
                    <View style={styles.linkedLeft}>
                      <Text
                        numberOfLines={1}
                        style={{
                          color: theme.colors.text,
                          fontSize: theme.fontSize.sm,
                          fontWeight: theme.fontWeight.semibold,
                        }}
                      >
                        {ref.occurredOn} · {ref.accountName}
                      </Text>
                      {ref.note ? (
                        <Text
                          numberOfLines={1}
                          style={{
                            color: theme.colors.textMuted,
                            fontSize: theme.fontSize.xs,
                            marginTop: 2,
                          }}
                        >
                          {ref.note}
                        </Text>
                      ) : null}
                    </View>
                    <Text
                      style={[
                        styles.tabular,
                        {
                          color: theme.colors.income,
                          fontSize: theme.fontSize.sm,
                          fontWeight: theme.fontWeight.semibold,
                          marginRight: theme.spacing.xs,
                        },
                      ]}
                    >
                      +{formatCentsToYuan(ref.amountCents)}
                    </Text>
                    <AppIcon name="chevron-forward" size={16} color={theme.colors.textMuted} />
                  </Pressable>
                ))}
              </View>
            </View>
          ) : null}

          {/* 原支出跳转（退款记录维度） */}
          {isRefund && originalTx ? (
            <View style={{ marginTop: theme.spacing.lg }}>
              <Text
                style={{
                  color: theme.colors.textSecondary,
                  fontSize: theme.fontSize.xs,
                  fontWeight: theme.fontWeight.semibold,
                  marginBottom: theme.spacing.sm,
                }}
              >
                原支出记录
              </Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="查看原支出记录"
                onPress={() => onSelectItem(originalTx)}
                style={({ pressed }) => [
                  styles.linkedCard,
                  styles.linkedRow,
                  {
                    backgroundColor: theme.colors.surface,
                    borderRadius: theme.radius.md,
                    paddingHorizontal: theme.spacing.md,
                  },
                  pressed && { opacity: theme.opacity.pressed },
                ]}
              >
                <View style={styles.linkedLeft}>
                  <Text
                    numberOfLines={1}
                    style={{
                      color: theme.colors.text,
                      fontSize: theme.fontSize.sm,
                      fontWeight: theme.fontWeight.semibold,
                    }}
                  >
                    {originalTx.categoryParentName
                      ? `${originalTx.categoryParentName} · ${originalTx.categoryName ?? ''}`
                      : (originalTx.categoryName ?? '支出')}
                  </Text>
                  <Text
                    numberOfLines={1}
                    style={{
                      color: theme.colors.textMuted,
                      fontSize: theme.fontSize.xs,
                      marginTop: 2,
                    }}
                  >
                    {originalTx.occurredOn} · {originalTx.accountName}
                  </Text>
                </View>
                <Text
                  style={[
                    styles.tabular,
                    {
                      color: theme.colors.expense,
                      fontSize: theme.fontSize.sm,
                      fontWeight: theme.fontWeight.semibold,
                      marginRight: theme.spacing.xs,
                    },
                  ]}
                >
                  -{formatCentsToYuan(originalTx.amountCents)}
                </Text>
                <AppIcon name="chevron-forward" size={16} color={theme.colors.textMuted} />
              </Pressable>
            </View>
          ) : null}
    </BottomSheet>
  );
}

interface MetaRowProps {
  label: string;
  value: string;
  mutedValue?: boolean;
  tabular?: boolean;
  showDivider: boolean;
}

function MetaRow({
  label,
  value,
  mutedValue = false,
  tabular = false,
  showDivider,
}: MetaRowProps): React.JSX.Element {
  const { theme } = useTheme();
  return (
    <View
      style={[
        styles.metaRow,
        {
          borderBottomColor: theme.colors.border,
          borderBottomWidth: showDivider ? theme.borderWidth.hairline : 0,
        },
      ]}
    >
      <Text style={{ color: theme.colors.textMuted, fontSize: theme.fontSize.sm }}>{label}</Text>
      <Text
        numberOfLines={3}
        style={[
          styles.metaValue,
          tabular && styles.tabular,
          {
            color: mutedValue ? theme.colors.textMuted : theme.colors.text,
            fontSize: theme.fontSize.sm,
            fontWeight: mutedValue ? theme.fontWeight.regular : theme.fontWeight.semibold,
          },
        ]}
      >
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  headerLeft: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  iconBadge: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitleWrap: {
    flex: 1,
    minWidth: 0,
  },
  headerSubRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
  },
  typeTag: {
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  closeBtn: {
    width: 34,
    height: 34,
    alignItems: 'center',
    justifyContent: 'center',
  },
  amountHero: {
    alignItems: 'center',
  },
  refundSummaryPill: {
    paddingHorizontal: 12,
    paddingVertical: 4,
  },
  metaCard: {},
  metaRow: {
    minHeight: 46,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
    gap: 16,
  },
  metaValue: {
    flex: 1,
    textAlign: 'right',
  },
  linkedCard: {
    overflow: 'hidden',
  },
  linkedRow: {
    minHeight: 54,
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
  },
  linkedLeft: {
    flex: 1,
    minWidth: 0,
    marginRight: 10,
  },
  footerBar: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  footerAction: {
    flex: 1,
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 8,
  },
  tabular: {
    fontVariant: ['tabular-nums'],
  },
});
