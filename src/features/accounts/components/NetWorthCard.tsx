/**
 * 约束简报（Workflow B）：
 * - 信息层级：主（净资产 30px/600）、次（总资产与总负债 18px/600）、弱（标签 heroSubtext 12px）
 * - 令牌：heroBg / heroText / heroSubtext / heroDivider
 */
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { formatCentsToYuan } from '../../../shared/money/money';
import { useTheme } from '../../../theme/theme-context';
import type { NetWorthSummary } from '../types';

interface NetWorthCardProps {
  summary: NetWorthSummary;
}

export function NetWorthCard({ summary }: NetWorthCardProps): React.JSX.Element {
  const { theme } = useTheme();

  return (
    <View
      style={[
        styles.card,
        {
          backgroundColor: theme.colors.heroBg,
          borderRadius: theme.radius.lg,
          padding: theme.spacing.lg,
        },
      ]}
    >
      <Text
        style={{
          color: theme.colors.heroSubtext,
          fontSize: theme.fontSize.xs,
        }}
      >
        净资产
      </Text>
      <Text
        numberOfLines={1}
        adjustsFontSizeToFit
        style={[
          styles.tabular,
          {
            color: theme.colors.heroText,
            fontSize: theme.fontSize.hero,
            fontWeight: theme.fontWeight.semibold,
            marginTop: theme.spacing.xs,
          },
        ]}
      >
        {formatCentsToYuan(summary.netWorthCents)}
      </Text>

      <View
        style={[
          styles.divider,
          {
            backgroundColor: theme.colors.heroDivider,
            marginVertical: theme.spacing.md,
          },
        ]}
      />

      <View style={styles.metricsRow}>
        <View style={styles.metricCol}>
          <Text style={{ color: theme.colors.heroSubtext, fontSize: theme.fontSize.xs }}>
            总资产
          </Text>
          <Text
            numberOfLines={1}
            adjustsFontSizeToFit
            style={[
              styles.tabular,
              {
                color: theme.colors.heroText,
                fontSize: theme.fontSize.lg,
                fontWeight: theme.fontWeight.semibold,
                marginTop: theme.spacing.xs,
              },
            ]}
          >
            {formatCentsToYuan(summary.totalAssetsCents)}
          </Text>
        </View>

        <View style={styles.metricCol}>
          <Text style={{ color: theme.colors.heroSubtext, fontSize: theme.fontSize.xs }}>
            总负债
          </Text>
          <Text
            numberOfLines={1}
            adjustsFontSizeToFit
            style={[
              styles.tabular,
              {
                color: theme.colors.heroText,
                fontSize: theme.fontSize.lg,
                fontWeight: theme.fontWeight.semibold,
                marginTop: theme.spacing.xs,
              },
            ]}
          >
            {formatCentsToYuan(summary.totalLiabilitiesCents)}
          </Text>
        </View>
      </View>

      {summary.excludedCount > 0 ? (
        <Text
          style={{
            color: theme.colors.heroSubtext,
            fontSize: theme.fontSize.xs,
            marginTop: theme.spacing.md,
          }}
        >
          不含 {summary.excludedCount} 个未计入账户
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {},
  divider: {
    height: 1,
  },
  metricsRow: {
    flexDirection: 'row',
    gap: 16,
  },
  metricCol: {
    flex: 1,
  },
  tabular: {
    fontVariant: ['tabular-nums'],
  },
});
