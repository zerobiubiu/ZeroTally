import {
  buildGoogleOAuthAuthorizeUrl,
  GOOGLE_DRIVE_FOLDER_NAME,
  GOOGLE_DRIVE_REDIRECT_URI,
  GOOGLE_DRIVE_SCOPE,
  GOOGLE_OAUTH_REVOKE_ENDPOINT,
  GOOGLE_OAUTH_TOKEN_ENDPOINT,
  isCloudSnapshotFilename,
  MAX_CLOUD_BACKUP_BYTES,
  normalizeGoogleClientId,
  parseGoogleOAuthRedirectUrl,
  parseTimestampFromSnapshotFilename,
  sortCloudSnapshotsDesc,
  utf8ToBytes,
} from './rules';
import type {
  CloudCredentialStore,
  CloudSnapshotItem,
  GoogleDriveTokenSet,
  GoogleOAuthRuntime,
} from './types';

const DRIVE_FILES_API = 'https://www.googleapis.com/drive/v3/files';
const DRIVE_UPLOAD_API = 'https://www.googleapis.com/upload/drive/v3/files';
const DRIVE_ABOUT_API = 'https://www.googleapis.com/drive/v3/about';

const DEFAULT_TIMEOUT_MS = 20_000;
const TRANSFER_TIMEOUT_MS = 45_000;
const TOKEN_REFRESH_SKEW_MS = 120_000;

const SAFE_DRIVE_ID_RE = /^[A-Za-z0-9._-]{1,128}$/;

function assertValidDriveId(id: string, label: string): string {
  const trimmed = id.trim();
  if (!SAFE_DRIVE_ID_RE.test(trimmed)) {
    throw new Error(`Google Drive ${label}格式无效`);
  }
  return trimmed;
}

async function fetchWithTimeout(
  fetchFn: typeof fetch,
  url: string,
  init: RequestInit,
  timeoutMs: number
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetchFn(url, {
      ...init,
      signal: controller.signal,
    });
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') {
      throw new Error('Google Drive 请求超时，请检查网络连接');
    }
    throw new Error(
      err instanceof Error && err.message
        ? `Google Drive 网络请求失败：${err.message}`
        : 'Google Drive 网络请求失败，请检查网络连接'
    );
  } finally {
    clearTimeout(timer);
  }
}

async function parseJsonSafe(res: Response): Promise<Record<string, unknown>> {
  try {
    const data = await res.json();
    if (typeof data === 'object' && data !== null && !Array.isArray(data)) {
      return data as Record<string, unknown>;
    }
    return {};
  } catch {
    return {};
  }
}

function mapDriveApiError(status: number, body: Record<string, unknown>, action: string): Error {
  if (status === 401) {
    return new Error('Google Drive 授权已失效（401），请重新登录授权');
  }
  if (status === 403) {
    return new Error('Google Drive 权限不足或配额受限（403）');
  }
  if (status === 404) {
    return new Error('Google Drive 目标文件或目录不存在（404）');
  }
  const errObj =
    typeof body.error === 'object' && body.error !== null
      ? (body.error as Record<string, unknown>)
      : null;
  const detail =
    typeof errObj?.message === 'string'
      ? errObj.message
      : typeof body.error_description === 'string'
        ? body.error_description
        : '';
  return new Error(
    detail
      ? `Google Drive ${action}失败（HTTP ${status}）：${detail}`
      : `Google Drive ${action}失败（HTTP ${status}）`
  );
}

/**
 * 通过 OAuth 2.0 PKCE（S256）完成 Google Drive 授权，换取令牌并查询当前账号信息。
 */
export async function authorizeGoogleDriveAccount(params: {
  clientId: string;
  runtime: GoogleOAuthRuntime;
  fetchFn?: typeof fetch;
  now?: () => Date;
}): Promise<{
  clientId: string;
  tokens: GoogleDriveTokenSet;
  accountEmail: string | null;
  accountName: string | null;
}> {
  const fetchFn = params.fetchFn ?? fetch;
  const now = params.now ?? (() => new Date());
  const clientId = normalizeGoogleClientId(params.clientId);

  const { codeVerifier, codeChallenge, state } = await params.runtime.createPkceAndState();
  const authUrl = buildGoogleOAuthAuthorizeUrl({
    clientId,
    redirectUri: GOOGLE_DRIVE_REDIRECT_URI,
    codeChallenge,
    state,
  });

  const session = await params.runtime.openAuthSession(authUrl, GOOGLE_DRIVE_REDIRECT_URI);
  if (session.type !== 'success') {
    throw new Error('已取消 Google Drive 登录授权');
  }

  const { code } = parseGoogleOAuthRedirectUrl(session.url, state);

  const form = new URLSearchParams({
    client_id: clientId,
    code,
    code_verifier: codeVerifier,
    grant_type: 'authorization_code',
    redirect_uri: GOOGLE_DRIVE_REDIRECT_URI,
  });

  const tokenRes = await fetchWithTimeout(
    fetchFn,
    GOOGLE_OAUTH_TOKEN_ENDPOINT,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: form.toString(),
    },
    DEFAULT_TIMEOUT_MS
  );
  const tokenJson = await parseJsonSafe(tokenRes);

  if (!tokenRes.ok) {
    throw mapDriveApiError(tokenRes.status, tokenJson, '换取访问令牌');
  }

  const accessToken =
    typeof tokenJson.access_token === 'string' ? tokenJson.access_token : '';
  const refreshToken =
    typeof tokenJson.refresh_token === 'string' ? tokenJson.refresh_token : '';
  const expiresIn =
    typeof tokenJson.expires_in === 'number' && Number.isFinite(tokenJson.expires_in)
      ? tokenJson.expires_in
      : 3600;
  const scope =
    typeof tokenJson.scope === 'string' ? tokenJson.scope : GOOGLE_DRIVE_SCOPE;
  const tokenType =
    typeof tokenJson.token_type === 'string' ? tokenJson.token_type : 'Bearer';

  if (!accessToken) {
    throw new Error('Google 授权响应缺少 access_token，请重试');
  }

  const tokens: GoogleDriveTokenSet = {
    accessToken,
    refreshToken,
    expiresAt: now().getTime() + expiresIn * 1000,
    scope,
    tokenType,
  };

  // 利用 drive.file 已有权限查询账号展示信息，失败不阻断授权成功
  let accountEmail: string | null = null;
  let accountName: string | null = null;
  try {
    const aboutRes = await fetchWithTimeout(
      fetchFn,
      `${DRIVE_ABOUT_API}?fields=user(emailAddress,displayName)`,
      {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      },
      DEFAULT_TIMEOUT_MS
    );
    if (aboutRes.ok) {
      const aboutJson = await parseJsonSafe(aboutRes);
      const user =
        typeof aboutJson.user === 'object' && aboutJson.user !== null
          ? (aboutJson.user as Record<string, unknown>)
          : null;
      if (typeof user?.emailAddress === 'string' && user.emailAddress.trim()) {
        accountEmail = user.emailAddress.trim();
      }
      if (typeof user?.displayName === 'string' && user.displayName.trim()) {
        accountName = user.displayName.trim();
      }
    }
  } catch {
    // 忽略用户信息展示字段异常
  }

  return {
    clientId,
    tokens,
    accountEmail,
    accountName,
  };
}

/**
 * 获取有效的 Google Drive Access Token；临近过期时自动使用 refresh_token 续期并写回 SecureStore。
 */
export async function ensureValidGoogleAccessToken(params: {
  clientId: string;
  credentials: CloudCredentialStore;
  fetchFn?: typeof fetch;
  now?: () => Date;
}): Promise<string> {
  const fetchFn = params.fetchFn ?? fetch;
  const now = params.now ?? (() => new Date());
  const clientId = normalizeGoogleClientId(params.clientId);

  const tokens = await params.credentials.getGoogleDriveTokens();
  if (!tokens) {
    throw new Error('尚未登录授权 Google Drive');
  }

  if (tokens.expiresAt - TOKEN_REFRESH_SKEW_MS > now().getTime()) {
    return tokens.accessToken;
  }

  if (!tokens.refreshToken) {
    throw new Error('Google Drive 访问令牌已过期且无刷新令牌，请重新登录授权');
  }

  const form = new URLSearchParams({
    client_id: clientId,
    refresh_token: tokens.refreshToken,
    grant_type: 'refresh_token',
  });

  const res = await fetchWithTimeout(
    fetchFn,
    GOOGLE_OAUTH_TOKEN_ENDPOINT,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: form.toString(),
    },
    DEFAULT_TIMEOUT_MS
  );
  const body = await parseJsonSafe(res);

  if (!res.ok) {
    const errCode = typeof body.error === 'string' ? body.error : '';
    if (errCode === 'invalid_grant' || res.status === 400 || res.status === 401) {
      throw new Error('Google Drive 授权已失效，请重新登录授权');
    }
    throw mapDriveApiError(res.status, body, '刷新令牌');
  }

  const newAccessToken =
    typeof body.access_token === 'string' ? body.access_token : '';
  if (!newAccessToken) {
    throw new Error('Google Drive 刷新令牌响应异常，请重新登录授权');
  }

  const expiresIn =
    typeof body.expires_in === 'number' && Number.isFinite(body.expires_in)
      ? body.expires_in
      : 3600;
  const updatedTokens: GoogleDriveTokenSet = {
    accessToken: newAccessToken,
    refreshToken:
      typeof body.refresh_token === 'string' && body.refresh_token.length > 0
        ? body.refresh_token
        : tokens.refreshToken,
    expiresAt: now().getTime() + expiresIn * 1000,
    scope: typeof body.scope === 'string' ? body.scope : tokens.scope,
    tokenType: typeof body.token_type === 'string' ? body.token_type : tokens.tokenType,
  };

  await params.credentials.setGoogleDriveTokens(updatedTokens);
  return updatedTokens.accessToken;
}

/**
 * 查询或创建 Google Drive 根目录下的可见 `ZeroTally` 文件夹；缓存 ID 失效时自动重建自愈。
 */
export async function ensureGoogleDriveFolder(
  accessToken: string,
  cachedFolderId: string | null,
  fetchFn: typeof fetch = fetch
): Promise<string> {
  if (cachedFolderId && SAFE_DRIVE_ID_RE.test(cachedFolderId)) {
    const checkRes = await fetchWithTimeout(
      fetchFn,
      `${DRIVE_FILES_API}/${encodeURIComponent(cachedFolderId)}?fields=id,trashed,mimeType`,
      {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      },
      DEFAULT_TIMEOUT_MS
    );
    if (checkRes.ok) {
      const info = await parseJsonSafe(checkRes);
      if (
        info.id === cachedFolderId &&
        info.trashed !== true &&
        info.mimeType === 'application/vnd.google-apps.folder'
      ) {
        return cachedFolderId;
      }
    } else if (checkRes.status === 401) {
      throw mapDriveApiError(checkRes.status, await parseJsonSafe(checkRes), '检查目录');
    }
  }

  const query = `mimeType = 'application/vnd.google-apps.folder' and name = '${GOOGLE_DRIVE_FOLDER_NAME}' and 'root' in parents and trashed = false`;
  const listUrl = `${DRIVE_FILES_API}?q=${encodeURIComponent(query)}&fields=files(id,name)&spaces=drive&pageSize=1`;
  const listRes = await fetchWithTimeout(
    fetchFn,
    listUrl,
    {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    },
    DEFAULT_TIMEOUT_MS
  );
  const listJson = await parseJsonSafe(listRes);
  if (!listRes.ok) {
    throw mapDriveApiError(listRes.status, listJson, '查找备份目录');
  }

  const files = Array.isArray(listJson.files) ? listJson.files : [];
  const existing = files[0] as Record<string, unknown> | undefined;
  if (typeof existing?.id === 'string' && SAFE_DRIVE_ID_RE.test(existing.id)) {
    return existing.id;
  }

  const createRes = await fetchWithTimeout(
    fetchFn,
    `${DRIVE_FILES_API}?fields=id`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json; charset=utf-8',
      },
      body: JSON.stringify({
        name: GOOGLE_DRIVE_FOLDER_NAME,
        mimeType: 'application/vnd.google-apps.folder',
        parents: ['root'],
      }),
    },
    DEFAULT_TIMEOUT_MS
  );
  const createJson = await parseJsonSafe(createRes);
  if (!createRes.ok) {
    throw mapDriveApiError(createRes.status, createJson, '创建备份目录');
  }
  if (typeof createJson.id !== 'string' || !SAFE_DRIVE_ID_RE.test(createJson.id)) {
    throw new Error('Google Drive 创建备份目录响应缺少有效目录 ID');
  }
  return createJson.id;
}

/**
 * 通过 multipart/related 将 JSON 备份上传到 `ZeroTally/` 文件夹。
 */
export async function uploadGoogleDriveSnapshot(params: {
  accessToken: string;
  folderId: string;
  filename: string;
  content: string;
  fetchFn?: typeof fetch;
}): Promise<CloudSnapshotItem> {
  const fetchFn = params.fetchFn ?? fetch;
  if (!isCloudSnapshotFilename(params.filename)) {
    throw new Error('云快照文件名不合法');
  }
  const safeFolderId = assertValidDriveId(params.folderId, '目录 ID');

  const boundary = `zerotally_boundary_${Date.now().toString(36)}`;
  const metadataJson = JSON.stringify({
    name: params.filename,
    mimeType: 'application/json',
    parents: [safeFolderId],
  });
  const body =
    `--${boundary}\r\n` +
    `Content-Type: application/json; charset=UTF-8\r\n\r\n` +
    `${metadataJson}\r\n` +
    `--${boundary}\r\n` +
    `Content-Type: application/json; charset=UTF-8\r\n\r\n` +
    `${params.content}\r\n` +
    `--${boundary}--`;

  const res = await fetchWithTimeout(
    fetchFn,
    `${DRIVE_UPLOAD_API}?uploadType=multipart&fields=id,name,size,modifiedTime`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${params.accessToken}`,
        'Content-Type': `multipart/related; boundary=${boundary}`,
      },
      body,
    },
    TRANSFER_TIMEOUT_MS
  );
  const json = await parseJsonSafe(res);
  if (!res.ok) {
    throw mapDriveApiError(res.status, json, '上传备份');
  }

  const fileId = typeof json.id === 'string' ? json.id : '';
  if (!fileId) {
    throw new Error('Google Drive 上传响应缺少文件 ID');
  }

  const parsedSize =
    typeof json.size === 'string' || typeof json.size === 'number'
      ? Number(json.size)
      : utf8ToBytes(params.content).length;
  const modifiedAt =
    typeof json.modifiedTime === 'string'
      ? json.modifiedTime
      : parseTimestampFromSnapshotFilename(params.filename);

  return {
    provider: 'google-drive',
    id: fileId,
    filename: typeof json.name === 'string' ? json.name : params.filename,
    sizeBytes: Number.isFinite(parsedSize) && parsedSize >= 0 ? Math.floor(parsedSize) : null,
    modifiedAt,
  };
}

/**
 * 列出 Google Drive `ZeroTally/` 文件夹中全部历史快照（按时间倒序）。
 */
export async function listGoogleDriveSnapshots(
  accessToken: string,
  folderId: string,
  fetchFn: typeof fetch = fetch
): Promise<CloudSnapshotItem[]> {
  const safeFolderId = assertValidDriveId(folderId, '目录 ID');
  const query = `'${safeFolderId}' in parents and trashed = false`;
  const url = `${DRIVE_FILES_API}?q=${encodeURIComponent(query)}&fields=files(id,name,size,modifiedTime)&orderBy=modifiedTime%20desc&pageSize=100`;

  const res = await fetchWithTimeout(
    fetchFn,
    url,
    {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    },
    DEFAULT_TIMEOUT_MS
  );
  const json = await parseJsonSafe(res);
  if (!res.ok) {
    throw mapDriveApiError(res.status, json, '读取快照列表');
  }

  const rawFiles = Array.isArray(json.files) ? json.files : [];
  const items: CloudSnapshotItem[] = [];
  for (const item of rawFiles) {
    if (typeof item !== 'object' || item === null) {
      continue;
    }
    const row = item as Record<string, unknown>;
    const id = typeof row.id === 'string' ? row.id : '';
    const name = typeof row.name === 'string' ? row.name : '';
    if (!id || !isCloudSnapshotFilename(name)) {
      continue;
    }
    const rawSize =
      typeof row.size === 'string' || typeof row.size === 'number' ? Number(row.size) : NaN;
    const sizeBytes = Number.isFinite(rawSize) && rawSize >= 0 ? Math.floor(rawSize) : null;
    const modifiedAt =
      typeof row.modifiedTime === 'string'
        ? row.modifiedTime
        : parseTimestampFromSnapshotFilename(name);

    items.push({
      provider: 'google-drive',
      id,
      filename: name,
      sizeBytes,
      modifiedAt,
    });
  }

  return sortCloudSnapshotsDesc(items);
}

/**
 * 下载 Google Drive 指定历史快照的原始 JSON 文本。
 */
export async function downloadGoogleDriveSnapshot(
  accessToken: string,
  fileId: string,
  fetchFn: typeof fetch = fetch
): Promise<string> {
  const safeFileId = assertValidDriveId(fileId, '文件 ID');
  const res = await fetchWithTimeout(
    fetchFn,
    `${DRIVE_FILES_API}/${encodeURIComponent(safeFileId)}?alt=media`,
    {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    },
    TRANSFER_TIMEOUT_MS
  );

  if (!res.ok) {
    throw mapDriveApiError(res.status, await parseJsonSafe(res), '下载备份');
  }

  const contentLengthHeader = res.headers.get('content-length');
  if (contentLengthHeader) {
    const declaredBytes = Number(contentLengthHeader);
    if (Number.isFinite(declaredBytes) && declaredBytes > MAX_CLOUD_BACKUP_BYTES) {
      throw new Error('云端备份文件体积超出安全上限（50 MB），已中止下载');
    }
  }

  const text = await res.text();
  if (utf8ToBytes(text).length > MAX_CLOUD_BACKUP_BYTES) {
    throw new Error('云端备份文件体积超出安全上限（50 MB），已中止解析');
  }
  return text;
}

/**
 * 删除 Google Drive 指定历史快照（404 视为幂等成功）。
 */
export async function deleteGoogleDriveSnapshot(
  accessToken: string,
  fileId: string,
  fetchFn: typeof fetch = fetch
): Promise<void> {
  const safeFileId = assertValidDriveId(fileId, '文件 ID');
  const res = await fetchWithTimeout(
    fetchFn,
    `${DRIVE_FILES_API}/${encodeURIComponent(safeFileId)}`,
    {
      method: 'DELETE',
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    },
    DEFAULT_TIMEOUT_MS
  );

  if (res.status === 200 || res.status === 204 || res.status === 404) {
    return;
  }

  throw mapDriveApiError(res.status, await parseJsonSafe(res), '删除快照');
}

/**
 * 尽力吊销 Google OAuth 令牌（网络异常时不阻塞本地登出清除）。
 */
export async function revokeGoogleDriveToken(
  token: string,
  fetchFn: typeof fetch = fetch
): Promise<void> {
  if (!token) {
    return;
  }
  try {
    await fetchWithTimeout(
      fetchFn,
      GOOGLE_OAUTH_REVOKE_ENDPOINT,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({ token }).toString(),
      },
      10_000
    );
  } catch {
    // 尽力吊销，忽略网络错误
  }
}
