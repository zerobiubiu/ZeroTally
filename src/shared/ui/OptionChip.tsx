import React from 'react';
import { Pressable, StyleSheet, Text, type StyleProp, type ViewStyle } from 'react-native';
import { useTheme } from '../../theme/theme-context';

export interface OptionChipProps {
  label: string;
  selected: boolean;
  onPress: () => void;
  /** 等宽填充父容器 */
  flex?: boolean;
  /** 数字类标签启用等宽数字对齐 */
  tabular?: boolean;
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
}

/**
 * 统一无描边可选项胶囊（9px 圆角，选中态使用柔和主色浅底 + 主色半粗文字）。
 */
export function OptionChip({
  label,
  selected,
  onPress,
  flex = false,
  tabular = false,
  accessibilityLabel,
  style,
}: OptionChipProps): React.JSX.Element {
  const { theme } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ selected }}
      onPress={onPress}
      style={({ pressed }) => [
        styles.chip,
        flex && styles.flex,
        {
          backgroundColor: selected ? theme.colors.actionSurface : theme.colors.chipInactive,
          borderRadius: 9,
        },
        pressed && { opacity: theme.opacity.pressed },
        style,
      ]}
    >
      <Text
        numberOfLines={1}
        style={[
          tabular && styles.tabular,
          {
            color: selected ? theme.colors.actionTextOnSubtle : theme.colors.textSecondary,
            fontSize: 12,
            fontWeight: selected ? theme.fontWeight.semibold : theme.fontWeight.regular,
          },
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  chip: {
    minHeight: 34,
    paddingHorizontal: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  flex: {
    flex: 1,
  },
  tabular: {
    fontVariant: ['tabular-nums'],
  },
});
