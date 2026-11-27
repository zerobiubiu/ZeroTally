export type CloudProviderId = 'webdav' | 'google-drive';

export type CloudSyncStatus = 'idle' | 'success' | 'error';

/** 历史云快照保留上限选项（0 表示不限） */
export type CloudRetentionLimit = 5 | 10 | 20 | 0;

export interface WebDavConfig {
  enabled: boolean;
  /** 规范化后的 WebDAV 基础 URL（默认要求 HTTPS） */
  serverUrl: string;
  username: string;
  /** 远端相对目录路径，如 /ZeroTally */
  remoteDirectory: string;
  /** 仅局域网或自建内网服务按需开启 HTTP 明文连接 */
  allowInsecureHttp: boolean;
  lastBackupAt: string | null;
  lastStatus: CloudSyncStatus;
  lastError: string | null;
}

export interface GoogleDriveConfig {
  enabled: boolean;
  /** 用户在应用内填写的 Android OAuth Client ID（留空时回退编译期预置值） */
  clientId: string;
  /** 已授权 Google 账号邮箱 */
  accountEmail: string | null;
  /** 已授权账号显示名 */
  accountName: string | null;
  /** Google Drive 中可见文件夹 ZeroTally 的 fileId 缓存 */
  folderId: string | null;
  lastBackupAt: string | null;
  lastStatus: CloudSyncStatus;
  lastError: string | null;
}

/** 存入 SQLite app_settings 的非敏感云备份配置（严禁包含密码或 OAuth Token） */
export interface CloudBackupConfig {
  autoBackupEnabled: boolean;
  maxSnapshots: CloudRetentionLimit;
  webdav: WebDavConfig;
  googleDrive: GoogleDriveConfig;
}

/** 独立存入硬件加密 SecureStore 的 Google OAuth 令牌载荷 */
export interface GoogleDriveTokenSet {
  accessToken: string;
  refreshToken: string;
  /** 过期时间戳（毫秒） */
  expiresAt: number;
  scope: string;
  tokenType: string;
}

export interface CloudCredentialStore {
  getWebDavPassword(): Promise<string | null>;
  setWebDavPassword(password: string): Promise<void>;
  deleteWebDavPassword(): Promise<void>;
  getGoogleDriveTokens(): Promise<GoogleDriveTokenSet | null>;
  setGoogleDriveTokens(tokens: GoogleDriveTokenSet): Promise<void>;
  deleteGoogleDriveTokens(): Promise<void>;
}

export interface CloudSnapshotItem {
  provider: CloudProviderId;
  /** 唯一标识：WebDAV 为远端文件名，Google Drive 为 fileId */
  id: string;
  filename: string;
  sizeBytes: number | null;
  modifiedAt: string | null;
}

export interface CloudBackupRunResult {
  provider: CloudProviderId;
  ok: boolean;
  filename?: string;
  prunedCount: number;
  transactionCount?: number;
  error?: string;
}

export interface CloudBackupOverview {
  config: CloudBackupConfig;
  hasWebDavPassword: boolean;
  hasGoogleDriveTokens: boolean;
  /** 编译期预置的 Google Android Client ID（可为空串） */
  presetGoogleClientId: string;
  /** 当前真正处于就绪可备份状态的通道 */
  readyProviders: CloudProviderId[];
}

export interface SaveWebDavInput {
  serverUrl: string;
  username: string;
  /** 编辑模式下留空且本地已有密码时，沿用原密码 */
  password?: string;
  remoteDirectory: string;
  allowInsecureHttp: boolean;
  enabled?: boolean;
}

export interface WebDavPreset {
  id: string;
  label: string;
  serverUrl: string;
  defaultDirectory: string;
  hint: string;
}

export interface GoogleOAuthPkcePair {
  codeVerifier: string;
  codeChallenge: string;
  state: string;
}

export interface GoogleOAuthRuntime {
  createPkceAndState(): Promise<GoogleOAuthPkcePair>;
  openAuthSession(authUrl: string, redirectUri: string): Promise<
    | { type: 'success'; url: string }
    | { type: 'cancel' | 'dismiss' }
  >;
}

export interface CloudBackupDeps {
  credentials?: CloudCredentialStore;
  fetchFn?: typeof fetch;
  googleOAuthRuntime?: GoogleOAuthRuntime;
  now?: () => Date;
  presetGoogleClientId?: string;
}
