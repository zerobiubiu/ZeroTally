import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { initialWindowMetrics, SafeAreaProvider } from 'react-native-safe-area-context';
import { DatabaseProvider, useDatabaseContext } from '../src/db/database-context';
import { ThemeProvider, useTheme } from '../src/theme/theme-context';

function RootNavigator(): React.JSX.Element {
  const { theme } = useTheme();
  const { isReady, error } = useDatabaseContext();

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
            presentation: 'modal',
          }}
        />
        <Stack.Screen
          name="analytics"
          options={{
            title: '账务分析',
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
          name="categories"
          options={{
            title: '分类管理',
          }}
        />
        <Stack.Screen
          name="settings"
          options={{
            title: '设置',
          }}
        />
      </Stack>
    </>
  );
}

export default function RootLayout(): React.JSX.Element {
  return (
    <SafeAreaProvider initialMetrics={initialWindowMetrics}>
      <ThemeProvider>
        <DatabaseProvider>
          <RootNavigator />
        </DatabaseProvider>
      </ThemeProvider>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
});
