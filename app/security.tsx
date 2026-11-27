/**
 * 约束简报（Workflow B / C）：
 * - 细粒度个性化隐私与安全中心：全部能力默认关闭、独立拆分可按需组合，不强加单一安全模式
 * - 涵盖：应用启动锁（支持生物识别验证器与可选 4~6 位独立 PIN 双路径）、后台重锁超时（立即/30s/1m/5m）、防截屏与后台遮罩、默认隐藏敏感金额、总览卡快捷显隐按钮
 * - 统一采用无描边浅灰画布（surfaceGrouped）+ 纯白 14px 卡片视觉语言
 */
import { Stack } from 'expo-router';
import React, { useRef, useState } from 'react';
import {
  Keyboard,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { isValidPinFormat } from '../src/features/security/rules';
import { useSecurity } from '../src/features/security/security-context';
import type { RelockTimeoutSeconds } from '../src/features/security/types';
import { hapticLight, hapticSuccess, hapticWarning } from '../src/shared/haptics/haptics';
import { AppIcon } from '../src/shared/ui/AppIcon';
import { BottomSheet, type BottomSheetHandle } from '../src/shared/ui/BottomSheet';
import { Button } from '../src/shared/ui/Button';
import { ConfirmDialog } from '../src/shared/ui/ConfirmDialog';
import { SafeScreen } from '../src/shared/ui/SafeScreen';
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

    // 已设置 PIN：直接启用启动锁
    if (config.hasPin) {
      await updateConfig({ appLockEnabled: true });
      hapticSuccess();
      return;
    }

    // 未设 PIN 但设备已录入生物识别：先验证一次生物识别再启用，确保解锁链路畅通
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

    // 无生物识别且无 PIN：引导设置 4~6 位独立数字密码
    openPinSetup(true);
  };

  const handleToggleBiometric = async (nextValue: boolean) => {
    setStatusNotice(null);
    hapticLight();
    if (!nextValue) {
      // 若没有独立 PIN 且应用锁开启，提示不能关闭唯一解锁方式
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
        <Text style={[styles.sectionTitle, { color: theme.colors.textMuted }]}>应用启动锁</Text>
        <View
          style={[
            styles.card,
            { backgroundColor: theme.colors.surfaceRaised, borderRadius: 14 },
          ]}
        >
          <View style={styles.switchRow}>
            <View style={styles.rowText}>
              <Text style={[styles.rowTitle, { color: theme.colors.text }]}>启用应用启动锁</Text>
              <Text style={[styles.rowSub, { color: theme.colors.textMuted }]}>
                打开应用或切回前台超时后需验证身份
              </Text>
            </View>
            <Switch
              value={config.appLockEnabled}
              onValueChange={(v) => void handleToggleAppLock(v)}
              trackColor={{ false: theme.colors.chipInactive, true: theme.colors.action }}
              thumbColor={theme.colors.surfaceRaised}
            />
          </View>

          <View style={[styles.divider, { backgroundColor: theme.colors.divider }]} />

          <View style={styles.switchRow}>
            <View style={styles.rowText}>
              <Text style={[styles.rowTitle, { color: theme.colors.text }]}>
                {biometric.label}解锁
              </Text>
              <Text style={[styles.rowSub, { color: theme.colors.textMuted }]}>
                {canUseBiometric
                  ? '允许调用系统生物验证器快速解锁'
                  : biometric.hasHardware
                    ? '尚未在系统设置中录入指纹或面容'
                    : '当前设备暂不支持生物识别'}
              </Text>
            </View>
            <Switch
              value={config.biometricEnabled}
              disabled={!canUseBiometric && !config.biometricEnabled}
              onValueChange={(v) => void handleToggleBiometric(v)}
              trackColor={{ false: theme.colors.chipInactive, true: theme.colors.action }}
              thumbColor={theme.colors.surfaceRaised}
            />
          </View>

          <View style={[styles.divider, { backgroundColor: theme.colors.divider }]} />

          <Pressable
            accessibilityRole="button"
            accessibilityLabel={config.hasPin ? '修改独立数字密码' : '设置独立数字密码'}
            onPress={() => {
              hapticLight();
              openPinSetup(false);
            }}
            style={({ pressed }) => [
              styles.actionRow,
              pressed && { opacity: theme.opacity.pressed },
            ]}
          >
            <View style={styles.rowText}>
              <Text style={[styles.rowTitle, { color: theme.colors.text }]}>
                {config.hasPin ? '修改数字密码（PIN）' : '设置独立数字密码（PIN）'}
              </Text>
              <Text style={[styles.rowSub, { color: theme.colors.textMuted }]}>
                {config.hasPin
                  ? '已加密保存至系统安全存储，可作兜底解锁'
                  : '可选 4~6 位数字，不依赖系统生物识别'}
              </Text>
            </View>
            <AppIcon name="chevron-forward" size={16} color={theme.colors.placeholder} />
          </Pressable>

          {config.hasPin ? (
            <>
              <View style={[styles.divider, { backgroundColor: theme.colors.divider }]} />
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="移除独立数字密码"
                onPress={() => {
                  hapticLight();
                  setRemovePinConfirmOpen(true);
                }}
                style={({ pressed }) => [
                  styles.actionRow,
                  pressed && { opacity: theme.opacity.pressed },
                ]}
              >
                <Text
                  style={{
                    color: theme.colors.expense,
                    fontSize: 14,
                    fontWeight: theme.fontWeight.semibold,
                  }}
                >
                  移除独立数字密码
                </Text>
              </Pressable>
            </>
          ) : null}

          {config.appLockEnabled ? (
            <>
              <View style={[styles.divider, { backgroundColor: theme.colors.divider }]} />
              <View style={styles.timeoutBlock}>
                <Text style={[styles.rowSub, { color: theme.colors.textMuted, marginBottom: 8 }]}>
                  离开应用后重新上锁时间
                </Text>
                <View style={styles.timeoutRow}>
                  {RELOCK_OPTIONS.map((opt) => {
                    const active = config.relockTimeoutSeconds === opt.value;
                    return (
                      <Pressable
                        key={opt.value}
                        accessibilityRole="button"
                        accessibilityState={{ selected: active }}
                        onPress={() => {
                          hapticLight();
                          void updateConfig({ relockTimeoutSeconds: opt.value });
                        }}
                        style={({ pressed }) => [
                          styles.timeoutChip,
                          {
                            backgroundColor: active
                              ? theme.colors.actionSurface
                              : theme.colors.chipInactive,
                            borderRadius: 10,
                          },
                          pressed && { opacity: theme.opacity.pressed },
                        ]}
                      >
                        <Text
                          style={{
                            color: active
                              ? theme.colors.actionTextOnSubtle
                              : theme.colors.textSecondary,
                            fontSize: 12,
                            fontWeight: active
                              ? theme.fontWeight.semibold
                              : theme.fontWeight.regular,
                          }}
                        >
                          {opt.label}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              </View>
            </>
          ) : null}
        </View>

        {/* 模块 2：隐私保护与金额脱敏显示 */}
        <Text style={[styles.sectionTitle, { color: theme.colors.textMuted, marginTop: 18 }]}>
          隐私显示保护
        </Text>
        <View
          style={[
            styles.card,
            { backgroundColor: theme.colors.surfaceRaised, borderRadius: 14 },
          ]}
        >
          <View style={styles.switchRow}>
            <View style={styles.rowText}>
              <Text style={[styles.rowTitle, { color: theme.colors.text }]}>
                防截屏与后台遮罩
              </Text>
              <Text style={[styles.rowSub, { color: theme.colors.textMuted }]}>
                切出后台自动遮挡财务界面并阻止系统截屏
              </Text>
            </View>
            <Switch
              value={config.preventScreenCapture}
              onValueChange={(v) => {
                hapticLight();
                void updateConfig({ preventScreenCapture: v });
              }}
              trackColor={{ false: theme.colors.chipInactive, true: theme.colors.action }}
              thumbColor={theme.colors.surfaceRaised}
            />
          </View>

          <View style={[styles.divider, { backgroundColor: theme.colors.divider }]} />

          <View style={styles.switchRow}>
            <View style={styles.rowText}>
              <Text style={[styles.rowTitle, { color: theme.colors.text }]}>
                启动默认隐藏金额
              </Text>
              <Text style={[styles.rowSub, { color: theme.colors.textMuted }]}>
                净资产、总览收支与账户余额默认以 **** 展示
              </Text>
            </View>
            <Switch
              value={config.hideAmountsByDefault}
              onValueChange={(v) => {
                hapticLight();
                void updateConfig({
                  hideAmountsByDefault: v,
                  // 开启默认隐藏时自动打开快捷显隐开关，方便随时查看
                  ...(v ? { showAmountPrivacyToggle: true } : {}),
                });
              }}
              trackColor={{ false: theme.colors.chipInactive, true: theme.colors.action }}
              thumbColor={theme.colors.surfaceRaised}
            />
          </View>

          <View style={[styles.divider, { backgroundColor: theme.colors.divider }]} />

          <View style={styles.switchRow}>
            <View style={styles.rowText}>
              <Text style={[styles.rowTitle, { color: theme.colors.text }]}>
                总览卡快捷隐藏开关
              </Text>
              <Text style={[styles.rowSub, { color: theme.colors.textMuted }]}>
                在明细与资产总览卡右上角显示小眼睛图标一键切换
              </Text>
            </View>
            <Switch
              value={config.showAmountPrivacyToggle}
              onValueChange={(v) => {
                hapticLight();
                void updateConfig({ showAmountPrivacyToggle: v });
              }}
              trackColor={{ false: theme.colors.chipInactive, true: theme.colors.action }}
              thumbColor={theme.colors.surfaceRaised}
            />
          </View>
        </View>

        {statusNotice ? (
          <View
            style={[
              styles.noticeBox,
              { backgroundColor: theme.colors.actionSurface, borderRadius: 10 },
            ]}
          >
            <AppIcon name="information-circle-outline" size={16} color={theme.colors.action} />
            <Text
              style={{
                flex: 1,
                color: theme.colors.actionTextOnSubtle,
                fontSize: 12,
                fontWeight: theme.fontWeight.semibold,
              }}
            >
              {statusNotice}
            </Text>
          </View>
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
  sectionTitle: {
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 6,
    paddingHorizontal: 4,
  },
  card: {
    overflow: 'hidden',
  },
  switchRow: {
    minHeight: 58,
    paddingHorizontal: 16,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  actionRow: {
    minHeight: 52,
    paddingHorizontal: 16,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  rowText: {
    flex: 1,
  },
  rowTitle: {
    fontSize: 15,
    fontWeight: '600',
  },
  rowSub: {
    fontSize: 12,
    marginTop: 2,
    lineHeight: 17,
  },
  divider: {
    height: 1,
    marginHorizontal: 16,
  },
  timeoutBlock: {
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  timeoutRow: {
    flexDirection: 'row',
    gap: 8,
  },
  timeoutChip: {
    flex: 1,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  noticeBox: {
    marginTop: 14,
    paddingHorizontal: 12,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
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
