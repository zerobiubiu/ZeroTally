import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React, { useEffect, useRef } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { initialWindowMetrics, SafeAreaProvider } from 'react-native-safe-area-context';
import { DatabaseProvider, useDatabaseContext } from '../src/db/database-context';
import { runAutoCloudBackupIfNeeded } from '../src/features/cloud-backup/service';
import { processAutoDueRecurringPlans } from '../src/features/recurring/service';
import { AppLockOverlay } from '../src/features/security/components/AppLockOverlay';
import { SecurityProvider } from '../src/features/security/security-context';
import { getThemePreferenceSetting } from '../src/features/settings/repository';
import { AppErrorBoundary } from '../src/shared/ui/AppErrorBoundary';
import { ThemeProvider, useTheme } from '../src/theme/theme-context';

/** 账本变动后防抖触发自动云备份的延迟毫秒数 */
const AUTO_CLOUD_BACKUP_DEBOUNCE_MS = 15_000;

function RootNavigator(): React.JSX.Element {
  const { theme, setPreference } = useTheme();
  const { db, isReady, error, revision, notifyChange } = useDatabaseContext();
  const lastObservedRevisionRef = useRef(0);
  const autoRecurringCheckedRef = useRef(false);

  // 启动时静默检查到期且开启自动入账的周期计划（幂等防重，零打扰未配置用户）
  useEffect(() => {
    if (!isReady || !db || autoRecurringCheckedRef.current) {
      return;
    }
    autoRecurringCheckedRef.current = true;
    void processAutoDueRecurringPlans(db)
      .then((res) => {
        if (res.postedCount > 0) {
          notifyChange();
        }
      })
      .catch(() => {});
  }, [db, isReady, notifyChange]);

  // 启动及导入全量备份后，从本地 SQLite 同步持久化的外观主题偏好
  useEffect(() => {
    if (!isReady || !db) {
      return;
    }
    let active = true;
    void (async () => {
      const savedPref = await getThemePreferenceSetting(db);
      if (active) {
        setPreference(savedPref);
      }
    })();
    return () => {
      active = false;
    };
  }, [db, isReady, revision, setPreference]);

  // 账本数据变更后防抖静默触发自动云备份（跳过首次启动 revision=0，不影响记账交互）
  useEffect(() => {
    if (!isReady || !db || revision === 0 || revision === lastObservedRevisionRef.current) {
      return;
    }
    lastObservedRevisionRef.current = revision;
    const timer = setTimeout(() => {
      void runAutoCloudBackupIfNeeded(db);
    }, AUTO_CLOUD_BACKUP_DEBOUNCE_MS);
    return () => {
      clearTimeout(timer);
    };
  }, [db, isReady, revision]);

  if (error) {
    return (
      <View style={[styles.center, { backgroundColor: theme.colors.surface }]}>
        <Text
          style={{
            color: theme.colors.expense,
            fontSize: theme.fontSize.lg,
            fontWeight: theme.fontWeight.semibold,
          }}
        >
          数据库初始化失败
        </Text>
        <Text
          style={{
            color: theme.colors.textMuted,
            fontSize: theme.fontSize.sm,
            marginTop: theme.spacing.sm,
            textAlign: 'center',
          }}
        >
          {error}
        </Text>
      </View>
    );
  }

  if (!isReady) {
    return (
      <View style={[styles.center, { backgroundColor: theme.colors.surface }]}>
        <ActivityIndicator size="large" color={theme.colors.action} />
        <Text
          style={{
            color: theme.colors.textMuted,
            fontSize: theme.fontSize.sm,
            marginTop: theme.spacing.md,
          }}
        >
          加载中
        </Text>
      </View>
    );
  }

  return (
    <>
      <StatusBar style={theme.mode === 'dark' ? 'light' : 'dark'} />
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: theme.colors.surfaceRaised },
          headerTintColor: theme.colors.text,
          headerTitleStyle: {
            fontSize: theme.fontSize.lg,
            fontWeight: theme.fontWeight.semibold,
          },
          headerShadowVisible: false,
          contentStyle: { backgroundColor: theme.colors.surface },
        }}
      >
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen
          name="record"
          options={{
            title: '记一笔',
            presentation: 'transparentModal',
            animation: 'slide_from_bottom',
            headerShown: false,
            contentStyle: { backgroundColor: 'transparent' },
          }}
        />
        <Stack.Screen
          name="repayment"
          options={{
            title: '负债还款',
            presentation: 'transparentModal',
            animation: 'slide_from_bottom',
            headerShown: false,
            contentStyle: { backgroundColor: 'transparent' },
          }}
        />
        <Stack.Screen
          name="analytics"
          options={{
            title: '账务分析',
          }}
        />
        <Stack.Screen
          name="search"
          options={{
            title: '搜索账单',
            headerShown: false,
          }}
        />
        <Stack.Screen
          name="account-form"
          options={{
            title: '账户',
            presentation: 'modal',
          }}
        />
        <Stack.Screen
          name="account-detail"
          options={{
            title: '账户详情',
          }}
        />
        <Stack.Screen
          name="archived-accounts"
          options={{
            title: '已归档账户',
          }}
        />
        <Stack.Screen
          name="categories"
          options={{
            title: '分类管理',
          }}
        />
        <Stack.Screen
          name="cloud-backup"
          options={{
            title: '云备份',
          }}
        />
        <Stack.Screen
          name="security"
          options={{
            title: '隐私与安全',
          }}
        />
        <Stack.Screen
          name="budgets"
          options={{
            title: '预算管理',
          }}
        />
        <Stack.Screen
          name="recurring"
          options={{
            title: '周期账单',
          }}
        />
        <Stack.Screen
          name="batch-record"
          options={{
            title: '快捷批量记账',
          }}
        />
        <Stack.Screen
          name="gestures-guide"
          options={{
            title: '手势与快捷技巧',
          }}
        />
        <Stack.Screen
          name="about"
          options={{
            title: '关于',
          }}
        />
        <Stack.Screen
          name="privacy"
          options={{
            title: '隐私说明',
          }}
        />
        <Stack.Screen
          name="advanced-settings"
          options={{
            title: '高级设置',
          }}
        />
        <Stack.Screen
          name="settings"
          options={{
            title: '设置',
          }}
        />
      </Stack>
      <AppLockOverlay />
    </>
  );
}

export default function RootLayout(): React.JSX.Element {
  return (
    <AppErrorBoundary>
      <GestureHandlerRootView style={styles.root}>
        <SafeAreaProvider initialMetrics={initialWindowMetrics}>
          <ThemeProvider>
            <DatabaseProvider>
              <SecurityProvider>
                <RootNavigator />
              </SecurityProvider>
            </DatabaseProvider>
          </ThemeProvider>
        </SafeAreaProvider>
      </GestureHandlerRootView>
    </AppErrorBoundary>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
});
