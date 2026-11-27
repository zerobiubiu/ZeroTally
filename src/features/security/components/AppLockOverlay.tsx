/**
 * 应用锁定遮罩与解锁层：
 * - 支持生物识别自动拉起（指纹 / 面容）与自定义 4~6 位数字密码键盘两种解锁路径
 * - 开启防截屏后台遮罩时，在多任务切换界面覆盖极简品牌遮罩防止金额与卡号泄漏
 */
import React, { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { hapticLight, hapticSelection, hapticSuccess, hapticWarning } from '../../../shared/haptics/haptics';
import { AppIcon } from '../../../shared/ui/AppIcon';
import { useTheme } from '../../../theme/theme-context';
import { useSecurity } from '../security-context';

const DIGITS = [
  ['1', '2', '3'],
  ['4', '5', '6'],
  ['7', '8', '9'],
] as const;

export function AppLockOverlay(): React.JSX.Element | null {
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  const {
    config,
    biometric,
    isLocked,
    isBackgroundShieldVisible,
    unlockWithBiometric,
    unlockWithPin,
  } = useSecurity();

  const [pinDraft, setPinDraft] = useState('');
  const [errorText, setErrorText] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
  const autoPromptedRef = useRef(false);

  const canUseBiometric = config.biometricEnabled && biometric.hasHardware;

  useEffect(() => {
    if (!isLocked) {
      autoPromptedRef.current = false;
      return;
    }
    if (canUseBiometric && !autoPromptedRef.current) {
      autoPromptedRef.current = true;
      void unlockWithBiometric().then((res) => {
        if (!res.success && res.error) {
          setErrorText(res.error);
        }
      });
    }
  }, [canUseBiometric, isLocked, unlockWithBiometric]);

  const handleBiometricPress = async () => {
    hapticLight();
    setErrorText(null);
    const res = await unlockWithBiometric();
    if (res.success) {
      hapticSuccess();
      setPinDraft('');
    } else if (res.error) {
      hapticWarning();
      setErrorText(res.error);
    }
  };

  const handleVerifyPin = async (candidate: string) => {
    if (checking || candidate.length < 4) {
      return;
    }
    setChecking(true);
    try {
      const ok = await unlockWithPin(candidate);
      if (ok) {
        hapticSuccess();
        setPinDraft('');
        setErrorText(null);
      } else {
        hapticWarning();
        setPinDraft('');
        setErrorText('密码不正确，请重新输入');
      }
    } finally {
      setChecking(false);
    }
  };

  const handlePressDigit = (digit: string) => {
    if (checking || pinDraft.length >= 6) {
      return;
    }
    hapticSelection();
    setErrorText(null);
    const next = `${pinDraft}${digit}`;
    setPinDraft(next);
    // 满 6 位自动校验；4~5 位可点击右下角确认键立即校验
    if (next.length === 6) {
      void handleVerifyPin(next);
    }
  };

  const handleBackspace = () => {
    if (checking || pinDraft.length === 0) {
      return;
    }
    hapticLight();
    setPinDraft((prev) => prev.slice(0, -1));
  };

  if (!isLocked && !isBackgroundShieldVisible) {
    return null;
  }

  // 仅后台遮罩（未锁定时）：极简静态品牌遮挡
  if (!isLocked && isBackgroundShieldVisible) {
    return (
      <View
        style={[
          styles.overlay,
          { backgroundColor: theme.colors.surfaceGrouped },
        ]}
      >
        <View
          style={[
            styles.emblem,
            { backgroundColor: theme.colors.heroBg, borderRadius: 20 },
          ]}
        >
          <AppIcon name="shield-checkmark-outline" size={32} color={theme.colors.heroText} />
        </View>
        <Text
          style={{
            color: theme.colors.text,
            fontSize: theme.fontSize.xl,
            fontWeight: theme.fontWeight.semibold,
            marginTop: 14,
          }}
        >
          ZeroTally
        </Text>
      </View>
    );
  }

  return (
    <View
      style={[
        styles.overlay,
        {
          backgroundColor: theme.colors.surfaceGrouped,
          paddingTop: Math.max(insets.top, 24) + 28,
          paddingBottom: Math.max(insets.bottom, 24) + 12,
        },
      ]}
    >
      <View style={styles.headerBlock}>
        <View
          style={[
            styles.emblem,
            { backgroundColor: theme.colors.heroBg, borderRadius: 20 },
          ]}
        >
          <AppIcon name="lock-closed-outline" size={28} color={theme.colors.heroText} />
        </View>
        <Text
          style={{
            color: theme.colors.text,
            fontSize: theme.fontSize.xl,
            fontWeight: theme.fontWeight.semibold,
            marginTop: 14,
          }}
        >
          ZeroTally 已锁定
        </Text>
        <Text
          style={{
            color: theme.colors.textMuted,
            fontSize: theme.fontSize.xs,
            marginTop: 6,
          }}
        >
          {config.hasPin ? '输入应用密码或验证生物识别解锁' : `请使用${biometric.label}解锁`}
        </Text>
      </View>

      {config.hasPin ? (
        <View style={styles.pinSection}>
          <View style={styles.dotsRow}>
            {Array.from({ length: 6 }, (_, idx) => {
              const filled = idx < pinDraft.length;
              return (
                <View
                  key={idx}
                  style={[
                    styles.dot,
                    {
                      backgroundColor: filled
                        ? theme.colors.action
                        : theme.colors.chipInactive,
                    },
                  ]}
                />
              );
            })}
          </View>

          <Text
            style={{
              color: errorText ? theme.colors.expense : theme.colors.textMuted,
              fontSize: 12,
              minHeight: 18,
              marginTop: 12,
            }}
          >
            {errorText ?? (pinDraft.length >= 4 ? '按右下角 ✓ 解锁' : ' ')}
          </Text>

          <View style={styles.keypad}>
            {DIGITS.map((row, rowIdx) => (
              <View key={rowIdx} style={styles.keyRow}>
                {row.map((digit) => (
                  <Pressable
                    key={digit}
                    accessibilityRole="button"
                    accessibilityLabel={digit}
                    onPress={() => handlePressDigit(digit)}
                    style={({ pressed }) => [
                      styles.keyBtn,
                      {
                        backgroundColor: theme.colors.surfaceRaised,
                        borderRadius: 14,
                      },
                      pressed && { opacity: theme.opacity.pressed },
                    ]}
                  >
                    <Text
                      style={[
                        styles.tabular,
                        {
                          color: theme.colors.text,
                          fontSize: 22,
                          fontWeight: theme.fontWeight.semibold,
                        },
                      ]}
                    >
                      {digit}
                    </Text>
                  </Pressable>
                ))}
              </View>
            ))}

            <View style={styles.keyRow}>
              {canUseBiometric ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`使用${biometric.label}解锁`}
                  onPress={() => void handleBiometricPress()}
                  style={({ pressed }) => [
                    styles.keyBtn,
                    {
                      backgroundColor: theme.colors.actionSurface,
                      borderRadius: 14,
                    },
                    pressed && { opacity: theme.opacity.pressed },
                  ]}
                >
                  <AppIcon name="finger-print-outline" size={24} color={theme.colors.action} />
                </Pressable>
              ) : (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="退格"
                  onPress={handleBackspace}
                  style={({ pressed }) => [
                    styles.keyBtn,
                    { backgroundColor: theme.colors.chipInactive, borderRadius: 14 },
                    pressed && { opacity: theme.opacity.pressed },
                  ]}
                >
                  <AppIcon name="backspace-outline" size={22} color={theme.colors.textSecondary} />
                </Pressable>
              )}

              <Pressable
                accessibilityRole="button"
                accessibilityLabel="0"
                onPress={() => handlePressDigit('0')}
                style={({ pressed }) => [
                  styles.keyBtn,
                  { backgroundColor: theme.colors.surfaceRaised, borderRadius: 14 },
                  pressed && { opacity: theme.opacity.pressed },
                ]}
              >
                <Text
                  style={[
                    styles.tabular,
                    {
                      color: theme.colors.text,
                      fontSize: 22,
                      fontWeight: theme.fontWeight.semibold,
                    },
                  ]}
                >
                  0
                </Text>
              </Pressable>

              {pinDraft.length >= 4 ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="确认解锁"
                  onPress={() => void handleVerifyPin(pinDraft)}
                  style={({ pressed }) => [
                    styles.keyBtn,
                    { backgroundColor: theme.colors.action, borderRadius: 14 },
                    pressed && { opacity: theme.opacity.pressed },
                  ]}
                >
                  <AppIcon name="checkmark" size={24} color={theme.colors.onAction} />
                </Pressable>
              ) : (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="退格"
                  onPress={handleBackspace}
                  style={({ pressed }) => [
                    styles.keyBtn,
                    { backgroundColor: theme.colors.chipInactive, borderRadius: 14 },
                    pressed && { opacity: theme.opacity.pressed },
                  ]}
                >
                  <AppIcon name="backspace-outline" size={22} color={theme.colors.textSecondary} />
                </Pressable>
              )}
            </View>
          </View>
        </View>
      ) : (
        <View style={styles.bioOnlySection}>
          {errorText ? (
            <Text style={{ color: theme.colors.expense, fontSize: 13, marginBottom: 16 }}>
              {errorText}
            </Text>
          ) : null}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`使用${biometric.label}解锁`}
            onPress={() => void handleBiometricPress()}
            style={({ pressed }) => [
              styles.bioBigBtn,
              {
                backgroundColor: theme.colors.action,
                borderRadius: 14,
              },
              pressed && { opacity: theme.opacity.pressed },
            ]}
          >
            <AppIcon name="finger-print-outline" size={22} color={theme.colors.onAction} />
            <Text
              style={{
                color: theme.colors.onAction,
                fontSize: theme.fontSize.base,
                fontWeight: theme.fontWeight.semibold,
              }}
            >
              使用{biometric.label}解锁
            </Text>
          </Pressable>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 9999,
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 24,
  },
  headerBlock: {
    alignItems: 'center',
  },
  emblem: {
    width: 64,
    height: 64,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pinSection: {
    width: '100%',
    maxWidth: 320,
    alignItems: 'center',
  },
  dotsRow: {
    flexDirection: 'row',
    gap: 14,
  },
  dot: {
    width: 14,
    height: 14,
    borderRadius: 9999,
  },
  keypad: {
    width: '100%',
    gap: 10,
    marginTop: 22,
  },
  keyRow: {
    flexDirection: 'row',
    gap: 10,
  },
  keyBtn: {
    flex: 1,
    height: 54,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bioOnlySection: {
    width: '100%',
    maxWidth: 300,
    alignItems: 'center',
    marginBottom: 48,
  },
  bioBigBtn: {
    width: '100%',
    height: 50,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  tabular: {
    fontVariant: ['tabular-nums'],
  },
});
