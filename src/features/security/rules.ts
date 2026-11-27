import type { PrivacySecurityConfig, RelockTimeoutSeconds } from './types';

export const PRIVACY_SECURITY_SETTING_KEY = 'privacy_security_config_v1';

const VALID_RELOCK_TIMEOUTS: readonly RelockTimeoutSeconds[] = [0, 30, 60, 300];

export const DEFAULT_PRIVACY_SECURITY_CONFIG: PrivacySecurityConfig = {
  appLockEnabled: false,
  biometricEnabled: false,
  relockTimeoutSeconds: 30,
  preventScreenCapture: false,
  hideAmountsByDefault: false,
  showAmountPrivacyToggle: false,
  hasPin: false,
};

/** 校验自定义应用锁数字密码格式（仅允许 4~6 位纯数字） */
export function isValidPinFormat(pin: string): boolean {
  return /^\d{4,6}$/.test(pin);
}

/** 常量时间字符串比对，降低 PIN 哈希校验侧信道风险 */
export function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) {
    return false;
  }
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

/** 安全反序列化持久化在 app_settings 中的隐私配置 */
export function parsePrivacySecurityConfig(raw: string | null): PrivacySecurityConfig {
  if (!raw) {
    return { ...DEFAULT_PRIVACY_SECURITY_CONFIG };
  }
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const rawTimeout = parsed.relockTimeoutSeconds;
    const relockTimeoutSeconds: RelockTimeoutSeconds = VALID_RELOCK_TIMEOUTS.includes(
      rawTimeout as RelockTimeoutSeconds
    )
      ? (rawTimeout as RelockTimeoutSeconds)
      : DEFAULT_PRIVACY_SECURITY_CONFIG.relockTimeoutSeconds;

    return {
      appLockEnabled: Boolean(parsed.appLockEnabled),
      biometricEnabled: Boolean(parsed.biometricEnabled),
      relockTimeoutSeconds,
      preventScreenCapture: Boolean(parsed.preventScreenCapture),
      hideAmountsByDefault: Boolean(parsed.hideAmountsByDefault),
      showAmountPrivacyToggle: Boolean(parsed.showAmountPrivacyToggle),
      hasPin: Boolean(parsed.hasPin),
    };
  } catch {
    return { ...DEFAULT_PRIVACY_SECURITY_CONFIG };
  }
}

/**
 * 判定从后台切回前台时是否需要重新锁定：
 * - 未开启应用锁或缺少后台时间戳时不锁；
 * - timeout = 0 时只要离开前台即重新上锁；
 * - 否则后台停留 >= timeout * 1000ms 时重新上锁。
 */
export function shouldRelockAfterBackground(params: {
  appLockEnabled: boolean;
  backgroundedAtMs: number | null;
  resumedAtMs: number;
  relockTimeoutSeconds: RelockTimeoutSeconds;
}): boolean {
  if (!params.appLockEnabled || params.backgroundedAtMs === null) {
    return false;
  }
  if (params.relockTimeoutSeconds === 0) {
    return true;
  }
  const elapsedMs = Math.max(0, params.resumedAtMs - params.backgroundedAtMs);
  return elapsedMs >= params.relockTimeoutSeconds * 1000;
}

/** 构造/解析 SecureStore 中存储的加盐 PIN 哈希载荷（v1:<saltHex>:<hashHex>） */
export function formatPinStoragePayload(saltHex: string, hashHex: string): string {
  return `v1:${saltHex}:${hashHex}`;
}

export function parsePinStoragePayload(
  raw: string | null
): { saltHex: string; hashHex: string } | null {
  if (!raw) {
    return null;
  }
  const parts = raw.split(':');
  if (parts.length !== 3 || parts[0] !== 'v1' || !parts[1] || !parts[2]) {
    return null;
  }
  return { saltHex: parts[1], hashHex: parts[2] };
}

/** 隐私遮蔽格式化金额文本 */
export function maskSensitiveAmount(formatted: string, hidden: boolean): string {
  return hidden ? '****' : formatted;
}
