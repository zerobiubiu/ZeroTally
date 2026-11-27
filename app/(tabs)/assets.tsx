/**
 * 约束简报（Workflow B / C）：
 * - 容器归属：顶部安全区与全局共享顶栏由 app/(tabs)/_layout.tsx 统一固定承接，本页专注净资产总览卡与资产/负债账户列表
 * - 信息层级：主（净资产总览卡）、次（资产与负债分组列表）、弱（「已归档」二级页入口行）
 * - 文案密度：简短名词与动作词，空状态不堆叠说明文案
 */
import { useRouter } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { RefreshControl, ScrollView } from 'react-native-gesture-handler';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useDatabase } from '../../src/db/database-context';
import { AccountRow } from '../../src/features/accounts/components/AccountRow';
import { NetWorthCard } from '../../src/features/accounts/components/NetWorthCard';
import { getAssetOverview, type AssetOverview } from '../../src/features/accounts/service';
import type { Account } from '../../src/features/accounts/types';
import { AppIcon } from '../../src/shared/ui/AppIcon';
import { EmptyState } from '../../src/shared/ui/EmptyState';
import { useTheme } from '../../src/theme/theme-context';

const EMPTY_OVERVIEW: AssetOverview = {
  summary: {
    totalAssetsCents: 0,
    totalLiabilitiesCents: 0,
    netWorthCents: 0,
    includedCount: 0,
    excludedCount: 0,
  },
  assetAccounts: [],
  liabilityAccounts: [],
  archivedAccounts: [],
};

export default function AssetsScreen(): React.JSX.Element {
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { db, revision } = useDatabase();

  const [overview, setOverview] = useState<AssetOverview>(EMPTY_OVERVIEW);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    let active = true;
    void (async () => {
      const data = await getAssetOverview(db);
      if (active) {
        setOverview(data);
      }
    })();
    return () => {
      active = false;
    };
  }, [db, revision]);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      const data = await getAssetOverview(db);
      setOverview(data);
    } finally {
      setRefreshing(false);
    }
  }, [db]);

  const handlePressAccount = useCallback(
    (account: Account) => {
      router.push({ pathname: '/account-detail', params: { id: account.id } });
    },
    [router]
  );

  const hasActiveAccounts =
    overview.assetAccounts.length > 0 || overview.liabilityAccounts.length > 0;

  return (
    <View style={[styles.container, { backgroundColor: theme.colors.surface }]}>
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
        <NetWorthCard summary={overview.summary} />

        {!hasActiveAccounts ? (
          <View style={{ marginTop: theme.spacing.xl }}>
            <EmptyState
              icon="wallet-outline"
              title="暂无可用账户"
              actionLabel="新增账户"
              onAction={() => router.push('/account-form')}
            />
          </View>
        ) : (
          <>
            {overview.assetAccounts.length > 0 ? (
              <View style={{ marginTop: theme.spacing.xl }}>
                <Text
                  style={{
                    color: theme.colors.textSecondary,
                    fontSize: theme.fontSize.xs,
                    fontWeight: theme.fontWeight.semibold,
                    marginBottom: theme.spacing.sm,
                    paddingHorizontal: 4,
                  }}
                >
                  资产（{overview.assetAccounts.length}）
                </Text>
                <View
                  style={[
                    styles.groupCard,
                    theme.elevation.card,
                    {
                      backgroundColor: theme.colors.surfaceRaised,
                      borderRadius: theme.radius.lg,
                    },
                  ]}
                >
                  {overview.assetAccounts.map((acc, idx) => (
                    <AccountRow
                      key={acc.id}
                      account={acc}
                      onPress={handlePressAccount}
                      showDivider={idx < overview.assetAccounts.length - 1}
                    />
                  ))}
                </View>
              </View>
            ) : null}

            {overview.liabilityAccounts.length > 0 ? (
              <View style={{ marginTop: theme.spacing.xl }}>
                <Text
                  style={{
                    color: theme.colors.textSecondary,
                    fontSize: theme.fontSize.xs,
                    fontWeight: theme.fontWeight.semibold,
                    marginBottom: theme.spacing.sm,
                    paddingHorizontal: 4,
                  }}
                >
                  负债（{overview.liabilityAccounts.length}）
                </Text>
                <View
                  style={[
                    styles.groupCard,
                    theme.elevation.card,
                    {
                      backgroundColor: theme.colors.surfaceRaised,
                      borderRadius: theme.radius.lg,
                    },
                  ]}
                >
                  {overview.liabilityAccounts.map((acc, idx) => (
                    <AccountRow
                      key={acc.id}
                      account={acc}
                      onPress={handlePressAccount}
                      showDivider={idx < overview.liabilityAccounts.length - 1}
                    />
                  ))}
                </View>
              </View>
            ) : null}
          </>
        )}

        {overview.archivedAccounts.length > 0 ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="查看已归档账户"
            onPress={() => router.push('/archived-accounts')}
            style={({ pressed }) => [
              styles.archiveToggle,
              { marginTop: theme.spacing.xl },
              pressed && { opacity: theme.opacity.pressed },
            ]}
          >
            <Text
              style={{
                color: theme.colors.textMuted,
                fontSize: theme.fontSize.xs,
                fontWeight: theme.fontWeight.semibold,
              }}
            >
              已归档（{overview.archivedAccounts.length}）
            </Text>
            <AppIcon name="chevron-forward" size={16} color={theme.colors.textMuted} />
          </Pressable>
        ) : null}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scroll: {
    flex: 1,
  },
  groupCard: {
    overflow: 'hidden',
  },
  archiveToggle: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 4,
  },
});
