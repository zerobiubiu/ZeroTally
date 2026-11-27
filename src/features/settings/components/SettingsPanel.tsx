/**
 * 约束简报（Workflow B / C）：
 * - 极简分组侧栏布局：顶栏右侧「i」图标直达关于 -> 外观切换（系统/浅色/深色）置顶 -> 紧凑无描边功能卡片组 -> 底部居中版本号
 * - 统一复用 SurfaceCard 与 compact SettingLinkRow，保持全部功能顺序与单手触达效率不变
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
import { SettingLinkRow } from '../../../shared/ui/SettingRow';
import { SlidingSegmentedControl } from '../../../shared/ui/SlidingSegmentedControl';
import { SurfaceCard } from '../../../shared/ui/SurfaceCard';
import { useTheme, type ThemePreference } from '../../../theme/theme-context';
import { setThemePreferenceSetting } from '../repository';

const THEME_OPTIONS: readonly { value: ThemePreference; label: string }[] = [
  { value: 'system', label: '系统' },
  { value: 'light', label: '浅色' },
  { value: 'dark', label: '深色' },
];

type SettingsRoutePath =
  | '/categories'
  | '/recurring'
  | '/budgets'
  | '/reimbursements'
  | '/cloud-backup'
  | '/security'
  | '/reminders'
  | '/gestures-guide'
  | '/about'
  | '/advanced-settings';

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

  const appVersion = Constants.expoConfig?.version ?? '2.0.0';
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

  const navigateTo = (pathname: SettingsRoutePath) => {
    hapticLight();
    onClose?.();
    router.push(pathname);
  };

  const primaryGroup: readonly { key: string; label: string; icon: string; path: SettingsRoutePath }[] = [
    { key: 'categories', label: '分类管理', icon: 'pricetags-outline', path: '/categories' },
    { key: 'recurring', label: '周期账单', icon: 'repeat-outline', path: '/recurring' },
    { key: 'budgets', label: '预算管理', icon: 'pie-chart-outline', path: '/budgets' },
    { key: 'reimbursements', label: '报销追踪', icon: 'receipt-outline', path: '/reimbursements' },
  ];

  const systemGroup: readonly { key: string; label: string; icon: string; path: SettingsRoutePath }[] = [
    { key: 'cloud-backup', label: '云备份', icon: 'cloud-upload-outline', path: '/cloud-backup' },
    { key: 'security', label: '隐私与安全', icon: 'shield-checkmark-outline', path: '/security' },
    { key: 'reminders', label: '提醒与小组件', icon: 'notifications-outline', path: '/reminders' },
    { key: 'gestures-guide', label: '手势与快捷技巧', icon: 'hand-left-outline', path: '/gestures-guide' },
    { key: 'advanced', label: '高级设置', icon: 'construct-outline', path: '/advanced-settings' },
  ];

  return (
    <View style={[styles.container, { backgroundColor: theme.colors.surfaceGrouped }]}>
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
            paddingHorizontal: 14,
            paddingTop: 14,
            paddingBottom: Math.max(insets.bottom, 16) + 12,
          },
        ]}
      >
        <View style={{ gap: 12 }}>
          {/* 最上方：外观切换（系统 / 浅色 / 深色） */}
          <SurfaceCard padding="md">
            <Text
              style={{
                color: theme.colors.textMuted,
                fontSize: theme.fontSize.xs,
                fontWeight: theme.fontWeight.semibold,
                marginBottom: 8,
              }}
            >
              外观
            </Text>
            <SlidingSegmentedControl
              options={THEME_OPTIONS}
              value={preference}
              onChange={handleSelectTheme}
              fullWidth
              height={40}
              shape="pill"
              trackTone="surface"
              textSize="sm"
            />
          </SurfaceCard>

          {/* 账务与扩展能力 */}
          <SurfaceCard>
            {primaryGroup.map((item, idx) => (
              <SettingLinkRow
                key={item.key}
                title={item.label}
                icon={item.icon}
                compact
                onPress={() => navigateTo(item.path)}
                showDivider={idx < primaryGroup.length - 1}
              />
            ))}
          </SurfaceCard>

          {/* 数据、隐私与系统 */}
          <SurfaceCard>
            {systemGroup.map((item, idx) => (
              <SettingLinkRow
                key={item.key}
                title={item.label}
                icon={item.icon}
                compact
                onPress={() => navigateTo(item.path)}
                showDivider={idx < systemGroup.length - 1}
              />
            ))}
          </SurfaceCard>
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
  versionFooter: {
    alignItems: 'center',
    paddingTop: 20,
    paddingBottom: 6,
  },
});
