import React from 'react';
import {
  Platform,
  StatusBar as RNStatusBar,
  StyleSheet,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../../theme/theme-context';

export type SafeEdge = 'top' | 'bottom' | 'left' | 'right';

interface SafeScreenProps {
  children: React.ReactNode;
  /**
   * 生效的安全区边：
   * - 无原生导航栏的 Tab 主页默认 ['top', 'left', 'right']，用实体不透明顶区硬隔离系统状态栏与刘海/挖孔区
   * - 带原生 Stack 导航栏的二级页通常传 ['left', 'right']（顶部已由原生 Header 占位）
   */
  edges?: readonly SafeEdge[];
  /** 顶部状态栏安全区填充色，默认跟随页面 surface */
  topBackgroundColor?: string;
  style?: StyleProp<ViewStyle>;
}

/**
 * 异形屏 / 刘海 / 挖孔屏安全区容器。
 * Android 端对顶部安全区取 max(insets.top, StatusBar.currentHeight)，
 * 并将滚动区域严格限制在安全区下方，确保内容在任何滑动状态下都不侵入系统顶部工具栏。
 */
export function SafeScreen({
  children,
  edges = ['top', 'left', 'right'],
  topBackgroundColor,
  style,
}: SafeScreenProps): React.JSX.Element {
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();

  const hasTop = edges.includes('top');
  const hasBottom = edges.includes('bottom');
  const hasLeft = edges.includes('left');
  const hasRight = edges.includes('right');

  const androidStatusBarHeight =
    Platform.OS === 'android' ? (RNStatusBar.currentHeight ?? 0) : 0;
  const topInset = hasTop ? Math.max(insets.top, androidStatusBarHeight) : 0;
  const bottomInset = hasBottom ? insets.bottom : 0;
  const leftInset = hasLeft ? insets.left : 0;
  const rightInset = hasRight ? insets.right : 0;

  return (
    <View
      style={[
        styles.root,
        {
          backgroundColor: theme.colors.surface,
          paddingLeft: leftInset,
          paddingRight: rightInset,
          paddingBottom: bottomInset,
        },
        style,
      ]}
    >
      {topInset > 0 ? (
        <View
          style={{
            height: topInset,
            backgroundColor: topBackgroundColor ?? theme.colors.surface,
          }}
        />
      ) : null}
      <View style={styles.content}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  content: {
    flex: 1,
    overflow: 'hidden',
  },
});
