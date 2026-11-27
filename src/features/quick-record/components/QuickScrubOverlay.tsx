/**
 * 约束简报（Workflow B / C）：
 * - 单张快捷卡片长按上下/左右微调的顶层半透明悬浮 HUD（pointerEvents="none"）
 * - 视觉定位：独立浮于整个界面最上层（zIndex 120 / elevation 28），完全脱离半屏窗内部流式布局，零布局跳动且绝不被拇指遮挡
 * - 三态反馈：刚长按激活展示方向速览；上下滑动展示超大号等宽实时金额与步长；左右滑动展示横向高亮账户选择列
 */
import React, { useEffect, useState } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';
import { formatCentsToYuan } from '../../../shared/money/money';
import { AppIcon } from '../../../shared/ui/AppIcon';
import { useTheme } from '../../../theme/theme-context';
import type { Account } from '../../accounts/types';
import type { ActiveQuickScrubState } from './QuickRecordTile';

export interface QuickScrubOverlayProps {
  scrub: ActiveQuickScrubState | null;
  accounts: readonly Account[];
  /** 悬浮 HUD 底边距离屏幕底部的偏移（浮于快捷记账面板正上方） */
  anchorBottom: number;
}

export function QuickScrubOverlay({
  scrub,
  accounts,
  anchorBottom,
}: QuickScrubOverlayProps): React.JSX.Element | null {
  const { theme } = useTheme();
  const [anim] = useState(() => new Animated.Value(0));

  useEffect(() => {
    if (!scrub) {
      anim.setValue(0);
      return;
    }
    Animated.spring(anim, {
      toValue: 1,
      useNativeDriver: true,
      stiffness: 380,
      damping: 26,
      mass: 0.72,
    }).start();
  }, [anim, scrub]);

  if (!scrub) {
    return null;
  }

  const isDark = theme.mode === 'dark';
  const glassBg = isDark ? 'rgba(20, 32, 29, 0.86)' : 'rgba(255, 255, 255, 0.86)';
  const glassBorder = isDark ? 'rgba(255, 255, 255, 0.16)' : 'rgba(255, 255, 255, 0.72)';
  const chipBg = isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(15, 23, 42, 0.06)';

  const sign = scrub.item.type === 'expense' ? '-' : '+';
  const amountColor = scrub.item.type === 'expense' ? theme.colors.expense : theme.colors.income;
  const formattedAmount = `${sign}${formatCentsToYuan(scrub.amountCents)}`;
  const stepText = formatCentsToYuan(scrub.stepCents);

  const scale = anim.interpolate({
    inputRange: [0, 1],
    outputRange: [0.92, 1],
  });
  const translateY = anim.interpolate({
    inputRange: [0, 1],
    outputRange: [10, 0],
  });

  return (
    <View
      pointerEvents="none"
      style={[
        styles.overlayWrap,
        {
          bottom: anchorBottom,
        },
      ]}
    >
      <Animated.View
        style={[
          styles.glassCard,
          theme.elevation.floating,
          {
            backgroundColor: glassBg,
            borderColor: glassBorder,
            borderRadius: 24,
            opacity: anim,
            transform: [{ translateY }, { scale }],
          },
        ]}
      >
        {/* 顶部卡片身份行 */}
        <View style={styles.titleRow}>
          <View
            style={[
              styles.iconBadge,
              {
                backgroundColor: `${scrub.item.categoryColor}24`,
                borderRadius: theme.radius.full,
              },
            ]}
          >
            <AppIcon
              name={scrub.item.categoryIcon}
              size={15}
              color={scrub.item.categoryColor}
            />
          </View>
          <Text
            numberOfLines={1}
            style={{
              color: theme.colors.text,
              fontSize: theme.fontSize.sm,
              fontWeight: theme.fontWeight.semibold,
              flexShrink: 1,
            }}
          >
            {scrub.item.name}
          </Text>
          {scrub.axis === 'amount' ? (
            <View
              style={[
                styles.stepTag,
                {
                  backgroundColor: theme.colors.actionSubtle,
                  borderRadius: theme.radius.full,
                },
              ]}
            >
              <Text
                style={[
                  styles.tabular,
                  {
                    color: theme.colors.actionTextOnSubtle,
                    fontSize: 10,
                    fontWeight: theme.fontWeight.semibold,
                  },
                ]}
              >
                步进 {stepText}
              </Text>
            </View>
          ) : scrub.axis === 'account' ? (
            <View
              style={[
                styles.stepTag,
                {
                  backgroundColor: theme.colors.actionSubtle,
                  borderRadius: theme.radius.full,
                },
              ]}
            >
              <Text
                style={{
                  color: theme.colors.actionTextOnSubtle,
                  fontSize: 10,
                  fontWeight: theme.fontWeight.semibold,
                }}
              >
                切换账户
              </Text>
            </View>
          ) : null}
        </View>

        {/* 核心交互反馈区 */}
        {scrub.axis === 'amount' ? (
          <View style={styles.amountStage}>
            <View style={styles.amountValueRow}>
              <AppIcon name="swap-vertical" size={18} color={theme.colors.textMuted} />
              <Text
                style={[
                  styles.tabular,
                  {
                    color: amountColor,
                    fontSize: 30,
                    lineHeight: 36,
                    fontWeight: theme.fontWeight.semibold,
                    letterSpacing: -0.6,
                  },
                ]}
              >
                {formattedAmount}
              </Text>
            </View>
            <Text style={{ color: theme.colors.textMuted, fontSize: 11 }}>
              快滑大步 · 慢滑精调 · 松手保存
            </Text>
          </View>
        ) : scrub.axis === 'account' ? (
          <View style={styles.accountStage}>
            <View style={styles.accountPillsWrap}>
              {accounts.map((acc) => {
                const active = acc.id === scrub.accountId;
                return (
                  <View
                    key={acc.id}
                    style={[
                      styles.accountPill,
                      {
                        backgroundColor: active ? theme.colors.action : chipBg,
                        borderRadius: theme.radius.full,
                      },
                    ]}
                  >
                    <Text
                      numberOfLines={1}
                      style={{
                        color: active ? theme.colors.onAction : theme.colors.textSecondary,
                        fontSize: active ? theme.fontSize.sm : theme.fontSize.xs,
                        fontWeight: active
                          ? theme.fontWeight.semibold
                          : theme.fontWeight.regular,
                      }}
                    >
                      {acc.name}
                    </Text>
                  </View>
                );
              })}
            </View>
            <Text style={{ color: theme.colors.textMuted, fontSize: 11 }}>
              {accounts.length > 1 ? '左右滑动切账户 · 松手保存' : '当前仅 1 个可用账户'}
            </Text>
          </View>
        ) : (
          <View style={styles.idleStage}>
            <Text
              style={[
                styles.tabular,
                {
                  color: amountColor,
                  fontSize: theme.fontSize.xl,
                  fontWeight: theme.fontWeight.semibold,
                },
              ]}
            >
              {formattedAmount}
              <Text
                style={{
                  color: theme.colors.textMuted,
                  fontSize: theme.fontSize.xs,
                  fontWeight: theme.fontWeight.regular,
                }}
              >
                {'  '}· {scrub.accountName}
              </Text>
            </Text>

            <View style={styles.hintsRow}>
              <View style={[styles.hintChip, { backgroundColor: chipBg, borderRadius: theme.radius.full }]}>
                <AppIcon name="swap-vertical" size={12} color={theme.colors.textSecondary} />
                <Text style={{ color: theme.colors.textSecondary, fontSize: 11 }}>调金额</Text>
              </View>
              <View style={[styles.hintChip, { backgroundColor: chipBg, borderRadius: theme.radius.full }]}>
                <AppIcon name="swap-horizontal" size={12} color={theme.colors.textSecondary} />
                <Text style={{ color: theme.colors.textSecondary, fontSize: 11 }}>切账户</Text>
              </View>
              <View style={[styles.hintChip, { backgroundColor: chipBg, borderRadius: theme.radius.full }]}>
                <AppIcon name="create-outline" size={12} color={theme.colors.textSecondary} />
                <Text style={{ color: theme.colors.textSecondary, fontSize: 11 }}>松手编辑</Text>
              </View>
            </View>
          </View>
        )}
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  overlayWrap: {
    position: 'absolute',
    left: 20,
    right: 20,
    alignItems: 'center',
    zIndex: 120,
    elevation: 28,
  },
  glassCard: {
    minWidth: 244,
    maxWidth: 332,
    borderWidth: 1,
    paddingHorizontal: 18,
    paddingVertical: 14,
    alignItems: 'center',
    gap: 10,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
  },
  iconBadge: {
    width: 24,
    height: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepTag: {
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  idleStage: {
    alignItems: 'center',
    gap: 10,
  },
  hintsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    flexWrap: 'wrap',
    gap: 6,
  },
  hintChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 9,
    paddingVertical: 4,
  },
  amountStage: {
    alignItems: 'center',
    gap: 4,
  },
  amountValueRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  accountStage: {
    alignItems: 'center',
    gap: 8,
  },
  accountPillsWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 6,
  },
  accountPill: {
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  tabular: {
    fontVariant: ['tabular-nums'],
  },
});
