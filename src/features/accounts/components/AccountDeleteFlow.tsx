/**
 * 删除账户三重安全确认流程（编辑账户页专用）：
 * 1. 归档引导（guide）：温和主按钮「归档账户」+「取消删除」，下方弱化「继续删除」；
 * 1b. 归档确认（archive-confirm）：与第一步严格互斥（全屏任意时刻至多挂载 1 个 Modal），可恢复操作仅需此一次确认；
 * 2. 安全校验（code）：随机 4 位数字验证码，完全匹配方可进入下一步（与清空账本同款式）；
 * 3. 最终确认（final）：明示连带清除的精确流水笔数（含跨账户悬空退款），确认后一次性事务删除。
 */
import React, { useState } from 'react';
import {
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { hapticWarning } from '../../../shared/haptics/haptics';
import { AppIcon } from '../../../shared/ui/AppIcon';
import { ConfirmDialog } from '../../../shared/ui/ConfirmDialog';
import { useTheme } from '../../../theme/theme-context';
import type { Account } from '../types';

function generateFourDigitCode(): string {
  return String(Math.floor(1000 + Math.random() * 9000));
}

type DeleteStep = 'guide' | 'archive-confirm' | 'code' | 'final';

export interface AccountDeleteFlowProps {
  account: Account;
  /** 关联流水笔数（含转账对手方及将被连带清除的跨账户悬空退款） */
  transactionCount: number;
  onClose: () => void;
  /** 执行归档（由页面注入 accounts 服务调用；组件不反向依赖服务层），抛错时展示错误 */
  onArchive: () => Promise<void>;
  /** 执行级联删除（由页面注入 transactions 服务调用），抛错时展示错误 */
  onDelete: () => Promise<void>;
  /** 归档成功后回调（页面据此返回） */
  onArchived: () => void;
  /** 删除成功后回调（页面据此安全退栈） */
  onDeleted: () => void;
}

export function AccountDeleteFlow({
  account,
  transactionCount,
  onClose,
  onArchive,
  onDelete,
  onArchived,
  onDeleted,
}: AccountDeleteFlowProps): React.JSX.Element {
  const { theme } = useTheme();

  const [step, setStep] = useState<DeleteStep>('guide');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [code, setCode] = useState(() => generateFourDigitCode());
  const [inputCode, setInputCode] = useState('');

  const matched = inputCode.trim() === code;

  const handleArchive = async () => {
    if (loading) {
      return;
    }
    setLoading(true);
    setError(null);
    try {
      await onArchive();
      onArchived();
    } catch (err) {
      setError(err instanceof Error ? err.message : '归档账户失败');
    } finally {
      setLoading(false);
    }
  };

  const handleEnterCode = () => {
    setCode(generateFourDigitCode());
    setInputCode('');
    setError(null);
    setStep('code');
  };

  const handleCodeConfirm = () => {
    if (!matched) {
      hapticWarning();
      setError('验证码不匹配，请核对上方 4 位数字');
      return;
    }
    Keyboard.dismiss();
    setError(null);
    setStep('final');
  };

  const handleFinalDelete = async () => {
    if (loading) {
      return;
    }
    setLoading(true);
    setError(null);
    try {
      await onDelete();
      onDeleted();
    } catch (err) {
      setError(err instanceof Error ? err.message : '删除账户失败');
    } finally {
      setLoading(false);
    }
  };

  const handleCancel = () => {
    if (loading) {
      return;
    }
    Keyboard.dismiss();
    onClose();
  };

  return (
    <>
      {/* 第一步：归档引导（温和主色推荐「归档账户」，下方不显眼放置「继续删除」） */}
      <ConfirmDialog
        visible={step === 'guide'}
        title="删除账户"
        message={
          account.isArchived
            ? `「${account.name}」已归档。删除将连带清除其 ${transactionCount} 笔关联流水，不可恢复。`
            : `删除将连带清除「${account.name}」的 ${transactionCount} 笔关联流水，不可恢复。建议改为归档：仅保留明细，不参与统计与记账，可随时恢复。`
        }
        icon={account.isArchived ? 'trash-outline' : 'archive-outline'}
        tone="primary"
        confirmLabel={account.isArchived ? '取消删除' : '归档账户'}
        cancelLabel={account.isArchived ? undefined : '取消删除'}
        hideCancel={account.isArchived}
        onConfirm={() => {
          if (account.isArchived) {
            handleCancel();
          } else {
            setError(null);
            setStep('archive-confirm');
          }
        }}
        onCancel={handleCancel}
        footer={
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="继续删除"
            onPress={handleEnterCode}
            style={({ pressed }) => [
              styles.subtleLink,
              pressed && { opacity: theme.opacity.pressed },
            ]}
          >
            <Text style={{ color: theme.colors.textMuted, fontSize: theme.fontSize.xs }}>
              继续删除
            </Text>
          </Pressable>
        }
      />

      {/* 第一步分支：归档确认（严格互斥，与直接点归档一致仅需一次确认） */}
      <ConfirmDialog
        visible={step === 'archive-confirm'}
        title="归档账户"
        message="归档后不参与总资产 / 净资产统计，不出现在可选账户中，历史明细完整保留，可随时恢复。"
        icon="archive-outline"
        tone="warning"
        confirmLabel="确认归档"
        loading={loading}
        error={error}
        onCancel={() => {
          if (!loading) {
            setError(null);
            setStep('guide');
          }
        }}
        onConfirm={() => void handleArchive()}
      />

      {/* 第二步：4 位安全验证码（与清空账本同款式） */}
      {step === 'code' ? (
        <Modal
          visible
          transparent
          animationType="fade"
          statusBarTranslucent
          onRequestClose={handleCancel}
        >
          <KeyboardAvoidingView
            style={[styles.backdrop, { backgroundColor: theme.colors.scrim }]}
            behavior="padding"
          >
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="取消删除账户"
              onPress={handleCancel}
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
                style={{
                  color: theme.colors.text,
                  fontSize: theme.fontSize.lg,
                  fontWeight: theme.fontWeight.semibold,
                  textAlign: 'center',
                  marginTop: theme.spacing.md,
                }}
              >
                删除账户安全校验
              </Text>

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
                  setInputCode(text.replace(/[^0-9]/g, '').slice(0, 4));
                  if (error) {
                    setError(null);
                  }
                }}
                keyboardType="number-pad"
                maxLength={4}
                placeholder="输入 4 位数字验证码"
                placeholderTextColor={theme.colors.textMuted}
                returnKeyType="done"
                onSubmitEditing={handleCodeConfirm}
                style={[
                  styles.codeInput,
                  {
                    backgroundColor: theme.colors.surface,
                    borderColor: matched || error ? theme.colors.expense : theme.colors.borderStrong,
                    borderWidth: matched ? theme.borderWidth.focus : theme.borderWidth.hairline,
                    color: theme.colors.text,
                    borderRadius: theme.radius.md,
                    fontSize: theme.fontSize.lg,
                    fontWeight: theme.fontWeight.semibold,
                    marginTop: theme.spacing.md,
                  },
                ]}
              />

              {error ? (
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
                    {error}
                  </Text>
                </View>
              ) : null}

              <View style={[styles.actionsRow, { marginTop: theme.spacing.lg, gap: theme.spacing.sm }]}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="取消"
                  onPress={handleCancel}
                  style={({ pressed }) => [
                    styles.actionBtn,
                    {
                      backgroundColor: theme.colors.surface,
                      borderColor: theme.colors.border,
                      borderWidth: theme.borderWidth.hairline,
                      borderRadius: theme.radius.md,
                    },
                    pressed && { opacity: theme.opacity.pressed },
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
                  accessibilityLabel="下一步"
                  disabled={!matched}
                  onPress={handleCodeConfirm}
                  style={({ pressed }) => [
                    styles.actionBtn,
                    {
                      backgroundColor: theme.colors.expense,
                      borderRadius: theme.radius.md,
                      opacity: matched ? 1 : theme.opacity.disabled,
                    },
                    pressed && matched && { opacity: theme.opacity.pressed },
                  ]}
                >
                  <Text
                    style={{
                      color: theme.colors.onAction,
                      fontSize: theme.fontSize.base,
                      fontWeight: theme.fontWeight.semibold,
                    }}
                  >
                    下一步
                  </Text>
                </Pressable>
              </View>
            </View>
          </KeyboardAvoidingView>
        </Modal>
      ) : null}

      {/* 第三步：最终确认 */}
      <ConfirmDialog
        visible={step === 'final'}
        title="确认删除账户？"
        message={`将永久删除「${account.name}」及其 ${transactionCount} 笔关联流水与快捷模板，并回滚对转账对手方的余额影响。此操作不可撤销。`}
        icon="trash-outline"
        tone="destructive"
        confirmLabel="永久删除"
        loading={loading}
        error={error}
        onCancel={handleCancel}
        onConfirm={() => void handleFinalDelete()}
      />
    </>
  );
}

const styles = StyleSheet.create({
  subtleLink: {
    alignSelf: 'center',
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
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
