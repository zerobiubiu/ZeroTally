/**
 * 约束简报（Workflow B / C）：
 * - 异形屏适配：SafeScreen 硬隔离系统状态栏与刘海/挖孔区，顶部应用栏固定在安全区下方，列表仅在下方安全视口内滚动
 * - 信息层级：主（月度收支总览卡，点击进入账务分析）、次（按日分组账单明细）、弱（日小计与笔数）
 * - 文案密度：零解释性段落，空状态仅保留简短状态与记账动作按钮
 */
import { useRouter } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useDatabase } from '../../src/db/database-context';
import { MonthlySummaryHeader } from '../../src/features/transactions/components/MonthlySummaryHeader';
import { TransactionRow } from '../../src/features/transactions/components/TransactionRow';
import { getMonthlyLedger } from '../../src/features/transactions/service';
import type { MonthlyLedger, TransactionListItem } from '../../src/features/transactions/types';
import {
  formatDaySectionTitle,
  getCurrentMonthKey,
  shiftMonthKey,
} from '../../src/shared/date/date';
import { formatCentsToYuan } from '../../src/shared/money/money';
import { AppIcon } from '../../src/shared/ui/AppIcon';
import { EmptyState } from '../../src/shared/ui/EmptyState';
import { SafeScreen } from '../../src/shared/ui/SafeScreen';
import { useTheme } from '../../src/theme/theme-context';

const EMPTY_LEDGER: MonthlyLedger = {
  monthKey: getCurrentMonthKey(),
  summary: {
    expenseCents: 0,
    incomeCents: 0,
    balanceCents: 0,
    transferCents: 0,
    transactionCount: 0,
  },
  sections: [],
};

export default function LedgerScreen(): React.JSX.Element {
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { db, revision } = useDatabase();

  const [monthKey, setMonthKey] = useState<string>(() => getCurrentMonthKey());
  const [ledger, setLedger] = useState<MonthlyLedger>(EMPTY_LEDGER);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    let active = true;
    void (async () => {
      const data = await getMonthlyLedger(db, monthKey);
      if (active) {
        setLedger(data);
      }
    })();
    return () => {
      active = false;
    };
  }, [db, monthKey, revision]);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      const data = await getMonthlyLedger(db, monthKey);
      setLedger(data);
    } finally {
      setRefreshing(false);
    }
  }, [db, monthKey]);

  const handlePressTransaction = useCallback(
    (item: TransactionListItem) => {
      router.push({ pathname: '/record', params: { id: item.id } });
    },
    [router]
  );

  return (
    <SafeScreen edges={['top', 'left', 'right']}>
      {/* 固定顶栏：严守系统顶部工具栏下方，滚动时明细绝不侵入状态栏 */}
      <View
        style={[
          styles.topBar,
          {
            paddingHorizontal: theme.spacing.lg,
            backgroundColor: theme.colors.surface,
          },
        ]}
      >
        <View style={styles.titleGroup}>
          <Text
            style={{
              color: theme.colors.text,
              fontSize: theme.fontSize.xxl,
              fontWeight: theme.fontWeight.semibold,
            }}
          >
            简记
          </Text>
          <Text
            style={{
              color: theme.colors.textMuted,
              fontSize: theme.fontSize.xs,
              marginLeft: theme.spacing.sm,
            }}
          >
            {ledger.summary.transactionCount} 笔
          </Text>
        </View>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel="设置"
          onPress={() => router.push('/settings')}
          hitSlop={4}
          style={({ pressed }) => [
            styles.settingsBtn,
            {
              backgroundColor: theme.colors.surfaceRaised,
              borderColor: theme.colors.border,
              borderWidth: theme.borderWidth.hairline,
              borderRadius: theme.radius.full,
            },
            pressed && { opacity: theme.opacity.pressed },
          ]}
        >
          <AppIcon name="settings-outline" size={20} color={theme.colors.textSecondary} />
        </Pressable>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={{
          paddingTop: theme.spacing.sm,
          paddingHorizontal: theme.spacing.lg,
          paddingBottom: 100 + insets.bottom,
        }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => void handleRefresh()}
            tintColor={theme.colors.action}
          />
        }
      >
        <MonthlySummaryHeader
          monthKey={monthKey}
          summary={ledger.summary}
          onPrevMonth={() => setMonthKey((prev) => shiftMonthKey(prev, -1))}
          onNextMonth={() => setMonthKey((prev) => shiftMonthKey(prev, 1))}
          onResetCurrentMonth={() => setMonthKey(getCurrentMonthKey())}
          onPressAnalytics={() =>
            router.push({ pathname: '/analytics', params: { month: monthKey } })
          }
        />

        {ledger.sections.length === 0 ? (
          <View style={{ marginTop: theme.spacing.xl }}>
            <EmptyState
              icon="receipt-outline"
              title="本月暂无账目"
              actionLabel="记一笔"
              onAction={() => router.push('/record')}
            />
          </View>
        ) : (
          <View style={{ marginTop: theme.spacing.xl, gap: theme.spacing.lg }}>
            {ledger.sections.map((section) => (
              <View key={section.occurredOn}>
                <View style={[styles.sectionHeader, { marginBottom: theme.spacing.sm }]}>
                  <Text
                    style={{
                      color: theme.colors.textSecondary,
                      fontSize: theme.fontSize.xs,
                      fontWeight: theme.fontWeight.semibold,
                    }}
                  >
                    {formatDaySectionTitle(section.occurredOn)}
                  </Text>

                  <View style={styles.sectionTotals}>
                    {section.expenseCents > 0 ? (
                      <Text
                        style={[
                          styles.tabular,
                          { color: theme.colors.textMuted, fontSize: theme.fontSize.xs },
                        ]}
                      >
                        支 {formatCentsToYuan(section.expenseCents)}
                      </Text>
                    ) : null}
                    {section.incomeCents > 0 ? (
                      <Text
                        style={[
                          styles.tabular,
                          { color: theme.colors.textMuted, fontSize: theme.fontSize.xs },
                        ]}
                      >
                        收 {formatCentsToYuan(section.incomeCents)}
                      </Text>
                    ) : null}
                  </View>
                </View>

                <View
                  style={[
                    styles.sectionCard,
                    theme.elevation.card,
                    {
                      backgroundColor: theme.colors.surfaceRaised,
                      borderRadius: theme.radius.lg,
                    },
                  ]}
                >
                  {section.items.map((item, idx) => (
                    <TransactionRow
                      key={item.id}
                      item={item}
                      onPress={handlePressTransaction}
                      showDivider={idx < section.items.length - 1}
                    />
                  ))}
                </View>
              </View>
            ))}
          </View>
        )}
      </ScrollView>
    </SafeScreen>
  );
}

const styles = StyleSheet.create({
  topBar: {
    height: 52,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  titleGroup: {
    flexDirection: 'row',
    alignItems: 'baseline',
  },
  settingsBtn: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scroll: {
    flex: 1,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 4,
  },
  sectionTotals: {
    flexDirection: 'row',
    gap: 12,
  },
  sectionCard: {
    overflow: 'hidden',
  },
  tabular: {
    fontVariant: ['tabular-nums'],
  },
});
