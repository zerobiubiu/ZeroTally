/**
 * 约束简报（Workflow B / C）：
 * - 异形屏适配：SafeScreen 硬隔离系统状态栏与刘海/挖孔区，顶部标题栏固定，列表不侵入状态栏
 * - 信息层级：主（净资产总览卡）、次（资产与负债分组列表）、弱（已停用账户折叠区）
 * - 文案密度：简短名词与动作词，空状态不堆叠说明文案
 */
import { useRouter } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useDatabase } from '../../src/db/database-context';
import { AccountRow } from '../../src/features/accounts/components/AccountRow';
import { NetWorthCard } from '../../src/features/accounts/components/NetWorthCard';
import { getAssetOverview, type AssetOverview } from '../../src/features/accounts/service';
import type { Account } from '../../src/features/accounts/types';
import { AppIcon } from '../../src/shared/ui/AppIcon';
import { EmptyState } from '../../src/shared/ui/EmptyState';
import { SafeScreen } from '../../src/shared/ui/SafeScreen';
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
  const [showArchived, setShowArchived] = useState(false);

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
    <SafeScreen edges={['top', 'left', 'right']}>
      <View
        style={[
          styles.topBar,
          {
            paddingHorizontal: theme.spacing.lg,
            backgroundColor: theme.colors.surface,
          },
        ]}
      >
        <Text
          style={{
            color: theme.colors.text,
            fontSize: theme.fontSize.xxl,
            fontWeight: theme.fontWeight.semibold,
          }}
        >
          资产
        </Text>

        <View style={styles.headerActions}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="新增账户"
            onPress={() => router.push('/account-form')}
            hitSlop={4}
            style={({ pressed }) => [
              styles.addAccountBtn,
              {
                backgroundColor: theme.colors.surfaceRaised,
                borderColor: theme.colors.borderStrong,
                borderWidth: theme.borderWidth.hairline,
                borderRadius: theme.radius.full,
                paddingHorizontal: theme.spacing.md,
              },
              pressed && { opacity: theme.opacity.pressed },
            ]}
          >
            <AppIcon name="add" size={18} color={theme.colors.action} />
            <Text
              style={{
                color: theme.colors.text,
                fontSize: theme.fontSize.sm,
                fontWeight: theme.fontWeight.semibold,
                marginLeft: theme.spacing.xs,
              }}
            >
              新增
            </Text>
          </Pressable>

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
          <View style={{ marginTop: theme.spacing.xl }}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={showArchived ? '收起已停用账户' : '展开已停用账户'}
              onPress={() => setShowArchived((prev) => !prev)}
              style={styles.archiveToggle}
            >
              <Text
                style={{
                  color: theme.colors.textMuted,
                  fontSize: theme.fontSize.xs,
                  fontWeight: theme.fontWeight.semibold,
                }}
              >
                已停用（{overview.archivedAccounts.length}）
              </Text>
              <AppIcon
                name={showArchived ? 'chevron-up' : 'chevron-down'}
                size={16}
                color={theme.colors.textMuted}
              />
            </Pressable>

            {showArchived ? (
              <View
                style={[
                  styles.groupCard,
                  {
                    backgroundColor: theme.colors.surfaceRaised,
                    borderRadius: theme.radius.lg,
                    marginTop: theme.spacing.sm,
                  },
                ]}
              >
                {overview.archivedAccounts.map((acc, idx) => (
                  <AccountRow
                    key={acc.id}
                    account={acc}
                    onPress={handlePressAccount}
                    showDivider={idx < overview.archivedAccounts.length - 1}
                  />
                ))}
              </View>
            ) : null}
          </View>
        ) : null}
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
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  addAccountBtn: {
    height: 40,
    flexDirection: 'row',
    alignItems: 'center',
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
