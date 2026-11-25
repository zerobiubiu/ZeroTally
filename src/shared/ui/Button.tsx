import React from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { useTheme } from '../../theme/theme-context';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
export type ButtonSize = 'md' | 'sm';

interface ButtonProps {
  label: string;
  onPress: () => void;
  variant?: ButtonVariant;
  size?: ButtonSize;
  disabled?: boolean;
  loading?: boolean;
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
}

export function Button({
  label,
  onPress,
  variant = 'primary',
  size = 'md',
  disabled = false,
  loading = false,
  accessibilityLabel,
  style,
}: ButtonProps): React.JSX.Element {
  const { theme } = useTheme();
  const isDisabled = disabled || loading;

  const containerColors: Record<ButtonVariant, ViewStyle> = {
    primary: {
      backgroundColor: theme.colors.action,
      borderWidth: 0,
    },
    secondary: {
      backgroundColor: theme.colors.surfaceRaised,
      borderWidth: theme.borderWidth.hairline,
      borderColor: theme.colors.borderStrong,
    },
    ghost: {
      backgroundColor: 'transparent',
      borderWidth: 0,
    },
    danger: {
      backgroundColor: theme.colors.expenseSubtle,
      borderWidth: theme.borderWidth.hairline,
      borderColor: theme.colors.expense,
    },
  };

  const textColors: Record<ButtonVariant, string> = {
    primary: theme.colors.onAction,
    secondary: theme.colors.text,
    ghost: theme.colors.action,
    danger: theme.colors.expenseTextOnSubtle,
  };

  const isCompact = size === 'sm';

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ disabled: isDisabled, busy: loading }}
      disabled={isDisabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.base,
        {
          minHeight: isCompact ? 42 : 48,
          borderRadius: theme.radius.md,
          paddingHorizontal: isCompact ? theme.spacing.md : theme.spacing.lg,
        },
        containerColors[variant],
        isDisabled && { opacity: theme.opacity.disabled },
        pressed && !isDisabled && { opacity: theme.opacity.pressed },
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator size="small" color={textColors[variant]} />
      ) : (
        <Text
          numberOfLines={1}
          style={[
            styles.label,
            {
              color: textColors[variant],
              fontSize: isCompact ? theme.fontSize.sm : theme.fontSize.base,
              fontWeight: theme.fontWeight.semibold,
            },
          ]}
        >
          {label}
        </Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: {
    textAlign: 'center',
  },
});
