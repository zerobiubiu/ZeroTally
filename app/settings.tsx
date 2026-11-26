/**
 * 设置路由页（薄壳）：
 * 主入口已迁移至主界面左上角汉堡菜单展开的侧边抽屉（SettingsDrawer），
 * 本路由复用同一 SettingsPanel 组件以兼容直达路径访问。
 */
import { Stack } from 'expo-router';
import React from 'react';
import { SettingsPanel } from '../src/features/settings/components/SettingsPanel';
import { SafeScreen } from '../src/shared/ui/SafeScreen';

export default function SettingsScreen(): React.JSX.Element {
  return (
    <SafeScreen edges={['left', 'right']}>
      <Stack.Screen options={{ title: '设置' }} />
      <SettingsPanel variant="page" />
    </SafeScreen>
  );
}
