import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { AppState, type AppStateStatus } from 'react-native';
import { useDatabaseContext } from '../../db/database-context';
import { getAppSetting, setAppSetting } from '../settings/repository';
import {
  applyScreenCaptureProtection,
  authenticateWithBiometrics,
  clearStoredPin,
  detectBiometricCapability,
  hasStoredPin,
  saveStoredPin,
  verifyStoredPin,
} from './native-security';
import {
  DEFAULT_PRIVACY_SECURITY_CONFIG,
  parsePrivacySecurityConfig,
  PRIVACY_SECURITY_SETTING_KEY,
  shouldRelockAfterBackground,
} from './rules';
import type { BiometricCapability, PrivacySecurityConfig } from './types';

interface SecurityContextValue {
  config: PrivacySecurityConfig;
  ready: boolean;
  biometric: BiometricCapability;
  isLocked: boolean;
  isBackgroundShieldVisible: boolean;
  amountsHidden: boolean;
  toggleAmountsHidden: () => void;
  updateConfig: (patch: Partial<PrivacySecurityConfig>) => Promise<void>;
  unlockWithBiometric: () => Promise<{ success: boolean; error?: string }>;
  unlockWithPin: (pin: string) => Promise<boolean>;
  configurePin: (pin: string) => Promise<void>;
  removePin: () => Promise<void>;
  lockNow: () => void;
}

const SecurityContext = createContext<SecurityContextValue | null>(null);

export function SecurityProvider({ children }: { children: React.ReactNode }): React.JSX.Element {
  const { db, isReady } = useDatabaseContext();
  const [config, setConfig] = useState<PrivacySecurityConfig>(DEFAULT_PRIVACY_SECURITY_CONFIG);
  const [ready, setReady] = useState(false);
  const [biometric, setBiometric] = useState<BiometricCapability>({
    hasHardware: false,
    isEnrolled: false,
    label: '生物识别',
  });
  const [isLocked, setIsLocked] = useState(false);
  const [isBackgroundShieldVisible, setIsBackgroundShieldVisible] = useState(false);
  const [amountsHidden, setAmountsHidden] = useState(false);

  const configRef = useRef(config);
  const backgroundedAtRef = useRef<number | null>(null);
  const authenticatingRef = useRef(false);
  const initializedRef = useRef(false);

  useEffect(() => {
    configRef.current = config;
  }, [config]);

  // 首次启动时加载隐私安全配置、核验 SecureStore PIN 状态与设备生物识别能力
  useEffect(() => {
    if (!isReady || !db || initializedRef.current) {
      return;
    }
    initializedRef.current = true;

    let active = true;
    void (async () => {
      const [rawConfig, pinExists, bio] = await Promise.all([
        getAppSetting(db, PRIVACY_SECURITY_SETTING_KEY),
        hasStoredPin(),
        detectBiometricCapability(),
      ]);
      if (!active) {
        return;
      }
      const parsed = parsePrivacySecurityConfig(rawConfig);
      const effective: PrivacySecurityConfig = {
        ...parsed,
        hasPin: pinExists,
        // 若既无 PIN 又无生物识别可用，安全降级关闭启动锁避免锁死
        appLockEnabled: parsed.appLockEnabled && (pinExists || (parsed.biometricEnabled && bio.hasHardware)),
      };
      setBiometric(bio);
      setConfig(effective);
      setAmountsHidden(effective.hideAmountsByDefault);
      setIsLocked(effective.appLockEnabled);
      setReady(true);
      await applyScreenCaptureProtection(effective.preventScreenCapture);
    })();

    return () => {
      active = false;
    };
  }, [db, isReady]);

  // 监听前后台切换：维护隐私遮罩与按超时策略自动重新锁定
  useEffect(() => {
    const sub = AppState.addEventListener('change', (nextState: AppStateStatus) => {
      const current = configRef.current;
      if (nextState === 'background' || nextState === 'inactive') {
        if (current.preventScreenCapture) {
          setIsBackgroundShieldVisible(true);
        }
        // 系统生物识别弹窗拉起时会短暂触发 inactive，不计入后台超时
        if (nextState === 'background' && !authenticatingRef.current) {
          backgroundedAtRef.current = Date.now();
        }
      } else if (nextState === 'active') {
        setIsBackgroundShieldVisible(false);
        if (!authenticatingRef.current && backgroundedAtRef.current !== null) {
          const shouldLock = shouldRelockAfterBackground({
            appLockEnabled: current.appLockEnabled,
            backgroundedAtMs: backgroundedAtRef.current,
            resumedAtMs: Date.now(),
            relockTimeoutSeconds: current.relockTimeoutSeconds,
          });
          backgroundedAtRef.current = null;
          if (shouldLock) {
            setIsLocked(true);
          }
        }
      }
    });
    return () => {
      sub.remove();
    };
  }, []);

  const persistConfig = useCallback(
    async (next: PrivacySecurityConfig) => {
      setConfig(next);
      configRef.current = next;
      if (db) {
        await setAppSetting(db, PRIVACY_SECURITY_SETTING_KEY, JSON.stringify(next));
      }
      await applyScreenCaptureProtection(next.preventScreenCapture);
    },
    [db]
  );

  const updateConfig = useCallback(
    async (patch: Partial<PrivacySecurityConfig>) => {
      const next: PrivacySecurityConfig = { ...configRef.current, ...patch };
      await persistConfig(next);
      if (patch.hideAmountsByDefault !== undefined) {
        setAmountsHidden(patch.hideAmountsByDefault);
      }
      if (patch.appLockEnabled === false) {
        setIsLocked(false);
      }
    },
    [persistConfig]
  );

  const unlockWithBiometric = useCallback(async () => {
    if (authenticatingRef.current) {
      return { success: false };
    }
    authenticatingRef.current = true;
    try {
      const result = await authenticateWithBiometrics({
        promptMessage: '验证身份以解锁 ZeroTally',
        allowDeviceFallback: !configRef.current.hasPin,
      });
      if (result.success) {
        backgroundedAtRef.current = null;
        setIsLocked(false);
      }
      return result;
    } finally {
      authenticatingRef.current = false;
    }
  }, []);

  const unlockWithPin = useCallback(async (pin: string) => {
    const ok = await verifyStoredPin(pin);
    if (ok) {
      backgroundedAtRef.current = null;
      setIsLocked(false);
    }
    return ok;
  }, []);

  const configurePin = useCallback(
    async (pin: string) => {
      await saveStoredPin(pin);
      const next: PrivacySecurityConfig = {
        ...configRef.current,
        hasPin: true,
      };
      await persistConfig(next);
    },
    [persistConfig]
  );

  const removePin = useCallback(async () => {
    await clearStoredPin();
    const stillCanUnlock = configRef.current.biometricEnabled && biometric.hasHardware;
    const next: PrivacySecurityConfig = {
      ...configRef.current,
      hasPin: false,
      appLockEnabled: stillCanUnlock ? configRef.current.appLockEnabled : false,
    };
    await persistConfig(next);
    if (!next.appLockEnabled) {
      setIsLocked(false);
    }
  }, [biometric.hasHardware, persistConfig]);

  const toggleAmountsHidden = useCallback(() => {
    setAmountsHidden((prev) => !prev);
  }, []);

  const lockNow = useCallback(() => {
    if (configRef.current.appLockEnabled) {
      setIsLocked(true);
    }
  }, []);

  const value = useMemo<SecurityContextValue>(
    () => ({
      config,
      ready,
      biometric,
      isLocked,
      isBackgroundShieldVisible,
      amountsHidden,
      toggleAmountsHidden,
      updateConfig,
      unlockWithBiometric,
      unlockWithPin,
      configurePin,
      removePin,
      lockNow,
    }),
    [
      config,
      ready,
      biometric,
      isLocked,
      isBackgroundShieldVisible,
      amountsHidden,
      toggleAmountsHidden,
      updateConfig,
      unlockWithBiometric,
      unlockWithPin,
      configurePin,
      removePin,
      lockNow,
    ]
  );

  return <SecurityContext.Provider value={value}>{children}</SecurityContext.Provider>;
}

export function useSecurity(): SecurityContextValue {
  const ctx = useContext(SecurityContext);
  if (!ctx) {
    throw new Error('useSecurity 必须在 SecurityProvider 内调用');
  }
  return ctx;
}
