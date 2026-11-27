import type { CloudCredentialStore, GoogleDriveTokenSet } from './types';

/**
 * 解析持久化在安全存储中的 Google OAuth 令牌 JSON；格式损坏时返回 null。
 */
export function parseStoredGoogleTokens(raw: string | null): GoogleDriveTokenSet | null {
  if (!raw) {
    return null;
  }
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    if (
      typeof parsed.accessToken === 'string' &&
      parsed.accessToken.length > 0 &&
      typeof parsed.refreshToken === 'string' &&
      typeof parsed.expiresAt === 'number' &&
      Number.isFinite(parsed.expiresAt)
    ) {
      return {
        accessToken: parsed.accessToken,
        refreshToken: parsed.refreshToken,
        expiresAt: parsed.expiresAt,
        scope: typeof parsed.scope === 'string' ? parsed.scope : '',
        tokenType: typeof parsed.tokenType === 'string' ? parsed.tokenType : 'Bearer',
      };
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * 纯内存凭据存储，供 Node Vitest 单元测试注入使用。
 */
export function createMemoryCredentialStore(initial?: {
  webdavPassword?: string | null;
  googleDriveTokens?: GoogleDriveTokenSet | null;
}): CloudCredentialStore {
  let webdavPassword: string | null = initial?.webdavPassword ?? null;
  let googleTokens: GoogleDriveTokenSet | null = initial?.googleDriveTokens
    ? { ...initial.googleDriveTokens }
    : null;

  return {
    async getWebDavPassword() {
      return webdavPassword;
    },
    async setWebDavPassword(password: string) {
      webdavPassword = password;
    },
    async deleteWebDavPassword() {
      webdavPassword = null;
    },
    async getGoogleDriveTokens() {
      return googleTokens ? { ...googleTokens } : null;
    },
    async setGoogleDriveTokens(tokens: GoogleDriveTokenSet) {
      googleTokens = { ...tokens };
    },
    async deleteGoogleDriveTokens() {
      googleTokens = null;
    },
  };
}
