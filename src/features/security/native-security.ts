import * as Crypto from 'expo-crypto';
import * as LocalAuthentication from 'expo-local-authentication';
import * as ScreenCapture from 'expo-screen-capture';
import * as SecureStore from 'expo-secure-store';
import {
  constantTimeEqual,
  formatPinStoragePayload,
  isValidPinFormat,
  parsePinStoragePayload,
} from './rules';
import type { BiometricCapability } from './types';

const PIN_STORE_KEY = 'zerotally_app_lock_pin_v1';
const PIN_HASH_ITERATIONS = 128;

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

async function derivePinHash(pin: string, saltHex: string): Promise<string> {
  let acc = `${saltHex}:${pin}:zerotally_pin_v1`;
  for (let i = 0; i < PIN_HASH_ITERATIONS; i += 1) {
    acc = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, `${saltHex}:${acc}`);
  }
  return acc;
}

/** 探测设备生物识别硬件与录入状态 */
export async function detectBiometricCapability(): Promise<BiometricCapability> {
  try {
    const [hasHardware, isEnrolled, types] = await Promise.all([
      LocalAuthentication.hasHardwareAsync(),
      LocalAuthentication.isEnrolledAsync(),
      LocalAuthentication.supportedAuthenticationTypesAsync(),
    ]);

    let label = '生物识别';
    if (types.includes(LocalAuthentication.AuthenticationType.FACIAL_RECOGNITION)) {
      label = types.includes(LocalAuthentication.AuthenticationType.FINGERPRINT)
        ? '指纹 / 面容识别'
        : '面容识别';
    } else if (types.includes(LocalAuthentication.AuthenticationType.FINGERPRINT)) {
      label = '指纹识别';
    } else if (types.includes(LocalAuthentication.AuthenticationType.IRIS)) {
      label = '虹膜识别';
    }

    return { hasHardware, isEnrolled, label };
  } catch {
    return { hasHardware: false, isEnrolled: false, label: '生物识别' };
  }
}

/** 调用系统生物识别验证器解锁；未设置独立 PIN 时允许回退系统锁屏密码防锁死 */
export async function authenticateWithBiometrics(options: {
  promptMessage: string;
  allowDeviceFallback: boolean;
}): Promise<{ success: boolean; error?: string }> {
  try {
    const result = await LocalAuthentication.authenticateAsync({
      promptMessage: options.promptMessage,
      cancelLabel: '取消',
      fallbackLabel: options.allowDeviceFallback ? '使用设备密码' : '使用应用密码',
      disableDeviceFallback: !options.allowDeviceFallback,
    });
    if (result.success) {
      return { success: true };
    }
    return {
      success: false,
      error: result.error === 'user_cancel' ? undefined : '验证未通过，请重试',
    };
  } catch {
    return { success: false, error: '无法调起系统验证器，请稍后重试' };
  }
}

/** 将加盐拉伸后的 PIN 哈希写入系统硬件安全存储（绝不落盘 SQLite） */
export async function saveStoredPin(pin: string): Promise<void> {
  if (!isValidPinFormat(pin)) {
    throw new Error('密码须为 4~6 位数字');
  }
  const saltBytes = await Crypto.getRandomBytesAsync(16);
  const saltHex = bytesToHex(saltBytes);
  const hashHex = await derivePinHash(pin, saltHex);
  await SecureStore.setItemAsync(PIN_STORE_KEY, formatPinStoragePayload(saltHex, hashHex));
}

export async function verifyStoredPin(pin: string): Promise<boolean> {
  if (!isValidPinFormat(pin)) {
    return false;
  }
  const raw = await SecureStore.getItemAsync(PIN_STORE_KEY);
  const parsed = parsePinStoragePayload(raw);
  if (!parsed) {
    return false;
  }
  const candidate = await derivePinHash(pin, parsed.saltHex);
  return constantTimeEqual(candidate, parsed.hashHex);
}

export async function hasStoredPin(): Promise<boolean> {
  try {
    const raw = await SecureStore.getItemAsync(PIN_STORE_KEY);
    return parsePinStoragePayload(raw) !== null;
  } catch {
    return false;
  }
}

export async function clearStoredPin(): Promise<void> {
  try {
    await SecureStore.deleteItemAsync(PIN_STORE_KEY);
  } catch {
    // 忽略不存在时的删除错误
  }
}

/** 同步开启或关闭系统级防截屏与多任务快照保护（Android FLAG_SECURE） */
export async function applyScreenCaptureProtection(prevent: boolean): Promise<void> {
  try {
    if (prevent) {
      await ScreenCapture.preventScreenCaptureAsync('zerotally_privacy');
    } else {
      await ScreenCapture.allowScreenCaptureAsync('zerotally_privacy');
    }
  } catch {
    // 非原生或平台受限环境静默降级
  }
}
