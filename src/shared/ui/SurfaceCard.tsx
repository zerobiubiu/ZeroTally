import React from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { useTheme } from '../../theme/theme-context';

export interface SurfaceCardProps {
  children: React.ReactNode;
  /** 内边距预设：none 适合列表行容器，md/lg 适合表单与摘要卡 */
  padding?: 'none' | 'md' | 'lg';
  style?: StyleProp<ViewStyle>;
}

/**
 * 统一无外描边纯白卡片容器（14px 圆角，依赖画布底色差构建层级）。
 */
export function SurfaceCard({
  children,
  padding = 'none',
  style,
}: SurfaceCardProps): React.JSX.Element {
  const { theme } = useTheme();
  const paddingValue = padding === 'lg' ? 16 : padding === 'md' ? 14 : 0;

  return (
    <View
      style={[
        styles.card,
        {
          backgroundColor: theme.colors.surfaceRaised,
          borderRadius: 14,
          padding: paddingValue,
        },
        style,
      ]}
    >
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    overflow: 'hidden',
  },
});
