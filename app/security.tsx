/**
 * 约束简报（Workflow B / C）：
 * - 细粒度个性化隐私与安全中心：全部能力默认关闭、独立拆分可按需组合，不强加单一安全模式
 * - 统一复用 SurfaceCard / SectionHeader / SettingSwitchRow / SettingLinkRow / OptionChip / InlineNotice 原子组件
 */
import { Stack } from 'expo-router';
import React, { useRef, useState } from 'react';
import {
  Keyboard,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { isValidPinFormat } from '../src/features/security/rules';
import { useSecurity } from '../src/features/security/security-context';
import type { RelockTimeoutSeconds } from '../src/features/security/types';
import { hapticLight, hapticSuccess, hapticWarning } from '../src/shared/haptics/haptics';
import { BottomSheet, type BottomSheetHandle } from '../src/shared/ui/BottomSheet';
import { Button } from '../src/shared/ui/Button';
import { ConfirmDialog } from '../src/shared/ui/ConfirmDialog';
import { InlineNotice } from '../src/shared/ui/InlineNotice';
import { OptionChip } from '../src/shared/ui/OptionChip';
import { SafeScreen } from '../src/shared/ui/SafeScreen';
import { SectionHeader } from '../src/shared/ui/SectionHeader';
import { SettingLinkRow, SettingSwitchRow } from '../src/shared/ui/SettingRow';
import { SurfaceCard } from '../src/shared/ui/SurfaceCard';
import { useTheme } from '../src/theme/theme-context';

const RELOCK_OPTIONS: readonly { value: RelockTimeoutSeconds; label: string }[] = [
  { value: 0, label: '立即' },
  { value: 30, label: '30 秒' },
  { value: 60, label: '1 分钟' },
  { value: 300, label: '5 分钟' },
];

export default function SecuritySettingsScreen(): React.JSX.Element {
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  const {
    config,
    biometric,
    updateConfig,
    unlockWithBiometric,
    configurePin,
    removePin,
  } = useSecurity();

  const pinSheetRef = useRef<BottomSheetHandle>(null);
  const [pinSheetOpen, setPinSheetOpen] = useState(false);
  const [enableLockAfterPin, setEnableLockAfterPin] = useState(false);
  const [pinFirst, setPinFirst] = useState('');
  const [pinConfirm, setPinConfirm] = useState('');
  const [pinError, setPinError] = useState<string | null>(null);
  const [pinSaving, setPinSaving] = useState(false);

  const [removePinConfirmOpen, setRemovePinConfirmOpen] = useState(false);
  const [statusNotice, setStatusNotice] = useState<string | null>(null);

  const canUseBiometric = biometric.hasHardware && biometric.isEnrolled;

  const openPinSetup = (autoEnableLock: boolean) => {
    setEnableLockAfterPin(autoEnableLock);
    setPinFirst('');
    setPinConfirm('');
    setPinError(null);
    setPinSheetOpen(true);
  };

  const handleToggleAppLock = async (nextValue: boolean) => {
    setStatusNotice(null);
    hapticLight();
    if (!nextValue) {
      await updateConfig({ appLockEnabled: false });
      return;
    }

    if (config.hasPin) {
      await updateConfig({ appLockEnabled: true });
      hapticSuccess();
      return;
    }

    if (canUseBiometric) {
      const res = await unlockWithBiometric();
      if (res.success) {
        await updateConfig({ appLockEnabled: true, biometricEnabled: true });
        hapticSuccess();
        setStatusNotice(`已开启应用启动锁（${biometric.label}解锁）`);
      } else if (res.error) {
        hapticWarning();
        setStatusNotice(res.error);
      }
      return;
    }

    openPinSetup(true);
  };

  const handleToggleBiometric = async (nextValue: boolean) => {
    setStatusNotice(null);
    hapticLight();
    if (!nextValue) {
      if (config.appLockEnabled && !config.hasPin) {
        hapticWarning();
        setStatusNotice('未设置独立数字密码时，无法关闭生物识别（可先设置密码或关闭启动锁）');
        return;
      }
      await updateConfig({ biometricEnabled: false });
      return;
    }

    if (!biometric.hasHardware) {
      hapticWarning();
      setStatusNotice('当前设备未检测到生物识别硬件');
      return;
    }
    if (!biometric.isEnrolled) {
      hapticWarning();
      setStatusNotice(`请先在系统设置中录入${biometric.label}`);
      return;
    }

    const res = await unlockWithBiometric();
    if (res.success) {
      await updateConfig({ biometricEnabled: true });
      hapticSuccess();
      setStatusNotice(`已开启${biometric.label}解锁`);
    } else if (res.error) {
      hapticWarning();
      setStatusNotice(res.error);
    }
  };

  const handleSavePin = async () => {
    if (pinSaving) {
      return;
    }
    setPinError(null);
    if (!isValidPinFormat(pinFirst)) {
      hapticWarning();
      setPinError('请输入 4~6 位纯数字密码');
      return;
    }
    if (pinFirst !== pinConfirm) {
      hapticWarning();
      setPinError('两次输入的密码不一致');
      return;
    }
    Keyboard.dismiss();
    setPinSaving(true);
    try {
      await configurePin(pinFirst);
      if (enableLockAfterPin) {
        await updateConfig({ appLockEnabled: true });
      }
      hapticSuccess();
      setStatusNotice(enableLockAfterPin ? '已设置密码并开启应用启动锁' : '应用数字密码已保存');
      pinSheetRef.current?.dismiss();
    } catch (err) {
      hapticWarning();
      setPinError(err instanceof Error ? err.message : '保存密码失败');
    } finally {
      setPinSaving(false);
    }
  };

  const handleConfirmRemovePin = async () => {
    setRemovePinConfirmOpen(false);
    await removePin();
    hapticLight();
    setStatusNotice('已移除独立数字密码');
  };

  return (
    <SafeScreen
      edges={['left', 'right']}
      style={{ backgroundColor: theme.colors.surfaceGrouped }}
    >
      <Stack.Screen options={{ title: '隐私与安全' }} />

      <ScrollView
        style={styles.flex}
        contentContainerStyle={{
          padding: 16,
          paddingBottom: Math.max(insets.bottom, 16) + 24,
        }}
      >
        {/* 模块 1：应用启动锁与解锁方式 */}
        <SectionHeader title="应用启动锁" />
        <SurfaceCard>
          <SettingSwitchRow
            title="启用应用启动锁"
            subtitle="打开应用或切回前台超时后需验证身份"
            value={config.appLockEnabled}
            onValueChange={(v) => void handleToggleAppLock(v)}
            showDivider
          />

          <SettingSwitchRow
            title={`${biometric.label}解锁`}
            subtitle={
              canUseBiometric
                ? '允许调用系统生物验证器快速解锁'
                : biometric.hasHardware
                  ? '尚未在系统设置中录入指纹或面容'
                  : '当前设备暂不支持生物识别'
            }
            value={config.biometricEnabled}
            disabled={!canUseBiometric && !config.biometricEnabled}
            onValueChange={(v) => void handleToggleBiometric(v)}
            showDivider
          />

          <SettingLinkRow
            title={config.hasPin ? '修改数字密码（PIN）' : '设置独立数字密码（PIN）'}
            subtitle={
              config.hasPin
                ? '已加密保存至系统安全存储，可作兜底解锁'
                : '可选 4~6 位数字，不依赖系统生物识别'
            }
            accessibilityLabel={config.hasPin ? '修改独立数字密码' : '设置独立数字密码'}
            onPress={() => {
              hapticLight();
              openPinSetup(false);
            }}
            showDivider={config.hasPin || config.appLockEnabled}
          />

          {config.hasPin ? (
            <SettingLinkRow
              title="移除独立数字密码"
              destructive
              showChevron={false}
              onPress={() => {
                hapticLight();
                setRemovePinConfirmOpen(true);
              }}
              showDivider={config.appLockEnabled}
            />
          ) : null}

          {config.appLockEnabled ? (
            <View style={styles.timeoutBlock}>
              <Text style={[styles.timeoutLabel, { color: theme.colors.textMuted }]}>
                离开应用后重新上锁时间
              </Text>
              <View style={styles.timeoutRow}>
                {RELOCK_OPTIONS.map((opt) => (
                  <OptionChip
                    key={opt.value}
                    label={opt.label}
                    selected={config.relockTimeoutSeconds === opt.value}
                    flex
                    onPress={() => {
                      hapticLight();
                      void updateConfig({ relockTimeoutSeconds: opt.value });
                    }}
                  />
                ))}
              </View>
            </View>
          ) : null}
        </SurfaceCard>

        {/* 模块 2：隐私保护与金额脱敏显示 */}
        <SectionHeader title="隐私显示保护" style={{ marginTop: 18 }} />
        <SurfaceCard>
          <SettingSwitchRow
            title="防截屏与后台遮罩"
            subtitle="切出后台自动遮挡财务界面并阻止系统截屏"
            value={config.preventScreenCapture}
            onValueChange={(v) => {
              hapticLight();
              void updateConfig({ preventScreenCapture: v });
            }}
            showDivider
          />

          <SettingSwitchRow
            title="启动默认隐藏金额"
            subtitle="净资产、总览收支、账户余额与桌面小组件默认脱敏展示"
            value={config.hideAmountsByDefault}
            onValueChange={(v) => {
              hapticLight();
              void updateConfig({
                hideAmountsByDefault: v,
                ...(v ? { showAmountPrivacyToggle: true } : {}),
              });
            }}
            showDivider
          />

          <SettingSwitchRow
            title="总览卡快捷隐藏开关"
            subtitle="在明细与资产总览卡右上角显示小眼睛图标一键切换"
            value={config.showAmountPrivacyToggle}
            onValueChange={(v) => {
              hapticLight();
              void updateConfig({ showAmountPrivacyToggle: v });
            }}
          />
        </SurfaceCard>

        {statusNotice ? (
          <InlineNotice
            text={statusNotice}
            tone="info"
            onDismiss={() => setStatusNotice(null)}
            style={{ marginTop: 14 }}
          />
        ) : null}
      </ScrollView>

      {/* 独立 4~6 位数字密码设置面板 */}
      <BottomSheet
        ref={pinSheetRef}
        visible={pinSheetOpen}
        onClose={() => setPinSheetOpen(false)}
        title={config.hasPin ? '修改数字密码' : '设置数字密码'}
        subtitle="4~6 位数字，经加盐哈希后存入系统安全存储"
        backdropLabel="关闭密码设置"
        expandable={false}
        avoidKeyboard
        includeBottomInset={false}
        footer={
          <View
            style={[
              styles.sheetFooter,
              {
                borderTopColor: theme.colors.divider,
                paddingBottom: Math.max(insets.bottom, 14),
              },
            ]}
          >
            <Button
              label="取消"
              variant="secondary"
              onPress={() => pinSheetRef.current?.dismiss()}
              disabled={pinSaving}
              style={styles.flex}
            />
            <Button
              label="保存密码"
              onPress={() => void handleSavePin()}
              loading={pinSaving}
              style={styles.flex}
            />
          </View>
        }
      >
        <View style={{ padding: 16, gap: 12 }}>
          <View>
            <Text style={[styles.pinLabel, { color: theme.colors.textMuted }]}>输入密码</Text>
            <TextInput
              accessibilityLabel="输入数字密码"
              value={pinFirst}
              onChangeText={(t) => {
                setPinFirst(t.replace(/\D/g, '').slice(0, 6));
                setPinError(null);
              }}
              secureTextEntry
              keyboardType="number-pad"
              maxLength={6}
              placeholder="输入 4~6 位数字"
              placeholderTextColor={theme.colors.placeholder}
              style={[
                styles.pinInput,
                styles.tabular,
                { backgroundColor: theme.colors.surfaceGrouped, color: theme.colors.text },
              ]}
            />
          </View>
          <View>
            <Text style={[styles.pinLabel, { color: theme.colors.textMuted }]}>再次确认</Text>
            <TextInput
              accessibilityLabel="再次确认数字密码"
              value={pinConfirm}
              onChangeText={(t) => {
                setPinConfirm(t.replace(/\D/g, '').slice(0, 6));
                setPinError(null);
              }}
              secureTextEntry
              keyboardType="number-pad"
              maxLength={6}
              placeholder="再次输入相同数字"
              placeholderTextColor={theme.colors.placeholder}
              style={[
                styles.pinInput,
                styles.tabular,
                { backgroundColor: theme.colors.surfaceGrouped, color: theme.colors.text },
              ]}
            />
          </View>
          {pinError ? (
            <Text style={{ color: theme.colors.expense, fontSize: 12, fontWeight: '600' }}>
              {pinError}
            </Text>
          ) : null}
        </View>
      </BottomSheet>

      <ConfirmDialog
        visible={removePinConfirmOpen}
        title="移除数字密码"
        message={
          config.biometricEnabled && canUseBiometric
            ? '移除后仍可使用生物识别解锁应用。'
            : '移除后将同步关闭应用启动锁，随时可重新开启。'
        }
        icon="key-outline"
        tone="warning"
        confirmLabel="确认移除"
        onCancel={() => setRemovePinConfirmOpen(false)}
        onConfirm={() => void handleConfirmRemovePin()}
      />
    </SafeScreen>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  timeoutBlock: {
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  timeoutLabel: {
    fontSize: 12,
    marginBottom: 8,
  },
  timeoutRow: {
    flexDirection: 'row',
    gap: 8,
  },
  pinLabel: {
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 6,
  },
  pinInput: {
    height: 44,
    borderRadius: 10,
    paddingHorizontal: 14,
    fontSize: 16,
    letterSpacing: 4,
  },
  sheetFooter: {
    flexDirection: 'row',
    gap: 10,
    borderTopWidth: 1,
    paddingHorizontal: 16,
    paddingTop: 12,
  },
  tabular: {
    fontVariant: ['tabular-nums'],
  },
});
