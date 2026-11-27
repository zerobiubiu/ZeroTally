import React from 'react';
import { Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { useTheme } from '../../theme/theme-context';
import { AppIcon } from './AppIcon';

export type InlineNoticeTone = 'info' | 'success' | 'warning' | 'danger';

export interface InlineNoticeProps {
  text: string;
  tone?: InlineNoticeTone;
  onDismiss?: () => void;
  style?: StyleProp<ViewStyle>;
}

/**
 * 统一轻提示反馈横幅（取代各页重复的状态反馈容器）。
 */
export function InlineNotice({
  text,
  tone = 'info',
  onDismiss,
  style,
}: InlineNoticeProps): React.JSX.Element {
  const { theme } = useTheme();

  const palette = (() => {
    switch (tone) {
      case 'success':
        return {
          bg: theme.colors.actionSurface,
          fg: theme.colors.actionTextOnSubtle,
          iconColor: theme.colors.action,
          icon: 'checkmark-circle-outline',
        };
      case 'warning':
        return {
          bg: theme.colors.warningSubtle,
          fg: theme.colors.warningTextOnSubtle,
          iconColor: theme.colors.warningTextOnSubtle,
          icon: 'alert-circle-outline',
        };
      case 'danger':
        return {
          bg: theme.colors.expenseSubtle,
          fg: theme.colors.expenseTextOnSubtle,
          iconColor: theme.colors.expense,
          icon: 'close-circle-outline',
        };
      default:
        return {
          bg: theme.colors.actionSurface,
          fg: theme.colors.actionTextOnSubtle,
          iconColor: theme.colors.action,
          icon: 'information-circle-outline',
        };
    }
  })();

  return (
    <View
      style={[
        styles.bar,
        { backgroundColor: palette.bg, borderRadius: 10 },
        style,
      ]}
    >
      <AppIcon name={palette.icon} size={16} color={palette.iconColor} />
      <Text
        style={{
          flex: 1,
          color: palette.fg,
          fontSize: 12,
          fontWeight: theme.fontWeight.semibold,
          lineHeight: 17,
        }}
      >
        {text}
      </Text>
      {onDismiss ? (
        <Pressable accessibilityRole="button" accessibilityLabel="关闭提示" onPress={onDismiss} hitSlop={8}>
          <AppIcon name="close" size={14} color={palette.iconColor} />
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
});
