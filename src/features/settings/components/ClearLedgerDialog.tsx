/**
 * 约束简报（Workflow B）：
 * - 高危破坏性操作双层安全校验：展示受影响数据概览 + 随机生成 4 位数字验证码，仅输入完全匹配后方可激活「确认清空」
 * - 视觉形态：与 ConfirmDialog 保持完全一致的居中浮层圆角卡片、语义图标徽章与按压态反馈，不可见时卸载 Modal
 */
import React, { useState } from 'react';
import {
  ActivityIndicator,
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import type { DatabaseStats } from '../../../db/seed';
import { hapticLight, hapticWarning } from '../../../shared/haptics/haptics';
import { AppIcon } from '../../../shared/ui/AppIcon';
import { useTheme } from '../../../theme/theme-context';

function generateFourDigitCode(): string {
  return String(Math.floor(1000 + Math.random() * 9000));
}

export interface ClearLedgerDialogProps {
  visible: boolean;
  stats: DatabaseStats;
  loading?: boolean;
  error?: string | null;
  onCancel: () => void;
  onConfirm: () => void;
  /** 可选：引导用户先去导出完整 JSON 备份的快捷入口 */
  onPressExportBackup?: () => void;
}

export function ClearLedgerDialog({
  visible,
  stats,
  loading = false,
  error = null,
  onCancel,
  onConfirm,
  onPressExportBackup,
}: ClearLedgerDialogProps): React.JSX.Element | null {
  const { theme } = useTheme();
  const [wasVisible, setWasVisible] = useState(visible);
  const [code, setCode] = useState(() => generateFourDigitCode());
  const [inputCode, setInputCode] = useState('');
  const [localError, setLocalError] = useState<string | null>(null);

  if (visible !== wasVisible) {
    setWasVisible(visible);
    if (visible) {
      setCode(generateFourDigitCode());
      setInputCode('');
      setLocalError(null);
    }
  }

  if (!visible) {
    return null;
  }

  const matched = inputCode.trim() === code;
  const displayError = error ?? localError;

  const handlePressConfirm = () => {
    if (loading) {
      return;
    }
    if (!matched) {
      hapticWarning();
      setLocalError('验证码不匹配，请核对上方 4 位数字');
      return;
    }
    Keyboard.dismiss();
    setLocalError(null);
    onConfirm();
  };

  return (
    <Modal
      visible
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={() => {
        if (!loading) {
          onCancel();
        }
      }}
    >
      <KeyboardAvoidingView
        style={[styles.backdrop, { backgroundColor: theme.colors.scrim }]}
        behavior="padding"
      >
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="取消清空账本"
          onPress={() => {
            if (!loading) {
              Keyboard.dismiss();
              onCancel();
            }
          }}
          style={StyleSheet.absoluteFill}
        />

        <View
          style={[
            styles.dialog,
            theme.elevation.floating,
            {
              backgroundColor: theme.colors.surfaceRaised,
              borderColor: theme.colors.border,
              borderWidth: theme.borderWidth.hairline,
              borderRadius: theme.radius.lg,
              padding: theme.spacing.lg,
            },
          ]}
        >
          <View
            style={[
              styles.iconBadge,
              {
                backgroundColor: theme.colors.expenseSubtle,
                borderRadius: theme.radius.full,
              },
            ]}
          >
            <AppIcon name="shield-checkmark-outline" size={24} color={theme.colors.expense} />
          </View>

          <Text
            style={[
              styles.title,
              {
                color: theme.colors.text,
                fontSize: theme.fontSize.lg,
                fontWeight: theme.fontWeight.semibold,
                marginTop: theme.spacing.md,
              },
            ]}
          >
            清空账本安全校验
          </Text>

          <Text
            style={[
              styles.message,
              {
                color: theme.colors.textSecondary,
                fontSize: theme.fontSize.sm,
                marginTop: theme.spacing.xs,
              },
            ]}
          >
            将清空全部 {stats.transactionCount} 笔明细与快捷模板，账户重置为唯一的「钱包（¥0.00）」，分类恢复默认设置且不可撤销。
          </Text>

          {/* 备份提醒横幅：明确提示是否已导出备份，并提供一键直达导出入口 */}
          <View
            style={[
              styles.backupReminderBox,
              {
                backgroundColor: theme.colors.warningSubtle,
                borderLeftColor: theme.colors.warning,
                borderRadius: theme.radius.md,
                marginTop: theme.spacing.md,
                paddingHorizontal: theme.spacing.sm,
                paddingVertical: theme.spacing.sm,
              },
            ]}
          >
            <View style={styles.backupReminderRow}>
              <AppIcon
                name="cloud-download-outline"
                size={16}
                color={theme.colors.warningTextOnSubtle}
              />
              <Text
                style={{
                  flex: 1,
                  color: theme.colors.warningTextOnSubtle,
                  fontSize: theme.fontSize.xs,
                  fontWeight: theme.fontWeight.semibold,
                  lineHeight: 17,
                  marginLeft: 6,
                }}
              >
                是否已经导出 JSON 备份？清空后原有账目与自定义配置将无法恢复。
              </Text>
            </View>
            {onPressExportBackup ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="先去导出 JSON 备份"
                disabled={loading}
                onPress={() => {
                  Keyboard.dismiss();
                  hapticLight();
                  onPressExportBackup();
                }}
                style={({ pressed }) => [
                  styles.backupActionBtn,
                  {
                    backgroundColor: theme.colors.surfaceRaised,
                    borderColor: theme.colors.warning,
                    borderWidth: theme.borderWidth.hairline,
                    borderRadius: theme.radius.sm,
                    marginTop: theme.spacing.xs,
                  },
                  pressed && { opacity: theme.opacity.pressed },
                ]}
              >
                <AppIcon
                  name="download-outline"
                  size={14}
                  color={theme.colors.warningTextOnSubtle}
                />
                <Text
                  style={{
                    color: theme.colors.warningTextOnSubtle,
                    fontSize: theme.fontSize.xs,
                    fontWeight: theme.fontWeight.semibold,
                    marginLeft: 4,
                  }}
                >
                  先去导出备份
                </Text>
              </Pressable>
            ) : null}
          </View>

          {/* 4 位随机验证码展示块（每次弹出自动生成，不提供刷新按钮） */}
          <View
            style={[
              styles.codeBox,
              {
                backgroundColor: theme.colors.surface,
                borderColor: theme.colors.border,
                borderWidth: theme.borderWidth.hairline,
                borderRadius: theme.radius.md,
                marginTop: theme.spacing.md,
                paddingHorizontal: theme.spacing.md,
                paddingVertical: theme.spacing.sm,
              },
            ]}
          >
            <Text style={{ color: theme.colors.textMuted, fontSize: theme.fontSize.xs }}>
              请输入下方 4 位安全验证码
            </Text>
            <Text
              selectable
              style={[
                styles.codeDigits,
                {
                  color: theme.colors.expense,
                  fontSize: theme.fontSize.xxl,
                  fontWeight: theme.fontWeight.semibold,
                  marginTop: 4,
                },
              ]}
            >
              {code.split('').join(' ')}
            </Text>
          </View>

          <TextInput
            accessibilityLabel="输入 4 位安全验证码"
            value={inputCode}
            onChangeText={(text) => {
              const digitsOnly = text.replace(/[^0-9]/g, '').slice(0, 4);
              setInputCode(digitsOnly);
              if (localError) {
                setLocalError(null);
              }
            }}
            keyboardType="number-pad"
            maxLength={4}
            placeholder="输入 4 位数字验证码"
            placeholderTextColor={theme.colors.textMuted}
            returnKeyType="done"
            onSubmitEditing={handlePressConfirm}
            style={[
              styles.codeInput,
              {
                backgroundColor: theme.colors.surface,
                borderColor: matched
                  ? theme.colors.expense
                  : displayError
                    ? theme.colors.expense
                    : theme.colors.borderStrong,
                borderWidth: matched ? theme.borderWidth.focus : theme.borderWidth.hairline,
                color: theme.colors.text,
                borderRadius: theme.radius.md,
                fontSize: theme.fontSize.lg,
                fontWeight: theme.fontWeight.semibold,
                marginTop: theme.spacing.md,
              },
            ]}
          />

          {displayError ? (
            <View
              style={[
                styles.errorBox,
                {
                  backgroundColor: theme.colors.expenseSubtle,
                  borderLeftColor: theme.colors.expense,
                  borderRadius: theme.radius.sm,
                  marginTop: theme.spacing.sm,
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
                  fontWeight: theme.fontWeight.semibold,
                  marginLeft: theme.spacing.xs,
                  flex: 1,
                }}
              >
                {displayError}
              </Text>
            </View>
          ) : null}

          <View style={[styles.actionsRow, { marginTop: theme.spacing.lg, gap: theme.spacing.sm }]}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="取消"
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
                  color: theme.colors.textSecondary,
                  fontSize: theme.fontSize.base,
                  fontWeight: theme.fontWeight.semibold,
                }}
              >
                取消
              </Text>
            </Pressable>

            <Pressable
              accessibilityRole="button"
              accessibilityLabel="确认清空"
              disabled={loading || !matched}
              onPress={handlePressConfirm}
              style={({ pressed }) => [
                styles.actionBtn,
                {
                  backgroundColor: theme.colors.expense,
                  borderRadius: theme.radius.md,
                  opacity: loading || !matched ? theme.opacity.disabled : 1,
                },
                pressed && !loading && matched && { opacity: theme.opacity.pressed },
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
                  确认清空
                </Text>
              )}
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  dialog: {
    width: '100%',
    maxWidth: 360,
  },
  iconBadge: {
    width: 48,
    height: 48,
    alignSelf: 'center',
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    textAlign: 'center',
  },
  message: {
    textAlign: 'center',
    lineHeight: 20,
  },
  backupReminderBox: {
    borderLeftWidth: 3,
  },
  backupReminderRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  backupActionBtn: {
    alignSelf: 'flex-end',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  codeBox: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  codeDigits: {
    fontVariant: ['tabular-nums'],
    letterSpacing: 6,
  },
  codeInput: {
    minHeight: 48,
    textAlign: 'center',
    letterSpacing: 8,
    fontVariant: ['tabular-nums'],
    paddingHorizontal: 14,
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
