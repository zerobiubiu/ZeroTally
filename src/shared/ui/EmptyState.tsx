import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../../theme/theme-context';
import { AppIcon } from './AppIcon';
import { Button } from './Button';

interface EmptyStateProps {
  icon: string;
  title: string;
  description?: string;
  actionLabel?: string;
  onAction?: () => void;
}

export function EmptyState({
  icon,
  title,
  description,
  actionLabel,
  onAction,
}: EmptyStateProps): React.JSX.Element {
  const { theme } = useTheme();

  return (
    <View
      style={[
        styles.container,
        {
          backgroundColor: theme.colors.surfaceRaised,
          borderColor: theme.colors.border,
          borderRadius: theme.radius.lg,
          paddingVertical: theme.spacing.xl,
          paddingHorizontal: theme.spacing.lg,
        },
      ]}
    >
      <View
        style={[
          styles.iconCircle,
          {
            backgroundColor: theme.colors.actionSubtle,
            borderRadius: theme.radius.full,
          },
        ]}
      >
        <AppIcon name={icon} size={24} color={theme.colors.actionTextOnSubtle} />
      </View>

      <Text
        style={[
          styles.title,
          {
            color: theme.colors.text,
            fontSize: theme.fontSize.base,
            fontWeight: theme.fontWeight.semibold,
            marginTop: theme.spacing.md,
          },
        ]}
      >
        {title}
      </Text>

      {description ? (
        <Text
          style={[
            styles.description,
            {
              color: theme.colors.textMuted,
              fontSize: theme.fontSize.xs,
              marginTop: theme.spacing.xs,
            },
          ]}
        >
          {description}
        </Text>
      ) : null}

      {actionLabel && onAction ? (
        <Button
          label={actionLabel}
          size="sm"
          onPress={onAction}
          style={{ marginTop: theme.spacing.lg, minWidth: 132 }}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    borderWidth: 1,
  },
  iconCircle: {
    width: 48,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    textAlign: 'center',
  },
  description: {
    textAlign: 'center',
    lineHeight: 18,
    maxWidth: 240,
  },
});
