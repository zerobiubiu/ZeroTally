/**
 * 约束简报（Workflow B / C）：
 * - 已归档账户二级页：仅保留明细入口，不参与任何统计与记账；点按进入账户详情，可在「编辑」中恢复或删除
 * - 信息层级：主（账户列表）、弱（顶部一句状态说明）；空状态仅短文案
 */
import { Stack, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { ScrollView } from 'react-native-gesture-handler';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useDatabase } from '../src/db/database-context';
import { AccountRow } from '../src/features/accounts/components/AccountRow';
import { getAssetOverview } from '../src/features/accounts/service';
import type { Account } from '../src/features/accounts/types';
import { EmptyState } from '../src/shared/ui/EmptyState';
import { SafeScreen } from '../src/shared/ui/SafeScreen';
import { useTheme } from '../src/theme/theme-context';

export default function ArchivedAccountsScreen(): React.JSX.Element {
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { db, revision } = useDatabase();

  const [accounts, setAccounts] = useState<Account[]>([]);

  useEffect(() => {
    let active = true;
    void (async () => {
      const overview = await getAssetOverview(db);
      if (active) {
        setAccounts(overview.archivedAccounts);
      }
    })();
    return () => {
      active = false;
    };
  }, [db, revision]);

  const handlePressAccount = useCallback(
    (account: Account) => {
      router.push({ pathname: '/account-detail', params: { id: account.id } });
    },
    [router]
  );

  return (
    <SafeScreen edges={['left', 'right']}>
      <Stack.Screen options={{ title: '已归档账户' }} />
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{
          padding: theme.spacing.lg,
          paddingBottom: Math.max(insets.bottom, theme.spacing.lg) + theme.spacing.xl,
        }}
      >
        {accounts.length === 0 ? (
          <EmptyState icon="archive-outline" title="暂无归档账户" />
        ) : (
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
            {accounts.map((acc, idx) => (
              <AccountRow
                key={acc.id}
                account={acc}
                onPress={handlePressAccount}
                showDivider={idx < accounts.length - 1}
              />
            ))}
          </View>
        )}
      </ScrollView>
    </SafeScreen>
  );
}

const styles = StyleSheet.create({
  groupCard: {
    overflow: 'hidden',
  },
});