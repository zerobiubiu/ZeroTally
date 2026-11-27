import React from 'react';
import { StyleSheet, View } from 'react-native';
import { useTheme } from '../../theme/theme-context';

export interface InsetDividerProps {
  /** 左右缩进像素，默认 16px，不顶格切断卡片 */
  inset?: number;
}

/**
 * 卡片内部极浅缩进分割线。
 */
export function InsetDivider({ inset = 16 }: InsetDividerProps): React.JSX.Element {
  const { theme } = useTheme();
  return (
    <View
      style={[
        styles.line,
        {
          backgroundColor: theme.colors.divider,
          marginHorizontal: inset,
        },
      ]}
    />
  );
}

const styles = StyleSheet.create({
  line: {
    height: StyleSheet.hairlineWidth,
  },
});
