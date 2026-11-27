import { describe, expect, it } from 'vitest';
import {
  constantTimeEqual,
  DEFAULT_PRIVACY_SECURITY_CONFIG,
  formatPinStoragePayload,
  isValidPinFormat,
  maskSensitiveAmount,
  parsePinStoragePayload,
  parsePrivacySecurityConfig,
  shouldRelockAfterBackground,
} from './rules';

describe('security 隐私与安全中心纯规则', () => {
  it('默认全部关闭不打扰用户，坏 JSON 安全回退默认值', () => {
    expect(DEFAULT_PRIVACY_SECURITY_CONFIG.appLockEnabled).toBe(false);
    expect(DEFAULT_PRIVACY_SECURITY_CONFIG.biometricEnabled).toBe(false);
    expect(DEFAULT_PRIVACY_SECURITY_CONFIG.preventScreenCapture).toBe(false);
    expect(parsePrivacySecurityConfig(null)).toEqual(DEFAULT_PRIVACY_SECURITY_CONFIG);
    expect(parsePrivacySecurityConfig('{broken')).toEqual(DEFAULT_PRIVACY_SECURITY_CONFIG);

    const parsed = parsePrivacySecurityConfig(
      JSON.stringify({
        appLockEnabled: true,
        biometricEnabled: true,
        relockTimeoutSeconds: 60,
        preventScreenCapture: true,
        hideAmountsByDefault: true,
        showAmountPrivacyToggle: true,
        hasPin: true,
      })
    );
    expect(parsed).toEqual({
      appLockEnabled: true,
      biometricEnabled: true,
      relockTimeoutSeconds: 60,
      preventScreenCapture: true,
      hideAmountsByDefault: true,
      showAmountPrivacyToggle: true,
      hasPin: true,
    });
  });

  it('校验 4~6 位数字 PIN、常量时间比对与加盐载荷解析', () => {
    expect(isValidPinFormat('1234')).toBe(true);
    expect(isValidPinFormat('123456')).toBe(true);
    expect(isValidPinFormat('123')).toBe(false);
    expect(isValidPinFormat('1234567')).toBe(false);
    expect(isValidPinFormat('12ab')).toBe(false);

    expect(constantTimeEqual('abcdef', 'abcdef')).toBe(true);
    expect(constantTimeEqual('abcdef', 'abcdeg')).toBe(false);
    expect(constantTimeEqual('abc', 'abcd')).toBe(false);

    const payload = formatPinStoragePayload('aabbcc', '112233');
    expect(parsePinStoragePayload(payload)).toEqual({ saltHex: 'aabbcc', hashHex: '112233' });
    expect(parsePinStoragePayload('invalid')).toBeNull();
  });

  it('按后台停留时长与锁定超时精确判定重新上锁', () => {
    expect(
      shouldRelockAfterBackground({
        appLockEnabled: false,
        backgroundedAtMs: 1000,
        resumedAtMs: 100_000,
        relockTimeoutSeconds: 0,
      })
    ).toBe(false);

    expect(
      shouldRelockAfterBackground({
        appLockEnabled: true,
        backgroundedAtMs: 1000,
        resumedAtMs: 1200,
        relockTimeoutSeconds: 0,
      })
    ).toBe(true);

    expect(
      shouldRelockAfterBackground({
        appLockEnabled: true,
        backgroundedAtMs: 10_000,
        resumedAtMs: 39_999,
        relockTimeoutSeconds: 30,
      })
    ).toBe(false);

    expect(
      shouldRelockAfterBackground({
        appLockEnabled: true,
        backgroundedAtMs: 10_000,
        resumedAtMs: 40_000,
        relockTimeoutSeconds: 30,
      })
    ).toBe(true);

    expect(maskSensitiveAmount('¥1,234.56', true)).toBe('****');
    expect(maskSensitiveAmount('¥1,234.56', false)).toBe('¥1,234.56');
  });
});
