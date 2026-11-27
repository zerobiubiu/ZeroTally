/**
 * 约束简报（Workflow B / C）：
 * - 极简无分组布局：彻底去除统计头、「配置/数据导出/系统」二级分组标题、存储行与独立版本条目
 * - 信息顺序（严格按用户设计）：顶栏右侧「i」图标直达关于（移除右上角 X）-> 外观设置（系统/浅色/深色）置顶 -> 分类管理 -> 云备份 -> 高级设置 -> 最底部居中版本号
 * - 复用形态：同时支持左侧抽屉（variant="drawer"）与独立设置页（variant="page"），外观切换即时落盘 SQLite
 */
import Constants from 'expo-constants';
import { useRouter } from 'expo-router';
import React from 'react';
import { Platform, Pressable, StatusBar as RNStatusBar, StyleSheet, Text, View } from 'react-native';
import { ScrollView } from 'react-native-gesture-handler';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useDatabase } from '../../../db/database-context';
import { hapticLight } from '../../../shared/haptics/haptics';
import { AppIcon } from '../../../shared/ui/AppIcon';
import { SlidingSegmentedControl } from '../../../shared/ui/SlidingSegmentedControl';
import { useTheme, type ThemePreference } from '../../../theme/theme-context';
import { setThemePreferenceSetting } from '../repository';

const THEME_OPTIONS: readonly { value: ThemePreference; label: string }[] = [
  { value: 'system', label: '系统' },
  { value: 'light', label: '浅色' },
  { value: 'dark', label: '深色' },
];

export interface SettingsPanelProps {
  variant?: 'drawer' | 'page';
  onClose?: () => void;
}

export function SettingsPanel({
  variant = 'page',
  onClose,
}: SettingsPanelProps): React.JSX.Element {
  const { theme, preference, setPreference } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { db } = useDatabase();

  const appVersion = Constants.expoConfig?.version ?? '1.0.0';
  const isDrawer = variant === 'drawer';
  const topInset = isDrawer
    ? Platform.OS === 'android'
      ? Math.max(insets.top, RNStatusBar.currentHeight ?? 0)
      : insets.top
    : 0;

  const handleSelectTheme = (next: ThemePreference) => {
    if (next === preference) {
      return;
    }
    setPreference(next);
    void setThemePreferenceSetting(db, next).catch(() => {});
  };

  const navigateTo = (
    pathname:
      | '/categories'
      | '/recurring'
      | '/budgets'
      | '/cloud-backup'
      | '/security'
      | '/gestures-guide'
      | '/about'
      | '/advanced-settings'
  ) => {
    hapticLight();
    onClose?.();
    router.push(pathname);
  };

  const menuItems: readonly {
    key: string;
    label: string;
    icon: string;
    onPress: () => void;
  }[] = [
    {
      key: 'categories',
      label: '分类管理',
      icon: 'pricetags-outline',
      onPress: () => navigateTo('/categories'),
    },
    {
      key: 'recurring',
      label: '周期账单',
      icon: 'repeat-outline',
      onPress: () => navigateTo('/recurring'),
    },
    {
      key: 'budgets',
      label: '预算管理',
      icon: 'pie-chart-outline',
      onPress: () => navigateTo('/budgets'),
    },
    {
      key: 'cloud-backup',
      label: '云备份',
      icon: 'cloud-upload-outline',
      onPress: () => navigateTo('/cloud-backup'),
    },
    {
      key: 'security',
      label: '隐私与安全',
      icon: 'shield-checkmark-outline',
      onPress: () => navigateTo('/security'),
    },
    {
      key: 'gestures-guide',
      label: '手势与快捷技巧',
      icon: 'hand-left-outline',
      onPress: () => navigateTo('/gestures-guide'),
    },
    {
      key: 'advanced',
      label: '高级设置',
      icon: 'construct-outline',
      onPress: () => navigateTo('/advanced-settings'),
    },
  ];

  return (
    <View style={[styles.container, { backgroundColor: theme.colors.surface }]}>
      {isDrawer ? (
        <View
          style={[
            styles.drawerHeader,
            {
              backgroundColor: theme.colors.heroBg,
              paddingTop: topInset + theme.spacing.md,
              paddingHorizontal: theme.spacing.lg,
              paddingBottom: theme.spacing.lg,
            },
          ]}
        >
          <Text
            numberOfLines={1}
            style={{
              flex: 1,
              color: theme.colors.heroText,
              fontSize: theme.fontSize.xxl,
              fontWeight: theme.fontWeight.semibold,
              letterSpacing: -0.4,
            }}
          >
            ZeroTally
          </Text>

          <Pressable
            accessibilityRole="button"
            accessibilityLabel="关于"
            onPress={() => navigateTo('/about')}
            hitSlop={10}
            style={({ pressed }) => [
              styles.drawerHeaderActionBtn,
              pressed && { opacity: theme.opacity.pressed },
            ]}
          >
            <AppIcon
              name="information-circle-outline"
              size={24}
              color={theme.colors.heroText}
            />
          </Pressable>
        </View>
      ) : null}

      <ScrollView
        style={styles.flex}
        contentContainerStyle={[
          styles.scrollContent,
          {
            paddingHorizontal: theme.spacing.lg,
            paddingTop: theme.spacing.lg,
            paddingBottom: Math.max(insets.bottom, theme.spacing.lg) + theme.spacing.md,
          },
        ]}
      >
        <View style={{ gap: theme.spacing.md }}>
          {/* 最上方：外观切换（系统 / 浅色 / 深色） */}
          <View
            style={[
              styles.appearanceCard,
              theme.elevation.card,
              {
                backgroundColor: theme.colors.surfaceRaised,
                borderRadius: theme.radius.lg,
                padding: theme.spacing.md,
              },
            ]}
          >
            <Text
              style={{
                color: theme.colors.text,
                fontSize: theme.fontSize.sm,
                fontWeight: theme.fontWeight.semibold,
                marginBottom: theme.spacing.sm,
              }}
            >
              外观
            </Text>
            <SlidingSegmentedControl
              options={THEME_OPTIONS}
              value={preference}
              onChange={handleSelectTheme}
              fullWidth
              height={42}
              shape="pill"
              trackTone="surface"
              textSize="sm"
            />
          </View>

          {/* 同级独立功能按钮：分类管理 -> 高级设置 */}
          {menuItems.map((item) => (
            <Pressable
              key={item.key}
              accessibilityRole="button"
              accessibilityLabel={item.label}
              onPress={item.onPress}
              style={({ pressed }) => [
                styles.menuCard,
                theme.elevation.card,
                {
                  backgroundColor: theme.colors.surfaceRaised,
                  borderRadius: theme.radius.lg,
                  paddingHorizontal: theme.spacing.md,
                },
                pressed && { opacity: theme.opacity.pressed },
              ]}
            >
              <View
                style={[
                  styles.menuIconWrap,
                  {
                    backgroundColor: theme.colors.actionSubtle,
                    borderRadius: theme.radius.full,
                  },
                ]}
              >
                <AppIcon name={item.icon} size={18} color={theme.colors.actionTextOnSubtle} />
              </View>
              <Text
                style={{
                  flex: 1,
                  color: theme.colors.text,
                  fontSize: theme.fontSize.base,
                  fontWeight: theme.fontWeight.semibold,
                }}
              >
                {item.label}
              </Text>
              <AppIcon name="chevron-forward" size={18} color={theme.colors.textMuted} />
            </Pressable>
          ))}
        </View>

        {/* 最底部居中版本标识 */}
        <View style={styles.versionFooter}>
          <Text
            style={{
              color: theme.colors.textMuted,
              fontSize: theme.fontSize.xs,
            }}
          >
            ZeroTally v{appVersion}
          </Text>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  flex: {
    flex: 1,
  },
  drawerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  drawerHeaderActionBtn: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'space-between',
  },
  appearanceCard: {},
  menuCard: {
    minHeight: 56,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  menuIconWrap: {
    width: 34,
    height: 34,
    alignItems: 'center',
    justifyContent: 'center',
  },
  versionFooter: {
    alignItems: 'center',
    paddingTop: 32,
    paddingBottom: 4,
  },
});
