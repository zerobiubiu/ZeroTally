import type { SqlExecutor } from '../../db/types';
import { getAppSetting, setAppSetting } from '../settings/repository';
import { isValidRetentionLimit } from './rules';
import type { CloudBackupConfig, CloudSyncStatus } from './types';

const CLOUD_BACKUP_CONFIG_KEY = 'cloud_backup_config';

export function createDefaultCloudBackupConfig(): CloudBackupConfig {
  return {
    autoBackupEnabled: false,
    maxSnapshots: 10,
    webdav: {
      enabled: false,
      serverUrl: '',
      username: '',
      remoteDirectory: '/ZeroTally',
      allowInsecureHttp: false,
      lastBackupAt: null,
      lastStatus: 'idle',
      lastError: null,
    },
    googleDrive: {
      enabled: false,
      clientId: '',
      accountEmail: null,
      accountName: null,
      folderId: null,
      lastBackupAt: null,
      lastStatus: 'idle',
      lastError: null,
    },
  };
}

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function asString(value: unknown, fallback: string): string {
  return typeof value === 'string' ? value : fallback;
}

function asNullableString(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function asSyncStatus(value: unknown): CloudSyncStatus {
  if (value === 'idle' || value === 'success' || value === 'error') {
    return value;
  }
  return 'idle';
}

/**
 * 读取非敏感云备份配置；损坏或首次启动时安全回退默认配置。
 */
export async function getCloudBackupConfig(db: SqlExecutor): Promise<CloudBackupConfig> {
  const raw = await getAppSetting(db, CLOUD_BACKUP_CONFIG_KEY);
  if (!raw) {
    return createDefaultCloudBackupConfig();
  }

  try {
    const parsed = asRecord(JSON.parse(raw));
    const webdavRaw = asRecord(parsed.webdav);
    const gdriveRaw = asRecord(parsed.googleDrive);
    const defaults = createDefaultCloudBackupConfig();

    return {
      autoBackupEnabled: Boolean(parsed.autoBackupEnabled),
      maxSnapshots: isValidRetentionLimit(parsed.maxSnapshots)
        ? parsed.maxSnapshots
        : defaults.maxSnapshots,
      webdav: {
        enabled: Boolean(webdavRaw.enabled),
        serverUrl: asString(webdavRaw.serverUrl, ''),
        username: asString(webdavRaw.username, ''),
        remoteDirectory: asString(webdavRaw.remoteDirectory, defaults.webdav.remoteDirectory),
        allowInsecureHttp: Boolean(webdavRaw.allowInsecureHttp),
        lastBackupAt: asNullableString(webdavRaw.lastBackupAt),
        lastStatus: asSyncStatus(webdavRaw.lastStatus),
        lastError: asNullableString(webdavRaw.lastError),
      },
      googleDrive: {
        enabled: Boolean(gdriveRaw.enabled),
        clientId: asString(gdriveRaw.clientId, ''),
        accountEmail: asNullableString(gdriveRaw.accountEmail),
        accountName: asNullableString(gdriveRaw.accountName),
        folderId: asNullableString(gdriveRaw.folderId),
        lastBackupAt: asNullableString(gdriveRaw.lastBackupAt),
        lastStatus: asSyncStatus(gdriveRaw.lastStatus),
        lastError: asNullableString(gdriveRaw.lastError),
      },
    };
  } catch {
    return createDefaultCloudBackupConfig();
  }
}

/**
 * 持久化非敏感云备份配置到 app_settings。
 */
export async function saveCloudBackupConfig(
  db: SqlExecutor,
  config: CloudBackupConfig,
  updatedAt?: string
): Promise<void> {
  await setAppSetting(db, CLOUD_BACKUP_CONFIG_KEY, JSON.stringify(config), updatedAt);
}
