import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createNodeTestDatabase } from '../../db/node-test-client';
import { initializeSchema } from '../../db/schema';
import { DEFAULT_WALLET_ACCOUNT_ID, resetDatabase, seedDefaultData } from '../../db/seed';
import type { SqlExecutor } from '../../db/types';
import { findAllTransactions } from '../transactions/repository';
import { createTransaction } from '../transactions/service';
import { createMemoryCredentialStore } from './credentials';
import {
  __resetAutoBackupStateForTests,
  backupToCloudProvider,
  connectGoogleDrive,
  deleteCloudSnapshot,
  disconnectGoogleDrive,
  disconnectWebDav,
  downloadAndValidateCloudSnapshot,
  getCloudBackupOverview,
  listCloudSnapshots,
  restoreCloudSnapshot,
  runAutoCloudBackupIfNeeded,
  saveWebDavSettings,
  testWebDavSettings,
  updateCloudBackupPolicy,
} from './service';
import type { GoogleOAuthRuntime } from './types';

function createMockWebDavServer() {
  const files = new Map<string, { content: string; modifiedAt: string }>();
  const createdDirs = new Set<string>();
  const expectedAuth = `Basic ${Buffer.from('demo@example.com:app-secret-123', 'utf8').toString('base64')}`;

  const fetchFn: typeof fetch = async (input, init) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
    const method = (init?.method ?? 'GET').toUpperCase();
    const headers = new Headers(init?.headers);
    if (headers.get('Authorization') !== expectedAuth) {
      return new Response('Unauthorized', { status: 401 });
    }

    const parsed = new URL(url);
    const pathname = parsed.pathname;

    if (method === 'PROPFIND') {
      const depth = headers.get('Depth') ?? '0';
      if (depth === '0') {
        return new Response('<d:multistatus xmlns:d="DAV:"/>', { status: 207 });
      }
      const entriesXml = [...files.entries()]
        .map(
          ([name, meta]) => `
          <d:response>
            <d:href>${pathname}${encodeURIComponent(name)}</d:href>
            <d:propstat>
              <d:prop>
                <d:getcontentlength>${Buffer.byteLength(meta.content, 'utf8')}</d:getcontentlength>
                <d:getlastmodified>${new Date(meta.modifiedAt).toUTCString()}</d:getlastmodified>
              </d:prop>
            </d:propstat>
          </d:response>`
        )
        .join('');
      return new Response(
        `<?xml version="1.0" encoding="utf-8"?><d:multistatus xmlns:d="DAV:">${entriesXml}</d:multistatus>`,
        { status: 207, headers: { 'Content-Type': 'application/xml' } }
      );
    }

    if (method === 'MKCOL') {
      const existed = createdDirs.has(pathname);
      createdDirs.add(pathname);
      return new Response('', { status: existed ? 405 : 201 });
    }

    if (method === 'PUT') {
      const filename = decodeURIComponent(pathname.split('/').pop() ?? '');
      const bodyText = typeof init?.body === 'string' ? init.body : '';
      files.set(filename, {
        content: bodyText,
        modifiedAt: new Date().toISOString(),
      });
      return new Response('', { status: 201 });
    }

    if (method === 'GET') {
      const filename = decodeURIComponent(pathname.split('/').pop() ?? '');
      const file = files.get(filename);
      if (!file) {
        return new Response('Not Found', { status: 404 });
      }
      return new Response(file.content, {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': String(Buffer.byteLength(file.content, 'utf8')),
        },
      });
    }

    if (method === 'DELETE') {
      const filename = decodeURIComponent(pathname.split('/').pop() ?? '');
      files.delete(filename);
      return new Response(null, { status: 204 });
    }

    return new Response('Method Not Allowed', { status: 405 });
  };

  return { fetchFn, files, createdDirs };
}

describe('cloud-backup service (WebDAV & Google Drive)', () => {
  let db: SqlExecutor;
  let closeDb: () => void;

  beforeEach(async () => {
    __resetAutoBackupStateForTests();
    const handle = createNodeTestDatabase();
    db = handle.db;
    closeDb = handle.close;
    await initializeSchema(db);
    await seedDefaultData(db);
  });

  afterEach(() => {
    closeDb();
  });

  it('WebDAV 完整闭环：测试连接、保存加密凭据、备份并裁剪旧快照、清空本地后下载原子恢复且绝不泄露密码', async () => {
    const server = createMockWebDavServer();
    const credentials = createMemoryCredentialStore();

    // 预置 5 份旧快照，设定保留上限为 5，本次新增第 6 份应自动淘汰最旧的 1 份
    for (let day = 1; day <= 5; day += 1) {
      const name = `ZeroTally-2026-11-0${day}T00-00-00Z.json`;
      server.files.set(name, {
        content: '{}',
        modifiedAt: `2026-11-0${day}T00:00:00.000Z`,
      });
    }

    await testWebDavSettings(
      {
        serverUrl: 'https://dav.jianguoyun.com/dav',
        username: 'demo@example.com',
        password: 'app-secret-123',
        remoteDirectory: '/ZeroTally',
        allowInsecureHttp: false,
      },
      { credentials, fetchFn: server.fetchFn }
    );

    await saveWebDavSettings(
      db,
      {
        serverUrl: 'https://dav.jianguoyun.com/dav',
        username: 'demo@example.com',
        password: 'app-secret-123',
        remoteDirectory: '/ZeroTally',
        allowInsecureHttp: false,
      },
      { credentials, fetchFn: server.fetchFn }
    );
    await updateCloudBackupPolicy(db, { maxSnapshots: 5 });

    // 验证 SQLite app_settings 中不含明文密码
    const rawSetting = await db.getFirst<{ value: string }>(
      'SELECT value FROM app_settings WHERE key = ?',
      ['cloud_backup_config']
    );
    expect(rawSetting?.value).not.toContain('app-secret-123');
    expect(await credentials.getWebDavPassword()).toBe('app-secret-123');

    // 记一笔真实账目
    await createTransaction(db, {
      type: 'expense',
      amountCents: 3650,
      accountId: DEFAULT_WALLET_ACCOUNT_ID,
      toAccountId: null,
      categoryId: 'cat_exp_food',
      occurredOn: '2026-11-27',
      note: '云备份测试午餐',
    });

    // 执行云备份
    const runResult = await backupToCloudProvider(db, 'webdav', {
      credentials,
      fetchFn: server.fetchFn,
      now: () => new Date('2026-11-27T09:15:30.000Z'),
    });

    expect(runResult.ok).toBe(true);
    expect(runResult.filename).toBe('ZeroTally-2026-11-27T09-15-30Z.json');
    expect(runResult.prunedCount).toBe(1);
    expect(server.files.has('ZeroTally-2026-11-01T00-00-00Z.json')).toBe(false);
    expect(server.files.size).toBe(5);

    // 验证上传的 JSON 中绝不包含 WebDAV 密码
    const uploadedText = server.files.get('ZeroTally-2026-11-27T09-15-30Z.json')?.content ?? '';
    expect(uploadedText).not.toContain('app-secret-123');

    // 清空本地账本后，从 WebDAV 列出快照、下载校验并原子恢复
    await resetDatabase(db);
    expect(await findAllTransactions(db)).toHaveLength(0);

    const snapshots = await listCloudSnapshots(db, 'webdav', {
      credentials,
      fetchFn: server.fetchFn,
    });
    expect(snapshots[0]?.filename).toBe('ZeroTally-2026-11-27T09-15-30Z.json');

    const validated = await downloadAndValidateCloudSnapshot(db, 'webdav', snapshots[0]!, {
      credentials,
      fetchFn: server.fetchFn,
    });
    expect(validated.checksumMatched).toBe(true);
    expect(validated.payload.summary.transactionCount).toBe(1);

    const restored = await restoreCloudSnapshot(db, validated);
    expect(restored.transactionCount).toBe(1);

    const txsAfterRestore = await findAllTransactions(db);
    expect(txsAfterRestore).toHaveLength(1);
    expect(txsAfterRestore[0]?.note).toBe('云备份测试午餐');
    expect(txsAfterRestore[0]?.amountCents).toBe(3650);

    // 删除指定快照与断开连接后清除凭据
    await deleteCloudSnapshot(db, 'webdav', snapshots[1]!, {
      credentials,
      fetchFn: server.fetchFn,
    });
    expect(server.files.size).toBe(4);

    await disconnectWebDav(db, { credentials });
    expect(await credentials.getWebDavPassword()).toBeNull();
    const overview = await getCloudBackupOverview(db, { credentials, presetGoogleClientId: '' });
    expect(overview.hasWebDavPassword).toBe(false);
    expect(overview.readyProviders).toEqual([]);
  });

  it('Google Drive 完整闭环：PKCE 授权、Token 过期自动续期、自动建 ZeroTally 文件夹上传、拉取与断开吊销', async () => {
    const credentials = createMemoryCredentialStore();
    const clientId = '9876543210-zerotally.apps.googleusercontent.com';
    const driveFiles = new Map<string, { id: string; name: string; content: string; modifiedTime: string }>();
    let refreshCount = 0;
    let revokeCalled = false;
    let folderCreated = false;

    const runtime: GoogleOAuthRuntime = {
      async createPkceAndState() {
        return {
          codeVerifier: 'verifier_test_value_1234567890',
          codeChallenge: 'challenge_test_value_1234567890',
          state: 'csrf_state_token_abc',
        };
      },
      async openAuthSession(authUrl, redirectUri) {
        const parsed = new URL(authUrl);
        expect(parsed.searchParams.get('client_id')).toBe(clientId);
        expect(parsed.searchParams.get('state')).toBe('csrf_state_token_abc');
        return {
          type: 'success',
          url: `${redirectUri}?code=google_auth_code_99&state=csrf_state_token_abc`,
        };
      },
    };

    const fetchFn: typeof fetch = async (input, init) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
      const method = (init?.method ?? 'GET').toUpperCase();

      if (url === 'https://oauth2.googleapis.com/token' && method === 'POST') {
        const form = new URLSearchParams(typeof init?.body === 'string' ? init.body : '');
        const grantType = form.get('grant_type');
        if (grantType === 'authorization_code') {
          expect(form.get('code')).toBe('google_auth_code_99');
          expect(form.get('code_verifier')).toBe('verifier_test_value_1234567890');
          return new Response(
            JSON.stringify({
              access_token: 'access_initial_token',
              refresh_token: 'refresh_token_1',
              expires_in: 60, // 故意设置短过期以触发后续自动续期
              token_type: 'Bearer',
              scope: 'https://www.googleapis.com/auth/drive.file',
            }),
            { status: 200, headers: { 'Content-Type': 'application/json' } }
          );
        }
        if (grantType === 'refresh_token') {
          refreshCount += 1;
          expect(form.get('refresh_token')).toBe('refresh_token_1');
          return new Response(
            JSON.stringify({
              access_token: 'access_refreshed_token',
              expires_in: 3600,
              token_type: 'Bearer',
            }),
            { status: 200, headers: { 'Content-Type': 'application/json' } }
          );
        }
      }

      if (url.startsWith('https://www.googleapis.com/drive/v3/about')) {
        return new Response(
          JSON.stringify({
            user: { emailAddress: 'tally@gmail.com', displayName: 'ZeroTally User' },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }

      if (url.startsWith('https://oauth2.googleapis.com/revoke')) {
        revokeCalled = true;
        return new Response('', { status: 200 });
      }

      const authHeader = new Headers(init?.headers).get('Authorization');
      if (authHeader !== 'Bearer access_refreshed_token') {
        return new Response(JSON.stringify({ error: { message: 'Invalid token' } }), { status: 401 });
      }

      // 查找文件夹
      if (
        method === 'GET' &&
        url.startsWith('https://www.googleapis.com/drive/v3/files?q=') &&
        decodeURIComponent(url).includes('application/vnd.google-apps.folder')
      ) {
        return new Response(
          JSON.stringify({
            files: folderCreated ? [{ id: 'folder_zt_1', name: 'ZeroTally' }] : [],
          }),
          { status: 200 }
        );
      }

      // 创建文件夹
      if (method === 'POST' && url.startsWith('https://www.googleapis.com/drive/v3/files?fields=id')) {
        folderCreated = true;
        return new Response(JSON.stringify({ id: 'folder_zt_1' }), { status: 200 });
      }

      // 校验缓存文件夹
      if (method === 'GET' && url.startsWith('https://www.googleapis.com/drive/v3/files/folder_zt_1?')) {
        return new Response(
          JSON.stringify({
            id: 'folder_zt_1',
            trashed: false,
            mimeType: 'application/vnd.google-apps.folder',
          }),
          { status: 200 }
        );
      }

      // multipart 上传快照
      if (method === 'POST' && url.startsWith('https://www.googleapis.com/upload/drive/v3/files')) {
        const bodyText = typeof init?.body === 'string' ? init.body : '';
        const nameMatch = /"name":"([^"]+)"/.exec(bodyText);
        const filename = nameMatch?.[1] ?? 'ZeroTally-unknown.json';
        const parts = bodyText.split('\r\n\r\n');
        const rawJsonPart = (parts[2] ?? '').split('\r\n--')[0] ?? '';
        const id = `file_${driveFiles.size + 1}`;
        driveFiles.set(id, {
          id,
          name: filename,
          content: rawJsonPart,
          modifiedTime: '2026-11-27T10:00:00.000Z',
        });
        return new Response(
          JSON.stringify({
            id,
            name: filename,
            size: String(Buffer.byteLength(rawJsonPart, 'utf8')),
            modifiedTime: '2026-11-27T10:00:00.000Z',
          }),
          { status: 200 }
        );
      }

      // 列出文件夹内快照
      if (
        method === 'GET' &&
        url.startsWith('https://www.googleapis.com/drive/v3/files?q=') &&
        decodeURIComponent(url).includes("'folder_zt_1' in parents")
      ) {
        return new Response(
          JSON.stringify({
            files: [...driveFiles.values()].map((f) => ({
              id: f.id,
              name: f.name,
              size: String(Buffer.byteLength(f.content, 'utf8')),
              modifiedTime: f.modifiedTime,
            })),
          }),
          { status: 200 }
        );
      }

      // 下载文件
      if (method === 'GET' && url.includes('?alt=media')) {
        const id = url.split('/files/')[1]?.split('?')[0] ?? '';
        const item = driveFiles.get(id);
        if (!item) {
          return new Response('Not Found', { status: 404 });
        }
        return new Response(item.content, { status: 200 });
      }

      return new Response('Not Found', { status: 404 });
    };

    let currentTime = new Date('2026-11-27T10:00:00.000Z');
    const cfg = await connectGoogleDrive(
      db,
      { clientId },
      { credentials, googleOAuthRuntime: runtime, fetchFn, now: () => currentTime }
    );
    expect(cfg.googleDrive.enabled).toBe(true);
    expect(cfg.googleDrive.accountEmail).toBe('tally@gmail.com');

    // SQLite 不包含 OAuth Token
    const rawSetting = await db.getFirst<{ value: string }>(
      'SELECT value FROM app_settings WHERE key = ?',
      ['cloud_backup_config']
    );
    expect(rawSetting?.value).not.toContain('access_initial_token');
    expect(rawSetting?.value).not.toContain('refresh_token_1');

    // 推进时间触发 Token 过期自动续期并上传备份
    currentTime = new Date('2026-11-27T10:05:00.000Z');
    const backupRes = await backupToCloudProvider(db, 'google-drive', {
      credentials,
      fetchFn,
      now: () => currentTime,
      presetGoogleClientId: '',
    });
    expect(backupRes.ok).toBe(true);
    expect(refreshCount).toBe(1);
    expect(folderCreated).toBe(true);

    const storedTokens = await credentials.getGoogleDriveTokens();
    expect(storedTokens?.accessToken).toBe('access_refreshed_token');

    const snapshots = await listCloudSnapshots(db, 'google-drive', {
      credentials,
      fetchFn,
      now: () => currentTime,
      presetGoogleClientId: '',
    });
    expect(snapshots).toHaveLength(1);

    const validated = await downloadAndValidateCloudSnapshot(db, 'google-drive', snapshots[0]!, {
      credentials,
      fetchFn,
      now: () => currentTime,
      presetGoogleClientId: '',
    });
    expect(validated.checksumMatched).toBe(true);

    // 断开授权：吊销令牌并清除 SecureStore
    await disconnectGoogleDrive(db, { credentials, fetchFn });
    expect(revokeCalled).toBe(true);
    expect(await credentials.getGoogleDriveTokens()).toBeNull();
  });

  it('自动云备份遵循开关、恢复抑制与冷却窗口，通道异常时静默记录不抛错', async () => {
    const server = createMockWebDavServer();
    const credentials = createMemoryCredentialStore();

    await saveWebDavSettings(
      db,
      {
        serverUrl: 'https://dav.jianguoyun.com/dav',
        username: 'demo@example.com',
        password: 'app-secret-123',
        remoteDirectory: '/ZeroTally',
        allowInsecureHttp: false,
      },
      { credentials, fetchFn: server.fetchFn }
    );

    // 未开启自动备份时不触发
    const idleRuns = await runAutoCloudBackupIfNeeded(db, {
      credentials,
      fetchFn: server.fetchFn,
      presetGoogleClientId: '',
    });
    expect(idleRuns).toEqual([]);

    // 开启自动备份后正常触发
    await updateCloudBackupPolicy(db, { autoBackupEnabled: true });
    const firstRuns = await runAutoCloudBackupIfNeeded(db, {
      credentials,
      fetchFn: server.fetchFn,
      now: () => new Date('2026-11-27T11:00:00.000Z'),
      presetGoogleClientId: '',
    });
    expect(firstRuns).toHaveLength(1);
    expect(firstRuns[0]?.ok).toBe(true);

    // 60 秒冷却期内再次触发应被跳过
    const cooledRuns = await runAutoCloudBackupIfNeeded(db, {
      credentials,
      fetchFn: server.fetchFn,
      now: () => new Date('2026-11-27T11:00:20.000Z'),
      presetGoogleClientId: '',
    });
    expect(cooledRuns).toEqual([]);

    // 网络失败时静默吞错并落库 error 状态
    const failingFetch: typeof fetch = async () => new Response('Unauthorized', { status: 401 });
    const failedRuns = await runAutoCloudBackupIfNeeded(db, {
      credentials,
      fetchFn: failingFetch,
      now: () => new Date('2026-11-27T11:05:00.000Z'),
      presetGoogleClientId: '',
    });
    expect(failedRuns).toHaveLength(1);
    expect(failedRuns[0]?.ok).toBe(false);
    const overview = await getCloudBackupOverview(db, {
      credentials,
      presetGoogleClientId: '',
    });
    expect(overview.config.webdav.lastStatus).toBe('error');
    expect(overview.config.webdav.lastError).toContain('401');
  });
});
