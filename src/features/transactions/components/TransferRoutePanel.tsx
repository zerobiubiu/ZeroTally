/**
 * 约束简报（Workflow B / C）：
 * - 信息层级：主（顶部并排「转出 ⇄ 转入」聚焦双卡 + 实时转后余额预览）、次（中部 2 列内联直选账户网格，免弹窗一步切换）、弱（居中圆形互换按钮与账户角色角标）
 * - 视觉语义：转出聚焦态使用主色 action，转入聚焦态使用转账晴蓝色 transfer，负债账户自动展示「待还」与还款后剩余欠款预览
 * - 防抖动细节：聚焦 2px 边框动态补偿 1px 内边距；奇数账户末尾自动补透明占位保持 2 列规整对齐
 */
import React, { useMemo, useState } from 'react';
import { Keyboard, Pressable, StyleSheet, Text, View } from 'react-native';
import { hapticLight, hapticSelection } from '../../../shared/haptics/haptics';
import { AppIcon } from '../../../shared/ui/AppIcon';
import { useTheme } from '../../../theme/theme-context';
import { describeAccountBalance } from '../../accounts/rules';
import type { Account } from '../../accounts/types';

type TransferSlot = 'source' | 'target';

export interface TransferRoutePanelProps {
  accounts: readonly Account[];
  sourceAccountId: string;
  targetAccountId: string;
  /** 当前输入的有效转账金额（分）；大于 0 时实时展示双方转后余额/欠款预览 */
  amountCents: number | null;
  onSelectSource: (accountId: string) => void;
  onSelectTarget: (accountId: string) => void;
  onSwap: () => void;
}

function chunkIntoPairs<T>(items: readonly T[]): (readonly [T, T | null])[] {
  const rows: [T, T | null][] = [];
  for (let i = 0; i < items.length; i += 2) {
    rows.push([items[i]!, items[i + 1] ?? null]);
  }
  return rows;
}

export function TransferRoutePanel({
  accounts,
  sourceAccountId,
  targetAccountId,
  amountCents,
  onSelectSource,
  onSelectTarget,
  onSwap,
}: TransferRoutePanelProps): React.JSX.Element {
  const { theme } = useTheme();
  const [activeSlot, setActiveSlot] = useState<TransferSlot>('source');

  const sourceAccount = accounts.find((a) => a.id === sourceAccountId) ?? null;
  const targetAccount = accounts.find((a) => a.id === targetAccountId) ?? null;
  const validAmount = amountCents !== null && amountCents > 0 ? amountCents : 0;

  const accountRows = useMemo(() => chunkIntoPairs(accounts), [accounts]);

  if (accounts.length < 2) {
    return (
      <View style={{ paddingHorizontal: theme.spacing.xs, paddingTop: theme.spacing.sm }}>
        <View
          style={[
            styles.warnBanner,
            {
              backgroundColor: theme.colors.warningSubtle,
              borderLeftColor: theme.colors.warning,
              borderRadius: theme.radius.md,
              padding: theme.spacing.md,
            },
          ]}
        >
          <AppIcon
            name="alert-circle-outline"
            size={18}
            color={theme.colors.warningTextOnSubtle}
          />
          <Text
            style={{
              color: theme.colors.warningTextOnSubtle,
              fontSize: theme.fontSize.sm,
              marginLeft: theme.spacing.sm,
              flex: 1,
            }}
          >
            至少需 2 个账户才能转账
          </Text>
        </View>
      </View>
    );
  }

  const handlePressGridAccount = (acc: Account) => {
    Keyboard.dismiss();
    hapticSelection();
    if (activeSlot === 'source') {
      if (acc.id === targetAccountId) {
        onSwap();
      } else {
        onSelectSource(acc.id);
      }
    } else if (acc.id === sourceAccountId) {
      onSwap();
    } else {
      onSelectTarget(acc.id);
    }
  };

  const renderSlotCard = (slot: TransferSlot, account: Account | null) => {
    const isSource = slot === 'source';
    const isActive = activeSlot === slot;
    const accentColor = isSource ? theme.colors.action : theme.colors.transfer;
    const accentSubtle = isSource ? theme.colors.actionSubtle : theme.colors.transferSubtle;
    const accentText = isSource
      ? theme.colors.actionTextOnSubtle
      : theme.colors.transferTextOnSubtle;

    const currentBal = account ? describeAccountBalance(account) : null;
    const projectedBal =
      account && validAmount > 0
        ? describeAccountBalance({
            ...account,
            balanceCents: account.balanceCents + (isSource ? -validAmount : validAmount),
          })
        : null;

    const roleText = isSource
      ? '转出账户'
      : account?.kind === 'liability'
        ? '转入 · 还款'
        : '转入账户';

    return (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${roleText}，${account?.name ?? '未选择'}`}
        accessibilityState={{ selected: isActive }}
        onPress={() => {
          Keyboard.dismiss();
          hapticSelection();
          setActiveSlot(slot);
        }}
        style={({ pressed }) => [
          styles.slotCard,
          theme.elevation.card,
          {
            backgroundColor: isActive ? accentSubtle : theme.colors.surfaceRaised,
            borderColor: isActive ? accentColor : theme.colors.border,
            borderWidth: isActive ? theme.borderWidth.focus : theme.borderWidth.hairline,
            padding: isActive ? 11 : 12,
            borderRadius: theme.radius.lg,
          },
          pressed && { opacity: theme.opacity.pressed },
        ]}
      >
        <View style={styles.slotHeader}>
          <View style={styles.slotRoleWrap}>
            <View style={[styles.roleDot, { backgroundColor: accentColor }]} />
            <Text
              numberOfLines={1}
              style={{
                color: isActive ? accentText : theme.colors.textMuted,
                fontSize: theme.fontSize.xs,
                fontWeight: theme.fontWeight.semibold,
              }}
            >
              {roleText}
            </Text>
          </View>
        </View>

        <View style={[styles.slotAccountRow, { marginTop: theme.spacing.sm }]}>
          <View
            style={[
              styles.slotIconWrap,
              {
                backgroundColor: isActive
                  ? theme.colors.surfaceRaised
                  : account?.kind === 'liability'
                    ? theme.colors.warningSubtle
                    : accentSubtle,
                borderRadius: theme.radius.sm,
              },
            ]}
          >
            <AppIcon
              name={account?.icon ?? 'wallet-outline'}
              size={18}
              color={
                isActive
                  ? accentColor
                  : account?.kind === 'liability'
                    ? theme.colors.warningTextOnSubtle
                    : accentText
              }
            />
          </View>
          <Text
            numberOfLines={1}
            style={{
              flex: 1,
              color: isActive ? accentText : theme.colors.text,
              fontSize: theme.fontSize.base,
              fontWeight: theme.fontWeight.semibold,
            }}
          >
            {account?.name ?? '选择账户'}
          </Text>
        </View>

        {currentBal ? (
          <View style={[styles.slotBalanceWrap, { marginTop: theme.spacing.sm }]}>
            <Text
              numberOfLines={1}
              style={[
                styles.tabular,
                {
                  color: currentBal.isDebt
                    ? theme.colors.expense
                    : isActive
                      ? accentText
                      : theme.colors.textSecondary,
                  fontSize: theme.fontSize.xs,
                },
              ]}
            >
              {currentBal.caption} {currentBal.amountText}
            </Text>
            {projectedBal ? (
              <Text
                numberOfLines={1}
                style={[
                  styles.tabular,
                  {
                    color: projectedBal.isDebt
                      ? theme.colors.expense
                      : isSource
                        ? theme.colors.textSecondary
                        : theme.colors.transferTextOnSubtle,
                    fontSize: 11,
                    fontWeight: theme.fontWeight.semibold,
                    marginTop: 2,
                  },
                ]}
              >
                → {projectedBal.caption} {projectedBal.amountText}
              </Text>
            ) : null}
          </View>
        ) : null}
      </Pressable>
    );
  };

  const selectingSource = activeSlot === 'source';

  return (
    <View style={{ paddingHorizontal: theme.spacing.xs, paddingTop: theme.spacing.xs }}>
      {/* 顶部并排双聚焦路由卡 + 居中悬浮互换按钮 */}
      <View style={styles.routeStage}>
        <View style={styles.routeCardsRow}>
          {renderSlotCard('source', sourceAccount)}
          {renderSlotCard('target', targetAccount)}
        </View>

        <View pointerEvents="box-none" style={styles.swapAnchor}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="互换转出与转入账户"
            onPress={() => {
              Keyboard.dismiss();
              hapticLight();
              onSwap();
            }}
            hitSlop={8}
            style={({ pressed }) => [
              styles.swapCircle,
              theme.elevation.card,
              {
                backgroundColor: theme.colors.surfaceRaised,
                borderColor: theme.colors.borderStrong,
                borderWidth: theme.borderWidth.hairline,
                borderRadius: theme.radius.full,
              },
              pressed && { transform: [{ scale: 0.94 }], opacity: theme.opacity.pressed },
            ]}
          >
            <AppIcon name="swap-horizontal" size={16} color={theme.colors.transfer} />
          </Pressable>
        </View>
      </View>

      {/* 中部 2 列内联直选账户网格：免弹窗一步切换 */}
      <View style={{ marginTop: theme.spacing.lg }}>
        <View style={[styles.gridHeader, { marginBottom: theme.spacing.sm }]}>
          <View style={styles.gridTitleLeft}>
            <View
              style={[
                styles.roleDot,
                { backgroundColor: selectingSource ? theme.colors.action : theme.colors.transfer },
              ]}
            />
            <Text
              style={{
                color: theme.colors.textSecondary,
                fontSize: theme.fontSize.xs,
                fontWeight: theme.fontWeight.semibold,
              }}
            >
              {selectingSource ? '选择转出账户' : '选择转入账户'}
            </Text>
          </View>

          <Text style={{ color: theme.colors.textMuted, fontSize: theme.fontSize.xs }}>
            共 {accounts.length} 个
          </Text>
        </View>

        <View style={{ gap: theme.spacing.sm }}>
          {accountRows.map(([leftAcc, rightAcc]) => (
            <View key={leftAcc.id} style={[styles.gridRow, { gap: theme.spacing.sm }]}>
              {[leftAcc, rightAcc].map((acc, colIdx) => {
                if (!acc) {
                  return <View key={`empty_${colIdx}`} style={styles.gridCellSpacer} />;
                }

                const isSource = acc.id === sourceAccountId;
                const isTarget = acc.id === targetAccountId;
                const isCurrentSlotSelected = selectingSource ? isSource : isTarget;
                const isCounterpart = selectingSource ? isTarget : isSource;
                const bal = describeAccountBalance(acc);

                const activeBorder = selectingSource ? theme.colors.action : theme.colors.transfer;
                const activeBg = selectingSource
                  ? theme.colors.actionSubtle
                  : theme.colors.transferSubtle;
                const activeFg = selectingSource
                  ? theme.colors.actionTextOnSubtle
                  : theme.colors.transferTextOnSubtle;

                const badgeLabel = isSource ? '转出' : isTarget ? '转入' : null;
                const badgeBg = isSource ? theme.colors.action : theme.colors.transfer;

                return (
                  <Pressable
                    key={acc.id}
                    accessibilityRole="button"
                    accessibilityLabel={`${acc.name}，${bal.caption} ${bal.amountText}${badgeLabel ? `，当前${badgeLabel}` : ''}`}
                    accessibilityState={{ selected: isCurrentSlotSelected }}
                    onPress={() => handlePressGridAccount(acc)}
                    style={({ pressed }) => [
                      styles.accountTile,
                      {
                        backgroundColor: isCurrentSlotSelected
                          ? activeBg
                          : theme.colors.surfaceRaised,
                        borderColor: isCurrentSlotSelected
                          ? activeBorder
                          : isCounterpart
                            ? theme.colors.borderStrong
                            : theme.colors.border,
                        borderWidth: isCurrentSlotSelected
                          ? theme.borderWidth.focus
                          : theme.borderWidth.hairline,
                        paddingHorizontal: isCurrentSlotSelected ? 11 : 12,
                        paddingVertical: isCurrentSlotSelected ? 9 : 10,
                        borderRadius: theme.radius.md,
                      },
                      pressed && { opacity: theme.opacity.pressed },
                    ]}
                  >
                    <View
                      style={[
                        styles.tileIcon,
                        {
                          backgroundColor: isCurrentSlotSelected
                            ? theme.colors.surfaceRaised
                            : acc.kind === 'liability'
                              ? theme.colors.warningSubtle
                              : theme.colors.surface,
                          borderRadius: theme.radius.sm,
                        },
                      ]}
                    >
                      <AppIcon
                        name={acc.icon}
                        size={17}
                        color={
                          isCurrentSlotSelected
                            ? activeBorder
                            : acc.kind === 'liability'
                              ? theme.colors.warningTextOnSubtle
                              : theme.colors.textSecondary
                        }
                      />
                    </View>

                    <View style={styles.tileBody}>
                      <View style={styles.tileNameRow}>
                        <Text
                          numberOfLines={1}
                          style={{
                            flex: 1,
                            color: isCurrentSlotSelected ? activeFg : theme.colors.text,
                            fontSize: theme.fontSize.sm,
                            fontWeight: theme.fontWeight.semibold,
                          }}
                        >
                          {acc.name}
                        </Text>
                        {badgeLabel ? (
                          <View
                            style={[
                              styles.rolePill,
                              {
                                backgroundColor: badgeBg,
                                borderRadius: theme.radius.full,
                              },
                            ]}
                          >
                            <Text
                              style={{
                                color: theme.colors.onAction,
                                fontSize: 10,
                                fontWeight: theme.fontWeight.semibold,
                              }}
                            >
                              {badgeLabel}
                            </Text>
                          </View>
                        ) : null}
                      </View>

                      <Text
                        numberOfLines={1}
                        style={[
                          styles.tabular,
                          {
                            color: bal.isDebt
                              ? theme.colors.expense
                              : isCurrentSlotSelected
                                ? activeFg
                                : theme.colors.textMuted,
                            fontSize: 11,
                            marginTop: 2,
                          },
                        ]}
                      >
                        {bal.isDebt ? `待还 ${bal.amountText}` : bal.amountText}
                      </Text>
                    </View>
                  </Pressable>
                );
              })}
            </View>
          ))}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  warnBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    borderLeftWidth: 4,
  },
  routeStage: {
    position: 'relative',
  },
  routeCardsRow: {
    flexDirection: 'row',
    gap: 18,
  },
  slotCard: {
    flex: 1,
    minHeight: 104,
    justifyContent: 'space-between',
  },
  slotHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  slotRoleWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  roleDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  slotAccountRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  slotIconWrap: {
    width: 30,
    height: 30,
    alignItems: 'center',
    justifyContent: 'center',
  },
  slotBalanceWrap: {},
  swapAnchor: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  swapCircle: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  gridHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 2,
  },
  gridTitleLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  gridRow: {
    flexDirection: 'row',
  },
  gridCellSpacer: {
    flex: 1,
  },
  accountTile: {
    flex: 1,
    minHeight: 60,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  tileIcon: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tileBody: {
    flex: 1,
    minWidth: 0,
  },
  tileNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  rolePill: {
    paddingHorizontal: 6,
    paddingVertical: 1,
  },
  tabular: {
    fontVariant: ['tabular-nums'],
  },
});
