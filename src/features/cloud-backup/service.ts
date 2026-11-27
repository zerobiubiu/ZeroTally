import type { SqlExecutor } from '../../db/types';
import type { ThemePreference } from '../../theme/theme-context';
import {
  generateLedgerExport,
  importFullLedgerBackup,
  parseAndValidateFullBackup,
} from '../export/service';
import type { ValidatedLedgerImport } from '../export/types';
import {
  getCloudBackupConfig,
  saveCloudBackupConfig,
} from './config-repository';
import {
  authorizeGoogleDriveAccount,
  deleteGoogleDriveSnapshot,
  downloadGoogleDriveSnapshot,
  ensureGoogleDriveFolder,
  ensureValidGoogleAccessToken,
  listGoogleDriveSnapshots,
  revokeGoogleDriveToken,
  uploadGoogleDriveSnapshot,
} from './google-drive-provider';
import {
  buildCloudSnapshotFilename,
  isValidRetentionLimit,
  normalizeGoogleClientId,
  normalizeWebDavDirectory,
  normalizeWebDavServerUrl,
  selectSnapshotsToPrune,
} from './rules';
import type {
  CloudBackupConfig,
  CloudBackupDeps,
  CloudBackupOverview,
  CloudBackupRunResult,
  CloudCredentialStore,
  CloudProviderId,
  CloudRetentionLimit,
  CloudSnapshotItem,
  GoogleOAuthRuntime,
  SaveWebDavInput,
} from './types';
import {
  deleteWebDavSnapshot,
  downloadWebDavSnapshot,
  listWebDavSnapshots,
  testWebDavConnection,
  uploadWebDavSnapshot,
  type WebDavConnectionParams,
} from './webdav-provider';

/** 自动云备份抑制截止时间戳（导入恢复或清空账本后短期跳过自动回传） */
let autoBackupSuppressedUntilMs = 0;
/** 自动云备份并发防重入锁 */
let autoBackupInFlight = false;
/** 上次自动云备份触发时间戳（用于冷却保护） */
let lastAutoBackupCompletedAtMs = 0;

const AUTO_BACKUP_COOLDOWN_MS = 60_000;

/**
 * 在导入恢复或重置账本后临时抑制自动云备份，避免刚恢复的数据立即回传覆盖历史滚动窗口。
 */
export function suppressAutoCloudBackup(durationMs: number = 20_000): void {
  const until = Date.now() + Math.max(0, durationMs);
  if (until > autoBackupSuppressedUntilMs) {
    autoBackupSuppressedUntilMs = until;
  }
}

/**
 * 仅供单元测试重置自动备份内存状态。
 */
export function __resetAutoBackupStateForTests(): void {
  autoBackupSuppressedUntilMs = 0;
  autoBackupInFlight = false;
  lastAutoBackupCompletedAtMs = 0;
}

async function resolveCredentials(deps?: CloudBackupDeps): Promise<CloudCredentialStore> {
  if (deps?.credentials) {
    return deps.credentials;
  }
  const mod = await import('./native-runtime');
  return mod.expoSecureCredentialStore;
}

async function resolveGoogleOAuthRuntime(deps?: CloudBackupDeps): Promise<GoogleOAuthRuntime> {
  if (deps?.googleOAuthRuntime) {
    return deps.googleOAuthRuntime;
  }
  const mod = await import('./native-runtime');
  return mod.expoGoogleOAuthRuntime;
}

function resolvePresetGoogleClientId(deps?: CloudBackupDeps): string {
  if (deps?.presetGoogleClientId !== undefined) {
    return deps.presetGoogleClientId.trim();
  }
  const raw = process.env.EXPO_PUBLIC_GOOGLE_DRIVE_ANDROID_CLIENT_ID;
  return typeof raw === 'string' ? raw.trim() : '';
}

function getEffectiveGoogleClientId(config: CloudBackupConfig, presetClientId: string): string {
  const custom = config.googleDrive.clientId.trim();
  return custom || presetClientId;
}

function getReadyProviders(
  config: CloudBackupConfig,
  hasWebDavPassword: boolean,
  hasGoogleDriveTokens: boolean,
  presetClientId: string
): CloudProviderId[] {
  const list: CloudProviderId[] = [];
  if (
    config.webdav.enabled &&
    config.webdav.serverUrl.trim().length > 0 &&
    config.webdav.username.trim().length > 0 &&
    hasWebDavPassword
  ) {
    list.push('webdav');
  }
  if (
    config.googleDrive.enabled &&
    hasGoogleDriveTokens &&
    getEffectiveGoogleClientId(config, presetClientId).length > 0
  ) {
    list.push('google-drive');
  }
  return list;
}

/**
 * 读取云备份总览状态（含非敏感配置、安全凭据就绪标记与已启用通道列表）。
 */
export async function getCloudBackupOverview(
  db: SqlExecutor,
  deps?: CloudBackupDeps
): Promise<CloudBackupOverview> {
  const credentials = await resolveCredentials(deps);
  const presetGoogleClientId = resolvePresetGoogleClientId(deps);
  const [config, webdavPwd, googleTokens] = await Promise.all([
    getCloudBackupConfig(db),
    credentials.getWebDavPassword(),
    credentials.getGoogleDriveTokens(),
  ]);

  const hasWebDavPassword = typeof webdavPwd === 'string' && webdavPwd.length > 0;
  const hasGoogleDriveTokens = googleTokens !== null;

  return {
    config,
    hasWebDavPassword,
    hasGoogleDriveTokens,
    presetGoogleClientId,
    readyProviders: getReadyProviders(
      config,
      hasWebDavPassword,
      hasGoogleDriveTokens,
      presetGoogleClientId
    ),
  };
}

async function resolveWebDavParamsFromInput(
  input: SaveWebDavInput,
  credentials: CloudCredentialStore
): Promise<WebDavConnectionParams> {
  const serverUrl = normalizeWebDavServerUrl(input.serverUrl, input.allowInsecureHttp);
  const remoteDirectory = normalizeWebDavDirectory(input.remoteDirectory);
  const username = input.username.trim();
  if (!username) {
    throw new Error('请输入 WebDAV 账号');
  }

  let password = input.password ?? '';
  if (!password) {
    password = (await credentials.getWebDavPassword()) ?? '';
  }
  if (!password) {
    throw new Error('请输入 WebDAV 密码或应用专用密码');
  }

  return {
    serverUrl,
    username,
    password,
    remoteDirectory,
    allowInsecureHttp: input.allowInsecureHttp,
  };
}

/**
 * 测试 WebDAV 连接（支持在编辑页留空密码时复用已安全保存的原密码）。
 */
export async function testWebDavSettings(
  input: SaveWebDavInput,
  deps?: CloudBackupDeps
): Promise<void> {
  const credentials = await resolveCredentials(deps);
  const params = await resolveWebDavParamsFromInput(input, credentials);
  await testWebDavConnection(params, deps?.fetchFn ?? fetch);
}

/**
 * 保存 WebDAV 配置：非敏感参数写入 SQLite app_settings，密码独立存入 SecureStore。
 */
export async function saveWebDavSettings(
  db: SqlExecutor,
  input: SaveWebDavInput,
  deps?: CloudBackupDeps
): Promise<CloudBackupConfig> {
  const credentials = await resolveCredentials(deps);
  const params = await resolveWebDavParamsFromInput(input, credentials);
  const current = await getCloudBackupConfig(db);

  if (input.password && input.password.length > 0) {
    await credentials.setWebDavPassword(input.password);
  }

  const next: CloudBackupConfig = {
    ...current,
    webdav: {
      ...current.webdav,
      enabled: input.enabled ?? true,
      serverUrl: params.serverUrl,
      username: params.username,
      remoteDirectory: params.remoteDirectory,
      allowInsecureHttp: params.allowInsecureHttp,
      lastError: null,
    },
  };
  await saveCloudBackupConfig(db, next);
  return next;
}

/**
 * 断开 WebDAV 并彻底清除 SecureStore 中保存的密码。
 */
export async function disconnectWebDav(
  db: SqlExecutor,
  deps?: CloudBackupDeps
): Promise<CloudBackupConfig> {
  const credentials = await resolveCredentials(deps);
  await credentials.deleteWebDavPassword();
  const current = await getCloudBackupConfig(db);
  const next: CloudBackupConfig = {
    ...current,
    webdav: {
      ...current.webdav,
      enabled: false,
      lastStatus: 'idle',
      lastError: null,
    },
  };
  await saveCloudBackupConfig(db, next);
  return next;
}

/**
 * 执行 Google Drive OAuth 2.0 PKCE 登录授权并持久化令牌与账号信息。
 */
export async function connectGoogleDrive(
  db: SqlExecutor,
  input: { clientId?: string },
  deps?: CloudBackupDeps
): Promise<CloudBackupConfig> {
  const presetClientId = resolvePresetGoogleClientId(deps);
  const [credentials, runtime, current] = await Promise.all([
    resolveCredentials(deps),
    resolveGoogleOAuthRuntime(deps),
    getCloudBackupConfig(db),
  ]);

  const rawClientId =
    input.clientId !== undefined && input.clientId.trim().length > 0
      ? input.clientId.trim()
      : getEffectiveGoogleClientId(current, presetClientId);
  const normalizedClientId = normalizeGoogleClientId(rawClientId);

  const authResult = await authorizeGoogleDriveAccount({
    clientId: normalizedClientId,
    runtime,
    fetchFn: deps?.fetchFn ?? fetch,
    now: deps?.now,
  });

  await credentials.setGoogleDriveTokens(authResult.tokens);

  // 若切换了不同 Google 账号，清空旧 folderId 缓存避免跨号引用
  const isDifferentAccount =
    current.googleDrive.accountEmail !== null &&
    authResult.accountEmail !== null &&
    current.googleDrive.accountEmail !== authResult.accountEmail;

  const next: CloudBackupConfig = {
    ...current,
    googleDrive: {
      ...current.googleDrive,
      enabled: true,
      clientId: input.clientId !== undefined ? input.clientId.trim() : current.googleDrive.clientId,
      accountEmail: authResult.accountEmail,
      accountName: authResult.accountName,
      folderId: isDifferentAccount ? null : current.googleDrive.folderId,
      lastError: null,
    },
  };
  await saveCloudBackupConfig(db, next);
  return next;
}

/**
 * 断开 Google Drive：尽力吊销远端令牌、清除 SecureStore 令牌并重置账号连接状态。
 */
export async function disconnectGoogleDrive(
  db: SqlExecutor,
  deps?: CloudBackupDeps
): Promise<CloudBackupConfig> {
  const credentials = await resolveCredentials(deps);
  const existingTokens = await credentials.getGoogleDriveTokens();
  if (existingTokens) {
    await revokeGoogleDriveToken(
      existingTokens.refreshToken || existingTokens.accessToken,
      deps?.fetchFn ?? fetch
    );
  }
  await credentials.deleteGoogleDriveTokens();

  const current = await getCloudBackupConfig(db);
  const next: CloudBackupConfig = {
    ...current,
    googleDrive: {
      ...current.googleDrive,
      enabled: false,
      accountEmail: null,
      accountName: null,
      folderId: null,
      lastStatus: 'idle',
      lastError: null,
    },
  };
  await saveCloudBackupConfig(db, next);
  return next;
}

/**
 * 更新云备份全局策略（自动云备份开关、历史快照保留上限、单通道开关）。
 */
export async function updateCloudBackupPolicy(
  db: SqlExecutor,
  patch: {
    autoBackupEnabled?: boolean;
    maxSnapshots?: CloudRetentionLimit;
    webdavEnabled?: boolean;
    googleDriveEnabled?: boolean;
  }
): Promise<CloudBackupConfig> {
  const current = await getCloudBackupConfig(db);
  const next: CloudBackupConfig = {
    ...current,
    autoBackupEnabled:
      patch.autoBackupEnabled !== undefined
        ? patch.autoBackupEnabled
        : current.autoBackupEnabled,
    maxSnapshots:
      patch.maxSnapshots !== undefined && isValidRetentionLimit(patch.maxSnapshots)
        ? patch.maxSnapshots
        : current.maxSnapshots,
    webdav: {
      ...current.webdav,
      enabled:
        patch.webdavEnabled !== undefined ? patch.webdavEnabled : current.webdav.enabled,
    },
    googleDrive: {
      ...current.googleDrive,
      enabled:
        patch.googleDriveEnabled !== undefined
          ? patch.googleDriveEnabled
          : current.googleDrive.enabled,
    },
  };
  await saveCloudBackupConfig(db, next);
  return next;
}

async function getStoredWebDavParams(
  config: CloudBackupConfig,
  credentials: CloudCredentialStore
): Promise<WebDavConnectionParams> {
  const password = await credentials.getWebDavPassword();
  if (!config.webdav.serverUrl.trim() || !config.webdav.username.trim() || !password) {
    throw new Error('WebDAV 尚未完成配置，请先填写服务器与凭据');
  }
  return {
    serverUrl: config.webdav.serverUrl,
    username: config.webdav.username,
    password,
    remoteDirectory: config.webdav.remoteDirectory,
    allowInsecureHttp: config.webdav.allowInsecureHttp,
  };
}

async function resolveGoogleSession(
  db: SqlExecutor,
  config: CloudBackupConfig,
  credentials: CloudCredentialStore,
  deps?: CloudBackupDeps
): Promise<{ accessToken: string; folderId: string }> {
  const fetchFn = deps?.fetchFn ?? fetch;
  const presetClientId = resolvePresetGoogleClientId(deps);
  const clientId = getEffectiveGoogleClientId(config, presetClientId);
  const accessToken = await ensureValidGoogleAccessToken({
    clientId,
    credentials,
    fetchFn,
    now: deps?.now,
  });
  const folderId = await ensureGoogleDriveFolder(
    accessToken,
    config.googleDrive.folderId,
    fetchFn
  );

  if (folderId !== config.googleDrive.folderId) {
    const latest = await getCloudBackupConfig(db);
    await saveCloudBackupConfig(db, {
      ...latest,
      googleDrive: {
        ...latest.googleDrive,
        folderId,
      },
    });
  }

  return { accessToken, folderId };
}

/**
 * 向指定云通道执行一次完整账本快照备份，并在上传成功后按策略裁剪超出上限的历史快照。
 */
export async function backupToCloudProvider(
  db: SqlExecutor,
  provider: CloudProviderId,
  deps?: CloudBackupDeps
): Promise<CloudBackupRunResult> {
  const fetchFn = deps?.fetchFn ?? fetch;
  const nowFn = deps?.now ?? (() => new Date());
  const now = nowFn();
  const credentials = await resolveCredentials(deps);
  const config = await getCloudBackupConfig(db);

  try {
    const artifact = await generateLedgerExport(db, now);
    const filename = buildCloudSnapshotFilename(now);
    let prunedCount = 0;

    if (provider === 'webdav') {
      const params = await getStoredWebDavParams(config, credentials);
      await uploadWebDavSnapshot(params, filename, artifact.content, fetchFn);

      if (config.maxSnapshots > 0) {
        try {
          const allSnapshots = await listWebDavSnapshots(params, fetchFn);
          const toPrune = selectSnapshotsToPrune(allSnapshots, config.maxSnapshots);
          for (const stale of toPrune) {
            await deleteWebDavSnapshot(params, stale.filename, fetchFn);
            prunedCount += 1;
          }
        } catch {
          // 历史清理失败不影响本次备份成功
        }
      }
    } else {
      const { accessToken, folderId } = await resolveGoogleSession(
        db,
        config,
        credentials,
        deps
      );
      await uploadGoogleDriveSnapshot({
        accessToken,
        folderId,
        filename,
        content: artifact.content,
        fetchFn,
      });

      if (config.maxSnapshots > 0) {
        try {
          const allSnapshots = await listGoogleDriveSnapshots(accessToken, folderId, fetchFn);
          const toPrune = selectSnapshotsToPrune(allSnapshots, config.maxSnapshots);
          for (const stale of toPrune) {
            await deleteGoogleDriveSnapshot(accessToken, stale.id, fetchFn);
            prunedCount += 1;
          }
        } catch {
          // 历史清理失败不影响本次备份成功
        }
      }
    }

    const latest = await getCloudBackupConfig(db);
    const syncedAt = now.toISOString();
    const updated: CloudBackupConfig =
      provider === 'webdav'
        ? {
            ...latest,
            webdav: {
              ...latest.webdav,
              lastBackupAt: syncedAt,
              lastStatus: 'success',
              lastError: null,
            },
          }
        : {
            ...latest,
            googleDrive: {
              ...latest.googleDrive,
              lastBackupAt: syncedAt,
              lastStatus: 'success',
              lastError: null,
            },
          };
    await saveCloudBackupConfig(db, updated, syncedAt);

    return {
      provider,
      ok: true,
      filename,
      prunedCount,
      transactionCount: artifact.transactionCount,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : '云备份失败';
    const latest = await getCloudBackupConfig(db);
    const updated: CloudBackupConfig =
      provider === 'webdav'
        ? {
            ...latest,
            webdav: {
              ...latest.webdav,
              lastStatus: 'error',
              lastError: message,
            },
          }
        : {
            ...latest,
            googleDrive: {
              ...latest.googleDrive,
              lastStatus: 'error',
              lastError: message,
            },
          };
    await saveCloudBackupConfig(db, updated);

    return {
      provider,
      ok: false,
      prunedCount: 0,
      error: message,
    };
  }
}

/**
 * 向全部已启用且凭据就绪的云通道执行一次备份。
 */
export async function backupToAllEnabledProviders(
  db: SqlExecutor,
  deps?: CloudBackupDeps
): Promise<CloudBackupRunResult[]> {
  const overview = await getCloudBackupOverview(db, deps);
  if (overview.readyProviders.length === 0) {
    throw new Error('请先配置并启用至少一个云备份通道（WebDAV 或 Google Drive）');
  }

  const results: CloudBackupRunResult[] = [];
  for (const provider of overview.readyProviders) {
    results.push(await backupToCloudProvider(db, provider, deps));
  }
  return results;
}

/**
 * 列出指定云通道的全部历史备份快照（按时间倒序）。
 */
export async function listCloudSnapshots(
  db: SqlExecutor,
  provider: CloudProviderId,
  deps?: CloudBackupDeps
): Promise<CloudSnapshotItem[]> {
  const fetchFn = deps?.fetchFn ?? fetch;
  const credentials = await resolveCredentials(deps);
  const config = await getCloudBackupConfig(db);

  if (provider === 'webdav') {
    const params = await getStoredWebDavParams(config, credentials);
    return listWebDavSnapshots(params, fetchFn);
  }

  const { accessToken, folderId } = await resolveGoogleSession(db, config, credentials, deps);
  return listGoogleDriveSnapshots(accessToken, folderId, fetchFn);
}

/**
 * 从云端下载指定历史快照并执行完整结构、外键与完整性指纹校验（不修改本地数据库）。
 */
export async function downloadAndValidateCloudSnapshot(
  db: SqlExecutor,
  provider: CloudProviderId,
  snapshot: CloudSnapshotItem,
  deps?: CloudBackupDeps
): Promise<ValidatedLedgerImport> {
  const fetchFn = deps?.fetchFn ?? fetch;
  const credentials = await resolveCredentials(deps);
  const config = await getCloudBackupConfig(db);

  let rawText: string;
  if (provider === 'webdav') {
    const params = await getStoredWebDavParams(config, credentials);
    rawText = await downloadWebDavSnapshot(params, snapshot.filename, fetchFn);
  } else {
    const { accessToken } = await resolveGoogleSession(db, config, credentials, deps);
    rawText = await downloadGoogleDriveSnapshot(accessToken, snapshot.id, fetchFn);
  }

  return parseAndValidateFullBackup(rawText);
}

/**
 * 使用已通过校验的云端快照原子覆盖恢复本地账本，并开启短暂自动备份抑制防循环回传。
 */
export async function restoreCloudSnapshot(
  db: SqlExecutor,
  validated: ValidatedLedgerImport
): Promise<{
  themePreference: ThemePreference;
  accountCount: number;
  categoryCount: number;
  quickTemplateCount: number;
  transactionCount: number;
}> {
  suppressAutoCloudBackup(25_000);
  return importFullLedgerBackup(db, validated.payload);
}

/**
 * 删除云端指定的单份历史快照。
 */
export async function deleteCloudSnapshot(
  db: SqlExecutor,
  provider: CloudProviderId,
  snapshot: CloudSnapshotItem,
  deps?: CloudBackupDeps
): Promise<void> {
  const fetchFn = deps?.fetchFn ?? fetch;
  const credentials = await resolveCredentials(deps);
  const config = await getCloudBackupConfig(db);

  if (provider === 'webdav') {
    const params = await getStoredWebDavParams(config, credentials);
    await deleteWebDavSnapshot(params, snapshot.filename, fetchFn);
    return;
  }

  const { accessToken } = await resolveGoogleSession(db, config, credentials, deps);
  await deleteGoogleDriveSnapshot(accessToken, snapshot.id, fetchFn);
}

/**
 * 静默自动云备份入口：由根布局在账本变动防抖后调用。
 * 内置并发锁、恢复抑制与 60 秒冷却窗口，异常静默记录状态而不阻塞或打断用户记账。
 */
export async function runAutoCloudBackupIfNeeded(
  db: SqlExecutor,
  deps?: CloudBackupDeps & { bypassCooldown?: boolean }
): Promise<CloudBackupRunResult[]> {
  const nowMs = (deps?.now ? deps.now() : new Date()).getTime();
  if (autoBackupInFlight) {
    return [];
  }
  if (nowMs < autoBackupSuppressedUntilMs) {
    return [];
  }
  if (!deps?.bypassCooldown && nowMs - lastAutoBackupCompletedAtMs < AUTO_BACKUP_COOLDOWN_MS) {
    return [];
  }

  autoBackupInFlight = true;
  try {
    const overview = await getCloudBackupOverview(db, deps);
    if (!overview.config.autoBackupEnabled || overview.readyProviders.length === 0) {
      return [];
    }

    const results: CloudBackupRunResult[] = [];
    for (const provider of overview.readyProviders) {
      results.push(await backupToCloudProvider(db, provider, deps));
    }
    lastAutoBackupCompletedAtMs = (deps?.now ? deps.now() : new Date()).getTime();
    return results;
  } catch {
    return [];
  } finally {
    autoBackupInFlight = false;
  }
}
