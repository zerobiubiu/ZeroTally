/**
 * 约束简报（Workflow B / C）：
 * - 信息层级：主（居中向上凸起的 56dp 实心圆形「+」记一笔主按钮，打开应用最高频主操作 §2.8）、
 *   次（左右对称的半高底栏导航：明细 / 资产，选中态主色 + 600 字重，未选态 textMuted §2.4）
 * - 深度与重叠：凸起圆按钮采用与页面底色一致的 4px 外环描边（§6.5.1）+ floating 投影
 * - 安卓触控保障：外层容器包含上方 26dp 透明凸出区（pointerEvents="box-none"），避免安卓父容器裁剪凸出按钮点击热区
 */
import { Tabs, useRouter } from 'expo-router';
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { AppIcon } from '../../src/shared/ui/AppIcon';
import { useTheme } from '../../src/theme/theme-context';

type CustomTabBarProps = Parameters<NonNullable<React.ComponentProps<typeof Tabs>['tabBar']>>[0];

const BAR_BODY_HEIGHT = 54;
const FAB_INNER_SIZE = 54;
const FAB_RING_WIDTH = 4;
const FAB_OUTER_SIZE = FAB_INNER_SIZE + FAB_RING_WIDTH * 2;
const FAB_LABEL_BLOCK_HEIGHT = 18;
const FAB_PROTRUSION = FAB_OUTER_SIZE + FAB_LABEL_BLOCK_HEIGHT - BAR_BODY_HEIGHT;

const TAB_ITEMS: Record<string, { label: string; icon: string; activeIcon: string }> = {
  index: {
    label: '明细',
    icon: 'receipt-outline',
    activeIcon: 'receipt',
  },
  assets: {
    label: '资产',
    icon: 'wallet-outline',
    activeIcon: 'wallet',
  },
};

function CustomTabBar({
  state,
  emitter,
  navigateToTab,
  insets,
}: CustomTabBarProps): React.JSX.Element {
  const { theme } = useTheme();
  const router = useRouter();

  const bottomInset = Math.max(insets.bottom, theme.spacing.xs);
  const barTotalHeight = BAR_BODY_HEIGHT + bottomInset;
  const containerHeight = barTotalHeight + FAB_PROTRUSION;

  const renderTab = (routeName: 'index' | 'assets'): React.JSX.Element | null => {
    const routeIndex = state.routes.findIndex((r) => r.name === routeName);
    if (routeIndex === -1) {
      return null;
    }
    const route = state.routes[routeIndex]!;
    const isFocused = state.index === routeIndex;
    const meta = TAB_ITEMS[route.name] ?? {
      label: route.name,
      icon: 'ellipse-outline',
      activeIcon: 'ellipse',
    };
    const color = isFocused ? theme.colors.action : theme.colors.textMuted;

    const onPress = () => {
      const event = emitter.emit({
        type: 'tabPress',
        target: route.key,
        canPreventDefault: true,
      });
      if (!isFocused && !event.defaultPrevented) {
        navigateToTab(route.key);
      }
    };

    return (
      <Pressable
        key={route.key}
        accessibilityRole="tab"
        accessibilityLabel={meta.label}
        accessibilityState={{ selected: isFocused }}
        onPress={onPress}
        style={({ pressed }) => [
          styles.tabItem,
          { height: BAR_BODY_HEIGHT },
          pressed && { opacity: theme.opacity.pressed },
        ]}
      >
        <AppIcon name={isFocused ? meta.activeIcon : meta.icon} size={20} color={color} />
        <Text
          style={{
            color,
            fontSize: theme.fontSize.xs,
            fontWeight: isFocused ? theme.fontWeight.semibold : theme.fontWeight.regular,
            marginTop: 2,
          }}
        >
          {meta.label}
        </Text>
      </Pressable>
    );
  };

  return (
    <View pointerEvents="box-none" style={[styles.outerContainer, { height: containerHeight }]}>
      {/* 半高底栏实体背景，沉在底部，让出上方凸出透明区域 */}
      <View
        style={[
          styles.barBackdrop,
          {
            height: barTotalHeight,
            backgroundColor: theme.colors.surfaceRaised,
            borderTopColor: theme.colors.border,
            borderTopWidth: theme.borderWidth.hairline,
          },
        ]}
      />

      {/* 三段对称交互行：左明细 · 中凸起「+」记一笔 · 右资产 */}
      <View
        pointerEvents="box-none"
        style={[
          styles.itemsRow,
          {
            paddingLeft: insets.left,
            paddingRight: insets.right,
            paddingBottom: bottomInset,
            height: containerHeight,
          },
        ]}
      >
        {renderTab('index')}

        <View pointerEvents="box-none" style={styles.centerSlot}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="记一笔"
            accessibilityHint="快速新增支出、收入或转账记录"
            onPress={() => router.push('/record')}
            style={({ pressed }) => [
              styles.fabOuterRing,
              {
                width: FAB_OUTER_SIZE,
                height: FAB_OUTER_SIZE,
                borderRadius: theme.radius.full,
                backgroundColor: theme.colors.surface,
              },
              pressed && { transform: [{ scale: 0.96 }] },
            ]}
          >
            <View
              style={[
                styles.fabInner,
                theme.elevation.floating,
                {
                  width: FAB_INNER_SIZE,
                  height: FAB_INNER_SIZE,
                  borderRadius: theme.radius.full,
                  backgroundColor: theme.colors.action,
                },
              ]}
            >
              <AppIcon name="add" size={30} color={theme.colors.onAction} />
            </View>
          </Pressable>
          <Text
            style={{
              color: theme.colors.action,
              fontSize: theme.fontSize.xs,
              lineHeight: 14,
              fontWeight: theme.fontWeight.semibold,
              marginTop: 2,
              marginBottom: 2,
            }}
          >
            记一笔
          </Text>
        </View>

        {renderTab('assets')}
      </View>
    </View>
  );
}

export default function TabsLayout(): React.JSX.Element {
  return (
    <Tabs
      screenOptions={{ headerShown: false }}
      tabBar={(props) => <CustomTabBar {...props} />}
    >
      <Tabs.Screen name="index" options={{ title: '明细' }} />
      <Tabs.Screen name="assets" options={{ title: '资产' }} />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  outerContainer: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
  },
  barBackdrop: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
  },
  itemsRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
  },
  tabItem: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  centerSlot: {
    width: 96,
    alignItems: 'center',
    justifyContent: 'flex-end',
  },
  fabOuterRing: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  fabInner: {
    alignItems: 'center',
    justifyContent: 'center',
  },
});
