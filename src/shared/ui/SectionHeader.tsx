import React from 'react';
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { useTheme } from '../../theme/theme-context';

export interface SectionHeaderProps {
  title: string;
  /** 可选右侧轻量提示文案或操作节点 */
  right?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}

/**
 * 统一分组小标题（12px 弱化字色，与下方卡片保持 6px~8px 紧凑亲密间距）。
 */
export function SectionHeader({ title, right, style }: SectionHeaderProps): React.JSX.Element {
  const { theme } = useTheme();
  return (
    <View style={[styles.row, style]}>
      <Text
        style={{
          color: theme.colors.textMuted,
          fontSize: theme.fontSize.xs,
          fontWeight: theme.fontWeight.semibold,
        }}
      >
        {title}
      </Text>
      {typeof right === 'string' ? (
        <Text style={{ color: theme.colors.textMuted, fontSize: 11 }}>{right}</Text>
      ) : (
        right ?? null
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 4,
    marginBottom: 6,
  },
});
