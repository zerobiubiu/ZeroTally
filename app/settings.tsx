/**
 * 设置路由页（薄壳）：
 * 主入口已迁移至主界面点击标题或右滑展开的侧边抽屉（SettingsDrawer），
 * 本路由复用同一 SettingsPanel 组件并在顶栏右侧提供纯「i」图标直达关于页。
 */
import { Stack, useRouter } from 'expo-router';
import React from 'react';
import { Pressable, StyleSheet } from 'react-native';
import { SettingsPanel } from '../src/features/settings/components/SettingsPanel';
import { hapticLight } from '../src/shared/haptics/haptics';
import { AppIcon } from '../src/shared/ui/AppIcon';
import { SafeScreen } from '../src/shared/ui/SafeScreen';
import { useTheme } from '../src/theme/theme-context';

export default function SettingsScreen(): React.JSX.Element {
  const { theme } = useTheme();
  const router = useRouter();

  return (
    <SafeScreen edges={['left', 'right']}>
      <Stack.Screen
        options={{
          title: '设置',
          headerRight: () => (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="关于"
              hitSlop={10}
              onPress={() => {
                hapticLight();
                router.push('/about');
              }}
              style={({ pressed }) => [
                styles.headerIconBtn,
                pressed && { opacity: theme.opacity.pressed },
              ]}
            >
              <AppIcon
                name="information-circle-outline"
                size={23}
                color={theme.colors.text}
              />
            </Pressable>
          ),
        }}
      />
      <SettingsPanel variant="page" />
    </SafeScreen>
  );
}

const styles = StyleSheet.create({
  headerIconBtn: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
