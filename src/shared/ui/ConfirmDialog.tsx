/**
 * 约束简报（Workflow B）：
 * - 信息层级：主（标题 + 右侧破坏性/主动作按钮）、次（可选预览内容槽与清晰说明文案）、弱（顶部图标徽章与左侧取消按钮）
 * - 视觉形态：居中圆角浮出卡片（radius.lg + elevation.floating + 轻缩放淡入动效），严格引用 useTheme() 语义令牌
 * - 挂载纪律：不可见时返回 null，避免 Android 上常驻不可见原生 Modal 窗口
 */
import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { AppIcon } from './AppIcon';
import { useTheme } from '../../theme/theme-context';

export type ConfirmDialogTone = 'destructive' | 'warning' | 'primary';

export interface ConfirmDialogProps {
  visible: boolean;
  title: string;
  message?: string;
  icon?: string;
  tone?: ConfirmDialogTone;
  confirmLabel?: string;
  cancelLabel?: string;
  /** 仅展示单个主确认按钮（用于替代系统 Alert 提示） */
  hideCancel?: boolean;
  loading?: boolean;
  error?: string | null;
  children?: React.ReactNode;
  onCancel: () => void;
  onConfirm: () => void;
}

export function ConfirmDialog({
  visible,
  title,
  message,
  icon = 'alert-circle-outline',
  tone = 'destructive',
  confirmLabel = '确认',
  cancelLabel = '取消',
  hideCancel = false,
  loading = false,
  error = null,
  children,
  onCancel,
  onConfirm,
}: ConfirmDialogProps): React.JSX.Element | null {
  const { theme } = useTheme();
  const [scaleAnim] = useState(() => new Animated.Value(0.94));
  const [opacityAnim] = useState(() => new Animated.Value(0));

  useEffect(() => {
    if (!visible) {
      return;
    }
    scaleAnim.setValue(0.94);
    opacityAnim.setValue(0);
    Animated.parallel([
      Animated.timing(opacityAnim, {
        toValue: 1,
        duration: 160,
        useNativeDriver: true,
      }),
      Animated.spring(scaleAnim, {
        toValue: 1,
        useNativeDriver: true,
        stiffness: 320,
        damping: 26,
        mass: 0.85,
      }),
    ]).start();
  }, [opacityAnim, scaleAnim, visible]);

  if (!visible) {
    return null;
  }

  const iconBg =
    tone === 'destructive'
      ? theme.colors.expenseSubtle
      : tone === 'warning'
        ? theme.colors.warningSubtle
        : theme.colors.actionSubtle;
  const iconColor =
    tone === 'destructive'
      ? theme.colors.expense
      : tone === 'warning'
        ? theme.colors.warning
        : theme.colors.action;
  const confirmBg =
    tone === 'destructive'
      ? theme.colors.expense
      : tone === 'warning'
        ? theme.colors.warning
        : theme.colors.action;

  return (
    <Modal
      visible
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={loading ? undefined : onCancel}
    >
      <View style={[styles.backdrop, { backgroundColor: theme.colors.scrim }]}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="取消并关闭弹窗"
          disabled={loading}
          onPress={onCancel}
          style={StyleSheet.absoluteFill}
        />

        <Animated.View
          style={[
            styles.dialog,
            theme.elevation.floating,
            {
              backgroundColor: theme.colors.surfaceRaised,
              borderRadius: theme.radius.lg,
              padding: theme.spacing.lg,
              opacity: opacityAnim,
              transform: [{ scale: scaleAnim }],
            },
          ]}
        >
          <View style={styles.headerBlock}>
            <View
              style={[
                styles.iconBadge,
                {
                  backgroundColor: iconBg,
                  borderRadius: theme.radius.full,
                },
              ]}
            >
              <AppIcon name={icon} size={22} color={iconColor} />
            </View>

            <Text
              style={{
                color: theme.colors.text,
                fontSize: theme.fontSize.lg,
                fontWeight: theme.fontWeight.semibold,
                marginTop: theme.spacing.md,
                textAlign: 'center',
              }}
            >
              {title}
            </Text>
          </View>

          {children ? <View style={{ marginTop: theme.spacing.md }}>{children}</View> : null}

          {message ? (
            <Text
              style={{
                color: theme.colors.textSecondary,
                fontSize: theme.fontSize.sm,
                lineHeight: 20,
                textAlign: 'center',
                marginTop: theme.spacing.md,
              }}
            >
              {message}
            </Text>
          ) : null}

          {error ? (
            <View
              style={[
                styles.errorBox,
                {
                  backgroundColor: theme.colors.expenseSubtle,
                  borderLeftColor: theme.colors.expense,
                  borderRadius: theme.radius.sm,
                  marginTop: theme.spacing.md,
                  paddingHorizontal: theme.spacing.sm,
                  paddingVertical: theme.spacing.xs,
                },
              ]}
            >
              <AppIcon
                name="alert-circle-outline"
                size={15}
                color={theme.colors.expenseTextOnSubtle}
              />
              <Text
                style={{
                  color: theme.colors.expenseTextOnSubtle,
                  fontSize: theme.fontSize.xs,
                  marginLeft: theme.spacing.xs,
                  flex: 1,
                }}
              >
                {error}
              </Text>
            </View>
          ) : null}

          <View style={[styles.actionsRow, { marginTop: theme.spacing.lg, gap: theme.spacing.sm }]}>
            {!hideCancel ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={cancelLabel}
                disabled={loading}
                onPress={onCancel}
                style={({ pressed }) => [
                  styles.actionBtn,
                  {
                    backgroundColor: theme.colors.surface,
                    borderColor: theme.colors.border,
                    borderWidth: theme.borderWidth.hairline,
                    borderRadius: theme.radius.md,
                    opacity: loading ? theme.opacity.disabled : 1,
                  },
                  pressed && !loading && { opacity: theme.opacity.pressed },
                ]}
              >
                <Text
                  style={{
                    color: theme.colors.text,
                    fontSize: theme.fontSize.base,
                    fontWeight: theme.fontWeight.semibold,
                  }}
                >
                  {cancelLabel}
                </Text>
              </Pressable>
            ) : null}

            <Pressable
              accessibilityRole="button"
              accessibilityLabel={confirmLabel}
              disabled={loading}
              onPress={onConfirm}
              style={({ pressed }) => [
                styles.actionBtn,
                {
                  backgroundColor: confirmBg,
                  borderRadius: theme.radius.md,
                  opacity: loading ? theme.opacity.disabled : 1,
                },
                pressed && !loading && { opacity: theme.opacity.pressed },
              ]}
            >
              {loading ? (
                <ActivityIndicator size="small" color={theme.colors.onAction} />
              ) : (
                <Text
                  style={{
                    color: theme.colors.onAction,
                    fontSize: theme.fontSize.base,
                    fontWeight: theme.fontWeight.semibold,
                  }}
                >
                  {confirmLabel}
                </Text>
              )}
            </Pressable>
          </View>
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  dialog: {
    width: '100%',
    maxWidth: 340,
  },
  headerBlock: {
    alignItems: 'center',
  },
  iconBadge: {
    width: 48,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  errorBox: {
    flexDirection: 'row',
    alignItems: 'center',
    borderLeftWidth: 3,
  },
  actionsRow: {
    flexDirection: 'row',
  },
  actionBtn: {
    flex: 1,
    minHeight: 46,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
  },
});
