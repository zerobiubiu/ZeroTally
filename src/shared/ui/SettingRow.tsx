import React from 'react';
import { Pressable, StyleSheet, Switch, Text, View } from 'react-native';
import { useTheme } from '../../theme/theme-context';
import { AppIcon } from './AppIcon';
import { InsetDivider } from './InsetDivider';

export type SettingIconTone = 'action' | 'transfer' | 'expense' | 'warning' | 'neutral';

export interface SettingSwitchRowProps {
  title: string;
  subtitle?: string;
  value: boolean;
  disabled?: boolean;
  onValueChange: (next: boolean) => void;
  showDivider?: boolean;
}

/**
 * 统一开关配置行（标题 + 可选精简副文案 + 原生风格 Switch）。
 */
export function SettingSwitchRow({
  title,
  subtitle,
  value,
  disabled = false,
  onValueChange,
  showDivider = false,
}: SettingSwitchRowProps): React.JSX.Element {
  const { theme } = useTheme();
  return (
    <>
      <View style={styles.row}>
        <View style={styles.textWrap}>
          <Text
            style={{
              color: theme.colors.text,
              fontSize: 15,
              fontWeight: theme.fontWeight.semibold,
            }}
          >
            {title}
          </Text>
          {subtitle ? (
            <Text
              style={{
                color: theme.colors.textMuted,
                fontSize: 12,
                marginTop: 2,
                lineHeight: 17,
              }}
            >
              {subtitle}
            </Text>
          ) : null}
        </View>
        <Switch
          value={value}
          disabled={disabled}
          onValueChange={onValueChange}
          trackColor={{ false: theme.colors.chipInactive, true: theme.colors.action }}
          thumbColor={theme.colors.surfaceRaised}
        />
      </View>
      {showDivider ? <InsetDivider /> : null}
    </>
  );
}

export interface SettingLinkRowProps {
  title: string;
  subtitle?: string;
  icon?: string;
  iconTone?: SettingIconTone;
  valueText?: string;
  destructive?: boolean;
  showChevron?: boolean;
  rightAccessory?: React.ReactNode;
  disabled?: boolean;
  accessibilityLabel?: string;
  accessibilityRole?: 'button' | 'link';
  onPress?: () => void;
  showDivider?: boolean;
  compact?: boolean;
}

/**
 * 统一导航/操作设置行（可选左侧柔和圆角图标徽章 + 标题/说明 + 右侧值/箭头）。
 */
export function SettingLinkRow({
  title,
  subtitle,
  icon,
  iconTone = 'action',
  valueText,
  destructive = false,
  showChevron = true,
  rightAccessory,
  disabled = false,
  accessibilityLabel,
  accessibilityRole = 'button',
  onPress,
  showDivider = false,
  compact = false,
}: SettingLinkRowProps): React.JSX.Element {
  const { theme } = useTheme();

  const iconPalette = (() => {
    switch (iconTone) {
      case 'transfer':
        return { bg: theme.colors.transferSubtle, fg: theme.colors.transferTextOnSubtle };
      case 'expense':
        return { bg: theme.colors.expenseSubtle, fg: theme.colors.expense };
      case 'warning':
        return { bg: theme.colors.warningSubtle, fg: theme.colors.warningTextOnSubtle };
      case 'neutral':
        return { bg: theme.colors.surfaceGrouped, fg: theme.colors.textSecondary };
      default:
        return { bg: theme.colors.actionSurface, fg: theme.colors.action };
    }
  })();

  const content = (
    <View style={[styles.row, compact && styles.compactRow]}>
      {icon ? (
        <View
          style={[
            compact ? styles.iconWrapCompact : styles.iconWrap,
            { backgroundColor: iconPalette.bg, borderRadius: 10 },
          ]}
        >
          <AppIcon name={icon} size={compact ? 17 : 18} color={iconPalette.fg} />
        </View>
      ) : null}

      <View style={styles.textWrap}>
        <Text
          numberOfLines={1}
          style={{
            color: destructive ? theme.colors.expense : theme.colors.text,
            fontSize: compact ? theme.fontSize.sm : 15,
            fontWeight: theme.fontWeight.semibold,
          }}
        >
          {title}
        </Text>
        {subtitle ? (
          <Text
            style={{
              color: theme.colors.textMuted,
              fontSize: 12,
              marginTop: 2,
              lineHeight: 17,
            }}
          >
            {subtitle}
          </Text>
        ) : null}
      </View>

      {rightAccessory ? (
        rightAccessory
      ) : (
        <View style={styles.rightWrap}>
          {valueText ? (
            <Text style={{ color: theme.colors.textMuted, fontSize: 13 }}>{valueText}</Text>
          ) : null}
          {showChevron ? (
            <AppIcon
              name="chevron-forward"
              size={16}
              color={destructive ? theme.colors.expense : theme.colors.placeholder}
            />
          ) : null}
        </View>
      )}
    </View>
  );

  return (
    <>
      {onPress ? (
        <Pressable
          accessibilityRole={accessibilityRole}
          accessibilityLabel={accessibilityLabel ?? title}
          disabled={disabled}
          onPress={onPress}
          style={({ pressed }) => [
            disabled && { opacity: theme.opacity.disabled },
            pressed && !disabled && { opacity: theme.opacity.pressed },
          ]}
        >
          {content}
        </Pressable>
      ) : (
        content
      )}
      {showDivider ? <InsetDivider /> : null}
    </>
  );
}

const styles = StyleSheet.create({
  row: {
    minHeight: 54,
    paddingHorizontal: 16,
    paddingVertical: 11,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  compactRow: {
    minHeight: 48,
    paddingHorizontal: 14,
    paddingVertical: 9,
  },
  iconWrap: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconWrapCompact: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  textWrap: {
    flex: 1,
    minWidth: 0,
  },
  rightWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
});
