import * as Crypto from 'expo-crypto';
import * as SecureStore from 'expo-secure-store';
import * as WebBrowser from 'expo-web-browser';
import { parseStoredGoogleTokens } from './credentials';
import { bytesToBase64Url, utf8ToBytes } from './rules';
import type {
  CloudCredentialStore,
  GoogleDriveTokenSet,
  GoogleOAuthPkcePair,
  GoogleOAuthRuntime,
} from './types';

/** 硬件安全存储键名（严格限定字母、数字、点、横线与下划线） */
const WEBDAV_PASSWORD_KEY = 'zerotally.cloud.webdav.password';
const GOOGLE_DRIVE_TOKENS_KEY = 'zerotally.cloud.gdrive.tokens';

const SECURE_STORE_OPTIONS: SecureStore.SecureStoreOptions = {
  keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY,
};

/**
 * 生产环境云凭据存储：基于 Android Keystore / iOS Keychain 加密保存 WebDAV 密码与 Google OAuth 令牌。
 * 绝不将任何敏感凭据写入 SQLite 或导出 JSON。
 */
export const expoSecureCredentialStore: CloudCredentialStore = {
  async getWebDavPassword(): Promise<string | null> {
    return SecureStore.getItemAsync(WEBDAV_PASSWORD_KEY, SECURE_STORE_OPTIONS);
  },

  async setWebDavPassword(password: string): Promise<void> {
    await SecureStore.setItemAsync(WEBDAV_PASSWORD_KEY, password, SECURE_STORE_OPTIONS);
  },

  async deleteWebDavPassword(): Promise<void> {
    await SecureStore.deleteItemAsync(WEBDAV_PASSWORD_KEY, SECURE_STORE_OPTIONS);
  },

  async getGoogleDriveTokens(): Promise<GoogleDriveTokenSet | null> {
    const raw = await SecureStore.getItemAsync(GOOGLE_DRIVE_TOKENS_KEY, SECURE_STORE_OPTIONS);
    return parseStoredGoogleTokens(raw);
  },

  async setGoogleDriveTokens(tokens: GoogleDriveTokenSet): Promise<void> {
    await SecureStore.setItemAsync(
      GOOGLE_DRIVE_TOKENS_KEY,
      JSON.stringify(tokens),
      SECURE_STORE_OPTIONS
    );
  },

  async deleteGoogleDriveTokens(): Promise<void> {
    await SecureStore.deleteItemAsync(GOOGLE_DRIVE_TOKENS_KEY, SECURE_STORE_OPTIONS);
  },
};

/**
 * 生产环境 Google OAuth 2.0 PKCE 与系统浏览器（Chrome Custom Tabs / ASWebAuthenticationSession）适配器。
 */
export const expoGoogleOAuthRuntime: GoogleOAuthRuntime = {
  async createPkceAndState(): Promise<GoogleOAuthPkcePair> {
    const verifierBytes = await Crypto.getRandomBytesAsync(32);
    const stateBytes = await Crypto.getRandomBytesAsync(24);
    const codeVerifier = bytesToBase64Url(verifierBytes);
    const state = bytesToBase64Url(stateBytes);

    const digestBuffer = await Crypto.digest(
      Crypto.CryptoDigestAlgorithm.SHA256,
      utf8ToBytes(codeVerifier)
    );
    const codeChallenge = bytesToBase64Url(new Uint8Array(digestBuffer));

    return {
      codeVerifier,
      codeChallenge,
      state,
    };
  },

  async openAuthSession(authUrl: string, redirectUri: string) {
    const result = await WebBrowser.openAuthSessionAsync(authUrl, redirectUri, {
      showTitle: true,
    });
    if (result.type === 'success') {
      return { type: 'success', url: result.url };
    }
    return {
      type: result.type === 'dismiss' ? 'dismiss' : 'cancel',
    };
  },
};

